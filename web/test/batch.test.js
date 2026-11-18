// 執行：npm test（直接讀 VBA/ 內的原始 xlsm 做端到端驗證）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const JSZip = require('../vendor/jszip.min.js');
const B = require('../js/batch.js');
const Rp = require('../js/report.js');

const XLSM = path.join(__dirname, '../../VBA/日本道路交通振動_20230325.xlsm');
const wb = XLSX.read(fs.readFileSync(XLSM), { type: 'buffer' });
const data = B.fromWorkbook(XLSX, wb);
const groups = B.groupRoads(data.roads);
const pairs = B.suggestPairs(groups);
const sources = B.buildSources(groups, pairs);

test('匯入：道路 62 筆、受體 8 筆，略過無效列', () => {
  assert.equal(data.roads.length, 62);
  assert.equal(data.receivers.length, 8);
  assert.deepEqual(data.skipped, [65]);
  const r = data.roads.find((x) => x.name === '台15線(港區～大崁腳加油站)' && x.scenario === '現況晨峰');
  assert.equal(r.Q1, 1971); assert.equal(r.Q2, 104); assert.equal(r.M, 4);
  assert.ok(Math.abs(r.V - 38.1) < 1e-9);
});

test('模擬狀況解析', () => {
  assert.deepEqual(B.parseScenario('無計畫昏峰'), { scenario: '無計畫昏峰', phase: '無計畫', period: '昏峰' });
  assert.equal(B.parseScenario('測試').phase, null);
});

test('併行自動配對：依「與ＸＸ併行」找高架側', () => {
  assert.equal(pairs['台15線|市105線～寶斗溪(與台61線併行)'], '台61線|台64線～南堤聯外道路');
  assert.equal(pairs['商港路|商港一路與中山路間(與台64線併行)'], '台64線|八里交流道～觀音山交流道');
  const par = sources.filter((s) => s.kind === 'parallel').map((s) => s.id);
  assert.equal(par.length, 2);
  // 已被配對的高架側不再單獨列出
  assert.ok(!sources.some((s) => s.id === '台61線|台64線～南堤聯外道路'));
});

test('對照舊版施工摘要表：台15線(港區～大崁腳加油站)／中華路一段 晨峰 49.3 → 50.6，增量 1.3', () => {
  const res = B.computeBatch(data, sources, [{ sourceId: '台15線|港區～大崁腳加油站', receiver: '中華路一段附近民宅' }]);
  const now = res.now.find((r) => r.period === '晨峰');
  assert.equal(now.predicted, 58.2);
  assert.equal(now.error, -10.3);
  const c = res.construction.find((r) => r.period === '晨峰');
  assert.equal(c.without, 49.3);
  assert.equal(c.with, 50.6);
  assert.equal(c.increment, 1.3);
  assert.equal(c.criteria, 65);
});

test('現況修正可關閉', () => {
  const res = B.computeBatch(data, sources, [{ sourceId: '台15線|港區～大崁腳加油站', receiver: '中華路一段附近民宅' }], { correction: false });
  const c = res.construction.find((r) => r.period === '晨峰');
  assert.equal(c.without, 59.6);
  assert.equal(c.correction, 0);
});

test('併行來源可計算，營運合成＝背景⊕有計畫', () => {
  const res = B.computeBatch(data, sources, [{ sourceId: '商港路|商港一路與中山路間(與台64線併行)', receiver: '台64線附近民宅' }]);
  assert.equal(res.issues.length, 0, res.issues.join());
  assert.equal(res.construction.length, 2);
  for (const o of res.operation) {
    const e = 10 * Math.log10(10 ** (o.opBackground / 10) + 10 ** (o.opLevel / 10));
    assert.ok(Math.abs(o.combined - e) <= 0.05);
  }
});

test('Word 報表：單列或末列不同道路也能產生', async () => {
  const one = { now: [], operation: [], construction: [{ road: 'A', period: '晨峰', receiver: 'x', background: 45, without: 50, with: 51, increment: 1, criteria: 65 }] };
  const T = Rp.buildTables(one);
  const buf = await Rp.buildDocx(JSZip, [T.construction], 'nodebuffer');
  assert.ok(buf.length > 1000);
});

test('Word 報表：產生三張表的 docx', async () => {
  const res = B.computeBatch(data, sources, [
    { sourceId: '台15線|港區～大崁腳加油站', receiver: '中華路一段附近民宅' },
    { sourceId: '市105線|商港路～訊塘一路', receiver: '市105線附近民宅' },
  ]);
  const T = Rp.buildTables(res);
  assert.equal(T.construction.rows.length, 4);
  const buf = await Rp.buildDocx(JSZip, [T.now, T.construction, T.operation], 'nodebuffer');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /施工期間運輸道路交通振動模擬結果輸出摘要/);
  assert.match(xml, /w:vMerge w:val="restart"/);
  if (process.env.DOCX_OUT) fs.writeFileSync(process.env.DOCX_OUT, buf);
});
