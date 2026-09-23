// 推理の中核。画面から独立した純粋関数だけを置く。
//
// 料理ごとに「その質問に『はい』と答える確率 p」を持つ。答え（t＝はい1・たぶんそう0.75・たぶん違う0.25・いいえ0）を
// 受け取るたびに、各料理へ尤度 L(p, t) を掛けて事後確率を出す。「わからない」は何も掛けない。
// L には下駄（floor）をはかせてあり、答えが1回食い違っただけでは正解の料理が消えない。
// 次の質問は、「はい／いいえ」のどちらが返っても候補が最も絞れるもの（期待情報量が最大のもの）を選ぶ。
// 状態は「答えの列」と「外れた推測の列」だけで、事後確率は毎回その列から計算し直す。だから戻す操作でずれが出ない。

import { QUESTIONS } from './questions.js';
import { DISHES } from './dishes.js';
import { rngFor } from './rng.js';

export const ANSWERS = Object.freeze([
  Object.freeze({ id: 'yes', label: 'はい', t: 1 }),
  Object.freeze({ id: 'probably', label: 'たぶんそう', t: 0.75 }),
  Object.freeze({ id: 'unknown', label: 'わからない', t: null }),
  Object.freeze({ id: 'probablyNot', label: 'たぶん違う', t: 0.25 }),
  Object.freeze({ id: 'no', label: 'いいえ', t: 0 }),
]);
const ANSWER_VALUE = new Map(ANSWERS.map(answer => [answer.id, answer.t]));

export const LIMITS = Object.freeze({
  maxQuestions: 25, // これを超えたら質問をやめて推測だけする
  maxGuesses: 3, // 外れてよい推測の回数
  guessAt: 0.85, // 最有力の確率がここを超えたら推測する（10問目まで）
  minQuestions: 5, // どんなに自信があっても、この問数までは推測しない
  easeFrom: 10, // この問数を過ぎたら、推測に踏み切る基準を1問ごとに下げる
  easeStep: 0.05,
  guessFloor: 0.4,
  openingPicks: 3, // 最初の何問を
  openingSpread: 6, // 情報量が最大の6割以上ある質問のうち、上位何問からくじで選ぶか（毎回同じ出だしにしないため）
  openingShare: 0.6,
  lateAfter: 8, // late: true の質問（名前・色・形・地方）は、この問数に達するまで出さない（決めていない人には答えにくい）
  contradictions: 2, // はっきりした答え（はい・いいえ）とこの数以上食い違う料理は推測しない
  overwhelming: 0.95, // ただし確率がここを超えるほど他が合っていれば推測する（答えの押し間違いを救う）
  softShare: 0.5, // 「たぶん」「わからない」がこの割合以上の人（まだ決めていない人に多い）には、
  softFrom: 10, // この問数から、推測の基準を
  softEase: 0.15, // これだけ下げて、提案として早めに出す
  customPrior: 3, // 教わった料理の事前の重み（ほぼ同点なら教わった料理を先に出す）
});

export const TUNING = Object.freeze({
  floor: 0.08, // 尤度の下駄。答えが1回食い違っても 1/12.5 倍で済む
  priorWeight: 2, // 端末で学習した答えに対し、元のデータを何回分の答えとみなすか
  customWeight: 0.25, // 教わった料理の、まだ答えの無い質問（0.5）の重み。小さいほど1回教わっただけで答え方が効く
});

// 「はい」と答えたのに見込みがこれ以下、「いいえ」と答えたのにこれ以上なら、はっきり食い違ったとみなす
export const HARD = Object.freeze({ yesAtMost: 0.2, noAtLeast: 0.8 });

export const CUSTOM_EMOJI = '🍽️';

