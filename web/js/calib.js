/**
 * 模式校估：敏感受體參考測點的實測背景值 vs 模式預測值（LV10,R）
 * 差異（實測 − 預測）作為施工／營運預測的修正量。
 * 純函式（不碰 DOM），瀏覽器：window.RoadVibCalib；Node：module.exports。
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const B = isNode ? require('./batch.js') : root.RoadVibBatch;
  const S = isNode ? require('./store.js') : root.RoadVibStore;

  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : NaN);

  /** 來源可用的模擬狀況清單（併行取兩側都有資料的狀況） */
  function scenariosOf(src) {
    const keys = (g) => Object.keys(g.rows);
    if (src.kind === 'single') return keys(src.group);
    if (src.kind === 'parallel') return keys(src.plane).filter((s) => src.elevated.rows[s]);
    if (src.kind === 'planeOnly') return keys(src.plane);
    return keys(src.elevated);
  }

  /**
   * 校估列：每個敏感受體一列
   * @param db 共用資料庫（store.js 的 db）
   * @param src buildSources 的評估來源
   * @param scenario 模擬狀況（如「現況晨峰」）
   * @param period '日間' | '夜間' → 實測值取現況日間／夜間背景值
   * @param opt { fPlane, fElev, soil, params }（同批次計算）
   * @returns [{ name, pointName, R, measured, predicted, diff, issue }]
   */
  function rows(db, src, scenario, period, opt) {
    return db.receivers.filter((r) => r.name).map((r) => {
      const m0 = period === '夜間' ? r.bgNight : r.bgDay;
      const measured = Number.isFinite(m0) && m0 > 0 ? m0 : NaN;
      let predicted = NaN;
      let issue = '';
      if (!Number.isFinite(r.R)) issue = '缺「與基準點距離」';
      else {
        const p = B.predict(src, scenario, r.R, opt);
        if (p.missing) issue = `缺「${scenario}」道路資料`;
        else if (p.error) issue = p.error;
        else predicted = p.value;
      }
      if (!issue && !Number.isFinite(measured)) issue = `缺現況${period}背景值`;
      const diff = Number.isFinite(measured) && Number.isFinite(predicted) ? r1(measured - predicted) : NaN;
      return { name: r.name, pointName: S.resolveReceiver(db, r).pointName, R: r.R, measured, predicted, diff, issue };
    });
  }

  /** 差異統計：平均（建議修正量）、樣本標準差、最小／最大 */
  function stats(diffs) {
    const d = diffs.filter(Number.isFinite);
    const n = d.length;
    if (!n) return { n: 0, mean: NaN, sd: NaN, min: NaN, max: NaN };
    const mean = d.reduce((a, b) => a + b, 0) / n;
    const sd = n >= 2 ? Math.sqrt(d.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1)) : NaN;
    return { n, mean: r1(mean), sd: r1(sd), min: Math.min(...d), max: Math.max(...d) };
  }

  // ---------------- 成長量校估 ----------------
  /** 交通量成長倍率：(1 + 年成長率%)^(目標年 − 現況年) */
  function growthFactor(rate, baseYear, year) {
    if (![rate, baseYear, year].every(Number.isFinite) || rate <= -100) return NaN;
    return Math.pow(1 + rate / 100, year - baseYear);
  }

  /** 把來源各列交通量乘上倍率 k（小型車、大型車同率成長） */
  function scaleSrc(src, k) {
    const scale = (g) => Object.assign({}, g, {
      rows: Object.fromEntries(Object.entries(g.rows).map(([s, r]) => [s, Object.assign({}, r, { Q1: r.Q1 * k, Q2: r.Q2 * k })])),
    });
    const out = Object.assign({}, src);
    if (src.group) out.group = scale(src.group);
    if (src.plane) out.plane = scale(src.plane);
    if (src.elevated) out.elevated = scale(src.elevated);
    return out;
  }

  /**
   * 成長量校估：施工年／營運年交通量成長後的預測值，與現況預測值之差＝交通成長增加的振動量
   * @param g { rate(%/年), baseYear 現況年, conYear 施工年, opYear 營運年 }（施工年／營運年可只填一個）
   * @returns { factors: { con, op }, rows: [{ name, R, p0, pCon, dCon, pOp, dOp, issue }] }
   */
  function growth(db, src, scenario, opt, g) {
    const kCon = growthFactor(g.rate, g.baseYear, g.conYear);
    const kOp = growthFactor(g.rate, g.baseYear, g.opYear);
    const srcCon = Number.isFinite(kCon) ? scaleSrc(src, kCon) : null;
    const srcOp = Number.isFinite(kOp) ? scaleSrc(src, kOp) : null;
    const rows = db.receivers.filter((r) => r.name).map((r) => {
      if (!Number.isFinite(r.R)) return { name: r.name, R: NaN, p0: NaN, pCon: NaN, dCon: NaN, pOp: NaN, dOp: NaN, issue: '缺「與基準點距離」' };
      const val = (s) => {
        if (!s) return NaN;
        const p = B.predict(s, scenario, r.R, opt);
        return Number.isFinite(p.value) ? p.value : NaN;
      };
      const p0 = val(src), pCon = val(srcCon), pOp = val(srcOp);
      return { name: r.name, R: r.R, p0, pCon, dCon: r1(pCon - p0), pOp, dOp: r1(pOp - p0),
        issue: Number.isFinite(p0) ? '' : `缺「${scenario}」道路資料` };
    });
    return { factors: { con: kCon, op: kOp }, rows };
  }

  const api = { scenariosOf, rows, stats, growthFactor, growth };
  if (isNode) module.exports = api;
  else root.RoadVibCalib = api;
})(typeof window !== 'undefined' ? window : globalThis);
