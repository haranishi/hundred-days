// 担当どうしの約束事（定数と検証）。形の説明は .kiro/specs/day-095-bonsai/interfaces.md。
// 木のモデル（tree.js）が作る「骨格のスナップショット」を、描画・当たり判定・UIが同じ形で読む。
// ここを変えるときは、interfaces.md と、3つの担当すべてに知らせる。

export const SPECIES_IDS = Object.freeze(['maple', 'pine', 'plum']);
export const STYLE_IDS = Object.freeze(['moyogi', 'chokkan', 'shakan']);
export const POT_IDS = Object.freeze(['oval-brown', 'round-blue', 'rect-grey']);
export const LIGHT_IDS = Object.freeze(['morning', 'noon', 'evening', 'night']);
export const TOOL_IDS = Object.freeze(['look', 'cut', 'bend', 'pinch', 'water']);
export const SEASON_IDS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const GFX_IDS = Object.freeze(['high', 'low', 'test']);

/** 節（node）の印。フラグは足し合わせる。 */
export const NODE_FLAG = Object.freeze({ WIRED: 1, PINCHED: 2, CUT: 4, FRESH: 8 });
const KNOWN_FLAGS = NODE_FLAG.WIRED | NODE_FLAG.PINCHED | NODE_FLAG.CUT | NODE_FLAG.FRESH;

export const MAX_NODES = 2600;
export const MAX_PADS = 140;
/** 遊びの始まりの日付。 */
export const START = Object.freeze({ month: 10, dom: 1 });
/** 視点の既定。az=方位角（度・+Zから右へ）、pol=真上からの角度（度）、dist=距離、target=見る点。 */
export const CAMERA_DEFAULT = Object.freeze({ az: 20, pol: 72, dist: 8.5, target: Object.freeze([0, 1.5, 0]) });
export const CAMERA_LIMITS = Object.freeze({ polMin: 20, polMax: 88, distMin: 3.2, distMax: 14, panMax: 1.5 });
export const DEFAULTS = Object.freeze({ species: 'maple', style: 'moyogi', pot: 'oval-brown', light: 'noon' });
/** localStorage の名前。`_KEY` で終わる名前は、公開前の検査（gitleaks）が鍵と誤検知する。 */
export const SAVE_NAME = 'day095.bonsai.save.v1';
export const SAVE_VERSION = 1;
/** 元に戻せる回数。 */
export const HISTORY_LIMIT = 30;

const isTyped = (value, ctor, length) => value instanceof ctor && value.length === length;
const isUnit = (x, y, z) => Math.abs(Math.hypot(x, y, z) - 1) < 2e-3;

/**
 * スナップショットが契約を満たすか調べる。違反の説明を配列で返す（空なら合格）。
 * 試験と、開発中の assert に使う。重い検査なので、毎フレームは呼ばない。
 */
