// 家具と小物を置く位置の計算（three.js を使わない純粋な計算）。
// 置き場所の x・z は物の外形の中心、y は物の底（壁掛けは中心）に合わせる。
import { FURNITURE, PROPS } from './catalog.js';
import { FIXTURES, HOUSE, SLOTS } from './plan.js';

const RAD = Math.PI / 180;

/** 素材の外形（m、倍率込み・回す前） */
export function localBox(manifest, entry) {
  const m = manifest.models[entry.file];
  if (!m) throw new Error(`寸法がありません: ${entry.file}`);
  const s = entry.scale ?? 1;
  return { min: m.min.map(v => v * s), max: m.max.map(v => v * s) };
}

function rotateXZ(x, z, deg) {
  const t = deg * RAD;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * 物の原点の位置と回転を求める。
 * mode: 'floor'＝底をyに、'wall'＝背面を壁に付けて中心をyに、'ceiling'＝上端を天井に
 * 戻り値の footprint は床に落とした外形（回転した長方形）で、当たり判定に使う。
 */
export function placeEntry(manifest, entry, { x, y = 0, z, rot = 0, mode = 'floor' }) {
  const box = localBox(manifest, entry);
  const yaw = (entry.front ?? 0) + rot;
  const cx = (box.min[0] + box.max[0]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  const [rcx, rcz] = rotateXZ(cx, cz, yaw);
  const hx = (box.max[0] - box.min[0]) / 2;
  const hz = (box.max[2] - box.min[2]) / 2;
  const height = box.max[1] - box.min[1];
  let tx = x;
  let tz = z;
  let py;
  if (mode === 'wall') {
    // 正面の向き（rot）へ厚みの半分だけ壁から離す
    const [fx, fz] = rotateXZ(0, 1, rot);
    const depth = Math.abs((entry.front ?? 0) % 180) === 90 ? hx : hz;
    tx += fx * depth;
    tz += fz * depth;
    py = y - (box.min[1] + height / 2);
  } else if (mode === 'ceiling') {
    py = HOUSE.wallHeight - box.max[1];
  } else {
    py = y - box.min[1];
  }
  return {
    position: [tx - rcx, py, tz - rcz],
    yaw,
    center: [tx, py + box.min[1] + height / 2, tz],
    height,
    base: py + box.min[1],
    footprint: { cx: tx, cz: tz, hx, hz, yaw }
  };
}

export function placeFixture(manifest, fixture) {
  return placeEntry(manifest, FURNITURE[fixture.model], {
    x: fixture.x, z: fixture.z, rot: fixture.rot, mode: fixture.ceiling ? 'ceiling' : 'floor'
  });
}

export function placeProp(manifest, id, slotId, yawJitter = 0) {
  const slot = SLOTS.find(s => s.id === slotId);
  return placeEntry(manifest, PROPS[id], {
    x: slot.x, y: slot.y, z: slot.z, rot: slot.rot + yawJitter, mode: slot.kind === 'wall' || slot.kind === 'mirror' ? 'wall' : 'floor'
  });
}

/** 床に置かれて歩く邪魔になる置き場所の種類 */
export const FLOOR_KINDS = new Set(['floor', 'armchair', 'rocking-chair', 'tall-plant', 'grandfather-clock', 'school-chair', 'suitcase']);

/** 歩けない場所（回転した長方形）の一覧。hidden に入れた小物は数えない */
export function obstacles(manifest, arrangement, hidden = []) {
  const list = [];
  for (const f of FIXTURES) {
    if (f.ceiling) continue;
    list.push({ ...placeFixture(manifest, f).footprint, id: f.id });
  }
  for (const [id, a] of Object.entries(arrangement)) {
    if (hidden.includes(id)) continue;
    const slot = SLOTS.find(s => s.id === a.slot);
    if (!FLOOR_KINDS.has(slot.kind)) continue;
    list.push({ ...placeProp(manifest, id, a.slot, a.yaw).footprint, id });
  }
  return list;
}

/** 回転した長方形の中に点があるか（margin だけ太らせる） */
export function insideRect(r, x, z, margin = 0) {
  const [lx, lz] = rotateXZ(x - r.cx, z - r.cz, -r.yaw);
  return Math.abs(lx) <= r.hx + margin && Math.abs(lz) <= r.hz + margin;
}
