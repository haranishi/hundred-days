// 公平さの確認。置き場所ごとに、同じ部屋の歩ける場所から、壁や家具に隠れずに見えるかを数える。
// 描画せず、壁と家具を箱（軸にそろった直方体）に置き換えて視線を通す。箱は実物より大きいので、判定は厳しめになる。
import { FURNITURE, PROPS } from './catalog.js';
import { FIXTURES, HOUSE, OPENING_HEIGHTS, SLOTS, WALLS, roomAt } from './plan.js';
import { insideRect, placeEntry, placeFixture } from './place.js';

const RAD = Math.PI / 180;
const DEDICATED = new Set(['armchair', 'rocking-chair', 'tall-plant', 'grandfather-clock', 'school-chair', 'suitcase']);

function rectBounds(fp) {
  const c = Math.abs(Math.cos(fp.yaw * RAD));
  const s = Math.abs(Math.sin(fp.yaw * RAD));
  const ex = fp.hx * c + fp.hz * s;
  const ez = fp.hx * s + fp.hz * c;
  return { minX: fp.cx - ex, maxX: fp.cx + ex, minZ: fp.cz - ez, maxZ: fp.cz + ez };
}

/** 視線をさえぎる箱の一覧 */
export function occluders(manifest) {
  const boxes = [];
  for (const w of WALLS) {
    const alongX = w.a[1] === w.b[1];
    const fixed = alongX ? w.a[1] : w.a[0];
    const start = (alongX ? w.a[0] : w.a[1]) - w.t / 2;
    const end = (alongX ? w.b[0] : w.b[1]) + w.t / 2;
    const add = (a0, a1, y0, y1) => {
      if (a1 - a0 <= 0 || y1 - y0 <= 0) return;
      boxes.push(alongX
        ? { min: [a0, y0, fixed - w.t / 2], max: [a1, y1, fixed + w.t / 2], id: 'wall' }
        : { min: [fixed - w.t / 2, y0, a0], max: [fixed + w.t / 2, y1, a1], id: 'wall' });
    };
    const openings = w.openings.map(o => ({ ...o, ...OPENING_HEIGHTS[o.kind] })).sort((p, q) => p.from - q.from);
    let cursor = start;
    for (const o of openings) {
      add(cursor, o.from, 0, HOUSE.wallHeight);
      add(o.from, o.to, 0, o.kind === 'front' ? o.top : o.bottom);
      add(o.from, o.to, o.top, HOUSE.wallHeight);
      cursor = o.to;
    }
    add(cursor, end, 0, HOUSE.wallHeight);
  }
  for (const f of FIXTURES) {
    if (f.ceiling) continue;
    const p = placeFixture(manifest, f);
    const b = rectBounds(p.footprint);
    boxes.push({ min: [b.minX, p.base, b.minZ], max: [b.maxX, p.base + p.height, b.maxZ], id: f.id, footprint: p.footprint, top: p.base + p.height });
  }
  // いつも同じ場所にある大きな物（ひじかけ椅子など）
  for (const slot of SLOTS) {
    const id = Object.keys(PROPS).find(pid => DEDICATED.has(pid) && pid === dedicatedFor(slot.kind));
    if (!id) continue;
    const p = placeEntry(manifest, PROPS[id], { x: slot.x, y: slot.y, z: slot.z, rot: slot.rot });
    const b = rectBounds(p.footprint);
    boxes.push({ min: [b.minX, p.base, b.minZ], max: [b.maxX, p.base + p.height, b.maxZ], id, slot: slot.id });
  }
  return boxes;
}

function dedicatedFor(kind) {
  return DEDICATED.has(kind) ? kind : null;
}

/** 線分と箱が交わるか（端から少し離した区間だけを見る） */
function segmentHitsBox(a, b, box, t0 = 0.02, t1 = 0.98) {
  let lo = t0;
  let hi = t1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-9) {
      if (a[i] < box.min[i] || a[i] > box.max[i]) return false;
    } else {
      let ta = (box.min[i] - a[i]) / d;
      let tb = (box.max[i] - a[i]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      lo = Math.max(lo, ta);
      hi = Math.min(hi, tb);
      if (lo > hi) return false;
    }
  }
  return true;
}

