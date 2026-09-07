/* 出題の組み立てと得点。DOMにも通信にも触れない純関数だけを置く。

   誤答候補は「同じ土俵」から出す。市区町村なら同じ県の町、都道府県なら同じ地方の県。
   全国から無作為に選ぶと「秋田県の隣に沖縄県」のような、形を見なくても消せる選択肢が並ぶ。 */

import { regionOfPref } from './regions.js';
import { pickOne, sample, shuffle } from './rng.js';

export const QUESTION_COUNT = 10;
export const CHOICE_COUNT = 4;
/** 同じ地方から出す誤答の数（都道府県モード。残り1件は別の地方から） */
const SAME_REGION_WRONG = 2;
/* 1問目は「見た瞬間に分かる形」から出す。最初の成功体験を運任せにしないための枠で、
   ここに無い県が1問目に来ないだけ。2問目以降は今までどおり全部が候補になる。 */
export const LEAD_PREFS = ['01', '02', '12', '17', '22', '37', '42', '46', '47'];
/** town モードの1問目に使う「県内で大きい町」の上位件数（大きい町ほど形を知っている人が多い） */
export const LEAD_TOWN_COUNT = 5;

const regionIdOf = (item) => item?.region || regionOfPref(item?.code)?.id || '';
/** 県の枠 0〜1000 で測った町の長い辺。pos が無いデータでも落ちないように 0 に倒す */
const townSize = (item) => Number(item?.pos?.[2] ?? 0);

/**
 * 1問目だけ leads から選び、残りは重複なく埋める。leads が空なら普通に選ぶだけ。
 * 同じ rng を渡せば必ず同じ並びになる（planPrefCodes との同期はこの関数の外で保つ）。
 */
function sampleWithLead(rng, items, count, leads) {
  const lead = pickOne(rng, leads);
  if (!lead) return sample(rng, items, count);
  return [lead, ...sample(rng, items.filter((item) => item !== lead), count - 1)];
}

class QuizDataError extends Error {}

function need(condition, message) {
  if (!condition) throw new QuizDataError(message);
}

/** 答えを含む4件に整える。重複した名前は落としてから数える */
function toChoices(answer, wrongPool, rng) {
  const seen = new Set([answer.code]);
  const names = new Set([answer.name]);
  const wrong = [];
  for (const item of wrongPool) {
    if (wrong.length >= CHOICE_COUNT - 1) break;
    if (seen.has(item.code) || names.has(item.name)) continue;
    seen.add(item.code);
    names.add(item.name);
    wrong.push(item);
  }
  need(wrong.length === CHOICE_COUNT - 1, `選択肢が足りません: ${answer.name}`);
  return shuffle(rng, [answer, ...wrong]);
}

/** 都道府県モードの誤答：同じ地方から2つ、別の地方から1つ。同じ地方が足りなければ別の地方で埋める */
function prefWrongPool(answer, prefs, rng) {
  const region = regionIdOf(answer);
  const others = prefs.filter((item) => item.code !== answer.code);
  const same = shuffle(rng, others.filter((item) => regionIdOf(item) === region));
  const far = shuffle(rng, others.filter((item) => regionIdOf(item) !== region));
  const near = same.slice(0, SAME_REGION_WRONG);
  // 同じ地方が2つに満たないぶんは別の地方から足す（北海道のように1県しかない地方がある）
  const rest = [...far, ...same.slice(SAME_REGION_WRONG)];
  return [...near, ...rest];
}

/**
 * 出題に必要な市区町村データの県コードを、buildRound と同じ乱数の消費順で先に決める。
 * アプリはこれを見て「その県のファイルだけ」を読み込める（47県ぶんを読まない）。
 * 同じ種で作った rng を渡せば buildRound と必ず同じ並びになる。
 */
export function planPrefCodes({ mode, prefs = [], prefCode = null, rng, count = QUESTION_COUNT }) {
  if (mode === 'town') return prefCode ? [prefCode] : [];
  if (mode !== 'town-all') return [];
  // 「毎問ちがう県から」と画面に書いてあるので、県は重複させない（47県から10県）
  return sample(rng, prefs, count).map((pref) => pref.code);
}

function townsOf(townsByPref, code) {
  const file = townsByPref?.[code];
  const items = Array.isArray(file?.items) ? file.items : null;
  need(items && items.length >= CHOICE_COUNT, `市区町村データがありません: ${code}`);
  return { items, prefName: file.prefName || '' };
}

function prefQuestions(prefs, rng, count) {
  need(prefs.length >= CHOICE_COUNT, '都道府県データが足りません');
  const leads = prefs.filter((pref) => LEAD_PREFS.includes(pref.code));
  return sampleWithLead(rng, prefs, count, leads).map((answer) => ({
    answer,
    choices: toChoices(answer, prefWrongPool(answer, prefs, rng), rng),
    prefCode: answer.code,
    prefName: answer.name
  }));
}

function townQuestions(prefCode, townsByPref, rng, count) {
  const { items, prefName } = townsOf(townsByPref, prefCode);
  const leads = [...items].sort((a, b) => townSize(b) - townSize(a)).slice(0, LEAD_TOWN_COUNT);
  return sampleWithLead(rng, items, count, leads).map((answer) => ({
    answer,
    choices: toChoices(answer, shuffle(rng, items.filter((item) => item.code !== answer.code)), rng),
    prefCode,
    prefName
  }));
}

function allTownQuestions(codes, townsByPref, rng) {
  const used = new Set();
  const questions = [];
  for (const code of codes) {
    // 同じ県が続けて当たっても町は重複させない。使い切った県は他の候補へ回す
    const order = [code, ...codes.filter((other) => other !== code)];
    const found = order
      .map((candidate) => ({ candidate, ...townsOf(townsByPref, candidate) }))
      .find(({ items }) => items.some((item) => !used.has(item.code)));
    if (!found) break;
    const pool = found.items.filter((item) => !used.has(item.code));
    const answer = pickOne(rng, pool);
    used.add(answer.code);
    questions.push({
      answer,
      choices: toChoices(answer, shuffle(rng, found.items.filter((item) => item.code !== answer.code)), rng),
      prefCode: found.candidate,
      prefName: found.prefName
    });
  }
  return questions;
}

/**
 * 1ラウンドぶんの出題を作る。
 * mode: 'pref' | 'town' | 'town-all'
 * 同じ種の rng を渡せば必ず同じ10問になる。
 */
export function buildRound({ mode, prefs = [], townsByPref = {}, prefCode = null, rng, count = QUESTION_COUNT }) {
  const codes = planPrefCodes({ mode, prefs, prefCode, rng, count });
  if (mode === 'pref') return { mode, prefCode: null, questions: prefQuestions(prefs, rng, count) };
  if (mode === 'town') {
    need(prefCode, '県が選ばれていません');
    return { mode, prefCode, questions: townQuestions(prefCode, townsByPref, rng, count) };
  }
  if (mode === 'town-all') return { mode, prefCode: null, questions: allTownQuestions(codes, townsByPref, rng) };
  throw new QuizDataError(`知らないモードです: ${mode}`);
}

/** 正解1点、ヒントを見た問の正解は0.5点、不正解は0点 */
export function score(answers) {
  return (Array.isArray(answers) ? answers : []).reduce(
    (sum, answer) => sum + (answer?.correct ? (answer.hinted ? 0.5 : 1) : 0),
    0
  );
}

/** 8.5 は「8.5」、9 は「9」。0.5刻みに丸めてから整形する */
export function formatScore(value) {
  const rounded = Math.round(Number(value || 0) * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
