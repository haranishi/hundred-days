// 国土数値情報 行政区域データ 2025年版（tools/cache/n03/NN.geojson）から
// data/prefectures.json と data/towns/NN.json を作る。手元で1回走らせて出力を同梱する運用で、
// CI と実行時には使わない。入手は tools/fetch-n03.mjs。
//
// 使い方: node tools/build-data.mjs [NN ...] [--date YYYY-MM-DD]
//   県コードを省略すると 01〜47 すべて。--date は generatedAt の固定（再現用）。
//
// mapshaper は輪郭の融合（-dissolve）と単純化（-simplify）だけに使う。投影・島の取捨・
// 0〜1000 への正規化は lib/geo.js の純関数で行う（テストできる形にしたいので分けている）。
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { regionOfPref } from '../lib/regions.js';
import { dropSliverHoles, keepMainParts, normalizeShape, positionIn, projectParts } from '../lib/geo.js';

const run = promisify(execFile);
const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(TOOL_DIR, '..');
const CACHE_DIR = resolve(TOOL_DIR, 'cache/n03');
const WORK_DIR = resolve(TOOL_DIR, 'cache/work');
const DATA_DIR = resolve(APP_DIR, 'data');

const MAPSHAPER = ['-y', 'mapshaper@0.7.59'];
/* 単純化の強さ（メートル）。市町村は 100m で点数の中央値が152、県は 300m で500になる。
   40m まで細かくしても 480px の枠では見分けが付かず、データだけ倍近くになる（実測して 100m にした） */
const TOWN_INTERVAL = '100m';
const PREF_INTERVAL = '300m';
const PREF_CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));
/* 北方領土の6村。日本の行政区域データには載るが、市町村の問題としては出さない。
   後志総合振興局の泊村（01403）は同じ村名でも別物なので残す */
const NORTHERN_TERRITORY_CODES = new Set(['01695', '01696', '01697', '01698', '01699', '01700']);

