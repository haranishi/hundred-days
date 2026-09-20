/* 市区町村1805件の同梱データ（data/towns.json）を作る。
   入力は気象庁の area.json（階層）と class20relm.json（外接矩形）、
   それに Day 015 の代表点。実行時に気象庁へ取りに行くのは確率の本体だけにしたいので、
   引き当てに使う表はここで作って焼き込む。

   node day-042-typhoon-coming/tools/build-towns.mjs

   ⚠️ 並び順は JSON.parse したオブジェクトのキー順から取れない。先頭が0のコードが
   後ろへ回るため（docs/data-discovery.md 参照）、文字列のまま出現順を読む。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const AREA = here('../tests/fixtures/area.json');
const RELM = here('../tests/fixtures/class20relm.json');
const POINTS = here('../../day-015-town-stats/data/points.json');
const OUT = here('../data/towns.json');

export const EXPECTED_TOWNS = 1805;
/* 日本の範囲。南は沖ノ鳥島（北緯20.4度）、東は南鳥島（東経154.0度）まで入る */
export const JAPAN = { minLat: 20, maxLat: 46, minLng: 122, maxLng: 154 };

/** area.json の class20s のキーを、ファイルに書かれている順（北→南）で返す */
export function readOrder(rawArea) {
  const from = rawArea.indexOf('"class20s"');
  if (from < 0) throw new Error('area.json に class20s が無い');
  return [...rawArea.slice(from).matchAll(/"(\d{7})":/g)].map((match) => match[1]);
}

/* offices の名前はたいてい都道府県名そのものだが、14件だけ管轄の名前になっている
   （北海道7件・沖縄4件・鹿児島2件・奄美）。画面には「千代田区（東京都）」の形で出して
   都道府県で見分けてもらうので、この3道県だけコードの上2桁（JISの都道府県コード）で寄せる。
   「鹿児島県（奄美地方除く）」のような括弧付きは、括弧を落とせば都道府県名になる */
const SPLIT = { '01': '北海道', 46: '鹿児島県', 47: '沖縄県' };
export function prefName(officeCode, officeLabel) {
  const trimmed = String(officeLabel).replace(/（.*）$/, '');
  if (/[都道府県]$/.test(trimmed)) return trimmed;
  return SPLIT[officeCode.slice(0, 2)] ?? officeLabel;
}

const round = (value, digits) => Number(value.toFixed(digits));

export function buildTowns({ area, relm, points, order }) {
  const towns = [];
  const problems = [];
  order.forEach((code, index) => {
    const town = area.class20s[code];
    const box = relm[code];
    if (!town || !box) { problems.push(`${code} の定義か外接矩形が無い`); return; }
    const areaCode = town.parent;
    const class15 = area.class15s[areaCode];
    /* 階層をまたいで同じコード文字列が使われる（小笠原諸島の 130040 は class15s にも
       class10s にもある）。辞書を混ぜず、1段ずつその階層の中だけで引く */
    const class10 = class15 && area.class10s[class15.parent];
    const office = class10 && area.offices[class10.parent];
    if (!class15 || !class10 || !office) { problems.push(`${code} から都道府県までたどれない`); return; }

    const point = points[code.slice(0, 5)];
    const center = [(box.sw[1] + box.ne[1]) / 2, (box.sw[0] + box.ne[0]) / 2];
    const [lng, lat] = point ?? center;
    towns.push({
      code,
      name: town.name,
      kana: town.kana ?? '',
      pref: prefName(class10.parent, office.name),
      area: areaCode,
      areaName: class15.name,
      lng: round(lng, 4),
      lat: round(lat, 4),
      /* 現在地から市区町村を当てるのに使う外接矩形（気象庁の台風ページと同じ引き方）。
         [南, 西] と [北, 東]。緯度経度の順は class20relm.json のまま */
      sw: [round(box.sw[0], 4), round(box.sw[1], 4)],
      ne: [round(box.ne[0], 4), round(box.ne[1], 4)],
      order: index,
    });
  });
  if (problems.length) throw new Error(problems.join(' / '));
  return towns;
}

/** 作ったあとに数えて確かめる。合わないなら表のどこかが壊れている */
export function verifyTowns(towns, area) {
  const errors = [];
  if (towns.length !== EXPECTED_TOWNS) errors.push(`市区町村が${EXPECTED_TOWNS}件ではない: ${towns.length}`);
  for (const town of towns) {
    if (!area.class15s[town.area]) errors.push(`${town.code} の地域コード ${town.area} が class15s に無い`);
    if (!town.kana) errors.push(`${town.code} に読みが無い`);
    if (town.lat < JAPAN.minLat || town.lat > JAPAN.maxLat || town.lng < JAPAN.minLng || town.lng > JAPAN.maxLng) {
      errors.push(`${town.code} の代表点が日本の外: ${town.lat},${town.lng}`);
    }
  }
  const labels = new Set(towns.map((town) => `${town.name}（${town.pref}）`));
  return { errors, duplicateLabels: towns.length - labels.size };
}

export function main() {
  const rawArea = readFileSync(AREA, 'utf8');
  const area = JSON.parse(rawArea);
  const relm = JSON.parse(readFileSync(RELM, 'utf8'));
  const points = JSON.parse(readFileSync(POINTS, 'utf8'));
  const towns = buildTowns({ area, relm, points, order: readOrder(rawArea) });
  const { errors, duplicateLabels } = verifyTowns(towns, area);
  if (errors.length) throw new Error(errors.slice(0, 10).join('\n'));

  const json = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: '気象庁 common/const/area.json・class20relm.json（2026-09-18取得）と、Day 015 の市区町村代表点',
    towns,
  };
  writeFileSync(OUT, `${JSON.stringify(json)}\n`);
  const withPoint = towns.filter((town) => points[town.code.slice(0, 5)]).length;
  process.stderr.write(
    `towns.json: ${towns.length}件 / 地域 ${new Set(towns.map((t) => t.area)).size}件 / `
    + `Day 015 の代表点を使えた ${withPoint}件・外接矩形の中心にした ${towns.length - withPoint}件 / `
    + `名前と都道府県が同じ組 ${duplicateLabels}件\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
