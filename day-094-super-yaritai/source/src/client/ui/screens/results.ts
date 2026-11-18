// 結果：勝者を大きく → 順位 → 自分の内訳（やっちゃダメのハンコ・ひみつ・捕まった回数・店の被害率）→ シェア。
// 「もう一回」「タイトルへ」は画面の下に貼りつけ、スクロールしなくても押せるようにする（docs/01：終わったら「もう一回」）。

import type { ScreensAPI } from '../../contracts';
import { currentAudio } from '../../audio';
import { MISDEEDS, SECRETS, type ScoreKind } from '../../../shared/rules/misdeeds';
import { COMPLETE_BADGE } from '../../../shared/rules/tuning';
import type { MatchResult, PlayerResult } from '../../../shared/view';
import { SITE_URL } from '../../site';
import { createShareBlock, resultShareText } from '../share';
import { button, formatPoints, h, nameBreaks, phraseBreaks, prefersReducedMotion } from './dom';
import { charLabel, faceImg, hanko, icon, lookOf, slotBadge, slotMark } from './looks';
import { awning } from './parts';

type ResultHandlers = Parameters<ScreensAPI['showResults']>[1];

const KIND_LABEL: Record<ScoreKind, string> = {
  ...(Object.fromEntries(MISDEEDS.map((m) => [m.id, m.name])) as Record<(typeof MISDEEDS)[number]['id'], string>),
  knock: '商品を落とした（体当たり・蹴る）',
  escape: '店員さんから逃げ切った',
};

function nameOf(p: PlayerResult): string {
  return p.name || charLabel(p.character) || `${p.slot + 1}P`;
}

/** 「あなた」「CPU」の札。名前がすでにそう言っていれば付けない（ゲームの芯は人の名前を「あなた」にしている） */
function whoTags(p: PlayerResult, mySlot: number): (HTMLElement | null)[] {
  const name = nameOf(p);
  return [
    p.slot === mySlot && !name.includes('あなた') ? h('span', { class: 'sy-tag sy-tag--you' }, 'あなた') : null,
    p.kind === 'cpu' && !/CPU/i.test(name) ? h('span', { class: 'sy-tag' }, 'CPU') : null,
  ];
}

function completeBadge(): HTMLElement {
  return h('span', { class: 'sy-badge-complete' }, icon('star', 14), COMPLETE_BADGE);
}

/** 見出し：あなたの勝ち／〇〇の勝ち／ひきわけ */
export function headlineFor(result: MatchResult, mySlot: number): { text: string; tone: 'win' | 'lose' | 'draw' } {
  const winners = result.players.filter((p) => result.winnerSlots.includes(p.slot));
  if (winners.length === 0) return { text: '試合終了', tone: 'draw' };
  if (winners.length > 1) return { text: winners.some((w) => w.slot === mySlot) ? 'ひきわけ！' : 'ひきわけ', tone: 'draw' };
  const w = winners[0] as PlayerResult;
  if (w.slot === mySlot) return { text: 'あなたの勝ち！', tone: 'win' };
  return { text: `${nameOf(w)}の勝ち`, tone: 'lose' };
}

