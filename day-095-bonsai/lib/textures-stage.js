// 舞台（鉢・土・苔・卓・和紙の壁）の質感を Canvas 2D で手続き生成する。
// 外部画像を使わず、同じ種（seed）から常に同じ模様を得るため、lib/rng.js と lib/noise.js のみで描画する。
// マテリアルの基調色（material.color）と乗算されたときに狙いの発色になるよう、
// テクスチャは陰影・色むら・繊維・木目・苔の粒立ちのニュアンスとして描く。

import { createRng } from './rng.js';
import { hash3, tileNoise2 } from './noise.js';

/** 画質設定に応じたテクスチャの一辺のピクセル数を返す。CIや軽量環境での負荷を抑えるため段階を分ける。 */
export function getStageTextureSize(gfx = 'high') {
  if (gfx === 'test') return 128;
  if (gfx === 'low') return 512;
  return 1024;
}

const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * createCanvas から 2D コンテキスト付きの canvas を安全に取得する。
 * Node の単体試験（createCanvas=null または null を返す関数）では null を返し、質感なしの色マテリアルへフォールバックさせる。
 */
function acquireCanvas(createCanvas, width, height) {
  const factory = createCanvas === undefined
    ? (typeof document !== 'undefined' ? (w, h) => document.createElement('canvas') : null)
    : createCanvas;
  if (typeof factory !== 'function') return null;
  const canvas = factory(width, height);
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx || typeof ctx.createImageData !== 'function') return null;
  return { canvas, ctx };
}

