/**
 * 共用資料庫：敏感受體／運輸道路（道路表）／振動測點（量測點）／評估基準／模式參數
 * 欄位比照 VBA/日本道路交通振動_20230325.xlsm 同名工作表。
 * 純函式部分瀏覽器與 Node 共用；瀏覽器另提供 localStorage 存取與變更事件。
 * 瀏覽器：window.RoadVibStore；Node：module.exports。
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const RV = isNode ? require('./calc.js') : root.RoadVib;

  const norm = (s) => String(s ?? '').replace(/\s+/g, '');
  const toNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v) => String(v ?? '').trim();

  // ---------------- 欄位定義（key, 標題, 型別） ----------------
  /** 運輸道路＝xlsm「道路」表 */
  const ROAD_COLS = [
    ['scenario', '模擬狀況', 'text'], ['road', '運輸道路', 'text'], ['section', '路段', 'text'],
    ['width', '路寬', 'num'], ['type', '道路型式', 'type'], ['H', '填/挖/凹之深或高(m)', 'num'],
    ['piers', '橋腳數', 'num'], ['pavement', '路面種類', 'pavement'], ['flat', 'αδ或αhp路面平坦性(mm)', 'num'],
    ['M', '車道數', 'num'], ['moto', '機車', 'num'], ['car', '小客車', 'num'], ['van', '小貨車', 'num'],
    ['small', '小型車', 'num'], ['vSmall', '小型車車速', 'num'], ['bus', '大客車', 'num'], ['truck', '大貨車', 'num'],
    ['special', '特殊車輛', 'num'], ['large', '大型車', 'num'], ['vLarge', '大型車車速', 'num'],
  ];
  /** 敏感受體（評估基準由「評估基準」表查得；背景值選參考測點時自測點帶入，可再手改） */
  const BG_COLS = [
    ['bgDay', '現況日間背景值', 'num'], ['bgNight', '現況夜間背景值', 'num'], ['bgCon', '施工時段背景值', 'num'],
    ['bgOpDay', '營運日間背景值', 'num'], ['bgOpNight', '營運夜間背景值', 'num'],
  ];
  const RECEIVER_COLS = [
    ['name', '敏感受體', 'text'], ['R', '與基準點距離', 'num'], ['zone', '噪音管制區', 'zone'], ['point', '參考測點', 'point'],
  ].concat(BG_COLS);
  /** 振動測點＝xlsm「量測點」表 */
  const POINT_COLS = [
    ['id', '測點編號', 'text'], ['name', '振動測點', 'text'], ['bgDay', '現況日間背景值', 'num'], ['bgNight', '現況夜間背景值', 'num'],
    ['bgCon', '施工時段背景值', 'num'], ['bgOpDay', '營運日間背景值', 'num'], ['bgOpNight', '營運夜間背景值', 'num'],
  ];

  const PARAM_TYPES = ['平面', '填方', '挖方', '路塹', '單柱高架', '雙柱高架'];

  function defaultCriteria() {
    return Object.entries(RV.CRITERIA).map(([zone, c]) => ({ zone, vzone: c.zone, day: c.day, night: c.night }));
  }
  function defaultParams() {
    return PARAM_TYPES.map((type) => Object.assign({ type }, RV.DEFAULT_PARAMS[type]));
  }
  function empty() {
    return { source: '', receivers: [], roads: [], points: [], criteria: defaultCriteria(), params: defaultParams() };
  }
  const blankRow = (cols) => Object.fromEntries(cols.map(([k, , t]) => [k, t === 'num' ? null : '']));

  // ---------------- 查表 ----------------
  const criteriaMap = (db) => Object.fromEntries(db.criteria.map((c) => [c.zone, { zone: c.vzone, day: c.day, night: c.night }]));
  const paramsMap = (db) => Object.fromEntries(db.params.map((p) => [p.type, { a: p.a, b: p.b, c: p.c, d: p.d }]));

  /** 受體查得的振動管制區、評估基準、測點名稱 */
  function resolveReceiver(db, r) {
    const c = criteriaMap(db)[r.zone] || {};
    const p = db.points.find((x) => x.id === r.point) || {};
    return { vzone: c.zone || '', day: c.day ?? null, night: c.night ?? null, pointName: p.name || '' };
  }

  /** 選定參考測點後，把測點背景值（四捨五入至 0.1，比照 xlsm）帶入受體 */
  function applyPoint(db, r) {
    const p = db.points.find((x) => x.id === r.point);
    if (!p) return r;
    BG_COLS.forEach(([k]) => { r[k] = Number.isFinite(p[k]) ? Math.round(p[k] * 10) / 10 : null; });
    return r;
  }

  /** 道路列 → 單筆計算用的單側參數；車速取兩車種平均 */
  function roadSpeed(r) {
    const a = r.vSmall, b = r.vLarge;
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    return Number.isFinite(a) ? a : Number.isFinite(b) ? b : null;
  }

  /** 由組成車種更新小型車／大型車合計（組成全空則保留原值） */
  function sumVehicles(r) {
    const s = [r.car, r.van].filter(Number.isFinite);
    const l = [r.bus, r.truck, r.special].filter(Number.isFinite);
    const out = {};
    if (s.length) out.small = s.reduce((x, y) => x + y, 0);
    if (l.length) out.large = l.reduce((x, y) => x + y, 0);
    return out;
  }

  // ---------------- xlsm 匯入 ----------------
  function objects(aoa) {
    if (!aoa || !aoa.length) return [];
    const head = aoa[0].map(norm);
    return aoa.slice(1).map((row) => {
      const o = {};
      head.forEach((h, j) => { if (h) o[h] = row[j]; });
      return o;
    });
  }
  const pick = (o, cols, numKeys) => Object.fromEntries(cols.map(([k, label, t]) => {
    const v = o[norm(label)];
    return [k, t === 'num' || (numKeys && numKeys.includes(k)) ? toNum(v) : str(v)];
  }));

  /** 依表頭辨識工作表種類（CSV 或改名的工作表用；辨識不到回 null） */
  function detectSheet(aoa) {
    const h = new Set(((aoa && aoa[0]) || []).map(norm));
    if (h.has('路型') && h.has('A常數')) return '模式參數';
    if (h.has('測點編號')) return '量測點';
    if (h.has('噪音管制區') && h.has('振動管制區') && !h.has('敏感受體')) return '評估基準';
    if (h.has('敏感受體') && h.has('與基準點距離')) return '敏感受體';
    if (h.has('模擬狀況') && h.has('運輸道路')) return '道路';
    return null;
  }

  /**
   * 從 SheetJS workbook 讀出整份資料庫；缺的工作表沿用預設（評估基準、模式參數）或空白。
   * 工作表先以名稱對應，對應不到的（如 CSV 的 Sheet1）再依表頭辨識。
   * @returns { db, found: [工作表名] }
   */
  function fromWorkbook(XLSX, wb) {
    const NAMES = ['道路', '量測點', '敏感受體', '評估基準', '模式參數'];
    const read = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const sheets = {};
    NAMES.forEach((n) => { if (wb.Sheets[n]) sheets[n] = read(n); }); // 先認名稱
    for (const n of wb.SheetNames) { // 再對剩下的（如 CSV 的 Sheet1）依表頭辨識
      if (NAMES.includes(n)) continue;
      const rows = read(n);
      const key = detectSheet(rows);
      if (key && !sheets[key]) sheets[key] = rows;
    }
    const aoa = (n) => sheets[n] || null;
    const db = empty();
    const found = [];

    const roads = aoa('道路');
    if (roads) {
      found.push('道路');
      db.roads = objects(roads).map((o) => {
        const r = pick(o, ROAD_COLS);
        r.type = norm(r.type);
        r.pavement = norm(r.pavement) === '混凝土' ? '混凝土' : (r.pavement ? '瀝青' : '');
        return r;
      }).filter((r) => r.road || r.type);
    }
    const pts = aoa('量測點');
    if (pts) {
      found.push('量測點');
      db.points = objects(pts).map((o) => pick(o, POINT_COLS)).filter((p) => p.id || p.name);
    }
    const recs = aoa('敏感受體');
    if (recs) {
      found.push('敏感受體');
      db.receivers = objects(recs).map((o) => {
        const r = pick(o, RECEIVER_COLS);
        r.zone = norm(r.zone);
        // 受體表的背景值若找不到對應測點，就補一個測點，避免資料遺失
        if (r.point && !db.points.some((p) => p.id === r.point)) {
          db.points.push({ id: r.point, name: str(o[norm('參考測點名稱')]), bgDay: toNum(o['現況日間背景值']), bgNight: toNum(o['現況夜間背景值']),
            bgCon: toNum(o['施工時段背景值']), bgOpDay: toNum(o['營運日間背景值']), bgOpNight: toNum(o['營運夜間背景值']) });
        }
        return r;
      }).filter((r) => r.name);
    }
    const crit = aoa('評估基準');
    if (crit) {
      const rows = objects(crit).map((o) => ({ zone: norm(o['噪音管制區']), vzone: norm(o['振動管制區']), day: toNum(o['日間評估基準']), night: toNum(o['夜間評估基準']) }))
        .filter((c) => c.zone && Number.isFinite(c.day) && Number.isFinite(c.night));
      if (rows.length) { found.push('評估基準'); db.criteria = rows; }
    }
    const par = aoa('模式參數');
    if (par) {
      const rows = objects(par).map((o) => ({ type: norm(o['路型']), a: toNum(o['A常數']), b: toNum(o['B常數']), c: toNum(o['C常數']), d: toNum(o['D常數']) }))
        .filter((p) => PARAM_TYPES.includes(p.type) && [p.a, p.b, p.c, p.d].every(Number.isFinite)); // 不採「平面高架併行」列（公式定案第 4 項）
      if (rows.length) {
        found.push('模式參數');
        db.params = PARAM_TYPES.map((t) => rows.find((p) => p.type === t) || defaultParams().find((p) => p.type === t));
      }
    }
    return { db, found };
  }

  /** 轉成批次計算用的二維陣列（沿用 batch.js 的解析，結果與直接讀 xlsm 一致） */
  function toBatchAoa(db) {
    const roads = [ROAD_COLS.map((c) => c[1])].concat(db.roads.map((r) => ROAD_COLS.map(([k]) => r[k])));
    const recHead = ['敏感受體', '與基準點距離', '噪音管制區', '日間評估基準', '夜間評估基準', '現況日間背景值', '營運日間背景值'];
    const receivers = [recHead].concat(db.receivers.map((r) => {
      const x = resolveReceiver(db, r);
      return [r.name, r.R, r.zone, x.day, x.night, r.bgDay, r.bgOpDay];
    }));
    return { roads, receivers };
  }

  const api = {
    ROAD_COLS, RECEIVER_COLS, POINT_COLS, PARAM_TYPES,
    empty, blankRow, defaultCriteria, defaultParams, criteriaMap, paramsMap,
    BG_COLS, detectSheet, resolveReceiver, applyPoint, roadSpeed, sumVehicles, fromWorkbook, toBatchAoa,
  };

  // ---------------- 瀏覽器：存取與事件 ----------------
  if (!isNode) {
    const KEY = 'roadvib.store.v1';
    let db;
    try { db = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { db = empty(); }
    api.get = () => db;
    /** 變更後呼叫：存檔並通知各畫面（detail.from 可用來略過自己） */
    api.commit = (from) => {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 容量不足等：僅保留於本頁 */ }
      root.dispatchEvent(new CustomEvent('roadvib:store', { detail: { from } }));
    };
    api.replace = (next, from) => { db = Object.assign(empty(), next); api.commit(from); };
  }

  if (isNode) module.exports = api;
  else root.RoadVibStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
