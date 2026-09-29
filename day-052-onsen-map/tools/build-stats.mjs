#!/usr/bin/env node
// 国の統計3つから data/stats.json を作る。どれも tools/cache/ に置いた原本を読み、合計が原本の「計」と合わなければ止まる。
//   env-onsen-r6.pdf                    環境省「令和６年度温泉利用状況」（令和7年3月末現在）
//   estat-r6-table9-public-baths.csv    厚生労働省「令和6年度衛生行政報告例」第9表 公衆浴場数（e-Stat・Shift_JIS）
//   mhlw-eisei-r6-kekka3.pdf            同 概況「生活衛生関係」表4（一般公衆浴場の年次推移）
// PDF の文字は pdftotext（poppler）で取り出す。
// 柱を立てる位置は Day 015 の data/points.json（国勢調査2020の人口加重重心）から県庁所在地の点を写す。
// 使い方: node tools/build-stats.mjs [--date YYYY-MM-DD]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CACHE = new URL('./cache/', import.meta.url);
const OUTPUT = new URL('../data/stats.json', import.meta.url);
const DAY015_POINTS = new URL('../../day-015-town-stats/data/points.json', import.meta.url);

export const PREFECTURES = [
  ['01', '北海道', '札幌市', '01100'], ['02', '青森県', '青森市', '02201'], ['03', '岩手県', '盛岡市', '03201'],
  ['04', '宮城県', '仙台市', '04100'], ['05', '秋田県', '秋田市', '05201'], ['06', '山形県', '山形市', '06201'],
  ['07', '福島県', '福島市', '07201'], ['08', '茨城県', '水戸市', '08201'], ['09', '栃木県', '宇都宮市', '09201'],
  ['10', '群馬県', '前橋市', '10201'], ['11', '埼玉県', 'さいたま市', '11100'], ['12', '千葉県', '千葉市', '12100'],
  ['13', '東京都', '新宿区', '13104'], ['14', '神奈川県', '横浜市', '14100'], ['15', '新潟県', '新潟市', '15100'],
  ['16', '富山県', '富山市', '16201'], ['17', '石川県', '金沢市', '17201'], ['18', '福井県', '福井市', '18201'],
  ['19', '山梨県', '甲府市', '19201'], ['20', '長野県', '長野市', '20201'], ['21', '岐阜県', '岐阜市', '21201'],
  ['22', '静岡県', '静岡市', '22100'], ['23', '愛知県', '名古屋市', '23100'], ['24', '三重県', '津市', '24201'],
  ['25', '滋賀県', '大津市', '25201'], ['26', '京都府', '京都市', '26100'], ['27', '大阪府', '大阪市', '27100'],
  ['28', '兵庫県', '神戸市', '28100'], ['29', '奈良県', '奈良市', '29201'], ['30', '和歌山県', '和歌山市', '30201'],
  ['31', '鳥取県', '鳥取市', '31201'], ['32', '島根県', '松江市', '32201'], ['33', '岡山県', '岡山市', '33100'],
  ['34', '広島県', '広島市', '34100'], ['35', '山口県', '山口市', '35203'], ['36', '徳島県', '徳島市', '36201'],
  ['37', '香川県', '高松市', '37201'], ['38', '愛媛県', '松山市', '38201'], ['39', '高知県', '高知市', '39201'],
  ['40', '福岡県', '福岡市', '40130'], ['41', '佐賀県', '佐賀市', '41201'], ['42', '長崎県', '長崎市', '42201'],
  ['43', '熊本県', '熊本市', '43100'], ['44', '大分県', '大分市', '44201'], ['45', '宮崎県', '宮崎市', '45201'],
  ['46', '鹿児島県', '鹿児島市', '46201'], ['47', '沖縄県', '那覇市', '47201'],
];

const toNumber = (text) => Number(String(text).replace(/[,\s]/g, ''));

// 環境省の表は1行に数字が20個並ぶ。使うのは温泉地数(3)・源泉総数(4)・湧出量計(13)・宿泊施設数(16)・温泉利用の公衆浴場数(19)
export function parseOnsenTable(text) {
  const rows = new Map();
  let total = null;
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(北海道|東京都|京都府|大阪府|\S{2,3}県|令和６年度計)\s+([\d,\s]+)$/);
    if (!match) continue;
    const numbers = match[2].trim().split(/\s+/).map(toNumber);
    if (numbers.length !== 20 || numbers.some((value) => !Number.isFinite(value))) {
      throw new Error(`環境省の表の行を読めません: ${match[1]}（数字${numbers.length}個）`);
    }
    const row = { areas: numbers[2], sources: numbers[3], flow: numbers[12], lodgings: numbers[15], onsenBaths: numbers[18] };
    if (match[1] === '令和６年度計') total = row;
    else rows.set(match[1], row);
  }
  if (rows.size !== 47) throw new Error(`環境省の表から47都道府県を読めません（${rows.size}件）`);
  if (!total) throw new Error('環境省の表に「令和６年度計」がありません');
  for (const key of Object.keys(total)) {
    const sum = [...rows.values()].reduce((acc, row) => acc + row[key], 0);
    if (sum !== total[key]) throw new Error(`環境省の表の${key}が合計と合いません（県の和${sum}・計${total[key]}）`);
  }
  return { rows, total };
}

