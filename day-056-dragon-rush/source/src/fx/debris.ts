// OWNER: fx
// 破片（外壁のかけら・コンクリートの塊）をインスタンスでまとめて描く。落ちて跳ね、止まったら瓦礫として残る（一瞬で消さない）。
// 動いている破片と、止まった破片を別のメッシュに分け、止まった側は書き足した範囲だけを GPU へ送る。
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { AMBIENT } from '../config/render';
import type { Rng } from '../core/rng';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import type { DebrisPiece } from './debrisPlan';

/** ゆがんだ箱（平らな面の法線）。12三角形。 */
function chunkGeometry(): BufferGeometry {
  const c: [number, number, number][] = [];
  const j = [0.82, 1.1, 0.95, 1.2, 0.9, 1.05, 1.15, 0.88];
  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? 0.5 : -0.5) * j[i];
    const y = (i & 2 ? 0.5 : -0.5) * j[(i + 3) % 8] * 0.7;
    const z = (i & 4 ? 0.5 : -0.5) * j[(i + 5) % 8];
    c.push([x, y, z]);
  }
  const faces = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const pos: number[] = [];
  const nrm: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  for (const f of faces) {
    for (const tri of [
      [f[0], f[1], f[2]],
      [f[0], f[2], f[3]],
    ]) {
      const p = tri.map((k) => new Vector3(...c[k]));
      const n = a.subVectors(p[1], p[0]).cross(b.subVectors(p[2], p[0])).normalize();
      for (const q of p) {
        pos.push(q.x, q.y, q.z);
        nrm.push(n.x, n.y, n.z);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.computeBoundingSphere();
  return g;
}

export interface DebrisSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: Color;
  /** r03-fx：3軸の大きさの比（既定 1,1,1）・重力の倍率（既定 1）・跳ね返り（既定 0.22）・回転の速さ（rad/s、既定 3）・粗さと金属らしさ */
  scale?: readonly [number, number, number];
  gravity?: number;
  /** r04-fx2：空気の抵抗（1/秒、既定 0）。小さく軽い破片ほど大きい */
  drag?: number;
  bounce?: number;
  spin?: number;
  rough?: number;
  metal?: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _dq = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _axis = new Vector3();
const _c = new Color();

export class DebrisField {
  readonly group = new Group();
  private readonly moving: InstancedMesh;
  private readonly settled: InstancedMesh;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly q: Float32Array;
  private readonly w: Float32Array;
  private readonly size: Float32Array;
  private readonly colors: Color[] = [];
  /** r03-fx：3軸の大きさの比・重力の倍率・跳ね返り・表面（粗さ・金属らしさ） */
  private readonly scale: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly bounce: Float32Array;
  private readonly surf: Float32Array;
  private readonly movingSurf: InstancedBufferAttribute;
  private readonly settledSurf: InstancedBufferAttribute;
  private count = 0;
  private settledCount = 0;
  private settledCursor = 0;
  /** r04-fx2：いま空中にある破片の、このコマの下向きの加速（m/s²）の平均。大（長い辺 2.2m 以上）・中・小（0.9m 未満）。撮影の記録用 */
  private readonly fall = { L: 0, M: 0, S: 0 };

  constructor(kit: MaterialKit, private readonly capacity: number, private readonly settledCapacity: number) {
    this.group.name = 'debris';
    const material = kit.patch(
      new MeshStandardMaterial({ roughness: 0.92, metalness: 0.02, envMapIntensity: AMBIENT.envIntensity }),
      {
        key: 'debris',
        // r03-fx：破片ごとの粗さと金属らしさ（コンクリは粗く、ガラスは空を映す）
        vertex: (src) =>
          replaceOrThrow(
            replaceOrThrow(src, '#include <common>', '#include <common>\nattribute vec2 iSurf;\nvarying vec2 vSurf;'),
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvSurf = iSurf;',
          ),
        fragment: (src) =>
          replaceOrThrow(
            replaceOrThrow(
              replaceOrThrow(src, '#include <common>', '#include <common>\nvarying vec2 vSurf;'),
              '#include <roughnessmap_fragment>',
              '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;',
            ),
            '#include <metalnessmap_fragment>',
            '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;',
          ),
      },
    );
    material.name = 'Debris';
    const geometry = chunkGeometry();
    const settledGeometry = geometry.clone();
    this.movingSurf = new InstancedBufferAttribute(new Float32Array(capacity * 2).fill(0.9), 2);
    this.movingSurf.setUsage(DynamicDrawUsage);
    this.settledSurf = new InstancedBufferAttribute(new Float32Array(settledCapacity * 2).fill(0.9), 2);
    geometry.setAttribute('iSurf', this.movingSurf);
    settledGeometry.setAttribute('iSurf', this.settledSurf);
    this.moving = new InstancedMesh(geometry, material, capacity);
    this.moving.instanceMatrix.setUsage(DynamicDrawUsage);
    this.moving.count = 0;
    this.moving.frustumCulled = false;
    this.moving.castShadow = true;
    this.moving.receiveShadow = true;
    this.moving.name = 'debris-moving';
    this.settled = new InstancedMesh(settledGeometry, material, settledCapacity);
    this.settled.count = 0;
    this.settled.frustumCulled = false;
    this.settled.receiveShadow = true;
    this.settled.name = 'debris-settled';
    // 色の属性を先に作る（最初の setColorAt で作ると、材質の組み直しが1回起きる）
    this.moving.setColorAt(0, new Color(1, 1, 1));
    this.settled.setColorAt(0, new Color(1, 1, 1));
    this.group.add(this.moving, this.settled);
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.q = new Float32Array(capacity * 4);
    this.w = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.scale = new Float32Array(capacity * 3);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.bounce = new Float32Array(capacity);
    this.surf = new Float32Array(capacity * 2);
    for (let i = 0; i < capacity; i++) this.colors.push(new Color());
  }

  spawn(s: DebrisSpawn, rng: Rng): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.p.set([s.x, s.y, s.z], i * 3);
    this.v.set([s.vx, s.vy, s.vz], i * 3);
    _q.setFromAxisAngle(_axis.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(), rng.range(0, Math.PI));
    this.q.set([_q.x, _q.y, _q.z, _q.w], i * 4);
    // 回転の速さ：大きい塊ほどゆっくり回る（spin）
    const spin = s.spin ?? 3;
    _axis.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(spin);
    this.w.set([_axis.x, _axis.y, _axis.z], i * 3);
    this.size[i] = s.size;
    this.colors[i].copy(s.color);
    const sc = s.scale ?? [1, 1, 1];
    this.scale.set([sc[0], sc[1], sc[2]], i * 3);
    this.grav[i] = s.gravity ?? 1;
    this.drag[i] = s.drag ?? 0;
    this.bounce[i] = s.bounce ?? 0.22;
    this.surf[i * 2] = s.rough ?? 0.92;
    this.surf[i * 2 + 1] = s.metal ?? 0.02;
  }

  /** r03-fx：配り方（debrisPlan.ts）で決めた破片を1つ出す。 */
  spawnPiece(p: DebrisPiece, rng: Rng): void {
    const len = Math.max(p.sx, p.sy, p.sz);
    _c.setRGB(p.r, p.g, p.b);
    this.spawn(
      { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, size: len, color: _c, scale: [p.sx / len, p.sy / len, p.sz / len], gravity: p.gravity, drag: p.drag, bounce: p.bounce, spin: p.spin, rough: p.rough, metal: p.metal },
      rng,
    );
  }

  update(dt: number, groundAt: (x: number, z: number) => number): void {
    if (dt > 0) {
      const sum = { L: 0, M: 0, S: 0 };
      const num = { L: 0, M: 0, S: 0 };
      for (let i = 0; i < this.count; i++) {
        const o = i * 3;
        // r04-fx2：重力はそのまま（9.8 m/s² × 倍率）。空気の抵抗は速さに比例して減らす（小さく軽いものほど落ちる速さの上限が低い）
        const k = Math.max(0, 1 - this.drag[i] * dt);
        const vy0 = this.v[o + 1];
        this.v[o] *= k;
        this.v[o + 1] = this.v[o + 1] * k - 9.8 * this.grav[i] * dt;
        this.v[o + 2] *= k;
        const cls = this.size[i] >= 2.2 ? 'L' : this.size[i] >= 0.9 ? 'M' : 'S';
        sum[cls] += (vy0 - this.v[o + 1]) / dt;
        num[cls]++;
        this.p[o] += this.v[o] * dt;
        this.p[o + 1] += this.v[o + 1] * dt;
        this.p[o + 2] += this.v[o + 2] * dt;
        _q.fromArray(this.q, i * 4);
        _axis.fromArray(this.w, o);
        const speed = _axis.length();
        if (speed > 1e-4) {
          _dq.setFromAxisAngle(_axis.multiplyScalar(1 / speed), speed * dt);
          _q.premultiply(_dq).normalize();
          _q.toArray(this.q, i * 4);
        }
        const gy = groundAt(this.p[o], this.p[o + 2]);
        const floor = gy + this.size[i] * this.scale[o + 1] * 0.45;
        if (this.p[o + 1] < floor && this.v[o + 1] < 0) {
          if (gy < -0.5) {
            // 水に落ちたものは沈んで消える
            this.remove(i--);
            continue;
          }
          this.p[o + 1] = floor;
          this.v[o + 1] *= -this.bounce[i];
          this.v[o] *= 0.35 + this.bounce[i];
          this.v[o + 2] *= 0.35 + this.bounce[i];
          for (let k = 0; k < 3; k++) this.w[o + k] *= 0.5;
          if (Math.abs(this.v[o + 1]) < 1.6 && Math.hypot(this.v[o], this.v[o + 2]) < 2) {
            this.settle(i);
            this.remove(i--);
          }
        }
      }
      // 空中の破片の加速の平均（跳ね返りの前に測るので、地面の刻みは入らない）
      for (const c of ['L', 'M', 'S'] as const) this.fall[c] = num[c] > 0 ? Math.round((sum[c] / num[c]) * 100) / 100 : 0;
    }
    const ms = this.movingSurf.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      this.matrixOf(i, _m);
      this.moving.setMatrixAt(i, _m);
      this.moving.setColorAt(i, this.colors[i]);
      ms[i * 2] = this.surf[i * 2];
      ms[i * 2 + 1] = this.surf[i * 2 + 1];
    }
    this.moving.count = this.count;
    this.moving.instanceMatrix.needsUpdate = true;
    if (this.moving.instanceColor) this.moving.instanceColor.needsUpdate = true;
    this.movingSurf.clearUpdateRanges();
    this.movingSurf.addUpdateRange(0, Math.max(1, this.count) * 2);
    this.movingSurf.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.settledCount = 0;
    this.settledCursor = 0;
    this.moving.count = 0;
    this.settled.count = 0;
  }

  get movingCount(): number {
    return this.count;
  }

  get settledTotal(): number {
    return this.settledCount;
  }

  /** r04-fx2：いま空中にある破片の、最後のコマの下向きの加速（m/s²）の平均（大・中・小）。 */
  fallAccel(): { L: number; M: number; S: number } {
    return { ...this.fall };
  }

  /** シェーダーを先に作らせるため、1個だけ見える状態にする（影の材質は描いて初めて作られる）。 */
  prime(on: boolean): void {
    this.moving.count = on ? 1 : this.count;
    this.settled.count = on ? 1 : this.settledCount;
  }

  private matrixOf(i: number, out: Matrix4): Matrix4 {
    _q.fromArray(this.q, i * 4);
    _v.fromArray(this.p, i * 3);
    const s = this.size[i];
    const o = i * 3;
    return out.compose(_v, _q, _s.set(s * this.scale[o], s * this.scale[o + 1], s * this.scale[o + 2]));
  }

  private settle(i: number): void {
    const slot = this.settledCursor++ % this.settledCapacity;
    this.settledCount = Math.min(this.settledCapacity, this.settledCount + 1);
    this.settled.setMatrixAt(slot, this.matrixOf(i, _m));
    this.settled.setColorAt(slot, this.colors[i]);
    const ss = this.settledSurf.array as Float32Array;
    ss[slot * 2] = this.surf[i * 2];
    ss[slot * 2 + 1] = this.surf[i * 2 + 1];
    this.settledSurf.addUpdateRange(slot * 2, 2);
    this.settledSurf.needsUpdate = true;
    this.settled.count = this.settledCount;
    this.settled.instanceMatrix.needsUpdate = true;
    if (this.settled.instanceColor) this.settled.instanceColor.needsUpdate = true;
  }

  private remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.p.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.v.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.q.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.w.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.size[i] = this.size[last];
    this.colors[i].copy(this.colors[last]);
    this.scale.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.bounce[i] = this.bounce[last];
    this.surf.copyWithin(i * 2, last * 2, last * 2 + 2);
  }
}
