# 噪音振動商業軟體 UX／UI 設計趨勢與元素蒐集

> 蒐集日期：2026-11-18｜用途：作為本 APP（日本道路交通振動評估）介面改版參考
> 資料性質：多為廠商產品頁與新聞稿，並非第三方易用性研究；「趨勢」為跨廠商歸納，非權威結論。

---

## 一、調查對象

| 類別 | 代表軟體 | 與本 APP 的相關度 |
|------|---------|-----------------|
| 預測／模擬（桌面） | SoundPLAN、CadnaA、iNoise、FHWA TNM 3.0、ASJ RTN-Model 2023 程式 | ★★★ 同屬「輸入斷面參數 → 預測 → 報表」 |
| 監測平台（雲端） | Omnidots Honeycomb、Sigicom INFRA Net、Svantek SvanNET、Acoem Cadence、Soft dB、Bentley SenseMetrics | ★★ 圖表、警示、分享、報表概念可借用 |
| 工程計算 Web 工具 | ClearCalcs（Calcs.com）、CalcTree | ★★★ 「透明計算書」最接近本 APP 定位 |

日本道路交通振動預測方面，查無商用軟體的公開畫面資料；實務多以 Excel 或內部工具依建設省土木研究所式計算 L10（大阪市環評書即為一例）。**本 APP 在此領域幾乎沒有直接競品，差異化空間大。**

---

## 二、六大趨勢

### 1. 工作流程導向（Workflow-first）取代功能選單
- SoundPLANessential 6.0 標榜「完全重新設計介面、更直覺的專案工作流程」。
- FHWA TNM 3.0 的改版目標第一條就是改善 GUI；使用者意見集中在對話框切換、全景檢視按鈕等「少點幾下」的需求。
- **共通做法**：以步驟（1→2→3→4）引導，而非讓使用者在選單中找功能。

### 2. 計算透明化（Transparent calcs）
- ClearCalcs 的核心賣點：每個輸入、公式、規範條文都在計算書中可見；檢核結果以顏色標示，審查者不必逐行看就知道哪項控制。
- CalcTree：以「原生數學符號」呈現公式，並有範本庫。
- 對環評用途尤其重要：**審查委員要的是可追溯的計算過程，不只是一個數字。**

### 3. 地圖／空間脈絡＋儀表板
- Bentley SenseMetrics、Omnidots 都以「地圖上的測點＋旁邊的圖表」作為首頁。
- Soft dB 把噪音、振動、粉塵疊在同一張歷時圖上。
- 預測軟體（SoundPLAN、CadnaA）持續強化 GIS／DTM 匯入（CadnaA 2025 新增 GeoTIFF 地形匯入）。

### 4. 三段式警示與色彩語意
- Omnidots Honeycomb：三級警示（alarm levels），以 Email／SMS／個人儀表板通知。
- Sigicom INFRA Net：自訂 SMS、Email 通知與報表。
- 共通語言：**綠＝符合、黃＝接近、紅＝超標**，並配合數值與差值，不只靠顏色。

### 5. 免安裝、跨裝置、可分享
- Svantek SvanNET：免安裝，任何裝置可看結果與警示。
- Soft dB：針對手機／平板最佳化，可依角色開放客戶查看特定測點。
- Omnidots 用戶回饋：多方（業主、承包商、顧問）可同時看即時資料。

### 6. 一鍵報表與多格式匯出
- Omnidots：PDF、CSV、Excel 匯出。
- Acoem Cadence：可匯出作法規報告或公開網站用資料。
- CadnaA 2025 新增 Batch Mode 選單 → **批次計算＋批次報表**是專業用戶的高頻需求。

> 補充：AI 告警分類、AI 噪音源辨識（Acoem、iFactory）是監測平台的新賣點，但對「預測計算」型工具意義不大，可暫不考慮。

---

## 三、通用 UI 元素清單（2026 儀表板／資料型介面）

| 元素 | 說明 | 來源歸納 |
|------|------|---------|
| 等寬數字（tabular numerals） | 數值欄位對齊、易比對 | 2026 儀表板設計範例 |
| 細格線、寬行距的表格 | 資料密集但不擁擠 | 同上 |
| Hover 提示、可點擊資料點 | 使用者已預期圖表可互動 | 同上 |
| 深色模式作為切換選項 | 圖表對比好，但工程工具多數仍以淺色為預設 | 意見分歧 |
| 密度 vs. 留白取捨 | 日常工具偏好「安靜、留白」；分析頁才高密度 | 意見分歧 |
| 角色化檢視 | 審查者／計算者看的內容不同 | 儀表板設計原則 |
| 無障礙（對比、鍵盤操作） | 列為上線基本要求 | 儀表板設計原則 |

---

## 四、對照本 APP 現況與建議

