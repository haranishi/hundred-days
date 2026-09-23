// 端末に覚えること。保存先は localStorage の1か所だけで、どこにも送らない。
//
// 覚えるのは「正解の料理について、どの質問にどう答えたか」の合計と回数。次の占いでは、
// 元のデータの確率にこの答え方を混ぜる（oracle.js の buildModel）。一覧に無い料理は名前ごと覚える。
// 名前以外の個人の情報は持たない。壊れた・古い形の記録は読み込み時に捨てて、遊べる状態を優先する。

import { answerValue } from './oracle.js';

export const MEMORY_SLOT = 'day048.oracle.memory.v1';
export const MEMORY_LIMITS = Object.freeze({
  custom: 30, // 教わった料理の上限。超えたら古いものから忘れる
  perQuestion: 20, // 1つの質問について数える答えの回数の上限（1人の癖が際限なく強まらないように）
  nameLength: 20,
});

const CUSTOM_ID = /^u[1-9][0-9]{0,5}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function emptyMemory() {
  return { v: 1, dishes: {}, custom: [], plays: 0, wins: 0 };
}

function isCount(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function cleanPairs(raw, questionIds) {
  const out = {};
  let dropped = false;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { pairs: out, dropped: raw !== undefined };
  for (const [qid, pair] of Object.entries(raw)) {
    const ok = questionIds.has(qid)
      && Array.isArray(pair) && pair.length === 2
      && isCount(pair[1], MEMORY_LIMITS.perQuestion) && pair[1] > 0
      && typeof pair[0] === 'number' && Number.isFinite(pair[0]) && pair[0] >= 0 && pair[0] <= pair[1];
    if (ok) out[qid] = [pair[0], pair[1]];
    else dropped = true;
  }
  return { pairs: out, dropped };
}

// 読み込んだ記録を検証する。known = { dishIds: Set, questionIds: Set }
export function sanitizeMemory(raw, known) {
  const memory = emptyMemory();
  if (raw === null || raw === undefined) return { memory, dropped: false };
  if (typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return { memory, dropped: true };
  let dropped = false;

  if (raw.dishes && typeof raw.dishes === 'object' && !Array.isArray(raw.dishes)) {
    for (const [id, pairs] of Object.entries(raw.dishes)) {
      if (!known.dishIds.has(id)) { dropped = true; continue; }
      const cleaned = cleanPairs(pairs, known.questionIds);
      dropped ||= cleaned.dropped;
      if (Object.keys(cleaned.pairs).length) memory.dishes[id] = cleaned.pairs;
    }
  } else if (raw.dishes !== undefined) dropped = true;

  if (Array.isArray(raw.custom)) {
    const seen = new Set();
    for (const entry of raw.custom) {
      const name = normalizeName(entry?.name);
      const valid = entry && typeof entry === 'object' && CUSTOM_ID.test(entry.id) && !seen.has(entry.id)
        && name.ok && name.name === entry.name && (entry.at === undefined || DAY.test(entry.at));
      if (!valid) { dropped = true; continue; }
      const cleaned = cleanPairs(entry.answers, known.questionIds);
      dropped ||= cleaned.dropped;
      seen.add(entry.id);
      memory.custom.push({ id: entry.id, name: entry.name, answers: cleaned.pairs, ...(entry.at ? { at: entry.at } : {}) });
    }
    if (memory.custom.length > MEMORY_LIMITS.custom) {
      memory.custom = memory.custom.slice(-MEMORY_LIMITS.custom);
      dropped = true;
    }
  } else if (raw.custom !== undefined) dropped = true;

  if (isCount(raw.plays, 1e9)) memory.plays = raw.plays; else if (raw.plays !== undefined) dropped = true;
  if (isCount(raw.wins, 1e9) && raw.wins <= memory.plays) memory.wins = raw.wins; else if (raw.wins !== undefined) dropped = true;
  return { memory, dropped };
}

// available=false は保存そのものが使えない（プライベートブラウズ・拒否設定など）。repaired=true は壊れた記録を捨てた
export function loadMemory(storage, known) {
  let text;
  try {
    text = storage.getItem(MEMORY_SLOT);
  } catch {
    return { memory: emptyMemory(), available: false, repaired: false };
  }
  if (text === null) return { memory: emptyMemory(), available: true, repaired: false };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { memory: emptyMemory(), available: true, repaired: true };
  }
  const { memory, dropped } = sanitizeMemory(parsed, known);
  return { memory, available: true, repaired: dropped };
}

export function saveMemory(storage, memory) {
  try {
    storage.setItem(MEMORY_SLOT, JSON.stringify(memory));
    return true;
  } catch {
    return false;
  }
}

export function forgetMemory(storage) {
  try {
    storage.removeItem(MEMORY_SLOT);
    return true;
  } catch {
    return false;
  }
}

// 教わった料理名の検証。制御文字を消し、全角英数などをそろえ、空白を1つにまとめる
export function normalizeName(input) {
  const name = String(input ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return { ok: false, reason: 'empty', name };
  if ([...name].length > MEMORY_LIMITS.nameLength) return { ok: false, reason: 'long', name };
  return { ok: true, name };
}

function toHiragana(text) {
  return text.replace(/[\u30A1-\u30F6]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function searchKey(text) {
  return toHiragana(String(text).normalize('NFKC').toLowerCase()).replace(/[\s・]/g, '');
}

// 名前・よみ・別名のどれかと完全に一致する料理を探す（「からあげ」「唐揚げ」の書き分けは別名で吸収する）
export function findExact(model, name) {
  const key = searchKey(name);
  if (!key) return null;
  for (const item of model.items) {
    const keys = [item.name, ...String(item.kana || '').split(/\s+/)].filter(Boolean).map(searchKey);
    if (keys.includes(key)) return item.id;
  }
  return null;
}

// 教える画面の候補。完全一致→前方一致→部分一致→入力が料理名を含む（「味噌ラーメン」→ラーメン）の順
export function searchDishes(model, query, limit = 8) {
  const key = searchKey(query);
  if (!key) return [];
  const scored = [];
  model.items.forEach((item, order) => {
    const keys = [item.name, ...String(item.kana || '').split(/\s+/)].filter(Boolean).map(searchKey);
    let rank = Infinity;
    for (const candidate of keys) {
      if (candidate === key) rank = Math.min(rank, 0);
      else if (candidate.startsWith(key)) rank = Math.min(rank, 1);
      else if (candidate.includes(key)) rank = Math.min(rank, 2);
      else if ([...candidate].length >= 2 && key.includes(candidate)) rank = Math.min(rank, 3);
    }
    if (rank !== Infinity) scored.push({ id: item.id, rank, order });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.order - b.order).slice(0, limit).map(entry => entry.id);
}

function addAnswer(bucket, qid, t) {
  const [sum, count] = bucket[qid] ?? [0, 0];
  const cap = MEMORY_LIMITS.perQuestion;
  // 上限に達したら古い答えを平均値で1回ぶん抜いてから足す（最近の答えが効き続けるように）
  const nextSum = count >= cap ? sum * ((cap - 1) / count) + t : sum + t;
  const nextCount = count >= cap ? cap : count + 1;
  bucket[qid] = [Math.round(nextSum * 100) / 100, nextCount];
}

function nextCustomId(memory) {
  const used = memory.custom.map(entry => Number(entry.id.slice(1)));
  return `u${(used.length ? Math.max(...used) : 0) + 1}`;
}

// 正解が分かった占いの答えを覚える。target = { id }（一覧か教わった料理）または { name }（新しく教わる料理）
// 戻り値の id は、新しく覚えた料理ならその id
export function remember(memory, target, answers, today = null) {
  const next = JSON.parse(JSON.stringify(memory));
  const entries = answers
    .map(({ q, a }) => [q, answerValue(a)])
    .filter(([, t]) => t !== null && t !== undefined);

  let id = target.id ?? null;
  let bucket;
  if (id && CUSTOM_ID.test(id)) {
    const entry = next.custom.find(item => item.id === id);
    if (!entry) throw new Error(`教わった料理が見つかりません: ${id}`);
    bucket = entry.answers;
  } else if (id) {
    bucket = next.dishes[id] ??= {};
  } else {
    const name = normalizeName(target.name);
    if (!name.ok) throw new Error(`料理名が不正です: ${name.reason}`);
    id = nextCustomId(next);
    const entry = { id, name: name.name, answers: {}, ...(today ? { at: today } : {}) };
    next.custom.push(entry);
    if (next.custom.length > MEMORY_LIMITS.custom) next.custom.shift();
    bucket = entry.answers;
  }
  for (const [qid, t] of entries) addAnswer(bucket, qid, t);
  return { memory: next, id };
}

export function recordPlay(memory, won) {
  return { ...memory, plays: memory.plays + 1, wins: memory.wins + (won ? 1 : 0) };
}

export function learnedCount(memory) {
  return Object.keys(memory.dishes).length + memory.custom.length;
}
