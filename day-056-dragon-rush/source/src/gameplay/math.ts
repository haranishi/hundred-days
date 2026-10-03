// OWNER: gameplay
// 遊びの規則で使う小さなベクトルの道具。three を読まない（規則は描画と切り離してテストする）。
// 向き（yaw）の約束は竜の表示と同じ：+z（南）を 0 とし、上から見て反時計回り。前 = (sin yaw, 0, cos yaw)。

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const len3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distXZ = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);
export const tuple = (a: Vec3): [number, number, number] => [a.x, a.y, a.z];

export function normalize3(a: Vec3): Vec3 {
  const l = len3(a);
  if (l > 1e-9) {
    a.x /= l;
    a.y /= l;
    a.z /= l;
  }
  return a;
}

/** 向きから前の単位ベクトル（水平）。 */
export function forwardOf(yaw: number): Vec3 {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

/** 向きと俯仰（上が正）から視線の単位ベクトル。 */
export function directionOf(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: Math.cos(yaw) * c };
}

/** 水平ベクトルの向き（yaw）。 */
export const yawOf = (x: number, z: number): number => Math.atan2(x, z);

/** 局所座標（+x 左・+y 上・+z 前）を、原点 origin と向き yaw でワールドへ。 */
export function localToWorld(origin: Vec3, yaw: number, lx: number, ly: number, lz: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: origin.x + lx * c + lz * s, y: origin.y + ly, z: origin.z - lx * s + lz * c };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const DEG = Math.PI / 180;
