/* 紙面の寸法と、記事ブロックの割りつけ。数字だけを持つ層で、描画には触らない。
   座標は紙面座標（1080×1528）。書き出しのときは ctx を拡大するだけで倍率が変わる。 */

export const PAPER = { width: 1080, height: 1528, margin: 56 };
export const MASTHEAD = { top: 64, height: 128 };
export const RULE_Y = 208;
export const BODY = { top: 236, bottom: 1396 };
export const FOOTER = { rule: 1420, text: 1452 };

const GAP = 18;

/* 記事が1本のときは、上の帯に見出しと本文、下の帯に写真を大きく置く。
   列組みだけで1本を組むと、短いリードでは紙面の左半分が白く残る（実測） */
export const SOLO = {
  text: { top: BODY.top, bottom: 860 },
  caption: 884,
  photo: { top: 904, bottom: BODY.bottom }
};

/* 記事ブロックは右から左へ。1本のときは紙面いっぱい、増えるほど左が細くなる。
   新聞の一面と同じで、右にあるものほど扱いが大きい。 */
export function blocks(count) {
  const right = PAPER.width - PAPER.margin;
  const widths = count <= 1 ? [968] : count === 2 ? [620, 330] : [500, 230, 202];
  const list = [];
  let edge = right;
  widths.slice(0, Math.max(1, count)).forEach((width, index) => {
    list.push({
      index,
      right: edge,
      left: edge - width,
      width,
      top: BODY.top,
      bottom: BODY.bottom,
      headlineSize: index === 0 ? (count >= 3 ? 62 : count === 2 ? 66 : 74) : index === 1 ? 40 : 34,
      headlineLines: index === 0 ? 2 : 3,
      leadSize: index === 0 ? 27 : 23,
      photo: index === 0
    });
    edge = edge - width - GAP;
  });
  return list;
}

/* 写真はブロックの左下に接地させる。縦書きは右から読むので、
   本文は右から流れてきて、最後に写真の上を通る。
   写真を右上に置くと、本文が尽きた左下が白いまま残る（実測で紙面の四分の一が空いた） */
export function photoBox(block, headlineWidth, maxWidth = 560) {
  const available = block.right - headlineWidth - GAP - block.left;
  const width = Math.min(maxWidth, available);
  if (width < 200) return null;
  const height = Math.round(width * 0.62);
  return { left: block.left, right: block.left + width, bottom: block.bottom, top: block.bottom - height, width, height };
}

/* 見出しの大きさを字数から決める。決め打ちにすると、短い見出しが小さく、
   長い見出しが行からあふれる。何行に割るかも一緒に返す */
export function fitHeadline(length, height, maxLines, { min = 40, max = 108, charRatio = 1.02 } = {}) {
  let best = { size: min, lines: 1 };
  for (let lines = 1; lines <= maxLines; lines += 1) {
    const perLine = Math.ceil(Math.max(1, length) / lines);
    const size = Math.min(max, Math.floor(height / perLine / charRatio));
    if (size >= min && size > best.size) best = { size, lines };
  }
  return best;
}

/* 本文の大きさを、入る量から決める。短いリードは大きく、長いリードは小さく組む。
   固定サイズにすると、リードが短い日の紙面が真っ白になる */
export function fitSize(units, region, { min = 22, max = 52, lineRatio = 1.62, charRatio = 1.06 } = {}) {
  for (let size = max; size > min; size -= 1) {
    const columns = columnsIn({ ...region, lineGap: size * lineRatio, size });
    const capacity = columns.reduce((sum, column) => sum + Math.floor(column.height / (size * charRatio)), 0);
    if (capacity >= units) return size;
  }
  return min;
}

/* 右から左へ縦の列を作る。写真に重なる列は写真の手前で止める（L字に回り込ませる） */
export function columnsIn({ right, left, top, bottom, lineGap, size, avoid = null }) {
  const columns = [];
  for (let x = right - size / 2; x - size / 2 >= left - 0.5; x -= lineGap) {
    const overlaps = avoid && x <= avoid.right && x >= avoid.left;
    const end = overlaps ? avoid.top - GAP : bottom;
    const height = end - top;
    if (height >= size) columns.push({ x, top, height });
  }
  return columns;
}
