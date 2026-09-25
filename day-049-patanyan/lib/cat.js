import { ellipsePath, circlePath, starPath, spiralPath, roundRectPath, lerp } from './draw.js';

// 柄は「同じ形の上に模様の塗りを重ねる」方式。形は1つなので、どの柄でも動きと当たり判定の見え方が同じになる
export const PATTERNS = Object.freeze({
  chatora: { base: '#f4a55b', dark: '#cf7733', light: '#fff1dc', paw: '#fff1dc', ear: '#f7b3ac', tail: 'stripe', line: '#4b2f26', mouth: '#4b2f26', eye: 'dark' },
  hachiware: { base: '#fffaf2', dark: '#36313c', light: '#fffaf2', paw: '#fffaf2', ear: '#f5b3b8', tail: 'dark', line: '#3a2b2b', mouth: '#3a2b2b', eye: 'dark', rim: true },
  kuro: { base: '#35313b', dark: '#28242d', light: '#4d4757', paw: '#35313b', ear: '#d98c9c', tail: 'base', line: '#b8abc9', mouth: '#f3e8de', eye: 'amber' },
  shiro: { base: '#fffdf7', dark: '#efe5d8', light: '#fffdf7', paw: '#fffdf7', ear: '#f7b5ba', tail: 'base', line: '#5b463f', mouth: '#5b463f', eye: 'dark' },
  sabatora: { base: '#bdbab3', dark: '#66646b', light: '#f8f5ef', paw: '#f8f5ef', ear: '#efb2b3', tail: 'stripe', line: '#393337', mouth: '#393337', eye: 'dark' },
  mike: { base: '#fffaf2', dark: '#3a3440', orange: '#ee994a', light: '#fffaf2', paw: '#fffaf2', ear: '#f7b3b3', tail: 'mike', line: '#4a352f', mouth: '#4a352f', eye: 'dark' },
});

const SIL = '#2d2640';
const HEAD = { x: 1.5, y: -4, rx: 14.5, ry: 12.5 };
const EAR_L = [[-11.8, -9.6], [-11.8, -23.5], [-4.2, -15.6]];
const EAR_R = [[7.4, -15.8], [15.4, -23.5], [15.2, -9.6]];
const EYE_L = [-3.2, -3.3];
const EYE_R = [8.2, -3.3];
const NOSE = [2.5, 1.2];
// 座った時の最下点。game.js の CRASH.sitOffset と合わせる（地面にめり込まず浮かない）
export const SIT_BOTTOM = 19.5;

function paint(ctx, fill, P, sil, lw = 1.5) {
  ctx.fillStyle = sil ? SIL : fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = sil ? SIL : P.line;
  ctx.stroke();
}

function clipped(ctx, pathFn, drawFn) {
  ctx.save();
  ctx.beginPath();
  pathFn(ctx);
  ctx.clip();
  drawFn();
  ctx.restore();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}

function headPath(ctx) {
  ellipsePath(ctx, HEAD.x, HEAD.y, HEAD.rx, HEAD.ry);
}

function earPath(ctx, e, k = 1, lift = 0) {
  const [a, tip, b] = e;
  const mx = (a[0] + b[0]) / 2 + (tip[0] - (a[0] + b[0]) / 2) * lift;
  const my = (a[1] + b[1]) / 2 + (tip[1] - (a[1] + b[1]) / 2) * lift;
  const s = (p) => [mx + (p[0] - mx) * k, my + (p[1] - my) * k];
  const A = s(a);
  const T = s(tip);
  const B = s(b);
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(lerp(A[0], T[0], 0.75), lerp(A[1], T[1], 0.75));
  ctx.quadraticCurveTo(T[0], T[1], lerp(B[0], T[0], 0.75), lerp(B[1], T[1], 0.75));
  ctx.lineTo(B[0], B[1]);
  ctx.closePath();
}

function earColors(P, id) {
  if (id === 'hachiware') return [P.dark, P.dark];
  if (id === 'mike') return [P.orange, P.dark];
  return [P.base, P.base];
}

