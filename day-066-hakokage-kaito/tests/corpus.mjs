// 画面に出る文の全部（折り返しの検査用）。面データ・phrase.js が作る文・index.html に手で書いた文を集める。
// 画面の文を足したら、ここにも足す（足し忘れた文は、折り返しの検査を受けない）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadLevel } from '../lib/sim.js';
import { LEVELS } from '../lib/levels-data.js';
import * as T from '../lib/phrase.js';
import { boardLines } from '../lib/board-text.js';
import { initialState } from '../lib/sim.js';

const REASONS = ['walked-in', 'uncovered', 'guard-move', 'guard-turn', 'guard-turn-box', 'guard-rotate'];

// 共通の部品（shared/share.js）が出す文。部品は直さず、アプリ側（app.js）が窓の中で区切りを入れ直す。文が変わったら、tests/wrap.test.mjs の「部品の文と同じ」が落ちる
export const SHARED_TEXTS = Object.freeze([
  'InstagramとYouTubeはWebから直接投稿できない仕組みなので、「共有…」かコピーしたリンクから貼ってください。', // 端末の共有（navigator.share）があるとき
  'InstagramとYouTubeはWebから直接投稿できない仕組みなので、リンクをコピーして貼ってください。', // 共有が無いとき
  'コピーしました',
  'コピーできませんでした。URLを選んでコピーしてください',
]);

// 動的に作る文（phrased() を通す文）
export function dynamicTexts() {
  const out = new Set();
  for (const L of LEVELS) {
    out.add(L.hint);
    out.add(L.name);
    out.add(T.levelHeading(L.no, L.name));
    const level = loadLevel(L);
    const sources = [];
    level.guards.forEach((_, index) => sources.push({ kind: 'guard', index }));
    level.lasers.forEach((_, index) => sources.push({ kind: 'laser', index }));
    for (const reason of REASONS) {
      for (const source of sources) {
        for (const step of [3, 12, 99]) T.caughtText(level, { reason, source, step }).lines.forEach((line) => out.add(line));
      }
    }
    for (const line of boardLines(level, initialState(level))) out.add(line);
  }
  out.add(T.deadText().lines[0]);
  out.add(T.RESTART_TOAST);
  out.add(T.DEMO_END);
  out.add(T.DEMO_START);
  out.add(T.MIN_STEPS_NOTE);
  out.add(T.RECORD_UPDATED);
  out.add(T.COPY_FAILED);
  for (const reason of ['wall', 'edge', 'locked', 'guard', 'stuck']) out.add(T.bumpText(reason));
  out.add(T.bumpText('guard', 'watch'));
  for (const [par, steps] of [[10, 10], [10, 14], [10, 16], [25, 38]]) out.add(T.clearText({ par, steps, best: steps, prevBest: steps + 2 }).note);
  for (const text of SHARED_TEXTS) out.add(text);
  return [...out];
}

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

// index.html に手で書いた、折り返し候補（<wbr>）を持つ文。HTML のままと、タグを外した文の組
export function staticParagraphs() {
  const out = [];
  for (const re of [/<li>([\s\S]*?)<\/li>/g, /<p\b[^>]*>([\s\S]*?)<\/p>/g, /<span class="switch__label">([\s\S]*?)<\/span><\/button>/g]) {
    for (const m of html.matchAll(re)) {
      if (!m[1].includes('<wbr>')) continue;
      out.push({ html: m[1], text: m[1].replace(/<wbr>/g, '').replace(/<[^>]+>/g, '') });
    }
  }
  return out;
}
