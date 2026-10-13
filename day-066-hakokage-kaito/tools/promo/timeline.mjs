/* プロモ動画の絵コンテ。操作の時刻・字幕・音の合図は、ここが唯一の正。
   画（render-promo.mjs）も音（promo-audio.mjs）も、この時刻を読む。片方だけ動かすと合わなくなる。

   時刻はすべて「動画の頭を 0 秒とした秒」。マイナスは、動画に映る前の準備の手（1手目を先に歩かせておく）。
   BPM 120（1拍 0.5秒・1小節 2秒）。手を押す時刻は 0.25 秒の格子（8分音符）に乗せ、画の動きと拍を揃える（例外は、動画の頭の1手＝-0.03秒。動きの途中から始めるため）。

   音の合図（効果音）は、操作の列を、アプリのルール本体（lib/sim.js）で最初から再生して作る。
   押した・宝を取った・見つかった、をこちらで決め打ちせず、ルールが返した出来事から取るので、手の列を直せば合図も追従する。
   アプリの lib は package.json に type を持たず、import すると Node が警告を出すので、本文を data URL にして読む（中身は変えない）。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
const loadEsm = (rel) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(appDir + rel, 'utf8')).toString('base64')}`);
const { LEVELS } = await loadEsm('lib/levels-data.js');
const sim = await loadEsm('lib/sim.js');

export const DURATION_SECONDS = 32;
export const FPS = 30;
export const VIEW = { width: 540, height: 960 };       // 録画の画面（CSS px）。出力は2倍の 1080×1920
export const SCALE = 2;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;

/* 場面の切れ目。音の編成の切り替えも、この時刻に合わせる */
export const SECTIONS = Object.freeze({
  hook:  { start: 0,  end: 4 },     // 面1：光に見つかる → ひとつ戻す → 箱のほうへ歩く
  solve: { start: 4,  end: 10 },    // 面1：箱を押す → 影 → 宝 → 出口 → 成功
  guard: { start: 10, end: 16 },    // 面5：警備員が箱の前で引き返す
  vault: { start: 16, end: 24.5 },  // 面8：光とレーザーを先読みで抜ける
  list:  { start: 24.5, end: 28 },  // 面の一覧（全8面）
  end:   { start: 28, end: 32 },    // 終了カード
});

/* 画面が変わるまでの遅れ（秒）。画に出た時刻（onset）が測れなかったときだけ、手を押した時刻からこれで見積もる。
   押す手は、アプリが詰みの有無を探す（面8では約 40〜80ms かかる）ので、実際の onset はもっと遅れることがある。
   render-promo.mjs が書き出した動画から、動き出し（onsets）と結果の欄が出た時刻（settles）を測り、deriveCues に渡して、合図を画に合わせ直す。 */
export const LAG = Object.freeze({ move: 0.02, tap: 0.02 });
/* onset（動き出し）から、各出来事までの秒。動き（150ms）が終わりかける所・動きの終わりに盤を描き直す所・警備員の向きが変わる所 */
export const AFTER_ONSET = Object.freeze({ arrive: 0.11, settle: 0.185, guard: 0.06 });

const KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight', '.': 'Space' };
export const KEY_NAME = KEY;
export const PAD = { U: '#btn-up', D: '#btn-down', L: '#btn-left', R: '#btn-right', '.': '#btn-wait' };

const round = (x) => Math.round(x * 1000) / 1000;
const keys = (moves, from, step) => [...moves].map((key, i) => ({ at: round(from + i * step), key }));

