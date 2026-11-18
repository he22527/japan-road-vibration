/* 介面邏輯：讀表單 → RoadVib.calculate → 顯示；清單存 localStorage */
(function () {
  'use strict';
  const RV = window.RoadVib;
  const $ = (s) => document.querySelector(s);
  const form = $('#form');
  const STORE_KEY = 'roadvib.list.v1';
  const fmt = (x, d = 1) => (Number.isFinite(x) ? (Math.round(x * 10 ** d) / 10 ** d).toFixed(d) : '—');
  const sgn = (x, d = 1) => (Number.isFinite(x) && x > 0 ? '+' : '') + fmt(x, d);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const H_LABEL = { '填方': '填土高度 H (m)', '挖方': '挖方深度 H (m)', '路塹': '路塹（凹槽）深度 H (m)' };
  let type = '平面';
  let last = null;

  // ---------- 道路型式選擇 ----------
  const pick = $('#typePick');
  RV.ROAD_TYPES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = t; b.setAttribute('role', 'radio'); b.dataset.type = t;
    b.addEventListener('click', () => setType(t));
    pick.appendChild(b);
  });

  function setType(t) {
    type = t;
    pick.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === t)));
    $('#typeImg').src = 'img/' + t + '.jpg';
    $('#typeCap').textContent = t;
    const plane = RV.PLANE_FAMILY.includes(t) || t === '平面高架併行';
    const elev = RV.ELEVATED.includes(t) || t === '平面高架併行';
    const par = t === '平面高架併行';
    $('#planeCard').hidden = !plane;
    $('#elevCard').hidden = !elev;
    $('#planeTitle').textContent = par ? '平面側（併行）' : '平面道路';
    $('#elevTitle').textContent = par ? '高架側（併行）' : '高架道路（' + t + '）';
    show('H', ['填方', '挖方', '路塹'].includes(t));
    show('soil', t === '平面');
    show('planePiers', par);
    show('elevPiers', par);
    if (H_LABEL[t]) $('#hLabel').firstChild.textContent = H_LABEL[t];
    update();
  }
  function show(key, on) { form.querySelectorAll(`[data-show="${key}"]`).forEach((el) => (el.hidden = !on)); }

  // ---------- 讀表單 ----------
  const val = (name) => form.elements[name].value;
  const num = (name) => { const v = val(name).trim(); return v === '' ? NaN : Number(v); };

  function readInput() {
    return {
      type,
      R: num('R'),
      soil: val('soil'),
      planePiers: Number(val('planePiers')),
      plane: { M: num('p.M'), Q1: num('p.Q1'), Q2: num('p.Q2'), V: num('p.V'), pavement: val('p.pavement'),
               sigma: num('p.sigma'), f: num('p.f'), H: num('p.H') || 0 },
      elevated: { M: num('e.M'), Q1: num('e.Q1'), Q2: num('e.Q2'), V: num('e.V'), Hp: num('e.Hp'), f: num('e.f'),
                  piers: Number(val('e.piers')) },
      background: num('background'),
      zone: val('zone'),
      period: val('period'),
      meta: { scenario: val('scenario').trim(), road: val('road').trim(), section: val('section').trim(), receiver: val('receiver').trim() },
    };
  }

  // ---------- 顯示 ----------
  function row(label, value, formula, cls) {
    return `<tr class="${cls || ''}"><td>${label}${formula ? `<span class="formula">${formula}</span>` : ''}</td><td>${value}</td></tr>`;
  }
  const group = (t) => `<tr class="group"><td colspan="2">${t}</td></tr>`;

  function sideRows(s, isPlane) {
    const k = s.k;
    let h = row('等價交通量 Q*', fmt(s.Q, 1), '(500/3600)(1/M)(Q₁+12Q₂)');
    h += row('基準值', fmt(s.base), `${k.a}·log(logQ*) + ${k.b}·logV + ${k.c}·logM + ${k.d}`);
    if (isPlane) {
      h += row('α<sub>σ</sub> 路面平坦性', sgn(s.aSigma));
      h += row('α<sub>f</sub> 地盤卓越振動數', sgn(s.aF));
      if (s.aS) h += row('α<sub>s</sub> 道路構造', sgn(s.aS));
    } else {
      h += row('α<sub>Hp</sub> 接縫高低差', sgn(s.aHp));
      h += row('α<sub>f</sub> 地盤卓越振動數', sgn(s.aF));
    }
    return h;
  }

  function update() {
    const input = readInput();
    const r = RV.calculate(input);
    last = r.ok ? { input, r } : null;
    $('#addBtn').disabled = !r.ok;
    const errBox = $('#errors');
    if (!r.ok) {
      errBox.hidden = false;
      errBox.innerHTML = '<ul>' + r.errors.map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>';
      $('#resultBody').hidden = true;
      return;
    }
    errBox.hidden = true;
    $('#resultBody').hidden = false;
    $('#lvR').textContent = fmt(r.lv10R);

    const chip = $('#verdict');
    if (r.criteria !== undefined) {
      chip.hidden = false;
      chip.className = 'chip ' + (r.pass ? 'pass' : 'fail');
      chip.textContent = (r.pass ? '符合' : '超過') + ` ${input.period}基準 ${r.criteria} dB`;
    } else chip.hidden = true;

    let h = '';
    if (r.plane) h += group(type === '平面高架併行' ? '平面側' : '基準點（距車道 5 m）') + sideRows(r.plane, true);
    if (r.elevated) h += group(type === '平面高架併行' ? '高架側' : '基準點（距車道 5 m）') + sideRows(r.elevated, false);
    if (type === '平面高架併行') {
      h += row('L′<sub>V10</sub>(併‧平)', fmt(r.plane.lv));
      h += row('L′<sub>V10</sub>(高)', fmt(r.elevated.lv));
    }
    h += row(type === '平面高架併行' ? '基準點 L<sub>V10</sub>（合成）' : '基準點 L<sub>V10</sub>', fmt(r.lv10), type === '平面高架併行' ? '10·log(10^(平/10)+10^(高/10))' : '', 'total');
    h += group('距離衰減');
    h += row('β', fmt(r.beta, 3));
    h += row('α<sub>l</sub> 衰減量', '−' + fmt(r.alphaL), `β·log(R/5+1)/log2，R = ${fmt(input.R)} m`);
    h += row('預測點 L<sub>V10,R</sub>', fmt(r.lv10R), '', 'total');
    if (Number.isFinite(r.combined)) {
      h += group('影響評估');
      h += row('背景振動量', fmt(input.background));
      h += row('合成振動量', fmt(r.combined), '10·log(10^(背景/10)+10^(預測/10))');
      h += row('振動增量', sgn(r.increment));
    }
    $('#breakdown').innerHTML = h;
  }

  // ---------- 清單 ----------
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* 無法儲存時僅保留於本頁 */ } }
  let list = load();

  function toRecord({ input, r }) {
    return {
      ...input.meta, type: input.type, R: input.R,
      lv10: r.lv10, alphaL: r.alphaL, lv10R: r.lv10R,
      combined: r.combined, increment: r.increment, criteria: r.criteria,
      verdict: r.criteria === undefined ? '' : (r.pass ? '符合' : '超過'),
      period: input.period, zone: input.zone, background: input.background,
    };
  }

  function renderList() {
    $('#count').textContent = list.length ? `（${list.length} 筆）` : '';
    $('#emptyHint').hidden = list.length > 0;
    $('#csvBtn').disabled = $('#clearBtn').disabled = list.length === 0;
    $('#listBody').innerHTML = list.map((x, i) => `<tr>
      <td>${i + 1}</td><td>${esc(x.scenario)}</td>
      <td>${esc(x.road)}${x.section ? '<br><span class="muted">' + esc(x.section) + '</span>' : ''}</td>
      <td>${esc(x.type)}</td><td>${esc(x.receiver)}</td>
      <td class="num">${fmt(x.R)}</td><td class="num">${fmt(x.lv10)}</td><td class="num">−${fmt(x.alphaL)}</td>
      <td class="num"><b>${fmt(x.lv10R)}</b></td><td class="num">${fmt(x.combined)}</td><td class="num">${fmt(x.increment)}</td>
      <td class="num">${x.criteria ?? '—'}</td><td>${esc(x.verdict)}</td>
      <td><button type="button" class="del" data-i="${i}" title="刪除" aria-label="刪除第 ${i + 1} 筆">×</button></td>
    </tr>`).join('');
  }

  $('#addBtn').addEventListener('click', () => { if (last) { list.push(toRecord(last)); save(list); renderList(); } });
  $('#listBody').addEventListener('click', (e) => {
    const b = e.target.closest('.del'); if (!b) return;
    list.splice(Number(b.dataset.i), 1); save(list); renderList();
  });
  $('#clearBtn').addEventListener('click', () => {
    if (confirm(`確定清空全部 ${list.length} 筆？`)) { list = []; save(list); renderList(); }
  });
  $('#csvBtn').addEventListener('click', () => {
    const cols = [['scenario', '模擬狀況'], ['road', '運輸道路'], ['section', '路段'], ['type', '道路型式'], ['receiver', '敏感受體'],
      ['R', '距基準點R(m)'], ['lv10', '基準點LV10'], ['alphaL', '距離衰減αl'], ['lv10R', '預測值LV10_R'],
      ['background', '背景振動量'], ['combined', '合成振動量'], ['increment', '振動增量'], ['zone', '噪音管制區'],
      ['period', '時段'], ['criteria', '評估基準'], ['verdict', '判定']];
    const cell = (v) => { const s = typeof v === 'number' ? (Number.isFinite(v) ? fmt(v) : '') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.map((c) => c[1]).join(',')].concat(list.map((x) => cols.map((c) => cell(x[c[0]])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = '道路交通振動計算清單.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  setType('平面');
  renderList();
})();
