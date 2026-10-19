// 推理：灯りの高さ → 提げた人の身長 → 容疑者。画面に依存しない純関数。
//
// 灯りの高さ ＝ 身長 × 0.6 ＋ 踏み台。手がかり（アリバイ）で外れる人を除き、残った人の中から、
// 再現した灯りの高さと合う1人を選ぶ。再現する前は、少なくとも2人が残るように作ってある（tests/cases.test.mjs が確かめる）。
// 夜3と夜5は、灯りの高さに合う身長の人が2人いて、アリバイを読まないと決まらない。
import { HEIGHT_RATIO } from './config.js';
import { PEOPLE } from './cases.js';

const round1 = (value) => Math.round(value * 10) / 10;

export const lampHeightOf = (height, stool = 0) => round1(height * HEIGHT_RATIO + stool);
export const heightFromLamp = (lampHeight, stool = 0) => round1((lampHeight - stool) / HEIGHT_RATIO);

export function suspectsOf(caseDef) {
  return caseDef.suspects.map((suspect) => {
    const person = PEOPLE[suspect.id];
    return { ...suspect, name: person.name, role: person.role, height: person.height, lampHeight: lampHeightOf(person.height, caseDef.stool) };
  });
}

export function witnessOf(caseDef) {
  const person = PEOPLE[caseDef.witness.person];
  return { name: person.name, role: person.role, quote: caseDef.witness.quote };
}

// 手がかり（アリバイ）で外れる容疑者のid。
export function ruledOutIds(caseDef) {
  return new Set(caseDef.clues.flatMap((clue) => clue.rulesOut ?? []));
}

// 影を再現する前に残っている容疑者。
export function candidatesBeforeReproduction(caseDef) {
  const out = ruledOutIds(caseDef);
  return suspectsOf(caseDef).filter((suspect) => !out.has(suspect.id));
}

// 灯りの高さに合う容疑者（高さが0.5cm以内で合う人）。アリバイは見ない。
export function matchingByHeight(caseDef, lampHeight = caseDef.stage.lamp.solution) {
  return suspectsOf(caseDef).filter((suspect) => Math.abs(suspect.lampHeight - lampHeight) <= 0.5);
}

// 再現して灯りの高さが分かったあとに残る容疑者（アリバイで外れず、高さも合う人）。
export function candidatesAfterReproduction(caseDef, lampHeight = caseDef.stage.lamp.solution) {
  return candidatesBeforeReproduction(caseDef).filter((suspect) => Math.abs(suspect.lampHeight - lampHeight) <= 0.5);
}

const cm = (value) => `${Math.round(value)}cm`;
const approx = (value) => (Math.abs(value - Math.round(value)) > 0.05 ? `約${cm(value)}` : cm(value));

// 再現した灯りの高さの読み（再現成功後の現場図と、推理の「再現」の手がかりに出す）。
// 身長への計算は、夜1だけ見せて覚えてもらう。夜2以降は、灯りの高さまで。計算は自分でする。
export function readingOf(caseDef, lampHeight = caseDef.stage.lamp.solution) {
  if (!caseDef.showsHeight) return `灯りの高さは${cm(lampHeight)}。これを提げた人の身長は？`;
  const body = lampHeight - caseDef.stool;
  const height = heightFromLamp(lampHeight, caseDef.stool);
  return caseDef.stool > 0
    ? `灯り${cm(lampHeight)} − 踏み台${cm(caseDef.stool)} ＝ ${cm(body)}。6割で割ると、身長は${approx(height)}。`
    : `灯り${cm(lampHeight)}。6割で割ると、身長は${approx(height)}。`;
}

// 選んだ容疑者への判定。誤りのときは、どの手がかりと合わないかを返す。
export function judge(caseDef, suspectId) {
  const suspect = suspectsOf(caseDef).find((item) => item.id === suspectId);
  if (!suspect) throw new RangeError(`unknown suspect: ${suspectId}`);
  if (suspect.id === caseDef.culprit) return { correct: true, suspectId, message: caseDef.closing };
  return { correct: false, suspectId, message: refutation(caseDef, suspect) };
}

export function refutation(caseDef, suspect) {
  const clue = caseDef.clues.find((item) => (item.rulesOut ?? []).includes(suspect.id));
  if (clue) return `${suspect.name}は違う。${clue.text}`;
  const reading = caseDef.stage.lamp.solution;
  const detail = caseDef.stool > 0
    ? `身長${cm(suspect.height)}の6割は${approx(suspect.height * HEIGHT_RATIO)}。踏み台の${cm(caseDef.stool)}を足すと${approx(suspect.lampHeight)}`
    : `身長${cm(suspect.height)}の6割は${approx(suspect.lampHeight)}`;
  return `${suspect.name}は違う。${detail}。再現した灯りは${cm(reading)}で、合わない。`;
}