/** 点数を0から数え上げる（動きを減らす設定なら最初から最後の値） */
function countUp(el: HTMLElement, to: number): void {
  if (prefersReducedMotion() || to <= 0 || typeof requestAnimationFrame !== 'function') {
    el.textContent = formatPoints(to);
    return;
  }
  const start = performance.now();
  const dur = 900;
  const tick = (now: number): void => {
    const k = Math.min(1, (now - start) / dur);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = formatPoints(Math.round(to * eased));
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  el.textContent = '0';
  requestAnimationFrame(tick);
}

function heroCard(result: MatchResult, mySlot: number): HTMLElement {
  const winners = result.players.filter((p) => result.winnerSlots.includes(p.slot));
  const shown = winners.length > 0 ? winners : [...result.players].sort((a, b) => a.rank - b.rank).slice(0, 1);
  const single = shown.length === 1;
  const people = shown.map((p) => {
    const score = h('span', { class: 'sy-hero-score-num' }, formatPoints(p.score));
    if (single) countUp(score, p.score);
    return h(
      'div',
      { class: 'sy-hero-person', style: `--pc:${lookOf(p.slot).color}` },
      h('span', { class: 'sy-hero-face' }, faceImg(p.character, single ? 96 : 64)),
      h(
        'p',
        { class: 'sy-hero-name' },
        slotBadge(p.slot, 'lg'),
        h('span', { class: 'sy-hero-name-text' }, ...nameBreaks(nameOf(p))),
        ...whoTags(p, mySlot),
      ),
      h('p', { class: 'sy-hero-score' }, h('span', { class: 'sy-hero-score-label' }, '荒らし度'), score, h('span', { class: 'sy-hero-score-unit' }, '点')),
      h('p', { class: 'sy-hero-title' }, h('span', { class: 'sy-hero-title-label' }, '称号'), h('strong', null, `『${p.title}』`)),
      p.complete ? completeBadge() : null,
    );
  });
  return h(
    'section',
    { class: `sy-card sy-hero${single ? '' : ' is-multi'}`, 'aria-label': '勝った人' },
    h('span', { class: 'sy-hero-crown', 'aria-hidden': 'true' }, icon('crown', 30)),
    h('div', { class: 'sy-hero-people' }, ...people),
  );
}

function rankingCard(result: MatchResult, mySlot: number): HTMLElement {
  const rows = [...result.players]
    .sort((a, b) => a.rank - b.rank || a.slot - b.slot)
    .map((p) =>
      h(
        'li',
        {
          class: `sy-rank-row${result.winnerSlots.includes(p.slot) ? ' is-winner' : ''}${p.slot === mySlot ? ' is-you' : ''}`,
          style: `--pc:${lookOf(p.slot).color}`,
          'data-slot': p.slot,
        },
        // 2段：上に印・名前・点、下に称号（狭い画面でも名前の幅を残す）
        h('span', { class: 'sy-rank-no' }, String(p.rank), h('small', null, '位')),
        faceImg(p.character, 40),
        h('span', { class: 'sy-rank-name' }, slotMark(p.slot), h('span', { class: 'sy-rank-name-text' }, ...nameBreaks(nameOf(p)))),
        h('span', { class: 'sy-rank-score' }, formatPoints(p.score), h('small', null, '点')),
        h(
          'span',
          { class: 'sy-rank-title' },
          ...whoTags(p, mySlot),
          `称号『${p.title}』`,
          p.complete ? completeBadge() : null,
        ),
      ),
    );
  return h(
    'section',
    { class: 'sy-card sy-ranking', 'aria-labelledby': 'sy-rank-h' },
    h('h2', { class: 'sy-h2', id: 'sy-rank-h' }, '順位'),
    h('ol', { class: 'sy-rank-list', 'data-testid': 'results' }, ...rows),
  );
}

function detailCard(me: PlayerResult, damage: number): HTMLElement {
  const entries = (Object.entries(me.breakdown) as [ScoreKind, { count: number; points: number }][])
    .filter(([, v]) => v && v.points > 0)
    .sort((a, b) => b[1].points - a[1].points);
  // 内訳の行に入らない加点（完全制覇の+3000・ひみつの+800。view.ts の extras）は、内訳の下に赤い字で足す
  const extras = (me.extras ?? []).filter((x) => x && x.points !== 0);
  const sum = entries.reduce((t, [, v]) => t + v.points, 0) + extras.reduce((t, x) => t + x.points, 0);
  // 内訳＋extras＝点 のはず。合わないときだけ（古い結果・途中で抜けた結果など）、残りを1行にまとめる
  const rest = Math.round(me.score - sum);
  const rows = entries.map(([kind, v]) =>
    h(
      'tr',
      { 'data-kind': kind },
      h('th', { scope: 'row' }, ...phraseBreaks(KIND_LABEL[kind] ?? kind)),
      h('td', { class: 'sy-bd-count' }, `×${v.count}`),
      h('td', { class: 'sy-bd-points' }, `${formatPoints(v.points)}点`),
    ),
  );
  for (const x of extras) {
    rows.push(
      h(
        'tr',
        { class: 'sy-bd-bonus', 'data-extra': x.label },
        h('th', { scope: 'row' }, ...phraseBreaks(x.label)),
        h('td', { class: 'sy-bd-count' }),
        h('td', { class: 'sy-bd-points' }, `${x.points > 0 ? '+' : ''}${formatPoints(x.points)}点`),
      ),
    );
  }
  if (rest > 0) {
    rows.push(
      h(
        'tr',
        { class: 'sy-bd-bonus' },
        h('th', { scope: 'row' }, extras.length > 0 ? 'そのほかの加点' : '達成ボーナス・倍率など'),
        h('td', { class: 'sy-bd-count' }),
        h('td', { class: 'sy-bd-points' }, `+${formatPoints(rest)}点`),
      ),
    );
  }
  const breakdown =
    rows.length > 0
      ? h(
          'table',
          { class: 'sy-bd' },
          h('caption', { class: 'sy-sr' }, '荒らし度の内訳'),
          h('thead', { class: 'sy-sr' }, h('tr', null, h('th', { scope: 'col' }, '悪事'), h('th', { scope: 'col' }, '回数'), h('th', { scope: 'col' }, '点'))),
          h('tbody', null, ...rows),
        )
      : h('p', { class: 'sy-note' }, 'こんどは何か1つ、やっちゃダメをやってみよう。');

  const achieved = new Set<string>(me.achieved);
  const stamps = h(
    'ul',
    { class: 'sy-stamps' },
    ...MISDEEDS.map((m, i) => {
      const done = achieved.has(m.id);
      return h(
        'li',
        { class: `sy-stamp${done ? ' is-done' : ''}`, style: `--i:${i}`, 'data-misdeed': m.id },
        h('span', { class: 'sy-stamp-name' }, ...phraseBreaks(m.name)),
        done ? h('span', { class: 'sy-stamp-mark', 'aria-hidden': 'true' }, hanko(i)) : h('span', { class: 'sy-stamp-todo', 'aria-hidden': 'true' }, 'まだ'),
        h('span', { class: 'sy-sr' }, done ? '達成' : 'まだ'),
      );
    }),
  );
  const secretsDone = new Set<string>(me.secrets);
  const secrets = h(
    'ul',
    { class: 'sy-secrets' },
    ...SECRETS.map((sc) => {
      const done = secretsDone.has(sc.id);
      return h(
        'li',
        { class: `sy-secret${done ? ' is-done' : ''}` },
        icon('star', 18),
        h('span', { class: 'sy-secret-name' }, ...(done ? phraseBreaks(sc.name) : ['？？？'])),
        h('span', { class: 'sy-sr' }, done ? '見つけた' : 'まだ見つけていない'),
      );
    }),
  );
  const pct = Math.round(Math.max(0, Math.min(1, damage)) * 100);
  return h(
    'section',
    { class: 'sy-card sy-detail', 'aria-labelledby': 'sy-detail-h' },
    h('h2', { class: 'sy-h2', id: 'sy-detail-h' }, 'あなたの荒らしっぷり'),
    breakdown,
    h('h3', { class: 'sy-h3' }, `達成したやっちゃダメ ${achieved.size}/${MISDEEDS.length}`, me.complete ? completeBadge() : null),
    stamps,
    h('h3', { class: 'sy-h3' }, `ひみつ ${secretsDone.size}/${SECRETS.length}`),
    secrets,
    h(
      'dl',
      { class: 'sy-stats' },
      h('div', { class: 'sy-stat' }, h('dt', null, '捕まった回数'), h('dd', null, h('b', null, String(me.caught)), '回')),
      h(
        'div',
        { class: 'sy-stat' },
        h('dt', null, '店の被害率'),
        h('dd', null, h('b', null, String(pct)), '%', h('span', { class: 'sy-meter', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` }))),
      ),
    ),
  );
}

export function resultsScreen(result: MatchResult, hd: ResultHandlers): { el: HTMLElement; focus: HTMLElement } {
  const head = headlineFor(result, hd.mySlot);
  const me = result.players.find((p) => p.slot === hd.mySlot);
  const featured = me ?? [...result.players].sort((a, b) => a.rank - b.rank)[0];
  const minutes = result.duration % 60 === 0 ? `${result.duration / 60}分` : `${result.duration}秒`;

  // 長い名前の「〇〇の勝ち」は字を小さくして、1行か均等な2行に収める
  const h1 = h(
    'h1',
    { class: `sy-results-headline${[...head.text].length > 8 ? ' is-long' : ''}` },
    // 「ハカセ（CPU・本気）の勝ち」は括弧の前と「の勝ち」の前でだけ折る
    ...(head.text.endsWith('の勝ち') && head.tone === 'lose'
      ? [...nameBreaks(head.text.slice(0, -3)), document.createElement('wbr'), h('span', { class: 'sy-keep' }, 'の勝ち')]
      : [head.text]),
  );
  const mine =
    me && !result.winnerSlots.includes(me.slot)
      ? h(
          'p',
          { class: 'sy-results-me' },
          `あなたは${me.rank}位・荒らし度${formatPoints(me.score)}点・称号『${me.title}』`,
          me.complete ? completeBadge() : null,
        )
      : null;

  // 下に貼りつける操作の列
  const bar: HTMLElement[] = [];
  if (hd.canRematch && hd.onRematch) {
    bar.push(button([icon('play', 22), 'もう一回'], { cls: 'sy-btn--red sy-btn--big', a: 'rematch', onClick: () => hd.onRematch?.() }));
  } else if (hd.waitingForHost) {
    bar.push(h('p', { class: 'sy-wait sy-wait--bar', role: 'status' }, '部屋の主が「もう一回」を押すのを待っています'));
  }
  bar.push(button('タイトルへ', { cls: 'sy-btn--plain', a: 'title', onClick: hd.onTitle }));

  const el = h(
    'div',
    { class: 'sy-layer sy-layer--menu sy-layer--results', 'data-screen': 'results', 'data-tone': head.tone },
    awning(),
    h(
      'div',
      { class: 'sy-page sy-page--results sy-page--bar' },
      h(
        'header',
        { class: 'sy-results-head' },
        h('p', { class: 'sy-kicker' }, `結果・${minutes}の試合`),
        h1,
        result.aborted ? h('p', { class: 'sy-note sy-results-aborted' }, '部屋の主が抜けたので、その時点の点数で結果を出しました。') : null,
        mine,
      ),
      // 2列（PC・横持ち）：左＝勝者・もう一回・シェア、右＝順位・内訳。下に貼りつける帯は使わず、何も隠さない。
      // 1列（スマホ縦）：列の箱を外し（display: contents）、勝者→順位→内訳→シェア→帯（下に貼りつく）の順に並べ直す。
      // 帯を左の列の2番目に置いているので、キーボードと読み上げでは「もう一回」が勝者のすぐ後に来る
      h(
        'div',
        { class: 'sy-results-grid' },
        h(
          'div',
          { class: 'sy-results-col sy-results-col--main' },
          heroCard(result, hd.mySlot),
          h('div', { class: 'sy-bottom-bar sy-results-bar' }, ...bar),
          featured
            ? createShareBlock({ heading: '結果を送る', text: resultShareText(featured.score, featured.title), url: SITE_URL })
            : null,
        ),
        h(
          'div',
          { class: 'sy-results-col sy-results-col--side' },
          rankingCard(result, hd.mySlot),
          featured ? detailCard(featured, result.damage) : null,
        ),
      ),
    ),
  );

  // 勝ったら小さなファンファーレ。全制覇なら大きいほう
  const audio = currentAudio();
  if (me?.complete) audio?.play('complete');
  else if (head.tone === 'win') audio?.play('achieve');

  return { el, focus: h1 };
}
