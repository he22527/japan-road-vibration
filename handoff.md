# 交接檔（handoff.md）

> 任何 Agent、任何電腦接手前**必讀**；收工時**必更新**。本檔只放交接必需的精簡資訊，詳細脈絡放 Obsidian（`日本道路交通振動評估APP/專案工作流程.md`）。

## ⏯️ 目前做到哪
新增「批次計算／報表」分頁：匯入 xlsm 的道路與敏感受體表 → 配對表勾選 → 現況／施工／營運三張摘要表 → 匯出 Word（比照舊 VBA 版式）或 CSV。規則見 `docs/VBA解析.md` 第 4.6 節。

## 🚦 目前狀態
可運行。`npm test` 32 項全過（含讀原始 xlsm 的端到端測試）；瀏覽器實測匯入、配對、摘要表、Word 產生正常；Word 開啟產出檔並轉 PDF 檢查版面正常。
公式已依第 4.5 節定案修正，平面高架併行結果會與舊 Excel 不同（預期）。

## ➡️ 下一步
1. 使用者確認「營運摘要表」欄位對應（第 4.6 節標示暫定）
2. 使用者用實際專案 xlsm 試用批次功能
3. ~~發佈~~ 已上線 GitHub Pages：https://he22527.github.io/japan-road-vibration/（repo 已轉公開，push 到 main 約 1 分鐘後自動更新）

## ⚠️ 注意事項
- 專案放在 OneDrive 同步資料夾，git 已設定 `windows.appendAtomically false`
- xlsm 為原始參照，請勿直接修改（`web/test/batch.test.js` 直接讀它做驗證）
- 這台電腦的環境變數 `NODE_TLS_REJECT_UNAUTHORIZED=0` 會讓 npm 不驗證 HTTPS 憑證；下載套件後要另外核對雜湊

## 🕐 最後更新
- 時間：2026-11-18
- 更新者：Claude Code @ PC10972
- Git push：✅ 已推（初始 commit）