// 何問目に、どこまで確信したら推測するか。
// まだ決めていない人の答えは2〜3品のあいだで揺れるので、基準を固定すると25問目まで推測しない（シミュレーションで中央値24問）。
// 10問を過ぎたら少しずつ基準を下げ、揺れている候補の最有力を先に出す。
export function guessThreshold(count) {
  if (count < LIMITS.minQuestions) return Infinity;
  if (count <= LIMITS.easeFrom) return LIMITS.guessAt;
  return Math.max(LIMITS.guessFloor, LIMITS.guessAt - (count - LIMITS.easeFrom) * LIMITS.easeStep);
}

export function answerValue(id) {
  return ANSWER_VALUE.has(id) ? ANSWER_VALUE.get(id) : undefined;
}

export function likelihood(p, t) {
  return TUNING.floor + (1 - TUNING.floor) * (1 - Math.abs(t - p));
}

const TAG = /^([a-z]+)(?::(\d*\.?\d+))?$/;

export function parseTags(tags) {
  const out = new Map();
  for (const token of String(tags).trim().split(/\s+/)) {
    const match = TAG.exec(token);
    if (!match) throw new Error(`特徴の書式が違います: ${token}`);
    const value = match[2] === undefined ? 1 : Number(match[2]);
    if (!(value >= 0 && value <= 1)) throw new Error(`確率は0〜1で書きます: ${token}`);
    if (out.has(match[1])) throw new Error(`同じ特徴が2回あります: ${match[1]}`);
    out.set(match[1], value);
  }
  return out;
}

// 「名前がカタカナですか？」は名前から決める。全部カタカナ＝1、カタカナ混じり＝0.4（「たぶん」と答えがち）、無し＝0
export function katakanaScore(name) {
  const letters = [...String(name).replace(/[・ー\s]/g, '')];
  if (!letters.length) return 0;
  const katakana = letters.filter(char => /[\u30A1-\u30FA]/.test(char)).length;
  if (katakana === letters.length) return 1;
  return katakana > 0 ? 0.4 : 0;
}

function blend(row, learned, qIndex, weight) {
  if (!learned) return;
  for (const [qid, pair] of Object.entries(learned)) {
    const index = qIndex.get(qid);
    if (index === undefined || !Array.isArray(pair)) continue;
    const [sum, count] = pair;
    if (!(count > 0)) continue;
    row[index] = (row[index] * weight + sum) / (weight + count);
  }
}

// 料理×質問の確率表を作る。memory（端末に覚えたこと）があれば混ぜる
export function buildModel(memory = null, { dishes = DISHES, questions = QUESTIONS } = {}) {
  const nQ = questions.length;
  const qIndex = new Map(questions.map((question, index) => [question.id, index]));
  const katakanaIndex = qIndex.get('katakana');
  const items = [];
  const rows = [];

  for (const dish of dishes) {
    const tags = parseTags(dish.tags);
    for (const key of tags.keys()) {
      if (!qIndex.has(key)) throw new Error(`知らない特徴です: ${dish.id} の ${key}`);
      if (key === 'katakana') throw new Error(`katakana は名前から決めるので書きません: ${dish.id}`);
    }
    const row = new Float64Array(nQ);
    questions.forEach((question, index) => {
      row[index] = tags.has(question.id) ? tags.get(question.id) : question.base;
    });
    if (katakanaIndex !== undefined) row[katakanaIndex] = katakanaScore(dish.name);
    blend(row, memory?.dishes?.[dish.id], qIndex, TUNING.priorWeight);
    items.push({ id: dish.id, name: dish.name, kana: dish.kana, emoji: dish.emoji, custom: false });
    rows.push(row);
  }

  for (const custom of memory?.custom ?? []) {
    const row = new Float64Array(nQ).fill(0.5);
    if (katakanaIndex !== undefined) row[katakanaIndex] = katakanaScore(custom.name);
    blend(row, custom.answers, qIndex, TUNING.customWeight);
    items.push({ id: custom.id, name: custom.name, kana: '', emoji: CUSTOM_EMOJI, custom: true });
    rows.push(row);
  }

  const P = new Float64Array(items.length * nQ);
  rows.forEach((row, index) => P.set(row, index * nQ));
  return { items, P, nQ, questions, qIndex, index: new Map(items.map((item, i) => [item.id, i])) };
}

