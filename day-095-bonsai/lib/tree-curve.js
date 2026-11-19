// 枝の中心線。節の終点を通る centripetal Catmull-Rom と、ねじれない平行移動枠。
// オブジェクトを量産しない。節2000の作り直しを 25ms に収めるため、出力は型付き配列だけにする。

const AT_SAMPLE = 0;
const AT_START = 1;
const AT_END = 2;
const AT_EMBED = 3;

export { AT_SAMPLE, AT_START, AT_END, AT_EMBED };

/** 幹・主枝は8角、副枝は6角、小枝は5角。角を増やすとシルエットは丸いが三角形が増える。 */
export function sidesForOrder(order) {
  if (order <= 1) return 8;
  if (order === 2) return 6;
  return 5;
}

/** 同じ chain の節を、根に近い順に束ねる。only があれば、その節だけ（落ちる枝・強調）。 */
export function collectChains(skel, only = null) {
  const map = new Map();
  for (let i = 0; i < skel.count; i += 1) {
    if (only && !only[i]) continue;
    const id = skel.chain[i];
    let list = map.get(id);
    if (!list) {
      list = [];
      map.set(id, list);
    }
    list.push(i);
  }
  return [...map.values()];
}

function growthAt(growth, index) {
  if (!growth) return 1;
  const value = growth[index];
  if (!Number.isFinite(value)) return 1;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * チェーンの制御点。付け根は親の中心線の内側から始め、管が親の表面に張り付かないようにする。
 * fresh の成長率は、その節の長さだけを縮める（先の節は縮んだ分だけ根元へ寄る）。
 * 戻り値の shift は「骨格の終点 → 成長後の終点」。葉のパッドを同じだけ動かす。
 */
export function chainControls(skel, indices, growth, embed = true, shift = new Float32Array(skel.count * 3)) {
  const x = [];
  const y = [];
  const z = [];
  const r = [];
  const node = [];
  const at = [];
  const first = indices[0];
  const parent = skel.parent[first];
  const sx = skel.start[first * 3];
  const sy = skel.start[first * 3 + 1];
  const sz = skel.start[first * 3 + 2];
  const growFirst = growthAt(growth, first);
  if (embed && parent >= 0 && skel.chain[parent] !== skel.chain[first] && growFirst > 0) {
    const px = skel.start[parent * 3];
    const py = skel.start[parent * 3 + 1];
    const pz = skel.start[parent * 3 + 2];
    const ex = skel.end[parent * 3];
    const ey = skel.end[parent * 3 + 1];
    const ez = skel.end[parent * 3 + 2];
    let dx = ex - px;
    let dy = ey - py;
    let dz = ez - pz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const embed = skel.r1[parent] * 0.58;
    x.push(ex - dx * embed);
    y.push(ey - dy * embed);
    z.push(ez - dz * embed);
    r.push(Math.max(skel.r0[first], skel.r1[parent] * 0.82));
    node.push(parent);
    at.push(AT_EMBED);
  }
  let cx = sx;
  let cy = sy;
  let cz = sz;
  x.push(cx);
  y.push(cy);
  z.push(cz);
  r.push(skel.r0[first]);
  node.push(first);
  at.push(AT_START);

  for (const index of indices) {
    const ax = skel.start[index * 3];
    const ay = skel.start[index * 3 + 1];
    const az = skel.start[index * 3 + 2];
    const bx = skel.end[index * 3];
    const by = skel.end[index * 3 + 1];
    const bz = skel.end[index * 3 + 2];
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    const full = Math.hypot(dx, dy, dz) || 1;
    dx /= full;
    dy /= full;
    dz /= full;
    const g = growthAt(growth, index);
    const len = full * g;
    cx += dx * len;
    cy += dy * len;
    cz += dz * len;
    if (shift) {
      shift[index * 3] = cx - bx;
      shift[index * 3 + 1] = cy - by;
      shift[index * 3 + 2] = cz - bz;
    }
    if (len < 1e-5) continue;
    x.push(cx);
    y.push(cy);
    z.push(cz);
    r.push(skel.r0[index] + (skel.r1[index] - skel.r0[index]) * g);
    node.push(index);
    at.push(AT_END);
  }
  return { x, y, z, r, node, at, shift };
}

function spanFor(order, length) {
  if (length < 0.05) return 1;
  if (order >= 3 || length < 0.14) return 2;
  if (order >= 2) return 3;
  return 4;
}

/** centripetal（alpha=0.5）。均一 Catmull-Rom より急な曲がりでループしにくい。 */
function centripetal(p0, p1, p2, p3, t) {
  const alpha = 0.5;
  const tj = (a, b, ta) => ta + Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) ** alpha;
  const t0 = 0;
  const t1 = tj(p0, p1, t0);
  const t2 = tj(p1, p2, t1);
  const t3 = tj(p2, p3, t2);
  const tt = t1 + (t2 - t1) * t;
  const lerp = (a, b, ta, tb) => {
    const u = (tt - ta) / ((tb - ta) || 1e-6);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/**
 * 制御点を通る曲線。半径は制御点の間を直線補間する（曲線補間だと節の太さを通り越す）。
 * 戻り値は平坦な配列。count が実長。
 */
export function sampleControls(ctrl, order, flareRoot = false) {
  const n = ctrl.x.length;
  if (n < 2) {
    return { count: 0, pos: new Float32Array(0), rad: new Float32Array(0), node: new Int32Array(0), at: new Uint8Array(0) };
  }
  const spans = [];
  let total = 1;
  for (let i = 0; i < n - 1; i += 1) {
    const length = Math.hypot(ctrl.x[i + 1] - ctrl.x[i], ctrl.y[i + 1] - ctrl.y[i], ctrl.z[i + 1] - ctrl.z[i]);
    const span = spanFor(order, length);
    spans.push(span);
    total += span;
  }
  const pos = new Float32Array(total * 3);
  const rad = new Float32Array(total);
  const node = new Int32Array(total);
  const at = new Uint8Array(total);
  let w = 0;
  const write = (px, py, pz, radius, nodeId, kind) => {
    pos[w * 3] = px;
    pos[w * 3 + 1] = py;
    pos[w * 3 + 2] = pz;
    // 地際でだけ幹を広げ、土から離れる所で半径の変化をなだらかにつなぐ。
    const t = flareRoot && py < 0.25 ? Math.max(0, py * 4) : 1;
    rad[w] = radius * (1 + 0.25 * (1 - t * t * (3 - 2 * t)));
    node[w] = nodeId;
    at[w] = kind;
    w += 1;
  };
  write(ctrl.x[0], ctrl.y[0], ctrl.z[0], ctrl.r[0], ctrl.node[0], ctrl.at[0]);
  for (let i = 0; i < n - 1; i += 1) {
    const span = spans[i];
    const p1 = [ctrl.x[i], ctrl.y[i], ctrl.z[i]];
    const p2 = [ctrl.x[i + 1], ctrl.y[i + 1], ctrl.z[i + 1]];
    const p0 = i > 0 ? [ctrl.x[i - 1], ctrl.y[i - 1], ctrl.z[i - 1]] : p1;
    const p3 = i + 2 < n ? [ctrl.x[i + 2], ctrl.y[i + 2], ctrl.z[i + 2]] : p2;
    for (let s = 1; s <= span; s += 1) {
      const t = s / span;
      let point;
      if (n === 2 || (p0 === p1 && p3 === p2 && span === 1)) {
        point = [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t, p1[2] + (p2[2] - p1[2]) * t];
      } else if (s === span) {
        point = p2;
      } else {
        point = centripetal(p0, p1, p2, p3, t);
      }
      const radius = ctrl.r[i] + (ctrl.r[i + 1] - ctrl.r[i]) * t;
      const kind = s === span ? ctrl.at[i + 1] : AT_SAMPLE;
      const nodeId = s === span ? ctrl.node[i + 1] : ctrl.node[i + 1];
      write(point[0], point[1], point[2], radius, nodeId, kind);
    }
  }
  return { count: w, pos, rad, node, at };
}

function rodrigues(vx, vy, vz, kx, ky, kz, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const dot = vx * kx + vy * ky + vz * kz;
  const cx = ky * vz - kz * vy;
  const cy = kz * vx - kx * vz;
  const cz = kx * vy - ky * vx;
  return [
    vx * c + cx * s + kx * dot * (1 - c),
    vy * c + cy * s + ky * dot * (1 - c),
    vz * c + cz * s + kz * dot * (1 - c),
  ];
}

/**
 * 接線に沿って枠を平行移動する。ひねりを足さないので、樹皮の模様が枝の途中で回転して見えない。
 * N は断面の角度 0、B は角度 90°。B = T × N。
 */
export function parallelFrames(pos, count) {
  const tx = new Float32Array(count);
  const ty = new Float32Array(count);
  const tz = new Float32Array(count);
  const nx = new Float32Array(count);
  const ny = new Float32Array(count);
  const nz = new Float32Array(count);
  const bx = new Float32Array(count);
  const by = new Float32Array(count);
  const bz = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const i0 = Math.max(0, i - 1) * 3;
    const i1 = Math.min(count - 1, i + 1) * 3;
    let dx = pos[i1] - pos[i0];
    let dy = pos[i1 + 1] - pos[i0 + 1];
    let dz = pos[i1 + 2] - pos[i0 + 2];
    const len = Math.hypot(dx, dy, dz) || 1;
    tx[i] = dx / len;
    ty[i] = dy / len;
    tz[i] = dz / len;
  }
  let hx = 0;
  let hy = 1;
  let hz = 0;
  if (Math.abs(ty[0]) > 0.92) {
    hx = 1;
    hy = 0;
    hz = 0;
  }
  let cx = hy * tz[0] - hz * ty[0];
  let cy = hz * tx[0] - hx * tz[0];
  let cz = hx * ty[0] - hy * tx[0];
  let cl = Math.hypot(cx, cy, cz) || 1;
  nx[0] = cx / cl;
  ny[0] = cy / cl;
  nz[0] = cz / cl;
  bx[0] = ty[0] * nz[0] - tz[0] * ny[0];
  by[0] = tz[0] * nx[0] - tx[0] * nz[0];
  bz[0] = tx[0] * ny[0] - ty[0] * nx[0];
  for (let i = 1; i < count; i += 1) {
    const ax = ty[i - 1] * tz[i] - tz[i - 1] * ty[i];
    const ay = tz[i - 1] * tx[i] - tx[i - 1] * tz[i];
    const az = tx[i - 1] * ty[i] - ty[i - 1] * tx[i];
    const sinA = Math.hypot(ax, ay, az);
    const cosA = tx[i - 1] * tx[i] + ty[i - 1] * ty[i] + tz[i - 1] * tz[i];
    let px = nx[i - 1];
    let py = ny[i - 1];
    let pz = nz[i - 1];
    if (sinA > 1e-6) {
      const inv = 1 / sinA;
      const turned = rodrigues(px, py, pz, ax * inv, ay * inv, az * inv, Math.atan2(sinA, Math.max(-1, Math.min(1, cosA))));
      px = turned[0];
      py = turned[1];
      pz = turned[2];
    }
    const along = px * tx[i] + py * ty[i] + pz * tz[i];
    px -= along * tx[i];
    py -= along * ty[i];
    pz -= along * tz[i];
    const pl = Math.hypot(px, py, pz) || 1;
    nx[i] = px / pl;
    ny[i] = py / pl;
    nz[i] = pz / pl;
    bx[i] = ty[i] * nz[i] - tz[i] * ny[i];
    by[i] = tz[i] * nx[i] - tx[i] * nz[i];
    bz[i] = tx[i] * ny[i] - ty[i] * nx[i];
  }
  return { tx, ty, tz, nx, ny, nz, bx, by, bz };
}
