/* 「檔案」分頁：專案檔（.json）的新增／開啟／儲存／另存新檔。
 * 專案檔含基本資料（敏感受體／道路／測點／評估基準／模式參數）、單筆計算清單與批次設定；
 * 開啟另支援 Excel／CSV（只讀入基本資料）。開啟／另存的檔案代號存 IndexedDB，重新載入後仍可直接「儲存」。 */
(function () {
  'use strict';
  const S = window.RoadVibStore;
  const $ = (s) => document.querySelector(s);
  const ME = 'file-ui';
  const hasFS = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  const KEYS = { store: 'roadvib.store.v1', list: 'roadvib.list.v1', batch: 'roadvib.batch.v1' };
  const MSG_KEY = 'roadvib.file.msg';
  let handle = null; // File System Access API 的專案檔代號（.json）

  // ---------- IndexedDB：讓檔案代號在重新載入後還在 ----------
  const idb = {
    open: () => new Promise((res, rej) => {
      const q = indexedDB.open('roadvib-file', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('h');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    }),
    async set(v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(v, 'project'); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async get() { try { const d = await this.open(); return await new Promise((res) => { const q = d.transaction('h').objectStore('h').get('project'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } },
    async del() { try { const d = await this.open(); d.transaction('h', 'readwrite').objectStore('h').delete('project'); } catch (e) { /* 略 */ } },
  };

  const parse = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const TOTAL = () => {
    const d = S.get();
    return `敏感受體 ${d.receivers.length} 筆、運輸道路 ${d.roads.length} 筆、振動測點 ${d.points.length} 筆、計算清單 ${(parse(KEYS.list) || []).length} 筆`;
  };
  function msg(text, warn) {
    const m = $('#fileMsg');
    m.hidden = !text; m.className = 'notice' + (warn ? ' warn' : ''); m.textContent = text || '';
  }
  function refresh() {
    $('#fileSave').disabled = !(hasFS && handle);
    $('#fileSave').title = hasFS ? (handle ? '存回目前開啟的專案檔（.json）' : '尚未開啟專案檔，請用「另存新檔」') : '這個瀏覽器不支援直接回存，請用「另存新檔」下載';
  }

  const silent = (err) => err && (err.name === 'AbortError' || err.name === 'SecurityError'); // 使用者取消選檔

  // ---------- 專案檔內容 ----------
  function collect() {
    return {
      app: 'roadvib-project', version: 1, savedAt: new Date().toISOString(),
      store: S.get(), calcList: parse(KEYS.list) || [], batch: parse(KEYS.batch) || undefined,
    };
  }
  /** 寫回 localStorage 後重新載入，讓各畫面（含單筆清單、批次）從頭讀取 */
  function applyProject(p, name) {
    const next = Object.assign(S.empty(), p.store || {});
    next.source = name;
    try {
      localStorage.setItem(KEYS.store, JSON.stringify(next));
      localStorage.setItem(KEYS.list, JSON.stringify(Array.isArray(p.calcList) ? p.calcList : []));
      if (p.batch) localStorage.setItem(KEYS.batch, JSON.stringify(p.batch));
      else localStorage.removeItem(KEYS.batch);
      sessionStorage.setItem(MSG_KEY, `已開啟 ${name}。`);
    } catch (e) { /* 容量不足等 */ }
    location.reload();
  }

  async function writeTo(h) {
    if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted'
      && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('未取得檔案寫入權限');
    const w = await h.createWritable();
    await w.write(new Blob([JSON.stringify(collect(), null, 1)], { type: 'application/json' }));
    await w.close();
    const cur = S.get();
    cur.source = h.name;
    S.commit(ME);
  }

  // ---------- 新增：清成空白專案（基本資料、計算清單、批次設定都清掉） ----------
  $('#fileNew').addEventListener('click', async () => {
    const d = S.get();
    const n = d.receivers.length + d.roads.length + d.points.length + (parse(KEYS.list) || []).length;
    if (n && !confirm(`開新檔案會清空目前的 ${TOTAL()}（評估基準與模式參數回預設值），確定？`)) return;
    handle = null;
    await idb.del();
    try {
      localStorage.setItem(KEYS.store, JSON.stringify(S.empty()));
      localStorage.removeItem(KEYS.list);
      localStorage.removeItem(KEYS.batch);
      sessionStorage.setItem(MSG_KEY, '已開新檔案（空白資料）。');
    } catch (e) { /* 略 */ }
    location.reload();
  });

  // ---------- 開啟：專案檔（.json）；Excel／CSV 只讀入基本資料 ----------
  $('#fileOpen').addEventListener('click', async () => {
    try {
      let file, h = null;
      if (hasFS) {
        [h] = await window.showOpenFilePicker({ types: [
          { description: '專案檔（JSON）', accept: { 'application/json': ['.json'] } },
          { description: 'Excel／CSV（只讀入基本資料）', accept: { 'application/octet-stream': ['.xlsx', '.xlsm', '.xls', '.csv'] } },
        ] });
        file = await h.getFile();
      } else {
        file = await new Promise((res) => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = '.json,.xlsx,.xlsm,.xls,.csv';
          inp.addEventListener('change', () => res(inp.files[0] || null));
          inp.click();
        });
        if (!file) return;
      }
      if (/\.json$/i.test(file.name)) {
        const p = JSON.parse(await file.text());
        if (p.app !== 'roadvib-project') throw new Error('不是本程式的專案檔');
        const d = S.get();
        const busy = d.receivers.length + d.roads.length + d.points.length + (parse(KEYS.list) || []).length;
        if (busy && !confirm(`開啟會取代目前的 ${TOTAL()}，確定？`)) return;
        if (h) await idb.set(h); else await idb.del();
        applyProject(p, file.name); // 會重新載入頁面
        return;
      }
      const found = await window.RoadVibImport(file); // Excel／CSV：沿用匯入（只有基本資料，會先確認取代）
      if (!found) return;
      handle = null;
      await idb.del();
      refresh();
      msg(`已讀入 ${file.name}：${found.join('、')}（Excel 只含基本資料；要存整個專案請用「另存新檔」存成 .json）`);
    } catch (err) {
      if (silent(err)) return;
      msg('開啟失敗：' + err.message, true);
    }
  });

  // ---------- 儲存：存回開啟的專案檔 ----------
  $('#fileSave').addEventListener('click', async () => {
    if (!(hasFS && handle)) return;
    try {
      await writeTo(handle);
      refresh();
      msg(`已儲存 ${handle.name}。`);
    } catch (err) {
      if (silent(err)) return;
      msg('儲存失敗：' + err.message, true);
    }
  });

  // ---------- 另存新檔：選位置存 .json（不支援 File System Access 時改為下載） ----------
  $('#fileSaveAs').addEventListener('click', async () => {
    const name = String(S.get().source || '道路交通振動專案').replace(/\.(json|xlsx|xlsm|xls|csv)$/i, '') + '.json';
    try {
      if (hasFS) {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '專案檔（JSON）', accept: { 'application/json': ['.json'] } }] });
        await writeTo(h);
        handle = h;
        await idb.set(h);
        refresh();
        msg(`已另存為 ${h.name}，之後可用「儲存檔案」直接回存。`);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(collect(), null, 1)], { type: 'application/json' }));
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        msg(`已下載 ${name}。`);
      }
    } catch (err) {
      if (silent(err)) return;
      msg('另存失敗：' + err.message, true);
    }
  });

  window.addEventListener('roadvib:store', refresh);
  (async () => {
    if (hasFS) handle = await idb.get();
    refresh();
    try {
      const m = sessionStorage.getItem(MSG_KEY);
      if (m) { sessionStorage.removeItem(MSG_KEY); msg(m); }
    } catch (e) { /* 略 */ }
  })();
})();
