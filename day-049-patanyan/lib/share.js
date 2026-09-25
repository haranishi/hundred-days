import { SITE_URL, APP_NAME, HASHTAG } from './site.js';
import { dateLabel } from './date.js';

export function modeLabel({ mode, dateKey, todayKey }) {
  if (mode !== 'daily') return 'いつでもモード';
  return dateKey === todayKey ? `きょうのコース ${dateLabel(dateKey)}` : `${dateLabel(dateKey)} のコース`;
}

// 例：ぱたにゃん｜きょうのコース 9/24 で23本くぐった🐟×5 #ぱたにゃん
export function shareText({ mode, dateKey, todayKey, score, fish }) {
  const label = modeLabel({ mode, dateKey, todayKey });
  const joint = /\d$/.test(label) ? ' ' : '';
  const fishPart = fish > 0 ? `🐟×${fish}` : '';
  return `${APP_NAME}｜${label}${joint}で${score}本くぐった${fishPart} ${HASHTAG}`;
}

// 同じコースに挑戦できるのは日付で決まるコースだけ。いつでもモードは毎回違うので入口のURLを渡す
export function shareUrl({ mode, dateKey }, base = SITE_URL) {
  return mode === 'daily' ? `${base}?course=${dateKey}` : base;
}

export function intentX(text, url) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function intentLine(url) {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
}

export function cardFileName({ mode, dateKey, score }) {
  return `patanyan-${mode === 'daily' ? dateKey : 'anytime'}-${score}.png`;
}
