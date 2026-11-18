/**
 * 批次計算：Excel 道路／敏感受體表 → 道路群組 → 配對 → 現況／施工／營運摘要表
 * 純函式（不碰 DOM），瀏覽器：window.RoadVibBatch；Node：module.exports。
 */
(function (root) {
  'use strict';
  const RV = (typeof module !== 'undefined' && module.exports) ? require('./calc.js') : root.RoadVib;

  const PHASES = ['現況', '無計畫', '有計畫'];
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : NaN);
  const norm = (s) => String(s ?? '').replace(/\s+/g, '');
  const toNum = (v) => {
    if (v === null || v === undefined || v === '') return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  /** 二維陣列（第一列為表頭）→ 物件陣列，表頭去空白 */
  function rowsToObjects(aoa) {
    if (!aoa || !aoa.length) return [];
    const head = aoa[0].map(norm);
    return aoa.slice(1).map((row, i) => {
      const o = { _row: i + 2 };
      head.forEach((h, j) => { if (h) o[h] = row[j]; });
      return o;
    });
  }

  /** 模擬狀況 → { phase, period }；例「無計畫晨峰」→ 無計畫 / 晨峰 */
  function parseScenario(s) {
    const t = norm(s);
    const phase = PHASES.find((p) => t.startsWith(p)) || null;
    return { scenario: t, phase, period: phase ? t.slice(phase.length) : '' };
  }

  /** 運輸道路去掉「_模擬狀況」字尾 */
  function baseRoadName(name, scenario) {
    let n = String(name ?? '').trim();
    if (scenario && n.endsWith('_' + scenario)) return n.slice(0, -(scenario.length + 1));
    const i = n.lastIndexOf('_');
    return i > 0 ? n.slice(0, i) : n;
  }

  const prefixOf = (name) => name.split(/[（(]/)[0].trim();

  // ---------------- 讀取 ----------------
  function parseRoads(aoa) {
    const rows = rowsToObjects(aoa);
    const roads = [], skipped = [];
    for (const o of rows) {
      const type = norm(o['道路型式']);
      const roadName = o['運輸道路'];
      if (!roadName || !RV.ROAD_TYPES.includes(type)) {
        if (roadName || type) skipped.push(o._row);
        continue;
      }
      const sc = parseScenario(o['模擬狀況']);
      const base = baseRoadName(roadName, sc.scenario);
      const section = String(o['路段'] ?? '').trim();
      const prefix = prefixOf(base);
      const v1 = toNum(o['小型車車速']), v2 = toNum(o['大型車車速']);
      roads.push({
        row: o._row, ...sc, type,
        name: section ? `${prefix}(${section})` : base,
        key: prefix + '|' + (section || base),
        prefix, section,
        H: toNum(o['填/挖/凹之深或高(m)']) || 0,
        piers: toNum(o['橋腳數']) || 0,
        pavement: norm(o['路面種類']) === '混凝土' ? '混凝土' : '瀝青',
        flat: toNum(o['αδ或αhp路面平坦性(mm)']),
        M: toNum(o['車道數']),
        Q1: toNum(o['小型車']) || 0,
        Q2: toNum(o['大型車']) || 0,
        V: Number.isFinite(v1) && Number.isFinite(v2) ? (v1 + v2) / 2 : (Number.isFinite(v1) ? v1 : v2),
      });
    }
    return { roads, skipped };
  }

  function parseReceivers(aoa) {
    const rows = rowsToObjects(aoa);
    const out = [];
    for (const o of rows) {
      const name = String(o['敏感受體'] ?? '').trim();
      if (!name) continue;
      const zone = norm(o['噪音管制區']);
      const c = RV.CRITERIA[zone];
      out.push({
        row: o._row, name, zone,
        R: toNum(o['與基準點距離']),
        day: Number.isFinite(toNum(o['日間評估基準'])) ? toNum(o['日間評估基準']) : (c ? c.day : NaN),
        night: Number.isFinite(toNum(o['夜間評估基準'])) ? toNum(o['夜間評估基準']) : (c ? c.night : NaN),
        bgNow: toNum(o['現況日間背景值']),
        bgOpDay: toNum(o['營運日間背景值']),
      });
    }
    return out;
  }

  /** 依道路群組彙整 */
  function groupRoads(roads) {
    const map = new Map();
    for (const r of roads) {
      if (!map.has(r.key)) map.set(r.key, { key: r.key, name: r.name, prefix: r.prefix, section: r.section, type: r.type, piers: 0, rows: {} });
      const g = map.get(r.key);
      g.piers = Math.max(g.piers, r.piers);
      g.rows[r.scenario] = r;
    }
    const groups = [...map.values()];
    groups.forEach((g) => { g.side = g.type === '平面高架併行' ? (g.piers >= 1 ? 'elevated' : 'plane') : null; });
    return groups;
  }

  /** 併行平面側：依路段「與ＸＸ併行」自動建議高架側夥伴 */
  function suggestPairs(groups) {
    const pairs = {};
    const elevs = groups.filter((g) => g.side === 'elevated');
    for (const g of groups.filter((x) => x.side === 'plane')) {
      const m = /與([^與()（）]+?)併行/.exec(g.section || g.name);
      const hit = m && elevs.find((e) => e.prefix === m[1].trim());
      if (hit) pairs[g.key] = hit.key;
    }
    return pairs;
  }

  /**
   * 評估來源：一般道路一條一個；併行平面側（含夥伴）一個；未被配對的併行高架側一個
   * @returns [{ id, name, kind: 'single'|'parallel'|'planeOnly'|'elevOnly', plane?, elevated?, group? }]
   */
  function buildSources(groups, pairs) {
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    const used = new Set(Object.values(pairs).filter(Boolean));
    const out = [];
    for (const g of groups) {
      if (!g.side) out.push({ id: g.key, name: g.name, kind: 'single', group: g });
      else if (g.side === 'plane') {
        const e = pairs[g.key] && byKey[pairs[g.key]];
        out.push(e
          ? { id: g.key, name: `${g.name} ＋ ${e.name}`, kind: 'parallel', plane: g, elevated: e }
          : { id: g.key, name: g.name, kind: 'planeOnly', plane: g });
      } else if (!used.has(g.key)) out.push({ id: g.key, name: g.name, kind: 'elevOnly', elevated: g });
    }
    return out;
  }

  // ---------------- 計算 ----------------
  const planeInput = (r, opt) => ({ Q1: r.Q1, Q2: r.Q2, M: r.M, V: r.V, pavement: r.pavement, sigma: r.flat, f: opt.fPlane, H: r.H });
  const elevInput = (r, opt) => ({ Q1: r.Q1, Q2: r.Q2, M: r.M, V: r.V, Hp: r.flat, f: opt.fElev, piers: r.piers });

  /** 某來源在某模擬狀況、距離 R 的預測 LV10_R；缺資料回傳 { missing } */
  function predict(src, scenario, R, opt) {
    let input;
    if (src.kind === 'single') {
      const r = src.group.rows[scenario];
      if (!r) return { missing: true };
      input = { type: r.type, R, soil: opt.soil, plane: planeInput(r, opt), elevated: elevInput(r, opt) };
    } else if (src.kind === 'parallel') {
      const p = src.plane.rows[scenario], e = src.elevated.rows[scenario];
      if (!p || !e) return { missing: true };
      input = { type: '平面高架併行', R, plane: planeInput(p, opt), elevated: elevInput(e, opt), planePiers: e.piers };
    } else if (src.kind === 'planeOnly') {
      const p = src.plane.rows[scenario];
      if (!p) return { missing: true };
      input = { type: '平面', R, soil: opt.soil, plane: planeInput(p, opt) };
    } else {
      const e = src.elevated.rows[scenario];
      if (!e) return { missing: true };
      input = { type: e.piers >= 2 ? '雙柱高架' : '單柱高架', R, elevated: elevInput(e, opt) };
    }
    const res = RV.calculate(input);
    return res.ok ? { value: r1(res.lv10R), lv10: res.lv10 } : { error: res.errors.join('；') };
  }

  /**
   * 批次計算
   * @param combos [{ sourceId, receiver(name) }]
   * @param opt { fPlane=6, fElev=6, soil='黏土', correction=true }
   * @returns { now, construction, operation, issues }
   */
  function computeBatch(data, sources, combos, options) {
    const opt = Object.assign({ fPlane: 6, fElev: 6, soil: '黏土', correction: true }, options);
    const srcById = Object.fromEntries(sources.map((s) => [s.id, s]));
    const recByName = Object.fromEntries(data.receivers.map((r) => [r.name, r]));
    const periods = [...new Set(data.roads.filter((r) => r.phase).map((r) => r.period))];
    const now = [], construction = [], operation = [], issues = [];

    for (const c of combos) {
      const src = srcById[c.sourceId], rec = recByName[c.receiver];
      if (!src || !rec) continue;
      if (!Number.isFinite(rec.R)) { issues.push(`${rec.name}：缺「與基準點距離」`); continue; }
      for (const period of periods) {
        const P = {};
        for (const ph of PHASES) {
          P[ph] = predict(src, ph + period, rec.R, opt);
          if (P[ph].error) issues.push(`${src.name}／${rec.name}／${ph}${period}：${P[ph].error}`);
        }
        const pNow = P['現況'].value, pNo = P['無計畫'].value, pYes = P['有計畫'].value;
        if (![pNow, pNo, pYes].some(Number.isFinite)) continue;
        const measured = rec.bgNow;
        const err = Number.isFinite(measured) && Number.isFinite(pNow) ? r1(measured - pNow) : NaN;
        const corr = opt.correction && Number.isFinite(err) ? err : 0;
        const no = r1(pNo + corr), yes = r1(pYes + corr);
        const base = { road: src.name, receiver: rec.name, period, criteria: rec.day };

        if (Number.isFinite(pNow)) now.push({ ...base, scenario: '現況' + period, measured, predicted: pNow, error: err });
        if (Number.isFinite(no) || Number.isFinite(yes)) {
          construction.push({ ...base, background: measured, without: no, with: yes, increment: r1(yes - no), correction: corr });
          const opBg = Number.isFinite(rec.bgOpDay) && rec.bgOpDay > 0 ? rec.bgOpDay : measured;
          const combined = Number.isFinite(opBg) && Number.isFinite(yes) ? r1(RV.energySum(opBg, yes)) : NaN;
          operation.push({ ...base, current: measured, opBackground: opBg, opLevel: yes, combined, increment: r1(combined - opBg) });
        }
      }
    }
    return { now, construction, operation, issues, periods };
  }

  /** 從 SheetJS workbook 物件讀出（瀏覽器與 Node 共用） */
  function fromWorkbook(XLSX, wb) {
    const need = ['道路', '敏感受體'];
    const missing = need.filter((n) => !wb.Sheets[n]);
    if (missing.length) throw new Error('找不到工作表：' + missing.join('、') + '（需要「道路」與「敏感受體」）');
    const aoa = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const { roads, skipped } = parseRoads(aoa('道路'));
    const receivers = parseReceivers(aoa('敏感受體'));
    return { roads, skipped, receivers };
  }

  const api = { PHASES, parseScenario, baseRoadName, parseRoads, parseReceivers, groupRoads, suggestPairs, buildSources, predict, computeBatch, fromWorkbook };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoadVibBatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
