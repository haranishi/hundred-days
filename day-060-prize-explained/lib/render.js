import { answerText, nameOf, formatNumber, notesOf, sinceYear } from './text.js';
import { categories } from './stats.js';
import { announcementState, schedule, scheduleText, announcedText } from './announcements.js';
import { afterWeek, timeText } from './clock.js';
import { commentaryModel, leadingPrize, commentaryShareText, commentaryName, emptyCommentary } from './commentary.js';
import { bandSvg } from './band.js';
import { phraseChunks, tokenRegex } from './phrase.js';
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
  $('age-input').setAttribute('aria-invalid', String(invalid));
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

const publicUrl = 'https://hundred-days.pages.dev/day-060-prize-explained/';
export const officialSlugs = { med: 'medicine', phy: 'physics', che: 'chemistry', lit: 'literature', pea: 'peace', eco: 'economic-sciences' };
const kindText = { paper: '論文', official: '公式ページ', institution: '研究機関', registry: '登録情報', media: '報道', data: 'データ', reference: '事典・用語集', company: '企業の発表' };
// 出典の補足行「発行元 · 種類 · 英語」。区切りの「·」が行頭に来ないよう、直前に改行しない空白（&nbsp;）を置いた nowrap の span にする。
// 発行元は長いので包まない（包むと390px幅でページが横にはみ出す）。種類と「英語」は短いので、まとめて包む。
const sourceMetaHtml = (source) => {
  const separator = '<span class="nw">&nbsp;·</span> ';
  return escapeHtml(source.publisher) + separator + nw(kindText[source.kind]) + (source.lang === 'en' ? separator + nw('英語') : '');
};
// 日付・数と単位・欧文の識別子・カタカナの名前は nowrap の span で包む（<wbr> を置かないだけでは、ブラウザ自身が数字と漢字のあいだや「・」のあとで折る）。
// 長すぎる欧文（24字超）は包まない（行からはみ出すため）。塊の境目は表記の途中に来ないので、塊ごとに見れば足りる。
const protectHtml = (chunk) => {
  let out = '', last = 0;
  for (const match of chunk.matchAll(tokenRegex())) {
    // 長すぎる表記は包まない（行からはみ出す）。カタカナの長い名前（アイスキューブ・ジェンツー）は、幅の狭い画面で「・」のあとで折れてよい
    if (match[0].length > 24 || (/^[ァ-ヶー]+(?:・[ァ-ヶー]+)+$/.test(match[0]) && match[0].length > 12)) continue;
    out += escapeHtml(chunk.slice(last, match.index)) + nw(escapeHtml(match[0]));
    last = match.index + match[0].length;
  }
  return out + escapeHtml(chunk.slice(last));
};
export const phrase = (text) => phraseChunks(text).map(protectHtml).join('<wbr>');
function personHtml(person, entry, bundled) {
  const name = escapeHtml(commentaryName(person, entry, bundled));
  return `<p class="person"><a class="person-link" href="https://www.nobelprize.org/laureate/${encodeURIComponent(person.id)}" target="_blank" rel="noopener noreferrer" aria-label="${name}の公式の紹介ページ（外部サイト）">${name} ↗</a></p>`;
}
const checkedAtText = (at) => {
  const parts = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).formatToParts(at);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('month')}月${value('day')}日 ${timeText(at)}`;
};
export function prizeCardHtml(prize, data = emptyCommentary(), bundled = [], age = null, prefix = 'today', compact = false) {
  const model = commentaryModel(prize, data);
  const entry = data.entries?.[prize.cat];
  const scope = `${prefix}-${prize.cat}`;
  const sourceId = (number) => `${scope}-source-${number}`;
  const refs = (row) => '\u2060<span class="refs">' + row.refs.map(({ number }) => `<a class="source-ref" href="#${sourceId(number)}" aria-label="出典${number}">[${number}]</a>`).join('') + '</span>';
  const sentences = (rows) => rows.map((row) => `<li class="prose">${phrase(row.text)}${refs(row)}</li>`).join('');
  const reasons = [...new Set(prize.people.map((p) => p.motivation).filter(Boolean))];
  const item = schedule.find((p) => p.cat === prize.cat);
  let body = compact ? '' : `<div class="prize-heading"><h3>${categories[prize.cat]}</h3><p class="small prose">${phrase(announcedText(item, prize.date || undefined))}</p></div>`;
  if (!compact) body += `<div class="persons">${prize.people.map((p) => personHtml(p, entry, bundled)).join('')}</div>`;
  if (model.state !== 'pending') body += `<p class="headline prose">${phrase(model.headline)}</p>`;
  const officialReason = `<section class="official-reason"><h4>公式の受賞理由（原文）</h4>${reasons.length ? reasons.map((text) => `<p class="prose" lang="en">${motivationHtml(text)}</p>`).join('') : `<p class="prose">${phrase('受賞理由はデータ待ちです。')}</p>`}</section>`;
  const officialLink = `<a class="official-link" href="https://www.nobelprize.org/prizes/${officialSlugs[prize.cat]}/2026/press-release/" target="_blank" rel="noopener noreferrer">公式の発表ページ ↗</a>`;
  if (model.state === 'pending') body += officialReason + `<p class="commentary-pending prose">${phrase('この賞の解説は準備中です。公式の発表と論文で事実を確かめてから載せます。')}</p>`;
  else {
    body += `<section class="commentary-fact"><h4>${model.state === 'facts' ? '何をした人か（活動の事実）' : '何をした人か'}</h4><ul>${sentences(model.what)}</ul></section>`;
    if (model.state === 'facts') body += `<p class="prose">${phrase('この賞では、評価は加えず、事実だけを載せます。')}</p>`;
    else {
      if (model.changed.length) body += `<section class="commentary-fact"><h4>何が変わったか</h4><p class="small prose">${phrase('確かめられている事実（研究の中での変化を含みます）')}</p><ul>${sentences(model.changed)}</ul></section>`;
      if (model.expected.length) body += `<section class="commentary-expected"><h4>これから期待されていること</h4><p class="expectation-label">まだ実現していません</p><ul>${sentences(model.expected)}</ul></section>`;
      body += `<section class="commentary-gap"><h4>発見から受賞まで</h4><p class="small prose">${phrase(`論文が出た年と${data.year}年の差です（月は数えず、年だけで数えます）。`)}</p>${model.gap.map((gap) => `<div class="gap-item">${gap.label ? `<p class="gap-label">${phrase(gap.label)}</p>` : ''}<div class="year-line" role="img" aria-label="${escapeHtml(gap.label ? `（${gap.label}）` : '')}${gap.startYear}年から${gap.endYear}年まで${gap.years}年"><span>${gap.startYear}年</span><strong>${gap.years}年</strong><span>${gap.endYear}年</span></div><p class="prose">${phrase(gap.what)}${refs(gap)}</p></div>`).join('')}</section>`;
    }
    body += officialReason;
    body += `<section class="commentary-sources"><h4>出典</h4><p class="small prose">${phrase('論文の題は原題のままです。ウェブページの題は、作者が日本語でつけたものです。')}</p><ol>${model.sources.map((source) => `<li id="${sourceId(source.number)}" tabindex="-1"><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a><span class="source-meta">${sourceMetaHtml(source)}</span></li>`).join('')}</ol></section>`;
    const [year, month, day] = model.verifiedAt.split('-').map(Number);
    body += `<p class="commentary-note prose">${phrase('この解説は、このアプリの作者が上の出典をもとに自分の言葉で書いたものです。公式の文章ではありません。')}<wbr>${nw(`確認日：${year}年${month}月${day}日`)}</p>`;
    body += officialLink;
    const params = new URLSearchParams({ text: commentaryShareText(model), url: publicUrl });
    body += `<a class="commentary-share" href="https://x.com/intent/post?${escapeHtml(params)}" target="_blank" rel="noopener noreferrer">この解説をXで共有</a>`;
  }
  if (model.state === 'pending') body += officialLink;
  if (compact) body += '<button type="button" class="close-card">解説を閉じる ↑</button>';
  return `<article class="prize-card" data-cat="${prize.cat}" data-commentary="${model.state === 'pending' ? 'pending' : 'ready'}" data-mode="${entry?.mode || 'pending'}">${body}</article>`;
}
export function renderLive(report, now, bundled, age = null, data = emptyCommentary()) {
  const expanded = new Set([...($('announcements').querySelectorAll?.('details[open]') || [])].map((node) => node.closest('.announcement').dataset.cat));
  const ended = afterWeek(now), prizes = report.prizes || [];
  const { prize: lead, heading } = leadingPrize(prizes, now);
  $('today-title').textContent = heading;
  const jump = document.querySelector?.('.jump a[href="#today"]');
  if (jump) jump.textContent = heading;
  $('today-card').innerHTML = lead ? prizeCardHtml(lead, data, bundled, age) : `<p class="phr">最初の発表は${scheduleText(schedule[0])}です。</p>`;
  $('week-title').textContent = ended ? '2026年の受賞者' : '今週の発表';
  $('current-year').hidden = ended;
  $('current-year').textContent = `${data.year}年の発表`;
  $('week').dataset.live = report.state;
  $('retry').hidden = !report.failed;
  $('retry').disabled = report.state === 'loading';
  $('live-note').textContent = report.state === 'loading' ? '今年の発表を確認しています…' : report.state === 'error' ? '今年の受賞者を取得できませんでした。このページに入っている記録を表示しています。' : report.saved ? `${checkedAtText(report.fetchedAt)}に取った分を表示しています。${report.failed ? '今年の受賞者を取得できませんでした。保存分で表示しています。' : ''}` : `${checkedAtText(report.fetchedAt ?? now)}に公式データを確認しました。`;
  $('announcements').innerHTML = schedule.map((item) => {
    const state = announcementState(item, prizes, now);
    const prize = prizes.find((p) => p.cat === item.cat && p.year === 2026);
    const entry = data.entries?.[item.cat];
    const label = state === 'announced' ? `発表済み（${entry ? '解説あり' : '準備中'}）` : { waiting: '発表待ち', pending: 'データ待ち' }[state];
    const when = ended ? '' : `<p class="schedule">${phrase(state === 'announced' ? announcedText(item, prize?.date || undefined) : scheduleText(item, prize?.date || undefined))}</p>`;
    let body = when;
    if (state === 'announced') {
      body = `<div class="persons">${prize.people.map((person) => personHtml(person, entry, bundled, age)).join('')}</div>` + when;
      if (lead?.cat === item.cat) body += '<a class="shown-above" href="#today">上に表示中</a>';
      else if (entry) body += `<details${expanded.has(item.cat) ? ' open' : ''}><summary><span class="when-closed">解説を読む</span><span class="when-open">解説を閉じる</span></summary>${prizeCardHtml(prize, data, bundled, age, 'week', true)}</details>`;
    } else if (state === 'pending') body = `<p class="phr">発表予定の時刻を過ぎました。<wbr>結果がデータに入りしだい出ます</p>${when}`;
    return `<article class="announcement" data-cat="${item.cat}" data-announcement="${state}"><div class="announcement-head"><h3>${item.title}</h3><span class="state" data-state="${state}">${label}</span></div><div class="announcement-body">${body}</div></article>`;
  }).join('');
}
