/**
 * 摘要表定義與 Word（.docx）產生器
 * 版式比照舊版 VBA：表名 13pt 置中、單位列靠右、表內 12pt 置中、外框 1.5pt、表註 10pt 懸掛縮排。
 * 瀏覽器：window.RoadVibReport；Node：module.exports。
 */
(function (root) {
  'use strict';
  const f1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '—');
  const UNIT = '振動單位：dB(ref:10⁻⁵ m/s²)';

  const DEFAULT_NOTES = {
    now: ['註[1]：差值＝現況振動量測值－現況振動預測值，作為無計畫及有計畫預測值之修正量。'],
    construction: [
      '註[1]：現況環境振動位準時段區分定義為〝平日〞施工時段上午8時至12時和下午1時至5時，共8小時之Lv10能量平均值。',
      '註[2]：無施工計畫及有施工計畫交通振動量已依現況量測值與預測值之差值修正。',
    ],
    operation: [
      '註[1]：〝現況環境振動位準〞係參用現況環境振動位準，時段區分定義為第一、二管制區〝平日〞日間時段上午六時至晚上八時和夜間時段晚上十時至翌日上午六時，共14和8小時之Lv10能量平均值。',
      '註[2]：營運期間合成振動量＝營運期間背景振動量與營運期間環境振動量之能量合成。',
    ],
  };

  /** 依批次結果組出三張表（headers 中的 \n 會在 Word 換行） */
  function buildTables(result, opts) {
    const o = Object.assign({ correction: true, notes: {} }, opts);
    const notes = (k) => (o.notes[k] || DEFAULT_NOTES[k]).filter((s) => String(s).trim());
    const consNotes = notes('construction').filter((s) => o.correction || !/修正/.test(s));
    return {
      now: {
        key: 'now',
        title: '現況運輸道路交通振動模擬結果輸出摘要',
        headers: ['道路(路段)', '敏感受體', '時段', '現況振動\n量測值', '現況振動\n預測值', '差值\n(量測−預測)', '評估\n基準'],
        widths: [2300, 1700, 1100, 1200, 1200, 1288, 850], fontSize: 22,
        rows: result.now.map((r) => [r.road, r.receiver, r.scenario, f1(r.measured), f1(r.predicted), f1(r.error), f1(r.criteria).replace('.0', '')]),
        merge: [0, 1],
        notes: notes('now'),
      },
      construction: {
        key: 'construction',
        title: '施工期間運輸道路交通振動模擬結果輸出摘要',
        headers: ['道路(路段)', '時段', '敏感受體', '現況\n環境振動量', '無施工計畫\n交通振動量', '有施工計畫\n交通振動量', '振動\n增量', '評估\n基準'],
        widths: [2000, 700, 1500, 1246, 1246, 1246, 850, 850], fontSize: 22,
        rows: result.construction.map((r) => [r.road, r.period, r.receiver, f1(r.background), f1(r.without), f1(r.with), f1(r.increment), f1(r.criteria).replace('.0', '')]),
        merge: [0],
        notes: consNotes,
      },
      operation: {
        key: 'operation',
        title: '營運期間運輸道路交通振動模擬結果輸出摘要',
        headers: ['道路(路段)', '時段', '敏感受體', '現況\n環境振動量', '營運期間\n背景振動量', '營運期間\n環境振動量', '營運期間\n合成振動量', '振動\n增量', '評估\n基準'],
        widths: [1600, 650, 1250, 1159, 1159, 1159, 1159, 726, 726], fontSize: 20,
        rows: result.operation.map((r) => [r.road, r.period, r.receiver, f1(r.current), f1(r.opBackground), f1(r.opLevel), f1(r.combined), f1(r.increment), f1(r.criteria).replace('.0', '')]),
        merge: [0],
        notes: notes('operation'),
      },
    };
  }

  // ---------------- WordprocessingML ----------------
  const xe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  function runs(text, rPr = '') {
    return String(text).split('\n').map((t, i) => `<w:r>${rPr}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`).join('');
  }
  const para = (style, text, extraPPr = '') => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extraPPr}</w:pPr>${runs(text)}</w:p>`;

  function tableXml(t) {
    const n = t.headers.length;
    const widths = t.widths || Array.from({ length: n }, () => Math.floor(9638 / n));
    const sz = t.fontSize ? `<w:sz w:val="${t.fontSize}"/><w:szCs w:val="${t.fontSize}"/>` : '';
    const B = (sz) => ['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} w:val="single" w:sz="${sz}" w:space="0" w:color="000000"/>`).join('');
    const cell = (text, opt = {}) => {
      const tcPr = `<w:tcPr><w:tcW w:w="${widths[opt.col] || 0}" w:type="dxa"/>${opt.vMerge ? `<w:vMerge${opt.vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${opt.borders ? `<w:tcBorders>${opt.borders}</w:tcBorders>` : ''}<w:vAlign w:val="center"/></w:tcPr>`;
      return `<w:tc>${tcPr}<w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr>${opt.vMerge === 'continue' ? '' : runs(text, `<w:rPr>${opt.bold ? '<w:b/>' : ''}${sz}</w:rPr>`)}</w:p></w:tc>`;
    };
    const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${t.headers.map((h, j) => cell(h, { borders: B(12), col: j })).join('')}</w:tr>`;
    const body = t.rows.map((row, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.map((v, j) => {
      if (!t.merge.includes(j)) return cell(v, { col: j });
      const same = (k) => k >= 0 && k < t.rows.length && t.merge.filter((m) => m <= j).every((m) => t.rows[k][m] === row[m]);
      if (same(i - 1)) return cell('', { vMerge: 'continue', col: j });
      return cell(v, same(i + 1) ? { vMerge: 'restart', col: j } : { col: j });
    }).join('')}</w:tr>`).join('');
    const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    const tblPr = `<w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${B(12)}<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
    return `<w:tbl>${tblPr}${grid}${head}${body}</w:tbl>`;
  }

  function documentXml(tables) {
    const parts = tables.map((t, i) => {
      const brk = i ? '<w:pageBreakBefore/>' : '';
      const notes = t.notes.map((s, k) => para(k ? 'TableNote2' : 'TableNote1', s)).join('');
      return para('TableTitle', t.title, brk) + para('TableUnit', UNIT) + tableXml(t) + notes;
    }).join('');
    const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${parts}${sect}</w:body></w:document>`;
  }

  function stylesXml() {
    const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="標楷體" w:cs="Times New Roman"/>';
    const style = (id, name, sz, pPr) => `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>${pPr}</w:pPr><w:rPr>${font}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${style('TableTitle', '表名', 26, '<w:keepNext/><w:jc w:val="center"/><w:spacing w:before="120" w:after="60"/>')}
${style('TableUnit', '表單位', 20, '<w:keepNext/><w:jc w:val="right"/><w:spacing w:after="40"/>')}
${style('TableText', '表內', 24, '<w:jc w:val="center"/><w:snapToGrid w:val="0"/>')}
${style('TableNote1', '表註1', 20, '<w:snapToGrid w:val="0"/><w:spacing w:before="60"/><w:ind w:left="700" w:hanging="700"/><w:jc w:val="both"/>')}
${style('TableNote2', '表註2', 20, '<w:snapToGrid w:val="0"/><w:ind w:left="700" w:hanging="700"/><w:jc w:val="both"/>')}
</w:styles>`;
  }

  /** 產生 .docx；JSZip 由呼叫端傳入。回傳 Promise<Blob|Uint8Array> */
  function buildDocx(JSZip, tables, type) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('word/document.xml', documentXml(tables));
    zip.file('word/styles.xml', stylesXml());
    return zip.generateAsync({ type: type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  const api = { UNIT, DEFAULT_NOTES, buildTables, buildDocx, documentXml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoadVibReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
