// OWNER: fx
// 板の粒子（炎・煙・土煙・火の粉・ガラス片・閃光）。CPU で動かし、カメラを向く四角をインスタンスでまとめて描く。
// 足し合わせる層（火の粉・ガラス・閃光）・重ねる層（煙・土煙）・炎の層の3つに分ける。重ねる層と炎の層は奥から順に並べて描く。
// 色と霧は大気の表（atmosphereGlsl）から取るので、遠くの煙は空と同じ色に溶ける。
// r03-fx：指摘「breath の炎は形の無い白い塊（白飛び6.6%）」。炎は足し算をやめ、前掛けの合成（premultiplied）の炎の層へ移した。
// 何枚重なっても、色は炎の色の表（config/fx.ts の FLAME）の上限へ近づくだけで、それ以上は明るくならない。
import {
  AdditiveBlending,
  BufferAttribute,
  CustomBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';
import { FLAME, FX } from '../config/fx';
import { SUN } from '../config/render';
import type { Atmosphere } from '../render/atmosphereGpu';
import { flameUniforms } from './flameGlsl';
import { PARTICLE_ADDITIVE_FRAG, PARTICLE_FLAME_FRAG, PARTICLE_SOFT_FRAG, PARTICLE_VERTEX } from './particleShaders';
import { FX_LAYER, SOFT_UNIFORMS } from '../render/softParticles';

export type ParticleMode = 'additive' | 'soft' | 'flame';

export const SHAPE = { soft: 0, flame: 1, spark: 2, shard: 3, flash: 4 } as const;

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 寿命（秒） */
  life: number;
  /** 大きさ（直径、m）：始まりと終わり */
  size0: number;
  size1: number;
  /** 色（線形、1 を超えると光る） */
  r: number;
  g: number;
  b: number;
  /** 不透明度（重ねる層）または明るさの倍率（足す層） */
  alpha: number;
  /** 空気の抵抗（1/秒）と浮力（m/s²、負で重力） */
  drag: number;
  buoyancy: number;
  shape: number;
  spin?: number;
  /** 始めの回転（ラジアン、既定はでたらめ）。炎は立てて出す */
  rot0?: number;
  /** 煙の下からの火の照り返し（0〜1） */
  glow?: number;
  /** 風に流される割合（既定 1） */
  wind?: number;
  /** 地面で跳ねる（ガラス片・火の粉） */
  bounce?: boolean;
  /** 炎の層：生まれたときの温度（0〜1。1 で芯の白い黄、冷えるにつれて橙 → 赤 → 煤） */
  heat?: number;
  /** 速さの向きへ伸ばす割合（0 で伸ばさない）。噴き出す炎を流れの向きの筋にする */
  stretch?: number;
  /**
   * 煙の柱（r03-fx）：この高さ（m）で浮力を失って横に広がる。0 なら無し。
   * 柱の粒は上ほど強い風に流される（1つの風向きへ傾いて上がる柱にする。particleWindAt）
   */
  ceil?: number;
  /**
   * r04-fx2：煙の柱の粒（1）と天蓋の粒（2）。柱の粒の太さは昇った高さで決める：
   * size0 + spread ×（高さ − 火元の高さ y0）+ ageGrow × 年齢（秒）、上限 size1。天蓋は年齢で膨らむ。
   * どちらも、火元から昇った高さをシェーダーへ渡す（根元ほど黒く火の色に照らされ、上ほど薄まって灰色）
   */
  plume?: 1 | 2;
  y0?: number;
  spread?: number;
  ageGrow?: number;
}

/** 高さ y（m）での風の強さの倍率。地面の近くは建物に遮られて弱く、上ほど強い（煙の柱が風下へ傾く）。 */
export function particleWindAt(y: number): number {
  return 0.45 + 0.95 * Math.min(1, Math.max(0, y) / 170);
}

const FIELDS = 30;
const F = {
  x: 0, y: 1, z: 2, vx: 3, vy: 4, vz: 5, age: 6, life: 7, s0: 8, s1: 9,
  r: 10, g: 11, b: 12, a: 13, drag: 14, buoy: 15, shape: 16, spin: 17, rot: 18, glow: 19, wind: 20, seed: 21, bounce: 22,
  stretch: 23, ceil: 24, heat: 25, plume: 26, y0: 27, spread: 28, ageGrow: 29,
} as const;

