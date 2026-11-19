/* 「檔案」分頁：整份資料庫的新增／開啟／儲存／另存新檔（.xlsx；開啟另支援 .xlsm/.xls/.csv） */
(function () {
  'use strict';
  const S = window.RoadVibStore;
  const $ = (s) => document.querySelector(s);
  const ME = 'file-ui';
  const hasFS = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  let handle = null; // File System Access API 的檔案代號（僅 .xlsx 可回存）

  const TOTAL = () => {
    const d = S.get();
    return `敏感受體 ${d.receivers.length} 筆、運輸道路 ${d.roads.length} 筆、振動測點 ${d.points.length} 筆`;
  };
  function msg(text, warn) {
    const m = $('#fileMsg');
    m.hidden = !text; m.className = 'notice' + (warn ? ' warn' : ''); m.textContent = text || '';
  }
  function refresh() {
    const src = S.get().source;
    $('#fileCurrent').textContent = (src ? `目前檔案：${src}` : '尚未開啟檔案（資料存在瀏覽器）') + '　·　' + TOTAL();
    $('#fileSave').disabled = !(hasFS && handle);
    $('#fileSave').title = hasFS ? (handle ? '存回目前開啟的 .xlsx' : '尚未開啟可回存的 .xlsx，請用「另存新檔」') : '這個瀏覽器不支援直接回存，請用「另存新檔」下載';
  }

  const XLSX_TYPE = { description: 'Excel 活頁簿', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } };
  const silent = (err) => err && (err.name === 'AbortError' || err.name === 'SecurityError'); // 使用者取消選檔

  async function writeTo(h) {
    const wb = S.toWorkbook(window.XLSX, S.get());
    const buf = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const w = await h.createWritable();
    await w.write(new Blob([buf], { type: Object.keys(XLSX_TYPE.accept)[0] }));
    await w.close();
    const cur = S.get();
    cur.source = h.name;
    S.commit(ME);
  }

  // 新增：清成空白資料庫（評估基準、模式參數回預設）
  $('#fileNew').addEventListener('click', () => {
    const d = S.get();
    const n = d.receivers.length + d.roads.length + d.points.length;
    if (n && !confirm(`開新檔案會清空目前的 ${TOTAL()}（評估基準與模式參數回預設值），確定？`)) return;
    handle = null;
    S.replace(S.empty(), ME);
    refresh();
    msg('已開新檔案（空白資料）。');
  });

  // 開啟：讀整份 Excel／CSV（沿用匯入邏輯；.xlsx 以外無法回存，儲存請用另存新檔）
  $('#fileOpen').addEventListener('click', async () => {
    try {
      let file, h = null;
      if (hasFS) {
        [h] = await window.showOpenFilePicker({ types: [{ description: 'Excel／CSV', accept: { 'application/octet-stream': ['.xlsx', '.xlsm', '.xls', '.csv'] } }] });
        file = await h.getFile();
      } else {
        file = await new Promise((res) => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = '.xlsx,.xlsm,.xls,.csv';
          inp.addEventListener('change', () => res(inp.files[0] || null));
          inp.click();
        });
        if (!file) return;
      }
      const found = await window.RoadVibImport(file);
      if (!found) return; // 使用者取消取代
      handle = h && /\.xlsx$/i.test(file.name) ? h : null;
      refresh();
      msg(`已開啟 ${file.name}：${found.join('、')}` + (handle ? '' : '（此格式無法直接回存，儲存請用「另存新檔」）'));
    } catch (err) {
      if (silent(err)) return;
      msg('開啟失敗：' + err.message, true);
    }
  });

  // 儲存：存回開啟的 .xlsx
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

  // 另存新檔：選位置存 .xlsx（不支援 File System Access 時改為下載）
  $('#fileSaveAs').addEventListener('click', async () => {
    const name = (String(S.get().source || '道路交通振動資料').replace(/\.(xlsx|xlsm|xls|csv)$/i, '')) + '.xlsx';
    try {
      if (hasFS) {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: [XLSX_TYPE] });
        await writeTo(h);
        handle = h;
        refresh();
        msg(`已另存為 ${h.name}，之後可用「儲存檔案」直接回存。`);
      } else {
        window.XLSX.writeFile(S.toWorkbook(window.XLSX, S.get()), name);
        msg(`已下載 ${name}。`);
      }
    } catch (err) {
      if (silent(err)) return;
      msg('另存失敗：' + err.message, true);
    }
  });

  window.addEventListener('roadvib:store', refresh);
  refresh();
})();
