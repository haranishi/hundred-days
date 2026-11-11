// 地形の区画を「近くは細かく・遠くは粗く」選ぶ計算（CDLOD）。three.js にも DOM にも依存しない。
//
// なぜこの形か：
// - 距離は「水平の距離」と「カメラの対地高度」だけで測る。区画を選ぶ側と、頂点を寄せる側（シェーダー）が
//   同じ式を使えば、境目で頂点が必ず一致する。頂点の高さを距離に入れると、両者がずれてすき間になる。
// - 分けられた親の子は、範囲の外でもすべて子の段で描く。その子の頂点は親の格子へ寄せ切られているので、
//   さらに1段上へ寄せる処理（2段目）を同じ式で掛けて、隣の区画と合わせる。
// - 2段で足りる条件は baseRange >= leaf * 2 * sqrt(2)（下の assert）。

/**
 * 高さ配列から、区画ごとの最小・最大の高さを段ごとに作る。
 * @param {Float32Array} heights 行優先 grid×grid
 * @param {{grid:number, cell:number, size:number, leaf:number, margin?:number}} cfg margin は補間と凹凸のぶんの余白（m）
 */
export function buildMinMaxPyramid(heights, cfg) {
  const { grid, cell, size, leaf } = cfg;
  const margin = cfg.margin ?? 1.5;
  const n0 = Math.round(size / leaf);
  const levels = Math.round(Math.log2(n0)) + 1;
  const cellsPerLeaf = leaf / cell;
  const mins = [];
  const maxs = [];
  const lo = new Float32Array(n0 * n0);
  const hi = new Float32Array(n0 * n0);
  for (let nz = 0; nz < n0; nz++) {
    // 補間が隣の点も読むので、1目ぶん外まで見る
    const j0 = Math.max(0, Math.floor(nz * cellsPerLeaf) - 1);
    const j1 = Math.min(grid - 1, Math.ceil((nz + 1) * cellsPerLeaf));
    for (let nx = 0; nx < n0; nx++) {
      const i0 = Math.max(0, Math.floor(nx * cellsPerLeaf) - 1);
      const i1 = Math.min(grid - 1, Math.ceil((nx + 1) * cellsPerLeaf));
      let a = Infinity;
      let b = -Infinity;
      for (let j = j0; j <= j1; j++) {
        const row = j * grid;
        for (let i = i0; i <= i1; i++) {
          const h = heights[row + i];
          if (h < a) a = h;
          if (h > b) b = h;
        }
      }
      lo[nz * n0 + nx] = a - margin;
      hi[nz * n0 + nx] = b + margin;
    }
  }
  mins.push(lo);
  maxs.push(hi);
  let n = n0;
  for (let L = 1; L < levels; L++) {
    const pn = n;
    n = n >> 1;
    const plo = mins[L - 1];
    const phi = maxs[L - 1];
    const clo = new Float32Array(n * n);
    const chi = new Float32Array(n * n);
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const k = z * 2 * pn + x * 2;
        clo[z * n + x] = Math.min(plo[k], plo[k + 1], plo[k + pn], plo[k + pn + 1]);
        chi[z * n + x] = Math.max(phi[k], phi[k + 1], phi[k + pn], phi[k + pn + 1]);
      }
    }
    mins.push(clo);
    maxs.push(chi);
  }
  return { levels, nodesPerSide0: n0, mins, maxs };
}

/**
 * @param {{size:number, leaf:number, levels:number, baseRange:number, morphStart?:number, maxNodes?:number}} cfg
 */