function wrapCanvasTexture(THREE, canvas, gfx) {
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = gfx === 'high' ? 8 : gfx === 'low' ? 4 : 1;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 鉢の質感を生成する。
 * 光の当たらない手前側の面でも形と材質感（素焼きと釉薬の差）が読めるよう、
 * カメラ距離でも潰れない中周波の窯変ムラと微細な肌理を重ねる。
 * - oval-brown: 無釉の焼き締め（火色の窯変ムラ、ろくろの横挽き筋、砂粒と微細な鉄点）
 * - round-blue: 藍の釉薬（縦に流れる釉垂れと釉溜まりの濃淡、口縁側の窯変ムラ）
 * - rect-grey: 灰の釉薬（落ち着いた釉ムラと微細な鉄点）
 */
export function createPotTexture(THREE, potId, { gfx = 'high', seed = 1, createCanvas } = {}) {
  const size = getStageTextureSize(gfx);
  const acquired = acquireCanvas(createCanvas, size, size);
  if (!acquired) return null;
  const { canvas, ctx } = acquired;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rng = createRng(seed).fork(`pot-tex-${potId}`);
  const s0 = rng.int(1, 100000);
  const s1 = rng.int(1, 100000);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      let r = 240;
      let g = 240;
      let b = 240;

      if (potId === 'oval-brown') {
        // 無釉の茶鉢: 窯変の火色ムラ（中周波）＋ろくろの横筋＋焼き締めの砂粒・鉄点
        const kilnCloud = (tileNoise2(u, v, 4, s0, 3) - 0.5) * 34;
        const mottle = (tileNoise2(u, v, 11, s1, 3) - 0.5) * 24;
        const wheelTurn = Math.sin(v * Math.PI * 34 + tileNoise2(u, v, 5, s0, 2) * 2.4) * 8;
        const coarseGrain = (tileNoise2(u, v, 36, s1 + 19, 2) - 0.5) * 20;
        const fineGrain = (hash3(x, y, 0, s0) - 0.5) * 24;
        const ironSpeck = hash3(x >> 1, y >> 1, 4, s1) > 0.955 ? -26 : 0;
        const delta = kilnCloud + mottle + wheelTurn + coarseGrain + fineGrain + ironSpeck;
        r = 228 + delta * 1.10;
        g = 222 + delta * 0.95;
        b = 214 + delta * 0.82;
      } else if (potId === 'round-blue') {
        // 藍の釉薬: 縦方向の釉垂れ筋と釉溜まりの深い濃淡（本来の深い藍色を保つため明度を抑える）
        const dripMajor = tileNoise2(u * 2, v * 0.5, 6, s0, 3);
        const dripMinor = tileNoise2(u * 3, v * 0.75, 12, s1, 3);
        const pool = tileNoise2(u, v, 5, s1 + 23, 4);
        const streak = Math.sin(u * Math.PI * 28 + pool * 5.0) * 12;
        const rimGlow = Math.pow(Math.max(0, 1 - v * 3.2), 1.8) * 24;
        const bellySheen = Math.exp(-Math.pow((v - 0.36) / 0.18, 2)) * 10;
        const delta = (dripMajor - 0.5) * 40 + (dripMinor - 0.5) * 24 + (pool - 0.5) * 22 + streak + rimGlow + bellySheen;
        r = 214 + delta * 0.85;
        g = 222 + delta * 0.98;
        b = 234 + delta * 1.12;
      } else {
        // 灰の釉薬: 穏やかな窯変ムラに、焼き物特有の小さな鉄点とろくろの微かな横目
        const base = (tileNoise2(u, v, 5, s0, 3) - 0.5) * 28;
        const fineCloud = (tileNoise2(u, v, 14, s1, 2) - 0.5) * 16;
        const wheel = Math.sin(v * Math.PI * 24 + base * 0.08) * 5;
        const speckHash = hash3(x >> 1, y >> 1, 3, s1);
        const speck = speckHash > 0.96 ? -42 : speckHash < 0.035 ? 14 : 0;
        const delta = base + fineCloud + wheel + speck;
        r = 228 + delta;
        g = 230 + delta;
        b = 229 + delta;
      }

      data[idx] = clampByte(r);
      data[idx + 1] = clampByte(g);
      data[idx + 2] = clampByte(b);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapCanvasTexture(THREE, canvas, gfx);
}

/**
 * 土の質感を生成する。
 * 赤玉土・黒土・砂が混ざった暗い粒状の凹凸感を出すため、塊ノイズと微細ノイズを重ねる。
 */
export function createSoilTexture(THREE, { gfx = 'high', seed = 1, createCanvas } = {}) {
  const size = getStageTextureSize(gfx);
  const acquired = acquireCanvas(createCanvas, size, size);
  if (!acquired) return null;
  const { canvas, ctx } = acquired;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rng = createRng(seed).fork('soil-tex');
  const s0 = rng.int(1, 100000);
  const s1 = rng.int(1, 100000);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      // 大小の土粒と粒間の隙間（暗部）を表現する
      const clump = tileNoise2(u, v, 16, s0, 3);
      const medGrain = tileNoise2(u, v, 36, s1, 2);
      const fine = hash3(x >> 1, y >> 1, 1, s1);
      const micro = hash3(x, y, 2, s0);
      const cavity = clump < 0.38 ? -52 : medGrain < 0.32 ? -28 : 0;
      const akadama = fine > 0.85 ? 24 : 0;
      const delta = (clump - 0.5) * 64 + (medGrain - 0.5) * 32 + (micro - 0.5) * 28 + cavity + akadama;

      data[idx] = clampByte(228 + delta * 1.06);
      data[idx + 1] = clampByte(222 + delta * 0.98);
      data[idx + 2] = clampByte(214 + delta * 0.88);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapCanvasTexture(THREE, canvas, gfx);
}

/**
 * 苔の質感を生成する。
 * 蛍光黄緑にならず、くすんだ深い緑（#3f5a2e〜#6b8a4c）に発色するよう、
 * テクスチャ側での過剰な緑強調を避け、細かい斑・濃淡・ところどころの淡い粒と毛足の陰影を緻密に描く。
 */
export function createMossTexture(THREE, { gfx = 'high', seed = 1, createCanvas } = {}) {
  const size = getStageTextureSize(gfx);
  const acquired = acquireCanvas(createCanvas, size, size);
  if (!acquired) return null;
  const { canvas, ctx } = acquired;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rng = createRng(seed).fork('moss-tex');
  const s0 = rng.int(1, 100000);
  const s1 = rng.int(1, 100000);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // 大小の斑（まだら）と細かい毛足の房
      const macroPatch = tileNoise2(u, v, 7, s0, 3);
      const midMottle = tileNoise2(u, v, 18, s1, 3);
      const fineTuft = tileNoise2(u, v, 42, s0 + 37, 2);
      const cellGrain = hash3(x >> 1, y >> 1, 3, s1);
      const velvet = (hash3(x, y, 5, s0) - 0.5) * 28;

      // 房と房の間の深い隙間（濃淡の暗部）と、ところどころの淡い粒
      const deepCrevice = (fineTuft < 0.33 || cellGrain < 0.16) ? -38 : 0;
      const paleGranule = (cellGrain > 0.915 && fineTuft > 0.52) ? 38 : (cellGrain > 0.85 && midMottle > 0.55) ? 20 : 0;

      const delta = (macroPatch - 0.5) * 48
        + (midMottle - 0.5) * 44
        + (fineTuft - 0.5) * 36
        + velvet
        + deepCrevice
        + paleGranule;

      // ベース明度を 210 前後に抑えて彩度の暴走を防ぎ、淡い粒はわずかに黄灰緑、谷間は深い黒緑に寄せる
      const warmShift = paleGranule > 0 ? 6 : deepCrevice < 0 ? -4 : 0;
      data[idx] = clampByte(210 + delta * 1.02 + warmShift);
      data[idx + 1] = clampByte(212 + delta * 0.96 + (paleGranule > 0 ? 4 : 0));
      data[idx + 2] = clampByte(204 + delta * 0.84 - warmShift * 0.5);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Canvas 2D パスが使える環境では、微細な苔の毛足と淡い粒・暗緑の斑点をシームレスに重ね描きする
  if (typeof ctx.beginPath === 'function' && typeof ctx.stroke === 'function') {
    const speckCount = gfx === 'test' ? 180 : gfx === 'low' ? 900 : 2200;
    const scale = size / 512;
    ctx.lineCap = 'round';
    for (let i = 0; i < speckCount; i += 1) {
      const x0 = rng.range(0, size);
      const y0 = rng.range(0, size);
      const angle = rng.range(0, Math.PI * 2);
      const len = rng.range(1.2, 3.6) * scale;
      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len;
      const roll = rng.next();
      if (roll < 0.28) {
        // ところどころの淡い粒（山苔の乾いた穂先・新芽の粒）
        ctx.strokeStyle = 'rgba(232, 238, 210, 0.34)';
        ctx.lineWidth = rng.range(1.0, 2.1) * scale;
      } else if (roll < 0.65) {
        // 深い濃緑の谷・隙間
        ctx.strokeStyle = 'rgba(95, 115, 78, 0.30)';
        ctx.lineWidth = rng.range(0.9, 1.8) * scale;
      } else {
        // くすんだ中間オリーブの斑
        ctx.strokeStyle = 'rgba(168, 178, 142, 0.24)';
        ctx.lineWidth = rng.range(1.0, 2.2) * scale;
      }
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + dx, y0 + dy);
      ctx.stroke();
    }
  }

  return wrapCanvasTexture(THREE, canvas, gfx);
}

