import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAnswer, renderMatches, renderLive, motivationHtml } from '../lib/render.js';
import { summarize } from '../lib/stats.js';
import { normalizeResponses } from '../lib/live.js';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bundled = read('../data/laureates.json').awards;
const current = normalizeResponses(read('./fixtures/prizes-2026-1006.json'), read('./fixtures/laureates-2026-1006.json'));
const afterPhysics = normalizeResponses(read('./fixtures/prizes-2026-1006-physics.json'), read('./fixtures/laureates-2026-1006-physics.json'));
// DOMの配線に必要な最小の口。レイアウト・操作の証拠はE2Eで別に確認する。
function elements(t) {
  const nodes = new Map();
  const previous = globalThis.document;
  globalThis.document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { dataset: {}, attributes: {}, innerHTML: '', textContent: '', hidden: false,
      setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
      insertAdjacentHTML(_position, html) { this.innerHTML += html; } });
    return nodes.get(id);
  } };
  t.after(() => { if (previous) globalThis.document = previous; else delete globalThis.document; });
  return (id) => globalThis.document.getElementById(id);
}
test('答えは空欄の事実・0人の主役・不正入力を出し分ける', (t) => {
  const el = elements(t);
  renderAnswer(summarize(bundled), { state: 'empty', age: null }, 'all');
  assert.match(el('answer').innerHTML, /真ん中は60歳/); assert.equal(el('result-share').hidden, true);
  renderAnswer(summarize(bundled, 26), { state: 'valid', age: 26 }, 'all');
  assert.equal(el('answer').attributes['aria-label'], '26歳で受賞した人は、まだいません');
  assert.match(el('answer').innerHTML, /0<small>人/); assert.match(el('answer').innerHTML, /data-age="25">25歳の2人を見る/); assert.match(el('answer').innerHTML, /data-age="30">30歳の1人を見る/);
  assert.match(el('answer').innerHTML, /<span class="nw">（2014年・平和賞）<\/span>/); assert.equal(el('input-note').dataset.warn, 'false');
  assert.equal(el('result-share').hidden, false); assert.equal(el('matches-section').hidden, true);
  renderAnswer(summarize(bundled), { state: 'invalid', age: null }, 'all');
  assert.match(el('answer').innerHTML, /1〜120の整数/); assert.equal(el('app').dataset.input, 'invalid');
  assert.equal(el('age-input').attributes['aria-invalid'], 'true'); assert.equal(el('result-share').hidden, true);
  assert.equal(el('input-note').dataset.warn, 'true'); assert.match(el('input-note').textContent, /1〜120の整数/);
});
test('一覧の30件・残り4件・理由の英語・注記・HTMLを実行させない', (t) => {
  const el = elements(t), matches = summarize(bundled, 54).matches;
  renderMatches(matches, 30); assert.equal((el('matches').innerHTML.match(/<article/g) || []).length, 30);
  assert.equal(el('more').textContent, '残り4人を見る'); assert.equal(el('more').hidden, false);
  renderMatches(matches, 34); assert.equal(el('more').hidden, true);
  renderMatches([{...matches[0], ja:'<img src=x onerror=bad()>', motivation:'<script>bad()</script>', approximate:true, posthumous:true, status:'declined'}], 30);
  assert.doesNotMatch(el('matches').innerHTML, /<script>|<img /);
  assert.match(el('matches').innerHTML, /lang="en"/); assert.match(el('matches').innerHTML, /生まれた月日が不明・発表の前に死去・辞退/);
});
test('今年の欄は待ち・発表済み・データ待ち・失敗・保存分を独立表示', (t) => {
  const el=elements(t), now=Date.parse('2026-10-06T19:00:00+09:00');
  renderLive({...current,state:'ready'},now,bundled);
  assert.equal(el('week').dataset.live,'ready');
  for(const state of ['waiting','announced','pending']) assert.match(el('announcements').innerHTML,new RegExp(`data-announcement="${state}"`));
  assert.match(el('announcements').innerHTML,/カール・ダイセロス ↗/);
  renderLive({...current,state:'stale',saved:true,fetchedAt:now,failed:true},now,bundled);
  assert.match(el('live-note').textContent,/19時00分に取った分を表示/);assert.match(el('live-note').textContent,/保存分/);assert.equal(el('retry').hidden,false);
  renderLive({prizes:[],state:'error',failed:true},now,bundled);
  assert.equal(el('week').dataset.live,'error');assert.match(el('announcements').innerHTML,/データ待ち/);
  assert.match(el('live-note').textContent,/今年の受賞者を取得できませんでした/);
});
test('翌週は年の見出し・日時を外す・取得中の文を添える', (t) => {
  const el=elements(t), now=Date.parse('2026-10-13T00:00:00+09:00');
  renderLive({...current,state:'ready'},now,bundled);
  assert.equal(el('week-title').textContent,'2026年の受賞者');assert.doesNotMatch(el('announcements').innerHTML,/class="schedule"/);
  renderLive({...current,state:'loading'},now,bundled);
  assert.equal(el('week').dataset.live,'loading');assert.match(el('live-note').textContent,/確認しています/);
});
test('物理学賞の発表後は、同梱の日本語名のリンクで出す', (t) => {
  const el=elements(t), now=Date.parse('2026-10-06T21:00:00+09:00');
  renderLive({...afterPhysics,state:'ready'},now,bundled);
  assert.match(el('announcements').innerHTML,/data-cat="phy" data-announcement="announced"/);
  assert.match(el('announcements').innerHTML,/フランシス・ハルツェン ↗/);
  renderLive({...current,state:'ready'},now,bundled);
  assert.match(el('announcements').innerHTML,/発表予定の時刻を過ぎました。(?:<wbr>)?結果がデータに入りしだい出ます/);
});
test('受賞理由の原文にある斜体のタグだけを生かし、ほかはエスケープする', () => {
  const html = motivationHtml('for the bacterium <i>Helicobacter pylori</i>, <I>Buddenbrooks</I> <script>bad()</script>');
  assert.match(html, /<i>Helicobacter pylori<\/i>/); assert.match(html, /<i>Buddenbrooks<\/i>/);
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
});
test('解説欄は入力と同じ年齢でも年齢と同じ歳の印を出さない', (t) => {
  const el=elements(t), now=Date.parse('2026-10-06T21:00:00+09:00');
  renderLive({...afterPhysics,state:'ready'},now,bundled,82);
  assert.match(el('announcements').innerHTML,/フランシス・ハルツェン ↗/);
  assert.doesNotMatch(el('announcements').innerHTML,/歳|same-age/);
  assert.doesNotMatch(el('today-card').innerHTML,/歳|same-age/);
  renderMatches(summarize(bundled,82).matches,10);
  assert.match(el('matches').innerHTML,/82歳/);
  renderLive({...afterPhysics,state:'ready'},now,bundled,26);
  assert.doesNotMatch(el('announcements').innerHTML,/あなたと同じ歳/);
});
test('1人以上の答えは、カードに先頭3人の名前と一覧への案内を出す', (t) => {
  const el = elements(t);
  renderAnswer(summarize(bundled, 25), { state: 'valid', age: 25 }, 'all');
  assert.match(el('answer').innerHTML, /ローレンス・ブラッグ/); assert.match(el('answer').innerHTML, /25歳で受賞した2人の一覧へ/);
  renderAnswer(summarize(bundled, 82), { state: 'valid', age: 82 }, 'all');
  assert.equal((el('answer').innerHTML.match(/<li /g) || []).length, 3); assert.match(el('answer').innerHTML, /ほか6人/);
  assert.match(el('answer').innerHTML, /フランシス・ハルツェン.*<span class="this-year">今年<\/span>/);
  assert.equal(el('matches-title').textContent, '82歳で受賞した9人');
});
test('今週の一覧に集約し、最新の賞を先頭へ出す', (t) => {
  const el=elements(t), now=Date.parse('2026-10-06T21:00:00+09:00');
  renderLive({...afterPhysics,state:'ready',fetchedAt:now},now,bundled);
  assert.match(el('today-card').innerHTML,/data-cat="phy"/);
  assert.match(el('announcements').innerHTML,/上に表示中/);
  assert.equal(el('week-title').textContent,'今週の発表');
  assert.match(el('live-note').textContent,/21時00分に公式データを確認しました/);
});
