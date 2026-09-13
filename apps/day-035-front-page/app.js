import { validateTarget, displayHost } from './lib/target.js';
import { toArticle } from './lib/meta.js';
import { paperDate, issueLabel } from './lib/kanji.js';
import { renderPaper } from './lib/paper.js';
import { PAPER } from './lib/layout.js';
import { load, save, clear, MAX_ARTICLES } from './lib/store.js';

const DAY = 35;
const PAGE_ENDPOINT = '/api/day-035/page';

/* 失敗はまとめて「読めませんでした」にしない。どこで止まったかで次の行動が変わる */
const MESSAGES = {
  invalid_url: 'そのリンクは読み取れませんでした。http から始まる公開ページのURLを貼ってください。',
  upstream_unavailable: 'ページを取りに行けませんでした。公開されているURLか確かめてください。',
  blocked_redirect: '転送先が読み取れないページでした。',
  too_many_redirects: '転送が多すぎて、たどり着けませんでした。',
  not_html: 'そのURLはWebページではありませんでした。',
  encoding_unsupported: 'このページの文字コードには対応していません。',
  no_meta: 'ページは読めましたが、見出しが見つかりませんでした。',
  timeout: '時間内に返事がありませんでした。もう一度試してください。',
  network: 'つながりませんでした。通信を確かめてもう一度どうぞ。',
  duplicate: 'そのリンクはもう載っています。',
  full: '一面に載せられるのは3本までです。'
};

const el = (id) => document.getElementById(id);
const app = el('app');
const canvas = el('paper');
const form = el('add-form');
const input = el('url');
const errorBox = el('error');
const status = el('status');
const list = el('list');

let articles = [];

function setState(next, shownPhotos = 0) {
  app.dataset.state = next;
  status.hidden = next !== 'loading';
  el('ready-actions').hidden = next !== 'ready';
  el('hint').hidden = next !== 'ready';
  // 保存してから気づく形にしない。写真が出ている紙面のときだけ、保存前に断っておく
  el('photo-note').hidden = next !== 'ready' || shownPhotos === 0;
}

