import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCommentary, emptyCommentary, commentaryModel, leadingPrize, bundledPrizes, commentaryName, commentaryShareText } from '../lib/commentary.js';
import { prizeCardHtml, renderLive, officialSlugs } from '../lib/render.js';
import { normalizeResponses } from '../lib/live.js';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const fixture = read('./fixtures/commentary-test.json');
const bundle = read('../data/laureates.json');
const now = Date.parse('2026-10-07T19:05:00+09:00');
const current = normalizeResponses(read('./fixtures/prizes-2026-1007-chemistry.json'), read('./fixtures/laureates-2026-1007-chemistry.json'));
const med = current.prizes.find((p) => p.cat === 'med');
test('解説モデルはready・facts・pendingで分かれ、初出順に採番する', () => {
  const model = commentaryModel(med, fixture);
  assert.equal(model.state, 'ready');
  assert.deepEqual(model.sources.map((s) => [s.id,s.number]), [['second',1],['first',2],['third',3]]);
  // データでは出典が first→second の順に並ぶが、番号は初出順（second=1, first=2）。一つの文の中では小さい順に並べる
  assert.deepEqual(model.what[1].refs.map((s) => s.number), [1,2]);
  assert.equal(model.changed[0].refs[0].number, 3); assert.equal(model.gap[0].refs[0].number, 3);
  assert.equal(commentaryModel({ cat:'lit' }, fixture).state, 'facts');
  assert.equal(commentaryModel(med, emptyCommentary()).state, 'pending');
  assert.deepEqual(fixture, read('./fixtures/commentary-test.json'));
});
test('最新の発表日・同日は日程順・見出しは日本時間で決める', () => {
  const prizes = current.prizes;
  assert.equal(leadingPrize(prizes, Date.parse('2026-10-06T19:00:00+09:00')).prize.cat,'phy');
  assert.equal(leadingPrize(prizes, now).prize.cat,'che'); assert.equal(leadingPrize(prizes,now).heading,'今日の受賞');
  assert.equal(leadingPrize(prizes,Date.parse('2026-10-08T10:00:00+09:00')).heading,'いちばん新しい受賞');
  assert.equal(leadingPrize(prizes,Date.parse('2026-10-07T23:59:59+09:00')).heading,'今日の受賞');
  assert.equal(leadingPrize(prizes,Date.parse('2026-10-08T00:00:00+09:00')).heading,'いちばん新しい受賞');
  assert.equal(leadingPrize(prizes.map((p) => ({...p,date:'2026-10-05'})),now).prize.cat,'che');
  assert.equal(leadingPrize([],now).prize,null);
});
test('読み込みは成功・空・失敗・壊れたJSONのときも安全', async () => {
  assert.deepEqual(await loadCommentary(async()=>({ok:true,json:async()=>fixture}),now),fixture);
  for (const fetcher of [async()=>({ok:false}), async()=>{throw Error();}, async()=>({ok:true,json:async()=>{throw Error();}}), async()=>({ok:true,json:async()=>({schema:2})})]) assert.deepEqual(await loadCommentary(fetcher,now),emptyCommentary());
  assert.deepEqual(await loadCommentary(async()=>({ok:true,json:async()=>emptyCommentary()}),now),emptyCommentary());
});
test('名前は検証済み日本語・同梱・英語の順、共有文は年数と新題名', () => {
  assert.equal(commentaryName(med.people[0],fixture.entries.med,bundle.awards),'テスト用の名前');
  const broken = structuredClone(fixture.entries.med); delete broken.people[0].jaSrc;
  assert.equal(commentaryName(med.people[0],broken,bundle.awards),'カール・ダイセロス');
  assert.equal(commentaryName(med.people[0],null,[]),'Karl Deisseroth');
  assert.match(commentaryShareText(commentaryModel(med,fixture)),/24年。\n— 今年の受賞の解説$/);
  assert.doesNotMatch(commentaryShareText(commentaryModel({cat:'lit'},fixture)),/論文の出版年/);
});
test('APIなしでも同梱の個人と団体から2026年の発表を組み立てる', () => {
  const prizes = bundledPrizes({...bundle,orgs:[...bundle.orgs,{id:'900',year:2026,cat:'pea',en:'Test group',date:'2026-10-09'}]});
  assert.deepEqual(prizes.map((p)=>p.cat),['che','med','phy','pea']);
  assert.equal(prizes[3].people[0].isOrg,true);
  assert.equal(leadingPrize(prizes,now).prize.cat,'che');
});
test('カードは原文・事実・期待の札・年数・出典・確認日・共有を表示', () => {
  const html = prizeCardHtml(med,fixture,bundle.awards);
  for (const text of ['何をした人か','何が変わったか','確かめられている事実','これから期待されていること','まだ実現していません','発見から受賞まで','24年','2002年','2026年','確認日：2026年10月5日','自分の言葉で書いた','この解説をXで共有','lang="en"']) assert.ok(html.replaceAll('<wbr>','').includes(text),text);
  assert.ok(html.includes(med.people[0].motivation));
  assert.match(html,/href="#today-med-source-1"/); assert.match(html,/id="today-med-source-1"/);
  assert.ok(html.indexOf('論文B') < html.indexOf('資料A'));
  const week = prizeCardHtml(med,fixture,bundle.awards,null,'week');
  assert.match(week,/id="week-med-source-1"/);assert.doesNotMatch(week,/id="today-med-source/);
  assert.match(prizeCardHtml(med,emptyCommentary(),bundle.awards).replaceAll('<wbr>',''),/data-commentary="pending"[\s\S]*この賞の解説は準備中です/);
});
test('factsは活動の事実だけ、空の変化・期待も欄を出さない', () => {
  const html = prizeCardHtml({cat:'lit',date:'2026-10-08',people:[{id:'999901',en:'Test Writer',year:2026,cat:'lit',isOrg:true}]},fixture);
  assert.match(html,/何をした人か（活動の事実）/); assert.match(html.replaceAll('<wbr>',''),/評価は加えず/);
  assert.doesNotMatch(html,/何が変わったか|これから期待されていること|発見から受賞まで/);
  const minimal=structuredClone(fixture);minimal.entries.med.changed=[];minimal.entries.med.expected=[];
  assert.doesNotMatch(prizeCardHtml(med,minimal),/何が変わったか|これから期待されていること/);
});
test('表示の文字はエスケープする', () => {
  const data = structuredClone(fixture); data.entries.med.headline='<script>bad()</script>';
  data.entries.med.what[0].text='<img src=x>';
  assert.doesNotMatch(prizeCardHtml(med,data),/<script>|<img /);
});
test('今週のdetails・先頭表示・API失敗時の解説・発表前の予定', (t) => {
  const previous=globalThis.document, nodes=new Map();
  globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,{dataset:{}});return nodes.get(id);}};
  t.after(()=>{if(previous)globalThis.document=previous;else delete globalThis.document;});
  renderLive({...current,state:'ready'},now,bundle.awards,null,fixture);
  assert.match(nodes.get('announcements').innerHTML,/<details><summary><span class="when-closed">解説を読む<\/span><span class="when-open">解説を閉じる<\/span><\/summary>[\s\S]*data-cat="med"/);
  assert.match(nodes.get('today-card').innerHTML,/data-cat="che"/);
  const data=structuredClone(fixture);data.entries.che={...data.entries.med,people:[{id:'1065'},{id:'1066'}]};
  renderLive({prizes:bundledPrizes(bundle),state:'error',failed:true},now,bundle.awards,76,data);
  assert.match(nodes.get('today-card').innerHTML,/data-cat="che" data-commentary="ready"/);
  assert.doesNotMatch(nodes.get('today-card').innerHTML,/歳|same-age/);
  assert.match(nodes.get('live-note').textContent,/このページに入っている記録/);
  renderLive({prizes:[],state:'ready'},Date.parse('2026-10-05T18:00:00+09:00'),bundle.awards);
  assert.match(nodes.get('today-card').innerHTML,/最初の発表は10月5日/);
});
test('期待と起点で初めて登場する出典も、本文の順番で採番する',()=>{
  const data=structuredClone(fixture),entry=data.entries.med;
  entry.sources.future={...entry.sources.first,url:'https://example.org/future'};
  entry.sources.origin={...entry.sources.first,url:'https://example.org/origin'};
  entry.expected[0].src=['future'];entry.gap[0].src=['origin'];
  const model=commentaryModel(med,data);
  assert.deepEqual(model.sources.map(s=>s.id),['second','first','third','future','origin']);
  assert.equal(model.expected[0].refs[0].number,4);assert.equal(model.gap[0].refs[0].number,5);
});
test('端末の時計が過去でも解説を読み込む',async()=>{
  assert.deepEqual(await loadCommentary(async()=>({ok:true,json:async()=>fixture}),Date.parse('2020-01-01T00:00:00Z')),fixture);
});
test('2件の年数・label・文・出典を描き、共有文にも両方の年数を入れる',()=>{
  const prize=current.prizes.find(p=>p.cat==='che'),model=commentaryModel(prize,fixture);
  assert.equal(model.gap.length,2);
  assert.deepEqual(model.gap.map(g=>g.refs[0].number),[3,3]);
  assert.match(commentaryShareText(model),/論文の出版年と2026年の差：24年・40年。/);
  const html=prizeCardHtml(prize,fixture);
  assert.equal((html.match(/class="year-line"/g)||[]).length,2);
  for(const gap of model.gap) {
    assert.ok(html.includes(`aria-label="（${gap.label}）${gap.startYear}年から2026年まで${gap.years}年"`));
    assert.ok(html.replaceAll('<wbr>','').includes(gap.what)); // 折り位置の <wbr> を除いた文字が、そのまま出る
  }
});
test('出典番号は2件の起点も配列順で採番する',()=>{
  const data=structuredClone(fixture),entry=data.entries.che;
  entry.sources.originA={...entry.sources.first,url:'https://example.org/origin-a'};
  entry.sources.originB={...entry.sources.first,url:'https://example.org/origin-b'};
  entry.gap[0].src=['originA'];entry.gap[1].src=['originB'];
  const model=commentaryModel({cat:'che'},data);
  assert.deepEqual(model.sources.map(s=>s.id),['second','first','third','originA','originB']);
  assert.deepEqual(model.gap.map(g=>g.refs[0].number),[4,5]);
});

