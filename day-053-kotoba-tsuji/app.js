// 入口。画面の切り替えと、対局の始まり・続き・終わりをまとめる。盤の生成と対局の状態は lib/ のエンジンに任せる
import { createStore } from './lib/storage.js';
import { WORDS } from './lib/words-source.js';
import { getLevel } from './lib/levels.js';
import { generatePuzzle } from './lib/generator.js';
import { Game } from './lib/game.js';
import { parseChallenge } from './lib/share.js';
import { computeRank } from './lib/rank.js';
import { randomSeed } from './lib/rng.js';
import { pickFreshSeed, answersOf } from './lib/fresh.js';
import { createAudio } from './lib/audio.js';
import { h, nextPaint, prefersReduced } from './lib/ui/dom.js';
import { TEXT } from './lib/ui/copy.js';
import { createAnnai } from './lib/ui/annai.js';
import { openDialog } from './lib/ui/dialog.js';
import { mountTitle } from './lib/ui/title.js';
import { mountSelect } from './lib/ui/select.js';
import { mountPlay } from './lib/ui/play.js';
import { mountResult } from './lib/ui/result.js';
import { mountChallenge } from './lib/ui/challenge.js';
import { mountBanzuke } from './lib/ui/banzuke.js';
import { mountHowto } from './lib/ui/howto.js';
import { mountSettings } from './lib/ui/settings.js';

const SCREENS = {
  title: mountTitle,
  select: mountSelect,
  play: mountPlay,
  result: mountResult,
  challenge: mountChallenge,
  banzuke: mountBanzuke,
  howto: mountHowto,
  settings: mountSettings,
};

const store = createStore();
let settings = store.getSettings();
const root = document.getElementById('app');
const state = { screen: null, name: '', puzzle: null, game: null, genMs: 0 };
let starting = false;
// 解けたときに、藍に染まった盤を見せてから結果へ移るまでの時間（押せば早送り。動きを減らす設定でも同じ）
const RESULT_DELAY = 1200;
let pendingResult = null;
// 同じページで続けて解いた手習いの数（降参や、ほかの腕前を挟むと0に戻す）。3局で一人前へ誘う
let tenaraiStreak = 0;

const app = {
  store,
  audio: createAudio({ isOn: () => settings.sound }),
  annai: createAnnai(document.body),
  settings: () => settings,
  saveSettings(patch) {
    settings = store.saveSettings(patch);
    applyMotion();
    return settings;
  },
  reduced: () => settings.motion === 'reduce' || prefersReduced(),
  screenName: () => state.name,
  go,
  hasCurrent,
  resume,
  startNew,
  pickLevel,
  generate,
  finishGame,
  clearHash,
};

function go(name, params = {}) {
  clearPendingResult();
  const make = SCREENS[name] ?? SCREENS.title;
  try {
    state.screen?.destroy?.();
  } catch {
    /* 片付けに失敗しても次の画面は出す */
  }
  const scr = make(app, params);
  state.screen = scr;
  state.name = name;
  if (name === 'play') {
    state.puzzle = params.puzzle;
    state.game = params.game;
  }
  document.body.dataset.screen = name;
  root.replaceChildren(scr.el);
  window.scrollTo(0, 0);
  scr.show?.();
  if (name !== 'play') scr.el.focus?.({ preventScroll: true });
}

function generate(level, seed) {
  const t0 = performance.now();
  const puzzle = generatePuzzle({ level: Number(level), seed, words: WORDS });
  state.genMs = performance.now() - t0;
  return puzzle;
}

function hasCurrent() {
  const c = store.getCurrent();
  return Boolean(c && c.game && !c.game.done && !c.game.gaveUp);
}

function resume() {
  const cur = store.getCurrent();
  if (!cur) return go('title');
  try {
    const puzzle = generate(cur.level, cur.seed);
    const game = Game.restore(puzzle, cur.game);
    go('play', { game, puzzle, levelId: Number(cur.level), seed: cur.seed, source: 'resume', duel: cur.duel ?? null });
  } catch {
    store.clearCurrent();
    go('title');
  }
}

// 途中の一局がある状態で新しく始めるときだけ札で確認する
async function pickLevel(levelId, opts = {}) {
  if (hasCurrent()) {
    const v = await openDialog({
      name: 'midway',
      text: TEXT.midway.text,
      buttons: [
        { label: TEXT.midway.fresh, value: 'new', primary: true },
        { label: TEXT.midway.resume, value: 'resume' },
      ],
    });
    if (v === 'resume') return resume();
    if (v !== 'new') return;
    store.clearCurrent();
  }
  return startNew(levelId, opts);
}

