/* 批次計算／報表介面 */
(function () {
  'use strict';
  const B = window.RoadVibBatch, Rp = window.RoadVibReport, S = window.RoadVibStore;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'roadvib.batch.v1';
  const TABLE_KEYS = ['now', 'construction', 'operation'];

  // ---------- 分頁 ----------
  const TAB_KEY = 'roadvib.tab';
  function showView(id) {
    document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === id)));
    ['inputView', 'singleView', 'settingsView'].forEach((v) => { $('#' + v).hidden = v !== id; });
    try { localStorage.setItem(TAB_KEY, id); } catch (e) { /* 略 */ }
  }
  document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  try { const v = localStorage.getItem(TAB_KEY); if (v === 'settingsView' || v === 'inputView') showView(v); } catch (e) { /* 略 */ }

  // ---------- 狀態（道路與受體來自共用資料庫 store.js；這裡只存配對、勾選、設定、表註） ----------
  let state = { pairs: {}, combos: [], options: { fPlane: 6, fElev: 6, soil: '黏土', correction: true }, notes: {} };
  let groups = [], sources = [], result = null;
  let data = null; // 由共用資料庫轉出

  function save() {
    try { const { pairs, combos, options, notes } = state; localStorage.setItem(KEY, JSON.stringify({ pairs, combos, options, notes })); } catch (e) { /* 容量不足等：僅保留於本頁 */ }
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) { delete s.data; delete s.fileName; state = Object.assign(state, s); } } catch (e) { /* 略 */ }
  }

  const comboKey = (sid, rec) => sid + '||' + rec;
  const comboSet = () => new Set(state.combos.map((c) => comboKey(c.sourceId, c.receiver)));

  // ---------- 匯入 ----------
  $('#xlsFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = $('#importMsg');
    $('#importStatus').textContent = '讀取中…';
    try {
      const found = await window.RoadVibImport(file); // 共用匯入（依名稱／表頭辨識，只取代檔案裡有的表）
      if (!found) { refresh(); return; } // 使用者取消
      if (found.includes('道路')) { state.pairs = {}; state.combos = []; } // 道路重匯：配對與勾選重來
      msg.hidden = true;
      refresh();
    } catch (err) {
      $('#importStatus').textContent = '';
      msg.hidden = false; msg.className = 'notice warn';
      msg.textContent = '匯入失敗：' + err.message;
    }
    e.target.value = '';
  });

  // ---------- 設定 ----------
  const optEls = { fPlane: '#optFPlane', fElev: '#optFElev', soil: '#optSoil', correction: '#optCorr' };
  function readOptions() {
    state.options = {
      fPlane: Number($('#optFPlane').value) || 6,
      fElev: Number($('#optFElev').value) || 6,
      soil: $('#optSoil').value,
      correction: $('#optCorr').checked,
    };
  }
  Object.values(optEls).forEach((s) => $(s).addEventListener('change', () => { readOptions(); save(); compute(); }));

  // ---------- 配對表 ----------
  function renderPairs() {
    const recs = data.receivers;
    const set = comboSet();
    const planes = groups.filter((g) => g.side === 'plane');
    const elevs = groups.filter((g) => g.side === 'elevated');
    let h = '<thead><tr><th class="src">道路</th>' +
      recs.map((r) => `<th>${esc(r.name)}<small>R=${Number.isFinite(r.R) ? r.R : '—'} m</small></th>`).join('') + '</tr></thead><tbody>';
    for (const s of sources) {
      let extra = '';
      if (s.kind === 'parallel' || s.kind === 'planeOnly') {
        const cur = state.pairs[s.id] || '';
        extra = `<br><span class="muted">併行夥伴（高架側）</span><select data-plane="${esc(s.id)}"><option value="">不配對（僅算平面）</option>` +
          elevs.map((e) => `<option value="${esc(e.key)}" ${e.key === cur ? 'selected' : ''}>${esc(e.name)}</option>`).join('') + '</select>';
      } else if (s.kind === 'elevOnly') {
        extra = `<br><span class="muted">併行夥伴（平面側）</span><select data-elev="${esc(s.id)}"><option value="">不配對（僅算高架）</option>` +
          planes.filter((p) => !state.pairs[p.key]).map((p) => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('') + '</select>';
      }
      const label = s.kind === 'single' ? s.group.type : s.kind === 'parallel' ? '平面高架併行' : s.kind === 'planeOnly' ? '併行（僅平面）' : '併行（僅高架）';
      const name = s.kind === 'parallel' ? s.plane.name : s.name;
      h += `<tr><th class="src">${esc(name)}<span class="badge">${esc(label)}</span>${extra}</th>` +
        recs.map((r) => `<td><input type="checkbox" data-sid="${esc(s.id)}" data-rec="${esc(r.name)}" ${set.has(comboKey(s.id, r.name)) ? 'checked' : ''} aria-label="${esc(name)} × ${esc(r.name)}"></td>`).join('') + '</tr>';
    }
    $('#pairTable').innerHTML = h + '</tbody>';
  }

  $('#pairTable').addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type=checkbox]')) {
      const k = comboKey(t.dataset.sid, t.dataset.rec);
      state.combos = state.combos.filter((c) => comboKey(c.sourceId, c.receiver) !== k);
      if (t.checked) state.combos.push({ sourceId: t.dataset.sid, receiver: t.dataset.rec });
    } else if (t.dataset.plane !== undefined) {
      const plane = t.dataset.plane;
      // 一個高架側只能配一個平面側：先解除它和其他平面側的配對
      if (t.value) Object.keys(state.pairs).forEach((p) => { if (state.pairs[p] === t.value && p !== plane) state.pairs[p] = ''; });
      // 空字串＝使用者刻意不配對（重新整理時不再自動建議）
      if (t.value) { state.pairs[plane] = t.value; migrate(t.value, plane); } else state.pairs[plane] = '';
    } else if (t.dataset.elev !== undefined) {
      if (t.value) { state.pairs[t.value] = t.dataset.elev; migrate(t.dataset.elev, t.value); }
    }
    save();
    refresh();
  });

  function migrate(fromId, toId) {
    const seen = new Set();
    state.combos = state.combos.map((c) => (c.sourceId === fromId ? { ...c, sourceId: toId } : c))
      .filter((c) => { const k = comboKey(c.sourceId, c.receiver); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  $('#clearPairs').addEventListener('click', () => { state.combos = []; save(); refresh(); });

  // ---------- 結果 ----------
  const notesFor = (k) => state.notes[k] || Rp.DEFAULT_NOTES[k];

  function compute() {
    if (!data) return;
    result = B.computeBatch(data, sources, state.combos, Object.assign({}, state.options, { params: S.paramsMap(S.get()) }));
    const tables = Rp.buildTables(result, { correction: state.options.correction, notes: { now: notesFor('now'), construction: notesFor('construction'), operation: notesFor('operation') } });
    const iss = $('#issues');
    iss.hidden = !result.issues.length;
    iss.className = 'notice warn';
    iss.innerHTML = result.issues.length ? '部分組合無法計算：<ul>' + result.issues.map((s) => `<li>${esc(s)}</li>`).join('') + '</ul>' : '';
    if (!state.combos.length) {
      $('#reportTables').innerHTML = '<p class="muted">在上方配對表勾選道路與敏感受體後，這裡會產生摘要表。</p>';
      $('#docxBtn').disabled = $('#batchCsvBtn').disabled = true;
      return;
    }
    $('#docxBtn').disabled = $('#batchCsvBtn').disabled = false;
    $('#reportTables').innerHTML = TABLE_KEYS.map((k) => {
      const t = tables[k];
      const critIdx = t.headers.length - 1;
      const cmpIdx = k === 'now' ? 4 : k === 'construction' ? 5 : 6; // 與基準比較的欄位
      const rows = t.rows.map((r) => '<tr>' + r.map((v, j) => {
        const over = j === cmpIdx && Number(v) > Number(r[critIdx]);
        return `<td${over ? ' class="over"' : ''}>${esc(v)}</td>`;
      }).join('') + '</tr>').join('');
      return `<div class="report"><h3>${esc(t.title)}</h3><span class="unit muted">${esc(Rp.UNIT)}</span>
        <div class="table-wrap"><table class="rep-table"><thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${t.headers.length}" class="muted">無資料</td></tr>`}</tbody></table></div>
        <label class="note-label" for="note-${k}">表註（每行一條，匯出 Word 時使用）</label>
        <textarea id="note-${k}" data-note="${k}" rows="${Math.max(2, t.notes.length)}">${esc(notesFor(k).join('\n'))}</textarea></div>`;
    }).join('');
  }

  $('#reportTables').addEventListener('change', (e) => {
    const k = e.target.dataset.note;
    if (!k) return;
    state.notes[k] = e.target.value.split('\n');
    save();
  });

  function currentTables() {
    return Rp.buildTables(result, { correction: state.options.correction, notes: { now: notesFor('now'), construction: notesFor('construction'), operation: notesFor('operation') } });
  }
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`; };
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('#docxBtn').addEventListener('click', async () => {
    const sel = [...document.querySelectorAll('.docSel:checked')].map((x) => x.value);
    if (!sel.length) { alert('請至少勾選一張表'); return; }
    const T = currentTables();
    const blob = await Rp.buildDocx(window.JSZip, sel.map((k) => T[k]));
    download(blob, `道路交通振動評估摘要表 ${stamp()}.docx`);
  });

  $('#batchCsvBtn').addEventListener('click', () => {
    const T = currentTables();
    const cell = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    const lines = [];
    TABLE_KEYS.forEach((k) => {
      const t = T[k];
      lines.push(t.title, t.headers.map((h) => cell(h.replace('\n', ''))).join(','));
      t.rows.forEach((r) => lines.push(r.map(cell).join(',')));
      lines.push('');
    });
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `道路交通振動評估摘要表 ${stamp()}.csv`);
  });

  // ---------- 整體刷新 ----------
  function refresh() {
    const db = S.get();
    data = B.fromAoa(S.toBatchAoa(db));
    const has = data.roads.length > 0;
    ['#settingsCard', '#pairCard', '#resultCard'].forEach((s) => { $(s).hidden = !has; });
    if (!has) {
      data = null;
      $('#importStatus').textContent = '尚無道路資料：請匯入 Excel／CSV，或到「基本輸入 › 運輸道路」新增。';
      return;
    }
    groups = B.groupRoads(data.roads);
    // 新出現的併行平面側自動建議夥伴；已不存在的配對移除
    const keys = new Set(groups.map((g) => g.key));
    Object.keys(state.pairs).forEach((p) => { if (!keys.has(p) || (state.pairs[p] && !keys.has(state.pairs[p]))) delete state.pairs[p]; });
    const sug = B.suggestPairs(groups);
    Object.keys(sug).forEach((p) => { if (!(p in state.pairs) && !Object.values(state.pairs).includes(sug[p])) state.pairs[p] = sug[p]; });
    sources = B.buildSources(groups, state.pairs);
    const validIds = new Set(sources.map((s) => s.id));
    const recNames = new Set(data.receivers.map((r) => r.name));
    state.combos = state.combos.filter((c) => validIds.has(c.sourceId) && recNames.has(c.receiver));
    // 「道路」表列號 = 資料列序 + 2
    $('#importStatus').textContent = `${db.source || '自建資料'}：道路 ${data.roads.length} 筆（${groups.length} 條）、敏感受體 ${data.receivers.length} 個` +
      (data.skipped && data.skipped.length ? `；略過道路型式無效的第 ${data.skipped.map((r) => r - 1).join('、')} 列` : '');
    save();
    renderPairs();
    compute();
  }
  window.addEventListener('roadvib:store', refresh);

  load();
  $('#optFPlane').value = state.options.fPlane;
  $('#optFElev').value = state.options.fElev;
  $('#optSoil').value = state.options.soil;
  $('#optCorr').checked = state.options.correction;
  refresh();
})();
