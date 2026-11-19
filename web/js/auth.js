/* 開啟程式時的登入視窗（純前端簡易防護：帳密寫在原始碼，僅擋一般使用者，非資安機制）。
 * 同一個瀏覽器分頁登入一次即可（sessionStorage）；關閉分頁後重開需再登入。 */
(function () {
  'use strict';
  const USERS = { CECIHE: '12345678' }; // 暫定帳密；要加人或改密碼直接改這裡
  const KEY = 'roadvib.auth.v1';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(() => {
    const gate = document.getElementById('authGate');
    if (!gate) return;
    let ok = false;
    try { ok = sessionStorage.getItem(KEY) === '1'; } catch (e) { /* 略 */ }
    if (ok) { gate.remove(); return; }
    const user = document.getElementById('authUser');
    const pass = document.getElementById('authPass');
    const err = document.getElementById('authErr');
    user.focus();
    document.getElementById('authForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (USERS[user.value.trim()] === pass.value) {
        try { sessionStorage.setItem(KEY, '1'); } catch (e2) { /* 略 */ }
        gate.remove();
      } else {
        err.hidden = false;
        pass.value = '';
        pass.focus();
      }
    });
  });
})();
