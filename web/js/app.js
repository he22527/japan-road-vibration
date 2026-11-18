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
    const S = window.RoadVibStore, db = S.get();
    return {
      type,
      params: S.paramsMap(db),
      criteriaTable: S.criteriaMap(db),
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

  // 公式＋代入值（第二行），讓計算過程可追溯
  const n = (x) => esc(String(x));
  const sub = (formula, substituted) => `${formula}<br>= ${substituted}`;

  function fFormula(f, plane) {
    if (plane) {
      if (f >= 8) return sub('f ≥ 8：−20·log f', `−20·log ${n(f)}`);
      if (f >= 4) return 'f = 4～8：−18';
      return sub('f &lt; 4：−24 + 10·log f', `−24 + 10·log ${n(f)}`);
    }
    if (f >= 8) return sub('f ≥ 8：−5·log f', `−5·log ${n(f)}`);
    if (f >= 4) return 'f = 4～8：−4.5';
    return sub('f &lt; 4：−6 + 2.5·log f', `−6 + 2.5·log ${n(f)}`);
  }

  const S_FORMULA = { '填方': ['−1.4·H − 1.3', '−1.4'], '挖方': ['−0.87·H − 1.7', '−0.87'], '路塹': ['−4.7·H + 5.9', '−4.7'] };

  function sideRows(s, t, isPlane, sideType) {
    const k = s.k;
    let h = row('等價交通量 Q*', fmt(s.Q, 1),
      sub('(500/3600)·(1/M)·(Q₁ + 12·Q₂)', `(500/3600)·(1/${n(t.M)})·(${n(t.Q1)} + 12×${n(t.Q2)})`));
    h += row('基準值', fmt(s.base),
      sub(`${k.a}·log(log Q*) + ${k.b}·log V + ${k.c}·log M + ${k.d}`,
        `${k.a}·log(log ${fmt(s.Q, 1)}) + ${k.b}·log ${n(t.V)} + ${k.c}·log ${n(t.M)} + ${k.d}`));
    if (isPlane) {
      const c = t.pavement === '混凝土' ? 18 : 14;
      h += row('α<sub>σ</sub> 路面平坦性', sgn(s.aSigma),
        t.sigma <= 1 ? `σ = ${n(t.sigma)} ≤ 1 → 0` : sub(`${esc(t.pavement)}：${c}·log σ`, `${c}·log ${n(t.sigma)}`));
      h += row('α<sub>f</sub> 地盤卓越振動數', sgn(s.aF), fFormula(t.f, true));
      if (s.aS) {
        const [fx, a] = S_FORMULA[sideType];
        h += row('α<sub>s</sub> 道路構造', sgn(s.aS), sub(`${sideType}：${fx}`, fx.replace(/^−[\d.]+·H/, `${a}×${n(t.H)}`)));
      }
    } else {
      h += row('α<sub>Hp</sub> 接縫高低差', sgn(s.aHp), sub('0.4·log Hp', `0.4·log ${n(t.Hp)}`));
      h += row('α<sub>f</sub> 地盤卓越振動數', sgn(s.aF), fFormula(t.f, false));
    }
    return h;
  }

  const BETA_FORMULA = {
    '平面': (soil) => soil === '砂質' ? ['砂質：0.119·L<sub>V10</sub> − 3.2', '0.119'] : ['黏土：0.06·L<sub>V10</sub> − 1.6', '0.06'],
    '填方': () => ['0.077·L<sub>V10</sub> − 1.8', '0.077'],
    '挖方': () => ['0.134·L<sub>V10</sub> − 3.2', '0.134'],
    '路塹': () => ['0.058·L<sub>V10</sub> − 1.6', '0.058'],
  };
  function betaFormula(r, soil) {
    const [fx, a] = (BETA_FORMULA[type] || (() => ['0.072·L<sub>V10</sub> − 2.2', '0.072']))(soil);
    const lv = type === '平面' ? r.plane.lvPlane : r.lv10;
    return sub(fx, fx.replace(/^.*?([\d.]+)·L<sub>V10<\/sub>/, `${a}×${fmt(lv, 2)}`));
  }

  function verdictText(r, period) {
    const m = r.margin;
    const what = Number.isFinite(r.combined) ? '合成值' : '預測值';
    return `${RV.GRADE_LABEL[r.grade]} ${period}基準 ${r.criteria} dB（${what}${m >= 0 ? '餘裕' : '超出'} ${fmt(Math.abs(m))} dB）`;
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
      chip.className = 'chip ' + r.grade;
      chip.textContent = verdictText(r, input.period);
    } else chip.hidden = true;

    const par = type === '平面高架併行';
    let h = '';
    if (r.plane) h += group(par ? '平面側' : '基準點（距車道 5 m）') + sideRows(r.plane, input.plane, true, par ? '平面' : type);
    if (r.elevated) h += group(par ? '高架側' : '基準點（距車道 5 m）') + sideRows(r.elevated, input.elevated, false);
    if (type === '平面高架併行') {
      h += row('L′<sub>V10</sub>(併‧平)', fmt(r.plane.lv));
      h += row('L′<sub>V10</sub>(高)', fmt(r.elevated.lv));
    }
    h += row(type === '平面高架併行' ? '基準點 L<sub>V10</sub>（合成）' : '基準點 L<sub>V10</sub>', fmt(r.lv10), type === '平面高架併行' ? '10·log(10^(平/10)+10^(高/10))' : '', 'total');
    h += group('距離衰減');
    h += row('β 距離衰減係數', fmt(r.beta, 3), betaFormula(r, input.soil));
    h += row('α<sub>l</sub> 衰減量', '−' + fmt(r.alphaL), sub('β·log(R/5 + 1) / log 2', `${fmt(r.beta, 3)}·log(${n(input.R)}/5 + 1) / log 2`));
    h += row('預測點 L<sub>V10,R</sub>', fmt(r.lv10R), '', 'total');
    if (Number.isFinite(r.combined)) {
      h += group('影響評估');
      h += row('背景振動量', fmt(input.background));
      h += row('合成振動量', fmt(r.combined), '10·log(10^(背景/10)+10^(預測/10))');
      h += row('振動增量', sgn(r.increment));
    }
    if (r.criteria !== undefined) {
      h += group('基準判定');
      h += row(`${esc(input.zone)}管制區 ${esc(input.period)}基準`, r.criteria + ' dB');
      h += row('餘裕（基準 − 判定值）', sgn(r.margin), `餘裕 ≤ ${RV.NEAR_MARGIN} dB 標示為「接近」`, 'total');
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
      verdict: r.criteria === undefined ? '' : RV.GRADE_LABEL[r.grade],
      grade: r.grade, margin: r.margin,
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
      <td class="num">${x.criteria ?? '—'}</td><td class="num">${x.criteria === undefined ? '—' : sgn(x.margin)}</td>
      <td>${x.verdict ? `<span class="chip sm ${x.grade || (x.verdict === '符合' ? 'pass' : 'fail')}">${esc(x.verdict)}</span>` : ''}</td>
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
      ['period', '時段'], ['criteria', '評估基準'], ['margin', '餘裕(dB)'], ['verdict', '判定']];
    const cell = (v) => { const s = typeof v === 'number' ? (Number.isFinite(v) ? fmt(v) : '') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.map((c) => c[1]).join(',')].concat(list.map((x) => cols.map((c) => cell(x[c[0]])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = '道路交通振動計算清單.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------- 位置地圖（Google 地圖嵌入，免金鑰；按「定位」才載入；各分頁共用元件） ----------
  function initMapCard(card) {
    const q = card.querySelector('.map-q');
    const county = card.querySelector('.map-county');
    const district = card.querySelector('.map-district');
    if (county && window.TW_DISTRICTS) {
      for (const name of Object.keys(window.TW_DISTRICTS)) county.add(new Option(name, name));
      county.addEventListener('change', () => {
        district.length = 1; // 保留「區鄉鎮」預設項
        for (const d of window.TW_DISTRICTS[county.value] || []) district.add(new Option(d, d));
        if (card.querySelector('.map-frame iframe')) locate();
      });
      district.addEventListener('change', () => { if (card.querySelector('.map-frame iframe')) locate(); });
    }
    const mapQuery = () => [county && county.value, district && district.value, q.value.trim()].filter(Boolean).join('');
    function locate() {
      const text = mapQuery();
      if (!text) { q.focus(); return; }
      const t = card.querySelector('.map-t').value;
      let frame = card.querySelector('.map-frame iframe');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.title = 'Google 地圖';
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer-when-downgrade';
        card.querySelector('.map-empty').hidden = true;
        card.querySelector('.map-frame').appendChild(frame);
      }
      frame.src = `https://maps.google.com/maps?q=${encodeURIComponent(text)}&t=${t}&z=16&hl=zh-TW&output=embed`;
      frame.hidden = !!(measureCtl && measureCtl.active);
      const open = card.querySelector('.map-open');
      open.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
      open.hidden = false;
      if (measureCtl && measureCtl.active) measureCtl.goto(text);
    }
    card.querySelector('.map-go').addEventListener('click', locate);
    card.querySelector('.map-t').addEventListener('change', () => {
      if (measureCtl) measureCtl.setLayer();
      if (card.querySelector('.map-frame iframe')) locate();
    });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); locate(); } });
    const fromRoad = card.querySelector('.map-from-road');
    if (fromRoad) fromRoad.addEventListener('click', () => {
      const text = [val('road'), val('section')].map((s) => s.trim()).filter(Boolean).join(' ');
      if (!text) { form.elements.road.focus(); return; }
      q.value = text;
      locate();
    });

    // ---------- 量距離（Google 嵌入地圖不支援量測，改以 Leaflet＋OSM／Esri 衛星圖量測，免金鑰） ----------
    const measureBtn = card.querySelector('.map-measure');
    let measureCtl = null;
    function initMeasure() {
      const frameBox = card.querySelector('.map-frame');
      const bar = document.createElement('div');
      bar.className = 'map-measure-bar';
      bar.innerHTML = '<span class="map-dist"></span>'
        + '<button type="button" class="m-undo">復原</button>'
        + '<button type="button" class="m-clear">清除</button>';
      frameBox.before(bar);
      const div = document.createElement('div');
      div.className = 'map-lmap';
      frameBox.appendChild(div);
      const map = L.map(div, { doubleClickZoom: false }).setView([23.97, 120.98], 8);
      const layers = {
        m: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者' }),
        k: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }),
      };
      let curLayer = null;
      function setLayer() {
        const want = layers[card.querySelector('.map-t').value] || layers.m;
        if (curLayer === want) return;
        if (curLayer) map.removeLayer(curLayer);
        curLayer = want.addTo(map);
      }
      setLayer();
      L.control.scale({ imperial: false }).addTo(map);
      const pts = [];
      const dots = [];
      const line = L.polyline([], { color: '#d3303f', weight: 3 }).addTo(map);
      const dist = bar.querySelector('.map-dist');
      const fmt = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} 公里` : `${m >= 100 ? Math.round(m) : m.toFixed(1)} 公尺`);
      function refresh() {
        line.setLatLngs(pts);
        if (!pts.length) { dist.textContent = '在地圖上點選各點開始量測'; return; }
        if (pts.length === 1) { dist.textContent = '已選起點，再點下一點'; return; }
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
        const last = pts[pts.length - 2].distanceTo(pts[pts.length - 1]);
        dist.textContent = pts.length === 2
          ? `距離 ${fmt(total)}`
          : `總長 ${fmt(total)}（${pts.length} 點，最後一段 ${fmt(last)}）`;
      }
      map.on('click', (e) => {
        pts.push(e.latlng);
        dots.push(L.circleMarker(e.latlng, { radius: 5, color: '#d3303f', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map));
        refresh();
      });
      bar.querySelector('.m-undo').addEventListener('click', () => {
        pts.pop();
        const d = dots.pop();
        if (d) map.removeLayer(d);
        refresh();
      });
      bar.querySelector('.m-clear').addEventListener('click', () => {
        pts.length = 0;
        while (dots.length) map.removeLayer(dots.pop());
        refresh();
      });
      async function gotoText(text) {
        if (!text) return;
        dist.textContent = '定位中…';
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=zh-TW&q=${encodeURIComponent(text)}`);
          const j = await r.json();
          if (j && j[0]) { map.setView([+j[0].lat, +j[0].lon], 16); refresh(); }
          else dist.textContent = `找不到「${text}」，請拖曳、縮放地圖後直接點選`;
        } catch { dist.textContent = '定位失敗（量測地圖需要網路），可直接拖曳地圖'; }
      }
      refresh();
      measureCtl = {
        active: false,
        setLayer,
        goto: gotoText,
        located: false,
        start() {
          this.active = true;
          bar.hidden = false;
          div.hidden = false;
          const iframeEl = frameBox.querySelector('iframe');
          if (iframeEl) iframeEl.hidden = true;
          card.querySelector('.map-empty').hidden = true;
          measureBtn.textContent = '結束量測';
          map.invalidateSize();
          const text = mapQuery();
          if (text && !this.located) { this.located = true; gotoText(text); }
        },
        stop() {
          this.active = false;
          bar.hidden = true;
          div.hidden = true;
          measureBtn.textContent = '量距離';
          const iframeEl = frameBox.querySelector('iframe');
          if (iframeEl) iframeEl.hidden = false;
          else card.querySelector('.map-empty').hidden = false;
        },
      };
    }
    if (measureBtn) measureBtn.addEventListener('click', () => {
      if (!window.L) { alert('量測元件載入中或無法載入（需要網路連線），請稍後再試。'); return; }
      if (!measureCtl) initMeasure();
      if (measureCtl.active) measureCtl.stop(); else measureCtl.start();
    });
  }
  document.querySelectorAll('.map-card').forEach(initMapCard);
  form.addEventListener('submit', (e) => e.preventDefault());

  /** 橋腳數選單的 d 值跟著模式參數 */
  function pierLabels() {
    const P = window.RoadVibStore.paramsMap(window.RoadVibStore.get());
    ['planePiers', 'e.piers'].forEach((n) => {
      const o = form.elements[n].options;
      o[0].text = `1（d = ${RV.paramsFor('單柱高架', P).d}）`;
      o[1].text = `2 以上（d = ${RV.paramsFor('雙柱高架', P).d}）`;
    });
  }
  pierLabels();
  window.addEventListener('roadvib:store', () => { pierLabels(); update(); }); // 評估基準、模式參數改了要重算
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  setType('平面');
  renderList();
})();
