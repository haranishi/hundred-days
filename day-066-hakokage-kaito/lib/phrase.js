/* 画面の文。表は作業記録の 02_ui_text.md が正で、ここはその写しだけ（言い換えない・足さない）。
   DOM を持たない純粋な関数と定数なので、tests/phrase.test.mjs が表と一字一句突き合わせる。
   位置は「左から{x}・上から{y}」（人が数えるので1から。内部の座標は0から）。 */
import { starsFor } from './sim.js';
import { LEVELS } from './levels-data.js';

export const LEVEL_COUNT = LEVELS.length;
export const DIR_WORD = Object.freeze({ U: '上', R: '右', D: '下', L: '左' });

// ---------------------------------------------------------------- 光源の呼び名

const KIND_LABEL = Object.freeze({ watch: '見張り', patrol: '警備員', laser: 'レーザー' });

/* 光源の種類と、同じ種類の中での順番・総数。source は sim の { kind: 'guard', index } か { kind: 'laser', index }。
   level は loadLevel の結果でも、面データ（levels-data）でもよい（guards[].kind と lasers だけを見る） */
export function describeSource(level, source) {
  if (source.kind === 'laser') return { kind: 'laser', rank: source.index, total: level.lasers.length };
  const kind = level.guards[source.index].kind;
  let rank = 0;
  let total = 0;
  level.guards.forEach((g, i) => {
    if (g.kind !== kind) return;
    if (i < source.index) rank += 1;
    total += 1;
  });
  return { kind, rank, total };
}

// 同じ種類が2つ以上ある面だけ、種類の中で番号を付ける（「見張り1」「見張り2」。盤の番号札と同じ）
export function sourceLabel(level, source) {
  const { kind, rank, total } = describeSource(level, source);
  return total > 1 ? `${KIND_LABEL[kind]}${rank + 1}` : KIND_LABEL[kind];
}

// 盤の番号札：警備員ごとに、番号（同じ種類が2つ以上のときだけ。無ければ null）
export function guardNumbers(level) {
  return level.guards.map((_, index) => {
    const { rank, total } = describeSource(level, { kind: 'guard', index });
    return total > 1 ? rank + 1 : null;
  });
}

// ---------------------------------------------------------------- 結果の欄

export const CAUGHT_TITLE = '見つかった！';
export const CAUGHT_COMMON = '太い二重の枠が、その光の通り道。';

const CAUGHT = Object.freeze({
  'walked-in': (n, s) => `${n}手目、${s}の光の中へ入ってしまった。`,
  uncovered: (n, s) => `${n}手目、光を止めていた箱をどかしたので、${s}の光が届いた。`,
  'guard-move': (n, s) => `${n}手目、${s}が1歩進んで、光が届いた。`,
  'guard-turn': (n, s) => `${n}手目、${s}が道の端で向きを変えて、光が届いた。`,
  'guard-turn-box': (n, s) => `${n}手目、${s}が箱の前で引き返して、光が届いた。`,
  'guard-rotate': (n, s) => `${n}手目、${s}が向きを変えて、光が届いた。`,
});

export function caughtText(level, caught) {
  const make = CAUGHT[caught.reason] ?? CAUGHT['walked-in'];
  return { title: CAUGHT_TITLE, lines: [make(caught.step, sourceLabel(level, caught.source)), CAUGHT_COMMON] };
}

export function deadText() {
  return { title: 'もう出られない', lines: ['この箱の位置では、宝を持って出口まで行けない。押す前に戻そう。'] };
}

export const CLEAR_TITLE = '脱出成功！';
export const NEXT_BUTTON = '次の面へ';
export const LEVELS_BUTTON = '面をえらぶ'; // 面8の成功では、次の面が無いので一覧を開く
export const RECORD_UPDATED = '記録を更新';
export const MIN_STEPS_NOTE = '最少手数で脱出！';

// 成功の欄：星の絵と「星{s}つ」、「{steps}手（最少 {par}手）」、最少なら「最少手数で脱出！」、それ以外は「あと{steps−par}手短くできれば星3つ」、記録を縮めたら「記録を更新」
export function clearText({ par, steps, best = null, prevBest = null }) {
  const stars = starsFor(par, steps);
  return {
    title: CLEAR_TITLE,
    stars,
    starsText: `星${stars}つ`,
    stepsText: `${steps}手（最少 ${par}手）`,
    note: steps <= par ? MIN_STEPS_NOTE : `あと${steps - par}手短くできれば星3つ`,
    record: prevBest !== null && best !== null && best < prevBest ? RECORD_UPDATED : '',
  };
}