export function probabilityOf(model, id, qid) {
  const d = model.index.get(id);
  const q = model.qIndex.get(qid);
  if (d === undefined || q === undefined) return undefined;
  return model.P[d * model.nQ + q];
}

// avoid：直前の占いの出だしの質問。同じ端末で続けて遊ぶとき、出だしが同じにならないように避ける
export function newGame(seed = 1, { avoid = [] } = {}) {
  return { seed: seed >>> 0, answers: [], rejected: [], avoid: [...avoid] };
}

// その料理が、はっきりした答え（はい・いいえ）といくつ食い違うか。「たぶん」は数えない
export function contradictions(model, game, id) {
  const d = model.index.get(id);
  if (d === undefined) return 0;
  let count = 0;
  for (const { q, a } of game.answers) {
    const qi = model.qIndex.get(q);
    if (qi === undefined) continue;
    const p = model.P[d * model.nQ + qi];
    if ((a === 'yes' && p <= HARD.yesAtMost) || (a === 'no' && p >= HARD.noAtLeast)) count++;
  }
  return count;
}

// 推測してよい料理か。答えと2つ以上食い違う料理を当てずっぽうに出すと、「聞いていない」と受け取られる。
// 確率の低い推測（基準を下げて出す推測・最後の推測）は、食い違いが1つでもあれば出さない
// （1つだけ食い違うカオマンガイやリゾットでも、体験評価で「答えを聞いていない」と受け取られた）
function guessable(model, game, entry) {
  if (!(entry.p > 0)) return false;
  if (entry.p >= LIMITS.overwhelming) return true;
  const count = contradictions(model, game, entry.id);
  return entry.p >= LIMITS.guessAt ? count < LIMITS.contradictions : count === 0;
}

// まだ推測できる見込みのある料理が残っているか。食い違いは答えるほど増える一方なので、
// 2つ以上食い違う料理しか残っていなければ、この先いくら聞いても推測できない
function hopeful(model, game, ranked) {
  return ranked.some(entry => entry.p > 0 && (entry.p >= LIMITS.overwhelming || contradictions(model, game, entry.id) < LIMITS.contradictions));
}

// 「たぶん」「わからない」の割合。高い人は料理を決めずに気分で答えていることが多い
export function softShare(game) {
  if (!game.answers.length) return 0;
  return game.answers.filter(entry => entry.a !== 'yes' && entry.a !== 'no').length / game.answers.length;
}

export function answer(game, qid, answerId) {
  if (answerValue(answerId) === undefined) throw new Error(`知らない答えです: ${answerId}`);
  if (game.answers.some(entry => entry.q === qid)) throw new Error(`同じ質問に2回答えています: ${qid}`);
  return { ...game, answers: [...game.answers, { q: qid, a: answerId }] };
}

// 直前の答えを1つ取り消す。外れた推測は取り消さない（その料理ではないことは変わらない）
export function undo(game) {
  if (!game.answers.length) return game;
  return { ...game, answers: game.answers.slice(0, -1) };
}

// 外れた推測を記録する。missAt は外れた時点の問数で、次の推測の前に最低1問聞くために使う
export function reject(game, id) {
  if (game.rejected.includes(id)) return game;
  return { ...game, rejected: [...game.rejected, id], missAt: game.answers.length };
}

export function posterior(model, game) {
  const { P, nQ, items, qIndex } = model;
  const n = items.length;
  const logw = new Float64Array(n);
  for (const { q, a } of game.answers) {
    const t = answerValue(a);
    if (t === null || t === undefined) continue;
    const qi = qIndex.get(q);
    if (qi === undefined) continue;
    for (let d = 0; d < n; d++) logw[d] += Math.log(likelihood(P[d * nQ + qi], t));
  }
  for (let d = 0; d < n; d++) if (items[d].custom) logw[d] += Math.log(LIMITS.customPrior);
  const rejected = new Set(game.rejected);
  let max = -Infinity;
  for (let d = 0; d < n; d++) {
    if (rejected.has(items[d].id)) logw[d] = -Infinity;
    if (logw[d] > max) max = logw[d];
  }
  const post = new Float64Array(n);
  if (max === -Infinity) return post;
  let sum = 0;
  for (let d = 0; d < n; d++) {
    post[d] = logw[d] === -Infinity ? 0 : Math.exp(logw[d] - max);
    sum += post[d];
  }
  for (let d = 0; d < n; d++) post[d] /= sum;
  return post;
}

