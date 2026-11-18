/* 單筆計算左側分頁：敏感受體／運輸道路／振動測點／設定，與計算頁的「帶入」選單 */
(function () {
  'use strict';
  const S = window.RoadVibStore, RV = window.RoadVib;
  const $ = (s) => document.querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const db = () => S.get();
  const fmtCell = (v) => (v === null || v === undefined ? '' : v);
  const ME = 'data-ui';

  // ---------- 左側分頁（基本輸入與計算兩個 workspace，各自記住目前頁） ----------
  const PAGE_KEY = 'roadvib.page';
  function showPage(id) {
    const page = document.getElementById(id);
    const ws = page && page.closest('.workspace');
    if (!ws) return;
    ws.querySelectorAll('.side-nav [data-page]').forEach((b) => (b.dataset.page === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    [...ws.children].forEach((p) => { if (p.classList.contains('page')) p.hidden = p.id !== id; });
    try { localStorage.setItem(PAGE_KEY + '.' + ws.id, id); } catch (e) { /* 略 */ }
    render(id);
  }
  $$('.side-nav [data-page]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));

  // ---------- 欄位型別 → 儲存格 ----------
  const OPTIONS = {
    type: () => [''].concat(RV.ROAD_TYPES),
    pavement: () => ['', '瀝青', '混凝土'],
    zone: () => [''].concat(db().criteria.map((c) => c.zone)),
    point: () => [''].concat(db().points.map((p) => p.id)),
  };
  const WIDE = new Set(['road', 'section', 'name', 'scenario']);

  function cell(table, i, k, t, v) {
    const a = `data-t="${table}" data-i="${i}" data-k="${k}"`;
    if (OPTIONS[t]) {
      const opts = OPTIONS[t]();
      if (v && !opts.includes(v)) opts.push(v); // 保留清單外的既有值
      const label = (o) => o || '—';
      return `<td><select ${a}>${opts.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(label(o))}</option>`).join('')}</select></td>`;
    }
    if (t === 'num') return `<td class="num"><input type="number" step="any" ${a} value="${esc(fmtCell(v))}"></td>`;
    return `<td${WIDE.has(k) ? ' class="wide"' : ''}><input type="text" ${a} value="${esc(fmtCell(v))}"></td>`;
  }
  const ro = (k, v) => `<td class="ro num" data-ro="${k}">${esc(fmtCell(v))}</td>`;
  const delBtn = (table, i) => `<td><button type="button" class="del" data-del="${table}" data-i="${i}" title="刪除此列" aria-label="刪除第 ${i + 1} 列">×</button></td>`;

  // ---------- 三張資料表 ----------
  const TABLES = {
    receivers: {
      el: '#recTable', cols: S.RECEIVER_COLS,
      // 查表欄插在指定欄位之後
      after: { zone: [['vzone', '振動管制區'], ['day', '日間評估基準'], ['night', '夜間評估基準']], point: [['pointName', '參考測點名稱']] },
      resolve: (r) => S.resolveReceiver(db(), r),
    },
    roads: { el: '#roadTable', cols: S.ROAD_COLS },
    points: { el: '#pointTable', cols: S.POINT_COLS },
  };

  function renderTable(key) {
    const T = TABLES[key], rows = db()[key];
    let head = '<th>#</th>';
    T.cols.forEach(([k, label]) => {
      head += `<th>${esc(label)}</th>`;
      (T.after && T.after[k] || []).forEach(([, l]) => { head += `<th class="ro-h">${esc(l)}</th>`; });
    });
    head += '<th></th>';
    const body = rows.map((r, i) => {
      const x = T.resolve ? T.resolve(r) : {};
      let h = `<td class="idx">${i + 1}</td>`;
      T.cols.forEach(([k, , t]) => {
        h += cell(key, i, k, t, r[k]);
        (T.after && T.after[k] || []).forEach(([rk]) => { h += ro(rk, x[rk]); });
      });
      return `<tr data-i="${i}">${h}${delBtn(key, i)}</tr>`;
    }).join('');
    $(T.el).innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="99" class="muted empty-row">尚無資料。按「新增一列」或「匯入 Excel／CSV」。</td></tr>`}</tbody>`;
    if (key === 'roads') applyFilter();
  }

  /** 只更新某列的查表欄，避免重繪使游標跳走 */
  function refreshRow(key, i) {
    const T = TABLES[key], tr = $(`${T.el} tr[data-i="${i}"]`), r = db()[key][i];
    if (!tr) return;
    if (T.resolve) { const x = T.resolve(r); $$('[data-ro]', tr).forEach((td) => { td.textContent = fmtCell(x[td.dataset.ro]); }); }
    $$('input[data-k]', tr).forEach((inp) => { if (document.activeElement !== inp) inp.value = fmtCell(r[inp.dataset.k]); });
  }

  function parse(t, raw) {
    if (t === 'num') { const s = String(raw).trim(); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; }
    return String(raw).trim();
  }
  const colType = (cols, k) => (cols.find((c) => c[0] === k) || [])[2];

  function onCellChange(e) {
    const el = e.target, key = el.dataset.t;
    if (!key || el.dataset.i === undefined) return;
    const i = Number(el.dataset.i), k = el.dataset.k;
    const cols = TABLES[key] ? TABLES[key].cols : SET_COLS[key];
    const row = db()[key][i];
    row[k] = parse(colType(cols, k), el.value);
    if (key === 'receivers' && k === 'point') S.applyPoint(db(), row);
    if (key === 'roads' && ['car', 'van', 'bus', 'truck', 'special'].includes(k)) Object.assign(row, S.sumVehicles(row));
    if (TABLES[key]) refreshRow(key, i);
    S.commit(ME);
  }

  function addRow(key, prefill) {
    const rows = db()[key];
    const r = S.blankRow(TABLES[key].cols);
    if (key === 'roads' && rows.length) { // 沿用最後一個有效道路列的設定，方便連續輸入不同模擬狀況
      const last = [...rows].reverse().find((x) => RV.ROAD_TYPES.includes(x.type)) || rows[rows.length - 1];
      ['road', 'section', 'width', 'type', 'H', 'piers', 'pavement', 'flat', 'M'].forEach((k) => { r[k] = last[k]; });
      r.road = String(last.road || '').replace(/_[^_]*$/, '');
    }
    if (prefill) Object.assign(r, prefill);
    rows.push(r);
    S.commit(ME);
    renderTable(key);
    const first = $(`${TABLES[key].el} tr[data-i="${rows.length - 1}"] input, ${TABLES[key].el} tr[data-i="${rows.length - 1}"] select`);
    if (first) { first.focus(); first.scrollIntoView({ block: 'nearest' }); }
  }

  ['#recTable', '#roadTable', '#pointTable', '#critTable', '#paramTable'].forEach((s) => $(s).addEventListener('change', onCellChange));
  ['#recTable', '#roadTable', '#pointTable'].forEach((s) => $(s).addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    db()[b.dataset.del].splice(Number(b.dataset.i), 1);
    S.commit(ME);
    renderTable(b.dataset.del);
  }));
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => addRow(b.dataset.add)));
  // 地圖卡「新增為…」：以搜尋的地點開一列新資料，並順便定位
  $$('.map-add').forEach((b) => b.addEventListener('click', () => {
    const card = b.closest('.map-card');
    const q = card.querySelector('.map-q');
    const text = q.value.trim();
    if (!text) { q.focus(); return; }
    card.querySelector('.map-go').click();
    const key = b.dataset.addFromMap;
    const district = card.querySelector('.map-district');
    const name = ((district && district.value) || '') + text; // 受體／測點名稱帶上區鄉鎮
    const prefill = key === 'roads' ? { road: text } : { name };
    const measured = Number(card.dataset.measureM); // 地圖量到的距離（公尺），由 app.js 量測模式寫入
    if (key === 'receivers' && Number.isFinite(measured)) prefill.R = measured;
    addRow(key, prefill);
  }));
  $$('[data-clear]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.clear, n = db()[k].length;
    if (!n || !confirm(`確定清空全部 ${n} 列？`)) return;
    db()[k] = [];
    S.commit(ME);
    renderTable(k);
  }));

  // 運輸道路篩選
  function applyFilter() {
    const q = $('#roadFilter').value.trim().toLowerCase();
    $$('#roadTable tbody tr[data-i]').forEach((tr) => {
      const r = db().roads[Number(tr.dataset.i)];
      tr.hidden = !!q && ![r.scenario, r.road, r.section, r.type].join(' ').toLowerCase().includes(q);
    });
  }
  $('#roadFilter').addEventListener('input', applyFilter);

  // ---------- 設定 ----------
  const SET_COLS = {
    criteria: [['zone', '噪音管制區', 'fixed'], ['vzone', '振動管制區', 'text'], ['day', '日間評估基準 (dB)', 'num'], ['night', '夜間評估基準 (dB)', 'num']],
    params: [['type', '路型', 'fixed'], ['a', 'a 常數', 'num'], ['b', 'b 常數', 'num'], ['c', 'c 常數', 'num'], ['d', 'd 常數', 'num']],
  };
  function renderSettings() {
    [['criteria', '#critTable'], ['params', '#paramTable']].forEach(([key, el]) => {
      const cols = SET_COLS[key];
      const head = cols.map(([, l]) => `<th>${esc(l)}</th>`).join('');
      const body = db()[key].map((r, i) => '<tr>' + cols.map(([k, , t]) => (t === 'fixed'
        ? `<td class="fixed">${esc(r[k])}</td>`
        : cell(key, i, k, t, r[k]))).join('') + '</tr>').join('');
      $(el).innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    });
    markChanged();
  }
  /** 與預設不同的參數加註記 */
  function markChanged() {
    $$('#paramTable tbody tr').forEach((tr, i) => {
      const p = db().params[i], d = RV.DEFAULT_PARAMS[p.type];
      ['a', 'b', 'c', 'd'].forEach((k) => {
        const inp = $(`input[data-k="${k}"]`, tr);
        if (inp) inp.classList.toggle('changed', p[k] !== d[k]);
      });
    });
  }
  $$('[data-reset]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.reset;
    if (!confirm(k === 'criteria' ? '評估基準還原為預設值？' : '模式參數還原為預設值？')) return;
    db()[k] = k === 'criteria' ? S.defaultCriteria() : S.defaultParams();
    S.commit(ME);
    renderSettings();
  }));

  // ---------- 匯入 Excel／CSV（各分頁與批次共用；只取代檔案裡有的表） ----------
  const SHEET_KEY = { '道路': 'roads', '敏感受體': 'receivers', '量測點': 'points', '評估基準': 'criteria', '模式參數': 'params' };
  const SHEET_LABEL = { roads: '運輸道路', receivers: '敏感受體', points: '振動測點' };

  async function readWorkbook(file) {
    if (/\.csv$/i.test(file.name)) {
      // Excel 存的 CSV 在中文 Windows 常是 Big5：先試 UTF-8，不合法再用 Big5 解
      const buf = new Uint8Array(await file.arrayBuffer());
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch (e) { text = new TextDecoder('big5').decode(buf); }
      return window.XLSX.read(text.replace(/^﻿/, ''), { type: 'string' });
    }
    return window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  }

  async function importFile(file) {
    const wb = await readWorkbook(file);
    const { db: next, found } = S.fromWorkbook(window.XLSX, wb);
    if (!found.length) throw new Error('找不到「敏感受體」「道路」「量測點」「評估基準」「模式參數」任一工作表（CSV 需有對應的表頭）');
    const cur = db();
    const keys = found.map((n) => SHEET_KEY[n]);
    const busy = keys.filter((k) => SHEET_LABEL[k] && cur[k].length);
    if (busy.length && !confirm(`匯入會取代目前的 ${busy.map((k) => `${SHEET_LABEL[k]} ${cur[k].length} 筆`).join('、')}，確定？`)) return null;
    keys.forEach((k) => { cur[k] = next[k]; });
    // 只匯受體時，受體表帶出的參考測點補進現有測點
    if (!keys.includes('points') && next.points.length) {
      next.points.forEach((p) => { if (!cur.points.some((x) => x.id === p.id)) cur.points.push(p); });
    }
    cur.source = file.name;
    S.replace(cur, ME);
    return found;
  }
  window.RoadVibImport = importFile;

  function showMsg(text, warn) {
    const m = $('#storeMsg');
    m.hidden = false; m.className = 'notice' + (warn ? ' warn' : ''); m.textContent = text;
  }
  $$('.xls-import').forEach((inp) => inp.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const found = await importFile(file);
      if (found) showMsg(`已匯入 ${file.name}：${found.join('、')}`);
    } catch (err) {
      showMsg('匯入失敗：' + err.message, true);
      if ($('#settingsView').hidden) alert('匯入失敗：' + err.message);
    }
  }));

  // ---------- 計算頁：帶入選單 ----------
  const form = $('#form');
  const setVal = (name, v) => { const el = form.elements[name]; if (el && v !== null && v !== undefined && v !== '') el.value = v; };
  const baseName = (r) => {
    const n = String(r.road || '').trim();
    return r.scenario && n.endsWith('_' + r.scenario) ? n.slice(0, -(r.scenario.length + 1)) : n;
  };
  const sideOf = (r) => (r.type === '平面高架併行' ? (r.piers >= 1 ? '高架側' : '平面側') : '');

  function renderPickers() {
    const d = db();
    const groups = new Map();
    d.roads.forEach((r, i) => {
      if (!RV.ROAD_TYPES.includes(r.type)) return;
      const g = baseName(r) || '（未命名道路）';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(`<option value="${i}">${esc(r.scenario || '（未填模擬狀況）')}　${esc(r.type)}${sideOf(r) ? '・' + sideOf(r) : ''}</option>`);
    });
    const curRoad = $('#pickRoad').value;
    $('#pickRoad').innerHTML = '<option value="">（手動輸入）</option>' +
      [...groups].map(([g, opts]) => `<optgroup label="${esc(g)}">${opts.join('')}</optgroup>`).join('');
    if (curRoad && d.roads[curRoad]) $('#pickRoad').value = curRoad;
    $('#pickRoad').disabled = !groups.size;

    const curRec = $('#pickRec').value;
    $('#pickRec').innerHTML = '<option value="">（手動輸入）</option>' +
      d.receivers.map((r, i) => `<option value="${i}">${esc(r.name)}${Number.isFinite(r.R) ? `（R = ${r.R} m）` : ''}</option>`).join('');
    if (curRec && d.receivers[curRec]) $('#pickRec').value = curRec;
    $('#pickRec').disabled = !d.receivers.length;
  }

  function fillRoad(r) {
    const par = r.type === '平面高架併行';
    const target = par ? '平面高架併行' : r.type;
    const btn = $(`#typePick [data-type="${target}"]`);
    if (btn && btn.getAttribute('aria-checked') !== 'true') btn.click();
    setVal('scenario', r.scenario);
    setVal('road', baseName(r).split(/[（(]/)[0].trim() || baseName(r));
    setVal('section', r.section);
    const V = S.roadSpeed(r);
    const elevSide = RV.ELEVATED.includes(r.type) || (par && r.piers >= 1);
    if (elevSide) {
      setVal('e.M', r.M); setVal('e.Q1', r.small); setVal('e.Q2', r.large); setVal('e.V', V); setVal('e.Hp', r.flat);
      if (par) { const p = r.piers >= 2 ? '2' : '1'; setVal('e.piers', p); setVal('planePiers', p); }
    } else {
      setVal('p.M', r.M); setVal('p.Q1', r.small); setVal('p.Q2', r.large); setVal('p.V', V); setVal('p.sigma', r.flat);
      setVal('p.pavement', r.pavement); setVal('p.H', r.H ?? 0);
    }
    form.dispatchEvent(new Event('input'));
  }

  function fillReceiver(r) {
    setVal('receiver', r.name);
    setVal('R', r.R);
    if (db().criteria.some((c) => c.zone === r.zone)) form.elements.zone.value = r.zone;
    fillBackground(r);
    form.dispatchEvent(new Event('input'));
  }
  function fillBackground(r) {
    const bg = form.elements.period.value === '夜間' ? r.bgNight : r.bgDay;
    form.elements.background.value = Number.isFinite(bg) && bg > 0 ? bg : '';
  }

  $('#pickRoad').addEventListener('change', (e) => { const r = db().roads[e.target.value]; if (r) fillRoad(r); });
  $('#pickRec').addEventListener('change', (e) => { const r = db().receivers[e.target.value]; if (r) fillReceiver(r); });
  // 切換時段時，若有選受體就改帶該時段背景值
  form.elements.period.addEventListener('change', () => {
    const r = db().receivers[$('#pickRec').value];
    if (r) { fillBackground(r); form.dispatchEvent(new Event('input')); }
  });

  // ---------- 整體 ----------
  function counts() {
    $$('.side-nav [data-cnt]').forEach((s) => { const n = db()[s.dataset.cnt].length; s.textContent = n ? n : ''; });
    $('#storeStatus').textContent = db().source ? `目前資料來源：${db().source}` : '';
  }
  function render(id) {
    if (id === 'recPage') renderTable('receivers');
    else if (id === 'roadPage') renderTable('roads');
    else if (id === 'pointPage') renderTable('points');
  }
  window.addEventListener('roadvib:store', (e) => {
    counts();
    renderPickers();
    if (e.detail && e.detail.from === ME) { markChanged(); return; }
    renderSettings();
    ['recPage', 'roadPage', 'pointPage'].forEach((id) => { if (!$('#' + id).hidden) render(id); });
  });

  counts();
  renderPickers();
  renderSettings();
  const settingsTab = document.querySelector('.tabs [data-view="settingsView"]');
  if (settingsTab) settingsTab.addEventListener('click', renderSettings);
  [['inputView', 'recPage'], ['singleView', 'calcPage']].forEach(([ws, dflt]) => {
    let start = dflt;
    try { start = localStorage.getItem(PAGE_KEY + '.' + ws) || dflt; } catch (e) { /* 略 */ }
    const el = $('#' + start);
    showPage(el && el.closest('.workspace') && el.closest('.workspace').id === ws ? start : dflt);
  });
})();
