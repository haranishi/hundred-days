// 消える物・答えの候補・点数の決まり。どれも種から決まり、同じ挑戦リンクなら同じ問題になる。
import { LEVELS, PROPS, ROUNDS } from './catalog.js';
import { slotById } from './plan.js';
import { stream, shuffled } from './rng.js';

const ORDER = ['L', 'M', 'S'];

export function roomOf(arrangement, id) {
  return slotById(arrangement[id].slot).room;
}

/**
 * 消える物を選ぶ。むずかしさの組から、前の問題で消えていない物を選ぶ。
 * 直前の問題と同じ部屋はできるだけ避ける（同じ部屋ばかり探させない）。
 */
export function pickVanished({ arrangement, level, seed, round, used = [], lastRoom = null }) {
  const pool = LEVELS[level].pool;
  const rng = stream(seed, 'vanish', round);
  const all = Object.keys(PROPS).filter(id => pool.includes(PROPS[id].size) && !used.includes(id));
  if (all.length === 0) throw new Error('消せる物が残っていません');
  const fresh = all.filter(id => roomOf(arrangement, id) !== lastRoom);
  const list = shuffled(rng, fresh.length ? fresh : all);
  return list[0];
}

/**
 * 答えの候補。消えた物＋家に残っている物。同じ大きさの組を優先し、
 * 同じ部屋の物を1〜2個混ぜて「部屋は覚えていたのに」が起きるようにする。
 */
export function makeChoices({ arrangement, level, seed, round, vanished }) {
  const count = LEVELS[level].choices[round] ?? LEVELS[level].choices.at(-1);
  const rng = stream(seed, 'choices', round);
  const size = PROPS[vanished].size;
  const near = ORDER.filter(s => s !== size).sort((a, b) => Math.abs(ORDER.indexOf(a) - ORDER.indexOf(size)) - Math.abs(ORDER.indexOf(b) - ORDER.indexOf(size)));
  const others = Object.keys(PROPS).filter(id => id !== vanished);
  const room = roomOf(arrangement, vanished);
  const picked = [];
  const take = (list, n) => {
    for (const id of list) {
      if (picked.length >= count - 1 || n <= 0) break;
      if (picked.includes(id)) continue;
      picked.push(id);
      n--;
    }
  };
  const sameSize = shuffled(rng, others.filter(id => PROPS[id].size === size));
  take(sameSize.filter(id => roomOf(arrangement, id) === room), count >= 6 ? 2 : 1);
  take(sameSize, count);
  for (const s of near) take(shuffled(rng, others.filter(id => PROPS[id].size === s)), count);
  return shuffled(rng, [vanished, ...picked]);
}

/** 1ゲーム分の問題（3問）を作る */
export function planGame(manifest, arrangeFn, seed, level) {
  const rounds = [];
  const used = [];
  let lastRoom = null;
  for (let round = 0; round < ROUNDS; round++) {
    const arrangement = arrangeFn(manifest, seed, round);
    const vanished = pickVanished({ arrangement, level, seed, round, used, lastRoom });
    const choices = makeChoices({ arrangement, level, seed, round, vanished });
    used.push(vanished);
    lastRoom = roomOf(arrangement, vanished);
    rounds.push({ round, arrangement, vanished, choices, room: lastRoom });
  }
  return rounds;
}

export function titleFor(correct, total = ROUNDS) {
  if (correct === total) return '名探偵';
  if (correct === total - 1) return 'するどい目';
  if (correct >= 1) return 'あと少し';
  return 'また挑戦';
}

/** 挑戦リンクの形: #c-<e|n|h>-<種> */
const CODES = { easy: 'e', normal: 'n', hard: 'h' };
export function encodeChallenge(level, seed) {
  return `#c-${CODES[level]}-${seed}`;
}

export function decodeChallenge(hash) {
  const m = /^#c-([enh])-(\d{1,6})$/.exec(hash || '');
  if (!m) return null;
  const seed = Number(m[2]);
  if (seed < 1 || seed > 999999) return null;
  const level = Object.keys(CODES).find(k => CODES[k] === m[1]);
  return { level, seed };
}