/** 1粒の太さ（直径 m）。煙の柱の粒は昇った高さで、天蓋は年齢で、ほかは生まれてすぐ膨らむ（煙の柱の r03-fx 版は年齢に比例）。 */
function sizeOf(d: Float32Array, o: number): number {
  const t = d[o + F.age] / d[o + F.life];
  const plume = d[o + F.plume];
  if (plume === 1) return Math.min(d[o + F.s1], d[o + F.s0] + d[o + F.spread] * Math.max(0, d[o + F.y] - d[o + F.y0]) + d[o + F.ageGrow] * d[o + F.age]);
  if (plume === 2) return d[o + F.s0] + (d[o + F.s1] - d[o + F.s0]) * Math.sqrt(t);
  return d[o + F.s0] + (d[o + F.s1] - d[o + F.s0]) * (d[o + F.ceil] > 0 ? t : Math.sqrt(t));
}

/** 粒子の入れ物（構造体の配列を1本の Float32Array で持つ）。死んだものは末尾と入れ替えて詰める。 */
export class ParticlePool {
  count = 0;
  private readonly d: Float32Array;
  private cursor = 0;

  constructor(readonly capacity: number) {
    this.d = new Float32Array(capacity * FIELDS);
  }

  spawn(p: ParticleSpawn, seed: number): void {
    let i: number;
    if (this.count < this.capacity) i = this.count++;
    else i = this.cursor++ % this.capacity; // いっぱいなら古い順に置き換える
    const o = i * FIELDS;
    const d = this.d;
    d[o + F.x] = p.x;
    d[o + F.y] = p.y;
    d[o + F.z] = p.z;
    d[o + F.vx] = p.vx;
    d[o + F.vy] = p.vy;
    d[o + F.vz] = p.vz;
    d[o + F.age] = 0;
    d[o + F.life] = Math.max(0.05, p.life);
    d[o + F.s0] = p.size0;
    d[o + F.s1] = p.size1;
    d[o + F.r] = p.r;
    d[o + F.g] = p.g;
    d[o + F.b] = p.b;
    d[o + F.a] = p.alpha;
    d[o + F.drag] = p.drag;
    d[o + F.buoy] = p.buoyancy;
    d[o + F.shape] = p.shape;
    d[o + F.spin] = p.spin ?? 0;
    d[o + F.rot] = p.rot0 ?? seed * 6.283;
    d[o + F.glow] = p.glow ?? 0;
    d[o + F.wind] = p.wind ?? 1;
    d[o + F.seed] = seed;
    d[o + F.bounce] = p.bounce ? 1 : 0;
    d[o + F.stretch] = p.stretch ?? 0;
    d[o + F.ceil] = p.ceil ?? 0;
    d[o + F.heat] = p.heat ?? 0;
    d[o + F.plume] = p.plume ?? 0;
    d[o + F.y0] = p.y0 ?? p.y;
    d[o + F.spread] = p.spread ?? 0;
    d[o + F.ageGrow] = p.ageGrow ?? 0;
  }