export function ranking(model, post) {
  return model.items
    .map((item, d) => ({ id: item.id, p: post[d], order: d }))
    .sort((a, b) => b.p - a.p || a.order - b.order)
    .map(({ id, p }) => ({ id, p }));
}

function entropyOf(weights, total) {
  let h = 0;
  for (const w of weights) {
    if (w <= 0) continue;
    const v = w / total;
    h -= v * Math.log2(v);
  }
  return h;
}

// まだ聞いていない質問を、期待情報量の大きい順に並べる
export function scoreQuestions(model, post, askedIds) {
  const { P, nQ, items, questions } = model;
  const n = items.length;
  const current = entropyOf(post, 1);
  const yes = new Float64Array(n);
  const no = new Float64Array(n);
  const scored = [];
  for (let qi = 0; qi < nQ; qi++) {
    const id = questions[qi].id;
    if (askedIds.has(id)) continue;
    let pYes = 0;
    let sumYes = 0;
    let sumNo = 0;
    for (let d = 0; d < n; d++) {
      const w = post[d];
      if (w <= 0) {
        yes[d] = 0;
        no[d] = 0;
        continue;
      }
      const p = P[d * nQ + qi];
      pYes += w * p;
      yes[d] = w * likelihood(p, 1);
      no[d] = w * likelihood(p, 0);
      sumYes += yes[d];
      sumNo += no[d];
    }
    const expected = pYes * entropyOf(yes, sumYes) + (1 - pYes) * entropyOf(no, sumNo);
    scored.push({ id, gain: current - expected, order: qi });
  }
  return scored.sort((a, b) => b.gain - a.gain || a.order - b.order).map(({ id, gain }) => ({ id, gain }));
}