function drawEars(ctx, P, id, sil) {
  const [cl, cr] = earColors(P, id);
  for (const [e, c] of [[EAR_L, cl], [EAR_R, cr]]) {
    ctx.beginPath();
    earPath(ctx, e);
    paint(ctx, c, P, sil);
    if (!sil) {
      ctx.beginPath();
      earPath(ctx, e, 0.55, 0.22);
      ctx.fillStyle = P.ear;
      ctx.fill();
    }
  }
}

function stripesHead(ctx, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  line(ctx, -2.8, -16.8, -2, -11.5);
  line(ctx, 1.6, -17.6, 1.6, -10.2);
  line(ctx, 6, -16.8, 5.2, -11.5);
  ctx.stroke();
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  line(ctx, -13.8, -3.6, -10, -2.7);
  line(ctx, -14, 0, -10.4, 0.4);
  line(ctx, 16.8, -3.6, 13, -2.7);
  line(ctx, 17, 0, 13.4, 0.4);
  ctx.stroke();
}

function muzzle(ctx, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ellipsePath(ctx, 2.5, 3, 7, 4.6);
  ctx.fill();
}

const HEAD_MARKS = {
  chatora(ctx, P) {
    stripesHead(ctx, P.dark);
    muzzle(ctx, P.light);
  },
  sabatora(ctx, P) {
    stripesHead(ctx, P.dark);
    muzzle(ctx, P.light);
  },
  hachiware(ctx, P) {
    ctx.fillStyle = P.dark;
    ctx.fillRect(-20, -26, 45, 40);
    ctx.fillStyle = P.light;
    ctx.beginPath();
    ctx.moveTo(2.2, -18);
    ctx.lineTo(-11, 5.5);
    ctx.lineTo(-18, 12);
    ctx.lineTo(22, 12);
    ctx.lineTo(15.5, 5.5);
    ctx.closePath();
    ctx.fill();
  },
  kuro(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    ellipsePath(ctx, -3, -11, 8, 4.5, -0.3);
    ctx.fill();
  },
  shiro(ctx, P) {
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    ellipsePath(ctx, 1.5, 9.5, 14, 4);
    ctx.fill();
  },
  mike(ctx, P) {
    ctx.fillStyle = P.orange;
    ctx.beginPath();
    ellipsePath(ctx, -9.5, -12, 10, 8, 0.3);
    ctx.fill();
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    ellipsePath(ctx, 14.5, -14, 7.5, 6.5, -0.2);
    ctx.fill();
  },
};

const BODY_MARKS = {
  chatora(ctx, P, sit) {
    ctx.strokeStyle = P.dark;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    if (sit) {
      line(ctx, -8.5, 1, -9.5, 7);
      line(ctx, 8.5, 1, 9.5, 7);
    } else {
      line(ctx, -10, 2.8, -10.5, 8.5);
      line(ctx, -5.5, 2.4, -6, 8);
      line(ctx, -1, 2.6, -1.4, 7.5);
    }
    ctx.stroke();
    ctx.fillStyle = P.light;
    ctx.beginPath();
    ellipsePath(ctx, sit ? 1.5 : 3.5, sit ? 10 : 11.5, 5.5, sit ? 7 : 5.5);
    ctx.fill();
  },
  sabatora(ctx, P, sit) {
    BODY_MARKS.chatora(ctx, P, sit);
  },
  hachiware(ctx, P, sit) {
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    if (sit) {
      ellipsePath(ctx, -10, 5, 6, 9);
      ellipsePath(ctx, 11, 5, 6, 9);
    } else ellipsePath(ctx, -10, 7, 8.5, 9);
    ctx.fill();
  },
  kuro() {},
  shiro() {},
  mike(ctx, P, sit) {
    ctx.fillStyle = P.orange;
    ctx.beginPath();
    ellipsePath(ctx, sit ? -8 : -9, sit ? 4 : 7, 6.5, 5.5);
    ctx.fill();
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    ellipsePath(ctx, sit ? 8 : -1, sit ? 12 : 16, 5, 3.8);
    ctx.fill();
  },
};

function tailColor(P) {
  if (P.tail === 'dark') return P.dark;
  if (P.tail === 'mike') return P.orange;
  return P.base;
}

