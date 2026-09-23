// 画面に出す文言を組み立てる小さな関数。DOM に触れないので、デモの振り付けやテストからも同じものを使える。
import { ANSWERS, LIMITS } from './oracle.js';
import { QUESTION_BY_ID } from './questions.js';

export const APP_TITLE = 'いま食べたいもの、当てます';

export function answerLabel(id) {
  return ANSWERS.find(entry => entry.id === id)?.label ?? '';
}

export function questionText(qid) {
  return QUESTION_BY_ID.get(qid)?.text ?? '';
}

// 「7問目／25」。上限まで見せて、あとどれくらい聞かれるかの見当を付けてもらう
export function counterText(count) {
  return `${count + 1}問目／${LIMITS.maxQuestions}`;
}

// 「推測 あと3回」。外す前から出して、推測に回数の限りがあることを先に知らせる
export function guessesLeftText(rejected) {
  return `推測 あと${Math.max(0, LIMITS.maxGuesses - rejected)}回`;
}

// 読み上げ用の問数。「／25」は読み上げると分かりにくいので言わず、推測を外したあとだけ残りの回数を添える
export function counterSpeech(count, rejected) {
  const nth = `${count + 1}問目`;
  return rejected > 0 ? `${nth}、${guessesLeftText(rejected)}` : nth;
}

// 当たりの見出し。1回目の推測で当たったときだけ「やはり」（外したあとに言うと、見抜いていたふりに聞こえる）。
// guesses は当たりの1回を含めた推測の回数
export function wonHeadline(guesses) {
  return guesses > 1 ? { lead: '見えました。', tail: 'ですね。' } : { lead: 'やはり、', tail: 'でしたか。' };
}

// 料理の3Dの絵。教わった料理（一覧に無い）は、覆いをかけた皿の絵にする
export function dishImage(item) {
  return item && !item.custom && item.id ? `assets/dishes/${item.id}.webp` : 'assets/dishes/mystery.webp';
}

// 推測の札の上に出す一行。最後の1回と、質問を出し尽くしたあとだけ出す
export function guessNote(rejected, final) {
  if (LIMITS.maxGuesses - rejected <= 1) return '最後の読みです';
  return final ? '問いは尽きました' : '';
}

// guesses は当たりの1回を含めた推測の回数
export function wonCountText(count, guesses) {
  return guesses > 1 ? `${count}問と、推測${guesses}回で見えました。` : `${count}問で見えました。`;
}

// 教えずに終えたときの一行。count は答えた問数、guesses は外した推測の回数
export function giveupCountText(count, guesses) {
  return guesses > 0 ? `${count}問と、推測${guesses}回では見えませんでした。` : `${count}問では見えませんでした。`;
}

export function wonShareText(name, count) {
  return `${APP_TITLE} — 水晶玉に「${name}」を${count}問で見抜かれた。`;
}

export function taughtShareText(count) {
  return `${APP_TITLE} — 水晶玉を${count}問で降参させた。`;
}

export function xIntentUrl(text, url) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

// 教わった日付は端末の暦で残す（UTCだと日本の朝9時前が前日になる）
export function localDay(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
