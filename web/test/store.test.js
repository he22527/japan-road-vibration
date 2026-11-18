// 共用資料庫（store.js）：讀 xlsm 各工作表、轉批次計算後結果需與直接讀 xlsm 一致
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const V = require('../js/calc.js');
const B = require('../js/batch.js');
const S = require('../js/store.js');

const wb = XLSX.read(fs.readFileSync(path.join(__dirname, '../../VBA/日本道路交通振動_20230325.xlsm')), { type: 'buffer' });
const { db, found } = S.fromWorkbook(XLSX, wb);

test('匯入各工作表', () => {
  assert.deepEqual(found.sort(), ['敏感受體', '模式參數', '評估基準', '道路', '量測點'].sort());
  assert.equal(db.receivers.length, 8);
  assert.equal(db.points.length, 16);
  assert.equal(db.criteria.length, 4);
  assert.deepEqual(db.params.map((p) => p.type), S.PARAM_TYPES); // 不含平面高架併行列
  const r = db.receivers.find((x) => x.name === '中華路一段附近民宅');
  assert.deepEqual({ R: r.R, zone: r.zone, point: r.point }, { R: 1.5, zone: '第一類', point: 'NV01_1' });
  const x = S.resolveReceiver(db, r);
  assert.equal(x.day, 65); assert.equal(x.night, 60); assert.equal(r.bgDay, 47.9); assert.equal(x.pointName, '大崁腳加油站(非假日)');
  // 改參考測點 → 背景值自測點帶入並四捨五入至 0.1
  const a1 = db.receivers.find((y) => y.name === 'A1道路/臨港大道路');
  assert.equal(a1.bgDay, 53.6);
  const copy = S.applyPoint(db, { ...a1, point: 'NV07_2' });
  assert.equal(copy.bgDay, 49.4);
});

test('轉批次資料後與直接讀 xlsm 結果一致', () => {
  const direct = B.fromWorkbook(XLSX, wb);
  const viaStore = B.fromAoa(S.toBatchAoa(db));
  const strip = (a) => a.map(({ row, ...o }) => o);
  assert.deepEqual(strip(viaStore.roads), strip(direct.roads));
  assert.deepEqual(strip(viaStore.receivers), strip(direct.receivers));
  const run = (d) => {
    const g = B.groupRoads(d.roads), src = B.buildSources(g, B.suggestPairs(g));
    const combos = src.flatMap((s) => d.receivers.map((r) => ({ sourceId: s.id, receiver: r.name })));
    return B.computeBatch(d, src, combos, {});
  };
  assert.deepEqual(run(viaStore), run(direct));
});

test('小型車／大型車合計', () => {
  assert.deepEqual(S.sumVehicles({ car: 113, van: 28, bus: 0, truck: 36, special: null }), { small: 141, large: 36 });
  assert.deepEqual(S.sumVehicles({ car: null, van: null }), {});
});

test('CSV／表頭辨識：無名稱工作表依表頭匯入', () => {
  assert.equal(S.detectSheet([['路型', 'A常數', 'B常數', 'C常數', 'D常數']]), '模式參數');
  assert.equal(S.detectSheet([['測點編號', '振動測點', '現況日間背景值']]), '量測點');
  assert.equal(S.detectSheet([['噪音管制區', '振動管制區', '日間評估基準', '夜間評估基準']]), '評估基準');
  assert.equal(S.detectSheet([['敏感受體', '與基準點距離', '噪音管制區']]), '敏感受體');
  assert.equal(S.detectSheet([['模擬狀況', '運輸道路', '路段', '道路型式']]), '道路');
  assert.equal(S.detectSheet([['編號', '模擬狀況', '道路', '路段']]), null); // 輸入總表不可誤判
  // CSV 讀進來是單張 Sheet1：依表頭辨識成敏感受體
  const ws = XLSX.utils.aoa_to_sheet([['敏感受體', '與基準點距離', '噪音管制區'], ['某民宅', 10, '第二類']]);
  const one = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
  const r = S.fromWorkbook(XLSX, one);
  assert.deepEqual(r.found, ['敏感受體']);
  assert.equal(r.db.receivers.length, 1);
  assert.deepEqual([r.db.receivers[0].name, r.db.receivers[0].zone], ['某民宅', '第二類']);
  // 原 xlsm：計算清單（有模擬狀況＋運輸道路表頭）不可搶走「道路」
  const full = S.fromWorkbook(XLSX, wb);
  assert.equal(full.db.roads.length, db.roads.length);
});

test('自訂模式參數與評估基準', () => {
  const base = { type: '平面', R: 5, zone: '第一類', period: '日間', plane: { Q1: 761, Q2: 40, M: 4, V: 40, pavement: '瀝青', sigma: 5, f: 6 } };
  const a = V.calculate(base);
  const b = V.calculate({ ...base, params: { '平面': { a: 65, b: 6, c: 4, d: 36 } } });
  assert.ok(Math.abs(b.lv10 - a.lv10 - 1) < 1e-9);
  assert.equal(V.calculate({ ...base, params: { '平面': { a: 65, b: 6, c: 4, d: null } } }).lv10, a.lv10); // 缺項用預設
  assert.equal(V.calculate({ ...base, criteriaTable: { '第一類': { day: 50, night: 45 } } }).criteria, 50);
  // 併行平面側 d 取單柱／雙柱高架的 d
  const par = { type: '平面高架併行', R: 5, planePiers: 2, plane: base.plane, elevated: { Q1: 2118, Q2: 295, M: 4, V: 58.6, Hp: 5, f: 6, piers: 2 } };
  assert.equal(V.calculate(par).plane.k.d, 20);
  assert.equal(V.calculate({ ...par, params: { '雙柱高架': { a: 54, b: 6, c: 2, d: 21 } } }).plane.k.d, 21);
});