// 生成が150ミリ秒を超えたときだけ「問をこしらえておる…」が見える（CSS の遅れて出る動き）
// 新しい局は、候補8つの seed から最近出た言葉と重ならない盤を選ぶ（果たし状から受けて立つ局は渡された seed のまま）。
// 局を始めた時点で、その盤の答えを「最近出た言葉」に足す
async function startNew(levelId, { seed = null, puzzle = null, source = 'new', duel = null } = {}) {
  if (starting) return;
  starting = true;
  const lv = getLevel(levelId);
  let busy = null;
  try {
    let pz = puzzle;
    if (!pz) {
      busy = h('div', { class: 'busy', role: 'status' }, TEXT.select.busy);
      document.body.append(busy);
      await nextPaint();
      if (!seed) {
        const seeds = Array.from({ length: 8 }, () => randomSeed());
        seed = pickFreshSeed({ level: lv.id, words: WORDS, seeds, recent: store.getRecent() }) ?? seeds[0];
      }
      pz = generate(lv.id, seed);
    }
    const game = new Game(pz, { autoCheck: settings.autoCheck });
    store.pushRecent(answersOf(pz));
    store.saveCurrent({ level: lv.id, seed, game: game.serialize(), duel });
    go('play', { game, puzzle: pz, levelId: lv.id, seed, source, duel });
  } catch {
    app.annai.say(TEXT.select.genFailed);
  } finally {
    busy?.remove();
    starting = false;
  }
}

function finishGame({ game, puzzle, levelId, seed, seconds, gaveUp, duel = null }) {
  const rank = computeRank({ levelId, seconds, hintsLetters: game.hintsLetters, gaveUp });
  const before = store.getRecords().levels[levelId]?.bestSec;
  const res = store.recordResult({ levelId, seconds, rankKey: rank.key, gaveUp });
  store.clearCurrent();
  if (!gaveUp) app.audio.taiko();
  // 初めて解いたときは「新記録」と言わない（比べる記録がまだ無い）
  const newBestSec = Boolean(res.newBestSec && before !== null && before !== undefined);
  tenaraiStreak = levelId === 1 && !gaveUp ? tenaraiStreak + 1 : 0;
  const params = { puzzle, game, levelId, seed, seconds, gaveUp, rank, newBestSec, duel, streak: levelId === 1 ? tenaraiStreak : 0 };
  // 解けたときは、最後の言葉が藍に染まった盤を約1.2秒見せてから結果へ。押すかキーを打てば早送り
  // （その操作は結果の画面のボタンに届かないように、ここで受け止める）
  const show = () => {
    clearPendingResult();
    if (state.name === 'play' && state.game === game) go('result', params);
  };
  // 解けた操作そのもの（いま配っている最中の click・keydown）では早送りしない。時刻で見分ける
  const armedAt = performance.now();
  const skip = (e) => {
    if (e.timeStamp < armedAt) return;
    e.preventDefault();
    e.stopPropagation();
    show();
  };
  pendingResult = { timer: setTimeout(show, gaveUp ? 300 : RESULT_DELAY), skip, armed: true };
  document.addEventListener('click', skip, true);
  document.addEventListener('keydown', skip, true);
}

function clearPendingResult() {
  if (!pendingResult) return;
  clearTimeout(pendingResult.timer);
  if (pendingResult.armed) {
    document.removeEventListener('click', pendingResult.skip, true);
    document.removeEventListener('keydown', pendingResult.skip, true);
  }
  pendingResult = null;
}

function clearHash() {
  try {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* 書き換えられない環境では残しておく */
  }
}

function applyMotion() {
  document.documentElement.dataset.motion = app.reduced() ? 'reduce' : 'auto';
}

// ---- 起動 ----
applyMotion();
try {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMotion);
} catch {
  /* 古い端末 */
}
// 最初の操作で AudioContext を作る・再開する
const unlock = () => app.audio.unlock();
document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
document.addEventListener('keydown', unlock, { capture: true });

window.addEventListener('hashchange', () => {
  const c = parseChallenge(location.hash);
  if (c && state.name !== 'play') go('challenge', c);
});

if (window.__KOTOBA_TEST__ === true) {
  window.__kotoba = {
    puzzle: () => state.puzzle,
    answers: () => (state.puzzle?.words ?? []).map((w) => ({ id: w.id, label: w.label, dir: w.dir, x: w.x, y: w.y, length: w.length, answer: w.answer })),
    game: () => state.game,
    get genMs() {
      return state.genMs;
    },
  };
}

const challenge = parseChallenge(location.hash);
if (challenge) go('challenge', challenge);
else go('title', { opening: true });
document.body.dataset.boot = 'ready';