/**
 * 卓の木目質感を生成する。
 * 卓を 8×4.2 以上に広げても一切の切れ目が出ないよう、すべて周期関数（tileNoise2 と周期サイン波）で構成する。
 */
export function createTableTexture(THREE, { gfx = 'high', seed = 1, createCanvas } = {}) {
  const size = getStageTextureSize(gfx);
  const acquired = acquireCanvas(createCanvas, size, size);
  if (!acquired) return null;
  const { canvas, ctx } = acquired;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rng = createRng(seed).fork('table-tex');
  const s0 = rng.int(1, 100000);
  const s1 = rng.int(1, 100000);

  // 木目の節（knot）の位置をタイル境界から離れた内側に決定的に2か所決める
  const knots = [
    { u: rng.range(0.24, 0.40), v: rng.range(0.28, 0.72), rx: 0.07, ry: 0.14, strength: 0.12 },
    { u: rng.range(0.62, 0.78), v: rng.range(0.28, 0.72), rx: 0.055, ry: 0.12, strength: -0.10 },
  ];

  const wrapDelta = (d) => d - Math.round(d);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // 節の周囲で木目の位相が迂回するように周期距離で座標を歪ませる
      let warpU = u;
      let knotDark = 0;
      for (let k = 0; k < knots.length; k += 1) {
        const kn = knots[k];
        const du = wrapDelta(u - kn.u) / kn.rx;
        const dv = wrapDelta(v - kn.v) / kn.ry;
        const d2 = du * du + dv * dv;
        if (d2 < 9.0) {
          const falloff = Math.exp(-d2 * 0.68);
          warpU += (du >= 0 ? 1 : -1) * kn.strength * falloff;
          if (d2 < 1.2) {
            knotDark += (1.2 - d2) * 42;
          }
        }
      }

      // 縦縞のベース（v方向に伸びる木目）を完全周期の tileNoise2 で作る（境界の切れ目ゼロ）
      const flow = tileNoise2(warpU, v, 4, s0, 4) * 0.36 + tileNoise2(warpU, v, 8, s1, 3) * 0.24;
      const grainPhase = (warpU * 18.0 + flow * 5.0) * Math.PI * 2;
      const ringWave = Math.sin(grainPhase);
      // 細い濃い線（導管と年輪の境目）を鋭いピークで作る
      const darkLine = Math.pow(Math.max(0, ringWave), 7) * 52;
      const finePore = tileNoise2(u, v, 64, s1 + 17, 2) > 0.74 ? 15 : 0;
      const broadTone = (tileNoise2(u, v, 4, s0 + 31, 2) - 0.5) * 20;

      const delta = broadTone - darkLine - finePore - knotDark + ringWave * 10;

      data[idx] = clampByte(244 + delta * 1.05);
      data[idx + 1] = clampByte(238 + delta * 0.96);
      data[idx + 2] = clampByte(230 + delta * 0.85);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapCanvasTexture(THREE, canvas, gfx);
}