// 第9表は「全国」の次に47都道府県が並び、そのあと指定都市・中核市の再掲が続く。
// 一般公衆浴場（いわゆる銭湯）＝公営の一般公衆浴場(列3)＋私営の一般公衆浴場(列6)。「-」は0
export function parseSentoTable(csvText) {
  const lines = csvText.split(/\r?\n/).map((line) => line.split(','));
  const start = lines.findIndex((cells) => cells[0] === '全国');
  if (start === -1) throw new Error('第9表に「全国」の行がありません');
  const value = (cell) => (cell === '-' || cell === '' ? 0 : toNumber(cell));
  const sento = (cells) => value(cells[3]) + value(cells[6]);
  const national = sento(lines[start]);
  const rows = new Map();
  for (const cells of lines.slice(start + 1, start + 48)) rows.set(cells[0], sento(cells));
  const sum = [...rows.values()].reduce((acc, count) => acc + count, 0);
  if (rows.size !== 47 || sum !== national) throw new Error(`第9表の一般公衆浴場が合いません（県の和${sum}・全国${national}）`);
  return { rows, national };
}

// 概況の表4「一般公衆浴場」の行。千の位の区切りが半角空白（3 231）なので、まとまりで拾う
export function parseSentoSeries(text) {
  const line = text.split('\n').find((row) => /^\s*一般公衆浴場\s/.test(row));
  if (!line) throw new Error('概況の表4に「一般公衆浴場」の行がありません');
  const numbers = [...line.matchAll(/\d{1,3}(?: \d{3})*/g)].slice(0, 5).map((match) => toNumber(match[0]));
  if (numbers.length !== 5) throw new Error('一般公衆浴場の年次推移を5年分読めません');
  return [2020, 2021, 2022, 2023, 2024].map((fy, index) => ({ fy, count: numbers[index] }));
}

const pdfText = (name) => execFileSync('pdftotext', ['-layout', new URL(name, CACHE).pathname, '-'], { encoding: 'utf8' });

function parseDate(argv) {
  const index = argv.indexOf('--date');
  if (index === -1) return new Date().toISOString().slice(0, 10);
  const value = argv[index + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error('--date は YYYY-MM-DD で指定してください');
  return value;
}

function main(argv) {
  const onsen = parseOnsenTable(pdfText('env-onsen-r6.pdf'));
  const csv = new TextDecoder('shift_jis').decode(readFileSync(new URL('estat-r6-table9-public-baths.csv', CACHE)));
  const sento = parseSentoTable(csv);
  const series = parseSentoSeries(pdfText('mhlw-eisei-r6-kekka3.pdf'));
  if (series.at(-1).count !== sento.national) throw new Error(`概況の2024年度(${series.at(-1).count})と第9表(${sento.national})が合いません`);
  const points = JSON.parse(readFileSync(DAY015_POINTS, 'utf8'));

  const prefectures = PREFECTURES.map(([code, name, capital, cityCode]) => {
    const onsenRow = onsen.rows.get(name);
    if (!onsenRow) throw new Error(`環境省の表に${name}がありません`);
    if (!sento.rows.has(name)) throw new Error(`第9表に${name}がありません`);
    const point = points[cityCode];
    if (!Array.isArray(point)) throw new Error(`Day 015 の点に${capital}(${cityCode})がありません`);
    return { code, name, capital: { name: capital, lng: point[0], lat: point[1] }, ...onsenRow, sento: sento.rows.get(name) };
  });

  const output = {
    generatedAt: parseDate(argv),
    national: { ...onsen.total, sento: sento.national, sentoSeries: series },
    prefectures,
    sources: {
      onsen: {
        title: '令和６年度温泉利用状況',
        publisher: '環境省',
        asOf: '2025-03-31',
        url: 'https://www.env.go.jp/nature/onsen/pdf/6-7_p_1.pdf',
        note: '温泉地数は宿泊施設のある場所を計上（原表の注）',
      },
      sento: {
        title: '令和6年度衛生行政報告例 第9表 公衆浴場数',
        publisher: '厚生労働省',
        asOf: '2025-03-31',
        url: 'https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040359177&fileKind=1',
        note: '一般公衆浴場（いわゆる銭湯）＝公営＋私営の一般公衆浴場',
      },
      sentoSeries: {
        title: '令和６（2024）年度衛生行政報告例の概況 表4',
        publisher: '厚生労働省',
        url: 'https://www.mhlw.go.jp/toukei/saikin/hw/eisei_houkoku/24/dl/kekka3.pdf',
      },
      capitals: {
        title: '柱の位置は県庁所在地の人口加重重心（Day 015 が国勢調査2020の境界データから作成）',
        url: 'https://www.e-stat.go.jp/gis',
      },
    },
  };
  writeFileSync(OUTPUT, `${JSON.stringify(output, null, 1)}\n`);
  const top = (key) => [...prefectures].sort((a, b) => b[key] - a[key]).slice(0, 3).map((pref) => `${pref.name}${pref[key]}`).join('・');
  console.log('源泉数', top('sources'), '／温泉地数', top('areas'), '／湧出量', top('flow'), '／銭湯', top('sento'));
  console.log('全国', output.national);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
