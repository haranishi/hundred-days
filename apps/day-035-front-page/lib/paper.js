/* 紙面をCanvasに刷る。座標はすべて紙面座標（1080×1528）で、
   倍率は ctx を拡大して掛ける。保存用に2倍で刷り直しても、同じ関数で同じ紙面になる。 */

import { PAPER, MASTHEAD, RULE_Y, BODY, FOOTER, SOLO, blocks, photoBox, columnsIn, fitSize, fitHeadline } from './layout.js';
import { toCells, totalAdvance, flowColumns, layoutVertical } from './vertical.js';
import { halftoneDots, coverRect } from './halftone.js';

export const COLORS = {
  paper: '#f4efe4',
  ink: '#1b1b1b',
  rule: '#2b2b2b',
  faint: '#6f6656'
};

/* 明朝で組む。埋め込みフォントは持たない（依存ゼロ）ので、端末にあるものから順に当てる */
export const FONT = '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", "MS PMincho", serif';

export const MASTHEAD_TITLE = '一面新聞';
const GAP_X = 32;
export const DISCLAIMER = 'この紙面は個人が作った架空のものです。記事は各媒体のものです';

function drawGlyphs(ctx, glyphs, color = COLORS.ink, weight = '') {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const glyph of glyphs) {
    ctx.save();
    ctx.translate(glyph.x, glyph.y);
    if (glyph.rotate) ctx.rotate((glyph.rotate * Math.PI) / 180);
    ctx.font = `${weight}${glyph.size}px ${FONT}`;
    ctx.fillText(glyph.text, 0, 0);
    ctx.restore();
  }
}

