# 無障礙 HTML 輔助修繕工具（Accessibility HTML Repair Tool）

本專案是一個 **完全本地執行（無需雲端 API、無資料庫）** 的無障礙 HTML 修繕工具，
目標為 **對齊 WCAG 2.1 與台灣無障礙規範（AA 等級）在 Freego 2.0 中常見的檢測項目**。

工具定位為「**結構性問題自動修補 + 語意性問題檢測提示**」，避免因過度自動化而造成誤修。

## 特色（Features）

* ✅ **完全本地執行**

  * 不使用雲端 API
  * 不使用資料庫（stateless 設計）
  * 適合校園環境與離線使用

* ✅ **對齊 Freego 2.0 / WCAG 2.1 AA 常見檢測方向**

  * 自動修補可確定語意之結構性問題
  * 對需人工判斷之項目提供檢測與警示

* ✅ **直覺的差異比對介面**

  * 左側：原始 HTML（紅色標示被移除或修正）
  * 右側：修繕後 HTML（綠色標示新增內容）
  * 同步捲動、差異高亮（Git-like diff）


## 系統架構說明

* 前端：React + Vite（程式碼輸入、diff 顯示、修繕報告）
* 後端：Node.js + Express
* 修繕引擎：

  * HTML / CSS 以 Parser（AST）方式處理
  * 規則式（Rule-based）修繕，結果可重現
* 架構特性：

  * Stateless（不保存任何使用者資料）
  * 不使用資料庫
  * 單一 Docker container 即可執行


## 啟動方式

### 使用 Docker（建議）

```bash
docker compose up --build
```

啟動後開啟瀏覽器：

```
http://localhost:3000
```

### 非 Docker（本機 Node.js）

```bash
npm install
npm run dev
```


## MVP 目前支援的自動修補與檢測項目

### 🔧 自動修補（Freego 直接判定項目）

* **`<a>` 鏈結**

  * 空鏈結文字 → 僅報告提示（不自動填入，避免誤修）
  * 缺少 `title`（且前後有其他內容）→ 自動補上（以鏈結文字為基礎）
  * `target="_blank"` → 補上「另開新視窗」提示（title）

* **`<iframe>` / `<frame>`**

  * 缺少 `title` → 自動補上 placeholder（需人工確認語意）

* **`<img>`**

  * 缺少 `alt` → 自動補上 placeholder
    （並標記為「需人工確認是否為資訊性或裝飾性圖片」）

* **表格語意（1.3.1）**

  * 每個 `<tr>` 中第一個「有文字內容」的 `<td>`
    → 轉換為 `<th scope="row">`
  * `<th>` 缺少 `scope` → 補上 `scope="col"`

* **CSS 字型大小（1.4.4 AA）**

  * `font-size`：`px / pt / rem` → 轉換為 `em`
  * 僅處理字型大小，不影響版面配置

* **inline style 清理**

  * 移除固定 `width`
  * 合併 `padding-top/right/left/bottom` → `padding`
  * 保留原本 style 宣告順序（避免 diff 混亂）

* **`<style>` 標籤**

  * `font-size`：`px / pt / rem` → `em`

---
### 修改的範例字典
```
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
```


### ⚠️ 僅檢測與提示（不自動修補）

以下項目涉及語意或互動行為，工具僅提供 **Freego 風險提示**：

* **圖片替代文字語意判斷（1.1.1）**

  * 連結圖片但 `alt=""` → 警告
* **Skip Link（2.4.1）**

  * 未提供「跳至主要內容」連結 → 提示
* **色彩對比（1.4.3 AA）**

  * 偵測到文字色但背景不明 → 提示需人工確認
* **鍵盤可操作性（2.1.1）**

  * `div/span` + `onclick` → 提示可能無法鍵盤操作
* **表單欄位標籤（1.3.1 / 2.4.6）**

  * 缺少 `<label>` 或 `aria-label`
  * 明確提示：`placeholder` 不能取代 label


## 專案設計原則

* ✅ 能確定語意 → **自動修補**
* ⚠️ 需人工理解內容 → **僅檢測與提示**
* ❌ 不進行破壞性或猜測性修改
* ❌ 不儲存任何輸入資料（無資料庫）


## 適用情境

* 校園網站無障礙修繕前置檢查
* 搭配 **Freego 2.0** 使用的修繕輔助工具
* 作為 WCAG / 台灣無障礙規範教學與示範
