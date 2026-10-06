import { answerText, nameOf, formatNumber, notesOf, sinceYear } from './text.js';
import { categories } from './stats.js';
import { ageAt } from './age.js';
import { announcementState, schedule, scheduleText, announcedText } from './announcements.js';
import { afterWeek, timeText } from './clock.js';
import { bandSvg } from './band.js';
const $ = (id) => document.getElementById(id);
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/* 日本語の折り返し：iPhone の Safari は word-break: auto-phrase を使えないので、
   割りたくない塊は nowrap の span（.nw）で包み、折ってよい位置に <wbr> を置く（親は .phr＝keep-all）。
   UI採点1周目で「（2014年・平／和賞）」「のべ／999回」の泣き別れを指摘された */
const nw = (text) => `<span class="nw">${text}</span>`;
const subjectHtml = (age, cat) => `${cat === 'all' ? '' : `${categories[cat]}を<wbr>`}${nw(`${age}歳で`)}<wbr>受賞した人は、`;
const thisYear = (row) => (row.year === 2026 ? '<span class="this-year">今年</span>' : '');
function extremeHtml(row, label) {
  if (!row) return '';
  return `<p class="phr">${label}は${nw(`${row.age}歳の`)}<wbr>${nw(escapeHtml(nameOf(row)))}<wbr>${nw(`（${row.year}年・${categories[row.cat]}）`)}</p>`;
}
/* 受賞理由の原文には <i>…</i>（学名や書名）が入っている。全部をエスケープしてから、斜体のタグだけを戻す */
export const motivationHtml = (text) => escapeHtml(text).replace(/&lt;(\/?)i&gt;/gi, '<$1i>');

export function renderBand(summary, age) {
  $('band').innerHTML = bandSvg(summary, age, $('band').clientWidth || 740);
}

export function renderAnswer(summary, input, cat) {
  const invalid = input.state === 'invalid';
  $('app').dataset.input = input.state;
  $('age').setAttribute('aria-invalid', String(invalid));
  // 入力ミスは入力欄のすぐ下でも知らせる（答えのカードは入力欄から離れている）
  $('input-note').textContent = invalid ? '1〜120の整数で入れてください。' : '1〜120歳。年齢はこの端末にだけ保存します。';
  $('input-note').dataset.warn = String(invalid);
  $('result-share').hidden = input.state !== 'valid';
  $('matches-section').hidden = input.state !== 'valid' || !summary.matches.length;
  const extremes = `<div class="extremes">${extremeHtml(summary.youngest, '最年少')}${extremeHtml(summary.oldest, '最年長')}</div>`;
  let main = '';
  let side = '';
  if (invalid) {
    main = '<p class="lead">1〜120の整数で入れてください。</p>';
  } else if (input.state === 'empty') {
    main = `<p class="lead">受賞したときの年齢は</p><span class="answer-number range">${summary.youngest?.age ?? '—'}<small>歳</small><span class="range-sep">〜</span>${summary.oldest?.age ?? '—'}<small>歳</small></span><p class="answer-tail">真ん中は${summary.median ?? '—'}歳</p>`;
    side = '<p class="answer-detail phr">あなたの歳を<wbr>入れると、<wbr>その歳の<wbr>受賞者が<wbr>出ます。</p>';
  } else {
    const count = summary.matches.length;
    // 文としても「まだいません」が読めるようにし、0の数字は視覚の補助にする。
    main = `<p class="lead phr">${subjectHtml(input.age, cat)}</p><span class="answer-number"${count ? '' : ' aria-hidden="true"'}>${formatNumber(count)}<small>人</small></span>${count ? '' : '<p class="answer-tail">まだいません。</p>'}`;
    const younger = `<p class="answer-detail phr">いまの<wbr>あなたより<wbr>若くして<wbr>受賞したのは、<wbr>${nw(`のべ${formatNumber(summary.total)}回のうち${formatNumber(summary.younger)}回`)}。</p>`;
    if (count) {
      // 1人以上なら、カードの中で先頭の3人まで名前を出す。名前が一覧（画面2枚近く下）まで出てこなかった（UI採点2周目）
      const names = summary.matches.slice(0, 3).map((row) => `<li class="phr">${nw(escapeHtml(nameOf(row)))}<wbr>${nw(`（${row.year}年・${categories[row.cat]}）`)}${thisYear(row)}</li>`).join('');
      side = `<ul class="names">${names}</ul>${count > 3 ? `<p class="answer-detail">ほか${formatNumber(count - 3)}人</p>` : ''}<p class="to-list"><a href="#matches-section">${input.age}歳で受賞した${formatNumber(count)}人の一覧へ ↓</a></p>${younger}`;
    } else {
      // 0人の答えに次の一手を付ける。近い歳を押すと、その歳に入れ替わる
      side = summary.nearest.length ? `<p class="answer-detail">近い歳</p><div class="near">${summary.nearest.map((age) => `<button type="button" class="near-age" data-age="${age}">${age}歳の${formatNumber(summary.histogram.get(age))}人を見る</button>`).join('')}</div>${younger}` : younger;
    }
    $('matches-title').textContent = `${cat === 'all' ? '' : `${categories[cat]}を`}${input.age}歳で受賞した${formatNumber(count)}人`;
  }
  $('answer').innerHTML = `<div class="answer-main">${main}</div><div class="answer-side">${side}${extremes}</div>`;
  if (input.state === 'valid') $('answer').setAttribute('aria-label', answerText(input.age, cat, summary.matches.length));
  else $('answer').removeAttribute('aria-label');
  renderBand(summary, input.age);
  $('count-note').innerHTML = `年齢は、<wbr>受賞が<wbr>発表された日の<wbr>満年齢。<wbr>${nw(`${sinceYear(cat)}〜2026年・`)}<wbr>${cat === 'all' ? '' : `${nw(`${categories[cat]}・`)}<wbr>`}${nw(`個人のべ${formatNumber(summary.total)}回`)}${nw('（団体は数えない）')}`;
}