本 APP 現況：單筆計算（案例 → 道路型式 → 平面／高架參數 → 預測點 → 結果明細 → 加入清單 → CSV）、批次計算（匯入 Excel → 設定 → 道路／受體配對 → 摘要表 → Word／CSV）。架構已具備「步驟化工作流」與「批次＋報表」，方向與業界一致。

### 建議優先序

| 優先 | 建議 | 對應趨勢 | 工作量 |
|------|------|---------|-------|
| **P1** | **結果卡加入合格判定燈號**：L10 預測值 vs. 區域／時段標準，顯示「符合／接近（差 ≤ 3 dB）／超標」三色標籤＋差值 | 4 | 小 |
| **P1** | **計算明細「可追溯化」**：每一修正項（衰減、鋪面、地盤、高架…）顯示公式、代入值、依據（引 `docs/VBA解析.md` 4.5 節） | 2 | 中 |
| **P1** | 數值欄位改用等寬數字（`font-variant-numeric: tabular-nums`），結果表右對齊 | 三 | 極小 |
| **P2** | 斷面示意圖與參數聯動：選道路型式時圖片即時切換，必要時在圖上標示 H、距離等參數 | 1、3 | 中 |
| **P2** | 距離衰減曲線圖：以預測點距離為橫軸畫 L10 曲線，標出標準線與交點（「多遠以外合格」） | 3、4 | 中 |
| **P2** | Word 報表加入計算過程附錄與判定色標，讓報告直接可送審 | 2、6 | 中 |
| **P3** | 輸入檢核即時提示（範圍外、單位提醒），錯誤欄位就地標示 | 1 | 小 |
| **P3** | 計算清單「專案存檔／讀檔」（JSON），方便跨電腦接續與分享 | 5 | 小 |
| **P3** | 深色模式切換、手機版版面檢查 | 5、三 | 小 |
| 暫緩 | 地圖底圖（Leaflet）標示道路與受體 | 3 | 大，待確認需求 |

---

## 參考來源

- Soft dB Monitoring Web Platform：https://softdb.com/monitoring/web-platform
- Bentley SenseMetrics：https://www.bentley.com/en/products/sensemetrics/
- Acoem Cadence：https://www.acoem.com/united-states/products/environmental-platforms/cadence
- Acoem WebMonitoring：https://www.acoem.com/united-states/products/noise-vibration-monitoring/noise-and-vibration-monitoring-stations/webmonitoring
- Svantek SvanNET：https://gomeasure.dk/products/svantek-svannet_1a-automatic-monitoring-services
- iFactory AI 噪音振動監測（2026-05，行銷文）：https://ifactoryapp.com/industries/infrastructure-management/ai-powered-noise-vibration-monitoring-urban
- SoundPLANessential 6.0：https://www.soundplan.eu/en/software/soundplanessential/current-version
- CadnaA 2025 Release Notes：https://doku.datakustik.com/CadnaA/en/release_notes_2025.html
- iNoise 2026：https://www.environmental-expert.com/news/inoise-calculation-software-powerfully-enhanced-with-version-2026-release-1183612
- FHWA TNM 3.0 Software Development：https://trid.trb.org/View/1302747
- GeoDecisions TNM UI：https://www.geodecisions.com/blog/2015/12/9/a-flexible-functional-traffic-noise-model-ui-for-fhwa-part-one
- Sigicom 工地監測：https://www.sigicom.com/construction-site-monitoring
- Omnidots Honeycomb：https://omnidots.com/en/products/honeycomb-web-platform
- Omnidots 6 項 Honeycomb 功能：https://www.omnidots.com/en/blog/6-honeycomb-features-that-ease-construction-vibration-monitoring
- Omnidots Honeycomb 規格書：https://support.omnidots.com/hubfs/Honeycomb%20spec%20sheet.pdf
- ClearCalcs：https://clearcalcs.com ／ 功能頁 https://app.clearcalcs.com/features
- ClearCalcs Capterra 評論：https://www.capterra.com/p/173974/ClearCalcs/reviews/
- CalcTree Capterra：https://www.capterra.com/p/10043771/CalcTree/
- ASJ RTN-Model 2023 程式頒布：https://acoustics.jp/cms/wp_asj/wp-content/uploads/asj_rtn-model2023_kaikoku.pdf
- 大阪市環評書（道路交通振動 L10 預測例）：https://www.city.osaka.lg.jp/kankyo/cmsfiles/contents/0000569/569479/hyouka_09-02.pdf
- SaaS Dashboard Design Trends 2026：https://dev.to/thekitbase/saas-dashboard-design-trends-in-2026-with-examples-121m
- 25 Best Dashboard Design Examples 2026：https://adminlte.io/blog/25-best-dashboard-design-examples-for-2026-real-products-principles/
- 9 Dashboard Design Principles 2026：https://www.designrush.com/agency/ui-ux-design/dashboard/trends/dashboard-design-principles
