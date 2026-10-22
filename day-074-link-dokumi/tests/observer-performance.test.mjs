import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { extractHtmlFacts } from '../lib/html-facts.js';
import { LIMITS, validateHtmlFacts } from '../lib/contract.js';
const base={url:'https://example.com/'};
const atByteCap=(html,cap=LIMITS.BODY_CAP_BYTES)=>new TextDecoder().decode(new TextEncoder().encode(html).subarray(0,cap),{stream:true});
const news='<html lang=ja><title>今日の地域ニュース</title><meta property="og:site_name" content="地域の便り"><h1>まちの出来事</h1>'+('<article><h2>地域のニュース</h2><p>公園で催しが開かれ、多くの人が訪れました。</p><a href="/news/1">続きを読む</a><img src="/photo.jpg"></article>'.repeat(600));
const cases=[
  ['Japanese news 60KiB',atByteCap(news,60*1024)],
  ['2000 anchors','<a href=/n>x</a>'.repeat(2000)],
  ['200 scripts','<script src=/app.js></script>'.repeat(200)],
  ['long attributes','<div data-ignored="'+'x'.repeat(LIMITS.BODY_CAP_BYTES-30)+'"></div>'],
  ['one-line angles','<'.repeat(LIMITS.BODY_CAP_BYTES)],
  // 接頭語＋空白や失敗し続ける候補でも、詳細検査が繰り返し全文を走査しない。
  ['regex near misses',('eval '+ ' '.repeat(200)+'atob! Warning:'+'x'.repeat(500)+' on line X Apache2'+'.'.repeat(80)+'Not Default ').repeat(100)]
];
// 実在ページはメインの保存済み文書を任意指定する。試験自身は通信も保存も行わない。
if(process.env.LINK_DOKUMI_BENCH_PAGES){
  const directory=process.env.LINK_DOKUMI_BENCH_PAGES;
  for(const name of readdirSync(directory).filter(name=>name.endsWith('.html')))cases.push([name,readFileSync(directory+'/'+name,'utf8')]);
}
for(const [name,source] of cases)test('HTML benchmark median under 10ms '+name,()=>{
  const html=atByteCap(source),times=[];
  let facts;
  for(let i=0;i<15;i++){const start=performance.now();facts=extractHtmlFacts(html,base.url);times.push(performance.now()-start);}
  assert.deepEqual(validateHtmlFacts(facts).errors,[]);
  if(name==='2000 anchors')assert.equal(facts.links.total,2000);
  if(name==='200 scripts')assert.equal(facts.scripts.total,200);
  if(name==='Japanese news 60KiB')assert.ok(new TextEncoder().encode(html).length>=60*1024-3);
  const median=[...times].sort((a,b)=>a-b)[7];
  assert.ok(median<10,name+': '+median+'ms');
  process.stdout.write('# benchmark '+name+' first='+times[0].toFixed(3)+'ms median='+median.toFixed(3)+'ms\n');
});