/**
 * 和紙の壁の質感を生成する。
 * 壁を幅36×高さ22以上に広げても繰り返し模様が目立たず、かつ和紙の繊維の解像度を保つため、
 * tileNoise2 の周期を細かく（10・26・56）設定して大柄なシミの反復を抑え、繊維もタイル境界をラップ描画する。
 */
export function createWallTexture(THREE, { gfx = 'high', seed = 1, createCanvas } = {}) {
  const size = getStageTextureSize(gfx);
  const acquired = acquireCanvas(createCanvas, size, size);
  if (!acquired) return null;
  const { canvas, ctx } = acquired;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rng = createRng(seed).fork('wall-tex');
  const s0 = rng.int(1, 100000);
  const s1 = rng.int(1, 100000);

  // 1) 漉きムラと微細な紙肌を、周期が目立たない高めの周波数（10・26・56）で重ねる
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      const softMottle = (tileNoise2(u, v, 10, s0, 3) - 0.5) * 11;
      const midPaper = (tileNoise2(u, v, 26, s1, 3) - 0.5) * 9;
      const fineWeave = (tileNoise2(u, v, 56, s0 + 43, 2) - 0.5) * 7;
      const micro = (hash3(x, y, 7, s0) - 0.5) * 5;
      const delta = softMottle + midPaper + fineWeave + micro;

      data[idx] = clampByte(247 + delta);
      data[idx + 1] = clampByte(246 + delta * 0.97);
      data[idx + 2] = clampByte(243 + delta * 0.92);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 2) 楮・三椏の細い繊維の線を Canvas 2D パスでシームレス（端をまたぐ線は反対側にもラップ）に重ね描きする
  if (typeof ctx.beginPath === 'function' && typeof ctx.stroke === 'function') {
    const fiberCount = gfx === 'test' ? 180 : gfx === 'low' ? 800 : 2000;
    ctx.lineCap = 'round';
    for (let i = 0; i < fiberCount; i += 1) {
      const x0 = rng.range(0, size);
      const y0 = rng.range(0, size);
      const angle = rng.range(0, Math.PI * 2);
      const len = rng.range(size * 0.009, size * 0.032);
      const bend = rng.range(-len * 0.35, len * 0.35);
      const x1 = x0 + Math.cos(angle) * len;
      const y1 = y0 + Math.sin(angle) * len;
      const cx = (x0 + x1) * 0.5 - Math.sin(angle) * bend;
      const cy = (y0 + y1) * 0.5 + Math.cos(angle) * bend;

      const isLight = rng.chance(0.55);
      ctx.strokeStyle = isLight ? 'rgba(255, 253, 248, 0.20)' : 'rgba(198, 184, 162, 0.14)';
      ctx.lineWidth = rng.range(0.55, 1.25) * (size / 512);

      const wrapsX = x0 < len || x1 < 0 ? [0, size] : x0 > size - len || x1 > size ? [0, -size] : [0];
      const wrapsY = y0 < len || y1 < 0 ? [0, size] : y0 > size - len || y1 > size ? [0, -size] : [0];
      for (const ox of wrapsX) {
        for (const oy of wrapsY) {
          ctx.beginPath();
          ctx.moveTo(x0 + ox, y0 + oy);
          ctx.quadraticCurveTo(cx + ox, cy + oy, x1 + ox, y1 + oy);
          ctx.stroke();
        }
      }
    }
  }

  return wrapCanvasTexture(THREE, canvas, gfx);
}