export function validateSkeleton(skel) {
  const errors = [];
  const fail = (message) => { if (errors.length < 40) errors.push(message); };
  if (!skel || typeof skel !== 'object') return ['スナップショットがオブジェクトでない'];
  const n = skel.count;
  if (!Number.isInteger(n) || n < 1 || n > MAX_NODES) return [`count が 1〜${MAX_NODES} の整数でない: ${n}`];

  const typed = [
    ['ids', Int32Array, n], ['parent', Int32Array, n], ['order', Uint8Array, n], ['chain', Int32Array, n],
    ['start', Float32Array, 3 * n], ['end', Float32Array, 3 * n], ['quat', Float32Array, 4 * n],
    ['r0', Float32Array, n], ['r1', Float32Array, n], ['flags', Uint8Array, n], ['fresh', Float32Array, n],
    ['scarAge', Float32Array, n],
  ];
  for (const [name, ctor, length] of typed) {
    if (!isTyped(skel[name], ctor, length)) fail(`${name} は ${ctor.name}(${length}) でなければならない`);
  }
  if (errors.length) return errors;

  for (const name of ['start', 'end', 'quat', 'r0', 'r1', 'fresh', 'scarAge']) {
    for (let i = 0; i < skel[name].length; i += 1) {
      if (!Number.isFinite(skel[name][i])) { fail(`${name}[${i}] が有限の数でない`); break; }
    }
  }
  if (skel.parent[0] !== -1) fail('parent[0] は -1（幹の根元が唯一の根）');
  const seenIds = new Set();
  const continuation = new Set();
  for (let i = 0; i < n; i += 1) {
    const p = skel.parent[i];
    if (i > 0 && !(p >= 0 && p < i)) fail(`parent[${i}]=${p} は、親が子より前に並ぶ約束に反する`);
    if (seenIds.has(skel.ids[i])) fail(`ids[${i}] が重複している`);
    seenIds.add(skel.ids[i]);
    if (skel.order[i] > 6) fail(`order[${i}] が大きすぎる`);
    if ((skel.flags[i] & ~KNOWN_FLAGS) !== 0) fail(`flags[${i}] に未知のビットがある`);
    if (skel.chain[i] < 0) fail(`chain[${i}] が負`);
    if (!(skel.r1[i] > 0) || !(skel.r0[i] + 1e-6 >= skel.r1[i])) fail(`半径が r0>=r1>0 を満たさない（節${i}）`);
    if (!isUnit(skel.quat[4 * i], skel.quat[4 * i + 1], skel.quat[4 * i + 2]) && Math.abs(Math.hypot(skel.quat[4 * i], skel.quat[4 * i + 1], skel.quat[4 * i + 2], skel.quat[4 * i + 3]) - 1) > 2e-3) {
      fail(`quat[${i}] が単位クォータニオンでない`);
    }
    const len = Math.hypot(skel.end[3 * i] - skel.start[3 * i], skel.end[3 * i + 1] - skel.start[3 * i + 1], skel.end[3 * i + 2] - skel.start[3 * i + 2]);
    if (!(len > 1e-4)) fail(`節${i} の長さが0`);
    if (i === 0) {
      if (Math.hypot(skel.start[0], skel.start[1], skel.start[2]) > 1e-3) fail('根の start は原点');
    } else if (p >= 0 && p < i) {
      const d = Math.hypot(skel.start[3 * i] - skel.end[3 * p], skel.start[3 * i + 1] - skel.end[3 * p + 1], skel.start[3 * i + 2] - skel.end[3 * p + 2]);
      if (d > 1e-3) fail(`節${i} の始点が親（節${p}）の終点とずれている（${d.toFixed(4)}）`);
      if (skel.chain[i] === skel.chain[p]) {
        if (continuation.has(p)) fail(`節${p} の子が2つ、同じ chain（枝の続き）を名乗っている`);
        continuation.add(p);
      }
    }
  }

  const pads = skel.pads;
  if (!pads || !Number.isInteger(pads.count) || pads.count < 0 || pads.count > MAX_PADS) {
    fail(`pads.count が 0〜${MAX_PADS} の整数でない`);
  } else {
    const m = pads.count;
    const padTyped = [['node', Int32Array, m], ['center', Float32Array, 3 * m], ['normal', Float32Array, 3 * m], ['radius', Float32Array, m], ['density', Float32Array, m], ['seed', Uint32Array, m]];
    for (const [name, ctor, length] of padTyped) if (!isTyped(pads[name], ctor, length)) fail(`pads.${name} は ${ctor.name}(${length}) でなければならない`);
    if (errors.length === 0) {
      for (let k = 0; k < m; k += 1) {
        if (!(pads.node[k] >= 0 && pads.node[k] < n)) fail(`pads.node[${k}] が範囲外`);
        if (!(pads.radius[k] > 0)) fail(`pads.radius[${k}] が正でない`);
        if (!(pads.density[k] >= 0 && pads.density[k] <= 1)) fail(`pads.density[${k}] が 0〜1 でない`);
        if (!isUnit(pads.normal[3 * k], pads.normal[3 * k + 1], pads.normal[3 * k + 2])) fail(`pads.normal[${k}] が単位ベクトルでない`);
      }
    }
  }

  const b = skel.bounds;
  if (!b || ![b.min, b.max, b.center].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) {
    fail('bounds は {min,max,center} の3成分の配列');
  } else if (b.min.some((v, axis) => v > b.max[axis])) {
    fail('bounds.min が max を超えている');
  }

  if (!Array.isArray(skel.wires)) {
    fail('wires は配列');
  } else {
    skel.wires.forEach((wire, w) => {
      if (!(wire && wire.nodes instanceof Int32Array && wire.nodes.length >= 1)) { fail(`wires[${w}].nodes が Int32Array でない`); return; }
      for (let k = 0; k < wire.nodes.length; k += 1) {
        const idx = wire.nodes[k];
        if (!(idx >= 0 && idx < n)) { fail(`wires[${w}] に範囲外の節`); return; }
        if (k > 0 && skel.parent[idx] !== wire.nodes[k - 1]) { fail(`wires[${w}] が根から先へ続く一本の道でない`); return; }
      }
    });
  }
  return errors;
}

/** 季節の見た目（look.js が返す形）の検査。 */
export function validateLook(look) {
  const errors = [];
  if (!look || typeof look !== 'object') return ['look がオブジェクトでない'];
  for (const key of ['coverage', 'flower', 'bud', 'fall', 'petal', 'leafAge']) {
    if (!(look[key] >= 0 && look[key] <= 1)) errors.push(`look.${key} が 0〜1 でない: ${look[key]}`);
  }
  for (const key of ['color', 'color2']) {
    if (!(Array.isArray(look[key]) && look[key].length === 3 && look[key].every((v) => v >= 0 && v <= 1))) errors.push(`look.${key} は 0〜1 の3成分`);
  }
  if (!SEASON_IDS.includes(look.season)) errors.push(`look.season が不正: ${look.season}`);
  return errors;
}
