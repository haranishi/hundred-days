import { parseAge } from './lib/age.js';
import { categories, mergeAwards, summarize } from './lib/stats.js';
import { shareText } from './lib/text.js';
import { readNow } from './lib/clock.js';
import { fetchCurrent, getStorage, savedAge, saveAge, loadCache, cacheLifetime } from './lib/live.js';
import { renderAnswer, renderMatches, renderLive, renderBand } from './lib/render.js';
const $ = (id) => document.getElementById(id);
const publicUrl = 'https://hundred-days.pages.dev/day-059-laureate-age/';
const storage = getStorage();
const now = () => readNow(location.search);
// 一覧は10人ずつ。30人を一度に並べるとスマホで約6,700pxになる（UI採点1周目）
const PAGE = 10;
let bundled = [], awards = [], cat = 'all', limit = PAGE, initialized = false, loading = false;
let report = { state: 'loading', awards: [], prizes: [] };
let summary;
const buttons = [['all', 'すべて'], ...Object.entries(categories)];
for (const [value, title] of buttons) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.cat = value; button.textContent = title;
  button.setAttribute('aria-label', `${title}（${value === cat ? '選択中' : '未選択'}）`);
  button.setAttribute('aria-pressed', String(value === cat));
  button.addEventListener('click', () => {
    cat = value; limit = PAGE;
    for (const item of $('categories').children) {
      item.setAttribute('aria-pressed', String(item.dataset.cat === cat));
      item.setAttribute('aria-label', `${item.textContent}（${item.dataset.cat === cat ? '選択中' : '未選択'}）`);
    }
    paint();
  });
  $('categories').append(button);
}
const remembered = savedAge(storage);
$('age').value = parseAge(remembered).state === 'valid' ? remembered : '';
const currentAge = () => parseAge($('age').value).age;
function paint() {
  if (!initialized) return;
  const input = parseAge($('age').value);
  summary = summarize(awards, input.age, cat);
  renderAnswer(summary, input, cat);
  renderMatches(summary.matches, limit);
  renderLive(report, now(), bundled, input.age);
  $('copy-note').textContent = '';
  if (input.state === 'valid') {
    const params = new URLSearchParams({ text: shareText(input.age, cat, summary.matches.length), url: publicUrl });
    $('result-x').href = `https://x.com/intent/post?${params}`;
  }
}
$('age').addEventListener('input', () => {
  limit = PAGE;
  const input = parseAge($('age').value);
  if (input.state !== 'invalid') saveAge(storage, input.state === 'valid' ? String(input.age) : '');
  paint();
});
$('more').addEventListener('click', () => { limit += PAGE; renderMatches(summary.matches, limit); });
// 0人の答えの「近い歳」ボタン。押すとその歳に入れ替える（入力欄と同じ道を通す）
$('answer').addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-age]');
  if (!button) return;
  $('age').value = button.dataset.age;
  $('age').dispatchEvent(new Event('input', { bubbles: true }));
});
// 帯の図は画面の幅で描く（文字の大きさを固定するため）。幅が変わったら描き直す
if ('ResizeObserver' in globalThis) {
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (!summary || width === lastWidth) return;
    lastWidth = width;
    renderBand(summary, currentAge());
  }).observe($('band'));
}
$('copy').addEventListener('click', async () => {
  const input = parseAge($('age').value);
  if (input.state !== 'valid') return;
  try {
    await navigator.clipboard.writeText(`${shareText(input.age, cat, summary.matches.length)}\n${publicUrl}`);
    $('copy-note').textContent = 'コピーしました';
  } catch { $('copy-note').textContent = 'コピーできませんでした。Xで共有から文を選べます。'; }
});
async function load(force = false) {
  if (loading) return;
  loading = true;
  renderLive({ ...report, state: 'loading' }, now(), bundled, currentAge());
  report = await fetchCurrent({ storage, now: now(), force });
  awards = mergeAwards(bundled, report.awards);
  paint();
  loading = false;
}
$('retry').addEventListener('click', () => load(true));
async function boot() {
  const response = await fetch('./data/laureates.json');
  if (!response.ok) throw new Error('同梱データ');
  const data = await response.json();
  bundled = data.awards; initialized = true;
  const cache = loadCache(storage);
  awards = mergeAwards(bundled, cache?.awards || []);
  $('app').dataset.state = 'ready';
  paint();
  await load();
  // 開いたまま発表時刻を越えても、待ちの表示とキャッシュ期限を更新する。
  setInterval(() => { if (!loading) { renderLive(report, now(), bundled, currentAge()); if (report.fetchedAt && now() - report.fetchedAt >= cacheLifetime(now())) load(); } }, 60000);
}
boot().catch(() => {
  $('app').dataset.state = 'error';
  $('answer').textContent = '記録を読み込めませんでした。ページを読み直してください。';
  $('live-note').textContent = '今年の発表を確認できませんでした。';
  $('current').dataset.live = 'error';
});
