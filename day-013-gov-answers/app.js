import {
  isGovernmentSpeech, aggregateByYear, aggregateByMinistry,
  ministryOf, excerpt, buildCitation,
} from './lib/gov.js';

const API = 'https://kokkai.ndl.go.jp/api/speech';
const PAGE = 100;
const MAX_RECORDS = 2000;      // NDLへの負荷を抑えるための取得上限
const GAP_MS = 120;            // 連続リクエストの間隔

const $ = (id) => document.getElementById(id);
const form = $('form'), statusBox = $('status'), results = $('results');
let state = { records: [], year: null, order: 'old', query: '' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setStatus(kind, title, detail) {
  statusBox.hidden = false;
  statusBox.dataset.kind = kind;
  statusBox.innerHTML = '';
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = detail || '';
  statusBox.append(h, p);
}

async function fetchPage(params) {
  const url = `${API}?${new URLSearchParams({ ...params, recordPacking: 'json' })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`国会会議録APIが応答しませんでした（HTTP ${res.status}）`);
  return res.json();
}

async function search(q, fromYear, toYear) {
  const base = { any: q, from: `${fromYear}-01-01`, until: `${toYear}-12-31` };
  const head = await fetchPage({ ...base, maximumRecords: 1 });
  const total = Number(head.numberOfRecords) || 0;
  if (total === 0) return { total, records: [] };
  if (total > MAX_RECORDS) return { total, records: null };

  const records = [];
  for (let start = 1; start <= total; start += PAGE) {
    setStatus('loading', '読み込んでいます…',
      `${Math.min(start - 1 + PAGE, total)} / ${total} 件を取得中`);
    const page = await fetchPage({ ...base, startRecord: start, maximumRecords: PAGE });
    records.push(...(page.speechRecord || []));
    if (!page.nextRecordPosition) break;
    await sleep(GAP_MS);
  }
  return { total, records };
}

function renderYears(rows) {
  const bars = $('bars'); bars.innerHTML = '';
  const max = Math.max(...rows.map((r) => r.count), 1);
  for (const { year, count } of rows) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bar';
    b.setAttribute('aria-pressed', String(state.year === year));
    b.setAttribute('aria-label', `${year}年 ${count}件`);
    b.innerHTML =
      `<span class="n">${count}</span>` +
      `<span class="col" style="height:${Math.round((count / max) * 118) + 2}px"></span>` +
      `<span class="y">${year}</span>`;
    b.addEventListener('click', () => {
      state.year = state.year === year ? null : year;
      renderYears(rows); renderList();
    });
    bars.append(b);
  }
}

function renderMinistries(rows) {
  const box = $('ministries'); box.innerHTML = '';
  const max = Math.max(...rows.map((r) => r.count), 1);
  for (const { ministry, count } of rows.slice(0, 12)) {
    const el = document.createElement('div');
    el.className = 'ministry';
    el.innerHTML =
      `<span class="name" title="${ministry}">${ministry}</span>` +
      `<span class="track"><span class="fill" style="width:${(count / max) * 100}%"></span></span>` +
      `<span class="n">${count}</span>`;
    box.append(el);
  }
}

function renderList() {
  const cards = $('cards'); cards.innerHTML = '';
  let rows = state.records;
  if (state.year) rows = rows.filter((r) => r.date.startsWith(String(state.year)));
  rows = [...rows].sort((a, b) =>
    state.order === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));

  $('filter-note').textContent = state.year ? `${state.year}年で絞り込み中` : '';
  $('list-sub').textContent = `${rows.length}件を表示しています。全文は各カードの原文リンクからお読みください。`;

  for (const r of rows.slice(0, 200)) {
    const card = document.createElement('article');
    card.className = 'card';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${r.date}　${r.nameOfHouse}${r.nameOfMeeting}　${ministryOf(r.speakerPosition) || ''}`;

    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = `${r.speaker}（${r.speakerPosition}）`;

    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = excerpt(r.speech, 180);

    const acts = document.createElement('div');
    acts.className = 'acts';
    const link = document.createElement('a');
    link.href = r.speechURL; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = '原文を読む';
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'secondary'; copy.textContent = '引用をコピー';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(buildCitation(r, 180));
      copy.textContent = 'コピーしました';
      setTimeout(() => { copy.textContent = '引用をコピー'; }, 1600);
    });
    acts.append(link, copy);

    card.append(meta, who, body, acts);
    cards.append(card);
  }
  if (rows.length > 200) {
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = `件数が多いため先頭200件のみ表示しています（該当は${rows.length}件）。年を選ぶか期間を狭めてください。`;
    cards.append(note);
  }
}


form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  const from = Number($('from').value), to = Number($('to').value);
  if (!q) return;
  if (!(from >= 1947 && to >= from && to <= 2026)) {
    setStatus('error', '年の指定を確認してください', '1947年から2026年の範囲で、開始年は終了年以前にしてください。');
    results.hidden = true;
    return;
  }

  $('go').disabled = true;
  results.hidden = true;
  setStatus('loading', '読み込んでいます…', '国会会議録を検索しています。');

  try {
    const { total, records } = await search(q, from, to);
    if (total === 0) {
      setStatus('empty', '見つかりませんでした',
        `「${q}」を含む発言は、指定した期間の会議録にありません。言葉を変えるか期間を広げてください。`);
      return;
    }
    if (records === null) {
      setStatus('empty', '件数が多すぎます',
        `「${q}」は${total}件あり、一度に取得できる上限（${MAX_RECORDS}件）を超えています。期間を狭めるか、より具体的な言葉にしてください。`);
      return;
    }

    const gov = records.filter(isGovernmentSpeech);
    if (gov.length === 0) {
      setStatus('empty', '政府の答弁はありませんでした',
        `「${q}」は${records.length}件見つかりましたが、すべて議員の質問など政府以外の発言でした。`);
      return;
    }

    state = { records: gov, year: null, order: state.order, query: q };
    statusBox.hidden = true;
    results.hidden = false;
    renderYears(aggregateByYear(gov));
    renderMinistries(aggregateByMinistry(gov));
    renderList();
  } catch (err) {
    setStatus('error', '読み込みに失敗しました',
      `${err.message} 通信環境を確認して、もう一度お試しください。`);
  } finally {
    $('go').disabled = false;
  }
});

for (const [id, order] of [['sort-old', 'old'], ['sort-new', 'new']]) {
  $(id).addEventListener('click', () => {
    state.order = order;
    $('sort-old').setAttribute('aria-pressed', String(order === 'old'));
    $('sort-new').setAttribute('aria-pressed', String(order === 'new'));
    renderList();
  });
}