/* 手の列。面1と面5と面8は、levels.json の見本の解（par どおり）か、その途中までを使う。 */
export const TAKES = Object.freeze([
  {
    id: 'a', level: 1, start: 0, end: 10,
    events: [
      { at: -1.0, key: 'D', pre: true },     // 動画に映る前に1歩。映像の頭は、2歩目で光の中へ入る瞬間
      { at: -0.03, key: 'D' },               // 光の中へ → 見つかった
      { at: 2.0, tap: '#btn-caught-undo', label: 'undo' },
      ...keys('ULL', 2.5, 0.5),              // 箱の上へ回る
      { at: 4.0, key: 'D' },                 // 箱を押す。拍の頭（ドラムが入る所）
      ...keys('RR', 5.0, 0.5),
      ...keys('DD', 6.0, 0.5),               // 影の中へ。6.5 で宝
      ...keys('UU', 7.5, 0.5),
      { at: 8.5, key: 'R' },                 // 出口 → 成功
    ],
  },
  {
    id: 'b', level: 5, start: 10, end: 16,
    events: [
      ...keys('RURRRRDLLUL', 10.25, 0.25),   // 箱の右へ回って、左へ2つ押す（早送り）
      { at: 13.0, key: 'D' }, { at: 13.5, key: 'D' },   // 箱を警備員の道へ落とす
      { at: 14.0, key: 'R' },                // 警備員が箱の前で引き返す
      { at: 14.5, key: 'D' }, { at: 15.0, key: 'R' }, { at: 15.5, key: 'R' },   // 宝
    ],
  },
  {
    id: 'c', level: 8, start: 16, end: 32,
    events: [
      ...keys('UUUURURRRDDDDRDRRLLUUUUULLLLL', 16.25, 0.25),   // 面8の見本の解 29手（par どおり）
      { at: 24.5, tap: '#btn-next', label: 'levels' },        // 最後の面の「面をえらぶ」
    ],
    endCardAt: 28,
  },
]);

/* 字幕。{文字|色} の部分だけ色を付ける。色の名前は、アプリの意味の色（光＝黄・見つかった＝赤・警備員＝青 など）。
   一行・13〜15字。盤の上（面の帯の下）に置き、盤や十字ボタンには重ねない。絵文字は使わない。実在の商標・他作品の名前は書かない。
   言い切れない主張（最高・中毒など）は書かない。 */
export const CAPTIONS = Object.freeze([
  { start: 0, end: 4, text: '見張りの光に、{見つかった…|danger}' },
  { start: 4, end: 6, text: '{箱|box}を押すと、{光|light}が止まる' },
  { start: 6, end: 10, text: '{影|shade}を通って、{宝|gold}を盗め' },
  { start: 10, end: 16, text: '{警備員|guard}は、箱の前で{引き返す|guard}' },
  { start: 16, end: 24.5, text: '{光|light}と{レーザー|laser}を、先読みで抜ける' },
  { start: 24.5, end: 28, text: '全8面。どこまで抜けられる？', pos: 'bottom', lead: 0.05 },   // 一覧の窓が開く瞬間に合わせる（先に出すと、成功の欄の下端に重なる）
]);

export const END_CARD = Object.freeze({
  badge: '100日チャレンジ Day 66',
  title: '箱影の怪盗',
  sub: '全8面・登録なし',
  tag: '押せる箱で光をさえぎる、忍び込みパズル',
  note: 'スマホで遊べる',
  urlHost: 'hundred-days.pages.dev',
  urlPath: '/day-066-hakokage-kaito/',
});

/* 終了カードの中の小さな動き（CSS のアニメ）の時刻。終了カードを出した時刻からの秒。音の合図もここに合わせる */
export const END_ANIM = Object.freeze({ fade: 0.25, boxIn: 0.3, boxLand: 0.62, shadow: 0.68, glint: 1.4 });

/* 字幕の {…|色} を、色つきの部分の配列に分ける */
export function parseCaption(text) {
  const parts = [];
  for (const m of text.matchAll(/\{([^|}]+)\|([a-z]+)\}|([^{]+)/g)) parts.push(m[1] ? { t: m[1], c: m[2] } : { t: m[3] });
  return parts;
}
export const captionPlain = (text) => parseCaption(text).map((p) => p.t).join('');

/* 画面に出す文字の検査。絵文字・欧文の混入を止める（商標や他作品の名前を、欧文で書いてしまう事故を拾うため、使える欧文は許可リストだけ） */
export function checkTexts() {
  const texts = [...CAPTIONS.map((c) => captionPlain(c.text)), ...Object.values(END_CARD)];
  const problems = [];
  for (const text of texts) {
    if (/\p{Extended_Pictographic}|\uFE0F|\u200D/u.test(text)) problems.push(`絵文字: ${text}`);
    const latin = text.match(/[A-Za-z][A-Za-z0-9.\-/]*/g) ?? [];
    for (const word of latin) if (!['Day', 'hundred-days.pages.dev'].includes(word) && !/^\/?day-066-hakokage-kaito\/?$/.test(word)) problems.push(`許可リストにない欧文: ${word}`);
  }
  return problems;
}

