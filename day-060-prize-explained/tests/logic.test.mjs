import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ageAt, parseAge } from '../lib/age.js';
import { summarize, mergeAwards } from '../lib/stats.js';
import { answerText, shareText, nearestText, notesOf } from '../lib/text.js';
import { bandSvg } from '../lib/band.js';
import { readNow, timeText, afterWeek } from '../lib/clock.js';
import { schedule, announcementState, scheduleText } from '../lib/announcements.js';
const data = JSON.parse(readFileSync(new URL('../data/laureates.json', import.meta.url)));
for (const [id, expected] of [['914',17], ['21',25], ['976',97], ['863',68], ['54',42], ['1049',74]]) {
  test(`確認値 ${id} は ${expected}歳`, () => {
    const row = data.awards.find((one) => one.id === id);
    assert.ok(row); assert.equal(ageAt(row).age, expected);
    if (id === '863') assert.equal(ageAt(row).posthumous, true);
  });
}
test('同梱の総数・中央値・30歳未満と0人の近い歳', () => {
  const result = summarize(data.awards, 26);
  assert.equal(result.total, 1001); assert.equal(result.median, 60);
  assert.equal(result.youngest.age, 17); assert.equal(result.oldest.age, 97);
  assert.equal(summarize(data.awards, 30).younger, 3);
  assert.equal(result.matches.length, 0); assert.equal(result.younger, 3);
  assert.equal(nearestText(result), '近いのは25歳の2人と30歳の1人');
});
test('54歳は新しい年から・分野は合計と一覧の両方に効く', () => {
  const result = summarize(data.awards, 54);
  assert.equal(result.matches.length, 34);
  assert.equal(result.matches[0].year, 2026);
  const physics = summarize(data.awards, 54, 'phy');
  assert.ok(physics.total < result.total); assert.ok(physics.matches.every((row) => row.cat === 'phy'));
});
test('日付の境界・不明な月日・発表日なし・没後・辞退', () => {
  const base = { born:'1950-10-06', date:'2026-10-05', year:2026 };
  assert.equal(ageAt(base).age,75); assert.equal(ageAt({...base,date:'2026-10-06'}).age,76);
  assert.deepEqual(ageAt({...base,born:'1950-00-00'}), { age:76, approximate:true, posthumous:false });
  assert.equal(ageAt({...base,born:'1950-12-00'}).age,76, '部分不明も7月1日');
  assert.equal(ageAt({...base,date:null}).approximate,true);
  assert.equal(ageAt({...base,died:'2026-10-04'}).posthumous,true);
  assert.equal(ageAt({...base,died:'2026-10-05'}).posthumous,false);
  assert.equal(ageAt({...base,born:null}).age,null);
  assert.equal(notesOf({approximate:true,posthumous:true,status:'restricted'}),'生まれた月日が不明・発表の前に死去・辞退を強いられた');
  assert.equal(notesOf({status:'declined'}),'辞退'); assert.equal(notesOf({status:'received'}),'');
});
test('重複はID・年・分野、新しい値と日本語名を保持する', () => {
  const first = data.awards[0];
  const merged = mergeAwards([first], [{...first, ja:null, born:'1970-01-01'}]);
  assert.equal(merged.length,1); assert.equal(merged[0].born,'1970-01-01'); assert.equal(merged[0].ja,first.ja);
  assert.equal(mergeAwards([first],[{...first,year:2027},{...first,cat:'phy'}]).length,3);
});
test('入力は空・整数1〜120・それ以外を区別', () => {
  assert.equal(parseAge('').state,'empty');
  for(const raw of ['1','17','120',' 26 ']) assert.equal(parseAge(raw).state,'valid');
  for(const raw of ['abc','0','121','1.2','-1','1e2','Infinity']) assert.equal(parseAge(raw).state,'invalid');
});
test('文面・分野の主語・共有の題名', () => {
  assert.equal(answerText(26,'all',0),'26歳で受賞した人は、まだいません');
  assert.equal(answerText(54,'phy',2),'物理学賞を54歳で受賞した人は、2人');
  assert.equal(shareText(26,'all',0),'26歳で受賞した人は、1901年からまだいません。— 今年の受賞の解説');
  assert.equal(shareText(26,'eco',0),'経済学賞を26歳で受賞した人は、1969年からまだいません。— 今年の受賞の解説');
  assert.match(answerText(54,'all',1000),/1,000人/);
});
test('帯は0人でもあなたの印、範囲外の歳も文字で知らせる', () => {
  const result = summarize(data.awards,26);
  assert.match(bandSvg(result,26),/あなた 26歳/); assert.match(bandSvg(result,26),/role="img"/);
  assert.match(bandSvg(result,120),/図の外/); assert.equal((bandSvg(result).match(/<rect/g)||[]).length,86);
});
test('固定時計・日本時間の表示・週の終わり', () => {
  const at = Date.parse('2026-10-06T19:00:00+09:00');
  assert.equal(readNow('?now=2026-10-06T19:00:00+09:00',0),at);
  assert.equal(readNow('?now=2026-10-06T19%3A00%3A00%2B09%3A00',0),at);
  assert.equal(readNow('?now=no',123),123); assert.equal(readNow('?now=2026-10-06T19:00:00',123),123);
  assert.equal(timeText(at),'19時00分');
  assert.equal(afterWeek(Date.parse('2026-10-12T23:59:59+09:00')),false);
  assert.equal(afterWeek(Date.parse('2026-10-13T00:00:00+09:00')),true);
});
test('発表時刻の直前・ちょうど・実応答に人数あり・日時の照合', () => {
  const item=schedule[1], at=Date.parse(item.at), prizes=[{cat:'phy',year:2026,people:[{}]}];
  assert.equal(announcementState(item,prizes,at-1),'waiting');
  assert.equal(announcementState(item,[],at),'pending');
  assert.equal(announcementState(item,prizes,at),'announced');
  assert.equal(scheduleText(schedule[2]),'10月7日（水） 18時45分以降の予定');
  assert.equal(scheduleText(schedule[4]),'10月9日（金） 18時の予定');
  assert.match(scheduleText(item,'2026-10-07'),/10月7日/);
});
test('同梱データは生年月日と没年月日を配らず、計算済みの年齢を持つ', () => {
  assert.ok(data.awards.every((row) => !('born' in row) && !('died' in row)));
  assert.ok(data.awards.every((row) => Number.isInteger(row.age)));
  assert.deepEqual(ageAt({ age: 42, approximate: false, posthumous: false }), { age: 42, approximate: false, posthumous: false });
  // 生年月日が届いた行（今年の分）は、計算済みの値より生年月日を優先して数え直す
  assert.equal(ageAt({ age: 1, born: '1944-03-23', date: '2026-10-06' }).age, 82);
  assert.equal(data.awards.filter((row) => row.approximate).length, 21);
  assert.deepEqual(data.awards.filter((row) => row.posthumous).map((row) => row.age).sort(), [56, 66, 68]);
});
test('2026年の物理学賞は同梱に入り、日本語名と82歳', () => {
  const row = data.awards.find((one) => one.en === 'Francis Halzen');
  assert.ok(row); assert.equal(row.ja, 'フランシス・ハルツェン'); assert.equal(row.year, 2026); assert.equal(ageAt(row).age, 82);
});