test('全分野のslugとready・facts・pendingの発表ページリンク',()=>{
  assert.deepEqual(officialSlugs,{med:'medicine',phy:'physics',che:'chemistry',lit:'literature',pea:'peace',eco:'economic-sciences'});
  for(const [cat,slug] of Object.entries(officialSlugs)) for(const data of [fixture,emptyCommentary()]) {
    const html=prizeCardHtml({cat,date:'2026-10-07',people:[]},data);
    const link=`<a class="official-link" href="https://www.nobelprize.org/prizes/${slug}/2026/press-release/" target="_blank" rel="noopener noreferrer">公式の発表ページ ↗</a>`;
    assert.equal(html.split(link).length-1,1);
    if(html.includes('class="commentary-share"'))assert.ok(html.indexOf(link)<html.indexOf('class="commentary-share"'));
  }
});

test('ready・facts・pendingの読む順序とcompactの重複除去',()=>{
  const headings=html=>[...html.matchAll(/<h4>(.*?)<\/h4>/g)].map(m=>m[1]);
  assert.deepEqual(headings(prizeCardHtml(med,fixture)),['何をした人か','何が変わったか','これから期待されていること','発見から受賞まで','公式の受賞理由（原文）','出典']);
  const facts={cat:'lit',year:2026,date:'2026-10-08',people:[{id:'999901',en:'Test Writer',isOrg:true}]};
  assert.deepEqual(headings(prizeCardHtml(facts,fixture)),['何をした人か（活動の事実）','公式の受賞理由（原文）','出典']);
  const pending=prizeCardHtml(med);
  assert.ok(pending.indexOf('公式の受賞理由（原文）')<pending.indexOf('commentary-pending'));
  for(const data of [fixture,emptyCommentary()]) {
    const compact=prizeCardHtml(med,data,bundle.awards,54,'week',true);
    assert.doesNotMatch(compact,/<h3>|class="person"|prize-heading|発表されました/);
    assert.match(compact,/公式の受賞理由（原文）/);
  }
});
test('解説の受賞者は名前の公式リンクだけ、団体・不明な年齢・同じ年齢も表示しない',()=>{
  for(const person of [med.people[0],{...med.people[0],isOrg:true},{...med.people[0],born:null}]) {
    const html=prizeCardHtml({...med,people:[person]},fixture,bundle.awards,54);
    const row=html.match(/<p class="person">(.*?)<\/p>/)[1];
    assert.doesNotMatch(row,/歳|年齢|団体|生まれ|公式の紹介を読む/);
    assert.match(row,/^<a class="person-link"/);
    assert.match(row,/href="https:\/\/www\.nobelprize\.org\/laureate\/1061"/);
    assert.match(row,/target="_blank" rel="noopener noreferrer" aria-label="テスト用の名前の公式の紹介ページ（外部サイト）">テスト用の名前 ↗<\/a>$/);
  }
});
test('本文は明示した折り返し、出典番号のまとまりは文末と結合する',()=>{
  const html=prizeCardHtml(med,fixture);
  assert.match(html,/<wbr>/);
  assert.doesNotMatch(html,/<wbr>\u2060/);
  assert.doesNotMatch(html.match(/lang="en">(.*?)<\/p>/)[1],/<wbr>/);
  assert.match(html,/\u2060<span class="refs"><a class="source-ref"/);
  // 文字を比べるときは、折り位置の <wbr> と、折らない表記を包む nowrap の span を外す
  const plain=html.replaceAll('<wbr>','').replace(/<span class="nw">(.*?)<\/span>/g,'$1');
  assert.match(plain,/確かめられている事実（研究の中での変化を含みます）/);
  assert.match(plain,/論文が出た年と2026年の差です（月は数えず、年だけで数えます）。/);
  assert.ok(html.indexOf('class="headline prose"')<html.indexOf('何をした人か'));
  assert.ok(html.indexOf('class="commentary-note prose"')<html.indexOf('class="official-link"'));
});
test('共有はひとこと・出版年の差・題名の3行、factsは2行',()=>{
  for(const cat of ['med','che','lit']) {
    const model=commentaryModel({cat,year:2026},fixture);
    assert.equal(commentaryShareText(model),`${model.headline}${model.gap ? `\n論文の出版年と2026年の差：${model.gap.map(g=>`${g.years}年`).join('・')}。` : ''}\n— 今年の受賞の解説`);
  }
});
test('出典は題名リンク・発行元・全8種類・英語の順',()=>{
  const labels={paper:'論文',official:'公式ページ',institution:'研究機関',registry:'登録情報',media:'報道',data:'データ',reference:'事典・用語集',company:'企業の発表'};
  for(const [kind,label] of Object.entries(labels)) for(const lang of [undefined,'ja','en']) {
    const data=structuredClone(fixture),source=data.entries.med.sources.second;
    Object.assign(source,{kind,lang});
    const html=prizeCardHtml(med,data);
    // 発行元は包まない（長いのでページが横にはみ出す）。区切りの「·」は直前に改行しない空白を置き、種類と「英語」だけを包む
    const separator='<span class="nw">&nbsp;·</span> ';
    assert.ok(html.includes(`>${source.title}</a><span class="source-meta">${source.publisher}${separator}<span class="nw">${label}</span>${lang==='en'?`${separator}<span class="nw">英語</span>`:''}</span>`));
    assert.doesNotMatch(html,/<span class="nw">[^<]*テスト用の架空機関[^<]*<\/span>/);
  }
});
test('今週の上へのリンクと開閉文、取得日はUTC境界でも日本時間',t=>{
  const previous=globalThis.document,nodes=new Map();
  globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,{dataset:{}});return nodes.get(id);}};
  t.after(()=>{if(previous)globalThis.document=previous;else delete globalThis.document;});
  const at=Date.parse('2026-10-06T15:05:00Z');
  renderLive({...current,state:'ready',fetchedAt:at},now,bundle.awards,54,fixture);
  assert.equal(nodes.get('live-note').textContent,'10月7日 0時05分に公式データを確認しました。');
  assert.equal(nodes.get('current-year').textContent,'2026年の発表');
  const html=nodes.get('announcements').innerHTML;
  assert.match(html,/<a class="shown-above" href="#today">上に表示中<\/a>/);
  assert.match(html,/<span class="when-closed">解説を読む<\/span><span class="when-open">解説を閉じる<\/span>/);
  assert.doesNotMatch(html,/歳|年齢/);
  renderLive({...current,state:'stale',saved:true,fetchedAt:at},now,bundle.awards,null,fixture);
  assert.equal(nodes.get('live-note').textContent,'10月7日 0時05分に取った分を表示しています。');
});
test('冒頭の説明・メタ・移動4本・フッターの確認日の定義',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const intro='今年の受賞者は、何をした人で、暮らしや研究の何が変わったのか。論文や機関の発表をもとに、すでに起きたことと、これからの計画を分けて解説します。';
  assert.equal(html.match(/<p class="intro phr">(.*?)<\/p>/)[1].replaceAll('<wbr>',''),intro);
  assert.ok(html.includes(`<meta name="description" content="${intro}">`));
  for(const id of ['today','week','age','rules']) {
    assert.ok(html.includes(`href="#${id}"`));assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html,/aria-label="ページ内の移動"/);
  assert.ok(html.replaceAll('<wbr>','').includes('確認日は、作者が出典を開いて、文を1つずつ照合した日です。'));
  assert.match(html,/href="https:\/\/x\.com\/haranishi_ikki"/);
});

