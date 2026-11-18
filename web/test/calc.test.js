// 執行：node --test web/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/calc.js');
const rows = require('./excel_plane_rows.json');

const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}（容許 ${tol}）`);

test('等價交通量 Q*', () => {
  near(V.equivalentTraffic(761, 40, 4), 43.09, 0.01);
});

test('定案 1：αf 平面系 f<4 = −24 + 10·log f', () => {
  near(V.alphaFPlane(2), -24 + 10 * Math.log10(2), 1e-9);
  assert.equal(V.alphaFPlane(6), -18);
  near(V.alphaFPlane(10), -20, 1e-9);
});

test('αf 高架三段', () => {
  near(V.alphaFElevated(2), -6 + 2.5 * Math.log10(2), 1e-9);
  assert.equal(V.alphaFElevated(5), -4.5);
  near(V.alphaFElevated(10), -5, 1e-9);
});

test('定案 2：σ ≤ 1 時 ασ = 0', () => {
  assert.equal(V.alphaSigma('瀝青', 1), 0);
  assert.equal(V.alphaSigma('混凝土', 0.5), 0);
  near(V.alphaSigma('瀝青', 5), 9.786, 0.001);
  near(V.alphaSigma('混凝土', 5), 12.58, 0.01);
});

test('定案 3：填方 β = 0.077(LV10(平)+αs) − 1.8，αs 只算一次', () => {
  const plane = { Q1: 761, Q2: 40, M: 4, V: 40, pavement: '瀝青', sigma: 5, f: 6, H: 3 };
  const r = V.calculate({ type: '填方', R: 10, plane });
  const aS = -1.4 * 3 - 1.3;
  near(r.plane.aS, aS, 1e-9);
  near(r.lv10, r.plane.lvPlane + aS, 1e-9);
  near(r.beta, 0.077 * (r.plane.lvPlane + aS) - 1.8, 1e-9);
});

test('定案 4：併行平面側 d 依橋腳數 18/20，a/b/c 沿用 65/6/4', () => {
  const plane = { Q1: 1151, Q2: 168, M: 4, V: 35, pavement: '瀝青', sigma: 5, f: 6 };
  const elevated = { Q1: 747, Q2: 524, M: 4, V: 85.3, piers: 1, Hp: 5, f: 6 };
  const r1 = V.calculate({ type: '平面高架併行', R: 6, plane, elevated, planePiers: 1 });
  const r2 = V.calculate({ type: '平面高架併行', R: 6, plane, elevated, planePiers: 2 });
  assert.deepEqual(r1.plane.k, { a: 65, b: 6, c: 4, d: 18 });
  assert.deepEqual(r2.plane.k, { a: 65, b: 6, c: 4, d: 20 });
  near(r2.plane.base - r1.plane.base, 2, 1e-9);
  near(r1.lv10, V.energySum(r1.plane.lv, r1.elevated.lv), 1e-9);
  near(r1.beta, 0.072 * r1.lv10 - 2.2, 1e-9);
});

test('高架側對照 Excel：台61線 L\'V10(高) = 45.1', () => {
  const r = V.calculate({ type: '單柱高架', R: 0, elevated: { Q1: 2118, Q2: 295, M: 4, V: 58.6, Hp: 5, f: 6 } });
  near(r.lv10, 45.1, 0.1);
});

test('R = 0 時無衰減', () => {
  const r = V.calculate({ type: '平面', R: 0, plane: { Q1: 761, Q2: 40, M: 4, V: 40, pavement: '瀝青', sigma: 5, f: 6 } });
  near(r.lv10R, r.lv10, 1e-9);
});

test('輸入檢核：Q* ≤ 1 時回報錯誤', () => {
  const r = V.calculate({ type: '平面', R: 5, plane: { Q1: 1, Q2: 0, M: 4, V: 40, pavement: '瀝青', sigma: 5, f: 6 } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /Q\*/);
});

test('影響評估：合成、增量、基準判定', () => {
  const r = V.calculate({ type: '平面', R: 5, background: 50, zone: '第一類', period: '夜間',
    plane: { Q1: 761, Q2: 40, M: 4, V: 40, pavement: '瀝青', sigma: 5, f: 6 } });
  near(r.combined, V.energySum(50, r.lv10R), 1e-9);
  assert.equal(r.criteria, 60);
  assert.equal(r.pass, r.combined <= 60);
  near(r.margin, 60 - r.combined, 1e-9);
  assert.ok(['pass', 'near', 'fail'].includes(r.grade));
});

test('三段判定：符合／接近／超過（餘裕門檻 3 dB）', () => {
  assert.deepEqual(V.judge(55, 60), { pass: true, margin: 5, grade: 'pass' });
  assert.equal(V.judge(57, 60).grade, 'near'); // 餘裕剛好 3 dB 算接近
  assert.equal(V.judge(60, 60).grade, 'near'); // 等於基準仍算符合（接近）
  assert.equal(V.judge(60.1, 60).grade, 'fail');
  near(V.judge(62, 60).margin, -2, 1e-9);
});

// Excel 第 4 列（台15線）的 LV10 欄沒有隨車速更新，只比對 LV10_R
const STALE_LV10 = new Set([4]);
for (const x of rows) {
  test(`對照 Excel 輸入總表第 ${x.excelRow} 列：${x.road}`, () => {
    const r = V.calculate({ type: '平面', R: x.R, soil: x.soil,
      plane: { Q1: x.Q1, Q2: x.Q2, M: x.M, V: x.V, pavement: x.pavement, sigma: x.sigma, f: x.f } });
    assert.ok(r.ok, r.errors && r.errors.join());
    // VBA 對基準值、αl 各四捨五入至 0.1，容許 0.15 dB
    if (!STALE_LV10.has(x.excelRow)) near(r.lv10, x.expectLV10, 0.15);
    near(r.lv10R, x.expectLV10R, 0.15);
  });
}