function line(ctx, x1, y1, x2, y2, width = 1, color = COLORS.rule) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/* 題字は横組み。字間を空けると新聞の題字らしくなる */
function drawMasthead(ctx, { issue, date }) {
  const size = 66;
  const tracking = size * 0.18;
  const chars = [...MASTHEAD_TITLE];
  const totalWidth = chars.length * size + (chars.length - 1) * tracking;
  let x = PAPER.width - PAPER.margin - totalWidth + size / 2;
  const y = MASTHEAD.top + MASTHEAD.height / 2;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const ch of chars) {
    ctx.font = `${size}px ${FONT}`;
    ctx.fillText(ch, x, y);
    x += size + tracking;
  }
  ctx.textAlign = 'left';
  ctx.font = `24px ${FONT}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(date, PAPER.margin, y - 16);
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = COLORS.faint;
  ctx.fillText(issue, PAPER.margin, y + 18);
  line(ctx, PAPER.margin, RULE_Y, PAPER.width - PAPER.margin, RULE_Y, 3);
  line(ctx, PAPER.margin, RULE_Y + 7, PAPER.width - PAPER.margin, RULE_Y + 7, 1);
}

function drawFooter(ctx, hosts) {
  line(ctx, PAPER.margin, FOOTER.rule, PAPER.width - PAPER.margin, FOOTER.rule, 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.faint;
  ctx.font = `20px ${FONT}`;
  const source = hosts.length ? `出典　${hosts.join('　')}` : '出典　—';
  ctx.fillText(source, PAPER.margin, FOOTER.text);
  ctx.font = `18px ${FONT}`;
  ctx.fillText(DISCLAIMER, PAPER.margin, FOOTER.text + 28);
}

/* 写真を網点にして置く。元の画像は消して、点だけを紙に刷る */
function drawPhoto(ctx, image, box, makeCanvas) {
  const off = makeCanvas(box.width, box.height);
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, box.width, box.height);
  const fit = coverRect({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }, box);
  offCtx.drawImage(image, fit.x, fit.y, fit.width, fit.height);
  const data = offCtx.getImageData(0, 0, box.width, box.height);
  const dots = halftoneDots(data, { cell: 4 });
  ctx.save();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  for (const dot of dots) {
    ctx.moveTo(box.left + dot.x + dot.r, box.top + dot.y);
    ctx.arc(box.left + dot.x, box.top + dot.y, dot.r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

/* 写真の下に横組みで入れる短い行。新聞のキャプションの位置。
   どこで全文が読めるかを紙の上に残す（画像だけが出回っても出所が消えない） */
function captionText(article) {
  const where = article.host ? `全文は ${article.host} で読めます` : '';
  return [where, article.publishedAt].filter(Boolean).join('　');
}

/* キャプションは写真の上に置く。下に置くと紙面の下端でフッターの罫線と噛み合う */
function drawCaption(ctx, text, box) {
  if (!text) return;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.faint;
  ctx.font = `19px ${FONT}`;
  ctx.fillText(text, box.left, box.top - 10, box.width);
  ctx.restore();
}

/* 1本だけの紙面。上の帯に見出しと本文、下の帯に写真を全幅で置く */
function drawSolo(ctx, article, makeCanvas) {
  const right = PAPER.width - PAPER.margin;
  const left = PAPER.margin;
  const hasPhoto = Boolean(article.imageEl);
  const bottom = hasPhoto ? SOLO.text.bottom : BODY.bottom;
  const fit = fitHeadline([...article.headline].length, bottom - BODY.top, 3, { min: 44, max: 108 });
  const headline = layoutVertical(article.headline, {
    right,
    top: BODY.top,
    height: bottom - BODY.top,
    size: fit.size,
    charGap: fit.size * 1.02,
    lineGap: fit.size * 1.32,
    maxLines: fit.lines
  });
  drawGlyphs(ctx, headline.glyphs, COLORS.ink, 'bold ');

  const region = { right: right - headline.width - GAP_X, left, top: BODY.top, bottom };
  const text = hasPhoto ? article.lead : [article.lead, article.site && `（${article.site}）`].filter(Boolean).join('');
  const cells = toCells(text);
  const size = fitSize(totalAdvance(cells), region, { min: 26, max: 46 });
  const columns = columnsIn({ ...region, lineGap: size * 1.62, size });
  drawGlyphs(ctx, flowColumns(cells, columns, { size, charGap: size * 1.06, ellipsis: true }).glyphs);

  if (!hasPhoto) return;
  const box = { left, right, top: SOLO.photo.top, bottom: SOLO.photo.bottom, width: right - left, height: SOLO.photo.bottom - SOLO.photo.top };
  drawPhoto(ctx, article.imageEl, box, makeCanvas);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.faint;
  ctx.font = `21px ${FONT}`;
  ctx.fillText(captionText(article), left, SOLO.caption, box.width);
  ctx.restore();
}

function drawArticle(ctx, article, block, makeCanvas) {
  const headlineHeight = Math.min(block.bottom - block.top, block.headlineSize * (block.index === 0 ? 11 : 14));
  const fit = fitHeadline([...article.headline].length, headlineHeight, block.headlineLines, {
    min: Math.round(block.headlineSize * 0.7),
    max: block.headlineSize
  });
  const headline = layoutVertical(article.headline, {
    right: block.right,
    top: block.top,
    height: headlineHeight,
    size: fit.size,
    charGap: fit.size * 1.02,
    lineGap: fit.size * 1.34,
    maxLines: fit.lines
  });
  drawGlyphs(ctx, headline.glyphs, COLORS.ink, 'bold ');

  const photo = block.photo && article.imageEl
    ? photoBox(block, headline.width, block.index === 0 ? 560 : 360)
    : null;
  if (photo) drawPhoto(ctx, article.imageEl, photo, makeCanvas);

  const region = {
    right: block.right - headline.width - 18,
    left: block.left,
    top: block.top,
    bottom: photo ? block.bottom : block.bottom,
    avoid: photo
  };
  const showCaption = Boolean(photo);
  const leadText = showCaption
    ? article.lead
    : [article.lead, article.site && `（${article.site}）`].filter(Boolean).join('');
  const cells = toCells(leadText);
  const size = fitSize(totalAdvance(cells), region, {
    min: block.index === 0 ? 26 : 18,
    max: block.index === 0 ? 40 : 27
  });
  const columns = columnsIn({ ...region, lineGap: size * 1.62, size });
  const lead = flowColumns(cells, columns, { size, charGap: size * 1.06, ellipsis: true });
  drawGlyphs(ctx, lead.glyphs);
  if (photo) drawCaption(ctx, captionText(article), photo);
}

function drawEmptyBody(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.faint;
  ctx.font = `30px ${FONT}`;
  ctx.fillText('リンクを貼ると、ここが一面になります', PAPER.width / 2, BODY.top + 260);
  for (let i = 0; i < 6; i += 1) {
    const x = PAPER.width - PAPER.margin - 60 - i * 150;
    line(ctx, x, BODY.top + 420, x, BODY.bottom, 1, '#d8d0be');
  }
}

export function renderPaper(canvas, model, { scale = 1, makeCanvas } = {}) {
  const factory = makeCanvas || ((w, h) => {
    const element = document.createElement('canvas');
    element.width = Math.max(1, Math.round(w));
    element.height = Math.max(1, Math.round(h));
    return element;
  });
  canvas.width = Math.round(PAPER.width * scale);
  canvas.height = Math.round(PAPER.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, PAPER.width, PAPER.height);
  drawMasthead(ctx, model);

  const articles = model.articles ?? [];
  if (!articles.length) {
    drawEmptyBody(ctx);
  } else if (articles.length === 1) {
    drawSolo(ctx, articles[0], factory);
  } else {
    const list = blocks(articles.length);
    articles.forEach((article, index) => {
      const block = list[index];
      if (!block) return;
      drawArticle(ctx, article, block, factory);
      if (index < articles.length - 1) {
        line(ctx, block.left - 9, BODY.top, block.left - 9, BODY.bottom, 1, '#b9b0a0');
      }
    });
  }
  drawFooter(ctx, articles.map((a) => a.host).filter(Boolean));
  return canvas;
}