  update(dt: number, windX: number, windZ: number): void {
    if (dt <= 0) return;
    const d = this.d;
    for (let i = 0; i < this.count; i++) {
      const o = i * FIELDS;
      d[o + F.age] += dt;
      if (d[o + F.age] >= d[o + F.life]) {
        this.count--;
        if (i < this.count) d.copyWithin(o, this.count * FIELDS, this.count * FIELDS + FIELDS);
        i--;
        continue;
      }
      const k = Math.max(0, 1 - d[o + F.drag] * dt);
      d[o + F.vx] *= k;
      d[o + F.vz] *= k;
      let w = d[o + F.wind];
      const ceil = d[o + F.ceil];
      if (ceil > 0) {
        // r03-fx：煙の柱。上ほど強い風に流され、ceil を越えると浮力を失って横へ広がる（重なって空を暗くする）
        w *= particleWindAt(d[o + F.y]);
        if (d[o + F.y] > ceil) d[o + F.vy] *= Math.max(0, 1 - 1.6 * dt);
        else d[o + F.vy] = d[o + F.vy] * k + d[o + F.buoy] * dt;
      } else {
        d[o + F.vy] = d[o + F.vy] * k + d[o + F.buoy] * dt;
      }
      d[o + F.x] += (d[o + F.vx] + windX * w) * dt;
      d[o + F.y] += d[o + F.vy] * dt;
      d[o + F.z] += (d[o + F.vz] + windZ * w) * dt;
      d[o + F.rot] += d[o + F.spin] * dt;
      if (d[o + F.bounce] > 0 && d[o + F.y] < 0.2 && d[o + F.vy] < 0) {
        d[o + F.y] = 0.2;
        d[o + F.vy] *= -0.25;
        d[o + F.vx] *= 0.5;
        d[o + F.vz] *= 0.5;
        d[o + F.spin] *= 0.5;
      }
    }
  }

  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }

  /** i 番目の粒子を描画用の配列へ書く。 */
  write(i: number, slot: number, pos: Float32Array, size: Float32Array, color: Float32Array, misc: Float32Array, vel: Float32Array): void {
    const d = this.d;
    const o = i * FIELDS;
    const t = d[o + F.age] / d[o + F.life];
    pos[slot * 3] = d[o + F.x];
    pos[slot * 3 + 1] = d[o + F.y];
    pos[slot * 3 + 2] = d[o + F.z];
    size[slot * 4] = sizeOf(d, o);
    size[slot * 4 + 1] = d[o + F.rot];
    size[slot * 4 + 2] = t;
    size[slot * 4 + 3] = d[o + F.shape];
    color[slot * 4] = d[o + F.r];
    color[slot * 4 + 1] = d[o + F.g];
    color[slot * 4 + 2] = d[o + F.b];
    color[slot * 4 + 3] = d[o + F.a];
    misc[slot * 4] = d[o + F.heat] > 0 ? d[o + F.heat] : d[o + F.glow];
    misc[slot * 4 + 1] = d[o + F.seed];
    misc[slot * 4 + 2] = d[o + F.stretch];
    // r04-fx2：煙の柱と天蓋の粒は、火元から昇った高さ（m、0 より大きい）。ほかは 0
    misc[slot * 4 + 3] = d[o + F.plume] > 0 ? Math.max(0.01, d[o + F.y] - d[o + F.y0]) : 0;
    vel[slot * 3] = d[o + F.vx];
    vel[slot * 3 + 1] = d[o + F.vy];
    vel[slot * 3 + 2] = d[o + F.vz];
  }

  /** 調べもの・テスト用：i 番目の位置と速さ（生きている粒子だけ、0 ≤ i < count）。 */
  sample(i: number): { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; size: number; plume: number; rise: number } {
    const d = this.d;
    const o = i * FIELDS;
    const t = d[o + F.age] / d[o + F.life];
    return {
      x: d[o + F.x],
      y: d[o + F.y],
      z: d[o + F.z],
      vx: d[o + F.vx],
      vy: d[o + F.vy],
      vz: d[o + F.vz],
      age: t,
      size: sizeOf(d, o),
      plume: d[o + F.plume],
      rise: d[o + F.y] - d[o + F.y0],
    };
  }

  /** 並べ替え用：カメラの前後方向の距離。 */
  depth(i: number, cx: number, cy: number, cz: number, fx: number, fy: number, fz: number): number {
    const o = i * FIELDS;
    return (this.d[o + F.x] - cx) * fx + (this.d[o + F.y] - cy) * fy + (this.d[o + F.z] - cz) * fz;
  }
}

/** 1つの層（足す／重ねる／炎）の描画。 */
export class ParticleLayer {
  readonly pool: ParticlePool;
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly pos: InstancedBufferAttribute;
  private readonly size: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private readonly misc: InstancedBufferAttribute;
  private readonly vel: InstancedBufferAttribute;
  private order: number[] = [];
  private keys = new Float32Array(0);
  private readonly sunView = new Vector3();
  private readonly camDir = new Vector3();

