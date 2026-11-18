/**
 * 3Dパーティクルプール：単一の InstancedMesh（最大140粒・低ポリ8面体・1ドローコール）で
 * 得点・達成・全制覇・滑り・確保・逃走・店内放送の火花/紙吹雪と、冷凍ケース冷却中の氷晶粒子を描画する。
 */
import * as THREE from 'three';
import type { Vec3, WorldView } from '../../shared/view';
import { PALETTE } from './palette';

export const FX_MAX_PARTICLES = 140;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  size: number;
  age: number;
  life: number;
  gravity: number;
}

const FX_COLORS = {
  red: new THREE.Color(PALETTE.red),
  yellow: new THREE.Color(PALETTE.yellow),
  blue: new THREE.Color(PALETTE.blue),
  green: new THREE.Color(PALETTE.green),
  frost: new THREE.Color(PALETTE.pastelSky),
  cream: new THREE.Color(PALETTE.cream),
} as const;

interface BurstSpec {
  count: number;
  speedMin: number;
  speedMax: number;
  upMin: number;
  upMax: number;
  lifeMin: number;
  lifeMax: number;
  sizeMin: number;
  sizeMax: number;
  gravity: number;
  colors: readonly THREE.Color[];
}

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();

export class Fx3dView {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[];
  private readonly seenPeels = new Set<number>();
  private cursor = 0;
  private rngState = 0x9e3779b9;
  private frostAcc = 0;
  private colorDirty = false;

