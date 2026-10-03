// OWNER: fx
// 画面の効果の指揮役。遊びの出来事（EventBus）と状態（壊れ方・燃え方・竜の意図）を読み、粒子・破片・瓦礫・焦げ跡・炎の光を出す。
// 遊びの規則には書き込まない（読むだけ）。同じ出来事の列と同じ刻みなら同じ絵になる（撮影を決定的にするため）。
import { Color, Group, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { FX, FX_BUDGET, WIND } from '../config/fx';
import type { QualityName } from '../config/quality';
import { stream } from '../core/rng';
import type { BuildingEvent } from '../core/events';
import { STAGE } from '../gameplay/damage';
import type { Game } from '../gameplay/game';
import type { Atmosphere } from '../render/atmosphereGpu';
import type { MaterialKit } from '../render/materials';
import { sideNormal } from '../world/geom';
import type { Building, Side } from '../world/types';
import { CollapseShapes, collapsePose, moundHeight, moundSeconds, poseZero, slabBottom, type CollapseShape, type CollapsePose } from '../city/collapsePose';
import { displacePoint, nearestWallPoint, randomWallPoint, wallPointZero, type WallPoint } from './buildingPoints';
import { DebrisField } from './debris';
import { planDebris, type DebrisKind, type DebrisSource } from './debrisPlan';
import { Emitters } from './emitters';
import { FireLights, type LightSource } from './fireLights';
import { ParticleLayer } from './particles';
import { RubbleField } from './rubble';
import { rubblePalette, type RubblePalette } from './rubblePalette';
import { ScorchDecals } from './scorch';
import { WindowFire } from './windowFire';
import { windowSlots, type WindowSlot } from './windowSlots';

/** 崩れる建物の土煙が這い出す辺：辺の上の区間と外向きの法線・道に沿う向き（r03-fx）。 */
interface CrawlSide {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  nx: number;
  nz: number;
  tx: number;
  tz: number;
}

const _c = new Color();
const _v = new Vector3();
const copy3 = (a: readonly [number, number, number]): [number, number, number] => [a[0], a[1], a[2]];
const CONCRETE = new Color(0.12, 0.115, 0.11);

/** 吐いている炎の見た目の入力（口の位置は竜の表示が持つ）。 */
export interface BreathView {
  mouth: Vector3;
  target: Vector3;
  hit: boolean;
}

export class FxDirector {
  readonly group = new Group();
  private readonly add: ParticleLayer;
  private readonly soft: ParticleLayer;
  private readonly flameLayer: ParticleLayer;
  private readonly windowFire: WindowFire;
  private readonly slots = new Map<number, WindowSlot[]>();
  private readonly crawlSides = new Map<number, CrawlSide[]>();
  private readonly moved = wallPointZero();
  private readonly debris: DebrisField;
  private readonly rubble: RubbleField;
  private readonly scorch: ScorchDecals;
  private readonly lights: FireLights;
  private readonly emit: Emitters;
  private readonly rng = stream(20260930, 'fx');
  private readonly acc = new Map<string, number>();
  private readonly collapsing = new Set<number>();
  private readonly smolder = new Map<number, number>();
  private readonly wp = wallPointZero();
  /** r03-fx：出した破片の数（種類ごとに大・中・小）。撮影の記録で、破片の配り方を数で確かめる */
  readonly debrisCount: Record<DebrisKind, [number, number, number]> = { concrete: [0, 0, 0], facade: [0, 0, 0], glass: [0, 0, 0] };
  private readonly pose = poseZero();
  /** r04-fx2：崩れる建物の寸法（上の塊の板・倒れる先の隣。描画の表と同じ決め方）と、瓦礫の山の色 */
  private readonly shapes: CollapseShapes;
  private readonly palettes = new Map<number, RubblePalette>();
  /** r04-fx2：前のコマの、下の階の潰れの先端（m）と上の板ごとの潰れ（土煙の輪を、階や板が潰れた瞬間に出すため） */
  private readonly lastFront = new Map<number, number>();
  private readonly lastCrush = new Map<number, number[]>();
  /** r04-fx2：撮影の記録用。崩れている建物の最後の姿（板の数・潰れ・山の盛り上がり） */
  private lastCollapse: { id: number; slabs: number; crush: number[]; mound: number; moundHeight: number; moundSeconds: number; angleDeg: number; front: number } | null = null;
  private scorchTimer = 0;
  private time = 0;

  constructor(
    private readonly game: Game,
    kit: MaterialKit,
    atmosphere: Atmosphere,
    quality: QualityName,
    lightParent: Object3D,
  ) {
    const budget = FX_BUDGET[quality];
    this.shapes = new CollapseShapes(game.city.buildings);
    this.group.name = 'fx';
    this.soft = new ParticleLayer(budget.soft, 'soft', atmosphere);
    this.flameLayer = new ParticleLayer(budget.flame, 'flame', atmosphere);
    this.add = new ParticleLayer(budget.additive, 'additive', atmosphere);
    this.windowFire = new WindowFire(budget.windowFlames, atmosphere);
    this.debris = new DebrisField(kit, budget.debris, budget.settled);
    this.rubble = new RubbleField(kit, game.city.buildings.length);
    this.scorch = new ScorchDecals(320);
    this.lights = new FireLights(lightParent, budget.lights);
    this.emit = new Emitters(this.add, this.soft, this.flameLayer, this.rng);
    this.group.add(this.rubble.group, this.debris.group, this.scorch.mesh, this.soft.mesh, this.windowFire.group, this.flameLayer.mesh, this.add.mesh);
    this.subscribe();
  }

  /** 鏡像（水面）に映さない物。煙と土煙は映すと重いので外す。 */
  get mirrorHidden(): Object3D[] {
    return [this.soft.mesh, this.scorch.mesh, this.debris.group];
  }

  /** いま出ている効果の数（撮影の記録と調べもの用）。 */
  stats(): {
    additive: number;
    soft: number;
    flame: number;
    windowFlames: number;
    debris: number;
    rubble: number;
    debrisSpawned: Record<DebrisKind, [number, number, number]>;
    plume: { count: number; sizeLow: number; sizeHigh: number; ratio: number };
    debrisFall: { L: number; M: number; S: number };
    collapse: { id: number; slabs: number; crush: number[]; mound: number; moundHeight: number; moundSeconds: number; angleDeg: number; front: number } | null;
  } {
    return {
      additive: this.add.pool.count,
      soft: this.soft.pool.count,
      flame: this.flameLayer.pool.count,
      windowFlames: this.windowFire.instances,
      debris: this.debris.movingCount + this.debris.settledTotal,
      rubble: this.rubble.mesh.count,
      debrisSpawned: { concrete: copy3(this.debrisCount.concrete), facade: copy3(this.debrisCount.facade), glass: copy3(this.debrisCount.glass) },
      plume: this.plumeStats(),
      debrisFall: this.debris.fallAccel(),
      collapse: this.lastCollapse,
    };
  }

  /**
   * r04-fx2：煙の柱の粒の太さの、下と上の比（撮影の記録）。柱の粒を火元から昇った高さで並べ、下の2割と上の2割の太さの平均を比べる。
   */
  private plumeStats(): { count: number; sizeLow: number; sizeHigh: number; ratio: number } {
    const list: { rise: number; size: number }[] = [];
    for (let i = 0; i < this.soft.pool.count; i++) {
      const p = this.soft.pool.sample(i);
      if (p.plume === 1) list.push({ rise: p.rise, size: p.size });
    }
    if (list.length < 10) return { count: list.length, sizeLow: 0, sizeHigh: 0, ratio: 0 };
    list.sort((a, b) => a.rise - b.rise);
    const k = Math.max(1, Math.floor(list.length * 0.2));
    const mean = (xs: { size: number }[]): number => xs.reduce((s, x) => s + x.size, 0) / xs.length;
    const lo = mean(list.slice(0, k));
    const hi = mean(list.slice(list.length - k));
    const r = (x: number): number => Math.round(x * 100) / 100;
    return { count: list.length, sizeLow: r(lo), sizeHigh: r(hi), ratio: r(hi / Math.max(lo, 1e-3)) };
  }

  /** 起動時にシェーダー（影の材質を含む）を作らせるため、全部の効果を1個ずつ見える状態にする。 */
  prime(on: boolean): void {
    this.add.prime(on);
    this.soft.prime(on);
    this.flameLayer.prime(on);
    this.windowFire.prime(on);
    this.debris.prime(on);
    this.rubble.prime(on);
    this.scorch.prime(on);
  }

  clear(): void {
    this.add.pool.clear();
    this.soft.pool.clear();
    this.flameLayer.pool.clear();
    this.windowFire.clear();
    this.debris.clear();
    this.rubble.clear();
    this.scorch.clear();
    this.lights.clear();
    this.collapsing.clear();
    this.smolder.clear();
    this.acc.clear();
    this.palettes.clear();
    this.lastFront.clear();
    this.lastCrush.clear();
    this.lastCollapse = null;
    for (const k of ['concrete', 'facade', 'glass'] as const) this.debrisCount[k].fill(0);
  }

  /** rate（/秒）× dt ぶん fn を呼ぶ（端数は次のコマへ持ち越す）。 */
  private every(key: string, rate: number, dt: number, fn: () => void): void {
    let a = (this.acc.get(key) ?? 0) + rate * dt;
    let guard = 0;
    while (a >= 1 && guard++ < 400) {
      fn();
      a -= 1;
    }
    this.acc.set(key, a);
  }

  private building(id: number): Building {
    return this.game.city.buildings[id];
  }

  /** 破片の色：外壁の色を暗くし、コンクリートの灰色と混ぜる（段ボール箱のように見せない）。 */
  private wallColor(b: Building, k = 1): Color {
    const w = b.masses[b.masses.length - 1].wallColor;
    return _c.setRGB(w[0], w[1], w[2]).convertSRGBToLinear().multiplyScalar(k * 0.7).lerp(CONCRETE, 0.4).clone();
  }

  private subscribe(): void {
    const bus = this.game.bus;
    bus.on('building.crack', (e) => this.onBreak(e, 4, 4, 0.6));
    bus.on('building.peel', (e) => this.onBreak(e, 16, 7, 1.0));
    bus.on('building.tilt', (e) => this.onTilt(e));
    bus.on('building.collapse', (e) => this.collapsing.add(e.id));
    bus.on('glass.shatter', (e) => this.onGlass(e.id, e.pos[1], e.count));
    bus.on('fire.ignite', (e) => this.emit.flash(e.pos[0], e.pos[1], e.pos[2], 10 + e.size * 0.2, 14));
    bus.on('fire.spread', (e) => this.emit.flash(e.pos[0], e.pos[1], e.pos[2], 8, 8));
    bus.on('dragon.land', (e) => this.onLand(e.pos[0], e.pos[1], e.pos[2], e.impact));
    bus.on('dragon.step', (e) => {
      for (let k = 0; k < 2; k++) {
        const a = this.rng.range(0, Math.PI * 2);
        this.emit.dust(e.pos[0], e.pos[1] + 1, e.pos[2], Math.cos(a) * 5, 1.5, Math.sin(a) * 5, 9, 1.6, 0.9);
      }
    });
    bus.on('dragon.roar', (e) => {
      for (let k = 0; k < 44; k++) {
        const a = (k / 44) * Math.PI * 2;
        this.emit.dust(e.pos[0] + Math.cos(a) * 14, 2, e.pos[2] + Math.sin(a) * 14, Math.cos(a) * 55, 2, Math.sin(a) * 55, 18, 1.8, 0.8);
      }
    });
  }

  /** 壁が割れる・剥がれる：竜の側の壁から、破片と土煙。 */
  private onBreak(e: BuildingEvent, chunks: number, puffs: number, scale: number): void {
    const b = this.building(e.id);
    const p = this.game.body.pos;
    const w = nearestWallPoint(b, p.x, p.z, e.pos[1], this.wp);
    displacePoint(w, e.id, this.game.damage, b, this.shapes);
    // r03-fx：破片はコンクリ・外壁・ガラスの3種を大・中・小に配る（ひびは小さい方へ寄せる）
    const sizeMix: [number, number, number] = scale < 0.8 ? [0, 0.25, 0.75] : scale < 1.2 ? [0.04, 0.36, 0.6] : [0.12, 0.38, 0.5];
    this.burst(b, { x: w.x, y: w.y, z: w.z, nx: w.nx, nz: w.nz, spread: 6, out: [2, 8], up: [-1, 4] }, chunks, sizeMix);
    for (let k = 0; k < puffs; k++) {
      this.emit.dust(w.x + w.nx * 3, w.y + this.rng.range(-4, 4), w.z + w.nz * 3, w.nx * 4, this.rng.range(-1, 1), w.nz * 4, 7 * scale + 4, 3.5, 1.1);
    }
  }

  private onTilt(e: BuildingEvent): void {
    const d = this.game.damage;
    const b = this.building(e.id);
    const split = d.splitY[e.id];
    // r03-fx：割れ目から、周りへ破片と土煙が噴き出す（割れた高さで建物が割れる瞬間）
    if (split > 0) {
      for (let k = 0; k < 12; k++) {
        const w = displacePoint(randomWallPoint(b, this.rng, split - 0.8, split + 0.8, this.wp), e.id, d, b, this.shapes);
        this.burst(b, { x: w.x, y: w.y, z: w.z, nx: w.nx, nz: w.nz, spread: 2, out: [3, 9], up: [0, 4] }, 2, [0.1, 0.4, 0.5]);
        this.emit.dust(w.x + w.nx * 3, w.y, w.z + w.nz * 3, w.nx * 7, this.rng.range(-1, 2), w.nz * 7, 11, 4.5, 1.05, 0.45);
      }
    }
    const px = d.pivotX[e.id];
    const pz = d.pivotZ[e.id];
    for (let k = 0; k < 10; k++) {
      this.emit.dust(px + this.rng.range(-10, 10), 2, pz + this.rng.range(-10, 10), d.dirX[e.id] * 6, 2, d.dirZ[e.id] * 6, 16, 4.5, 1.1);
    }
    this.onBreak(e, 10, 0, 1.4);
  }

  /** 破片を配り方（debrisPlan.ts）で出し、種類と大きさごとに数える。 */
  private burst(b: Building, src: DebrisSource, count: number, sizeMix?: readonly [number, number, number]): void {
    for (const p of planDebris(b, src, count, this.rng, sizeMix)) {
      this.debris.spawnPiece(p, this.rng);
      this.debrisCount[p.kind][p.size === 'L' ? 0 : p.size === 'M' ? 1 : 2]++;
    }
  }

  private onGlass(id: number, y: number, count: number): void {
    const b = this.building(id);
    const n = Math.min(70, 4 + Math.round(count * 0.5));
    for (let k = 0; k < n; k++) {
      const w = randomWallPoint(b, this.rng, Math.max(b.masses[0].y0 + 2, y - 14), Math.min(b.height - 1, y + 14), this.wp);
      displacePoint(w, id, this.game.damage, b, this.shapes);
      this.emit.shard(w.x, w.y, w.z, w.nx, w.nz);
    }
  }

  /** 着地：地面を這って広がる土煙の輪と、真ん中から立ち上る土煙の柱。強い着地ほど濃く大きい。 */
  private onLand(x: number, y: number, z: number, impact: number): void {
    const n = Math.round(30 + 40 * impact);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.rng.range(-0.08, 0.08);
      const sp = (16 + 30 * impact) * this.rng.range(0.8, 1.2);
      this.emit.dust(x + Math.cos(a) * 6, y + 2, z + Math.sin(a) * 6, Math.cos(a) * sp, this.rng.range(2, 7), Math.sin(a) * sp, 11 + 14 * impact, 2.8, 1.2, 0.55 + 0.35 * impact);
    }
    const column = Math.round(12 * impact);
    for (let k = 0; k < column; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      this.emit.dust(x + Math.cos(a) * 5, y + 3, z + Math.sin(a) * 5, Math.cos(a) * 6, this.rng.range(6, 13), Math.sin(a) * 6, 20 + 14 * impact, 3.6, 1.1, 0.5);
    }
    const chunks = Math.round(14 * impact);
    for (let k = 0; k < chunks; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(6, 16);
      this.debris.spawn(
        { x: x + Math.cos(a) * 6, y: y + 1, z: z + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: this.rng.range(6, 14), vz: Math.sin(a) * sp, size: this.rng.range(0.6, 1.8), color: _c.setRGB(0.09, 0.085, 0.08).clone() },
        this.rng,
      );
    }
  }

  /** 1コマ進める（dt はゲーム内時刻の進み。一時停止中は 0）。breath は炎を吐いているときだけ。 */
  update(dt: number, camera: PerspectiveCamera, viewportHeight: number, breath: BreathView | null): void {
    this.time += dt;
    const sources: LightSource[] = [];
    if (dt > 0) {
      if (breath) this.updateBreath(dt, breath, sources);
      this.updateBurning(dt, camera.position, sources);
      this.updateCollapsing(dt);
      this.updateSmolder(dt);
      this.add.pool.update(dt, WIND.x, WIND.z);
      this.soft.pool.update(dt, WIND.x, WIND.z);
      this.flameLayer.pool.update(dt, WIND.x, WIND.z);
    } else {
      // 止まっていても光の割り当ては保つ
      if (breath) sources.push(this.breathLight(breath));
      this.collectFireLights(sources);
    }
    // r04-fx2：破片は瓦礫の山の上に載る（山の中へ落ちて消えない）。水の上には山が無いので、沈んで消える
    this.debris.update(dt, (x, z) => Math.max(this.game.groundAt(x, z), this.rubble.heightAt(x, z)));
    this.lights.update(sources, camera.position, Math.max(dt, 1 / 60), this.time);
    this.add.sync(camera, viewportHeight);
    this.soft.sync(camera, viewportHeight);
    this.flameLayer.sync(camera, viewportHeight);
  }

  /**
   * 吐く炎の光。r04-fx2：ビルに当たっているときは、当たった点から炎の向き（水平）に inset 奥＝壁の内側へ置く
   * （壁の外の面は光の裏になって照らされず、近い壁が白く飛ばない。通り・並木・竜を照らす）。ビルの奥行きの半分より奥、屋上より上へは出さない。
   * 高さは、地面から当たった点までの lift の所（最低 minHeight m）。上から照らすと真下の歩道だけが先に白く飛ぶので、
   * 低い所から通りと並木を横から照らす。
   * 当たっていないときは、口から当たる点までの along の所（r03-fx：壁に近すぎると 1/距離² で壁の一点だけ白く飛ぶ）。
   */
  private breathLight(br: BreathView): LightSource {
    const L = FX.breathLight;
    const base = { key: 'breath', intensity: L.intensity, distance: L.distance, color: L.color };
    const dx = br.target.x - br.mouth.x;
    const dz = br.target.z - br.mouth.z;
    const hl = Math.hypot(dx, dz);
    if (br.hit && hl > 1e-3) {
      const ux = dx / hl;
      const uz = dz / hl;
      const b = this.game.index.buildingAt(br.target.x + ux * 1.5, br.target.z + uz * 1.5);
      if (b) {
        const f = b.footprint;
        const depth = Math.abs(ux) * (f.x1 - f.x0) + Math.abs(uz) * (f.z1 - f.z0);
        const inset = Math.min(L.inset, depth * 0.45);
        const x = br.target.x + ux * inset;
        const z = br.target.z + uz * inset;
        const gy = this.game.groundAt(x, z);
        const y = Math.min(gy + Math.max(L.minHeight, (br.target.y - gy) * L.lift), b.height - 2);
        return { ...base, x, y, z };
      }
    }
    const k = L.along;
    return {
      ...base,
      x: br.mouth.x + (br.target.x - br.mouth.x) * k,
      y: br.mouth.y + (br.target.y - br.mouth.y) * k,
      z: br.mouth.z + (br.target.z - br.mouth.z) * k,
    };
  }

  /**
   * 吐く炎（r03-fx）：芯（口から細く速い白い黄の筋）・胴（広がる橙の流れ）・先端（届く所で膨らみ、赤から煤へ冷える渦）の3層。
   * 当たった所では炎が壁に沿って四方へ流れ、煤が昇る。
   */
  private updateBreath(dt: number, br: BreathView, sources: LightSource[]): void {
    const dir = _v.subVectors(br.target, br.mouth);
    const dist = Math.max(4, dir.length());
    dir.multiplyScalar(1 / dist);
    const B = FX.breathFlame;
    const life = Math.min(1.35, (dist / B.speed) * 1.04);
    const m = br.mouth;
    this.every('breath.core', B.core.rate, dt, () => this.emit.breathFlame('core', m.x, m.y, m.z, dir.x, dir.y, dir.z, life, dist));
    this.every('breath.body', B.body.rate, dt, () => this.emit.breathFlame('body', m.x, m.y, m.z, dir.x, dir.y, dir.z, life, dist));
    this.every('breath.tip', B.tip.rate, dt, () => this.emit.breathFlame('tip', m.x, m.y, m.z, dir.x, dir.y, dir.z, life, dist));
    this.every('breath.mouth', 10, dt, () => this.emit.flash(m.x + dir.x * 2, m.y + dir.y * 2, m.z + dir.z * 2, 3.2, FX.mouthFlash, 0.18));
    const t = br.target;
    if (br.hit) {
      const hl = Math.hypot(dir.x, dir.z) || 1;
      const nx = -dir.x / hl;
      const nz = -dir.z / hl;
      this.every('breath.splash', 42, dt, () => this.emit.splash(t.x - dir.x * 1.5, t.y + this.rng.range(-2, 2), t.z - dir.z * 1.5, nx, nz));
      this.every('breath.smoke', 6, dt, () => this.emit.plume(t.x + nx * 4, t.y + 5, t.z + nz * 4, 5.5, 0.85, 0.45, FX.plume.breathDensity));
      this.scorchTimer -= dt;
      const gy = this.game.groundAt(t.x, t.z);
      if (this.scorchTimer <= 0 && t.y < gy + 3) {
        this.scorchTimer = 0.22;
        this.scorch.add(t.x + this.rng.range(-3, 3), gy, t.z + this.rng.range(-3, 3), this.rng.range(5, 9), this.rng.range(0.6, 0.95), this.rng.range(0, 6.28));
      }
    }
    sources.push(this.breathLight(br));
  }

  /** 距離が遠いほど粒子を減らす（0.15〜1）。 */
  private lod(x: number, z: number, cam: Vector3): number {
    const d = Math.hypot(x - cam.x, z - cam.z);
    return Math.max(0.15, Math.min(1, 1 - (d - FX.burnLodNear) / (FX.burnLodFar - FX.burnLodNear)));
  }

  private collectFireLights(sources: LightSource[]): void {
    const fire = this.game.fire;
    for (const id of fire.burning) {
      const b = this.building(id);
      const f = b.footprint;
      const zone = Math.max(4, fire.fireHigh[id] - fire.fireLow[id]);
      // r03-fx：大きい建物の光の倍率の上限 2.4 → 1.8（近くの壁と並木が赤く飛んだ）
      const size = Math.min(FX.fireLight.maxSize, Math.max(0.6, Math.sqrt(2 * (f.x1 - f.x0 + f.z1 - f.z0) * zone) / 22));
      sources.push({
        key: `b${id}`,
        x: (f.x0 + f.x1) / 2,
        y: (fire.fireLow[id] + fire.fireHigh[id]) / 2 + 3,
        z: (f.z0 + f.z1) / 2,
        intensity: FX.fireLight.intensity * fire.burn[id] * size,
        distance: FX.fireLight.distance,
      });
    }
  }

  /** 建物の窓の並び（燃え始めた建物だけ、初めて要るときに作る）。 */
  private slotsOf(b: Building): WindowSlot[] {
    let list = this.slots.get(b.id);
    if (!list) {
      list = windowSlots(b, this.game.city.curbHeight, 600);
      this.slots.set(b.id, list);
    }
    return list;
  }

  /**
   * 燃えている建物（r03-fx）：燃えている階の窓から窓の炎（形・大きさ・揺れが窓ごとに違う）と、時々大きく吹き出す炎の舌・火の粉。
   * 煙は火の上端から1本の柱として昇る（屋上まで燃えたら屋上から、途中の階なら燃えている階の窓から壁に沿って）。
   */
  private updateBurning(dt: number, cam: Vector3, sources: LightSource[]): void {
    const fire = this.game.fire;
    const dmg = this.game.damage;
    const W = FX.windowFire;
    this.windowFire.begin(this.time);
    for (const id of fire.burning) {
      const b = this.building(id);
      const burn = fire.burn[id];
      const lo = fire.fireLow[id];
      const hi = Math.max(lo + 2, fire.fireHigh[id]);
      const f = b.footprint;
      const cx = (f.x0 + f.x1) / 2;
      const cz = (f.z0 + f.z1) / 2;
      const lod = this.lod(cx, cz, cam);
      const size = Math.min(2.4, Math.max(0.6, Math.sqrt(2 * (f.x1 - f.x0 + f.z1 - f.z0) * (hi - lo)) / 22));
      const standing = dmg.stage[id] < STAGE.collapse;
      if (standing) {
        const slots = this.slotsOf(b);
        const moved = dmg.tilt[id] > 0 ? (sl: WindowSlot, out: WallPoint): WallPoint => this.moveSlot(sl, id, b, out) : null;
        // r04-fx2：遠い建物は窓の炎の板を出さない（シェーダーが fadeFar より遠くで炎を窓の中へ縮めて消す。窓の赤い光だけにする）
        const reach = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2;
        const far = Math.hypot(cx - cam.x, (lo + hi) / 2 - cam.y, cz - cam.z) - reach > W.fadeFar;
        if (!far) this.windowFire.addBuilding(slots, lo, hi, burn, Math.ceil(W.perBuilding * lod), moved, this.moved);
        this.every(`f${id}`, 5 * burn * lod * size, dt, () => {
          const sl = slots[Math.floor(this.rng.next() * Math.min(slots.length, 120))];
          if (!sl || sl.y < lo - 1 || sl.y > hi + 1) return;
          const w = this.moveSlot(sl, id, b, this.wp);
          this.emit.flame(w.x, w.y + sl.h * 0.5, w.z, sl.nx, sl.nz, 0.9 + 0.6 * burn, 0.9);
        });
        this.every(`e${id}`, 9 * burn * lod, dt, () => {
          const w = displacePoint(randomWallPoint(b, this.rng, lo, hi, this.wp), id, dmg, b, this.shapes);
          this.emit.ember(w.x + w.nx * 2, w.y, w.z + w.nz * 2);
        });
      }
      // r04-fx2：煙は1棟から1本の柱（指摘「煙は小さな粒のまだらで柱にならない」）。r03-fx は屋根の縁や壁の上の点から散らして出していた
      const src = this.plumeSource(b, id, hi, standing);
      const P = FX.plume;
      this.every(`s${id}`, P.rate * burn * lod * Math.min(1.4, Math.sqrt(size)), dt, () => this.emit.plume(src.x, src.y, src.z, src.r0, burn, burn));
      this.every(`k${id}`, P.canopy.rate * burn * lod, dt, () => this.emit.canopy(src.x, src.y, src.z, burn));
    }
    this.windowFire.end();
    this.collectFireLights(sources);
  }

  /**
   * r04-fx2：煙の柱の火元。屋上まで燃えた（か崩れかけた）建物は屋上の中ほど、途中の階が燃えている建物は、
   * 燃えている範囲の上端の、風下の面の中ほど（窓から出た煙は風に押されて風下の壁を這い上がる）。傾いた建物では外壁と同じ式で動かす。
   */
  private plumeSource(b: Building, id: number, hi: number, standing: boolean): { x: number; y: number; z: number; r0: number } {
    const dmg = this.game.damage;
    const f = b.footprint;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const r0 = Math.min(12, Math.max(4, Math.sqrt((f.x1 - f.x0) * (f.z1 - f.z0)) * 0.28));
    const p = this.wp;
    if (!standing || hi >= b.height - 4) {
      p.x = cx;
      p.y = b.height;
      p.z = cz;
      displacePoint(p, id, dmg, b, this.shapes);
      return { x: p.x, y: Math.max(p.y, this.game.groundAt(cx, cz) + 2) + 2, z: p.z, r0 };
    }
    let m = b.masses[0];
    for (const mm of b.masses) if (hi >= mm.y0 && hi <= mm.y1 + 0.5) m = mm;
    const r = m.rect;
    // 風下の面：外向きの法線が風の向きにいちばん近い面
    const east = WIND.x >= 0;
    const south = WIND.z >= 0;
    const alongX = Math.abs(WIND.x) >= Math.abs(WIND.z);
    const nx = alongX ? (east ? 1 : -1) : 0;
    const nz = alongX ? 0 : south ? 1 : -1;
    p.x = alongX ? (east ? r.x1 : r.x0) : (r.x0 + r.x1) / 2;
    p.z = alongX ? (r.z0 + r.z1) / 2 : south ? r.z1 : r.z0;
    p.y = hi;
    p.nx = nx;
    p.nz = nz;
    displacePoint(p, id, dmg, b, this.shapes);
    const faceLen = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
    return { x: p.x + nx * 3, y: p.y + 1, z: p.z + nz * 3, r0: Math.min(r0, faceLen * 0.3, 7) };
  }

  /** 窓の位置を、傾き・崩落に合わせて動かす（外壁のシェーダーと同じ式）。 */
  private moveSlot(sl: WindowSlot, id: number, b: Building, out: WallPoint): WallPoint {
    out.x = sl.x;
    out.y = sl.y;
    out.z = sl.z;
    out.nx = sl.nx;
    out.nz = sl.nz;
    return displacePoint(out, id, this.game.damage, b, this.shapes);
  }

  /** 土煙が這い出す辺：道に面した辺（街区の縁石から 14m 以内）。道に面さない建物は4辺すべて。 */
  private crawlSidesOf(b: Building): CrawlSide[] {
    let list = this.crawlSides.get(b.id);
    if (list) return list;
    const city = this.game.city;
    const block = city.blocks[b.blockId];
    const f = b.footprint;
    const edges: Record<Side, [number, number, number, number]> = {
      n: [f.x0, f.z0, f.x1, f.z0],
      s: [f.x0, f.z1, f.x1, f.z1],
      e: [f.x1, f.z0, f.x1, f.z1],
      w: [f.x0, f.z0, f.x0, f.z1],
    };
    const gap: Record<Side, number> = { n: f.z0 - block.curb.z0, s: block.curb.z1 - f.z1, e: block.curb.x1 - f.x1, w: f.x0 - block.curb.x0 };
    const all = (['n', 's', 'e', 'w'] as const).map((side) => {
      const n = sideNormal(side);
      const [x0, z0, x1, z1] = edges[side];
      return { side, c: { x0, z0, x1, z1, nx: n.x, nz: n.z, tx: -n.z, tz: n.x } };
    });
    const facing = all.filter((e) => block.faces[e.side] !== null && gap[e.side] < 14);
    list = (facing.length > 0 ? facing : all).map((e) => e.c);
    this.crawlSides.set(b.id, list);
    return list;
  }

  /**
   * 崩れている建物。瓦礫の山を、崩れ方の規則（city/collapsePose.ts）の盛り上がりと高さで置き、根元の土煙を道に沿って這わせる。
   * r04-fx2：指摘「階は潰れず、根元の土煙は薄い」。下の階が1階ずつ潰れるたび（潰れの先端が階の境目を越えるたび）と、
   * 上の塊の板が1枚ずつ潰れきるたびに、その高さの外壁から土煙と破片の輪を外へ噴き出す（階が順に潰れるのが見える）。
   * 倒れる上の塊からは、外壁の板が剥がれ落ちる（r03-fx）。
   */
  private updateCollapsing(dt: number): void {
    const dmg = this.game.damage;
    for (const id of this.collapsing) {
      const b = this.building(id);
      const c = dmg.collapse[id];
      const f = b.footprint;
      const gy = this.game.groundAt((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2);
      const split = dmg.splitY[id];
      // 割れる高さの無い建物（まとめたメッシュのまま沈む）も、山の盛り上がりと高さは同じ規則で決める
      const shape = this.shapes.get(b, split > 0 ? split : (b.masses[0].y0 + b.height) / 2, dmg.dirX[id], dmg.dirZ[id]);
      const pose = collapsePose(dmg.tilt[id], c, shape, this.pose);
      const mh = moundHeight(shape);
      this.rubble.place(b, pose.mound, gy, mh, this.paletteOf(b, id));
      this.lastCollapse = {
        id,
        slabs: shape.slabs,
        crush: pose.crush.slice(0, shape.slabs).map((q) => Math.round(q * 1000) / 1000),
        mound: Math.round(pose.mound * 1000) / 1000,
        moundHeight: Math.round(mh * 100) / 100,
        moundSeconds: Math.round(moundSeconds(shape) * 100) / 100,
        angleDeg: Math.round(((pose.angle * 180) / Math.PI) * 100) / 100,
        front: Math.round(pose.front * 100) / 100,
      };
      const perim = 2 * (f.x1 - f.x0 + f.z1 - f.z0);
      const scale = Math.min(3, Math.max(0.6, perim / 80));
      const color = this.wallColor(b, 0.75);
      // r03-fx：根元の土煙は道に沿って這い出し、ゆっくり上がる（指摘「土煙が道に沿って這わない」）
      const sides = this.crawlSidesOf(b);
      this.every(`cd${id}`, FX.crawl.rate * scale * (1 - c * 0.55), dt, () => {
        const e = sides[Math.floor(this.rng.next() * sides.length)];
        const u = this.rng.next();
        this.emit.crawl(e.x0 + (e.x1 - e.x0) * u + e.nx * 2, gy, e.z0 + (e.z1 - e.z0) * u + e.nz * 2, e.nx, e.nz, e.tx, e.tz, 1.05);
      });
      if (split > 0) {
        const strength = Math.min(1.3, 0.7 + 0.3 * scale);
        this.floorRings(b, id, shape, pose, strength);
        this.slabRings(b, id, shape, pose, strength);
        // 潰れの先端からの細かい土煙（輪と輪の間を埋める）
        const crushing = pose.front < split - 0.5 && pose.front > b.masses[0].y0 + 0.5;
        if (crushing) {
          this.every(`cp${id}`, 8 * scale, dt, () => {
            const w = displacePoint(randomWallPoint(b, this.rng, pose.front - 1, pose.front + 0.5, this.wp), id, dmg, b, this.shapes);
            const out = this.rng.range(6, 13);
            this.emit.dust(w.x + w.nx * 2, w.y, w.z + w.nz * 2, w.nx * out, this.rng.range(-0.5, 2), w.nz * out, this.rng.range(9, 15), this.rng.range(4, 6.5), 1.05, 0.42);
          });
        }
        if (c < 0.85) {
          this.every(`cu${id}`, 7 * scale, dt, () => {
            const w = displacePoint(randomWallPoint(b, this.rng, split + 0.5, b.height, this.wp), id, dmg, b, this.shapes);
            if (w.y < gy + 1) return;
            this.burst(b, { x: w.x, y: w.y, z: w.z, nx: w.nx, nz: w.nz, spread: 3, out: [1, 5], up: [-2, 2] }, 1, [0.35, 0.45, 0.2]);
          });
        }
      } else {
        this.every(`cc${id}`, 22 * scale, dt, () => {
          const w = randomWallPoint(b, this.rng, b.height - 2, b.height, this.wp);
          displacePoint(w, id, dmg, b, this.shapes);
          if (w.y < gy + 1) return;
          this.debris.spawn({ x: w.x + w.nx, y: w.y, z: w.z + w.nz, vx: w.nx * this.rng.range(2, 7), vy: this.rng.range(-3, 1), vz: w.nz * this.rng.range(2, 7), size: this.rng.range(0.6, 2.8), color }, this.rng);
        });
      }
      if (dmg.stage[id] === STAGE.rubble) {
        this.collapsing.delete(id);
        this.lastFront.delete(id);
        this.lastCrush.delete(id);
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * Math.PI * 2;
          const cx = (f.x0 + f.x1) / 2;
          const cz = (f.z0 + f.z1) / 2;
          this.emit.dust(cx + Math.cos(a) * (f.x1 - f.x0) * 0.5, gy + 3, cz + Math.sin(a) * (f.z1 - f.z0) * 0.5, Math.cos(a) * 16, 3, Math.sin(a) * 16, 16 + 8 * scale, 5, 1);
        }
        if (dmg.char[id] > 0.15 || this.game.fire.burn[id] > 0) this.smolder.set(id, 28);
      }
    }
  }

  /** r04-fx2：瓦礫の山の色（崩れ始めた時の焦げの量で、建物ごとに1回だけ決める）。 */
  private paletteOf(b: Building, id: number): RubblePalette {
    let p = this.palettes.get(id);
    if (!p) {
      p = rubblePalette(b, this.game.damage.char[id]);
      this.palettes.set(id, p);
    }
    return p;
  }

  /** r04-fx2：下の階。潰れの先端が階の境目を越えたら、その階から土煙と破片の輪。 */
  private floorRings(b: Building, id: number, shape: CollapseShape, pose: CollapsePose, strength: number): void {
    const last = this.lastFront.get(id) ?? shape.split;
    this.lastFront.set(id, pose.front);
    if (pose.front >= last - 1e-3) return;
    const first = shape.base + b.facade.groundFloor;
    for (let y = first; y < shape.split - 0.3; y += shape.floorH) {
      if (y >= pose.front && y < last) this.ring(b, id, y - 0.4, y + 0.4, 0.75 * strength, 2);
    }
  }

  /** r04-fx2：上の塊の板。板が潰れきる瞬間（潰れの進みが 0.8 を越えた刻み）に、その板から土煙と破片の輪。 */
  private slabRings(b: Building, id: number, shape: CollapseShape, pose: CollapsePose, strength: number): void {
    let last = this.lastCrush.get(id);
    if (!last) {
      last = new Array<number>(shape.slabs).fill(0);
      this.lastCrush.set(id, last);
    }
    for (let j = 0; j < shape.slabs; j++) {
      const q = pose.crush[j];
      if (last[j] < 0.8 && q >= 0.8) this.ring(b, id, slabBottom(shape, j), slabBottom(shape, j + 1), strength, 4);
      last[j] = q;
    }
  }

  /** 高さ yLo〜yHi（動く前の位置）の外壁から、土煙と破片を外へ噴き出す輪（階や板が潰れた瞬間）。 */
  private ring(b: Building, id: number, yLo: number, yHi: number, strength: number, pieces: number): void {
    const dmg = this.game.damage;
    const f = b.footprint;
    const perim = 2 * (f.x1 - f.x0 + f.z1 - f.z0);
    const n = Math.round(Math.min(40, Math.max(8, perim / 5)) * Math.min(1.3, strength));
    for (let k = 0; k < n; k++) {
      const w = displacePoint(randomWallPoint(b, this.rng, yLo, yHi, this.wp), id, dmg, b, this.shapes);
      const out = this.rng.range(8, 17) * strength;
      const along = this.rng.range(-3, 3);
      this.emit.dust(
        w.x + w.nx * 1.5,
        w.y,
        w.z + w.nz * 1.5,
        w.nx * out - w.nz * along,
        this.rng.range(-0.5, 2.5),
        w.nz * out + w.nx * along,
        this.rng.range(7, 12) * Math.sqrt(strength),
        this.rng.range(3.5, 5.5),
        1.05,
        0.46,
      );
    }
    for (let k = 0; k < pieces; k++) {
      const w = displacePoint(randomWallPoint(b, this.rng, yLo, yHi, this.wp), id, dmg, b, this.shapes);
      this.burst(b, { x: w.x, y: w.y, z: w.z, nx: w.nx, nz: w.nz, spread: 3, out: [4, 12], up: [0, 4] }, 1, [0.08, 0.37, 0.55]);
    }
  }

  private updateSmolder(dt: number): void {
    for (const [id, left] of this.smolder) {
      const b = this.building(id);
      const f = b.footprint;
      const r0 = Math.min(12, Math.max(4, Math.sqrt((f.x1 - f.x0) * (f.z1 - f.z0)) * 0.25));
      this.every(`sm${id}`, 1.4 * Math.min(1, left / 10), dt, () =>
        this.emit.plume(this.rng.range(f.x0, f.x1), this.game.groundAt(f.x0, f.z0) + 3, this.rng.range(f.z0, f.z1), r0, 0.45, 0.5),
      );
      if (left - dt <= 0) this.smolder.delete(id);
      else this.smolder.set(id, left - dt);
    }
  }
}
