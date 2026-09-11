import { validateTarget, displayHost } from './lib/target.js';
import { toArticle } from './lib/meta.js';
import { paperDate, issueLabel } from './lib/kanji.js';
import { renderPaper } from './lib/paper.js';
import { load, save, clear, MAX_ARTICLES } from './lib/store.js';

const DAY = 35;
const PAGE_ENDPOINT = '/api/day-035/page';
const IMAGE_ENDPOINT = '/api/day-035/image';

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

function setState(next) {
  app.dataset.state = next;
  status.hidden = next !== 'loading';
  el('ready-actions').hidden = next !== 'ready';
  el('hint').hidden = next !== 'ready';
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

/* 紙面と、その下の一覧を同じ材料から描き直す。状態を変える所と描く所を分けない
   （Day 032 で setState の書き忘れから15件落ちた教訓） */
function render(state) {
  renderPaper(canvas, { articles, date: paperDate(), issue: issueLabel(DAY) });
  canvas.setAttribute('aria-label', describe());
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
  setState(state);
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.decoding = 'sync';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null); // 写真は無くても紙面は組む
    image.src = `${IMAGE_ENDPOINT}?src=${encodeURIComponent(src)}`;
  });
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
  article.imageEl = await loadImage(article.image);
  articles = [...articles, article];
  save(articles.map(({ imageEl, ...rest }) => rest));
  input.value = '';
  render('ready');
}

async function restore() {
  const saved = load();
  if (!saved.length) {
    render('empty');
    return;
  }
  render('empty');
  const restored = [];
  for (const item of saved) {
    restored.push({ ...item, imageEl: await loadImage(item.image) });
  }
  articles = restored;
  render('ready');
}

/* 2倍で刷って保存する。iOS Safari は面積の上限を超えると toBlob が null を返すので、
   そのときは等倍で刷り直す（Day 027 で当たった） */
async function toPng() {
  const off = document.createElement('canvas');
  for (const scale of [2, 1]) {
    renderPaper(off, { articles, date: paperDate(), issue: issueLabel(DAY) }, { scale });
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
