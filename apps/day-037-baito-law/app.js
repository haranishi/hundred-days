/* バイトの法律、原文はこう。

   e-Gov 法令API Version 2 から、選ばれた困りごとの根拠条文だけを取って出す。
   条文の文字列は変えない。ルビと色は <ruby> と <span> を重ねるだけで、本文は素のまま残る。

   同じ札を選び直したときのために、取った条文はこのページが開いている間だけ覚えておく
   （localStorage には残さない。法律は改正されるので、古い条文を持ち越さない）。 */

import { annotate } from './lib/kansuji.js';
import { apiUrl, formatEnforcedOn, sourceUrl, toArticle } from './lib/lawtext.js';
import { TOPICS, findTopic, lawOf } from './lib/topics.js';

const el = (id) => document.getElementById(id);
const app = el('app');

/* 誰の義務かを色で分ける。条文は主語が分かると急に読める。 */
const ACTORS = [
  ['使用者', 'employer'],
  ['労働者', 'worker'],
];

const state = { topicKey: null, loading: false };
const cache = new Map();

/* ---------- 描く ---------- */

function renderTopics() {
  const list = el('topics');
  list.textContent = '';
  for (const topic of TOPICS) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'topic';
    button.dataset.topic = topic.key;
    button.textContent = topic.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => select(topic.key));
    li.appendChild(button);
    list.appendChild(li);
  }
}

function markSelected() {
  for (const button of el('topics').querySelectorAll('.topic')) {
    const on = button.dataset.topic === state.topicKey;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

/* 本文に、ルビと色を重ねた要素を作る。文字列は足しも引きもしない。 */
function decorate(text) {
  const fragment = document.createDocumentFragment();
  for (const part of annotate(text)) {
    if (part.type === 'ruby') {
      const ruby = document.createElement('ruby');
      ruby.append(document.createTextNode(part.value));
      const rt = document.createElement('rt');
      rt.textContent = part.reading;
      ruby.append(rt);
      fragment.append(ruby);
      continue;
    }
    fragment.append(...paintActors(part.value));
  }
  return fragment;
}

/* 「使用者」「労働者」だけを塗る。ほかの語には触らない。 */
function paintActors(text) {
  const nodes = [];
  let buffer = '';
  let i = 0;
  const flush = () => {
    if (buffer) nodes.push(document.createTextNode(buffer));
    buffer = '';
  };
  while (i < text.length) {
    const hit = ACTORS.find(([word]) => text.startsWith(word, i));
    if (!hit) {
      buffer += text[i];
      i += 1;
      continue;
    }
    flush();
    const [word, kind] = hit;
    const span = document.createElement('span');
    span.className = `who who--${kind}`;
    span.textContent = word;
    nodes.push(span);
    i += word.length;
  }
  flush();
  return nodes;
}

function renderArticle(article, topic) {
  const law = lawOf(topic);
  el('article-law').textContent = `${article.lawTitle} 第${article.articleNum}条`;
  el('article-caption').textContent = article.caption || `第${article.articleNum}条`;

  const body = el('article-body');
  body.textContent = '';
  for (const paragraph of article.paragraphs) {
    const block = document.createElement('div');
    block.className = 'para';

    const num = document.createElement('p');
    num.className = 'para__num';
    num.textContent = article.paragraphs.length > 1 ? `第${paragraph.num}項` : '';
    if (num.textContent) block.append(num);

    const text = document.createElement('p');
    text.className = 'para__text';
    text.append(decorate(paragraph.text));
    block.append(text);

    if (paragraph.items.length) {
      const items = document.createElement('ul');
      items.className = 'items';
      for (const item of paragraph.items) {
        const li = document.createElement('li');
        const title = document.createElement('span');
        title.className = 'items__title';
        title.textContent = item.title;
        li.append(title);
        const itemText = document.createElement('span');
        itemText.append(decorate(item.text));
        li.append(itemText);
        items.append(li);
      }
      block.append(items);
    }
    body.append(block);
  }

  const enforced = formatEnforcedOn(article.enforcedOn);
  el('enforced').textContent = enforced
    ? `${enforced} 施行時点の条文です。法令は改正されます。`
    : '施行日が取れませんでした。原典で確かめてください。';

  const href = sourceUrl(law.id, topic.anchor);
  el('source').href = href;
  el('source').textContent = `e-Gov法令検索で${article.lawTitle}第${article.articleNum}条を見る`;
}

function setPhase(phase, message) {
  state.loading = phase === 'loading';
  app.dataset.state = phase;
  el('status').textContent = message;
  el('result').hidden = phase !== 'ready';
  el('failure').hidden = phase !== 'error';
  for (const button of el('topics').querySelectorAll('.topic')) button.disabled = state.loading;
}

/* ---------- 取る ---------- */

async function fetchArticle(topic) {
  const law = lawOf(topic);
  const response = await fetch(apiUrl(law.id, topic.article), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`e-Gov法令APIが${response.status}を返しました`);
  const article = toArticle(await response.json());
  if (!article) throw new Error('条文の形が想定と違いました');
  return article;
}

async function select(key) {
  const topic = findTopic(key);
  if (!topic || state.loading) return;
  state.topicKey = key;
  markSelected();

  const law = lawOf(topic);
  /* 通信に失敗しても原典へは行けるようにしておく */
  el('failure-source').href = sourceUrl(law.id, topic.anchor);

  if (cache.has(key)) {
    renderArticle(cache.get(key), topic);
    setPhase('ready', `${topic.label}`);
    return;
  }

  setPhase('loading', '条文を取りに行っています…');
  try {
    const article = await fetchArticle(topic);
    if (state.topicKey !== key) return;
    cache.set(key, article);
    renderArticle(article, topic);
    setPhase('ready', `${topic.label}`);
  } catch (error) {
    if (state.topicKey !== key) return;
    el('failure-text').textContent = `条文を取ってこられませんでした（${error.message}）。通信を確かめて、もう一度お試しください。`;
    setPhase('error', '条文を出せませんでした');
  }
}

/* ---------- 起こす ---------- */

function boot() {
  renderTopics();
  el('retry').addEventListener('click', () => {
    const key = state.topicKey;
    if (!key) return;
    cache.delete(key);
    select(key);
  });
  setPhase('empty', '気になることを選んでください');

  const preset = new URLSearchParams(location.search).get('topic');
  if (preset && findTopic(preset)) select(preset);
}

boot();
