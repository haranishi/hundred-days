'use strict';

/* その写真、何色でできてる？ — Day 005
   外部通信なし / 外部ライブラリなし / 保存なし。画像はこのページのDOMとcanvasの中だけで扱う。

   設計メモ:
    - 読み込んだファイルは object URL ではなく data URL に統一している。file:// で直接開いたときに
      canvas が汚染されて getImageData が失敗する環境を避けるため（デモ録画は file:// で行う）。
    - サンプル3枚は画像ファイルを同梱せず、押されたときにcanvasへ描く（他人の写真もEXIFも持ち込まない）。
      乱数は固定シードの mulberry32 なので、何度押しても同じ絵・同じパレットになる。 */

const MAX_SIDE = 120;     // 抽出前にこの長辺まで縮小する
const ALPHA_MIN = 128;    // これより薄い画素は数えない
const COLOR_COUNT = 6;    // 取り出す色数（固定）
const TOAST_MS = 1800;    // 「コピーしました」を出しておく時間（デモの1.5秒の間は消えないように）
const SAMPLE_W = 600;
const SAMPLE_H = 450;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 色の計算

const hex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const toHex = (rgb) => '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]);
// カンマの後に空白を入れない。3列に並べたときスウォッチの幅では折り返してしまうため
const toRgbText = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

/** WCAGの相対輝度。sRGBをリニアに戻してから重みを掛ける。 */
function relativeLuminance(rgb) {
  const lin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** 色面に乗せる文字色。明るい色には黒、暗い色には白。 */
const textColorOn = (rgb) => (relativeLuminance(rgb) > 0.4 ? '#000000' : '#FFFFFF');

// ---------------------------------------------------------------- 抽出

/**
 * 画像を最大辺 MAX_SIDE まで縮小し、透けていない画素の [r,g,b] を並べて返す。
 * @param {HTMLImageElement|HTMLCanvasElement} source
 */
function samplePixels(source, srcW, srcH) {
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // 大きく縮めるので、間引きではなく平均に近い縮小をさせる（拾う色が偏らないように）
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h).data;
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < ALPHA_MIN) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  return pixels;
}

/** 箱ひとつ分の統計。axis はいちばん色幅の広いチャネル、priority は分割の優先度。 */
function makeBox(pixels) {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  const sum = [0, 0, 0];

  for (const p of pixels) {
    for (let c = 0; c < 3; c++) {
      if (p[c] < min[c]) min[c] = p[c];
      if (p[c] > max[c]) max[c] = p[c];
      sum[c] += p[c];
    }
  }

  const spread = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  let axis = 0;
  if (spread[1] > spread[axis]) axis = 1;
  if (spread[2] > spread[axis]) axis = 2;

  const count = pixels.length;
  return {
    pixels,
    axis,
    count,
    spread: spread[axis],
    priority: count * spread[axis],
    color: [Math.round(sum[0] / count), Math.round(sum[1] / count), Math.round(sum[2] / count)]
  };
}

/**
 * メディアンカット法。全画素を1つの箱から始めて、「画素数 × 色幅」がいちばん大きい箱を
 * その軸の中央値で2つに割り続け、箱ごとの平均色を占有率の降順で返す。
 */