test('短い欧文の塊をnwにし、HTMLをエスケープしてwbrでつなぐ', async () => {
  const { phrase } = await import('../lib/render.js');
  for (const text of ['TXS 0506+056','NGC 1068','Nobel Prize API']) assert.equal(phrase(text), `<span class="nw">${text}</span>`);
  assert.match(phrase('研究は続く。次の結果を調べる。'), /<wbr>/);
  assert.doesNotMatch(phrase('<script>bad()</script>'), /<script>/);
  assert.doesNotMatch(phrase('ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz'), /class="nw"/);
});
test('受賞者をpersonsに入れ、週のカード末尾だけに閉じるボタンを付ける', () => {
  const today=prizeCardHtml(med,fixture),week=prizeCardHtml(med,fixture,[],null,'week',true);
  assert.match(today,/<div class="persons"><p class="person">/);
  assert.doesNotMatch(today,/close-card/);
  assert.match(week,/<button type="button" class="close-card">解説を閉じる ↑<\/button><\/article>$/);
});
test('読み込みの案内はheader直後、JavaScriptなしの案内もある', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<\/header>\s*<p id="boot-note" role="status">読み込んでいます…<\/p>/);
  assert.match(html,/<noscript><style>#app>section,#app>footer\{visibility:visible\}<\/style><p>このページは、JavaScript を使える状態で開いてください。<\/p><\/noscript>/);
  assert.ok(html.replaceAll('<wbr>','').includes('出典のうち、論文の題は原題のまま、ウェブページの題は作者が日本語でつけたものです。'));
});
