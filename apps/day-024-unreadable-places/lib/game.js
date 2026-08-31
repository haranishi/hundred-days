/* ゲームの進行。DOMには触らないので、そのままユニットテストできる。
   時刻と乱数は外から渡す（tick(now) と random）。画面側が rAF の時刻を流し込む。

   Day018は60秒の時間制だった。ここはライフ制にしてある。
   問われているのが速さではなく「読めるか」なので、時間で急かすと問いがぼやける。 */

import { createMatcher } from './romaji.js';
import { revealedCount, scoreFor, basePoints } from './hint.js';

export const LIVES = 3;

/* 1問めが手前に着くまでの時間。長くすると読めない人の待ち時間が増えて退屈になり、
   短くすると開示が間に合わない。かな4文字で1文字あたり約0.9秒になる値にしてある。 */
export const BASE_TRAVEL_MS = 6000;
export const MIN_TRAVEL_MS = 3600;
export const SHRINK = 0.97;

/** 打ち切って弾けている間 */
export const BURST_MS = 420;

/* 着弾・降参のあと、正解と「なぜ読めないか」を読ませる時間。
   ここを詰めると、失敗が学びにならず「ただ減っただけ」になる。 */
export const ANSWER_MS = 2800;

/** 降参した地名を何問あとに出し直すか */
export const REQUEUE_AFTER = 4;

function shuffled(list, random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createGame({ places, lives = LIVES, random = Math.random }) {
  if (!Array.isArray(places) || places.length === 0) {
    throw new Error('places が空です');
  }

  let state = 'ready';   // ready | running | over
  let livesLeft = lives;
  let answered = 0;
  let score = 0;
  let current = null;
  let lastNow = 0;
  let queue = places.slice();
  const requeue = [];
  const totals = { cleared: 0, surrendered: 0, hit: 0, misses: 0 };
  const log = [];
  const missedKeys = Object.create(null);

  function travelFor() {
    return Math.max(MIN_TRAVEL_MS, BASE_TRAVEL_MS * SHRINK ** answered);
  }

  function draw() {
    if (requeue.length && requeue[0].dueAt <= answered) return requeue.shift().place;
    if (queue.length === 0) queue = shuffled(places, random);
    return queue.shift();
  }

  function spawn(now) {
    const place = draw();
    current = {
      place,
      born: now,
      travelMs: travelFor(),
      matcher: createMatcher(place.kana),
      phase: 'incoming',   // incoming | burst | answer
      phaseAt: now,
      revealed: 0,
      points: 0
    };
  }

  /** 失敗（着弾・降参）の共通処理。正解を見せる間に入る */
  function fail(now, reason) {
    livesLeft -= 1;
    totals[reason === 'surrender' ? 'surrendered' : 'hit'] += 1;
    log.push({ place: current.place, reason, points: 0, revealed: current.revealed });
    requeue.push({ place: current.place, dueAt: answered + REQUEUE_AFTER });
    current.phase = 'answer';
    current.phaseAt = now;
    answered += 1;
  }

  function advance(now) {
    if (livesLeft <= 0) {
      state = 'over';
      current = null;
      return;
    }
    spawn(now);
  }

  return {
    get state() { return state; },
    get lives() { return livesLeft; },
    get score() { return score; },
    get totals() { return { ...totals }; },
    get log() { return log.slice(); },

    start(now = 0) {
      state = 'running';
      lastNow = now;
      spawn(now);
    },

    /** いま向かってきているもの。kana は結果表示とテストのためだけに返す（画面では伏せる） */
    active() {
      if (!current) return null;
      return {
        place: current.place,
        phase: current.phase,
        revealed: current.revealed,
        points: current.points,
        typed: current.matcher.typed,
        travelMs: current.travelMs,
        /* 奥（0）から手前（1）へ。着弾したあとは1のまま止める */
        depth: Math.min(1, Math.max(0, (lastNow - current.born) / current.travelMs))
      };
    },

    tick(now) {
      lastNow = now;
      if (state !== 'running' || !current) return;

      if (current.phase === 'incoming') {
        const elapsed = now - current.born;
        current.revealed = revealedCount({
          elapsed,
          travelMs: current.travelMs,
          kanaLength: current.place.kana.length
        });
        if (elapsed >= current.travelMs) fail(now, 'impact');
        return;
      }

      const held = current.phase === 'burst' ? BURST_MS : ANSWER_MS;
      if (now - current.phaseAt >= held) advance(now);
    },

    press(key, now) {
      if (state !== 'running' || !current || current.phase !== 'incoming') {
        return { ok: false, ignored: true };
      }
      const r = current.matcher.input(key);
      if (!r.ok) {
        totals.misses += 1;
        // 押してほしかったキーは記録するだけで、その場では出さない。
        // 読みを伏せている最中に出すと答えが漏れる（Day018はここで出していた）
        const want = r.expected;
        if (want) missedKeys[want] = (missedKeys[want] ?? 0) + 1;
        return { ok: false, ignored: false };
      }
      if (!r.done) return { ok: true, done: false };

      const base = basePoints(current.place.difficulty ?? 0.5);
      const points = scoreFor({
        base,
        revealed: current.revealed,
        kanaLength: current.place.kana.length
      });
      score += points;
      totals.cleared += 1;
      answered += 1;
      current.points = points;
      current.phase = 'burst';
      current.phaseAt = now;
      log.push({ place: current.place, reason: 'cleared', points, revealed: current.revealed });
      return { ok: true, done: true, points };
    },

    giveUp(now) {
      if (state !== 'running' || !current || current.phase !== 'incoming') return false;
      fail(now, 'surrender');
      return true;
    },

    /** つまずいたキー（結果画面用）。上位から */
    stumbles(top = 3) {
      return Object.entries(missedKeys)
        .sort((a, b) => b[1] - a[1])
        .slice(0, top)
        .map(([key, count]) => ({ key, count }));
    }
  };
}