  constructor() {
    const geo = new THREE.OctahedronGeometry(0.085, 0);
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.white });
    this.mesh = new THREE.InstancedMesh(geo, mat, FX_MAX_PARTICLES);
    this.mesh.name = 'fx-particles';
    this.mesh.count = FX_MAX_PARTICLES;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 3;

    this.particles = Array.from({ length: FX_MAX_PARTICLES }, (_, i) => {
      this.mesh.setColorAt(i, FX_COLORS.cream);
      return {
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        vrx: 0,
        vry: 0,
        size: 1,
        age: 0,
        life: 0,
        gravity: 0,
      };
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.reset();
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.life > 0 && p.age < p.life) n++;
    return n;
  }

  private rand(): number {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  private range(a: number, b: number): number {
    return a + (b - a) * this.rand();
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    gravity: number,
    color: THREE.Color,
  ): void {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % FX_MAX_PARTICLES;
    const p = this.particles[idx]!;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.rx = this.range(0, Math.PI * 2);
    p.ry = this.range(0, Math.PI * 2);
    p.rz = this.range(0, Math.PI * 2);
    p.vrx = this.range(-9, 9);
    p.vry = this.range(-9, 9);
    p.size = size;
    p.age = 0;
    p.life = life;
    p.gravity = gravity;
    this.mesh.setColorAt(idx, color);
    this.colorDirty = true;
  }

  private burst(origin: Vec3, spec: BurstSpec): void {
    for (let i = 0; i < spec.count; i++) {
      const a = this.range(0, Math.PI * 2);
      const spd = this.range(spec.speedMin, spec.speedMax);
      const col = spec.colors[i % spec.colors.length]!;
      this.spawn(
        origin.x + this.range(-0.18, 0.18),
        origin.y + this.range(-0.1, 0.2),
        origin.z + this.range(-0.18, 0.18),
        Math.cos(a) * spd,
        this.range(spec.upMin, spec.upMax),
        Math.sin(a) * spd,
        this.range(spec.sizeMin, spec.sizeMax),
        this.range(spec.lifeMin, spec.lifeMax),
        spec.gravity,
        col,
      );
    }
  }

  update(view: WorldView, dt: number): void {
    const avatarPos = (slot: number): Vec3 | null => view.avatars.find((a) => a.slot === slot)?.pos ?? null;
    for (const e of view.events) {
      switch (e.t) {
        case 'score':
          if (e.points >= 100) {
            this.burst(
              { x: e.pos.x, y: e.pos.y + 0.55, z: e.pos.z },
              {
                count: e.points >= 300 ? 18 : 10,
                speedMin: 1.8,
                speedMax: 4.2,
                upMin: 2.0,
                upMax: 4.5,
                lifeMin: 0.42,
                lifeMax: 0.68,
                sizeMin: 0.85,
                sizeMax: 1.4,
                gravity: 7.5,
                colors: [FX_COLORS.yellow, FX_COLORS.cream, FX_COLORS.red],
              },
            );
          }
          break;
        case 'achieve': {
          const p = avatarPos(e.slot);
          if (p) {
            this.burst(
              { x: p.x, y: p.y + 1.1, z: p.z },
              {
                count: 16,
                speedMin: 2.0,
                speedMax: 4.4,
                upMin: 2.6,
                upMax: 5.0,
                lifeMin: 0.52,
                lifeMax: 0.8,
                sizeMin: 0.9,
                sizeMax: 1.45,
                gravity: 6.2,
                colors: [FX_COLORS.yellow, FX_COLORS.red, FX_COLORS.blue, FX_COLORS.green],
              },
            );
          }
          break;
        }
        case 'complete': {
          const p = avatarPos(e.slot);
          if (p) {
            this.burst(
              { x: p.x, y: p.y + 1.3, z: p.z },
              {
                count: 30,
                speedMin: 2.4,
                speedMax: 5.8,
                upMin: 3.2,
                upMax: 6.4,
                lifeMin: 0.65,
                lifeMax: 0.95,
                sizeMin: 1.0,
                sizeMax: 1.6,
                gravity: 5.0,
                colors: [FX_COLORS.red, FX_COLORS.yellow, FX_COLORS.blue, FX_COLORS.green, FX_COLORS.cream],
              },
            );
          }
          break;
        }
        case 'escape': {
          const p = avatarPos(e.slot);
          if (p) {
            this.burst(
              { x: p.x, y: p.y + 0.9, z: p.z },
              {
                count: 14,
                speedMin: 1.8,
                speedMax: 3.8,
                upMin: 2.2,
                upMax: 4.4,
                lifeMin: 0.45,
                lifeMax: 0.68,
                sizeMin: 0.85,
                sizeMax: 1.3,
                gravity: 4.8,
                colors: [FX_COLORS.green, FX_COLORS.yellow, FX_COLORS.cream],
              },
            );
          }
          break;
        }
        case 'slip':
          this.burst(
            { x: e.pos.x, y: e.pos.y + 0.35, z: e.pos.z },
            {
              count: 12,
              speedMin: 1.6,
              speedMax: 3.4,
              upMin: 2.0,
              upMax: 4.0,
              lifeMin: 0.38,
              lifeMax: 0.58,
              sizeMin: 0.8,
              sizeMax: 1.25,
              gravity: 8.0,
              colors: [FX_COLORS.yellow, FX_COLORS.cream],
            },
          );
          break;
        case 'caught': {
          const p = avatarPos(e.slot);
          if (p) {
            this.burst(
              { x: p.x, y: p.y + 1.0, z: p.z },
              {
                count: 12,
                speedMin: 1.6,
                speedMax: 3.4,
                upMin: 1.8,
                upMax: 3.8,
                lifeMin: 0.38,
                lifeMax: 0.58,
                sizeMin: 0.85,
                sizeMax: 1.3,
                gravity: 7.5,
                colors: [FX_COLORS.red, FX_COLORS.cream],
              },
            );
          }
          break;
        }
        case 'pa': {
          const p = avatarPos(e.slot) ?? { x: -16.4, y: 1.2, z: -13.15 };
          this.burst(
            { x: p.x, y: p.y + 1.35, z: p.z },
            {
              count: 14,
              speedMin: 1.8,
              speedMax: 4.0,
              upMin: 2.2,
              upMax: 4.5,
              lifeMin: 0.48,
              lifeMax: 0.72,
              sizeMin: 0.9,
              sizeMax: 1.35,
              gravity: 4.2,
              colors: [FX_COLORS.blue, FX_COLORS.yellow, FX_COLORS.cream],
            },
          );
          break;
        }
      }
    }

    // 新規バナナの皮出現のきらめき
    const currentPeels = new Set<number>();
    for (const peel of view.peels) {
      currentPeels.add(peel.id);
      if (!this.seenPeels.has(peel.id)) {
        this.seenPeels.add(peel.id);
        this.burst(
          { x: peel.pos.x, y: 0.16, z: peel.pos.z },
          {
            count: 5,
            speedMin: 0.8,
            speedMax: 1.9,
            upMin: 1.2,
            upMax: 2.4,
            lifeMin: 0.3,
            lifeMax: 0.45,
            sizeMin: 0.65,
            sizeMax: 1.0,
            gravity: 6.0,
            colors: [FX_COLORS.yellow, FX_COLORS.cream],
          },
        );
      }
    }
    for (const id of this.seenPeels) if (!currentPeels.has(id)) this.seenPeels.delete(id);

    const safeDt = Math.min(0.05, Math.max(0, dt));
    // 冷凍ケース冷却中：頭上に淡い水色とクリームの氷晶がふわりと昇る
    if (view.phase === 'playing' && view.stations.freezerSlots.length > 0) {
      this.frostAcc += safeDt;
      while (this.frostAcc >= 0.09) {
        this.frostAcc -= 0.09;
        for (const slot of view.stations.freezerSlots) {
          const av = avatarPos(slot);
          if (!av) continue;
          for (let k = 0; k < 2; k++) {
            this.spawn(
              av.x + this.range(-0.35, 0.35),
              av.y + this.range(0.55, 1.05),
              av.z + this.range(-0.35, 0.35),
              this.range(-0.35, 0.35),
              this.range(0.75, 1.35),
              this.range(-0.35, 0.35),
              this.range(0.65, 1.05),
              this.range(0.55, 0.85),
              -0.25,
              k === 0 ? FX_COLORS.frost : FX_COLORS.cream,
            );
          }
        }
      }
    } else {
      this.frostAcc = 0;
    }

    for (let i = 0; i < FX_MAX_PARTICLES; i++) {
      const p = this.particles[i]!;
      if (p.life <= 0) continue;
      p.age += safeDt;
      if (p.age >= p.life) {
        p.life = 0;
        m4.compose(pos.set(0, -50, 0), quat.identity(), scl.set(0, 0, 0));
        this.mesh.setMatrixAt(i, m4);
        continue;
      }
      p.vy -= p.gravity * safeDt;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.z += p.vz * safeDt;
      if (p.y < 0.04) {
        p.y = 0.04;
        p.vy = Math.abs(p.vy) * 0.3;
      }
      p.rx += p.vrx * safeDt;
      p.ry += p.vry * safeDt;
      const t = p.age / p.life;
      const s = p.size * (1 - t * t);
      quat.setFromEuler(euler.set(p.rx, p.ry, p.rz));
      m4.compose(pos.set(p.x, p.y, p.z), quat, scl.setScalar(s));
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colorDirty && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.colorDirty = false;
    }
  }

  reset(): void {
    this.seenPeels.clear();
    this.frostAcc = 0;
    for (let i = 0; i < FX_MAX_PARTICLES; i++) {
      this.particles[i]!.life = 0;
      this.particles[i]!.age = 0;
      m4.compose(pos.set(0, -50, 0), quat.identity(), scl.set(0, 0, 0));
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
