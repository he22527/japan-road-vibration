/**
 * 日本建設省道路交通振動預測模式 — 計算核心（純函式，不碰 UI）
 * 公式依 docs/VBA解析.md 第 2 節與第 4.5 節「公式定案」。
 * 瀏覽器：window.RoadVib；Node：module.exports。
 */
(function (root) {
  'use strict';
  const log = Math.log10;

  const ROAD_TYPES = ['平面', '填方', '挖方', '路塹', '單柱高架', '雙柱高架', '平面高架併行'];
  const PLANE_FAMILY = ['平面', '填方', '挖方', '路塹'];
  const ELEVATED = ['單柱高架', '雙柱高架'];

  /** 評估基準（噪音管制區 → 振動管制區、日／夜間基準 dB） */
  const CRITERIA = {
    '第一類': { zone: '第一種', day: 65, night: 60 },
    '第二類': { zone: '第一種', day: 65, night: 60 },
    '第三類': { zone: '第二種', day: 70, night: 65 },
    '第四類': { zone: '第二種', day: 70, night: 65 },
  };

  /** 橋腳數 → d（定案第 4 項：併行平面側同樣適用） */
  const dByPiers = (piers) => (Number(piers) >= 2 ? 20 : 18);

  /** 等價交通量 Q*（輛/500s/車道） */
  function equivalentTraffic(Q1, Q2, M) {
    return (500 / 3600) * (1 / M) * (Q1 + 12 * Q2);
  }

  /** a·log(log Q*) + b·log V + c·log M + d */
  function baseLevel(k, Q, V, M) {
    return k.a * log(log(Q)) + k.b * log(V) + k.c * log(M) + k.d;
  }

  /** ασ 路面平坦性補正（平面系）；σ ≤ 1 → 0 */
  function alphaSigma(pavement, sigma) {
    if (sigma <= 1) return 0;
    return (pavement === '混凝土' ? 18 : 14) * log(sigma);
  }

  /** αHp 高架接縫高低差補正 */
  const alphaHp = (Hp) => 0.4 * log(Hp);

  /** αf 平面系地盤卓越振動數補正 */
  function alphaFPlane(f) {
    if (f >= 8) return -20 * log(f);
    if (f >= 4) return -18;
    return -24 + 10 * log(f);
  }

  /** αf 高架地盤卓越振動數補正 */
  function alphaFElevated(f) {
    if (f >= 8) return -5 * log(f);
    if (f >= 4) return -4.5;
    return -6 + 2.5 * log(f);
  }

  /** αs 道路構造補正 */
  function alphaS(type, H) {
    switch (type) {
      case '填方': return -1.4 * H - 1.3;
      case '挖方': return -0.87 * H - 1.7;
      case '路塹': return -4.7 * H + 5.9;
      default: return 0;
    }
  }

  /** 距離衰減因子 log(R/5+1)/log2 */
  const distanceFactor = (R) => log(R / 5 + 1) / log(2);

  /** 能量合成 */
  const energySum = (...levels) => 10 * log(levels.reduce((s, L) => s + Math.pow(10, L / 10), 0));

  // ---------------- 輸入檢核 ----------------
  function check(errors, cond, msg) { if (!cond) errors.push(msg); }

  function validateTraffic(t, label, errors) {
    const p = label ? label + '：' : '';
    check(errors, t.M >= 1, p + '車道數 M 需 ≥ 1');
    check(errors, t.Q1 >= 0 && t.Q2 >= 0, p + '車輛數不可為負');
    check(errors, t.V > 0, p + '平均車速 V 需 > 0');
    if (t.M >= 1 && t.Q1 >= 0 && t.Q2 >= 0) {
      const Q = equivalentTraffic(t.Q1, t.Q2, t.M);
      check(errors, Q > 1, p + `等價交通量 Q* = ${Q.toFixed(2)}，需 > 1 才能取 log(log Q*)`);
    }
  }

  // ---------------- 單側計算 ----------------
  /** 平面系一側（平面／填方／挖方／路塹，或併行之平面側） */
  function planeSide(type, t, kOverride) {
    const k = kOverride || { a: 65, b: 6, c: 4, d: 35 };
    const Q = equivalentTraffic(t.Q1, t.Q2, t.M);
    const base = baseLevel(k, Q, t.V, t.M);
    const aSigma = alphaSigma(t.pavement, t.sigma);
    const aF = alphaFPlane(t.f);
    const aS = alphaS(type, t.H || 0);
    const lvPlane = base + aSigma + aF; // LV10(平)，不含 αs
    return { k, Q, base, aSigma, aF, aS, lvPlane, lv: lvPlane + aS };
  }

  /** 高架一側 */
  function elevatedSide(t) {
    const k = { a: 54, b: 6, c: 2, d: dByPiers(t.piers) };
    const Q = equivalentTraffic(t.Q1, t.Q2, t.M);
    const base = baseLevel(k, Q, t.V, t.M);
    const aHp = alphaHp(t.Hp);
    const aF = alphaFElevated(t.f);
    return { k, Q, base, aHp, aF, lv: base + aHp + aF };
  }

  /** β（距離衰減係數） */
  function beta(type, s, soil) {
    switch (type) {
      case '平面': return soil === '砂質' ? 0.119 * s.lvPlane - 3.2 : 0.06 * s.lvPlane - 1.6;
      case '填方': return 0.077 * (s.lvPlane + s.aS) - 1.8;
      case '挖方': return 0.134 * (s.lvPlane + s.aS) - 3.2;
      case '路塹': return 0.058 * (s.lvPlane + s.aS) - 1.6;
      default: return 0.072 * s.lv - 2.2; // 高架、併行（用合成值）
    }
  }

  /**
   * 主計算
   * @param {object} input
   *   type: ROAD_TYPES 之一
   *   R: 自基準點（距最外側車道中心 5 m）至預測點距離 (m)
   *   soil: '黏土' | '砂質'（僅平面）
   *   plane: { Q1, Q2, M, V, pavement, sigma, f, H }        — 平面系與併行
   *   elevated: { Q1, Q2, M, V, piers, Hp, f }               — 高架與併行
   *   planePiers: 併行時平面側採用之橋腳數（定 d）
   *   background, zone, period: 選填，影響評估用
   */
  function calculate(input) {
    const errors = [];
    const { type } = input;
    check(errors, ROAD_TYPES.includes(type), '未知的道路型式：' + type);
    check(errors, Number.isFinite(input.R) && input.R > -5, '預測點距離 R 需 > −5 m');

    const usesPlane = PLANE_FAMILY.includes(type) || type === '平面高架併行';
    const usesElev = ELEVATED.includes(type) || type === '平面高架併行';
    const isParallel = type === '平面高架併行';
    if (usesPlane) {
      const p = input.plane || {};
      validateTraffic(p, isParallel ? '平面側' : '', errors);
      check(errors, p.f > 0, (isParallel ? '平面側：' : '') + '地盤卓越振動數 f 需 > 0');
      check(errors, p.sigma > 0, (isParallel ? '平面側：' : '') + '路面平坦性 σ 需 > 0');
    }
    if (usesElev) {
      const e = input.elevated || {};
      validateTraffic(e, isParallel ? '高架側' : '', errors);
      check(errors, e.f > 0, (isParallel ? '高架側：' : '') + '地盤卓越振動數 f 需 > 0');
      check(errors, e.Hp > 0, (isParallel ? '高架側：' : '') + '接縫高低差 Hp 需 > 0');
    }
    if (errors.length) return { ok: false, errors };

    const out = { ok: true, type, R: input.R };
    if (PLANE_FAMILY.includes(type)) {
      out.plane = planeSide(type, input.plane);
      out.lv10 = out.plane.lv;
      out.beta = beta(type, out.plane, input.soil);
    } else if (ELEVATED.includes(type)) {
      const e = Object.assign({}, input.elevated, { piers: type === '單柱高架' ? 1 : 2 });
      out.elevated = elevatedSide(e);
      out.lv10 = out.elevated.lv;
      out.beta = beta(type, out.elevated);
    } else {
      const kPlane = { a: 65, b: 6, c: 4, d: dByPiers(input.planePiers) };
      out.plane = planeSide('平面', input.plane, kPlane);
      out.elevated = elevatedSide(input.elevated);
      out.lv10 = energySum(out.plane.lv, out.elevated.lv);
      out.beta = beta(type, { lv: out.lv10 });
    }
    out.alphaL = out.beta * distanceFactor(input.R); // 衰減量（正值）
    out.lv10R = out.lv10 - out.alphaL;

    // 影響評估（選填）
    if (Number.isFinite(input.background)) {
      out.combined = energySum(input.background, out.lv10R);
      out.increment = out.combined - input.background;
    }
    const crit = CRITERIA[input.zone];
    if (crit) {
      out.criteria = input.period === '夜間' ? crit.night : crit.day;
      out.judged = Number.isFinite(out.combined) ? out.combined : out.lv10R;
      Object.assign(out, judge(out.judged, out.criteria));
    }
    return out;
  }

  /** 接近基準之餘裕門檻 (dB)：餘裕 ≤ 此值視為「接近」 */
  const NEAR_MARGIN = 3;

  /**
   * 三段判定：pass（符合）／near（符合但餘裕 ≤ NEAR_MARGIN）／fail（超過）
   * margin = 基準 − 判定值（正值＝尚有餘裕）
   */
  function judge(level, criteria) {
    const margin = criteria - level;
    const pass = level <= criteria;
    const grade = !pass ? 'fail' : margin <= NEAR_MARGIN ? 'near' : 'pass';
    return { pass, margin, grade };
  }
  const GRADE_LABEL = { pass: '符合', near: '接近', fail: '超過' };

  const api = {
    ROAD_TYPES, PLANE_FAMILY, ELEVATED, CRITERIA,
    equivalentTraffic, baseLevel, alphaSigma, alphaHp, alphaFPlane, alphaFElevated,
    alphaS, distanceFactor, energySum, dByPiers, calculate,
    NEAR_MARGIN, judge, GRADE_LABEL,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoadVib = api;
})(typeof window !== 'undefined' ? window : globalThis);
