/* 警察庁の本票CSV（2019〜2024・Shift_JIS・合計約375MB）を、
   画面がそのまま読める6バイト固定長のメッシュ別ファイルに変換する。
   CSVはリポジトリに入れない。生成物（data/m/*.bin と data/index.json）だけを置く。

   使い方: node tools/build-data.mjs --src <CSVの置き場> [--out data]
   CSVの取得元は data/SOURCES.md に書いてある */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  HEADER_BYTES, RECORD_BYTES, FIRST_YEAR, LAST_YEAR, meshBounds, meshCodeOf, parentMesh,
  quantize, packTime, writeHeader,
  F_WALKER, F_BIKE, F_MOTOR, F_DEATH, F_ELDER, F_CROSS, F_NIGHT,
} from '../lib/pack.js';

/* 2次メッシュがこの件数以上なら単独のファイルにする。
   下回るぶんは親の1次メッシュへまとめる（全部を2次で割ると3,835ファイルになる） */
const SPLIT_AT = 2000;

const WALKER = new Set(['61']);
const BIKE = new Set(['51', '52']);
const MOTOR = new Set(['31', '32', '33', '34', '35', '36', '43']);
const ELDER = new Set(['65', '75']);
const CROSSING = new Set(['01', '31', '07', '37']); /* 交差点・環状交差点とその付近 */

const COLUMNS = {
  lat: '地点　緯度（北緯）', lng: '地点　経度（東経）',
  year: '発生日時　　年', hour: '発生日時　　時',
  content: '事故内容', shape: '道路形状', daynight: '昼夜',
  typeA: '当事者種別（当事者A）', typeB: '当事者種別（当事者B）',
  ageA: '年齢（当事者A）', ageB: '年齢（当事者B）',
};

/* 緯度 DDMMSSsss（9桁）／経度 DDDMMSSsss（10桁）。秒は1/1000秒まで */
export function decodeDms(text, isLat) {
  const value = String(text ?? '').trim();
  const width = isLat ? 9 : 10;
  if (value.length !== width || !/^\d+$/.test(value)) return null;
  const cut = isLat ? 2 : 3;
  const degrees = Number(value.slice(0, cut));
  const minutes = Number(value.slice(cut, cut + 2));
  const seconds = Number(value.slice(cut + 2)) / 1000;
  return degrees + minutes / 60 + seconds / 3600;
}

/* CSVの1行を分ける。この列に引用符やカンマ入りの値は出てこないが、念のため引用符を外す */
const splitRow = (line) => line.split(',').map((cell) => cell.replace(/^"(.*)"$/, '$1'));

export function flagsOf(row) {
  const a = row.typeA;
  const b = row.typeB;
  let flags = 0;
  if (WALKER.has(a) || WALKER.has(b)) flags |= F_WALKER;
  if (BIKE.has(a) || BIKE.has(b)) flags |= F_BIKE;
  if (MOTOR.has(a) || MOTOR.has(b)) flags |= F_MOTOR;
  if (row.content === '1') flags |= F_DEATH;
  if (ELDER.has(row.ageA) || ELDER.has(row.ageB)) flags |= F_ELDER;
  if (CROSSING.has(row.shape)) flags |= F_CROSS;
  if (String(row.daynight).startsWith('2')) flags |= F_NIGHT;
  return flags;
}