export function renderMatches(rows, limit) {
  // 項目の区切りは「 · 」。賞の名前の中の「・」（生理学・医学賞）と見分ける
  $('matches').innerHTML = rows.slice(0, limit).map((row) => `<article class="laureate"><h3>${escapeHtml(nameOf(row))}${thisYear(row)}</h3><p class="details">${nw(`${row.year}年 · ${categories[row.cat]} · ${row.age}歳`)}${notesOf(row) ? `<wbr>${nw(`（${notesOf(row)}）`)}` : ''}</p>${row.motivation ? `<p class="motivation" lang="en">${motivationHtml(row.motivation)}</p>` : ''}<a href="https://www.nobelprize.org/laureate/${encodeURIComponent(row.id)}" target="_blank" rel="noopener noreferrer">公式の紹介を読む ↗</a></article>`).join('');
  $('more').hidden = rows.length <= limit;
  $('more').textContent = `残り${formatNumber(Math.max(0, rows.length - limit))}人を見る`;
}

export function renderLive(report, now, bundled, age = null) {
  const ended = afterWeek(now);
  $('current-title').textContent = ended ? '2026年の受賞者' : '今年の受賞者';
  $('current-year').hidden = ended;
  $('current').dataset.live = report.state;
  $('retry').hidden = !report.failed;
  $('retry').disabled = report.state === 'loading';
  $('live-note').textContent = report.state === 'loading' ? '今年の発表を確認しています…' : report.state === 'error' ? '今年の受賞者を取得できませんでした。答えは、このページに入っている記録から出しています。' : report.saved ? `${timeText(report.fetchedAt)}に取った分を表示しています。${report.failed ? '今年の受賞者を取得できませんでした。保存分で表示しています。' : ''}` : `${timeText(report.fetchedAt)}に公式データを確認しました。`;
  renderPulse(report, now, ended);
  $('announcements').innerHTML = report.state === 'error' ? '' : schedule.map((item) => {
    const state = announcementState(item, report.prizes, now);
    const prize = report.prizes.find((p) => p.cat === item.cat);
    const label = { waiting: '発表待ち', announced: '発表済み', pending: 'データ待ち' }[state];
    const when = ended ? '' : `<p class="schedule">${nw(state === 'announced' ? announcedText(item, prize?.date || undefined) : scheduleText(item, prize?.date || undefined))}</p>`;
    let body = '';
    if (state === 'announced') {
      body = prize.people.map((person) => {
        const previous = bundled.find((row) => row.id === person.id && row.cat === person.cat && row.year === person.year);
        // 生年月日が届いていれば数え直し、まだなら同梱の計算済みの年齢を使う（同梱分は生年月日を持たない）
        const row = { ...previous, ...person, ja: previous?.ja ?? null };
        const measured = ageAt(row);
        const notes = notesOf({ ...row, ...measured });
        const years = person.isOrg ? '団体（年齢は数えない）' : measured.age === null ? '年齢はデータ待ち' : `${measured.age}歳${notes ? `（${notes}）` : ''}`;
        const same = !person.isOrg && age !== null && measured.age === age ? '<span class="same-age">あなたと同じ歳</span>' : '';
        return `<p class="person">${escapeHtml(nameOf(row))} · ${years}${same}</p>`;
      }).join('') + when;
    } else if (state === 'pending') {
      body = `<p class="phr">発表予定の時刻を過ぎました。<wbr>結果がデータに入りしだい出ます</p>${when}`;
    } else {
      body = when;
    }
    return `<article class="announcement" data-cat="${item.cat}" data-announcement="${state}"><div class="announcement-head"><h3>${item.title}</h3><span class="state" data-state="${state}">${label}</span></div><div class="announcement-body">${body}</div></article>`;
  }).join('');
}

/* 答えのすぐ下に、今年の発表を1行で。今年の欄は一覧の下に沈むので、発表週の旬の情報をここでも見せる（UI採点2周目） */
function renderPulse(report, now, ended) {
  const pulse = $('pulse');
  if (!pulse) return;
  if (ended || report.state === 'loading' || report.state === 'error') { pulse.hidden = true; return; }
  const states = schedule.map((item) => ({ item, state: announcementState(item, report.prizes, now) }));
  const done = states.filter(({ state }) => state === 'announced').map(({ item }) => item.title);
  const next = states.find(({ state }) => state === 'waiting')?.item;
  const parts = [done.length ? `${done.join('、')}が発表済み。` : '', next ? `次は${next.title}、${nw(scheduleText(next))}。` : ''].filter(Boolean);
  pulse.hidden = !parts.length;
  pulse.innerHTML = `今年の発表：<wbr>${parts.join('<wbr>')}<wbr><a href="#current">${nw('今年の受賞者へ ↓')}</a>`;
}