/* ---------------------------------------------------------------- 操作の列をルール本体で再生する */

export function simulate(take) {
  const level = sim.loadLevel(LEVELS[take.level - 1]);
  const history = [sim.initialState(level)];
  const rows = [];
  for (const [index, event] of take.events.entries()) {
    const before = history[history.length - 1];
    if (event.key) {
      const r = sim.act(level, before, event.key);
      if (!r.valid) throw new Error(`面${take.level} の ${index + 1} 番目の手 ${event.key}（${event.at}秒）が無効（${r.reason}）`);
      history.push(r.state);
      rows.push({ index, event, state: r.state, events: r.events,
        shadowsBefore: sim.shadows(level, before).length, shadowsAfter: r.state.status === 'play' ? sim.shadows(level, r.state).length : 0 });
    } else if (event.label === 'undo') {
      if (history.length < 2) throw new Error('戻す手が無い');
      history.pop();
      rows.push({ index, event, state: history[history.length - 1], events: [], undo: true });
    } else {
      rows.push({ index, event, state: before, events: [] });
    }
  }
  return rows;
}

/* 効果音の合図。{ at: 秒, kind, soft?: 小さく }。kind：
   step・push（箱を押す）・shadow（光が止まって影ができる）・treasure（宝）・exit（出口が開く）・turn（警備員が箱の前で引き返す）
   caught（見つかった）・clear（成功）・undo・open（面の一覧が開く）・cut（場面の切れ目）・end（終了カード） */
export function deriveCues({ onsets = {}, settles = {} } = {}) {
  const cues = [];
  const add = (at, kind, extra = {}) => cues.push({ at: round(at), kind, ...extra });
  for (const take of TAKES) {
    for (const row of simulate(take)) {
      const { event, events, state } = row;
      if (event.pre) continue;
      const base = onsets[`${take.id}:${row.index}`] ?? event.at + (event.tap ? LAG.tap : LAG.move);   // 画に動きが出た時刻
      if (row.undo) { add(base, 'undo'); continue; }
      if (event.label === 'levels') { add(base, 'open'); continue; }
      const pushed = events.some((e) => e.type === 'push');
      add(base, pushed ? 'push' : 'step');
      if (events.some((e) => e.type === 'treasure')) { add(base + AFTER_ONSET.arrive, 'treasure'); add(base + AFTER_ONSET.settle, 'exit'); }
      if (events.some((e) => e.type === 'guard' && e.action === 'turn-box')) add(base + AFTER_ONSET.guard, 'turn');
      if (pushed && row.shadowsAfter > row.shadowsBefore) add(base + AFTER_ONSET.settle, 'shadow');
      const settle = settles[`${take.id}:${row.index}`] ?? base + AFTER_ONSET.settle;       // 結果の欄が出た時刻（測れていれば）
      if (state.status === 'caught') add(settle, 'caught');
      if (state.status === 'escaped') add(settle, 'clear');
    }
  }
  for (const take of TAKES.slice(1)) add(take.start, 'cut');
  const end = SECTIONS.end.start;
  add(end, 'end');
  add(end + END_ANIM.boxLand, 'push', { soft: true });
  add(end + END_ANIM.shadow, 'shadow', { soft: true });
  add(end + END_ANIM.glint, 'treasure', { soft: true });
  return cues.filter((c) => c.at >= 0 && c.at < DURATION_SECONDS).sort((a, b) => a.at - b.at);
}

/* 各手の「押す手か」「どの種類か」。render-promo.mjs が、動き出しを測る対象と、撮影の止まりが想定内かの判断に使う */
export function eventInfo(take) {
  return simulate(take).map((row) => ({ index: row.index, at: row.event.at, pre: !!row.event.pre, tap: !!row.event.tap, label: row.event.label ?? row.event.key,
    push: row.events.some((e) => e.type === 'push') }));
}