function showError(code) {
  errorBox.textContent = MESSAGES[code] ?? MESSAGES.upstream_unavailable;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function describe() {
  if (!articles.length) return 'まだ記事がありません。リンクを貼ると一面が組み上がります';
  const heads = articles.map((a, i) => `${i + 1}本目「${a.headline}」（${a.site}）`).join('、');
  return `${paperDate()}の一面。${heads}`;
}

/* 紙面に写真は焼かない（他媒体の写真はその媒体のもの）。画面では、紙面が空けた枠へ
   提供元の画像をそのまま重ねる。canvas は画像に触れないので汚れず、保存も落ちない。
   ⚠️ 提供元は事前に列挙できない＝この Day の CSP は img-src に https: が要る
   （scripts/build.mjs の IMG_BY_APP） */
function renderPhotos(boxes) {
  const layer = el('photos');
  // 一度でも読み込んだ画像は要素ごと使い回す。作り直すと紙面が組み直るたびに写真が瞬く
  const pool = new Map([...layer.querySelectorAll('img')].map((img) => [img.dataset.src, img]));
  layer.replaceChildren();
  for (const box of boxes) {
    const url = articles[box.index]?.image;
    if (!url) continue;
    const frame = document.createElement('div');
    frame.className = 'photo';
    frame.style.left = `${(box.left / PAPER.width) * 100}%`;
    frame.style.top = `${(box.top / PAPER.height) * 100}%`;
    frame.style.width = `${(box.width / PAPER.width) * 100}%`;
    frame.style.height = `${(box.height / PAPER.height) * 100}%`;
    frame.append(pool.get(url) ?? photoImage(url));
    layer.append(frame);
  }
  return layer.childElementCount;
}

function photoImage(url) {
  const img = document.createElement('img');
  img.alt = ''; // 紙面の中身は canvas の aria-label で読み上げる
  img.decoding = 'async';
  img.dataset.src = url;
  // 読めない写真（CORSではなく、消えた・混在コンテンツ等）は紙面から外し、文字で組み直す
  img.addEventListener('error', () => {
    for (const article of articles) if (article.image === url) article.photoBroken = true;
    render(app.dataset.state);
  });
  img.src = url;
  return img;
}

/* 紙面に渡す材料。読めなかった写真は無かったことにして、写真なしの紙面に組み直す */
function paperModel() {
  return {
    articles: articles.map((article) => (article.photoBroken ? { ...article, image: null } : article)),
    date: paperDate(),
    issue: issueLabel(DAY)
  };
}

/* 紙面と、その下の一覧を同じ材料から描き直す。状態を変える所と描く所を分けない
   （Day 032 で setState の書き忘れから15件落ちた教訓） */
function render(state) {
  const sheet = renderPaper(canvas, paperModel());
  const shownPhotos = renderPhotos(sheet.photos);
  canvas.setAttribute('aria-label', describe());
  const remaining = MAX_ARTICLES - articles.length;
  const more = el('more');
  more.disabled = remaining <= 0;
  more.textContent = remaining > 0 ? `記事を足す（あと${remaining}本）` : '3本そろいました';
  list.innerHTML = '';
  articles.forEach((article, index) => {
    const item = document.createElement('li');
    const order = document.createElement('span');
    order.className = 'order';
    order.textContent = ['一番手', '二番手', '三番手'][index] ?? `${index + 1}本目`;
    const headline = document.createElement('span');
    headline.className = 'headline';
    headline.textContent = article.headline;
    const host = document.createElement('span');
    host.textContent = article.host;
    item.append(order, headline, host);
    list.append(item);
  });
  setState(state, shownPhotos);
}

async function add(rawUrl) {
  const target = validateTarget(rawUrl);
  if (!target) {
    showError('invalid_url');
    return;
  }
  if (articles.length >= MAX_ARTICLES) {
    showError('full');
    return;
  }
  if (articles.some((a) => a.url === target.href)) {
    showError('duplicate');
    return;
  }
  clearError();
  setState('loading');
  let payload;
  try {
    const response = await fetch(`${PAGE_ENDPOINT}?url=${encodeURIComponent(target.href)}`, { headers: { Accept: 'application/json' } });
    payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(payload.error);
      render(articles.length ? 'ready' : 'error');
      return;
    }
  } catch {
    showError('network');
    render(articles.length ? 'ready' : 'error');
    return;
  }
  const article = toArticle({ ...payload, url: payload.canonical || target.href, host: payload.host || displayHost(target.href) });
  articles = [...articles, article];
  // photoBroken は「いま読めなかった」だけの印。残すと次に開いたとき写真が出ない
  save(articles.map(({ photoBroken, ...rest }) => rest));
  input.value = '';
  render('ready');
}

function restore() {
  const saved = load();
  articles = saved;
  render(saved.length ? 'ready' : 'empty');
}

/* 2倍で刷って保存する。iOS Safari は面積の上限を超えると toBlob が null を返すので、
   そのときは等倍で刷り直す（Day 027 で当たった）。
   photos: false ＝ 写真の枠を空けない紙面。見出しと本文だけで組み直す */
async function toPng() {
  const off = document.createElement('canvas');
  for (const scale of [2, 1]) {
    renderPaper(off, paperModel(), { scale, photos: false });
    const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
    if (blob) return blob;
  }
  return null;
}

async function saveImage() {
  const button = el('save');
  button.disabled = true;
  try {
    const blob = await toPng();
    if (!blob) {
      showError('upstream_unavailable');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const { year, month, day } = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() };
    link.href = url;
    link.download = `front-page-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  add(input.value);
});

el('paste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      input.value = text.trim();
      clearError();
    }
  } catch {
    input.focus(); // 読み取りを許していない端末では、手で貼ってもらう
  }
});

el('save').addEventListener('click', saveImage);

el('more').addEventListener('click', () => {
  if (articles.length >= MAX_ARTICLES) {
    showError('full');
    return;
  }
  clearError();
  render('empty');
  input.focus();
});

el('reset').addEventListener('click', () => {
  articles = [];
  clear();
  input.value = '';
  clearError();
  render('empty');
});

restore();