  constructor(
    capacity: number,
    private readonly mode: ParticleMode,
    private readonly atmosphere: Atmosphere,
  ) {
    this.pool = new ParticlePool(capacity);
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const make = (n: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.pos = make(3);
    this.size = make(4);
    this.color = make(4);
    this.misc = make(4);
    this.vel = make(3);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iSize', this.size);
    g.setAttribute('iColor', this.color);
    g.setAttribute('iMisc', this.misc);
    g.setAttribute('iVel', this.vel);
    g.instanceCount = 0;
    const frag = mode === 'additive' ? PARTICLE_ADDITIVE_FRAG : mode === 'flame' ? PARTICLE_FLAME_FRAG : PARTICLE_SOFT_FRAG;
    const material = new ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: frag,
      uniforms: {
        ...atmosphere.uniforms,
        ...(mode === 'flame' ? flameUniforms() : {}),
        uViewportH: { value: 900 },
        uMinPixels: { value: FX.minPixels },
        uSunView: { value: this.sunView },
        uSunLight: { value: SUN.illuminance * FX.particleSunScale },
        uFireAlpha: { value: FLAME.fireAlpha },
        uSootAlpha: { value: FLAME.sootAlpha },
        // r04-fx2：煙の柱の色（上ほど薄まって明るい）と、根元の火の照り返し
        uPlumeLift: { value: FX.plume.albedoLift },
        uPlumeLiftH: { value: FX.plume.albedoHeight },
        uPlumeGlow: { value: FX.plume.glow },
        uPlumeGlowH: { value: FX.plume.glowHeight },
        uPlumeGlowColor: { value: new Vector3(...FX.plume.glowColor) },
        // r04-fx2（引き継ぎ）：奥の不透明な物に近い所ほど透かす（壁や地面と交わる直線の縁を消す。render/softParticles.ts）
        ...SOFT_UNIFORMS,
      },
      transparent: true,
      depthWrite: false,
      blending: mode === 'additive' ? AdditiveBlending : mode === 'flame' ? CustomBlending : NormalBlending,
    });
    if (mode === 'flame') {
      // 前掛けの合成：色 × 覆い + 奥 × (1 − 覆い)。重なるほど炎の色（上限）へ近づき、それ以上は明るくならない
      material.blendSrc = OneFactor;
      material.blendDst = OneMinusSrcAlphaFactor;
      material.blendSrcAlpha = OneFactor;
      material.blendDstAlpha = OneMinusSrcAlphaFactor;
    }
    material.name = mode === 'additive' ? 'ParticlesAdd' : mode === 'flame' ? 'ParticlesFlame' : 'ParticlesSoft';
    this.mesh = new Mesh(g, material);
    this.mesh.frustumCulled = false;
    // 煙（10）→ 炎（10.5：煙の上に描く）→ 火の粉と光（11）
    this.mesh.renderOrder = mode === 'additive' ? 11 : mode === 'flame' ? 10.5 : 10;
    this.mesh.name = material.name;
    // r04-fx2（引き継ぎ）：不透明な物の後に、別のパス（FxPass）で描く
    this.mesh.layers.set(FX_LAYER);
  }

  /** シェーダーを先に作らせるため、1個だけ見える状態にする。 */
  prime(on: boolean): void {
    this.mesh.visible = on || this.pool.count > 0;
    this.mesh.geometry.instanceCount = on ? Math.max(1, this.pool.count) : this.pool.count;
  }

  /** 描画の前に呼ぶ：生きている粒子を属性へ書く（重ねる層と炎の層は奥から順に）。 */
  sync(camera: Camera, viewportHeight: number): void {
    const n = this.pool.count;
    const m = this.mesh.material;
    m.uniforms.uViewportH.value = viewportHeight;
    this.sunView.copy(this.atmosphere.sunDir).transformDirection(camera.matrixWorldInverse);
    const pos = this.pos.array as Float32Array;
    const size = this.size.array as Float32Array;
    const color = this.color.array as Float32Array;
    const misc = this.misc.array as Float32Array;
    const vel = this.vel.array as Float32Array;
    if (this.mode !== 'additive' && n > 1) {
      if (this.keys.length < n) this.keys = new Float32Array(this.pool.capacity);
      camera.getWorldDirection(this.camDir);
      const c = camera.position;
      const order = this.order;
      order.length = n;
      for (let i = 0; i < n; i++) {
        order[i] = i;
        this.keys[i] = this.pool.depth(i, c.x, c.y, c.z, this.camDir.x, this.camDir.y, this.camDir.z);
      }
      const keys = this.keys;
      order.sort((a, b) => keys[b] - keys[a]);
      for (let k = 0; k < n; k++) this.pool.write(order[k], k, pos, size, color, misc, vel);
    } else {
      for (let i = 0; i < n; i++) this.pool.write(i, i, pos, size, color, misc, vel);
    }
    for (const a of [this.pos, this.size, this.color, this.misc, this.vel]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, n) * a.itemSize);
      a.needsUpdate = true;
    }
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}