// 全面に星が付いた後の面8の成功：見出しを「全8面クリア！」にし（「脱出成功！」と重ねない）、星の合計を出す
export const allClearText = () => `全${LEVEL_COUNT}面クリア！`;
export const starTotalText = (sum) => `星 ${sum}/${LEVEL_COUNT * 3}`;

// 結果を送る文（URL は共有の部品が canonical から足す）
export function shareText({ no, name, stars, steps }) {
  return `箱影の怪盗 Day66｜面${no}「${name}」★${stars} ${steps}手で脱出 #100日チャレンジ #個人開発`;
}

export const xIntentUrl = (text, url) => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
export const lineIntentUrl = (text, url) => `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

// ---------------------------------------------------------------- 1手ごとの一言と読み上げ

const BUMP = Object.freeze({
  wall: '壁があって進めない',
  edge: 'ここから先へは進めない',
  locked: '出口は、宝を取ると開く',
  guard: '警備員がいて通れない',
  stuck: '箱の先がふさがっていて押せない',
});
// sim の理由は、相手が見張りでも警備員でも guard のまま。ぶつかった相手が見張り（その場で向きを変える）のときだけ、画面側で言い換える
export const BUMP_WATCH = '見張りがいて通れない';
// kind：ぶつかった相手の種類（面データの guards[].kind＝'watch'（見張り）か 'patrol'（警備員））。reason が guard のときだけ見る
export const bumpText = (reason, kind) => (reason === 'guard' && kind === 'watch' ? BUMP_WATCH : BUMP[reason] ?? '');

// 読み上げ：動いた／押した／待った（＋宝を取ったら続けて）。見つかった・詰み・成功は結果の欄の文を読む
export function moveText(events, steps) {
  const move = events.find((e) => e.type === 'move');
  const push = events.find((e) => e.type === 'push');
  let text;
  if (push && move) text = `箱を${DIR_WORD[move.dir]}へ押した。${steps}手目`;
  else if (move) text = `${DIR_WORD[move.dir]}へ。${steps}手目`;
  else text = `待った。${steps}手目`;
  return events.some((e) => e.type === 'treasure') ? `${text}。宝を取った。出口が開いた` : text;
}

export const RESTART_TOAST = '最初に戻した。「ひとつ戻す」で取り消せる';
export const DEMO_START = 'お手本を再生する';
export const DEMO_END = 'お手本はここまで。最初から自分でやってみよう'; // 読み上げと、見える一言（数秒）の両方に出す

// キーの案内（盤の横とあそびかた）。文字のキー（WASD・Z・R）を使わない設定のときは、効くキーだけを案内する
export const KEY_HELP_LETTERS = '矢印かWASDで移動・スペースで待つ・Zでひとつ戻す・Rで最初へ';
export const KEY_HELP_ARROWS = '矢印で移動・スペースで待つ・Backspaceでひとつ戻す';
export const keyHelp = (letterKeys) => (letterKeys ? KEY_HELP_LETTERS : KEY_HELP_ARROWS);
export const COPY_LABEL = 'リンクをコピー'; // 成功の欄のボタンの文字（コピーできたら数秒だけ COPIED に差し替える）
export const COPIED = 'コピーしました';
export const HINT_CLOSE_LABEL = 'ヒントをとじる';
export const COPY_FAILED = 'コピーできませんでした。URLを選んでコピーしてください'; // 表にない文：共通の部品（shared/share.js）の既存の文

// ---------------------------------------------------------------- 名前（読み上げ）と見える文字

export const soundLabel = (muted) => (muted ? '音を出す' : '音を消す');
export const treasureWord = (taken) => (taken ? '持っている' : 'まだ');
export const starsLabel = (stars) => `星3つ中${stars}つ`;
export const levelHeading = (no, name) => `面${no} ${name}`;
export const levelNo = (no) => `面${no}/${LEVEL_COUNT}`;
export const levelButtonLabel = (no, name, stars) => `${levelNo(no)} ${name}${stars > 0 ? `（星${stars}つ）` : '（まだ）'}。面をえらぶ`;
export const levelRowLabel = (no, name, stars, best) => (stars > 0 ? `面${no} ${name}。星${stars}つ。記録${best}手` : `面${no} ${name}。まだ`);
export const levelRowRecord = (best) => (best ? `記録 ${best}手` : 'まだ');
export const demoProgress = (i, par) => `お手本 ${i}/${par}手`;

// 盤の aria-label。x・y は0から数えた座標
export function boardLabel({ no, cols, rows, x, y, treasure }) {
  return `面${no}の盤。横${cols}・縦${rows}マス。あなたは左から${x + 1}・上から${y + 1}。宝は${treasureWord(treasure)}`;
}