const isUnassigned = (code) => /000$/.test(String(code ?? ''));
const partsOf = (geometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

/* 政令市の区は市に融合する。2025年版のデータでは N03_004 が市名・N03_005 が区名で、
   市そのもののコードは入っていない（区のコードだけ）。市のコードは区コードの最小値を
   10 の位で切り下げた値になる（横浜市 14101→14100、川崎市 14131→14130、大阪市 27102→27100）。
   20市すべてで総務省コードと一致することを実データで確認済み。 */
function cityCodeOfWards(wardCodes) {
  const lowest = [...wardCodes].sort()[0];
  return String(Math.floor(Number(lowest) / 10) * 10).padStart(5, '0');
}

/** geojson の feature を市区町村単位にまとめる。落としたものは excluded に理由付きで残す */
function collectTowns(features, prefCode) {
  const isHokkaido = prefCode === '01';
  const wardsByCity = new Map();
  const excluded = [];
  const rows = [];
  for (const feature of features) {
    const properties = feature.properties;
    const code = properties.N03_007;
    if (!code || isUnassigned(code)) {
      excluded.push({ reason: '所属未定地', name: properties.N03_004, code });
      continue;
    }
    if (NORTHERN_TERRITORY_CODES.has(code)) {
      excluded.push({ reason: '北方領土', name: properties.N03_004, code });
      continue;
    }
    rows.push({ properties, geometry: feature.geometry, code });
    if (properties.N03_005) {
      const cityName = properties.N03_004;
      if (!wardsByCity.has(cityName)) wardsByCity.set(cityName, new Set());
      wardsByCity.get(cityName).add(code);
    }
  }
  const cityCodes = new Map();
  for (const [city, wardCodes] of wardsByCity) cityCodes.set(city, cityCodeOfWards(wardCodes));

  const towns = new Map();
  const shapes = [];
  for (const row of rows) {
    const properties = row.properties;
    const merged = properties.N03_005 ? cityCodes.get(properties.N03_004) : row.code;
    if (!towns.has(merged)) {
      const name = properties.N03_004;
      /* 郡名（N03_003）は「郡」で終わるものだけ。2025年版では全件そうだが、
         政令市名が入っていた過去の版を読ませても壊れないようにしておく。
         北海道は郡ではなく振興局（N03_002）を出す */
      const county = /郡$/.test(properties.N03_003 ?? '') ? properties.N03_003 : null;
      const district = isHokkaido ? (properties.N03_002 || null) : county;
      towns.set(merged, { code: merged, name, kind: name.slice(-1), district: district || null });
    }
    shapes.push({ code: merged, geometry: row.geometry });
  }
  return { towns, shapes, excluded };
}

/** mapshaper で同じコードの feature を融合し、単純化する。戻りは code → MultiPolygon の座標 */
async function dissolveAndSimplify(prefCode, shapes) {
  await mkdir(WORK_DIR, { recursive: true });
  const inputPath = resolve(WORK_DIR, `${prefCode}-in.json`);
  const townPath = resolve(WORK_DIR, `${prefCode}-towns.json`);
  const prefPath = resolve(WORK_DIR, `${prefCode}-pref.json`);
  await writeFile(inputPath, JSON.stringify({
    type: 'FeatureCollection',
    features: shapes.map((shape) => ({ type: 'Feature', properties: { code: shape.code }, geometry: shape.geometry })),
  }));
  await run('npx', [...MAPSHAPER, inputPath,
    '-dissolve', 'code', '-simplify', `interval=${TOWN_INTERVAL}`, 'keep-shapes',
    '-o', townPath, 'format=geojson'], { maxBuffer: 1 << 26 });
  // 県の輪郭は市町村の輪郭をさらに融合して作る。除外した所属未定地と北方領土がここにも入らない
  await run('npx', [...MAPSHAPER, townPath,
    '-dissolve', '-simplify', `interval=${PREF_INTERVAL}`, 'keep-shapes',
    '-o', prefPath, 'format=geojson'], { maxBuffer: 1 << 26 });
  const townCollection = JSON.parse(await readFile(townPath, 'utf8'));
  const prefCollection = JSON.parse(await readFile(prefPath, 'utf8'));
  const byCode = new Map();
  for (const feature of townCollection.features) byCode.set(feature.properties.code, partsOf(feature.geometry));
  await Promise.all([rm(inputPath, { force: true }), rm(townPath, { force: true }), rm(prefPath, { force: true })]);
  // 属性が1つも無い出力を mapshaper は GeometryCollection で書く（-dissolve でフィールドを指定しないとき）
  const prefGeometry = prefCollection.features?.[0]?.geometry ?? prefCollection.geometries?.[0];
  if (!prefGeometry) throw new Error(`${prefCode}: 県の輪郭が作れなかった`);
  return { byCode, prefParts: partsOf(prefGeometry) };
}

const pointsIn = (rings) => rings.reduce((total, ring) => total + ring.length / 2, 0);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

async function buildPrefecture(prefCode) {
  const geojson = JSON.parse(await readFile(resolve(CACHE_DIR, `${prefCode}.geojson`), 'utf8'));
  const prefName = geojson.features[0].properties.N03_001;
  const { towns, shapes, excluded } = collectTowns(geojson.features, prefCode);
  const { byCode, prefParts } = await dissolveAndSimplify(prefCode, shapes);

  /* 県の輪郭だけは離島の足切りを厳しくする（既定の 1.5 ではなく 1.0）。
     県の枠はヒントの地図の下敷きでもあり、遠い島を1つ残すだけで本体が枠の上端に潰れて
     位置が読めなくなる。東京都が実例で、伊豆大島を入れると本土が枠の高さの17%になった。
     1.0 なら佐渡・隠岐・淡路島・小豆島・種子島・屋久島・天草は残り、東京都は本土だけになる。
     市区町村の側は既定の 1.5 のまま（2つの島でできた町は、その2つで1つの形なので落とさない）。 */
  const prefKept = dropSliverHoles(keepMainParts(prefParts, { distanceRatio: 1 }));
  const prefShape = normalizeShape(prefKept);
  const droppedPrefParts = prefParts.length - prefKept.length;

  const items = [];
  const farNames = [];
  for (const code of [...towns.keys()].sort()) {
    const town = towns.get(code);
    const parts = byCode.get(code);
    if (!parts) throw new Error(`${prefCode}: ${code} の形が mapshaper の出力にない`);
    const kept = dropSliverHoles(keepMainParts(parts));
    const { rings } = normalizeShape(kept);
    if (!rings.length) throw new Error(`${prefCode}: ${code} ${town.name} の形が空になった`);
    const placed = positionIn(prefShape.frame, projectParts(kept, prefShape.frame.centerLatitude));
    if (!placed) throw new Error(`${prefCode}: ${code} ${town.name} の位置が測れない`);
    if (placed.far) farNames.push(town.name);
    items.push({
      code,
      name: town.name,
      kind: town.kind,
      district: town.district,
      pos: placed.pos,
      // 枠に収まる町には項目ごと付けない（false を1741件ぶん書かない）
      ...(placed.far ? { far: true } : {}),
      shape: { rings },
    });
  }

  return {
    code: prefCode,
    name: prefName,
    region: regionOfPref(prefCode)?.id ?? null,
    prefShape: prefShape.rings,
    items,
    excluded,
    droppedPrefParts,
    farNames,
    sourceFeatures: geojson.features.length,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const requested = [];
  let generatedAt = new Date().toISOString().slice(0, 10);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--date') {
      generatedAt = argv[index + 1];
      index += 1;
    } else if (!argv[index].startsWith('-')) {
      requested.push(argv[index]);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(generatedAt)) throw new Error('--date は YYYY-MM-DD で渡す');
  const codes = requested.length ? requested.map((value) => value.padStart(2, '0')) : PREF_CODES;
  const unknown = codes.filter((code) => !PREF_CODES.includes(code));
  if (unknown.length) throw new Error(`県コードが不正: ${unknown.join(', ')}`);

  await mkdir(resolve(DATA_DIR, 'towns'), { recursive: true });
  const prefectures = [];
  const townPointCounts = [];
  const prefPointCounts = [];
  const allExcluded = [];
  const perPref = [];

  for (const prefCode of codes) {
    const built = await buildPrefecture(prefCode);
    const townsFile = {
      pref: built.code,
      prefName: built.name,
      items: built.items,
    };
    const path = resolve(DATA_DIR, `towns/${prefCode}.json`);
    await writeFile(path, `${JSON.stringify(townsFile)}\n`);
    const size = (await stat(path)).size;
    const points = built.items.map((item) => pointsIn(item.shape.rings));
    townPointCounts.push(...points);
    prefPointCounts.push(pointsIn(built.prefShape));
    allExcluded.push(...built.excluded.map((row) => ({ ...row, pref: built.name })));
    prefectures.push({
      code: built.code,
      name: built.name,
      region: built.region,
      towns: built.items.length,
      shape: { rings: built.prefShape },
    });
    perPref.push({
      code: built.code,
      name: built.name,
      towns: built.items.length,
      minPoints: Math.min(...points),
      medianPoints: median(points),
      maxPoints: Math.max(...points),
      prefPoints: pointsIn(built.prefShape),
      droppedPrefParts: built.droppedPrefParts,
      farNames: built.farNames,
      kb: Math.round(size / 1024),
    });
    const last = perPref[perPref.length - 1];
    console.log(`${built.code} ${built.name}\t${last.towns}件\t点 ${last.minPoints}/${last.medianPoints}/${last.maxPoints}\t県 ${last.prefPoints}点\t${last.kb}KB`);
  }

  if (codes.length === PREF_CODES.length) {
    const path = resolve(DATA_DIR, 'prefectures.json');
    await writeFile(path, `${JSON.stringify({
      version: 1,
      generatedAt,
      source: '国土数値情報（行政区域データ）2025年版（国土交通省）を加工',
      items: prefectures,
    })}\n`);
    const size = (await stat(path)).size;
    const total = prefectures.reduce((sum, pref) => sum + pref.towns, 0);
    console.log(`\n市区町村 合計 ${total}件（期待 1741）`);
    console.log(`町の点 最小 ${Math.min(...townPointCounts)} / 中央値 ${median(townPointCounts)} / 最大 ${Math.max(...townPointCounts)}`);
    console.log(`県の点 最小 ${Math.min(...prefPointCounts)} / 中央値 ${median(prefPointCounts)} / 最大 ${Math.max(...prefPointCounts)}`);
    console.log(`prefectures.json ${Math.round(size / 1024)}KB / towns 合計 ${perPref.reduce((sum, row) => sum + row.kb, 0)}KB`);
    const byReason = new Map();
    for (const row of allExcluded) byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
    console.log(`除外 ${allExcluded.length}件: ${[...byReason].map(([reason, count]) => `${reason} ${count}`).join(' / ')}`);
    const names = [...new Set(allExcluded.map((row) => `${row.pref}${row.name}(${row.code})`))];
    console.log(`除外の内訳: ${names.join('、')}`);
    const farRows = perPref.filter((row) => row.farNames.length);
    const farTotal = farRows.reduce((sum, row) => sum + row.farNames.length, 0);
    console.log(`far（県の枠の外＝posは縁に寄せた値）${farTotal}件`);
    for (const row of farRows) console.log(`  ${row.name} ${row.farNames.length}件: ${row.farNames.join('、')}`);
    await writeFile(resolve(WORK_DIR, 'report.json'), `${JSON.stringify({ perPref, total }, null, 2)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