/** 置き場所の上に物があると見なす点（壁掛けは中心、それ以外は面から10cm上） */
export function slotTarget(slot, manifest) {
  if (DEDICATED.has(slot.kind)) {
    const p = placeEntry(manifest, PROPS[slot.kind], { x: slot.x, y: slot.y, z: slot.z, rot: slot.rot });
    return p.center;
  }
  if (slot.kind === 'wall' || slot.kind === 'mirror') {
    const f = slot.rot * RAD;
    return [slot.x + Math.sin(f) * 0.05, slot.y, slot.z + Math.cos(f) * 0.05];
  }
  return [slot.x, slot.y + 0.1, slot.z];
}

/**
 * その置き場所を支えている家具（視線の判定から外す）。
 * 天板の上に置くなら、物が家具の上面より上にあるときだけ外す（閉じた家具の中に置いた場所を見逃さない）。
 * 棚の中（shelf）は前が開いている棚にだけ使う決まりなので、家具ごと外して正面の向きだけで見る。
 * 座面（seat）も同じ扱い。背もたれや柱の箱が座面の上まで覆ってしまうため。
 */
function hostsOf(slot, boxes, target) {
  const open = slot.kind === 'shelf' || slot.seat;
  return boxes.filter(b => b.footprint && insideRect(b.footprint, slot.x, slot.z, 0.05) && (open || target[1] >= b.top - 0.03)).map(b => b.id);
}

/** 同じ部屋の、歩ける点（25cmおき） */
export function viewpoints(grid, roomId) {
  const pts = [];
  const same = (r) => r && (r.id === roomId || (roomId === 'hall' && r.id === 'entrance') || (roomId === 'entrance' && r.id === 'hall'));
  for (let z = 0.125; z < HOUSE.depth; z += 0.25) {
    for (let x = 0.125; x < HOUSE.width; x += 0.25) {
      if (!grid.isFree(x, z)) continue;
      if (!same(roomAt(x, z))) continue;
      pts.push([x, HOUSE.eyeHeight, z]);
    }
  }
  return pts;
}

/**
 * 置き場所ごとの見え方。seen＝見える点の割合、nearest＝見える点までの一番近い距離（m）
 * 棚の中と壁掛けは、正面から70度以内の点だけを数える。
 */
export function slotVisibility(manifest, grid) {
  const boxes = occluders(manifest);
  const cache = new Map();
  const out = {};
  for (const slot of SLOTS) {
    if (!cache.has(slot.room)) cache.set(slot.room, viewpoints(grid, slot.room));
    const eyes = cache.get(slot.room);
    const target = slotTarget(slot, manifest);
    const skip = new Set(hostsOf(slot, boxes, target));
    skip.add(slot.kind);
    const frontOnly = slot.kind === 'shelf' || slot.seat || slot.kind === 'wall' || slot.kind === 'mirror';
    const fx = Math.sin(slot.rot * RAD);
    const fz = Math.cos(slot.rot * RAD);
    let seen = 0;
    let nearest = Infinity;
    for (const eye of eyes) {
      const dx = eye[0] - target[0];
      const dz = eye[2] - target[2];
      const dist = Math.hypot(dx, dz);
      if (frontOnly && (dx * fx + dz * fz) / (dist || 1) < Math.cos(70 * RAD)) continue;
      const blocked = boxes.some(b => !skip.has(b.id) && !(b.slot && b.slot === slot.id) && segmentHitsBox(eye, target, b));
      if (blocked) continue;
      seen++;
      nearest = Math.min(nearest, dist);
    }
    out[slot.id] = { seen: eyes.length ? seen / eyes.length : 0, count: seen, of: eyes.length, nearest };
  }
  return out;
}