// 次に何をするかを決める：質問する／推測する／参りました
export function nextStep(model, game) {
  const post = posterior(model, game);
  const ranked = ranking(model, post);
  const top = ranked[0];
  const count = game.answers.length;
  const guessesLeft = LIMITS.maxGuesses - game.rejected.length;
  if (!top || top.p <= 0 || guessesLeft <= 0) return { type: 'giveup', post, ranked };
  // 外した直後は、残りの候補の確率が正規化で跳ね上がる（0.86と0.13の2品で1番手を外すと、2番手が0.93になる）。
  // そのまま続けて推測すると候補を順に読み上げているように見えるので、外したら最低1問は聞いてから次を出す
  const justMissed = game.rejected.length > 0 && count <= (game.missAt ?? -1);
  // 気分で答えている人には、10問目から基準を下げて「提案」として出す
  const suggest = count >= LIMITS.softFrom && softShare(game) >= LIMITS.softShare;
  const bar = suggest ? Math.max(LIMITS.guessFloor, guessThreshold(count) - LIMITS.softEase) : guessThreshold(count);
  if (!justMissed && top.p >= bar && guessable(model, game, top)) return { type: 'guess', id: top.id, p: top.p, suggest, post, ranked };
  // 推測できる見込みの料理が1つも残っていなければ、読み0%のまま質問を続けずに参りました
  if (count >= LIMITS.minQuestions && !hopeful(model, game, ranked)) return { type: 'giveup', post, ranked };
  // 質問を使い切ったら、答えと食い違わない料理の中で最も確からしいものを出す。1つも無ければ参りました
  const lastCall = () => {
    const pick = ranked.find(entry => guessable(model, game, entry));
    return pick ? { type: 'guess', id: pick.id, p: pick.p, final: true, suggest: softShare(game) >= LIMITS.softShare, post, ranked } : { type: 'giveup', post, ranked };
  };
  if (count >= LIMITS.maxQuestions) return lastCall();
  const asked = new Set(game.answers.map(entry => entry.q));
  if (count < LIMITS.lateAfter) {
    for (const question of model.questions) if (question.late) asked.add(question.id);
  }
  let scored = scoreQuestions(model, post, asked);
  // 名前や見た目の質問に「わからない」と答えた人（まだ料理を決めていない人に多い）には、その種の質問を後回しにする
  const unsureOfLate = game.answers.some(entry => entry.a === 'unknown' && model.questions[model.qIndex.get(entry.q)]?.late);
  if (unsureOfLate) {
    scored = scored
      .map(entry => (model.questions[model.qIndex.get(entry.id)]?.late ? { ...entry, gain: entry.gain * 0.5 } : entry))
      .sort((a, b) => b.gain - a.gain || model.qIndex.get(a.id) - model.qIndex.get(b.id));
  }
  if (!scored.length || scored[0].gain < 1e-4) return lastCall();
  let pick = scored[0];
  if (count < LIMITS.openingPicks) {
    // 情報量が最大の6割以上ある質問から、上位6問を上限にくじで選ぶ。直前の占いの出だしは避ける
    const avoid = new Set(game.avoid ?? []);
    const floor = scored[0].gain * LIMITS.openingShare;
    const strong = scored.filter(entry => entry.gain >= floor).slice(0, LIMITS.openingSpread);
    const fresh = strong.filter(entry => !avoid.has(entry.id));
    const pool = fresh.length ? fresh : strong;
    const random = rngFor(game.seed, count, game.rejected.length);
    pick = pool[Math.floor(random() * pool.length)];
  }
  return { type: 'ask', q: pick.id, gain: pick.gain, post, ranked };
}

// 画面の「読みの輪」の値（0〜1）と、水晶玉に映す料理。
// 推測してよい料理のうち最も確からしいものが、推測に踏み切る基準にどこまで迫っているかを表す。
// 答えと2つ以上食い違う料理は推測しないので、輪にも数えない（数えると99%のまま答えが出ない、が起きる）。
// 推測の画面でだけ 1（100%）。それ以外は 0.99 で止めて、100% と推測の瞬間を一致させる
export function reading(model, game, step = nextStep(model, game)) {
  if (step.type === 'guess') return { value: 1, id: step.id };
  if (step.type === 'giveup') return { value: 0, id: null };
  const count = game.answers.length;
  const bar = count < LIMITS.minQuestions ? LIMITS.guessAt : guessThreshold(count);
  const lead = step.ranked.find(entry => guessable(model, game, entry));
  if (!lead) return { value: 0, id: null };
  return { value: Math.min(0.99, lead.p / bar), id: lead.id };
}

// 当てた料理について、「ほかの料理ではなくこれだ」と決める力が強かった答えを上から返す
export function deciders(model, game, id, limit = 3) {
  const d = model.index.get(id);
  if (d === undefined) return [];
  const { P, nQ, items, qIndex } = model;
  const n = items.length;
  const out = [];
  for (const { q, a } of game.answers) {
    const t = answerValue(a);
    // 名前の書き方（カタカナか）は料理の決め手として見せても納得されない
    if (t === null || t === undefined || q === 'katakana') continue;
    const qi = qIndex.get(q);
    if (qi === undefined) continue;
    const own = Math.log(likelihood(P[d * nQ + qi], t));
    let mean = 0;
    for (let e = 0; e < n; e++) mean += Math.log(likelihood(P[e * nQ + qi], t));
    mean /= n;
    out.push({ q, a, weight: own - mean });
  }
  return out
    .filter(entry => entry.weight > 0.25)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, limit);
}

export function itemOf(model, id) {
  const d = model.index.get(id);
  return d === undefined ? null : model.items[d];
}
