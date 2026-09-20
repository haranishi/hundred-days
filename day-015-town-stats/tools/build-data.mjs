// 国勢調査2020のxlsxと国土地理院の面積調CSVから data/towns.json を作る。依存ゼロ。
// 使い方: tools/cache/ に2つの元ファイルを置いて `node tools/build-data.mjs`
//（入手先はREADME参照。Gemma3:27bに2周書かせたが ZIP解凍とセル参照の扱いを
//  毎回作話してしまい不合格。バイナリ形式の解析は検収側が書いた）
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const XLSX = join(here, 'cache/kokusei2020.xlsx');
const CSV = join(here, 'cache/mencho.csv');
const OUT = join(here, '../data/towns.json');

/* ---- ZIP（xlsxの外側）を最小限に読む ---- */
function readZipEntries(buffer) {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  assert.ok(eocd >= 0, 'EOCDが見つからない');
  let at = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  while (at < eocd && buffer.readUInt32LE(at) === 0x02014b50) {
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    entries.set(name, { method, compressedSize, localOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipFile(buffer, entry) {
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);
  return (entry.method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
}

/* ---- ワークシートXMLを正規表現で読む（この方式で実測検証済み） ---- */
const unescapeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function parseSharedStrings(xml) {
  const list = [];
  for (const [, si] of xml.matchAll(/<si>(.*?)<\/si>/gs)) {
    const body = si.replace(/<rPh.*?<\/rPh>/gs, '');   // ふりがなを捨てる
    const text = [...body.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
    list.push(text);
  }
  return list;
}

const colNumber = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function* parseRows(xml, shared) {
  for (const [, r, inner] of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    const cells = new Map();
    for (const m of inner.matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const ref = /r="([A-Z]+)\d+"/.exec(m[1]);
      const v = /<v>([^<]*)<\/v>/.exec(m[2] ?? '');
      if (!ref || !v) continue;
      cells.set(colNumber(ref[1]), m[1].includes('t="s"') ? shared[Number(v[1])] : v[1]);
    }
    yield { row: Number(r), cells };
  }
}

/* ---- 値の整形 ---- */
const num = (v) => (v === undefined || v === null || v === '' || v === '-' ? null : Number(v));
const round = (v, digits) => (v === null ? null : Number(v.toFixed(digits)));

/* ---- 面積調CSV ---- */
function parseMencho(buffer) {
  const text = new TextDecoder('shift_jis').decode(buffer);
  const areas = new Map();
  for (const line of text.split('\n').slice(6)) {
    const f = line.replace(/\r$/, '').split(',');
    if (!f[0] || !f[3]) continue;                      // 郡などの小計行は市区町村名が空
    const code = f[0].padStart(5, '0');
    const entry = { area: Number(f[4]) };
    if ((f[5] ?? '').includes('参考値')) entry.areaNote = '参考値';
    areas.set(code, entry);
  }
  return areas;
}

/* ---- 本体 ---- */
const xlsxBuffer = await readFile(XLSX);
const entries = readZipEntries(xlsxBuffer);
const shared = parseSharedStrings(readZipFile(xlsxBuffer, entries.get('xl/sharedStrings.xml')));
const sheet = readZipFile(xlsxBuffer, entries.get('xl/worksheets/sheet1.xml'));
const areas = parseMencho(await readFile(CSV));

const towns = [];
for (const { row, cells } of parseRows(sheet, shared)) {
  if (row < 10) continue;
  const codeAndName = cells.get(2) ?? '';
  const [code, name] = codeAndName.split('_');
  const type = String(cells.get(4) ?? '');
  const isCity = ['1', '2', '3'].includes(type) && code !== '13100';
  const isWard = type === '0' && code >= '13101' && code <= '13123';
  if (!isCity && !isWard) continue;

  const general = num(cells.get(40));
  const single = num(cells.get(46));
  const area = areas.get(code);
  assert.ok(area, `面積調に ${code} ${name} が無い`);
  towns.push({
    code,
    pref: (cells.get(1) ?? '').split('_')[1],
    name,
    en: cells.get(3) ?? '',
    pop: num(cells.get(5)),
    pop2015: num(cells.get(8)),
    rate: round(num(cells.get(10)), 2),
    area: area.area,
    ...(area.areaNote ? { areaNote: area.areaNote } : {}),
    dens: round(num(cells.get(12)), 1),
    ageAvg: round(num(cells.get(13)), 1),
    ageMed: round(num(cells.get(14)), 1),
    u15: round(num(cells.get(18)), 2),
    o65: round(num(cells.get(20)), 2),
    sexRatio: round(num(cells.get(33)), 1),
    single: general && single !== null ? round((single / general) * 100, 2) : null,
  });
}

/* ---- 検算（期待値はxlsxから独立に計算した実測値） ---- */
assert.equal(towns.length, 1741);
const byCode = new Map(towns.map((t) => [t.code, t]));
assert.equal(byCode.get('05201').area, 906.07);
assert.equal(byCode.get('05201').single, 36.28);
assert.equal(byCode.get('05213').pop, 30198);
assert.ok(byCode.get('05213').ageAvg >= 56.8 && byCode.get('05213').ageAvg <= 57.0);
assert.equal(byCode.get('13104').single, 67.8);
/* 2020年の双葉町(07546)は全町避難で、この表では人口も「-」（数値なし）。
   0に書き換えず null のまま持つ。nullが双葉町以外に増えたら元データが変わった合図 */
assert.deepEqual(towns.filter((t) => t.pop === null).map((t) => t.code), ['07546']);
for (const t of towns) assert.ok(t.area > 0 && t.pref && t.name, `${t.code} が欠けている`);

const out = {
  meta: {
    census: '令和2年国勢調査（2020年10月1日時点）',
    area: '全国都道府県市区町村別面積調（令和8年4月1日時点）',
    generatedAt: new Date().toISOString(),
  },
  towns,
};
await writeFile(OUT, JSON.stringify(out));
console.log(`towns.json を書き出した: ${towns.length}件 / 検算すべて通過`);