export function createCdlod(cfg) {
  const { size, leaf, levels, baseRange } = cfg;
  const morphStart = cfg.morphStart ?? 0.7;
  const maxNodes = cfg.maxNodes ?? 1024;
  if (baseRange < leaf * 2 * Math.SQRT2) {
    throw new Error(`CDLOD: baseRange(${baseRange}) は leaf*2*sqrt(2)=${(leaf * 2 * Math.SQRT2).toFixed(1)} 以上が必要（2段の寄せで境目を合わせる条件）`);
  }
  const half = size / 2;
  const ranges = new Float32Array(levels + 2);
  for (let L = 0; L < levels + 2; L++) ranges[L] = baseRange * 2 ** L;
  // 再帰を使わず、積み上げた配列で木をたどる（毎コマ呼ぶので物を作らない）
  const stack = new Int32Array(levels * 4 * 3 + 12);

  /**
   * 描く区画を選ぶ。
   * @param {{x:number,y:number,z:number}} cam
   * @param {number} hAGL カメラの対地高度（m・0以上）
   * @param {Float32Array|null} planes 視錐台の6平面（nx,ny,nz,d を6組・内側が正）。null なら全部描く
   * @param {{mins:Float32Array[], maxs:Float32Array[]}} pyramid
   * @param {{data:Float32Array, level:Uint8Array}} out data は区画ごとに (原点X, 原点Z, 一辺, 中央の高さ)
   * @returns {number} 区画の数
   */
  function select(cam, hAGL, planes, pyramid, out) {
    let count = 0;
    let sp = 0;
    const top = levels - 1;
    stack[sp++] = top;
    stack[sp++] = 0;
    stack[sp++] = 0;
    const h2 = hAGL * hAGL;
    while (sp > 0) {
      const iz = stack[--sp];
      const ix = stack[--sp];
      const L = stack[--sp];
      const s = leaf * 2 ** L;
      const x0 = ix * s - half;
      const z0 = iz * s - half;
      const n = Math.round(size / s);
      const lo = pyramid.mins[L][iz * n + ix];
      const hi = pyramid.maxs[L][iz * n + ix];
      if (planes && !boxInFrustum(planes, x0, lo, z0, x0 + s, hi, z0 + s)) continue;
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + s));
      const dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + s));
      const d = Math.sqrt(dx * dx + dz * dz + h2);
      if (L > 0 && d < ranges[L - 1]) {
        const cx = ix * 2;
        const cz = iz * 2;
        const cl = L - 1;
        stack[sp++] = cl; stack[sp++] = cx; stack[sp++] = cz;
        stack[sp++] = cl; stack[sp++] = cx + 1; stack[sp++] = cz;
        stack[sp++] = cl; stack[sp++] = cx; stack[sp++] = cz + 1;
        stack[sp++] = cl; stack[sp++] = cx + 1; stack[sp++] = cz + 1;
        continue;
      }
      if (count >= maxNodes) continue;
      const k = count * 4;
      out.data[k] = x0;
      out.data[k + 1] = z0;
      out.data[k + 2] = s;
      out.data[k + 3] = (lo + hi) * 0.5;
      out.level[count] = L;
      count++;
    }
    return count;
  }

  return { size, leaf, levels, baseRange, morphStart, maxNodes, ranges, select };
}

function boxInFrustum(planes, x0, y0, z0, x1, y1, z1) {
  for (let p = 0; p < 24; p += 4) {
    const nx = planes[p];
    const ny = planes[p + 1];
    const nz = planes[p + 2];
    // 平面の法線の向きに、箱のいちばん遠い角を取る
    const x = nx >= 0 ? x1 : x0;
    const y = ny >= 0 ? y1 : y0;
    const z = nz >= 0 ? z1 : z0;
    if (nx * x + ny * y + nz * z + planes[p + 3] < 0) return false;
  }
  return true;
}

function morphAxis(p, spacing, k, half) {
  const idx = Math.floor((p + half) / spacing + 0.5);
  const odd = idx - 2 * Math.floor(idx / 2);
  return p - odd * spacing * k;
}

function morphFactor(dist, range, morphStart) {
  const k = (dist / range - morphStart) / (1 - morphStart);
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

/**
 * 頂点の XZ を親の格子へ寄せる。シェーダー（terrain.js）と同じ式。試験でも使う。
 * @param {number} x 寄せる前の X
 * @param {number} z 寄せる前の Z
 * @param {number} level その区画の段
 * @param {number} spacing その区画の頂点の間隔（一辺 ÷ 格子の数）
 * @param {{x:number,z:number}} cam
 * @param {number} hAGL
 * @param {{ranges:Float32Array, morphStart:number, size:number}} lod
 * @param {{x:number,z:number}} out
 */
export function morphXZ(x, z, level, spacing, cam, hAGL, lod, out) {
  const half = lod.size / 2;
  const h2 = hAGL * hAGL;
  let px = x;
  let pz = z;
  // 1段目：自分の段 → 親の段
  let d = Math.sqrt((px - cam.x) ** 2 + (pz - cam.z) ** 2 + h2);
  let k = morphFactor(d, lod.ranges[level], lod.morphStart);
  px = morphAxis(px, spacing, k, half);
  pz = morphAxis(pz, spacing, k, half);
  // 2段目：親の段 → その親の段（範囲の外まで描かれた子のため）。距離は寄せた後の位置で測り直す
  d = Math.sqrt((px - cam.x) ** 2 + (pz - cam.z) ** 2 + h2);
  k = morphFactor(d, lod.ranges[level + 1], lod.morphStart);
  px = morphAxis(px, spacing * 2, k, half);
  pz = morphAxis(pz, spacing * 2, k, half);
  out.x = px;
  out.z = pz;
  return out;
}
