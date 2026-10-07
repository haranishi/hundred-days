import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRights } from '../lib/rights-check.js';
const good = () => ({titles:['今年の受賞の解説','今週の発表'],firstScreen:'今年の受賞の解説。何をした人か。',origin:'https://example.org',mediaCount:0,requests:['https://example.org/app.js','https://api.nobelprize.org/2.1/laureates'],links:['https://www.nobelprize.org/prizes/medicine/2026/summary/'],cards:[{state:'ready',mode:'science',cat:'med',note:'このアプリの作者が上の出典をもとに自分の言葉で書いたものです。確認日：2026年10月5日',expected:true,labels:['まだ実現していません'],headings:['何をした人か']},{state:'ready',mode:'facts',cat:'lit',note:'作者が自分の言葉で書いたものです。確認日：2026年10月5日',expected:false,labels:[],headings:['何をした人か（活動の事実）']}]});
test('権利の関門は通常の表示を通す',()=>assert.deepEqual(checkRights(good()),[]));
const broken = (name,code,mutate) => test(`壊した権利の関門：${name}`,()=>{const s=good();mutate(s);assert.ok(checkRights(s).some(e=>e.startsWith(`${code}:`)));});
for(const word of ['ノーベル','Nobel']) {
  broken(`題名 ${word}`,'a',s=>s.titles.push(word));
  broken(`最初の画面 ${word}`,'a',s=>s.firstScreen+=word);
}
broken('画像','b',s=>s.mediaCount=1);broken('外部通信','b',s=>s.requests.push('https://other.example/app.css'));
for(const ext of ['pdf','jpg','jpeg','png','gif','webp','svg','mp4','mp3','webm']) broken(`直リンク ${ext}`,'c',s=>s.links.push(`https://www.nobelprize.org/prizes/file.${ext}`));
for(const path of ['uploads/file','wp-content/file']) broken(`直リンク ${path}`,'c',s=>s.links.push(`https://www.nobelprize.org/${path}`));
broken('作者の注記','d',s=>s.cards[0].note='確認日：2026年10月5日');broken('確認日','d',s=>s.cards[0].note='作者が自分の言葉で書いたものです。');
broken('期待の札','e',s=>s.cards[0].labels=[]);
for(const cat of ['lit','pea']) for(const heading of ['何が変わったか','これから期待されていること','発見から受賞まで']) broken(`${cat}に${heading}`,'f',s=>{s.cards[1].cat=cat;s.cards[1].headings.push(heading);});
broken('文学賞のmode','f',s=>s.cards[1].mode='science');