function drawTail(ctx, P, sil, base, ctrl, end, sway) {
  const rot = (p) => {
    const dx = p[0] - base[0];
    const dy = p[1] - base[1];
    const c = Math.cos(sway);
    const s = Math.sin(sway);
    return [base[0] + dx * c - dy * s, base[1] + dx * s + dy * c];
  };
  const C = rot(ctrl);
  const E = rot(end);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(base[0], base[1]);
    ctx.quadraticCurveTo(C[0], C[1], E[0], E[1]);
  };
  ctx.lineCap = 'round';
  path();
  ctx.strokeStyle = sil ? SIL : P.line;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = sil ? SIL : tailColor(P);
  ctx.lineWidth = 5;
  ctx.stroke();
  if (sil) return;
  if (P.tail === 'stripe') {
    ctx.setLineDash([2.4, 3]);
    ctx.strokeStyle = P.dark;
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (P.tail === 'mike') {
    // 先だけ黒。二次曲線の終わり2割を描き直す
    const q = (t) => [
      (1 - t) * (1 - t) * base[0] + 2 * (1 - t) * t * C[0] + t * t * E[0],
      (1 - t) * (1 - t) * base[1] + 2 * (1 - t) * t * C[1] + t * t * E[1],
    ];
    ctx.beginPath();
    const a = q(0.72);
    ctx.moveTo(a[0], a[1]);
    for (let i = 1; i <= 6; i += 1) {
      const p = q(0.72 + (0.28 * i) / 6);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.strokeStyle = P.dark;
    ctx.stroke();
  }
}

function drawPaw(ctx, P, sil, sx, sy, angle, len = 9.5) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  ctx.beginPath();
  roundRectPath(ctx, -3, -3, len + 3, 6, 3);
  paint(ctx, P.paw, P, sil, 1.4);
  if (!sil) {
    ctx.fillStyle = '#f597ab';
    ctx.beginPath();
    circlePath(ctx, len - 2.6, 0, 1.45);
    ctx.fill();
  }
  ctx.restore();
}

function eyeDark(ctx, x, y, P) {
  ctx.fillStyle = '#2a1c19';
  ctx.beginPath();
  ellipsePath(ctx, x, y, 2.7, 3.5);
  ctx.fill();
  if (P.rim) {
    ctx.strokeStyle = 'rgba(255,250,240,0.95)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ellipsePath(ctx, x, y, 3.3, 4.1);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  circlePath(ctx, x + 0.9, y - 1.3, 1.15);
  circlePath(ctx, x - 0.9, y + 1.3, 0.55);
  ctx.fill();
}

function eyeAmber(ctx, x, y) {
  ctx.fillStyle = '#f5c34e';
  ctx.beginPath();
  ellipsePath(ctx, x, y, 2.9, 3.6);
  ctx.fill();
  ctx.strokeStyle = '#1b1720';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = '#1b1720';
  ctx.beginPath();
  ellipsePath(ctx, x, y, 1.2, 3);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  circlePath(ctx, x + 0.9, y - 1.4, 0.95);
  ctx.fill();
}

function drawEyes(ctx, P, face, t) {
  const eyes = [EYE_L, EYE_R];
  ctx.lineCap = 'round';
  if (face === 'dizzy') {
    ctx.strokeStyle = P.mouth === '#f3e8de' ? '#f3e8de' : '#2a1c19';
    ctx.lineWidth = 1;
    ctx.beginPath();
    spiralPath(ctx, EYE_L[0], EYE_L[1], 3.4, t * 9);
    spiralPath(ctx, EYE_R[0], EYE_R[1], 3.4, t * 9);
    ctx.stroke();
    return;
  }
  if (face === 'happy' || face === 'blink') {
    ctx.strokeStyle = P.eye === 'amber' ? '#f5c34e' : '#2a1c19';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x, y] of eyes) {
      if (face === 'happy') {
        ctx.moveTo(x - 2.7, y + 0.8);
        ctx.quadraticCurveTo(x, y - 3.4, x + 2.7, y + 0.8);
      } else {
        ctx.moveTo(x - 2.7, y);
        ctx.quadraticCurveTo(x, y + 2.2, x + 2.7, y);
      }
    }
    ctx.stroke();
    return;
  }
  if (face === 'surprised') {
    for (const [x, y] of eyes) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      circlePath(ctx, x, y, 3.3);
      ctx.fill();
      ctx.strokeStyle = '#2a1c19';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.fillStyle = '#2a1c19';
      ctx.beginPath();
      circlePath(ctx, x, y + 0.3, 1.5);
      ctx.fill();
    }
    return;
  }
  if (face === 'grumpy') {
    // むすっ：上まぶたを平らに下ろしたジト目。眉間側へ少し下げて、すねている顔にする
    for (const [x, y, side] of [[EYE_L[0], EYE_L[1], 1], [EYE_R[0], EYE_R[1], -1]]) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 0.6 + side * 0.6);
      ctx.lineTo(x + 4, y - 0.6 - side * 0.6);
      ctx.lineTo(x + 4, y + 5);
      ctx.lineTo(x - 4, y + 5);
      ctx.closePath();
      ctx.clip();
      if (P.eye === 'amber') eyeAmber(ctx, x, y);
      else eyeDark(ctx, x, y, P);
      ctx.restore();
      ctx.strokeStyle = P.eye === 'amber' ? '#f3e8de' : '#2a1c19';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 3.3, y - 0.6 + side * 0.55);
      ctx.lineTo(x + 3.3, y - 0.6 - side * 0.55);
      ctx.stroke();
    }
    return;
  }
  for (const [x, y] of eyes) {
    if (P.eye === 'amber') eyeAmber(ctx, x, y);
    else eyeDark(ctx, x, y, P);
  }
}

