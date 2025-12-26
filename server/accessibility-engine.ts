import type { AccessibilityIssue, RepairResult } from "@shared/schema";

/**
 * Local accessibility repair engine (no external API).
 * Target: WCAG 2.1 / 台灣無障礙規範 AA 常見項目 + 可擴充規則。
 *
 * Notes:
 * - We intentionally keep the implementation deterministic and offline-friendly.
 * - For complex semantics (e.g., best alt text), we emit TODO placeholders and mark needsManualReview.
 */

type Level = "A" | "AA" | "AAA";

export type BuiltInRuleMeta = {
  id: string;
  taiwanCode?: string;
  wcagCode: string;
  level: Level;
  title: string;
  canAutoFix: boolean;
};

export const BUILT_IN_RULES: BuiltInRuleMeta[] = [
  { id: "frame-title", taiwanCode: "HM1410201C", wcagCode: "4.1.2", level: "A", title: "<frame>/<iframe> 需有非空 title", canAutoFix: true },
  { id: "img-alt", taiwanCode: "HM1110101C", wcagCode: "1.1.1", level: "A", title: "<img> 需有 alt（裝飾圖可 alt=\"\"）", canAutoFix: true },
  // We auto-fix empty links by inserting placeholder text + title and marking needsManualReview.
  // This reduces "empty link" failures in automated checkers (e.g., Freego) while keeping semantics reviewable.
  { id: "link-text", taiwanCode: "HM1240401C", wcagCode: "2.4.4", level: "A", title: "<a> 鏈結文字不得為空/空白", canAutoFix: true },
  { id: "link-title", taiwanCode: "HM1240401C", wcagCode: "2.4.4", level: "A", title: "必要時補 <a> title 以補充鏈結目的", canAutoFix: true },
  { id: "link-new-window", taiwanCode: "HM1240401C", wcagCode: "2.4.4", level: "A", title: "target=_blank 需提示另開新視窗（以 title/文字補充）", canAutoFix: true },
  { id: "table-row-header", taiwanCode: "HM1310101C", wcagCode: "1.3.1", level: "A", title: "表格列標題：第一欄 td → th scope=\"row\"", canAutoFix: true },
  { id: "css-relative-units", taiwanCode: "CS2140401C", wcagCode: "1.4.4", level: "AA", title: "字型/長度單位使用相對單位（em/rem/%；避免 px/pt）", canAutoFix: true },
  { id: "css-style-tag", taiwanCode: "CS2140401C", wcagCode: "1.4.4", level: "AA", title: "<style> 內 font-size 單位轉換為相對單位", canAutoFix: true },
  { id: "th-scope", taiwanCode: "HM1310101C", wcagCode: "1.3.1", level: "A", title: "<th> 建議提供 scope（col/row）", canAutoFix: true },
  { id: "form-label", taiwanCode: "HM1330201C", wcagCode: "1.3.1", level: "A", title: "表單欄位需可被標籤辨識（label/aria-label）", canAutoFix: false },
  // Report-only rules aligned with Freego 2.0 / WCAG 2.1 AA common checks
  { id: "skip-link", wcagCode: "2.4.1", level: "A", title: "建議提供跳至主要內容（Skip Link）", canAutoFix: false },
  { id: "color-contrast", wcagCode: "1.4.3", level: "AA", title: "文字/背景色彩對比（需人工確認）", canAutoFix: false },
  { id: "fake-button", wcagCode: "2.1.1", level: "A", title: "非語意互動元件需可鍵盤操作（role/tabindex/keydown）", canAutoFix: false },
];

function ruleEnabled(config: any, ruleId: string): boolean {
  const rules = config?.rules;
  if (!rules) return true;
  const disabled: string[] = Array.isArray(rules.disabled) ? rules.disabled : [];
  if (disabled.includes(ruleId)) return false;
  const enabled: string[] | undefined = Array.isArray(rules.enabled) ? rules.enabled : undefined;
  if (enabled) return enabled.includes(ruleId);
  return true;
}

