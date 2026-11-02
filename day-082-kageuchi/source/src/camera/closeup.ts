// OWNER: core
// 討ち取りの瞬間の寄りの構図（r02-fix-play 追加：体験の採点 5 位「討ち取りは引きの画のままで人物が小さい」）。
// 光秀と信長を横から 4m 前後で見る。駆け寄る蘭丸がいれば、その側を奥に置いて画に入れる。
// E の瞬間は少し引いた位置（cutDistance）へ切り替え、そこから寄りの位置（distance）へ同じ線の上を押し込む。
// どちらの位置も、建物（軒の張り出しぶん広げた箱）・塀・木の中に入る向きと、注視点との間を壁や建物が遮る向きは捨て、
// 好みの向きに近い順に試す。three を import しない（テストで確かめられるように）。
import { VIEW } from '../config/view';
import type { ShotDef } from '../contract/shots';
import type { StageQuery } from '../sim/query';
import type { StageDef } from '../stage/types';

const DEG = Math.PI / 180;

export interface CloseUpInput {
  player: { x: number; z: number };
  target: { x: number; z: number };
  /** 駆け寄る人物（蘭丸）。いなければ null。 */
  watcher: { x: number; z: number } | null;
}

/**
 * カメラを置いてよい所か（カメラの高さは 2〜3m）。ステージの外周の内側で、塀と建物から離れ、建物の軒の下・松の枝ぶり・
 * 背の高い石灯籠に入らない。池・岩・篝火など低い物の上はよい（高さが届かない）。
 */
export function cameraSpotClear(stage: StageDef, q: StageQuery, x: number, z: number): boolean {
  const C = VIEW.assassinate.cam;
  const bd = stage.bounds;
  if (x < bd.x0 + 1 || x > bd.x1 - 1 || z < bd.z0 + 1 || z > bd.z1 - 1) return false;
  const r = C.clearance;
  for (const b of q.boxes) {
    if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
    const rx = x - b.cx;
    const rz = z - b.cz;
    const u = rx * b.ux + rz * b.uz;
    const v = -rx * b.uz + rz * b.ux;
    const du = u - Math.max(-b.hl, Math.min(b.hl, u));
    const dv = v - Math.max(-b.ht, Math.min(b.ht, v));
    if (du * du + dv * dv < r * r) return false;
  }
  for (const b of stage.buildings) {
    const f = b.footprint;
    const m = C.eaveMargin;
    if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return false;
  }
  for (const p of stage.props) {
    const reach = p.kind === 'pine' ? C.pineReach * (p.scale ?? 1) : p.kind === 'stoneLantern' ? p.radius + r : 0;
    if (reach > 0 && Math.hypot(x - p.pos.x, z - p.pos.z) < reach) return false;
  }
  return true;
}

/** 16:9 の画の横の半画角（ラジアン）。 */
function halfWidthAngle(fovDeg: number): number {
  return Math.atan(Math.tan((fovDeg * DEG) / 2) * (16 / 9));
}

/** 寄りの構図。好みの向き（二人を結ぶ線に直角で、蘭丸の側を奥に）から近い順に、置ける向きを探す。 */
export function closeUpShot(stage: StageDef, q: StageQuery, inp: CloseUpInput): ShotDef {
  const C = VIEW.assassinate.cam;
  const { player, target, watcher } = inp;
  const pairD = Math.hypot(target.x - player.x, target.z - player.z);
  // 間合いの外から討った（デバッグの勝ち）ときは、信長だけを見る
  const mid = pairD <= C.pairMax ? { x: (player.x + target.x) / 2, z: (player.z + target.z) / 2 } : { x: target.x, z: target.z };
  const axis = pairD > 1e-6 ? Math.atan2(target.z - player.z, target.x - player.x) : 0;
  let pref = axis + Math.PI / 2;
  if (watcher) {
    const wx = watcher.x - mid.x;
    const wz = watcher.z - mid.z;
    // カメラの前（pref の向き）の奥に蘭丸が来るように、直角の向きを選ぶ
    if (Math.cos(pref) * wx + Math.sin(pref) * wz < 0) pref = axis - Math.PI / 2;
  }
  const cosP = Math.cos(C.pitch * DEG);
  const shot = (yaw: number): ShotDef => ({
    name: 'assassinate',
    target: [mid.x, C.height, mid.z],
    yawDeg: yaw / DEG,
    pitchDeg: C.pitch,
    distance: C.distance,
    fov: C.fov,
    t: 0,
    note: '討ち取りの瞬間の寄り',
  });
  const half = halfWidthAngle(C.fov);
  // 1 巡目は蘭丸が画の中に入る向きだけ、2 巡目は置けさえすればよい
  for (const needWatcher of watcher ? [true, false] : [false]) {
    for (let i = 0; i <= 18; i++) {
      // 0, +20, −20, +40, −40 … ±180
      const off = (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * 20;
      const yaw = pref + off * DEG;
      const ok = [C.distance, C.cutDistance].every((dist) => {
        const cx = mid.x - Math.cos(yaw) * cosP * dist;
        const cz = mid.z - Math.sin(yaw) * cosP * dist;
        if (!cameraSpotClear(stage, q, cx, cz) || q.blocked(cx, cz, mid.x, mid.z)) return false;
        if (!needWatcher || !watcher) return true;
        const a = Math.atan2(watcher.z - cz, watcher.x - cx) - yaw;
        return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < half * C.watcherInFrame;
      });
      if (ok) return shot(yaw);
    }
  }
  return shot(pref);
}

/** 討ち取ってからの sim の秒 te での、sim の速さに掛ける倍率（一閃の間だけ遅くする）。 */
export function assassinateSlow(te: number): number {
  const A = VIEW.assassinate;
  const sm = (a: number, b: number, x: number): number => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const k = Math.min(sm(A.slowFrom - A.ramp, A.slowFrom, te), 1 - sm(A.slowTo, A.slowTo + A.ramp, te));
  return 1 + (A.slow - 1) * k;
}
