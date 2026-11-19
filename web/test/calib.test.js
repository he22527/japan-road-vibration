/** 模式校估（calib.js）測試 */
const { test } = require('node:test');
const assert = require('node:assert');
const RV = require('../js/calc.js');
const S = require('../js/store.js');
const B = require('../js/batch.js');
const C = require('../js/calib.js');

const r1 = (x) => Math.round(x * 10) / 10;

/** 測試用資料庫：一條平面道路（現況晨峰／昏峰）＋三個受體 */
function sampleDb() {
  const db = S.empty();
  const road = (scenario) => ({
    scenario, road: '台61線', section: '', type: '平面', H: null, piers: null,
    pavement: '瀝青', flat: 5, M: 4, small: 761, vSmall: 40, large: 40, vLarge: 40,
  });
  db.roads = [road('現況晨峰'), road('現況昏峰')];
  db.points = [{ id: 'P1', name: '大崁腳測點', bgDay: 55, bgNight: 50, bgCon: null, bgOpDay: null, bgOpNight: null }];
  db.receivers = [
    { name: '受體A', R: 20, zone: '第二類', point: 'P1', bgDay: 55, bgNight: 50 },
    { name: '受體B', R: 50, zone: '', point: '', bgDay: 48, bgNight: null },
    { name: '受體C', R: null, zone: '', point: '', bgDay: 60, bgNight: null },
  ];
  return db;
}

function sourcesOf(db) {
  const data = B.fromAoa(S.toBatchAoa(db));
  const groups = B.groupRoads(data.roads);
  return B.buildSources(groups, B.suggestPairs(groups));
}

const OPT = { fPlane: 6, fElev: 6, soil: '黏土' };

test('scenariosOf：列出來源的模擬狀況', () => {
  const src = sourcesOf(sampleDb())[0];
  assert.deepStrictEqual(C.scenariosOf(src), ['現況晨峰', '現況昏峰']);
});

test('rows：預測值與單筆計算一致，差異＝實測−預測', () => {
  const db = sampleDb();
  const src = sourcesOf(db)[0];
  const rows = C.rows(db, src, '現況晨峰', '日間', OPT);
  assert.strictEqual(rows.length, 3);

  const a = rows[0];
  const ref = RV.calculate({ type: '平面', R: 20, soil: '黏土',
    plane: { Q1: 761, Q2: 40, M: 4, V: 40, pavement: '瀝青', sigma: 5, f: 6, H: 0 } });
  assert.ok(ref.ok);
  assert.strictEqual(a.predicted, r1(ref.lv10R));
  assert.strictEqual(a.measured, 55);
  assert.strictEqual(a.diff, r1(55 - r1(ref.lv10R)));
  assert.strictEqual(a.pointName, '大崁腳測點');
  assert.strictEqual(a.issue, '');

  // 夜間：改取 bgNight；受體B 夜間沒有實測值
  const night = C.rows(db, src, '現況晨峰', '夜間', OPT);
  assert.strictEqual(night[0].measured, 50);
  assert.ok(Number.isNaN(night[1].measured));
  assert.strictEqual(night[1].issue, '缺現況夜間背景值');
});

test('rows：缺距離、缺道路資料時給備註', () => {
  const db = sampleDb();
  const src = sourcesOf(db)[0];
  const rows = C.rows(db, src, '現況晨峰', '日間', OPT);
  assert.strictEqual(rows[2].issue, '缺「與基準點距離」');
  assert.ok(Number.isNaN(rows[2].diff));
  const none = C.rows(db, src, '無計畫晨峰', '日間', OPT);
  assert.strictEqual(none[0].issue, '缺「無計畫晨峰」道路資料');
});

test('growthFactor：(1+成長率)^經過年數', () => {
  assert.strictEqual(C.growthFactor(2, 2026, 2026), 1);
  assert.ok(Math.abs(C.growthFactor(2, 2026, 2028) - 1.0404) < 1e-9);
  assert.ok(Number.isNaN(C.growthFactor(null, 2026, 2028)));
  assert.ok(Number.isNaN(C.growthFactor(2, 2026, null)));
});

test('growth：成長後預測值與增量', () => {
  const db = sampleDb();
  const src = sourcesOf(db)[0];
  const g = C.growth(db, src, '現況晨峰', OPT, { rate: 2, baseYear: 2026, conYear: 2028, opYear: 2031 });
  assert.ok(Math.abs(g.factors.con - 1.0404) < 1e-9);
  const k = g.factors.op;
  const a = g.rows[0];
  // 營運年：交通量 ×(1.02)^5 後重算，應與直接代入成長後交通量一致
  const ref = RV.calculate({ type: '平面', R: 20, soil: '黏土',
    plane: { Q1: 761 * k, Q2: 40 * k, M: 4, V: 40, pavement: '瀝青', sigma: 5, f: 6, H: 0 } });
  assert.strictEqual(a.pOp, r1(ref.lv10R));
  assert.strictEqual(a.dOp, r1(a.pOp - a.p0));
  assert.ok(a.dOp > 0 && a.dCon > 0 && a.dOp >= a.dCon); // 成長 → 振動增加，營運年 ≥ 施工年
  // 缺距離的受體有備註
  assert.strictEqual(g.rows[2].issue, '缺「與基準點距離」');
  // 只填施工年：營運欄為 NaN
  const only = C.growth(db, src, '現況晨峰', OPT, { rate: 2, baseYear: 2026, conYear: 2028, opYear: null });
  assert.ok(Number.isFinite(only.rows[0].dCon) && Number.isNaN(only.rows[0].dOp));
});

test('stats：平均、樣本標準差、範圍', () => {
  const st = C.stats([1.0, 2.0, 3.0, NaN]);
  assert.strictEqual(st.n, 3);
  assert.strictEqual(st.mean, 2);
  assert.strictEqual(st.sd, 1);
  assert.strictEqual(st.min, 1);
  assert.strictEqual(st.max, 3);
  const one = C.stats([1.5]);
  assert.strictEqual(one.n, 1);
  assert.strictEqual(one.mean, 1.5);
  assert.ok(Number.isNaN(one.sd));
  assert.strictEqual(C.stats([]).n, 0);
});