function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emFromPx(px: number, basePx = 16): string {
  const v = px / basePx;
  const s = (Math.round(v * 10000) / 10000).toString();
  return `${s}em`;
}
function emFromPt(pt: number, basePt = 12): string {
  // Project convention: 12pt == 1em
  const v = pt / basePt;
  const s = (Math.round(v * 10000) / 10000).toString();
  return `${s}em`;
}

function normalizeInlineStyle(style: string, basePx = 16, removeWidth = true): { style: string; changed: boolean } {
  if (!style) return { style, changed: false };

  // Parse into declarations (very small inline-style parser)
  const decls: Array<{ prop: string; value: string }> = [];
  for (const part of style.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf(":");
    if (idx === -1) continue;
    const prop = p.slice(0, idx).trim().toLowerCase();
    const value = p.slice(idx + 1).trim();
    decls.push({ prop, value });
  }

  let changed = false;

  // Convert units in values (px -> em, pt -> em); optionally drop width for better reflow.
  const converted = decls
    .map(({ prop, value }) => {
      let v = value;

      // Drop fixed width to improve reflow (useful for AA in many real pages; safe in fragments)
      if (removeWidth && prop === "width") {
        changed = true;
        return null;
      }

      // font-size: px/pt/rem -> em
      if (prop === "font-size") {
        v = v.replace(/([\d.]+)\s*px\b/gi, (_, n) => {
          changed = true;
          return emFromPx(parseFloat(n), basePx);
        });
        v = v.replace(/([\d.]+)\s*pt\b/gi, (_, n) => {
          changed = true;
          return emFromPt(parseFloat(n));
        });
        // Normalize rem -> em for consistency within fragments
        v = v.replace(/([\d.]+)\s*rem\b/gi, (_, n) => {
          changed = true;
          return `${(Math.round(parseFloat(n) * 10000) / 10000).toString()}em`;
        });
      }

      // Generic length conversions (border/padding/margin/height/etc.)
      v = v.replace(/([\d.]+)\s*px\b/gi, (_, n) => {
        changed = true;
        return emFromPx(parseFloat(n), basePx);
      });
      v = v.replace(/([\d.]+)\s*pt\b/gi, (_, n) => {
        changed = true;
        return emFromPt(parseFloat(n));
      });

      return { prop, value: v };
    })
    .filter(Boolean) as Array<{ prop: string; value: string }>;

  // Compress padding-top/right/bottom/left if equal, while preserving the original declaration order.
  // (Sorting declarations makes diff noisy and looks like "items got interleaved".)
  const pad = new Map<string, string>();
  for (const d of converted) {
    if (d.prop.startsWith("padding-")) pad.set(d.prop, d.value);
  }
  const padKeys = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
  const presentVals = padKeys.map(k => pad.get(k)).filter(Boolean) as string[];
  if (presentVals.length >= 3) {
    const allEqual = presentVals.every(v => v === presentVals[0]);
    if (allEqual) {
      const compressed: Array<{ prop: string; value: string }> = [];
      let inserted = false;
      for (const d of converted) {
        if (d.prop.startsWith("padding-")) {
          if (!inserted) {
            compressed.push({ prop: "padding", value: presentVals[0] });
            inserted = true;
          }
          changed = true;
          continue; // drop padding-*
        }
        compressed.push(d);
      }
      return { style: compressed.map(d => `${d.prop}:${d.value}`).join("; "), changed };
    }
  }

  return { style: converted.map(d => `${d.prop}:${d.value}`).join("; "), changed };
}

