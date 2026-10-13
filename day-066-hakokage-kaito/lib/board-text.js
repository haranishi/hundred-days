/* 盤を文で読む（画面読み上げ用の `<details>` の中身）。盤の SVG は絵なので、同じ状況を1行ずつの文にする。
   光っているマス・次の1手で光るマス・影のマスは、sim の scene() と同じ集合。位置は「左から{x}・上から{y}」（1から数える）。
   scene() の結果だけを文にする。光や影を自分では計算しない。 */
import { scene } from './sim.js';
import { sourceLabel, DIR_WORD } from './phrase.js';

const pos = ([x, y]) => `左から${x + 1}・上から${y + 1}`;
const byRow = (a, b) => a[1] - b[1] || a[0] - b[0];
const unique = (cells) => [...new Map(cells.map((c) => [c.join(), c])).values()];
const listOf = (cells) => (cells.length ? unique(cells).sort(byRow).map(pos).join('、') : 'なし');
const parse = (key) => key.split(',').map(Number);

export const LABEL_LIT = '光っているマス';
export const LABEL_NEXT = '次の1手で光るマス';
export const LABEL_SHADOW = '影のマス';

// showNext=false なら次の1手の欄は「なし」（見つかった・詰み・成功では予告を出さない）
export function boardLines(level, state, { showNext = true } = {}) {
  const sc = scene(level, state);
  const lines = [];
  lines.push(`あなた：${pos(state.player)}`);
  lines.push(state.treasure ? '宝：持っている' : `宝：${pos(level.treasure)}`);
  lines.push(`出口：${state.treasure ? '開いている' : '閉じている'}（${pos(level.exit)}）`);
  state.boxes.forEach((b, i) => lines.push(`箱${i + 1}：${pos(b)}`));
  level.guards.forEach((_, index) => {
    const pose = sc.guards[index];
    lines.push(`${sourceLabel(level, { kind: 'guard', index })}：${pos(pose.at)}、向きは${DIR_WORD[pose.facing]}`);
  });
  level.lasers.forEach((l, index) => {
    lines.push(`${sourceLabel(level, { kind: 'laser', index })}：${pos(l.at)}、向きは${DIR_WORD[l.dir]}`);
  });
  lines.push(`${LABEL_LIT}：${listOf([...sc.lit].map(parse))}`);
  const next = showNext && sc.preview ? sc.preview.beams.flatMap((b) => b.cells) : [];
  lines.push(`${LABEL_NEXT}：${listOf(next)}`);
  lines.push(`${LABEL_SHADOW}：${listOf(sc.shadows.map((s) => s.cell))}`);
  return lines;
}
