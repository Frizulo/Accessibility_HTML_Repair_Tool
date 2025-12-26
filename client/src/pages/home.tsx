import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Play, 
  Copy, 
  RotateCcw,
  FileCode2,
  Accessibility,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import * as Diff from "diff";
import type { RepairResult, AccessibilityIssue } from "@shared/schema";

// Sample HTML for demonstration
const SAMPLE_HTML = `<div>
  <a href="/home"></a>
  <a href="/about">關於我們</a>
  <img src="logo.png">
  <iframe src="https://example.com/video"></iframe>
  <style>
    .small-text { font-size: 12px; }
    .heading { font-size: 24px; }
  </style>
  <p class="small-text">這是一段小文字</p>
</div>`;

// Synchronized diff viewer with character-level highlighting
function SyncDiffViewer({
  originalCode,
  repairedCode,
  issues = [],
  onOriginalChange,
  onCopyRepaired,
  showDiff = false
}: {
  originalCode: string;
  repairedCode: string;
  issues?: AccessibilityIssue[];
  onOriginalChange?: (code: string) => void;
  onCopyRepaired?: (code: string) => void | Promise<void>;
  showDiff?: boolean;
}) {
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Synchronized scrolling
  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (isScrollingRef.current) return;
    
    isScrollingRef.current = true;
    const sourceEl = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const targetEl = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    
    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop;
      targetEl.scrollLeft = sourceEl.scrollLeft;
    }
    
    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  }, []);

  // Compute character-level diff for each line
  const diffLines = useMemo(() => {
    if (!showDiff) return null;
    
    const origLines = originalCode.split('\n');
    const repLines = repairedCode.split('\n');
    const maxLines = Math.max(origLines.length, repLines.length);
    
    const result: Array<{
      lineNum: number;
      original: { text: string; parts: Array<{ text: string; type: 'same' | 'removed' | 'added' }> };
      repaired: { text: string; parts: Array<{ text: string; type: 'same' | 'removed' | 'added' }> };
      hasChanges: boolean;
    }> = [];
    
    for (let i = 0; i < maxLines; i++) {
      const origLine = origLines[i] || '';
      const repLine = repLines[i] || '';
      
      if (origLine === repLine) {
        result.push({
          lineNum: i + 1,
          original: { text: origLine, parts: [{ text: origLine || ' ', type: 'same' }] },
          repaired: { text: repLine, parts: [{ text: repLine || ' ', type: 'same' }] },
          hasChanges: false
        });
      } else {
        // Compute character-level diff
        const changes = Diff.diffChars(origLine, repLine);
        const origParts: Array<{ text: string; type: 'same' | 'removed' | 'added' }> = [];
        const repParts: Array<{ text: string; type: 'same' | 'removed' | 'added' }> = [];
        
        changes.forEach(change => {
          if (change.added) {
            repParts.push({ text: change.value, type: 'added' });
          } else if (change.removed) {
            origParts.push({ text: change.value, type: 'removed' });
          } else {
            origParts.push({ text: change.value, type: 'same' });
            repParts.push({ text: change.value, type: 'same' });
          }
        });
        
        // Ensure at least one part exists
        if (origParts.length === 0) origParts.push({ text: ' ', type: 'same' });
        if (repParts.length === 0) repParts.push({ text: ' ', type: 'same' });
        
        result.push({
          lineNum: i + 1,
          original: { text: origLine, parts: origParts },
          repaired: { text: repLine, parts: repParts },
          hasChanges: true
        });
      }
    }
    
    return result;
  }, [originalCode, repairedCode, showDiff]);

  const renderDiffParts = (parts: Array<{ text: string; type: 'same' | 'removed' | 'added' }>, side: 'left' | 'right') => {
    return parts.map((part, idx) => {
      let className = '';
      if (part.type === 'removed' && side === 'left') {
        className = 'bg-red-200 dark:bg-red-800/60 text-red-900 dark:text-red-100 rounded-sm px-0.5';
      } else if (part.type === 'added' && side === 'right') {
        className = 'bg-green-200 dark:bg-green-800/60 text-green-900 dark:text-green-100 rounded-sm px-0.5';
      }
      return (
        <span key={idx} className={className}>
          {part.text}
        </span>
      );
    });
  };

  // Check if a line has issues needing manual review
  const lineNeedsReview = useMemo(() => {
    const reviewLines = new Set<number>();
    issues.forEach(issue => {
      if (issue.needsManualReview) {
        reviewLines.add(issue.line);
      }
    });
    return reviewLines;
  }, [issues]);

  return (
    <div className="flex gap-4 h-full">
      {/* Left Panel - Original */}
      <div className="flex-1 flex flex-col border border-border rounded-lg overflow-hidden min-w-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4" />
            <span className="font-medium text-sm">原始程式碼</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-card">
          {!showDiff ? (
            <Textarea
              value={originalCode}
              onChange={(e) => onOriginalChange?.(e.target.value)}
              className="h-full min-h-[500px] resize-none border-0 rounded-none code-editor focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="在此貼上您的 HTML / CSS 程式碼片段..."
              data-testid="input-html-code"
            />
          ) : (
            <div 
              ref={leftScrollRef}
              onScroll={() => handleScroll('left')}
              className="h-[500px] overflow-auto code-editor"
            >
              <div className="p-4 min-w-max">
                {diffLines?.map((line, idx) => (
                  <div 
                    key={idx} 
                    className={`flex ${line.hasChanges ? 'bg-red-50/50 dark:bg-red-950/20' : ''} hover:bg-muted/30 transition-colors`}
                  >
                    <span className="line-number shrink-0 select-none">{line.lineNum}</span>
                    <pre className="flex-1 whitespace-pre overflow-visible">
                      <code>{renderDiffParts(line.original.parts, 'left')}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Repaired */}
      <div className="flex-1 flex flex-col border border-border rounded-lg overflow-hidden min-w-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-green-50 dark:bg-green-950/30 border-l-4 border-green-500">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4" />
            <span className="font-medium text-sm">修正後程式碼</span>
          </div>
          {showDiff && repairedCode && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onCopyRepaired?.(repairedCode)}
              data-testid="button-copy-code"
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              複製
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-hidden bg-card">
          {!showDiff ? (
            <div className="h-[500px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Accessibility className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>點擊「檢測」按鈕開始分析</p>
              </div>
            </div>
          ) : (
            <div 
              ref={rightScrollRef}
              onScroll={() => handleScroll('right')}
              className="h-[500px] overflow-auto code-editor"
            >
              <div className="p-4 min-w-max">
                {diffLines?.map((line, idx) => {
                  const needsReview = lineNeedsReview.has(line.lineNum);
                  const bgClass = needsReview 
                    ? 'bg-yellow-50/50 dark:bg-yellow-950/20' 
                    : line.hasChanges 
                      ? 'bg-green-50/50 dark:bg-green-950/20' 
                      : '';
                  return (
                    <div 
                      key={idx} 
                      className={`flex ${bgClass} hover:bg-muted/30 transition-colors`}
                    >
                      <span className="line-number shrink-0 select-none">{line.lineNum}</span>
                      <pre className="flex-1 whitespace-pre overflow-visible">
                        <code>{renderDiffParts(line.repaired.parts, 'right')}</code>
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Report item component
function ReportItem({ 
  issue, 
  isExpanded, 
  onToggle 
}: { 
  issue: AccessibilityIssue & { count?: number }; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isFixed = issue.autoFixed;
  const needsReview = issue.needsManualReview;
  
  const borderClass = isFixed 
    ? "border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20" 
    : needsReview 
      ? "border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"
      : "border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20";

  const Icon = isFixed ? CheckCircle2 : needsReview ? AlertTriangle : Info;
  const iconClass = isFixed 
    ? "text-green-600 dark:text-green-400" 
    : needsReview 
      ? "text-yellow-600 dark:text-yellow-400" 
      : "text-blue-600 dark:text-blue-400";

  return (
    <div className={`${borderClass} rounded-r-md p-4 hover-elevate`}>
      <div 
        className="flex items-start gap-3 cursor-pointer" 
        onClick={onToggle}
        data-testid={`report-item-${issue.ruleId}`}
      >
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="font-mono text-xs">
              {issue.taiwanCode}
            </Badge>
            <Badge variant="outline" className="text-xs">
              WCAG {issue.wcagCode}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {issue.level}
            </Badge>
            {issue.count && issue.count > 1 && (
              <Badge className="text-xs">
                {issue.count} 處
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed">{issue.message}</p>
          {isExpanded && (
            <div className="mt-3 space-y-2">
              {issue.originalSnippet && (
                <div className="text-xs">
                  <span className="text-muted-foreground">原始：</span>
                  <code className="ml-2 px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded text-red-700 dark:text-red-300">
                    {issue.originalSnippet}
                  </code>
                </div>
              )}
              {issue.fixedSnippet && (
                <div className="text-xs">
                  <span className="text-muted-foreground">修正：</span>
                  <code className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300">
                    {issue.fixedSnippet}
                  </code>
                </div>
              )}
              {issue.suggestion && (
                <div className="text-xs text-muted-foreground">
                  <Info className="h-3 w-3 inline mr-1" />
                  {issue.suggestion}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}


// Main page component
export default function Home() {
  const [inputHtml, setInputHtml] = useState(SAMPLE_HTML);
  const [template, setTemplate] = useState("");
  const [showTemplate, setShowTemplate] = useState(false);
  const [result, setResult] = useState<RepairResult | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const repairMutation = useMutation({
    mutationFn: async ({ html, config }: { html: string; config?: string }) => {
      const response = await apiRequest("POST", "/api/repair", { html, config });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "處理失敗");
      }
      const data = await response.json();
      return data as RepairResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "檢測完成",
        description: `發現 ${data.summary.totalIssues} 個問題，自動修正 ${data.summary.autoFixed} 個`,
      });
    },
    onError: (error) => {
      toast({
        title: "檢測失敗",
        description: error instanceof Error ? error.message : "發生未知錯誤",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = useCallback(() => {
    if (!inputHtml.trim()) {
      toast({
        title: "請輸入內容",
        description: "請先貼上 HTML / CSS 程式碼片段",
        variant: "destructive",
      });
      return;
    }
    repairMutation.mutate({ html: inputHtml, config: template || undefined });
  }, [inputHtml, template, repairMutation, toast]);

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Group issues by rule for summary
  const groupedIssues = (result?.issues || []).reduce((acc, issue) => {
    const key = `${issue.ruleId}-${issue.autoFixed}-${issue.needsManualReview}`;
    if (!acc[key]) {
      acc[key] = { ...issue, count: 0 };
    }
    acc[key].count!++;
    return acc;
  }, {} as Record<string, AccessibilityIssue & { count: number }>);

  const fixedIssues = Object.values(groupedIssues).filter(i => i.autoFixed);
  const manualIssues = Object.values(groupedIssues).filter(i => i.needsManualReview);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
                <Accessibility className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold" data-testid="text-app-title">
                  無障礙 HTML 修繕工具
                </h1>
                <p className="text-sm text-muted-foreground">
                  WCAG 2.1 / 台灣無障礙規範 AA 等級
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button 
              onClick={handleAnalyze}
              disabled={repairMutation.isPending}
              data-testid="button-analyze"
            >
              {repairMutation.isPending ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  處理中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  檢測並自動修補
                </>
              )}
            </Button>
            {result && (
              <Button 
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setExpandedItems(new Set());
                }}
                data-testid="button-clear"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                清空結果
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
                {/* Settings Section */}
        <Card className="mb-6" data-testid="section-settings">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              本工具採用本地規則引擎修繕（不需 API 金鑰），目標對齊 WCAG 2.1 / 台灣無障礙規範 AA 等級。
            </div>

            {/* Optional template */}
            <div>
              <button
                type="button"
                onClick={() => setShowTemplate(!showTemplate)}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
                data-testid="toggle-template"
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${showTemplate ? "rotate-90" : ""}`} />
                自訂規則字典（選填）
                <span className="text-xs text-muted-foreground font-normal">
                  以 JSON 調整本地規則（例如 basePx、是否移除 width、placeholder 文案）
                </span>
              </button>

              {showTemplate && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder={`例如（JSON）：
{
  "basePx": 16,
  "removeWidth": true,
  "placeholders": {
    "iframeTitle": "【需人工補上頁框標題】",
    "imgAlt": "【需人工補上圖片替代文字】",
    "linkText": "【需人工補上鏈結文字】",
    "linkEmptyTitle": "【需人工補上鏈結目的】"
  }
}
`}
                    className="font-mono text-xs min-h-[120px]"
                    data-testid="textarea-template"
                  />
                  <p className="text-xs text-muted-foreground">
                    只影響本地修繕引擎行為；若 JSON 無效會回報錯誤。
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

{/* Synchronized Diff Viewer */}
        <div className="mb-8">
          <SyncDiffViewer
            originalCode={inputHtml}
            repairedCode={result?.repairedHtml || ""}
            issues={result?.issues || []}
            onOriginalChange={setInputHtml}
            onCopyRepaired={async (code) => {
              try {
                await navigator.clipboard.writeText(code);
                toast({
                  title: "已複製",
                  description: "修正後程式碼已複製到剪貼簿",
                });
              } catch {
                toast({
                  title: "複製失敗",
                  description: "瀏覽器拒絕剪貼簿權限，請改用手動複製",
                  variant: "destructive",
                });
              }
            }}
            showDiff={!!result}
          />
        </div>

        {/* Report Section */}
        {result && (
          <Card data-testid="section-report">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2">
                <FileCode2 className="h-5 w-5" />
                無障礙檢測 / 修繕報告
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <span className="font-normal">總計：</span>
                  {result.summary.totalIssues} 個問題
                </Badge>
                <Badge className="gap-1 bg-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  自動修正：{result.summary.autoFixed}
                </Badge>
                {result.summary.needsManualReview > 0 && (
                  <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="h-3 w-3" />
                    需人工確認：{result.summary.needsManualReview}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Auto-fixed issues */}
              {fixedIssues.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    已自動修正
                  </h3>
                  <div className="space-y-3">
                    {fixedIssues.map((issue, idx) => (
                      <ReportItem
                        key={`fixed-${idx}`}
                        issue={issue}
                        isExpanded={expandedItems.has(`fixed-${idx}`)}
                        onToggle={() => toggleExpanded(`fixed-${idx}`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Manual review issues */}
              {manualIssues.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    無法自動修補（需人工確認）
                  </h3>
                  <div className="space-y-3">
                    {manualIssues.map((issue, idx) => (
                      <ReportItem
                        key={`manual-${idx}`}
                        issue={issue}
                        isExpanded={expandedItems.has(`manual-${idx}`)}
                        onToggle={() => toggleExpanded(`manual-${idx}`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {result.summary.totalIssues === 0 && (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                  <h3 className="text-lg font-medium">太棒了！</h3>
                  <p className="text-muted-foreground">未發現任何無障礙問題</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Initial state - no results yet */}
        {!result && !repairMutation.isPending && (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="text-center">
                <Accessibility className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">開始檢測您的 HTML</h3>
                <p className="text-muted-foreground mb-4">
                  在左側貼上您的 HTML / CSS 程式碼片段，然後點擊「檢測」按鈕
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">連結文字 (2.4.4)</Badge>
                  <Badge variant="outline">iframe 標題 (4.1.2)</Badge>
                  <Badge variant="outline">字體大小單位 (1.4.4)</Badge>
                  <Badge variant="outline">圖片替代文字 (1.1.1)</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {repairMutation.isPending && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <div className="h-12 w-12 mx-auto mb-4 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <h3 className="text-lg font-medium mb-2">正在分析...</h3>
                <p className="text-muted-foreground">
                  正在檢測並修繕您的 HTML 程式碼
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-auto">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <p className="text-sm text-muted-foreground text-center">
            符合 WCAG 2.1 AA 等級標準 · 支援台灣無障礙規範
          </p>
        </div>
      </footer>
    </div>
  );
}
