// OWNER: core
// r06-physics: 円の移動を面・角・柱・池へ掃引し、最初の接触で残りの移動を接線へ投影する。
// 着地点だけを押し戻す方式と違い、薄い塀や柱の反対側へ抜けない。three に依存しない。
import { PHYSICS } from '../config/rules';
import type { Box, Circle, StageQuery } from './query';

interface Hit { t: number; nx: number; nz: number }
const EPS = PHYSICS.epsilon;

function circleHit(x: number, z: number, dx: number, dz: number, cx: number, cz: number, r: number): Hit | null {
  const ox = x - cx;
  const oz = z - cz;
  const a = dx * dx + dz * dz;
  const dot = ox * dx + oz * dz;
  if (a < EPS * EPS || dot >= 0) return null;
  const c = ox * ox + oz * oz - r * r;
  const disc = dot * dot - a * c;
  if (disc < 0) return null;
  const t = c <= 0 ? 0 : (-dot - Math.sqrt(disc)) / a;
  if (t < -EPS || t > 1) return null;
  const hx = ox + dx * Math.max(0, t);
  const hz = oz + dz * Math.max(0, t);
  const len = Math.hypot(hx, hz);
  if (len < EPS || hx * dx + hz * dz >= -EPS) return null;
  return { t: Math.max(0, t), nx: hx / len, nz: hz / len };
}

function boxHit(b: Box, x: number, z: number, dx: number, dz: number, r: number): Hit | null {
  const ox = x - b.cx;
  const oz = z - b.cz;
  const u = ox * b.ux + oz * b.uz;
  const v = -ox * b.uz + oz * b.ux;
  const du = dx * b.ux + dz * b.uz;
  const dv = -dx * b.uz + dz * b.ux;
  let best: Hit | null = null;
  const take = (hit: Hit | null): void => {
    if (hit && (!best || hit.t < best.t)) best = hit;
  };
  // 平らな面と、角の四分円を別に測る。角を四角く膨らませないので門の隙間を狭めない。
  for (const side of [-1, 1]) {
    if (du * side < -EPS) {
      const t = (side * (b.hl + r) - u) / du;
      if (t >= -EPS && t <= 1 && Math.abs(v + dv * t) <= b.ht + EPS) take({ t: Math.max(0, t), nx: side, nz: 0 });
    }
    if (dv * side < -EPS) {
      const t = (side * (b.ht + r) - v) / dv;
      if (t >= -EPS && t <= 1 && Math.abs(u + du * t) <= b.hl + EPS) take({ t: Math.max(0, t), nx: 0, nz: side });
    }
    for (const end of [-1, 1]) take(circleHit(u, v, du, dv, side * b.hl, end * b.ht, r));
  }
  if (!best) return null;
  const hit = best as Hit;
  return { t: hit.t, nx: hit.nx * b.ux - hit.nz * b.uz, nz: hit.nx * b.uz + hit.nz * b.ux };
}

function firstHit(q: StageQuery, x: number, z: number, dx: number, dz: number, r: number, crouch: boolean, bodies: readonly Circle[]): Hit | null {
  let best: Hit | null = null;
  const take = (hit: Hit | null): void => {
    if (hit && (!best || hit.t < best.t)) best = hit;
  };
  const x0 = Math.min(x, x + dx) - r;
  const x1 = Math.max(x, x + dx) + r;
  const z0 = Math.min(z, z + dz) - r;
  const z1 = Math.max(z, z + dz) + r;
  for (const b of q.boxes) {
    if ((crouch && b.crawl) || b.maxX < x0 || b.minX > x1 || b.maxZ < z0 || b.minZ > z1) continue;
    take(boxHit(b, x, z, dx, dz, r));
  }
  const checkCircle = (c: Circle): void => {
    if (c.x + c.r < x0 || c.x - c.r > x1 || c.z + c.r < z0 || c.z - c.r > z1) return;
    take(circleHit(x, z, dx, dz, c.x, c.z, r + c.r));
  };
  for (const c of q.circles) checkCircle(c);
  for (const c of bodies) checkCircle(c);
  for (const e of q.ellipses) {
    const ax = e.rx + r;
    const az = e.rz + r;
    if (e.cx + ax < x0 || e.cx - ax > x1 || e.cz + az < z0 || e.cz - az > z1) continue;
    const hit = circleHit((x - e.cx) / ax, (z - e.cz) / az, dx / ax, dz / az, 0, 0, 1);
    if (!hit) continue;
    const nx = hit.nx / ax;
    const nz = hit.nz / az;
    const len = Math.hypot(nx, nz);
    take({ t: hit.t, nx: nx / len, nz: nz / len });
  }
  const bd = q.stage.bounds;
  if (dx < -EPS && x + dx < bd.x0 + r) take({ t: Math.max(0, (bd.x0 + r - x) / dx), nx: 1, nz: 0 });
  if (dx > EPS && x + dx > bd.x1 - r) take({ t: Math.max(0, (bd.x1 - r - x) / dx), nx: -1, nz: 0 });
  if (dz < -EPS && z + dz < bd.z0 + r) take({ t: Math.max(0, (bd.z0 + r - z) / dz), nx: 0, nz: 1 });
  if (dz > EPS && z + dz > bd.z1 - r) take({ t: Math.max(0, (bd.z1 - r - z) / dz), nx: 0, nz: -1 });
  return best;
}

/** out は開始位置。与えられた移動量の範囲で衝突・滑りを解き、終了位置を書く。 */
export function moveCircle(q: StageQuery, out: { x: number; z: number }, dx: number, dz: number, r: number, crouch: boolean, bodies: readonly Circle[] = []): void {
  if (q.overlaps(out.x, out.z, r, crouch)) q.resolve(out, r, crouch);
  let x = out.x;
  let z = out.z;
  for (let i = 0; i < PHYSICS.slideIterations; i++) {
    const length = Math.hypot(dx, dz);
    if (length < EPS) break;
    const hit = firstHit(q, x, z, dx, dz, r, crouch, bodies);
    if (!hit) {
      x += dx;
      z += dz;
      break;
    }
    const t = Math.max(0, hit.t - PHYSICS.skin / length);
    x += dx * t;
    z += dz * t;
    dx *= 1 - hit.t;
    dz *= 1 - hit.t;
    const into = dx * hit.nx + dz * hit.nz;
    if (into < 0) {
      dx -= hit.nx * into;
      dz -= hit.nz * into;
    }
  }
  out.x = x;
  out.z = z;
}