function drawMouth(ctx, P, face) {
  const [x, y] = NOSE;
  ctx.fillStyle = '#f28b9f';
  ctx.beginPath();
  ctx.moveTo(x - 1.7, y - 0.9);
  ctx.lineTo(x + 1.7, y - 0.9);
  ctx.lineTo(x, y + 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = P.mouth;
  ctx.fillStyle = P.mouth;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face === 'surprised') {
    ellipsePath(ctx, x, y + 4, 1.5, 1.8);
    ctx.fill();
    return;
  }
  if (face === 'grumpy') {
    ctx.moveTo(x - 2.5, y + 4.2);
    ctx.lineTo(x, y + 2.7);
    ctx.lineTo(x + 2.5, y + 4.2);
    ctx.stroke();
    return;
  }
  if (face === 'dizzy') {
    ctx.moveTo(x - 3, y + 3.6);
    ctx.quadraticCurveTo(x - 1.5, y + 2.2, x, y + 3.6);
    ctx.quadraticCurveTo(x + 1.5, y + 5, x + 3, y + 3.6);
    ctx.stroke();
    return;
  }
  ctx.moveTo(x, y + 1);
  ctx.arc(x - 1.6, y + 1.3, 1.6, 0, Math.PI, false);
  ctx.moveTo(x + 3.2, y + 1.3);
  ctx.arc(x + 1.6, y + 1.3, 1.6, 0, Math.PI, false);
  ctx.stroke();
  if (face === 'happy') {
    ctx.fillStyle = '#e8687f';
    ctx.beginPath();
    ctx.moveTo(x - 1.6, y + 2.9);
    ctx.quadraticCurveTo(x, y + 6, x + 1.6, y + 2.9);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFace(ctx, P, face, t) {
  const puffed = face === 'grumpy';
  ctx.fillStyle = 'rgba(255,125,150,0.45)';
  ctx.beginPath();
  ellipsePath(ctx, -8.5, 2.7, puffed ? 3.4 : 2.8, puffed ? 2.3 : 1.8);
  ellipsePath(ctx, 13.5, 2.7, puffed ? 3.4 : 2.8, puffed ? 2.3 : 1.8);
  ctx.fill();
  drawEyes(ctx, P, face, t);
  drawMouth(ctx, P, face);
  ctx.strokeStyle = P.line;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  line(ctx, -8.5, 0.8, -18.5, -1.2);
  line(ctx, -8.5, 3.2, -18.5, 4.4);
  line(ctx, 13.5, 0.8, 23, -1.2);
  line(ctx, 13.5, 3.2, 23, 4.4);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHead(ctx, P, id, sil, face, t) {
  drawEars(ctx, P, id, sil);
  ctx.beginPath();
  headPath(ctx);
  ctx.fillStyle = sil ? SIL : P.base;
  ctx.fill();
  if (!sil) clipped(ctx, headPath, () => HEAD_MARKS[id](ctx, P));
  ctx.beginPath();
  headPath(ctx);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = sil ? SIL : P.line;
  ctx.stroke();
  if (!sil) drawFace(ctx, P, face, t);
}

function drawBody(ctx, P, id, sil, sit) {
  const body = (c) => (sit ? ellipsePath(c, 0, 7.5, 10, 10.5) : ellipsePath(c, -2.5, 10, 10, 7.5));
  ctx.beginPath();
  body(ctx);
  ctx.fillStyle = sil ? SIL : P.base;
  ctx.fill();
  if (!sil) clipped(ctx, body, () => BODY_MARKS[id](ctx, P, sit));
  ctx.beginPath();
  body(ctx);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = sil ? SIL : P.line;
  ctx.stroke();
}

function drawStars(ctx, t) {
  for (let i = 0; i < 3; i += 1) {
    const a = t * 5 + (i * Math.PI * 2) / 3;
    const depth = Math.sin(a);
    const x = 1.5 + Math.cos(a) * 14;
    const y = -25 + depth * 3.5;
    ctx.beginPath();
    starPath(ctx, x, y, depth > 0 ? 3.4 : 2.6, a);
    ctx.fillStyle = '#ffd95a';
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = '#a8762a';
    ctx.stroke();
  }
}

function drawPuff(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(80,60,70,0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  circlePath(ctx, 21, -13, 2.6);
  circlePath(ctx, 23.8, -15.6, 2.1);
  circlePath(ctx, 19.2, -16.4, 1.9);
  ctx.fill();
  ctx.stroke();
}

/**
 * o: { x, y, scale, pattern, pose: 'fly'|'sit', face, paw(0=下..1=上), tail(揺れ角), angle, sx, sy, t, stars, puff, silhouette }
 */
export function drawCat(ctx, o) {
  const id = PATTERNS[o.pattern] ? o.pattern : 'chatora';
  const P = PATTERNS[id];
  const sil = !!o.silhouette;
  const sit = o.pose === 'sit';
  const t = o.t || 0;
  const face = o.face || 'normal';
  ctx.save();
  ctx.translate(o.x || 0, o.y || 0);
  const k = o.scale || 1;
  if (k !== 1) ctx.scale(k, k);
  ctx.save();
  if (o.angle) ctx.rotate(o.angle);
  if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const sway = o.tail || 0;
  if (sit) {
    drawTail(ctx, P, sil, [-7.5, 14], [-22, 17], [-20.5, 1], sway);
    for (const [x, y] of [[-8.5, 14.5], [9, 14.5]]) {
      ctx.beginPath();
      ellipsePath(ctx, x, y, 4.8, 4);
      paint(ctx, P.base, P, sil, 1.4);
    }
    drawBody(ctx, P, id, sil, true);
    for (const [x, y] of [[-2.5, 17.1], [5.5, 17.1]]) {
      ctx.beginPath();
      ellipsePath(ctx, x, y, 3.3, 2.4);
      paint(ctx, P.paw, P, sil, 1.3);
    }
    drawHead(ctx, P, id, sil, face, t);
  } else {
    drawTail(ctx, P, sil, [-10.5, 11], [-21, 13], [-22.5, 1.5], sway);
    for (const [x, y] of [[-9.5, 15.5], [1, 16.5]]) {
      ctx.beginPath();
      ellipsePath(ctx, x, y, 4, 3);
      paint(ctx, P.base, P, sil, 1.3);
    }
    drawBody(ctx, P, id, sil, false);
    const u = Math.max(0, Math.min(1, o.paw || 0));
    const aR = lerp(1.2, -0.62, u);
    drawPaw(ctx, P, sil, -7.5, 5.5, Math.PI - aR);
    drawPaw(ctx, P, sil, 8.5, 5.5, aR);
    drawHead(ctx, P, id, sil, face, t);
  }
  if (o.puff && !sil) drawPuff(ctx);
  ctx.restore();
  if (o.stars && !sil) drawStars(ctx, t);
  ctx.restore();
}
