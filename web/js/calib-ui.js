/* 模式校估介面：計算分頁「模式校估」頁 */
(function () {
  'use strict';
  const B = window.RoadVibBatch, C = window.RoadVibCalib, S = window.RoadVibStore;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const sgn = (x, d = 1) => (Number.isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(d) : '—');
  const KEY = 'roadvib.calib.v1';

  let state = { sourceId: '', scenario: '', period: '日間', fPlane: 6, fElev: 6, soil: '黏土', excluded: [],
    baseYear: new Date().getFullYear(), conYear: null, opYear: null, rate: null };
  let sources = [], rows = [], grow = null;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 僅保留於本頁 */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) state = Object.assign(state, s); } catch (e) { /* 略 */ } }

  /** 併行配對沿用批次計算頁存的設定，缺的再用自動建議 */
  function batchPairs(groups) {
    let saved = {};
    try { saved = (JSON.parse(localStorage.getItem('roadvib.batch.v1')) || {}).pairs || {}; } catch (e) { /* 略 */ }
    const keys = new Set(groups.map((g) => g.key));
    const pairs = {};
    Object.keys(saved).forEach((p) => { if (keys.has(p) && (!saved[p] || keys.has(saved[p]))) pairs[p] = saved[p]; });
    const sug = B.suggestPairs(groups);
    Object.keys(sug).forEach((p) => { if (!(p in pairs) && !Object.values(pairs).includes(sug[p])) pairs[p] = sug[p]; });
    return pairs;
  }

  const srcById = (id) => sources.find((s) => s.id === id);

  function refresh() {
    const db = S.get();
    const data = B.fromAoa(S.toBatchAoa(db));
    const empty = $('#calibEmpty');
    const has = data.roads.length > 0 && db.receivers.length > 0;
    $('#calibTableCard').hidden = $('#calibStatCard').hidden = $('#calibGrowCard').hidden = !has;
    empty.hidden = has;
    if (!has) {
      empty.textContent = !data.roads.length
        ? '尚無道路資料：請到「基本輸入 › 運輸道路」新增，或在「批次計算／報表」匯入 Excel／CSV。'
        : '尚無敏感受體：請到「基本輸入 › 敏感受體」新增。';
      $('#calibSrc').innerHTML = $('#calibScenario').innerHTML = '';
      $('#calibSrc').disabled = $('#calibScenario').disabled = true;
      return;
    }
    const groups = B.groupRoads(data.roads);
    sources = B.buildSources(groups, batchPairs(groups));
    if (!srcById(state.sourceId)) state.sourceId = sources[0].id;
    $('#calibSrc').disabled = $('#calibScenario').disabled = false;
    $('#calibSrc').innerHTML = sources.map((s) => `<option value="${esc(s.id)}"${s.id === state.sourceId ? ' selected' : ''}>${esc(s.name)}</option>`).join('');

    const scenarios = C.scenariosOf(srcById(state.sourceId));
    if (!scenarios.includes(state.scenario)) state.scenario = scenarios.find((s) => s.startsWith('現況')) || scenarios[0] || '';
    $('#calibScenario').innerHTML = scenarios.map((s) => `<option${s === state.scenario ? ' selected' : ''}>${esc(s)}</option>`).join('');
    save();
    compute();
  }

  const optOf = () => ({ fPlane: state.fPlane, fElev: state.fElev, soil: state.soil, params: S.paramsMap(S.get()) });

  function compute() {
    const db = S.get();
    const src = srcById(state.sourceId);
    if (!src || !state.scenario) { rows = []; grow = null; renderTable(); renderStats(); renderGrowth(); return; }
    rows = C.rows(db, src, state.scenario, state.period, optOf());
    renderTable();
    renderStats();
    renderGrowth();
  }

  const included = () => rows.filter((r) => Number.isFinite(r.diff) && !state.excluded.includes(r.name));

  function renderTable() {
    const head = `<thead><tr><th>納入</th><th>#</th><th>敏感受體</th><th>參考測點</th><th class="num">R (m)</th>
      <th class="num">實測值 (dB)</th><th class="num">預測值 L<sub>V10,R</sub> (dB)</th><th class="num">差異（實測−預測）</th><th>備註</th></tr></thead>`;
    const body = rows.map((r, i) => {
      const ok = Number.isFinite(r.diff);
      const on = ok && !state.excluded.includes(r.name);
      return `<tr${on ? '' : ' class="calib-off"'}>
        <td><input type="checkbox" data-name="${esc(r.name)}"${on ? ' checked' : ''}${ok ? '' : ' disabled'} aria-label="納入 ${esc(r.name)}"></td>
        <td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.pointName)}</td>
        <td class="num">${fmt(r.R)}</td><td class="num">${fmt(r.measured)}</td><td class="num">${fmt(r.predicted)}</td>
        <td class="num"><b>${sgn(r.diff)}</b></td><td class="muted">${esc(r.issue)}</td></tr>`;
    }).join('');
    $('#calibTable').innerHTML = head + `<tbody>${body || '<tr><td colspan="9" class="muted empty-row">尚無敏感受體資料。</td></tr>'}</tbody>`;
    $('#calibCsvBtn').disabled = !rows.length;
  }

  function renderStats() {
    const inc = included();
    const st = C.stats(inc.map((r) => r.diff));
    $('#calibStats').innerHTML = [
      ['納入統計筆數', st.n, ''],
      ['平均差異（建議修正量）', sgn(st.mean), 'dB'],
      ['標準差', fmt(st.sd), 'dB'],
      ['差異範圍', st.n ? `${sgn(st.min)} ～ ${sgn(st.max)}` : '—', 'dB'],
    ].map(([l, v, u]) => `<div class="stat"><span>${l}</span><b>${v}${u ? `<small> ${u}</small>` : ''}</b></div>`).join('');
    $('#calibApply').textContent = st.n
      ? `修正後預測值 = 預測值 ${st.mean >= 0 ? '+' : '−'} ${fmt(Math.abs(st.mean))} dB。` +
        '施工、營運階段可以此修正量修正各預測值；「批次計算／報表」的「現況修正」則是每個受體各自用本頁的差異值修正。'
      : '沒有可統計的資料：受體需有「與基準點距離」與所選時段的現況背景值，且所選模擬狀況有道路資料。';
  }

  // ---------- 成長量校估 ----------
  function renderGrowth() {
    const src = srcById(state.sourceId);
    const msg = $('#calibGrowMsg'), table = $('#calibGrowTable');
    const hasCon = Number.isFinite(state.conYear), hasOp = Number.isFinite(state.opYear);
    const ready = src && state.scenario && Number.isFinite(state.rate) && Number.isFinite(state.baseYear) && (hasCon || hasOp);
    if (!ready) {
      grow = null;
      msg.textContent = '填入現況年、年平均成長率，以及施工年或營運年後，這裡會以成長後的交通量重算預測值。';
      table.innerHTML = '';
      return;
    }
    grow = C.growth(S.get(), src, state.scenario, optOf(), { rate: state.rate, baseYear: state.baseYear, conYear: state.conYear, opYear: state.opYear });
    const fx = (k, y) => `×${k.toFixed(3)}（${y - state.baseYear} 年）`;
    msg.textContent = `交通量倍率：` +
      [hasCon ? `施工年 ${fx(grow.factors.con, state.conYear)}` : '', hasOp ? `營運年 ${fx(grow.factors.op, state.opYear)}` : '']
        .filter(Boolean).join('、') + `，年平均成長率 ${state.rate}%。`;
    let head = `<th>#</th><th>敏感受體</th><th class="num">R (m)</th><th class="num">現況預測 (dB)</th>`;
    if (hasCon) head += `<th class="num">施工年預測 (dB)</th><th class="num">施工成長增量</th>`;
    if (hasOp) head += `<th class="num">營運年預測 (dB)</th><th class="num">營運成長增量</th>`;
    head += '<th>備註</th>';
    const body = grow.rows.map((r, i) => {
      let h = `<td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${fmt(r.R)}</td><td class="num">${fmt(r.p0)}</td>`;
      if (hasCon) h += `<td class="num">${fmt(r.pCon)}</td><td class="num"><b>${sgn(r.dCon)}</b></td>`;
      if (hasOp) h += `<td class="num">${fmt(r.pOp)}</td><td class="num"><b>${sgn(r.dOp)}</b></td>`;
      return `<tr>${h}<td class="muted">${esc(r.issue)}</td></tr>`;
    }).join('');
    table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="9" class="muted empty-row">尚無敏感受體資料。</td></tr>'}</tbody>`;
  }

  // ---------- 事件 ----------
  $('#calibSrc').addEventListener('change', (e) => { state.sourceId = e.target.value; state.scenario = ''; refresh(); });
  $('#calibScenario').addEventListener('change', (e) => { state.scenario = e.target.value; save(); compute(); });
  $('#calibPeriod').addEventListener('change', (e) => { state.period = e.target.value; save(); compute(); });
  $('#calibSoil').addEventListener('change', (e) => { state.soil = e.target.value; save(); compute(); });
  [['#calibFPlane', 'fPlane'], ['#calibFElev', 'fElev']].forEach(([sel, k]) => {
    $(sel).addEventListener('change', (e) => { state[k] = Number(e.target.value) || 6; save(); compute(); });
  });
  [['#calibYearNow', 'baseYear'], ['#calibYearCon', 'conYear'], ['#calibYearOp', 'opYear'], ['#calibGrowRate', 'rate']].forEach(([sel, k]) => {
    $(sel).addEventListener('change', (e) => {
      const v = e.target.value.trim();
      state[k] = v === '' ? null : Number(v);
      save();
      renderGrowth();
    });
  });
  $('#calibTable').addEventListener('change', (e) => {
    const name = e.target.dataset && e.target.dataset.name;
    if (name === undefined) return;
    state.excluded = state.excluded.filter((n) => n !== name);
    if (!e.target.checked) state.excluded.push(name);
    save();
    renderTable();
    renderStats();
  });
  $('#calibCsvBtn').addEventListener('click', () => {
    const st = C.stats(included().map((r) => r.diff));
    const cell = (v) => { const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const src = srcById(state.sourceId);
    const lines = [
      ['道路', src ? src.name : '', '模擬狀況', state.scenario, '實測值時段', state.period].map(cell).join(','),
      ['敏感受體', '參考測點', 'R(m)', '實測值(dB)', '預測值LV10_R(dB)', '差異(實測-預測)', '納入統計', '備註'].join(','),
    ].concat(rows.map((r) => [r.name, r.pointName, r.R, r.measured, r.predicted, r.diff,
      Number.isFinite(r.diff) && !state.excluded.includes(r.name) ? '是' : '否', r.issue].map(cell).join(',')));
    lines.push('', ['納入統計筆數', st.n, '平均差異(建議修正量)', st.mean, '標準差', st.sd, '差異範圍', st.n ? `${st.min}~${st.max}` : ''].map(cell).join(','));
    if (grow) {
      lines.push('', ['成長量校估', '現況年', state.baseYear, '施工年', state.conYear, '營運年', state.opYear, '年平均成長率(%)', state.rate].map(cell).join(','),
        ['敏感受體', 'R(m)', '現況預測(dB)', '施工年預測(dB)', '施工成長增量(dB)', '營運年預測(dB)', '營運成長增量(dB)', '備註'].join(','));
      grow.rows.forEach((r) => lines.push([r.name, r.R, r.p0, r.pCon, r.dCon, r.pOp, r.dOp, r.issue].map(cell).join(',')));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = '道路交通振動模式校估.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  window.addEventListener('roadvib:store', refresh);
  document.querySelectorAll('[data-page="calibPage"]').forEach((b) => b.addEventListener('click', refresh)); // 回到本頁時重抓批次配對

  load();
  $('#calibPeriod').value = state.period;
  $('#calibSoil').value = state.soil;
  $('#calibFPlane').value = state.fPlane;
  $('#calibFElev').value = state.fElev;
  $('#calibYearNow').value = state.baseYear ?? '';
  $('#calibYearCon').value = state.conYear ?? '';
  $('#calibYearOp').value = state.opYear ?? '';
  $('#calibGrowRate').value = state.rate ?? '';
  refresh();
})();
