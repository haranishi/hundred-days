// 果たし状（同じ盤を友に出すリンク）と共有の文。文は docs/COPY.md「共有の文」
import { getLevel } from './levels.js';

// hash は claude.ai の Artifact でも届く書式（英数字と - だけ）に限る
const SEED_RE = /^[0-9a-z]{4,12}$/;
const HASH_RE = /^#?c-([1-9]\d?)-([0-9a-z]{4,12})(?:-(\d{1,5}))?$/;
const MAX_SEC = 86399;

const validSeconds = (s) => Number.isInteger(s) && s >= 1 && s <= MAX_SEC;

export function challengeHash({ level, seed, seconds } = {}) {
  const lv = getLevel(level);
  const s = String(seed ?? '');
  if (!lv || !SEED_RE.test(s)) return null;
  const sec = Math.floor(Number(seconds));
  return validSeconds(sec) ? `#c-${lv.id}-${s}-${sec}` : `#c-${lv.id}-${s}`;
}

export function parseChallenge(hash) {
  if (typeof hash !== 'string') return null;
  const m = HASH_RE.exec(hash);
  if (!m) return null;
  const level = Number(m[1]);
  if (!getLevel(level)) return null;
  let seconds = null;
  if (m[3] !== undefined) {
    // 先頭の0や範囲外は作った覚えのない書式なので不正とする
    if (m[3].startsWith('0')) return null;
    seconds = Number(m[3]);
    if (!validSeconds(seconds)) return null;
  }
  return { level, seed: m[2], seconds };
}

export function formatDuration(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}時間${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

// v2：辻の数ではなく埋める字の数を書く。blanks を渡さなければ腕前の blanks
export function resultShareText({ levelId, seconds, blanks, gaveUp = false } = {}) {
  const lv = getLevel(levelId);
  const name = lv ? lv.name : '';
  if (gaveUp) return `『ことば辻』${name}の問に挑んだが、無念の降参。そなたの腕で仇を討ってくれぬか？`;
  const b = Number.isInteger(blanks) ? blanks : lv?.blanks;
  return `『ことば辻』${name}（埋める字${b}）を${formatDuration(seconds)}で解いたでござる。そなたに解けるか？`;
}

export function appShareText() {
  return '江戸のクロスワード『ことば辻』。空いた辻に一字を入れる、腕試しでござる。';
}

// 空白を「+」にせず %20 で送る（URLSearchParams の書き方だと本文に + が残ることがある）
export function xIntentUrl(text, url) {
  const parts = [];
  if (text) parts.push(`text=${encodeURIComponent(text)}`);
  if (url) parts.push(`url=${encodeURIComponent(url)}`);
  return `https://x.com/intent/post?${parts.join('&')}`;
}

export function lineIntentUrl(url) {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url ?? '')}`;
}
