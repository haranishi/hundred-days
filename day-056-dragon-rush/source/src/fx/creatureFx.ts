// OWNER: fx
// 雷翼と焔角の技の見た目（r03-roster）：枝分かれする雷の筋と当たった所の閃光、落雷の輪、溶岩の礫（光る岩・尾の火の粉と煙・弾けた所の飛び散り）、
// 地割れの赤い筋と土煙、突進の土煙。遊びの出来事（lightning.*・lava.*・fissure.*）と状態を読むだけで、遊びの規則には書き込まない。
// 窓ガラス・破片・崩れ・火事の見た目は、遊びの側が出す glass.shatter・building.*・fire.* を fxDirector.ts がそのまま描く。
// 乱数は自分の系列（fx-creature）を使う。紅竜の効果の系列（fx）を引かないので、紅竜の撮影は1枚も変わらない。
import { Color, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { CREATURE_FX as F, CREATURE_FX_BUDGET } from '../config/creatureFx';
import { WIND } from '../config/fx';
import type { QualityName } from '../config/quality';
import type { P3 } from '../core/events';
import { stream, type Rng } from '../core/rng';
import type { Game } from '../gameplay/game';
import type { Atmosphere } from '../render/atmosphereGpu';
import { ParticleLayer, SHAPE } from './particles';
import { RibbonField } from './ribbons';

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _bp = new Vector3();
const _axis = new Vector3(0.3, 1, 0.2).normalize();

export class CreatureFx {
  readonly group = new Group();
  private readonly add: ParticleLayer;
  private readonly soft: ParticleLayer;
  private readonly bolts: RibbonField;
  private readonly glow: RibbonField;
  private readonly gash: RibbonField;
  private readonly rocks: InstancedMesh;
  private readonly rng: Rng = stream(20260930, 'fx-creature');
  private readonly acc = new Map<string, number>();
  /** 礫ごとの「見た目の口 − 遊びの側の口」（投げてすぐの間だけ足して、口から出たように見せる） */
  private readonly bombOffset = new Map<number, Vector3>();
  /** 地割れごとの、前の裂け目の点 */
  private readonly crackPrev = new Map<number, Vector3>();
  private readonly mouthNow = new Vector3();
  private time = 0;
  private primed = false;

  constructor(
    private readonly game: Game,
    atmosphere: Atmosphere,
    quality: QualityName,
    /** 見た目の口のワールド座標（竜の表示から） */
    private readonly mouth: (out: Vector3) => Vector3,
  ) {
    const B = CREATURE_FX_BUDGET[quality];
    this.group.name = 'creatureFx';
    this.add = new ParticleLayer(B.additive, 'additive', atmosphere);
    this.soft = new ParticleLayer(B.soft, 'soft', atmosphere);
    this.bolts = new RibbonField(B.ribbonVerts, 'add', 'CreatureBolts');
    this.glow = new RibbonField(Math.round(B.ribbonVerts / 3), 'add', 'CreatureCrackGlow');
    this.gash = new RibbonField(Math.round(B.ribbonVerts / 3), 'multiply', 'CreatureCrackGash');
    const rockMat = new MeshBasicMaterial({ color: new Color(...F.lava.color), fog: false });
    rockMat.name = 'CreatureLavaRock';
    this.rocks = new InstancedMesh(new IcosahedronGeometry(1, 1), rockMat, 48);
    this.rocks.name = 'creatureLavaRocks';
    this.rocks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rocks.frustumCulled = false;
    this.rocks.count = 0;
    this.rocks.visible = false;
    this.rocks.castShadow = false;
    this.group.add(this.gash.mesh, this.glow.mesh, this.bolts.mesh, this.rocks, this.soft.mesh, this.add.mesh);
    this.subscribe();
  }

  /** 水面の鏡像に映さない物（土煙と黒い裂け目）。 */
  get mirrorHidden(): Object3D[] {
    return [this.soft.mesh, this.gash.mesh];
  }

  /** いま出ている効果の数（調べもの用）。 */
  stats(): { additive: number; soft: number; ribbons: number; rocks: number } {
    return { additive: this.add.pool.count, soft: this.soft.pool.count, ribbons: this.bolts.count + this.glow.count + this.gash.count, rocks: this.rocks.count };
  }

  /** 起動時にシェーダーを作らせるため、全部を1つずつ見える状態にする。 */
  prime(on: boolean): void {
    this.primed = on;
    this.add.prime(on);
    this.soft.prime(on);
    this.bolts.prime(on);
    this.glow.prime(on);
    this.gash.prime(on);
    this.rocks.count = on ? 1 : 0;
    if (on) this.rocks.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001));
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocks.visible = on;
  }

  clear(): void {
    this.add.pool.clear();
    this.soft.pool.clear();
    this.bolts.clear();
    this.glow.clear();
    this.gash.clear();
    this.bombOffset.clear();
    this.crackPrev.clear();
    this.acc.clear();
    this.rocks.count = 0;
    this.rocks.visible = false;
  }

  private every(key: string, rate: number, dt: number, fn: () => void): void {
    let a = (this.acc.get(key) ?? 0) + rate * dt;
    let guard = 0;
    while (a >= 1 && guard++ < 200) {
      fn();
      a -= 1;
    }
    this.acc.set(key, a);
  }

  private subscribe(): void {
    const bus = this.game.bus;
    bus.on('lightning.hop', (e) => this.onHop(e.hop, e.from, e.to, e.id));
    bus.on('lightning.bolt', (e) => this.onSkyBolt(e.pos));
    bus.on('lava.launch', (e) => {
      const m = this.mouth(new Vector3());
      this.bombOffset.set(e.id, new Vector3(m.x - e.pos[0], m.y - e.pos[1], m.z - e.pos[2]));
      this.flash(m.x, m.y, m.z, 6, 5, F.lava.sparkColor, 0.2);
    });
    bus.on('lava.impact', (e) => this.onLavaImpact(e.id, e.pos));
    bus.on('fissure.start', (e) => this.crackPrev.set(e.id, new Vector3(e.pos[0], e.pos[1], e.pos[2])));
    bus.on('fissure.crack', (e) => this.onCrack(e.id, e.pos, e.index));
    bus.on('dragon.jump', (e) => {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        this.dust(e.pos[0] + Math.cos(a) * 8, e.pos[1] + 1, e.pos[2] + Math.sin(a) * 8, Math.cos(a) * 12, 2, Math.sin(a) * 12, 12, 2.4);
      }
    });
  }

  /** 両端の間の折れ線（横へ散らす。端は動かさない）。points は x,y,z の並び。 */
  private jagged(a: Vector3, b: Vector3, segments: number, jitter: number): number[] {
    const d = _p.subVectors(b, a);
    const len = d.length();
    const amp = Math.min(F.bolt.jitterMax, jitter * len);
    // 横の2方向（筋に直交）
    const t = new Vector3(0, 1, 0).cross(d).normalize();
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    const u = new Vector3().crossVectors(d, t).normalize();
    const pts: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const f = i / segments;
      const env = Math.sin(Math.PI * f);
      const ox = this.rng.range(-1, 1) * amp * env;
      const oy = this.rng.range(-1, 1) * amp * env;
      pts.push(a.x + d.x * f + t.x * ox + u.x * oy, a.y + d.y * f + t.y * ox + u.y * oy, a.z + d.z * f + t.z * ox + u.z * oy);
    }
    return pts;
  }

  /** 1本の雷（芯・にじみ・枝）。anchored なら始点を見た目の口に付けて動かす。 */
  private bolt(a: Vector3, b: Vector3, anchored: boolean, life: number = F.bolt.life): void {
    const B = F.bolt;
    const pts = this.jagged(a, b, B.segments, B.jitter);
    const anchor = anchored ? (): Vector3 => this.mouth(this.mouthNow) : null;
    const base = { born: this.time, life, flickerHz: B.flickerHz, hold: life * 0.35, flat: false, grow: 0, anchor, taper: false };
    this.bolts.add({ ...base, points: [...pts], width: B.halo.width, color: B.halo.color });
    this.bolts.add({ ...base, points: pts, width: B.core.width, color: B.core.color });
    const len = a.distanceTo(b);
    for (let k = 0; k < B.branches; k++) {
      const i = 2 + Math.floor(this.rng.range(0, B.segments - 4));
      const from = new Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      const dir = new Vector3().subVectors(b, a).normalize();
      dir.x += this.rng.range(-0.8, 0.8);
      dir.y += this.rng.range(-0.8, 0.3);
      dir.z += this.rng.range(-0.8, 0.8);
      dir.normalize();
      const to = from.clone().addScaledVector(dir, len * B.branchLength * this.rng.range(0.5, 1));
      this.bolts.add({ ...base, anchor: null, points: this.jagged(from, to, 6, B.jitter * 1.4), width: B.core.width * 0.8, color: B.core.color, taper: true });
    }
  }

  private onHop(hop: number, from: P3, to: P3, id: number): void {
    const a = new Vector3(from[0], from[1], from[2]);
    if (hop === 0) this.mouth(a);
    const b = new Vector3(to[0], to[1], to[2]);
    this.bolt(a, b, hop === 0);
    const H = F.hitFlash;
    const k = id >= 0 ? 1 : 0.6;
    this.flash(b.x, b.y, b.z, H.size * k, H.intensity * k, H.color, 0.22);
    for (let s = 0; s < H.sparks * k; s++) this.spark(b.x, b.y, b.z, this.rng.range(-12, 12), this.rng.range(-4, 14), this.rng.range(-12, 12), H.color, 5, this.rng.range(0.4, 0.9));
  }

  private onSkyBolt(pos: P3): void {
    const S = F.skyBolt;
    const b = new Vector3(pos[0], pos[1], pos[2]);
    const a = new Vector3(b.x + this.rng.range(-30, 30), b.y + S.skyHeight, b.z + this.rng.range(-30, 30));
    this.bolt(a, b, false, S.life);
    this.flash(b.x, b.y + 4, b.z, S.flash, 9, F.hitFlash.color, 0.3);
    for (let k = 0; k < S.dust; k++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(8, 20);
      this.dust(b.x, b.y + 1.5, b.z, Math.cos(ang) * sp, this.rng.range(2, 6), Math.sin(ang) * sp, 12, 2.6);
    }
  }

  private onLavaImpact(id: number, pos: P3): void {
    this.bombOffset.delete(id);
    const L = F.lava;
    const [x, y, z] = pos;
    this.flash(x, y + 2, z, L.impactFlash, 7, L.sparkColor, 0.35);
    for (let k = 0; k < L.impactSparks; k++) {
      this.spark(x, y + 1, z, this.rng.range(-16, 16), this.rng.range(4, 22), this.rng.range(-16, 16), L.sparkColor, 7, this.rng.range(0.6, 1.4), 1.2);
    }
    for (let k = 0; k < L.impactSmoke; k++) this.smoke(x + this.rng.range(-4, 4), y + 3, z + this.rng.range(-4, 4), 14, 0.9);
  }

  private onCrack(id: number, pos: P3, index: number): void {
    const C = F.crack;
    const p = new Vector3(pos[0], pos[1] + C.lift, pos[2]);
    const prev = this.crackPrev.get(id) ?? p.clone();
    this.crackPrev.set(id, p.clone());
    if (index > 0 || prev.distanceToSquared(p) > 1) {
      const pts = this.jagged(prev.clone().setY(p.y), p, 5, 0.06);
      // 地面に沿わせる（jagged の上下の散らしを消す）
      for (let i = 1; i < pts.length; i += 3) pts[i] = p.y;
      const base = { born: this.time, flickerHz: 0, flat: true, grow: C.grow, anchor: null, taper: false };
      this.glow.add({ ...base, points: pts, width: C.glow.width, color: C.glow.color, life: C.life, hold: C.hot });
      this.gash.add({ ...base, points: [...pts], width: C.gash.width, color: [1 - C.gash.darkness, 1 - C.gash.darkness * 0.95, 1 - C.gash.darkness * 0.9], life: C.life * 1.6, hold: C.life });
    }
    for (let k = 0; k < C.dust; k++) {
      const ang = this.rng.range(0, Math.PI * 2);
      this.dust(p.x + Math.cos(ang) * 4, p.y + 1, p.z + Math.sin(ang) * 4, Math.cos(ang) * 7, this.rng.range(3, 9), Math.sin(ang) * 7, 13, 3);
    }
    for (let k = 0; k < C.sparks; k++) this.spark(p.x, p.y + 0.5, p.z, this.rng.range(-6, 6), this.rng.range(6, 16), this.rng.range(-6, 6), F.lava.sparkColor, 6, this.rng.range(0.5, 1.1), 1.4);
    // 裂け目に沿って、ゆっくり消える赤い光（瓦礫や土煙の上からも見えるように）
    const V = C.vent;
    for (let k = 0; k < V.count; k++) {
      const f = (k + 0.5) / V.count;
      const x = prev.x + (p.x - prev.x) * f;
      const z = prev.z + (p.z - prev.z) * f;
      this.add.pool.spawn(
        { x, y: p.y + 1.5, z, vx: 0, vy: 0.4, vz: 0, life: V.life * this.rng.range(0.8, 1.2), size0: V.size * 0.8, size1: V.size * 1.3, r: C.glow.color[0] * V.intensity, g: C.glow.color[1] * V.intensity, b: C.glow.color[2] * V.intensity, alpha: 1, drag: 0, buoyancy: 0, shape: SHAPE.flash, wind: 0 },
        this.rng.next(),
      );
    }
  }

  private flash(x: number, y: number, z: number, size: number, intensity: number, c: readonly [number, number, number], life: number): void {
    this.add.pool.spawn(
      { x, y, z, vx: 0, vy: 0.5, vz: 0, life, size0: size, size1: size * 1.5, r: c[0] * intensity, g: c[1] * intensity, b: c[2] * intensity, alpha: 1, drag: 0, buoyancy: 0, shape: SHAPE.flash, wind: 0 },
      this.rng.next(),
    );
  }

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: readonly [number, number, number], intensity: number, life: number, size = 0.8): void {
    this.add.pool.spawn(
      { x, y, z, vx, vy, vz, life, size0: size, size1: size * 0.3, r: c[0] * intensity, g: c[1] * intensity, b: c[2] * intensity, alpha: 1, drag: 0.6, buoyancy: -9.8, shape: SHAPE.spark, wind: 0.3, bounce: true },
      this.rng.next(),
    );
  }

  private dust(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number): void {
    const tone = this.rng.range(0.85, 1.15);
    this.soft.pool.spawn(
      { x, y, z, vx, vy, vz, life: life * this.rng.range(0.8, 1.2), size0: size * 0.35, size1: size, r: 0.2 * tone, g: 0.185 * tone, b: 0.165 * tone, alpha: 0.42, drag: 1.1, buoyancy: 0.6, shape: SHAPE.soft, spin: this.rng.range(-0.3, 0.3), wind: 0.7 },
      this.rng.next(),
    );
  }

  private smoke(x: number, y: number, z: number, size: number, glow: number): void {
    const tone = this.rng.range(0.75, 1.2);
    this.soft.pool.spawn(
      { x, y, z, vx: this.rng.range(-1.5, 1.5), vy: this.rng.range(5, 9), vz: this.rng.range(-1.5, 1.5), life: this.rng.range(6, 10), size0: size * 0.4, size1: size * 2, r: 0.055 * tone, g: 0.052 * tone, b: 0.05 * tone, alpha: 0.5, drag: 0.1, buoyancy: 0.9, shape: SHAPE.soft, spin: this.rng.range(-0.15, 0.15), glow },
      this.rng.next(),
    );
  }

  /** 1コマ進める（dt はゲーム内時刻の進み。一時停止中は 0）。 */
  update(dt: number, camera: PerspectiveCamera, viewportHeight: number): void {
    this.time += dt;
    if (dt > 0) {
      this.updateBombs(dt);
      this.updateCharge(dt);
      this.add.pool.update(dt, WIND.x, WIND.z);
      this.soft.pool.update(dt, WIND.x, WIND.z);
    } else this.placeRocks();
    this.bolts.update(this.time, camera);
    this.glow.update(this.time, camera);
    this.gash.update(this.time, camera);
    this.add.sync(camera, viewportHeight);
    this.soft.sync(camera, viewportHeight);
  }

  /** 飛んでいる礫：光る岩を置き、尾に火の粉と煙を残す。 */
  private updateBombs(dt: number): void {
    const L = F.lava;
    for (const b of this.game.combat.techniques.bombs) {
      const p = this.bombPos(b.id, b.pos, b.age);
      this.every(`t${b.id}`, L.trailSparks, dt, () => this.spark(p.x, p.y, p.z, -b.vel.x * 0.1 + this.rng.range(-3, 3), this.rng.range(-2, 3), -b.vel.z * 0.1 + this.rng.range(-3, 3), L.sparkColor, 6, this.rng.range(0.3, 0.7), 0.9));
      this.every(`s${b.id}`, L.trailSmoke, dt, () => this.smoke(p.x, p.y, p.z, 5, 0.8));
    }
    this.placeRocks();
  }

  private bombPos(id: number, pos: { x: number; y: number; z: number }, age: number): Vector3 {
    const off = this.bombOffset.get(id);
    const k = off ? Math.max(0, 1 - age / F.lava.mouthBlend) : 0;
    return _bp.set(pos.x + (off?.x ?? 0) * k, pos.y + (off?.y ?? 0) * k, pos.z + (off?.z ?? 0) * k);
  }

  private placeRocks(): void {
    const bombs = this.game.combat.techniques.bombs;
    const n = Math.min(bombs.length, this.rocks.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const b = bombs[i];
      const p = this.bombPos(b.id, b.pos, b.age);
      _q.setFromAxisAngle(_axis, b.age * 7 + b.id);
      _s.setScalar(F.lava.radius);
      this.rocks.setMatrixAt(i, _m.compose(p, _q, _s));
    }
    this.rocks.count = this.primed ? Math.max(1, n) : n;
    this.rocks.visible = this.primed || n > 0;
    this.rocks.instanceMatrix.needsUpdate = true;
  }

  /** 突進の間、足もとから後ろへ土煙を上げる。 */
  private updateCharge(dt: number): void {
    const body = this.game.body;
    if (!body.charging) return;
    const f = { x: Math.sin(body.yaw), z: Math.cos(body.yaw) };
    this.every('charge', F.charge.dustPerSecond, dt, () => {
      const side = this.rng.range(-6, 6);
      this.dust(body.pos.x - f.x * 8 + f.z * side, body.groundY + 1.5, body.pos.z - f.z * 8 - f.x * side, -f.x * 6 + this.rng.range(-2, 2), this.rng.range(1, 4), -f.z * 6 + this.rng.range(-2, 2), 11, 2.2);
    });
  }
}