function addOrUpdateAttr(tag: string, attrName: string, attrValue: string): string {
  const re = new RegExp(`\\s${attrName}\\s*=\\s*("([^"]*)"|'([^']*)'|[^\\s>]+)`, "i");
  if (re.test(tag)) {
    return tag.replace(re, (m) => {
      const v = m.split("=").slice(1).join("=").trim();
      const raw = v.replace(/^["']|["']$/g, "");
      if (raw.trim() === "") {
        return ` ${attrName}="${attrValue}"`;
      }
      return m;
    });
  }
  // insert before closing
  return tag.replace(/>$/, ` ${attrName}="${attrValue}">`);
}

function getAttr(tag: string, attrName: string): string | null {
  const re = new RegExp(`\\s${attrName}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? "").toString();
}

function createIssue(partial: Omit<AccessibilityIssue, "line" | "column" | "startOffset" | "endOffset">): AccessibilityIssue {
  return {
    ...partial,
    line: 0,
    column: 0,
    startOffset: 0,
    endOffset: 0,
  };
}

/**
 * Template parsing:
 * We only use it to learn preferred wording for placeholders (very lightweight).
 */
function parseTemplate(template?: string): { linkTitle?: string; imgAlt?: string; iframeTitle?: string } {
  if (!template) return {};
  const out: any = {};
  const a = template.match(/<a\b[^>]*\btitle\s*=\s*["']([^"']+)["']/i);
  if (a?.[1]) out.linkTitle = a[1].trim();
  const img = template.match(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["']/i);
  if (img?.[1]) out.imgAlt = img[1].trim();
  const ifr = template.match(/<iframe\b[^>]*\btitle\s*=\s*["']([^"']+)["']/i);
  if (ifr?.[1]) out.iframeTitle = ifr[1].trim();
  return out;
}

export function repairHtml(html: string, config?: any): RepairResult {
  const prefs = {
    linkTitle: config?.placeholders?.linkTitle as string | undefined,
    linkText: config?.placeholders?.linkText as string | undefined,
    linkEmptyTitle: config?.placeholders?.linkEmptyTitle as string | undefined,
    imgAlt: config?.placeholders?.imgAlt as string | undefined,
    iframeTitle: config?.placeholders?.iframeTitle as string | undefined,
  };
  const issues: AccessibilityIssue[] = [];
  let repaired = html;

  // 1) <iframe>/<frame> must have non-empty title (HM1410201C / WCAG 4.1.2)
  if (ruleEnabled(config, "frame-title")) repaired = repaired.replace(/<(iframe|frame)\b[^>]*>/gi, (tag) => {
    const title = getAttr(tag, "title");
    if (!title || title.trim() === "") {
      const placeholder = prefs.iframeTitle || "（請補上頁框標題）";
      issues.push(
        createIssue({
          ruleId: "frame-title",
          wcagCode: "4.1.2",
          taiwanCode: "HM1410201C",
          level: "A",
          message: "頁框/內嵌頁框缺少 title 屬性或為空值",
          originalSnippet: tag,
          fixedSnippet: addOrUpdateAttr(tag, "title", placeholder),
          autoFixed: true,
          needsManualReview: placeholder.includes("請補上"),
          suggestion: "請提供能描述此頁框用途的 title（例如：廣告、導覽、影片播放器等）",
        })
      );
      return addOrUpdateAttr(tag, "title", placeholder);
    }
    return tag;
  });

  // 2) <img> must have alt (WCAG 1.1.1)
  // - Missing alt => auto-fix with placeholder (needs manual review)
  // - alt="" is allowed for decorative images (do NOT overwrite globally)
  //   (but inside <a> it usually needs meaningful alt; handled in link pass)
  if (ruleEnabled(config, "img-alt")) repaired = repaired.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = getAttr(tag, "alt");
    if (alt == null) {
      const placeholder = prefs.imgAlt || "（請補上圖片替代文字）";
      const fixed = addOrUpdateAttr(tag, "alt", placeholder);
      issues.push(
        createIssue({
          ruleId: "img-alt",
          wcagCode: "1.1.1",
          taiwanCode: "HM1110101C",
          level: "A",
          message: "圖片缺少 alt 屬性",
          originalSnippet: tag,
          fixedSnippet: fixed,
          autoFixed: true,
          needsManualReview: true,
          suggestion: "若為裝飾圖片可使用 alt=\"\"；若為資訊性/功能性圖片請描述其用途/內容",
        })
      );
      return fixed;
    }
    return tag;
  });

  // 3) Link purpose: <a> must have non-empty text; and add title if missing (HM1240401C / WCAG 2.4.4)
  repaired = repaired.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (full) => {
    const open = full.match(/<a\b[^>]*>/i)?.[0] || "<a>";
    let inner = full.replace(/<a\b[^>]*>/i, "").replace(/<\/a>/i, "");
    const text = stripTags(inner);

    const hasHref = /<a\b[^>]*\bhref\s*=/i.test(open);
    if (!hasHref) return full; // non-link anchor, ignore

    // If the link contains an <img>, ensure it has meaningful alt.
    // Freego/WCAG: functional images used as links must not have empty alt.
    if (ruleEnabled(config, "img-alt")) {
      inner = inner.replace(/<img\b[^>]*>/gi, (imgTag) => {
        const alt = getAttr(imgTag, "alt");
        if (alt == null || alt.trim() === "") {
          const placeholder = prefs.imgAlt || "（請補上圖片替代文字）";
          const fixed = addOrUpdateAttr(imgTag, "alt", placeholder);
          issues.push(
            createIssue({
              ruleId: "img-alt",
              wcagCode: "1.1.1",
              taiwanCode: "HM1110101C",
              level: "A",
              message: "鏈結中的圖片需提供可描述目的的 alt（不可為空）",
              originalSnippet: imgTag,
              fixedSnippet: fixed,
              autoFixed: true,
              needsManualReview: true,
              suggestion: "若此圖片為鏈結的唯一可讀內容，alt 應描述鏈結目的；避免使用空值 alt=\"\"。",
            })
          );
          return fixed;
        }
        return imgTag;
      });
    }

    // Compute a conservative accessible name for links:
    // - Prefer visible text.
    // - If no visible text but contains <img alt="...">, treat alt as link name.
    let linkName = text;
    if (!linkName) {
      const imgInLink = inner.match(/<img\b[^>]*>/i)?.[0];
      if (imgInLink) {
        const alt = getAttr(imgInLink, "alt")?.trim() || "";
        if (alt) linkName = alt;
      }
    }

    if (!linkName) {
      // Auto-fix empty links with placeholders to reduce automated checker failures (e.g., Freego).
      // Mark as needsManualReview so users still confirm the correct purpose text.
      const textPlaceholder = prefs.linkText || "（請補上鏈結文字）";
      const titlePlaceholder = prefs.linkEmptyTitle || "（請補上鏈結目的）";

      const fixedOpen = addOrUpdateAttr(open, "title", titlePlaceholder);
      const fixedFull = fixedOpen + textPlaceholder + "</a>";

      if (ruleEnabled(config, "link-text")) {
        issues.push(
          createIssue({
            ruleId: "link-text",
            wcagCode: "2.4.4",
            taiwanCode: "HM1240401C",
            level: "A",
            message: "鏈結文字為空（已補上 placeholder，請人工確認鏈結目的）",
            originalSnippet: full,
            fixedSnippet: fixedFull,
            autoFixed: true,
            needsManualReview: true,
            suggestion: "請將 placeholder 改為能描述鏈結目的的文字；若為圖示鏈結，請用 <img alt=...> 描述其用途",
          })
        );
      }

      return fixedFull;
    }

    // target=_blank should communicate new window (台灣檢測通常會要求提示)
    const target = getAttr(open, "target");
    const isBlank = target?.toLowerCase() === "_blank";

    const title = getAttr(open, "title");

    // If title is missing but link-title rule is disabled, we can still add a minimal hint for target=_blank.
    if (
      isBlank &&
      ruleEnabled(config, "link-new-window") &&
      (!title || title.trim() === "") &&
      !ruleEnabled(config, "link-title")
    ) {
      const hint = config?.placeholders?.newWindowHint || "在新視窗打開鏈結";
      const merged = `${hint}：${linkName}`;
      const fixedOpen = addOrUpdateAttr(open, "title", merged);
      const fixedFull = fixedOpen + inner + "</a>";
      issues.push(
        createIssue({
          ruleId: "link-new-window",
          wcagCode: "2.4.4",
          taiwanCode: "HM1240401C",
          level: "A",
          message: "鏈結使用 target=_blank，已補充 title 提示另開新視窗",
          originalSnippet: full,
          fixedSnippet: fixedFull,
          autoFixed: true,
          needsManualReview: false,
        })
      );
      return fixedFull;
    }
    // Option: strict title only when contextual siblings exist. In fragment mode we default to adding when missing.
    if (ruleEnabled(config, "link-title") && (!title || title.trim() === "")) {
      // We add a conservative title to improve readability. If you prefer strict behavior (only when surrounding content exists),
      // you can later refine with a DOM parser. For now: add when missing.
      const titleText = prefs.linkTitle
        ? prefs.linkTitle.replace(/\{text\}/g, linkName)
        : linkName;

      const fixedOpen = addOrUpdateAttr(open, "title", titleText);
      const fixedFull = fixedOpen + inner + "</a>";

      issues.push(
        createIssue({
          ruleId: "link-title",
          wcagCode: "2.4.4",
          taiwanCode: "HM1240401C",
          level: "A",
          message: "鏈結缺少 title（已補上）",
          originalSnippet: full,
          fixedSnippet: fixedFull,
          autoFixed: true,
          needsManualReview: false,
          suggestion: "title 應能補充鏈結目的；若鏈結文字已足夠，可視情況保留或移除 title。",
        })
      );
      // If it also opens in new window, prepend hint.
      if (isBlank && ruleEnabled(config, "link-new-window")) {
        const hint = config?.placeholders?.newWindowHint || "在新視窗打開鏈結";
        const merged = `${hint}：${titleText}`;
        const mergedOpen = addOrUpdateAttr(open, "title", merged);
        return mergedOpen + inner + "</a>";
      }
      return fixedFull;
    }

    // If title is missing but we still want the new-window hint, add a minimal title.
    if (isBlank && ruleEnabled(config, "link-new-window") && (!title || title.trim() === "")) {
      const hint = config?.placeholders?.newWindowHint || "在新視窗打開鏈結";
      const merged = `${hint}：${linkName}`;
      const fixedOpen = addOrUpdateAttr(open, "title", merged);
      const fixedFull = fixedOpen + inner + "</a>";
      issues.push(
        createIssue({
          ruleId: "link-new-window",
          wcagCode: "2.4.4",
          taiwanCode: "HM1240401C",
          level: "A",
          message: "鏈結使用 target=_blank，已補上 title 提示另開新視窗",
          originalSnippet: full,
          fixedSnippet: fixedFull,
          autoFixed: true,
          needsManualReview: false,
        })
      );
      return fixedFull;
    }

    // If title exists but target=_blank and doesn't contain hint, append hint.
    if (isBlank && ruleEnabled(config, "link-new-window")) {
      const hint = config?.placeholders?.newWindowHint || "在新視窗打開鏈結";
      const currentTitle = title?.trim() || "";
      if (currentTitle && !/新視窗|新窗口|另開|另開視窗|new window/i.test(currentTitle)) {
        const merged = `${hint}：${currentTitle}`;
        const fixedOpen = addOrUpdateAttr(open, "title", merged);
        const fixedFull = fixedOpen + inner + "</a>";
        issues.push(
          createIssue({
            ruleId: "link-new-window",
            wcagCode: "2.4.4",
            taiwanCode: "HM1240401C",
            level: "A",
            message: "鏈結使用 target=_blank，已補充 title 提示另開新視窗",
            originalSnippet: full,
            fixedSnippet: fixedFull,
            autoFixed: true,
            needsManualReview: false,
          })
        );
        return fixedFull;
      }
    }

    return full;
  });

  // 4) Table semantics: convert first <td> with real text to <th scope="row"> (helps 1.3.1 / AA context)
  if (ruleEnabled(config, "table-row-header")) repaired = repaired.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (tr) => {
    const m = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/i);
    if (!m) return tr;
    const firstTd = m[0];
    const inner = firstTd.replace(/<td\b[^>]*>/i, "").replace(/<\/td>/i, "");
    const text = stripTags(inner);
    if (!text) return tr;

    // build th
    const open = firstTd.match(/<td\b[^>]*>/i)?.[0] || "<td>";
    let thOpen = open.replace(/^<td\b/i, "<th");
    thOpen = addOrUpdateAttr(thOpen, "scope", "row");

    // normalize style on the TH (and remove width)
    const style = getAttr(thOpen, "style");
    if (style) {
      const { style: newStyle, changed } = normalizeInlineStyle(style, config?.basePx ?? 16, config?.removeWidth ?? true);
      if (changed) thOpen = addOrUpdateAttr(thOpen, "style", newStyle);
    }

    const th = thOpen + inner + "</th>";
    const fixed = tr.replace(firstTd, th);

    issues.push(
      createIssue({
        ruleId: "table-row-header",
        wcagCode: "1.3.1",
        taiwanCode: "HM1310101C",
        level: "A",
        message: "表格列標題建議使用 th（已將第一欄 td 轉為 th scope=\"row\"）",
        originalSnippet: firstTd,
        fixedSnippet: th,
        autoFixed: true,
        needsManualReview: false,
        suggestion: "若此欄位確實為列/行標題，使用 th + scope 可提升輔助科技朗讀正確性。",
      })
    );

    return fixed;
  });

  // 4.5) <th> should have scope (台灣/通用檢測常見建議：提升輔助科技朗讀)
  if (ruleEnabled(config, "th-scope")) repaired = repaired.replace(/<th\b[^>]*>/gi, (tag) => {
    const scope = getAttr(tag, "scope");
    if (scope && scope.trim() !== "") return tag;
    // Heuristic: default to column header. Users can override manually.
    const fixed = addOrUpdateAttr(tag, "scope", "col");
    issues.push(
      createIssue({
        ruleId: "th-scope",
        wcagCode: "1.3.1",
        taiwanCode: "HM1310101C",
        level: "A",
        message: "<th> 缺少 scope（已補上 scope=\"col\"）",
        originalSnippet: tag,
        fixedSnippet: fixed,
        autoFixed: true,
        needsManualReview: false,
        suggestion: "若此 th 為列標題請改為 scope=\"row\"；若為欄標題則 scope=\"col\"",
      })
    );
    return fixed;
  });

  // 5) Normalize inline styles (CS2140401C + general length conversions)
  if (ruleEnabled(config, "css-relative-units")) repaired = repaired.replace(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _all, g2, g3) => {
    const raw = (g2 ?? g3 ?? "").toString();
    const { style: newStyle, changed } = normalizeInlineStyle(raw, config?.basePx ?? 16, config?.removeWidth ?? true);
    if (!changed) return m;
    issues.push(
      createIssue({
        ruleId: "css-relative-units",
        wcagCode: "1.4.4",
        taiwanCode: "CS2140401C",
        level: "AA",
        message: "已將 inline style 中的 px/pt 單位轉為相對單位（em），並移除固定 width",
        originalSnippet: `style="${raw}"`,
        fixedSnippet: `style="${newStyle}"`,
        autoFixed: true,
        needsManualReview: false,
        suggestion: "建議使用 em/rem/% 等相對單位以支援文字縮放與可讀性。",
      })
    );
    const quote = m.startsWith("style='") ? "'" : '"';
    return `style=${quote}${newStyle}${quote}`;
  });

  // 6) Normalize <style> blocks: only convert font-size px/pt to em (safe subset)
  if (ruleEnabled(config, "css-style-tag")) repaired = repaired.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (full, css) => {
    const converted = css
      .replace(/font-size\s*:\s*([\d.]+)\s*px\s*;/gi, (_m, n) => `font-size: ${emFromPx(parseFloat(n), config?.basePx ?? 16)};`)
      .replace(/font-size\s*:\s*([\d.]+)\s*pt\s*;/gi, (_m, n) => `font-size: ${emFromPt(parseFloat(n))};`)
      .replace(/font-size\s*:\s*([\d.]+)\s*rem\s*;/gi, (_m, n) => `font-size: ${(Math.round(parseFloat(n) * 10000) / 10000).toString()}em;`);
    if (converted !== css) {
      issues.push(
        createIssue({
          ruleId: "css-style-tag",
          wcagCode: "1.4.4",
          taiwanCode: "CS2140401C",
          level: "AA",
          message: "已將 <style> 內 font-size 的 px/pt/rem 單位轉為 em",
          originalSnippet: "<style>…</style>",
          fixedSnippet: "<style>…</style>",
          autoFixed: true,
          needsManualReview: false,
        })
      );
    }
    return `<style>${converted}</style>`;
  });

  // 7) Form fields should have a programmatic label (WCAG 1.3.1 / 台灣常見檢測)
  if (ruleEnabled(config, "form-label")) {
    const labelForSet = new Set<string>();
    const labelRe = /<label\b[^>]*\bfor\s*=\s*("([^"\n]+)"|'([^'\n]+)'|([^\s>]+))/gi;
    let lm: RegExpExecArray | null;
    while ((lm = labelRe.exec(repaired)) !== null) {
      const v = (lm[2] ?? lm[3] ?? lm[4] ?? "").toString().trim();
      if (v) labelForSet.add(v);
    }

    repaired = repaired.replace(/<(input|select|textarea)\b[^>]*>/gi, (tag) => {
      const type = (getAttr(tag, "type") || "").toLowerCase();
      if (type === "hidden") return tag;

      const ariaLabel = getAttr(tag, "aria-label");
      const ariaLabelledby = getAttr(tag, "aria-labelledby");
      const id = getAttr(tag, "id")?.trim() || "";

      const hasLabel = !!(ariaLabel && ariaLabel.trim()) || !!(ariaLabelledby && ariaLabelledby.trim()) || (id && labelForSet.has(id));
      if (hasLabel) return tag;

      issues.push(
        createIssue({
          ruleId: "form-label",
          wcagCode: "1.3.1",
          taiwanCode: "HM1330201C",
          level: "A",
          message: "表單欄位缺少可被輔助科技辨識的標籤（label/aria-label）",
          originalSnippet: tag,
          autoFixed: false,
          needsManualReview: true,
          suggestion: id
            ? `請確認是否有 <label for=\"${id}\">...；或補 aria-label/aria-labelledby（注意：placeholder 不是 label）`
            : "建議補 id 並搭配 <label for=...>，或使用 aria-label/aria-labelledby（注意：placeholder 不是 label）",
        })
      );
      return tag;
    });
  }

  // 8) Skip link detection (WCAG 2.4.1) - report only
  if (ruleEnabled(config, "skip-link")) {
    const hasNavOrHeader = /<(nav|header)\b/i.test(repaired);
    const hasMain = /<main\b/i.test(repaired);
    const hasSkip = /<a\b[^>]*\bhref\s*=\s*("#main"|'#main'|"#content"|'#content'|"#main-content"|'#main-content'|[^\s>]+)\b[^>]*>\s*(跳到主要內容|跳至主要內容|Skip to main|skip to main|skip)\s*<\/a>/i.test(repaired)
      || /<a\b[^>]*\bhref\s*=\s*("#main"|'#main'|"#content"|'#content'|"#main-content"|'#main-content')/i.test(repaired);

    if ((hasNavOrHeader || hasMain) && !hasSkip) {
      issues.push(
        createIssue({
          ruleId: "skip-link",
          wcagCode: "2.4.1",
          taiwanCode: "HM1240101C",
          level: "A",
          message: "建議提供跳至主要內容（Skip Link），以利鍵盤/輔助科技快速略過導覽",
          originalSnippet: "(document)",
          autoFixed: false,
          needsManualReview: true,
          suggestion: "建議在頁面最前方加入 <a href=\"#main\">跳到主要內容</a> 並確保 main 區塊具對應 id。",
        })
      );
    }
  }

  // 9) Color contrast hint (WCAG 1.4.3 AA) - report only
  if (ruleEnabled(config, "color-contrast")) {
    // Heuristic: if inline style sets color but not background-color, ask for manual contrast check.
    const colorStyleRe = /style\s*=\s*("[^"]*\bcolor\s*:\s*[^;\"]+[^"]*"|'[^']*\bcolor\s*:\s*[^;']+[^']*')/gi;
    let m: RegExpExecArray | null;
    let warned = 0;
    while ((m = colorStyleRe.exec(repaired)) !== null) {
      const styleAttr = m[0];
      if (/background-color\s*:/i.test(styleAttr)) continue;
      // Avoid spamming: report at most 5 warnings
      warned++;
      if (warned > 5) break;
      issues.push(
        createIssue({
          ruleId: "color-contrast",
          wcagCode: "1.4.3",
          taiwanCode: "CS2140301C",
          level: "AA",
          message: "偵測到文字顏色設定，需人工確認與背景之對比（Freego AA 常見檢查）",
          originalSnippet: styleAttr,
          autoFixed: false,
          needsManualReview: true,
          suggestion: "請用 Freego/對比檢測工具確認一般文字對比 >= 4.5:1（大字 >= 3:1），必要時調整 color/background-color。",
        })
      );
    }
  }

  // 10) Fake button detection (WCAG 2.1.1 A) - report only
  if (ruleEnabled(config, "fake-button")) {
    const fakeBtnRe = /<(div|span)\b[^>]*\bonclick\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi;
    let fm: RegExpExecArray | null;
    let count = 0;
    while ((fm = fakeBtnRe.exec(repaired)) !== null) {
      const tag = fm[0];
      if (/\brole\s*=\s*("button"|'button')/i.test(tag) && /\btabindex\s*=\s*("0"|'0'|0)\b/i.test(tag)) continue;
      count++;
      if (count > 10) break;
      issues.push(
        createIssue({
          ruleId: "fake-button",
          wcagCode: "2.1.1",
          taiwanCode: "HM2110101C",
          level: "A",
          message: "偵測到非語意互動元件（div/span + onclick），可能無法鍵盤操作",
          originalSnippet: tag,
          autoFixed: false,
          needsManualReview: true,
          suggestion: "建議改用 <button>；或補 role=\"button\"、tabindex=\"0\" 並加入 keydown/keyup 以支援 Enter/Space。",
        })
      );
    }
  }

  // Summary
  // Fill best-effort location info (line/column/offset) for UI highlighting.
  // We keep it lightweight: find the first occurrence of originalSnippet in the original html.
  const computeLineCol = (s: string, idx: number) => {
    if (idx <= 0) return { line: 1, column: 1 };
    const before = s.slice(0, idx);
    const lines = before.split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    return { line, column };
  };

  for (const issue of issues) {
    if (issue.startOffset !== 0 || issue.line !== 0) continue;
    const snippet = issue.originalSnippet || "";
    if (!snippet || snippet === "(document)") continue;
    const idx = html.indexOf(snippet);
    if (idx === -1) continue;
    const { line, column } = computeLineCol(html, idx);
    issue.startOffset = idx;
    issue.endOffset = idx + snippet.length;
    issue.line = line;
    issue.column = column;
  }

  const autoFixed = issues.filter(i => i.autoFixed).length;
  const needsManualReview = issues.filter(i => i.needsManualReview).length;

  return {
    originalHtml: html,
    repairedHtml: repaired,
    issues,
    summary: {
      totalIssues: issues.length,
      autoFixed,
      needsManualReview,
    },
  };
}