/* Node の createReadStream は shift_jis を知らないので、読み込んでから TextDecoder で解く */
export async function readYear(file, statYear, onRow, tally) {
  const text = new TextDecoder('shift_jis').decode(await readFile(file));
  let index = null;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line.trim()) continue;
    const cells = splitRow(line);
    if (!index) {
      index = {};
      for (const [key, name] of Object.entries(COLUMNS)) {
        const at = cells.indexOf(name);
        if (at < 0) throw new Error(`${statYear}年のCSVに列「${name}」が無い（列数 ${cells.length}）`);
        index[key] = at;
      }
      tally.columns[statYear] = cells.length;
      continue;
    }
    tally.rows += 1;
    const lat = decodeDms(cells[index.lat], true);
    const lng = decodeDms(cells[index.lng], false);
    if (lat === null || lng === null || lat < 20 || lat > 46 || lng < 122 || lng > 154) {
      tally.dropped += 1;
      continue;
    }
    /* ⚠️ ファイル名の年は「統計年」で、事故が起きた年とは違う。
       honhyo_2024.csv には2023年の事故が8,477件入っている（重複は無い＝190万件を突き合わせて確認）。
       起きた年で持ちたいので、ファイル名ではなく列から取る */
    const year = Number(cells[index.year]);
    if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) {
      tally.outOfRange += 1;
      continue;
    }
    const hour = Number(cells[index.hour]);
    onRow({
      lat, lng, year,
      hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : -1,
      flags: flagsOf({
        typeA: cells[index.typeA], typeB: cells[index.typeB],
        ageA: cells[index.ageA], ageB: cells[index.ageB],
        content: cells[index.content], shape: cells[index.shape], daynight: cells[index.daynight],
      }),
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const srcAt = args.indexOf('--src');
  if (srcAt < 0) throw new Error('--src <CSVの置き場> を渡してください');
  const src = args[srcAt + 1];
  const outAt = args.indexOf('--out');
  const out = path.resolve(outAt < 0 ? 'data' : args[outAt + 1]);

  const tally = { rows: 0, dropped: 0, outOfRange: 0, columns: {}, walker: 0, bike: 0, death: 0, byYear: {} };
  const buckets = new Map(); /* 2次メッシュ → 行の配列 */

  for (let statYear = FIRST_YEAR; statYear <= LAST_YEAR; statYear += 1) {
    const file = path.join(src, `honhyo_${statYear}.csv`);
    let count = 0;
    await readYear(file, statYear, (row) => {
      count += 1;
      tally.byYear[row.year] = (tally.byYear[row.year] ?? 0) + 1;
      if (row.flags & F_WALKER) tally.walker += 1;
      if (row.flags & F_BIKE) tally.bike += 1;
      if (row.flags & F_DEATH) tally.death += 1;
      const code = meshCodeOf(row.lat, row.lng, 2);
      let bucket = buckets.get(code);
      if (!bucket) { bucket = []; buckets.set(code, bucket); }
      bucket.push(row);
    }, tally);
    process.stderr.write(`統計${statYear}年のファイル ${count.toLocaleString()}件\n`);
  }

  /* 件数の少ない2次メッシュは親の1次メッシュへまとめる */
  const files = new Map();
  for (const [code, rows] of buckets) {
    const key = rows.length >= SPLIT_AT ? code : parentMesh(code);
    const target = files.get(key) ?? [];
    target.push(...rows);
    files.set(key, target);
  }

  await rm(path.join(out, 'm'), { recursive: true, force: true });
  await mkdir(path.join(out, 'm'), { recursive: true });

  const index = {};
  let bytes = 0;
  for (const [code, rows] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const box = meshBounds(code);
    const buffer = new ArrayBuffer(HEADER_BYTES + rows.length * RECORD_BYTES);
    const view = new DataView(buffer);
    writeHeader(view, code.length, rows.length);
    /* 近いものが並ぶように緯度で並べ替えてから書く。読み出し側は順序に依存しない */
    rows.sort((a, b) => a.lat - b.lat);
    rows.forEach((row, i) => {
      const at = HEADER_BYTES + i * RECORD_BYTES;
      view.setUint16(at, quantize(row.lat, box.lat, box.latSpan), true);
      view.setUint16(at + 2, quantize(row.lng, box.lng, box.lngSpan), true);
      view.setUint8(at + 4, packTime(row.year, row.hour));
      view.setUint8(at + 5, row.flags);
    });
    await writeFile(path.join(out, 'm', `${code}.bin`), Buffer.from(buffer));
    index[code] = rows.length;
    bytes += buffer.byteLength;
  }

  const kept = tally.rows - tally.dropped - tally.outOfRange;
  const summary = {
    version: 1,
    years: [FIRST_YEAR, LAST_YEAR],
    total: kept,
    byYear: Object.fromEntries(Object.entries(tally.byYear).sort(([a], [b]) => Number(a) - Number(b))),
    walker: tally.walker,
    bike: tally.bike,
    death: tally.death,
    splitAt: SPLIT_AT,
    files: index,
  };
  await writeFile(path.join(out, 'index.json'), `${JSON.stringify(summary)}\n`);

  /* 検算。ここが合わないなら変換のどこかが壊れている */
  const indexed = Object.values(index).reduce((sum, n) => sum + n, 0);
  if (indexed !== kept) throw new Error(`件数が合わない: 索引${indexed} ≠ 取り込み${kept}`);

  process.stderr.write(
    `\n読み込み ${tally.rows.toLocaleString()}件 / 座標が読めず捨てた ${tally.dropped}件 / ` +
    `${FIRST_YEAR}年より前に起きたため捨てた ${tally.outOfRange.toLocaleString()}件\n` +
    `書き出し ${kept.toLocaleString()}件・${files.size}ファイル・${(bytes / 1024 / 1024).toFixed(1)}MB\n` +
    `歩行者 ${tally.walker.toLocaleString()} / 自転車 ${tally.bike.toLocaleString()} / 死亡 ${tally.death.toLocaleString()}\n` +
    `列数 ${JSON.stringify(tally.columns)}\n`,
  );
}

/* 直接呼ばれたときだけ走らせる。こう書いておかないと、decodeDms や flagsOf を
   テストから import しただけで変換が始まってしまう */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
}
