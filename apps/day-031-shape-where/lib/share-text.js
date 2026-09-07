/* 結果画面から出す投稿文。共通のシェア部品は文言をマウント時に1回読むので、
   点数の入った文はここで作って専用ボタンから渡す。 */

import { formatScore } from './quiz.js';

export const APP_TITLE = 'この形、どこ？';
const HASHTAG = '#100日チャレンジ';
const TOTAL = 10;

/** 東京都だけ区があるので「市区町村」。ほかの県は「市町村」 */
export const townUnit = (prefName) => (String(prefName ?? '').trim() === '東京都' ? '市区町村' : '市町村');

/** 「秋田県の市町村クイズ」のような、何で遊んだかの1語 */
export function modeLabel({ mode, prefName = '' }) {
  if (mode === 'town') return `${String(prefName).trim()}の${townUnit(prefName)}クイズ`;
  if (mode === 'town-all') return '全国の市区町村クイズ';
  return '都道府県のシルエットクイズ';
}

/** 投稿文の1行目。アプリ名・遊んだ内容・点数 */
export function scoreLine({ mode, prefName = '', score = 0 }) {
  return `${APP_TITLE} ${modeLabel({ mode, prefName })} ${formatScore(score)} / ${TOTAL}`;
}

/** 共有するURL。市区町村モードは県を持ち運ぶ */
export function shareUrl({ mode, prefCode = null, base = '' }) {
  const clean = String(base ?? '').split('#')[0].split('?')[0];
  return mode === 'town' && prefCode ? `${clean}?p=${prefCode}` : clean;
}

/** 「投稿文をコピー」で渡す全文。1行目・URL・ハッシュタグの3行 */
export function postText({ mode, prefName = '', score = 0, url = '' }) {
  return [scoreLine({ mode, prefName, score }), url, HASHTAG].filter(Boolean).join('\n');
}

/** Xの投稿画面に渡す本文。URLは url= で別に渡すのでここには入れない */
export function intentText({ mode, prefName = '', score = 0 }) {
  return `${scoreLine({ mode, prefName, score })}\n${HASHTAG}`;
}

/** Xの投稿画面のURL */
export function intentHref({ text, url }) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
