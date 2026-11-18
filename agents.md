# 日本道路交通振動評估APP（專案藍圖）

> 本檔為跨 Agent 通用的專案藍圖（AGENTS.md 開放標準）。任何 Agent 的每個 session 都應先讀本檔＋`handoff.md`。

## 專案簡介
將既有 Excel VBA 版「日本道路交通振動」評估工具（日本建設省道路交通振動預測模式）改寫成可獨立執行的應用程式，支援平面、填方、挖方、路塹、單柱／雙柱高架、平面高架併行等道路斷面型式的振動預測。

## 關鍵時程
<!-- 格式：- 事件名稱：日期（說明）；沒有就留白 -->

## 目標與路線圖
- [x] 階段一：解析既有 VBA（xlsm）計算邏輯與使用指南，整理公式與參數（含公式定案）
- [x] 階段二：選定技術架構（純前端網頁），實作計算核心並以 Excel 結果驗證
- [x] 階段三：建立操作介面（斷面選擇、參數輸入、結果明細、計算清單、CSV 匯出）— 第一版
- [x] 階段四：Excel 匯入、批次計算（道路 × 受體配對、現況修正）、三張摘要表、Word／CSV 匯出
- [ ] 階段五：發佈（GitHub Pages 或內部共用）與使用說明

## 技術架構
- 純前端靜態網頁，免安裝、免伺服器：`web/index.html` 直接用瀏覽器開啟即可
- 計算核心 `web/js/calc.js` 為純函式（瀏覽器與 Node 共用），介面 `web/js/app.js`
- 測試：`npm test`（Node 內建 test runner，含 Excel 輸入總表 14 筆對照）
- 本機預覽：`.claude/launch.json` 的 `web`（python http.server，port 8765）
- 公式依 `docs/VBA解析.md` 第 4.5 節定案版本，改公式前先更新該節

## 資料夾結構
```
日本道路交通振動評估APP/
├── agents.md                                  專案藍圖（本檔）
├── handoff.md                                 交接檔
├── package.json                               npm test 設定
├── 參考資料/
│   └── 25_522.pdf                             參考文獻
├── docs/
│   └── VBA解析.md                             既有 VBA 計算邏輯解析、問題清單、公式定案
├── web/                                       網頁版 APP
│   ├── index.html                             主畫面
│   ├── css/style.css
│   ├── js/calc.js                             計算核心（純函式）
│   ├── js/app.js                              單筆計算介面
│   ├── js/store.js                            共用資料庫（敏感受體／道路／測點／評估基準／模式參數）
│   ├── js/data-ui.js                          單筆計算左側資料分頁與「帶入」選單
│   ├── js/batch.js                            批次計算（Excel 解析、配對、摘要表資料）
│   ├── js/report.js                           摘要表定義＋Word(.docx) 產生器
│   ├── js/batch-ui.js                         批次計算／報表介面
│   ├── vendor/                                SheetJS 0.20.3、JSZip 3.10.1（含授權檔）
│   ├── img/                                   斷面示意圖（複製自 VBA/）
│   └── test/                                  單元測試＋Excel 對照（batch 測試直接讀 VBA/ 的 xlsm）
├── 日本建設省交通振動模式使用指南_20250802 6.docx   模式使用指南
└── VBA/
    ├── 日本道路交通振動_20230325.xlsm          既有 VBA 版工具（計算邏輯來源）
    └── 平面／填方／挖方／路塹／單柱高架／雙柱高架／
        高架併平面／平面高架併行.jpg             8 種道路斷面示意圖
```

## 同步層級（本專案初始化至第 3 層級）

| 層級 | 平台 | 位置 | 讀取時機 |
|------|------|------|---------|
| L1 | 本地（OneDrive） | `agents.md`＋`handoff.md` | 每個 session |
| L2 | GitHub | he22527/japan-road-vibration（**公開**，2026-11-18 起）；網頁：https://he22527.github.io/japan-road-vibration/ | 指定時 |
| L3 | Obsidian | 日本道路交通振動評估APP/專案工作流程.md | 有需要時 |

## 工作約定
- 任何 Agent、任何電腦：**開工先讀 `handoff.md`，收工必更新 `handoff.md`**
- 修改共用檔案前先讀最新內容，避免覆蓋其他 Agent 的變更
- 所有回應與文件使用繁體中文
- 修改前先確認計畫，優先保留原有資料結構
- 既有 `VBA/日本道路交通振動_20230325.xlsm` 為原始參照，不直接修改
