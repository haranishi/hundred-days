import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as nextTurn } from 'node:timers/promises';
const read=(name)=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const bundle=read('../data/laureates.json'), fixture=read('./fixtures/commentary-test.json');
let run=0;
function environment(t,failApi,failCommentary,apiGate=null) {
  const originals=new Map(['document','location','fetch','localStorage','setInterval','ResizeObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const nodes=new Map(),requests=[];
  function element() { return {dataset:{},attributes:{},children:[],value:'',innerHTML:'',textContent:'',listeners:{},
    setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},
    addEventListener(type,listener){this.listeners[type]=listener;},append(node){this.children.push(node);}}; }
  const el=(id)=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  for(const [key,value] of Object.entries({document:{getElementById:el,createElement:element,querySelector(){return el('jump-today');}},location:{search:'?now=2026-10-06T19:00:00%2B09:00'},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},setInterval(){return 1;},ResizeObserver:class {observe(){}},fetch:async(url)=>{
    requests.push(url);
    if(url==='./data/laureates.json')return {ok:true,json:async()=>bundle};
    if(url==='./data/commentary.json')return failCommentary?{ok:false}:{ok:true,json:async()=>fixture};
    if(apiGate)await apiGate;
    if(failApi)throw new Error('test API failure');
    return {ok:true,json:async()=>read(`./fixtures/${String(url).includes('/nobelPrizes?')?'prizes':'laureates'}-2026-1006-physics.json`)};
  }}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  t.after(()=>{for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  return {el,requests};
}
async function boot(el) {
  await import(`../app.js?test=${++run}`);
  for(let i=0;i<50;i++) {if(el('week').dataset.live && el('week').dataset.live!=='loading')return;await nextTurn();}
  assert.fail('boot did not settle');
}
test('app実行：API失敗・保存なしでも同梱の先頭と解説、年齢入力が動く',async(t)=>{
  const {el,requests}=environment(t,true,false);await boot(el);
  assert.equal(el('app').dataset.state,'ready');assert.equal(el('week').dataset.live,'error');
  assert.match(el('today-card').innerHTML,/data-cat="phy"/);
  assert.match(el('announcements').innerHTML,/data-cat="med" data-commentary="ready"/);
  assert.equal(el('retry').hidden,false);
  el('age-input').value='26';el('age-input').listeners.input();
  assert.equal(el('answer').attributes['aria-label'],'26歳で受賞した人は、まだいません');
  assert.equal(requests.filter(v=>String(v).startsWith('https:')).length,2);
});
test('app実行：解説取得失敗でもAPIの受賞者と準備中、共有の新題名が動く',async(t)=>{
  const {el,requests}=environment(t,false,true);await boot(el);
  assert.equal(el('app').dataset.state,'ready');assert.equal(el('week').dataset.live,'ready');
  assert.match(el('today-card').innerHTML,/data-cat="phy" data-commentary="pending"/);
  assert.match(el('today-card').innerHTML,/フランシス・ハルツェン ↗/);
  el('age-input').value='54';el('age-input').listeners.input();
  assert.equal(el('answer').attributes['aria-label'],'54歳で受賞した人は、34人');
  assert.match(new URL(el('result-x').href).searchParams.get('text'),/— 今年の受賞の解説$/);
  assert.equal(requests.length,4);
});

test('app実行：再描画後も委譲した閉じるボタンでsummaryに戻る',async t=>{
  const {el}=environment(t,false,false);await boot(el);
  el('age-input').value='26';el('age-input').listeners.input();
  const calls=[];
  const summary={focus(){calls.push('focus');},scrollIntoView(options){calls.push(options);}};
  const details={open:true,querySelector(selector){assert.equal(selector,'summary');return summary;}};
  const button={closest(selector){assert.equal(selector,'details');return details;}};
  el('announcements').listeners.click({target:{closest(selector){assert.equal(selector,'.close-card');return button;}}});
  assert.equal(details.open,false);assert.deepEqual(calls,['focus',{block:'nearest'}]);
  el('announcements').listeners.click({target:{closest(){return null;}}});
});

test('app実行：公式データの返事を待たずに同梱の解説を出し（ready）、取得が終わったら案内が落ち着く',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const {el,requests}=environment(t,false,false,gate);el('app').dataset.state='loading';
  await import(`../app.js?test=${++run}`);
  for(let i=0;i<50 && requests.length<4;i++)await nextTurn();
  assert.equal(requests.length,4);
  // 返事を待っているあいだも、同梱の記録で先頭のカードを出す。ページを隠したまま待たせない（遅い回線で何も出ない時間ができるため）
  assert.equal(el('app').dataset.state,'ready');
  assert.match(el('today-card').innerHTML,/data-cat="phy"/);
  assert.equal(el('week').dataset.live,'loading');
  release();for(let i=0;i<50 && el('week').dataset.live==='loading';i++)await nextTurn();
  assert.notEqual(el('week').dataset.live,'loading');
  assert.equal(el('jump-today').textContent,el('today-title').textContent);
});
