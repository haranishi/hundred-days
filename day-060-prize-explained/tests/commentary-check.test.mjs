import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCommentary, sourceUrlError } from '../lib/commentary-check.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/commentary-test.json',import.meta.url)));
const options = {now:Date.parse('2026-10-07T19:05:00+09:00')};
function rejects(title, mutate, path) {
  test(`壊した例：${title}`,()=>{
    const data=structuredClone(fixture);mutate(data,data.entries.med);
    const errors=checkCommentary(data,options);
    assert.ok(errors.some((message)=>message.startsWith(`${path}:`)),JSON.stringify(errors));
  });
}
test('空の実データ・テスト用scienceとfacts・名称の出典表記を許す',()=>{
  assert.deepEqual(checkCommentary(fixture,options),[]);
  assert.deepEqual(checkCommentary(JSON.parse(readFileSync(new URL('../data/commentary.json',import.meta.url))),options),[]);
  const data=structuredClone(fixture);const s=data.entries.med.sources.third;
  s.title='Nobelのテスト用出典';s.publisher='ノーベルのテスト用出典';s.kind='official';s.url='https://www.nobelprize.org/prizes/medicine/2026/summary/';
  assert.deepEqual(checkCommentary(data,options),[]);
  // 他社のページのURLに綴りが含まれていてもよい（リンク先であって、画面の題名や見出しではない）
  s.kind='institution';s.url='https://example.org/news/winner-of-the-nobel-prize/';
  assert.deepEqual(checkCommentary(data,options),[]);
  // ただし、本文（ひとこと・解説）に綴りがあれば落ちる
  data.entries.med.headline='Nobelのひとこと';
  assert.ok(checkCommentary(data,options).some((message)=>message.startsWith('entries.med.headline:')));
});
rejects('schema',d=>d.schema=2,'schema');rejects('year',d=>d.year=2025,'year');
rejects('cat',d=>{d.entries.bad=d.entries.med;delete d.entries.med;},'entries.bad');
rejects('entries型',d=>d.entries=[],'entries');rejects('entry型',d=>d.entries.med=null,'entries.med');
rejects('mode',(_,e)=>e.mode='other','entries.med.mode');
for(const cat of ['lit','pea']) {
  rejects(`${cat}はscience不可`,d=>d.entries[cat]={...d.entries.med},`entries.${cat}.mode`);
  for(const key of ['changed','expected','gap']) rejects(`${cat}のfactsに${key}`,d=>{d.entries[cat]=structuredClone(d.entries.lit);d.entries[cat][key]=key==='gap'?{}:[];},`entries.${cat}.${key}`);
}
for(const [key,min,max] of [['what',2,4],['changed',0,5],['expected',0,3]]) {
  rejects(`${key}が配列でない`,(_,e)=>e[key]=null,`entries.med.${key}`);
  rejects(`${key}が長すぎる`,(_,e)=>e[key]=Array.from({length:max+1},()=>e.what[0]),`entries.med.${key}`);
  if(min) rejects(`${key}が短すぎる`,(_,e)=>e[key]=[],`entries.med.${key}`);
}
for(const date of ['2026-10-04','2026-10-08','2026-02-30','2026-10-5','invalid',null]) rejects(`verifiedAt ${date}`,(_,e)=>e.verifiedAt=date,'entries.med.verifiedAt');
test('確認日の今日判定は日本時間、UTCの日付を持ち込まない',()=>{
  const data=structuredClone(fixture);data.entries.med.verifiedAt='2026-10-08';
  assert.deepEqual(checkCommentary(data,{now:Date.parse('2026-10-07T15:00:00Z')}),[]);
  assert.ok(checkCommentary(data,{now:Date.parse('2026-10-07T14:59:59Z')}).length);
});
rejects('headline61字',(_,e)=>e.headline='あ'.repeat(61),'entries.med.headline');
rejects('headline空',(_,e)=>e.headline='','entries.med.headline');
rejects('text空',(_,e)=>e.what[0].text='','entries.med.what[0].text');
rejects('文章の型',(_,e)=>e.what[0]='bad','entries.med.what[0]');
for(const key of ['what','changed','expected']) {
  rejects(`${key}のsrcなし`,(_,e)=>delete e[key][0].src,`entries.med.${key}[0].src`);
  rejects(`${key}のsrc空`,(_,e)=>e[key][0].src=[],`entries.med.${key}[0].src`);
}
rejects('srcの参照なし',(_,e)=>e.what[0].src=['missing'],'entries.med.what[0].src[0]');
rejects('src重複',(_,e)=>e.what[0].src=['second','second'],'entries.med.what[0].src');
rejects('未使用出典',(_,e)=>e.sources.unused={...e.sources.first,url:'https://example.org/unused'},'entries.med.sources.unused');
rejects('sources型',(_,e)=>e.sources=[],'entries.med.sources');
rejects('source型',(_,e)=>e.sources.first=null,'entries.med.sources.first');
rejects('出典の題名なし',(_,e)=>delete e.sources.first.title,'entries.med.sources.first.title');
rejects('発行元なし',(_,e)=>delete e.sources.first.publisher,'entries.med.sources.first.publisher');
for(const url of ['http://example.org/','bad',['https://user:secret','example.org/'].join('@')]) rejects(`https URL ${url}`,(_,e)=>e.sources.first.url=url,'entries.med.sources.first.url');
rejects('URL重複',(_,e)=>e.sources.third.url=e.sources.first.url,'entries.med.sources.third.url');
rejects('kind',(_,e)=>e.sources.first.kind='blog','entries.med.sources.first.kind');
rejects('論文URL',(_,e)=>e.sources.second.url='https://example.org/paper','entries.med.sources.second.url');
for(const path of ['test.pdf','test.jpg','test.jpeg','test.png','test.gif','test.webp','test.svg','test.mp4','test.mp3','test.webm','test.PDF','test%2Epdf','/uploads/file','/wp-content/page','/about/page']) rejects(`公式URL ${path}`,(_,e)=>{e.sources.first.kind='official';e.sources.first.url=`https://www.nobelprize.org${path.startsWith('/')?path:'/prizes/'+path}`;},'entries.med.sources.first.url');
rejects('gapなし',(_,e)=>delete e.gap,'entries.med.gap');
rejects('gap年数不一致',(_,e)=>e.gap[0].years=25,'entries.med.gap[0].years');
rejects('gap年数整数',(_,e)=>e.gap[0].startYear=2002.5,'entries.med.gap[0].years');
rejects('gap起点未来',(_,e)=>{e.gap[0].startYear=2030;e.gap[0].years=-4;},'entries.med.gap[0].years');
rejects('gap受賞年不一致',(_,e)=>e.gap[0].endYear=2025,'entries.med.gap[0].endYear');
rejects('gap出典なし',(_,e)=>e.gap[0].src=[],'entries.med.gap[0].src');
rejects('gap起点の文なし',(_,e)=>e.gap[0].what='','entries.med.gap[0].what');
for(const word of ['ノーベル','Nobel','nObEl']) for(const key of ['headline','what','changed','expected','gap','people']) rejects(`${key}の名前 ${word}`,(_,e)=>{
  if(key==='headline')e.headline=word;
  else if(key==='gap')e.gap[0].what=word;
  else if(key==='people')e.people[0].ja=word;
  else e[key][0].text=word;
},`entries.med.${key}${key==='gap'?'[0].what':key==='people'?'[0].ja':key==='headline'?'':'[0].text'}`);
for(const word of ['天才','偉大','革命的','画期的','世紀の','奇跡','歴史的','驚異','称賛']) rejects(`誇張 ${word}`,(_,e)=>e.what[0].text=word,'entries.med.what[0].text');
for(const word of ['かもしれ','可能性','期待','見込','予定','だろう','はず','とされ']) rejects(`changed推量 ${word}`,(_,e)=>e.changed[0].text=word,'entries.med.changed[0].text');
for(const word of ['生年月日','生年','生まれ','没年','死去','亡くなっ','住所','家族','健康']) rejects(`個人情報 ${word}`,(_,e)=>e.what[0].text=word,'entries.med.what[0].text');
for(const word of ['公式','公認','提携']) rejects(`公認風の文 ${word}`,(_,e)=>e.headline=word,'entries.med.headline');
for(const jaSrc of [undefined,'https://example.org/Q1','http://www.wikidata.org/wiki/Q1','https://www.wikidata.org/wiki/Q','https://www.wikidata.org/wiki/Q1?test=1']) rejects(`日本語の出典 ${jaSrc}`,(_,e)=>e.people[0].jaSrc=jaSrc,'entries.med.people[0].jaSrc');
rejects('受賞者配列',(_,e)=>e.people=[],'entries.med.people');
rejects('受賞者番号',(_,e)=>e.people[0].id='bad','entries.med.people[0].id');
rejects('受賞者番号重複',(_,e)=>e.people[1].id=e.people[0].id,'entries.med.people[1].id');
rejects('受賞者型',(_,e)=>e.people[0]=null,'entries.med.people[0]');
rejects('日本語名空',(_,e)=>e.people[0].ja='','entries.med.people[0].ja');
rejects('jaなしjaSrc',(_,e)=>delete e.people[0].ja,'entries.med.people[0].jaSrc');
for(const key of ['headline','what','source']) rejects(`HTML ${key}`,(_,e)=>{if(key==='headline')e.headline='<b>text</b>';else if(key==='source')e.sources.first.title='title>';else e.what[0].text='<script>bad</script>';},key==='source'?'entries.med.sources.first.title':`entries.med.${key}${key==='what'?'[0].text':''}`);
rejects('未知の項目と私的情報',(_,e)=>e.people[0].address='test','entries.med.people[0].address');
test('60KBを超えるファイルは落ち、境界は通る',()=>{
  assert.ok(checkCommentary(fixture,{...options,bytes:61441}).some(e=>e.startsWith('$:')));
  assert.deepEqual(checkCommentary(fixture,{...options,bytes:61440}),[]);
  const d=structuredClone(fixture);d.entries.med.sources.first.publisher='あ'.repeat(22000);
  assert.ok(checkCommentary(d,options).some(e=>e.startsWith('$:')));
});
test('全件をパスつきで返し、不正なrootでも例外にならない',()=>{
  const d=structuredClone(fixture);d.entries.med.changed[0].text='天才が期待される';d.schema=0;
  const errors=checkCommentary(d,options);
  assert.ok(errors.length>=3); assert.ok(errors.every(e=>/^.+: .+/.test(e)));
  assert.ok(errors.some(e=>e.startsWith('entries.med.changed[0].text:')));
  assert.ok(checkCommentary(null,options).length);assert.ok(checkCommentary([],options).length);
  assert.equal(sourceUrlError('https://www.nobelprize.org/laureate/1061'),null);
});
test('実際の解説データを確認日の上限なしで検査する',()=>{
  const data=JSON.parse(readFileSync(new URL('../data/commentary.json',import.meta.url)));
  assert.deepEqual(checkCommentary(data,{upperBound:false}),[]);
});
rejects('gap空配列',(_,e)=>e.gap=[],'entries.med.gap');
rejects('gap3件',(_,e)=>e.gap=Array.from({length:3},()=>({...e.gap[0],label:'テスト'})),'entries.med.gap');
rejects('gap旧オブジェクト',(_,e)=>e.gap=e.gap[0],'entries.med.gap');
rejects('gap2件でlabelなし',(_,e)=>e.gap=[e.gap[0],e.gap[0]],'entries.med.gap[0].label');
rejects('gap1件のlabel型',(_,e)=>e.gap[0].label=42,'entries.med.gap[0].label');
rejects('gap要素型',(_,e)=>e.gap=[null],'entries.med.gap[0]');
test('gap1件のlabelと、同じ起点の2件も許す',()=>{
  const data=structuredClone(fixture);data.entries.med.gap[0].label='テスト';
  assert.deepEqual(checkCommentary(data,options),[]);
  data.entries.med.gap.push({...data.entries.med.gap[0],label:'別のテスト'});
  assert.deepEqual(checkCommentary(data,options),[]);
});
test('確認日の上限だけを外し、下限と実在日付とISO形式を維持する',()=>{
  const data=structuredClone(fixture);data.entries.med.verifiedAt='2026-10-08';
  assert.ok(checkCommentary(data,options).some(e=>e.startsWith('entries.med.verifiedAt:')));
  assert.deepEqual(checkCommentary(data,{...options,upperBound:false}),[]);
  for(const date of ['2026-10-04','2026-11-31','2026-10-5','invalid']) {
    data.entries.med.verifiedAt=date;
    assert.ok(checkCommentary(data,{...options,upperBound:false}).some(e=>e.startsWith('entries.med.verifiedAt:')),date);
  }
});

test('出典のcompany・任意のen/jaを許し、省略も許す',()=>{
  const data=structuredClone(fixture),source=data.entries.med.sources.first;
  source.kind='company';
  for(const lang of [undefined,'en','ja']) {
    if(lang === undefined)delete source.lang;else source.lang=lang;
    assert.deepEqual(checkCommentary(data,options),[]);
  }
});
for(const lang of ['fr','EN','',null,42,[],{}]) rejects(`出典langの不正値 ${JSON.stringify(lang)}`,(_,e)=>e.sources.first.lang=lang,'entries.med.sources.first.lang');
for(const kind of ['',null,42]) rejects(`出典kindの不正値 ${kind}`,(_,e)=>e.sources.first.kind=kind,'entries.med.sources.first.kind');
