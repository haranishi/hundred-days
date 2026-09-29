import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFECTURES, parseOnsenTable, parseSentoSeries, parseSentoTable } from '../tools/build-stats.mjs';

// 小さなフィクスチャ。環境省の表は1行に数字が20個（千の区切りはカンマ）
const NAMES = PREFECTURES.map(([, name]) => name);
const onsenNumbers = (index) => Array.from({ length: 20 }, (_, column) => (index + 1) * 100 + column * 7 + (column === 12 ? 1000 : 0));
const format = (value) => value.toLocaleString('en-US');

function onsenText({ drop = null, broken = null, totalDelta = 0, withTotal = true } = {}) {
  const lines = ['令和６年度 温泉利用状況', '都道府県  温泉地数  源泉総数 …（見出し）'];
  const total = Array(20).fill(0);
  NAMES.forEach((name, index) => {
    if (name === drop) return;
    const numbers = onsenNumbers(index);
    numbers.forEach((value, column) => { total[column] += value; });
    const cells = name === broken ? numbers.slice(0, 19) : numbers;
    lines.push(`  ${name}    ${cells.map(format).join('   ')}`);
  });
  total[3] += totalDelta;
  if (withTotal) lines.push(`令和６年度計  ${total.map(format).join('  ')}`);
  lines.push('注：温泉地数は宿泊施設のある場所を計上');
  return lines.join('\n');
}

test('parseOnsenTable: 47都道府県の5列と「計」を読み、県の和と計が合う', () => {
  const { rows, total } = parseOnsenTable(onsenText());
  assert.equal(rows.size, 47);
  const akita = onsenNumbers(4);
  assert.deepEqual(rows.get('秋田県'), { areas: akita[2], sources: akita[3], flow: akita[12], lodgings: akita[15], onsenBaths: akita[18] });
  assert.equal(rows.get('北海道').sources, onsenNumbers(0)[3]);
  assert.equal(total.flow, NAMES.reduce((sum, _, index) => sum + onsenNumbers(index)[12], 0));
});

test('parseOnsenTable: 合計が合わない・数字が足りない・県が欠けると止まる', () => {
  assert.throws(() => parseOnsenTable(onsenText({ totalDelta: 1 })), /sourcesが合計と合いません（県の和\d+・計\d+）/);
  assert.throws(() => parseOnsenTable(onsenText({ broken: '秋田県' })), /秋田県（数字19個）/);
  assert.throws(() => parseOnsenTable(onsenText({ drop: '沖縄県' })), /47都道府県を読めません（46件）/);
  assert.throws(() => parseOnsenTable(onsenText({ withTotal: false })), /令和６年度計/);
});

// 第9表：全国の行の後に47都道府県、そのあと指定都市などの再掲。一般公衆浴場＝列3（公営）＋列6（私営）
function sentoCsv({ nationalDelta = 0, withNational = true } = {}) {
  const lines = ['第9表 公衆浴場数,,,,,,,', '都道府県,総数,公営,一般公衆浴場,その他,私営,一般公衆浴場,その他'];
  let sum = 0;
  const rows = NAMES.map((name, index) => {
    const publicBaths = index % 5 === 0 ? '-' : String(index % 3);
    const privateBaths = String(index * 2);
    sum += (publicBaths === '-' ? 0 : Number(publicBaths)) + Number(privateBaths);
    return [name, '999', '9', publicBaths, '9', '99', privateBaths, '9'].join(',');
  });
  if (withNational) lines.push(['全国', '9999', '99', '-', '9', '999', String(sum + nationalDelta), '9'].join(','));
  lines.push(...rows, '札幌市,1,1,1,1,1,1,1');
  return { text: lines.join('\r\n'), sum };
}

test('parseSentoTable: 全国の次の47行を読み、「-」は0として県の和が全国と合う', () => {
  const { text, sum } = sentoCsv();
  const { rows, national } = parseSentoTable(text);
  assert.equal(rows.size, 47);
  assert.equal(national, sum);
  // 北海道（index 0）は公営が「-」＝0、私営0 → 0
  assert.equal(rows.get('北海道'), 0);
  // 秋田県（index 4）は公営 4%3=1 ＋ 私営 8
  assert.equal(rows.get('秋田県'), 9);
  assert.equal(rows.has('札幌市'), false);
});

test('parseSentoTable: 全国と合わない・全国の行が無いと止まる', () => {
  assert.throws(() => parseSentoTable(sentoCsv({ nationalDelta: 3 }).text), /一般公衆浴場が合いません/);
  assert.throws(() => parseSentoTable(sentoCsv({ withNational: false }).text), /「全国」の行がありません/);
});

test('parseSentoSeries: 千の区切りが空白の5年分を読む', () => {
  const text = [
    '表４ 生活衛生関係営業施設数の年次推移',
    '             令和２年度  ３年度  ４年度  ５年度  ６年度   対前年度増減数',
    '  一般公衆浴場      3 231      3 120      3 000      2 847      2 730     △ 117',
    '  その他の公衆浴場  20 000     20 100     ...',
  ].join('\n');
  assert.deepEqual(parseSentoSeries(text), [
    { fy: 2020, count: 3231 }, { fy: 2021, count: 3120 }, { fy: 2022, count: 3000 }, { fy: 2023, count: 2847 }, { fy: 2024, count: 2730 },
  ]);
});

test('parseSentoSeries: 行が無い・5年分そろわないと止まる', () => {
  assert.throws(() => parseSentoSeries('  その他の公衆浴場  1 2 3'), /「一般公衆浴場」の行がありません/);
  assert.throws(() => parseSentoSeries('  一般公衆浴場   3 231   3 120'), /5年分読めません/);
});

test('PREFECTURES: 47都道府県が01→47の順で、県庁所在地のコードを持つ', () => {
  assert.equal(PREFECTURES.length, 47);
  PREFECTURES.forEach(([code, , , cityCode], index) => {
    assert.equal(code, String(index + 1).padStart(2, '0'));
    assert.match(cityCode, new RegExp(`^${code}\\d{3}$`));
  });
});