function medianCut(pixels, want) {
  if (!pixels.length) return [];
  const boxes = [makeBox(pixels)];

  while (boxes.length < want) {
    let target = -1;
    for (let i = 0; i < boxes.length; i++) {
      // 画素が2個未満、または全画素が同じ色（色幅0）の箱は、割っても色が増えない
      if (boxes[i].count < 2 || boxes[i].spread === 0) continue;
      if (target < 0 || boxes[i].priority > boxes[target].priority) target = i;
    }
    if (target < 0) break;  // これ以上割れる箱がない＝6色に届かないまま終わる

    const box = boxes[target];
    const sorted = box.pixels.slice().sort((a, b) => a[box.axis] - b[box.axis]);
    const mid = sorted.length >> 1;
    boxes.splice(target, 1, makeBox(sorted.slice(0, mid)), makeBox(sorted.slice(mid)));
  }

  /* 平均色が丸めた結果まったく同じになった箱はまとめる。
     写真ではまず起きないが、べた塗りの画像やスクリーンショットでは
     「純色だけの箱」と「純色＋境界のわずかな画素の箱」が同じHEXになり、
     同じ色のスウォッチが2枚並んでしまう。 */
  const merged = new Map();
  for (const box of boxes) {
    const key = toHex(box.color);
    const found = merged.get(key);
    if (found) found.count += box.count;
    else merged.set(key, { rgb: box.color, count: box.count });
  }

  return [...merged.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------- サンプルの描画

/** mulberry32。シードを固定すれば毎回まったく同じ並びを返す。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 起伏のあるシルエットを1枚。baseYより下も塗るので、あとで海を重ねれば山だけが残る。 */
function ridge(ctx, rnd, w, baseY, peak, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-20, baseY + 60);
  for (let x = -20; x <= w + 40; x += 38) {
    ctx.lineTo(x, baseY - peak * (0.3 + rnd() * 0.7));
  }
  ctx.lineTo(w + 40, baseY + 60);
  ctx.closePath();
  ctx.fill();
}

function drawSunset(ctx, rnd, w, h) {
  const horizon = Math.round(h * 0.6);

  // 空。上は紫、地平線に近づくほどピンク→オレンジに焼ける
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2B2150');
  sky.addColorStop(0.32, '#763879');
  sky.addColorStop(0.58, '#D2496C');
  sky.addColorStop(0.82, '#F2854A');
  sky.addColorStop(1, '#FFC172');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  /* 地平線ぎわの黄金色の帯。グラデーションの終端だけでは面積が取れず、
     縮小したあとのパレットに暖色が1色も残らないので、別に広く敷く。 */
  const glowBand = ctx.createLinearGradient(0, horizon - 96, 0, horizon);
  glowBand.addColorStop(0, 'rgba(255,190,110,0)');
  glowBand.addColorStop(0.6, 'rgba(255,203,124,.55)');
  glowBand.addColorStop(1, 'rgba(255,216,146,.95)');
  ctx.fillStyle = glowBand;
  ctx.fillRect(0, horizon - 96, w, 96);

  // 太陽。にじみを先に敷いてから本体を置く
  const sx = w * 0.66;
  const sy = horizon - 46;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 140);
  glow.addColorStop(0, 'rgba(255,242,198,.95)');
  glow.addColorStop(0.34, 'rgba(255,198,122,.5)');
  glow.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = '#FFF6D8';
  ctx.beginPath();
  ctx.arc(sx, sy, 34, 0, TAU);
  ctx.fill();

  // 雲。高いところは紫のまま、低いところは光を受けてオレンジになる
  for (let i = 0; i < 10; i++) {
    const cy = 24 + rnd() * (horizon - 86);
    const t = cy / horizon;
    ctx.fillStyle = `rgba(${Math.round(148 + 105 * t)},${Math.round(88 + 84 * t)},${Math.round(152 - 62 * t)},${(0.18 + rnd() * 0.3).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * w, cy, (60 + rnd() * 150) / 2, (5 + rnd() * 11) / 2, 0, 0, TAU);
    ctx.fill();
  }

  // 山のシルエット（遠い方が明るい）
  ridge(ctx, rnd, w, horizon - 4, 36, '#4A2A55');
  ridge(ctx, rnd, w, horizon, 22, '#241635');

  // 海。水際は空の金色を映し、手前へいくほど暗い紫に落ちる
  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, '#DE8659');
  sea.addColorStop(0.2, '#B2545C');
  sea.addColorStop(0.56, '#6B2F52');
  sea.addColorStop(1, '#1A1130');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, h - horizon);

  // 太陽の道。手前にくるほど幅広く、淡く散る
  for (let y = horizon + 2; y < h; y += 4) {
    const t = (y - horizon) / (h - horizon);
    const half = 14 + t * 46;
    const bw = 10 + rnd() * half;
    ctx.fillStyle = `rgba(255,214,160,${(0.4 * (1 - t) + 0.06).toFixed(3)})`;
    ctx.fillRect(sx - bw / 2 + (rnd() - 0.5) * half * 0.7, y, bw, 1.5 + rnd() * 2);
  }
}

function drawGreen(ctx, rnd, w, h) {
  // 下地。上は日の当たる若葉、下は林床の影
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#93C63F');
  base.addColorStop(0.34, '#4E9433');
  base.addColorStop(0.74, '#245A28');
  base.addColorStop(1, '#12331C');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 幹。緑だけだと単調なので、暗い茶を2本入れて奥行きを作る
  ctx.fillStyle = 'rgba(56,38,23,.88)';
  for (const [x, tw] of [[112, 27], [432, 19]]) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + tw, h);
    ctx.lineTo(x + tw * 0.6 + 16, 0);
    ctx.lineTo(x + 12, 0);
    ctx.closePath();
    ctx.fill();
  }

  // 葉のかたまり。下にいくほど暗い緑を選び、重ねて茂りにする
  const LEAF = ['#B4D94E', '#7CBB3E', '#3F8A2E', '#256130', '#153E1E'];
  for (let i = 0; i < 170; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const pick = Math.min(LEAF.length - 1, Math.floor((y / h) * 3 + rnd() * 2.4));
    ctx.globalAlpha = 0.32 + rnd() * 0.46;
    ctx.fillStyle = LEAF[pick];
    ctx.beginPath();
    ctx.ellipse(x, y, 14 + rnd() * 38, 6 + rnd() * 15, rnd() * Math.PI, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* 斜めに差し込む光の筋と木漏れ日の光斑。
     ふつうに白を重ねると緑が白ちゃけて霧のように見えるので、加算（lighter）で光を足す。 */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  ctx.translate(w * 0.08, 0);
  ctx.rotate(-0.26);
  for (let i = 0; i < 5; i++) {
    const bx = i * 98 + rnd() * 44;
    const beam = ctx.createLinearGradient(bx, -90, bx, h + 170);
    beam.addColorStop(0, 'rgba(150,160,60,.5)');
    beam.addColorStop(1, 'rgba(120,150,40,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(bx, -90, 16 + rnd() * 34, h + 260);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (let i = 0; i < 48; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.96;
    const r = 5 + rnd() * 20;
    const spot = ctx.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, 'rgba(210,220,150,.9)');
    spot.addColorStop(0.45, 'rgba(150,190,60,.34)');
    spot.addColorStop(1, 'rgba(120,170,40,0)');
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* 夜の街のネオン。累積の重みで引く（ピンクとシアンを多めに灯す）。 */
const NEON = ['#FF3D8B', '#2FDCF2', '#FFB13C', '#F4EEFF'];  // ピンク・シアン・アンバー・白
const NEON_STOPS = [0.3, 0.68, 0.9, 1];
const THEME_STOPS = [0.32, 0.74, 1];

function pick(list, stops, rnd) {
  const r = rnd();
  for (let i = 0; i < stops.length; i++) {
    if (r < stops[i]) return list[i];
  }
  return list[0];
}

const pickNeon = (rnd) => pick(NEON, NEON_STOPS, rnd);

/** 1棟ぶんの色。白は1棟まるごとだと面積を食いすぎるので、テーマからは外す。 */
const pickTheme = (rnd) => pick(NEON, THEME_STOPS, rnd);

/**
 * ビルの窓を灯す。窓を大きく取り、1棟の中では同じ色に寄せている。
 * 細かく別の色を散らすと、120pxに縮めた時点で隣の色と混ざって濁った紫にしかならない。
 */
function lightWindows(ctx, rnd, layer, bx, top, bw, h, theme) {
  const ww = layer.cell - 4;
  const wh = layer.cell - 3;
  ctx.save();
  for (let y = top + 7; y < h - 10; y += layer.cell + 2) {
    for (let x = bx + 4; x + ww < bx + bw - 2; x += layer.cell) {
      if (rnd() > layer.density) continue;
      const color = rnd() < 0.8 ? theme : pickNeon(rnd);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = layer.glow;
      ctx.globalAlpha = layer.alpha * (0.82 + rnd() * 0.18);
      ctx.fillRect(x, y, ww, wh);
    }
  }
  ctx.restore();
}

/**
 * ビルの壁に貼る大きなネオン看板。偶数回は壁いっぱいの大型ビジョン、奇数回は縦看板。
 * 大型ビジョンを入れているのは、窓の点々だけでは縮小したときに色が残らないから。
 */
function neonSign(ctx, rnd, color, bx, top, bw, h, index) {
  const wide = index % 2 === 0;
  const y = top + 14 + rnd() * 20;
  const x = wide ? bx + 5 : bx + bw * 0.5 - 17;
  const sw = wide ? bw - 10 : 34;
  const sh = wide ? Math.min(116, h - y - 92) : Math.min(172, h - y - 78);
  if (sw < 18 || sh < 34) return;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, sw, sh);

  // 白い芯を通すと発光して見える。大型ビジョンは文字列に見えるよう3本に分ける
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#FFFFFF';
  if (wide) {
    const row = sh * 0.12;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x + 9, y + sh * (0.2 + i * 0.24), (sw - 18) * (0.55 + rnd() * 0.45), row);
    }
  } else {
    ctx.fillRect(x + sw * 0.36, y + 10, sw * 0.28, sh - 20);
  }
  ctx.restore();
}

function drawNight(ctx, rnd, w, h) {
  const skyline = Math.round(h * 0.1);

  // 夜空。上はほぼ黒、街に近づくほど光がにじんで明るい紺になる
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#050A1E');
  sky.addColorStop(0.55, '#101C44');
  sky.addColorStop(1, '#2B2A62');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 70; i++) {
    const s = rnd() < 0.18 ? 2 : 1;
    ctx.fillStyle = `rgba(226,236,255,${(0.2 + rnd() * 0.6).toFixed(2)})`;
    ctx.fillRect(rnd() * w, rnd() * (skyline + 40), s, s);
  }

  /* ビル群。奥の層はかすんで明るく、手前の層は暗い。
     看板は横に散らしたいので、この割合を越えた最初のビルに1枚ずつ貼る。
     シアンは暗い壁と混ざるとすぐ灰色になるので、面積の大きい大型ビジョン側に回す。 */
  const SIGN_AT = [0.02, 0.26, 0.5, 0.74];
  const SIGN_COLORS = [NEON[1], NEON[0], NEON[2], NEON[1]];
  const layers = [
    { fill: '#16214A', top: skyline + 62, span: 76, cell: 15, density: 0.6, glow: 3, alpha: 0.62, sign: false },
    { fill: '#0A1030', top: skyline, span: 104, cell: 20, density: 0.76, glow: 5, alpha: 1, sign: true }
  ];

  let signs = 0;
  for (const layer of layers) {
    let x = -18;
    while (x < w) {
      const bw = 38 + rnd() * 56;
      const top = layer.top + rnd() * layer.span;
      const theme = pickTheme(rnd);
      ctx.fillStyle = layer.fill;
      ctx.fillRect(x, top, bw, h - top);
      lightWindows(ctx, rnd, layer, x, top, bw, h, theme);
      if (layer.sign && signs < SIGN_AT.length && bw > 52 && x >= w * SIGN_AT[signs]) {
        neonSign(ctx, rnd, SIGN_COLORS[signs], x, top, bw, h, signs);
        signs++;
      }
      x += bw + 3 + rnd() * 9;
    }
  }

  // 手前の路面。濡れた道にネオンがにじんで映る
  const road = h - 66;
  const asphalt = ctx.createLinearGradient(0, road, 0, h);
  asphalt.addColorStop(0, '#080C20');
  asphalt.addColorStop(1, '#171D40');
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, road, w, h - road);

  for (let i = 0; i < 34; i++) {
    ctx.globalAlpha = 0.18 + rnd() * 0.34;
    ctx.fillStyle = pickNeon(rnd);
    ctx.fillRect(rnd() * w, road + rnd() * 10, 10 + rnd() * 52, 10 + rnd() * (h - road));
  }
  ctx.globalAlpha = 1;
}

const SAMPLES = {
  sunset: { label: '夕焼け', seed: 10510, draw: drawSunset },
  green: { label: '新緑', seed: 20270, draw: drawGreen },
  night: { label: '夜の街', seed: 33190, draw: drawNight }
};

// ---------------------------------------------------------------- DOM

const $ = (id) => document.getElementById(id);

const el = {
  drop: $('drop'), file: $('file'), samples: $('samples'), notice: $('notice'),
  result: $('result'), preview: $('preview'), meta: $('shot-meta'),
  band: $('band'), palette: $('palette'),
  copyAll: $('copy-all'), copyAllLabel: document.querySelector('.copyall__on')
};

const notify = (text) => { el.notice.textContent = text; };

function span(cls, text) {
  const node = document.createElement('span');
  node.className = cls;
  node.textContent = text;
  return node;
}

// ---------------------------------------------------------------- 描画

/** 帯とスウォッチを組み直す。帯の幅は flex-grow に画素数をそのまま渡して分配させる。 */
function renderPalette(colors, total) {
  el.band.textContent = '';
  el.palette.textContent = '';

  for (const color of colors) {
    const hex = toHex(color.rgb);
    const share = (color.count / total) * 100;

    const seg = span('band__seg', '');
    seg.style.background = hex;
    seg.style.flexGrow = String(color.count);
    el.band.appendChild(seg);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.hex = hex;
    btn.style.background = hex;
    btn.style.color = textColorOn(color.rgb);
    btn.setAttribute('aria-label', `${hex} をコピー（占有率 ${share.toFixed(1)}パーセント）`);
    btn.appendChild(span('swatch__hex', hex));
    btn.appendChild(span('swatch__rgb', toRgbText(color.rgb)));
    btn.appendChild(span('swatch__share', `${share.toFixed(1)}%`));

    const toast = span('swatch__toast', 'コピーしました');
    toast.setAttribute('aria-hidden', 'true');
    btn.appendChild(toast);

    el.palette.appendChild(btn);
  }

  // 色が6種類に届かない画像（単色など）もあるので、ボタンの数字は実際に出た数にする
  el.copyAllLabel.textContent = `${colors.length}色まとめてコピー`;
}

/** 画像1枚を受け取って、プレビューとパレットを差し替える。 */
function showImage(source, previewSrc, label) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const pixels = samplePixels(source, w, h);

  if (!pixels.length) {
    notify('色を数えられる画素がありませんでした（全体が透明な画像のようです）。');
    return;
  }

  renderPalette(medianCut(pixels, COLOR_COUNT), pixels.length);
  el.preview.src = previewSrc;
  el.preview.alt = `${label}のプレビュー`;
  // ファイル名は出さない（画面録画やスクリーンショットに個人の情報を写さないため）
  el.meta.textContent = `${label} · ${w} × ${h}`;
  el.result.hidden = false;
  notify('');
}

// ---------------------------------------------------------------- クリップボード

/** クリップボードへ書く。file:// では navigator.clipboard が拒否されるので execCommand に落とす。 */
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // 権限が無い / 安全なコンテキストでない → 下の古い方法へ
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }
  ta.remove();
  return ok;
}

let copyTimer = 0;
let copyAllTimer = 0;

/** 押したスウォッチにだけ「コピーしました」を出す。 */
function flash(btn) {
  clearTimeout(copyTimer);
  for (const shown of el.palette.querySelectorAll('.swatch.is-copied')) {
    shown.classList.remove('is-copied');
  }
  btn.classList.add('is-copied');
  copyTimer = setTimeout(() => btn.classList.remove('is-copied'), TOAST_MS);
}

// ---------------------------------------------------------------- 入力

function markSample(key) {
  for (const chip of el.samples.querySelectorAll('button[data-sample]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.sample === key));
  }
}

function loadSample(key) {
  const sample = SAMPLES[key];
  if (!sample) return;

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  sample.draw(canvas.getContext('2d'), mulberry32(sample.seed), SAMPLE_W, SAMPLE_H);

  markSample(key);
  // 抽出はcanvasから直接。プレビューには同じ絵をdata URLにして貼る
  showImage(canvas, canvas.toDataURL('image/png'), `${sample.label}（サンプル）`);
}

function loadFile(file) {
  if (!file || file.type.indexOf('image/') !== 0) {
    notify('画像ファイルではないようです。画像を入れてください。');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      markSample('');
      showImage(img, img.src, '読み込んだ画像');
    };
    img.onerror = () => {
      notify('このブラウザでは開けない画像形式でした（HEICなど）。JPEGやPNGでお試しください。');
    };
    img.src = String(reader.result);
  };
  reader.onerror = () => notify('ファイルを読み取れませんでした。');
  reader.readAsDataURL(file);
}

el.samples.addEventListener('click', (e) => {
  const chip = e.target.closest('button[data-sample]');
  if (chip) loadSample(chip.dataset.sample);
});

el.drop.addEventListener('click', () => el.file.click());

el.file.addEventListener('change', () => {
  const file = el.file.files && el.file.files[0];
  el.file.value = '';  // 同じ画像をもう一度選んでも change が起きるようにする
  if (file) loadFile(file);
});

/* ドロップはページ全体で受け取る。ドロップゾーンを外すとブラウザが画像を別タブで開いて
   ページから離れてしまうため、どこに落ちても取りこぼさないようにしている。 */
let dragTimer = 0;

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  el.drop.classList.add('is-over');
  clearTimeout(dragTimer);
  dragTimer = setTimeout(() => el.drop.classList.remove('is-over'), 160);
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  clearTimeout(dragTimer);
  el.drop.classList.remove('is-over');
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) loadFile(files[0]);
  else notify('画像ファイルとして受け取れませんでした。');
});

// 貼り付け。クリップボードの中身から画像だけを拾う
window.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
      const file = items[i].getAsFile();
      if (file) {
        e.preventDefault();
        loadFile(file);
        return;
      }
    }
  }
  notify('貼り付けたものに画像が入っていませんでした。');
});

el.palette.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.swatch');
  if (!btn) return;

  const hex = btn.dataset.hex;
  if (await copyText(hex)) {
    flash(btn);
    notify(`${hex} をコピーしました。`);
  } else {
    notify(`コピーできませんでした。${hex} を手で書き写してください。`);
  }
});

el.copyAll.addEventListener('click', async () => {
  const list = [];
  for (const swatch of el.palette.querySelectorAll('button.swatch')) list.push(swatch.dataset.hex);
  if (!list.length) return;

  if (await copyText(list.join('\n'))) {
    clearTimeout(copyAllTimer);
    el.copyAll.classList.add('is-copied');
    copyAllTimer = setTimeout(() => el.copyAll.classList.remove('is-copied'), TOAST_MS);
    notify(`${list.length}色のHEXを改行区切りでコピーしました。`);
  } else {
    notify('コピーできませんでした。色をひとつずつ書き写してください。');
  }
});
