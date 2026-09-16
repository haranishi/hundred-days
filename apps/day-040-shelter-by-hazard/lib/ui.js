import { formatDistance, walkText } from './geo.js';
import { hazardName } from './tiles.js';

/* 状態の切り替えはここ1か所。読み込みの成功経路が増えると必ず書き忘れる（Day 032の教訓） */
const SHOWN = {
  intro: ['empty'],
  answer: ['ready'],
  status: ['loading'],
  failure: ['error'],
  'no-sites': ['none'],
  skeleton: ['loading'],
  usable: ['ready'],
  unusable: ['ready'],
};

export function setState(name, message = '') {
  document.getElementById('app').dataset.state = name;
  for (const [id, states] of Object.entries(SHOWN)) document.getElementById(id).hidden = !states.includes(name);
  document.getElementById('status').textContent = name === 'loading' ? message : '';
  document.getElementById('failure-text').textContent = name === 'error' ? message : '';
}

/* 答えは長い。語の途中で折り返さないよう、節ごとに分けて <wbr> を挟む（Day 033の教訓） */
export const answerParts = (hazard, place) => [
  `${hazardName(hazard)}のとき、`,
  'いちばん近い指定緊急避難場所は',
  `「${place.name}」。`,
  `${formatDistance(place.distance)}、`,
  `${walkText(place.distance)}。`,
];
export const answerSubParts = (hazard, nearerUnusable) => nearerUnusable > 0
  ? [`それより近くに${nearerUnusable}か所ありますが、`, `${hazardName(hazard)}では使えません。`]
  : ['いちばん近い場所が、', `そのまま${hazardName(hazard)}で使えます。`];

export const answerText = (hazard, place) => answerParts(hazard, place).join('');
export const answerSubText = (hazard, nearerUnusable) => answerSubParts(hazard, nearerUnusable).join('');

export const noSitesParts = (hazard) => ['この区画には、', `${hazardName(hazard)}の指定緊急避難場所が登録されていません`];
export const noSitesSubText = (hazard) => `${hazardName(hazard)}の危険がない地域では指定されないことがあります。ほかの災害の種類に切り替えるか、お住まいの市町村の情報を確かめてください。`;

export const usableTitleParts = (hazard, count) => [`${hazardName(hazard)}で使える、`, `近い順${count}か所`];
export const unusableTitleParts = (hazard) => ['近いのに、', `${hazardName(hazard)}では使えない場所`];
export const unusableNoneText = (hazard, usableCount) => `近い${usableCount}か所の範囲に、${hazardName(hazard)}で使えない場所はありません。`;
export const unusableMoreText = (count) => `ほか${count}か所`;

export const usablePinLabel = (rank, place, hazard) => `${rank} ${place.name} ${formatDistance(place.distance)} ${hazardName(hazard)}で使える`;
export const unusablePinLabel = (place, hazard) => `${place.name} ${formatDistance(place.distance)} ${hazardName(hazard)}では使えない`;

export const issuedText = (date) => date ? `（${date} 配信）` : '';
