// OWNER: fx
// よく使う粒子の出し方（炎・煙・土煙・火の粉・ガラス片・閃光）。大きさは巨体と街の縮尺（m）で決める。
// 乱数は fx の系列だけを使う（撮影で決定的にするため、Math.random は使わない）。
// r03-fx：炎は炎の層（前掛けの合成・温度で色が決まる）へ移した。煙は火元から昇る柱（plume）、崩落の土煙は道に沿って這う（crawl）。
import { FX } from '../config/fx';
import type { Rng } from '../core/rng';
import { SHAPE, type ParticleLayer } from './particles';

export class Emitters {
  constructor(
    private readonly add: ParticleLayer,
    private readonly soft: ParticleLayer,
    private readonly fire: ParticleLayer,
    private readonly rng: Rng,
  ) {}

  /** 壁や地面から立ち上る炎の舌（炎の層。上へ伸ばした筋）。 */
  flame(x: number, y: number, z: number, nx: number, nz: number, scale: number, intensity = 1): void {
    const r = this.rng;
    this.fire.pool.spawn(
      {
        x: x + nx * r.range(0.5, 2),
        y,
        z: z + nz * r.range(0.5, 2),
        vx: nx * r.range(0.5, 2.5) + r.range(-1, 1),
        vy: r.range(4, 9) * Math.sqrt(scale),
        vz: nz * r.range(0.5, 2.5) + r.range(-1, 1),
        life: r.range(0.8, 1.5),
        size0: 2.6 * scale,
        size1: r.range(5.5, 8.5) * scale,
        r: 1,
        g: 1,
        b: 1,
        alpha: Math.min(1, 0.85 * intensity),
        drag: 0.6,
        buoyancy: 3,
        shape: SHAPE.flame,
        wind: 0.6,
        heat: r.range(0.72, 0.9),
        stretch: 0.9,
      },
      r.next(),
    );
  }

  /** 煙（1つ）：ゆっくり昇って風に流れ、広がる。glow は下からの火の照り返し。 */
  smoke(x: number, y: number, z: number, size: number, glow: number, lifeScale = 1): void {
    const r = this.rng;
    const [ar, ag, ab] = FX.smoke.albedo;
    const tone = r.range(0.75, 1.3);
    this.soft.pool.spawn(
      {
        x: x + r.range(-2, 2),
        y,
        z: z + r.range(-2, 2),
        vx: r.range(-1.5, 1.5),
        vy: r.range(7, 11),
        vz: r.range(-1.5, 1.5),
        life: r.range(12, 19) * lifeScale,
        size0: size * 0.4,
        size1: size * r.range(1.8, 2.6),
        r: ar * tone,
        g: ag * tone,
        b: ab * tone,
        alpha: r.range(0.4, 0.62),
        drag: 0.08,
        buoyancy: 0.9,
        shape: SHAPE.soft,
        spin: r.range(-0.15, 0.15),
        glow,
      },
      r.next(),
    );
  }

  /**
   * 煙の柱の一粒。火元（半径 r0 の円）から昇り、上ほど強い風で風下へ傾き、ceil で浮力を失って横へ広がる。strength は燃えの強さ（0〜1）。
   * r04-fx2：太さは昇った高さで決める（同じ高さの粒は同じ太さ。年齢で決めると大小が混ざってまだらに見えた）。
   * 1粒は薄く（重なって柱の濃さになる）、色のむらを小さくする（r03-fx：0.7〜1.25 倍のむらが、茶色のまだらに見えた）。
   * density は濃さの倍率（r04-fx2・引き継ぎ：炎が当たった所の出たての煙は FX.plume.breathDensity 倍に濃い。1粒を薄くしたら、
   * breath の3秒では煙が見えなくなった）
   */
  plume(x: number, y: number, z: number, r0: number, strength: number, glow: number, density = 1): void {
    const r = this.rng;
    const P = FX.plume;
    const [ar, ag, ab] = P.albedo;
    const tone = r.range(0.9, 1.1);
    const a = r.range(0, Math.PI * 2);
    const rr = Math.sqrt(r.next()) * r0 * 0.5;
    this.soft.pool.spawn(
      {
        x: x + Math.cos(a) * rr,
        y: y + r.range(0, 2),
        z: z + Math.sin(a) * rr,
        vx: Math.cos(a) * r.range(0.2, 0.9),
        vy: r.range(P.rise[0], P.rise[1]) * (0.8 + 0.2 * strength),
        vz: Math.sin(a) * r.range(0.2, 0.9),
        life: r.range(P.life[0], P.life[1]),
        size0: r0 * r.range(P.start[0], P.start[1]),
        size1: P.maxSize,
        r: ar * tone,
        g: ag * tone,
        b: ab * tone,
        alpha: Math.min(0.9, r.range(P.alpha[0], P.alpha[1]) * (0.7 + 0.3 * strength) * density),
        drag: 0.1,
        buoyancy: P.buoyancy,
        shape: SHAPE.soft,
        spin: r.range(-0.08, 0.08),
        glow,
        ceil: y + r.range(P.ceil[0], P.ceil[1]),
        plume: 1,
        y0: y,
        spread: P.spread * r.range(0.9, 1.1),
        ageGrow: P.ageGrow,
      },
      r.next(),
    );
  }

  /**
   * r04-fx2：煙の天蓋の一粒。指摘「燃え広がった街区の煙は重なって空を暗くする」。火元 (x, y, z) の上、柱が浮力を失う高さに、
   * 大きく薄い粒を置く。風下へゆっくり流れて重なり、燃える街区の上の空を少し暗くする。
   */
  canopy(x: number, y: number, z: number, strength: number): void {
    const r = this.rng;
    const P = FX.plume;
    const C = P.canopy;
    const [ar, ag, ab] = P.albedo;
    const size = r.range(C.size[0], C.size[1]);
    this.soft.pool.spawn(
      {
        x: x + r.range(-25, 25),
        y: y + r.range(P.ceil[0], P.ceil[1]) * 0.85,
        z: z + r.range(-25, 25),
        vx: r.range(-0.6, 0.6),
        vy: r.range(0.2, 0.9),
        vz: r.range(-0.6, 0.6),
        life: r.range(C.life[0], C.life[1]),
        size0: size * 0.55,
        size1: size,
        r: ar,
        g: ag,
        b: ab,
        alpha: r.range(C.alpha[0], C.alpha[1]) * (0.6 + 0.4 * strength),
        drag: 0.05,
        buoyancy: 0,
        shape: SHAPE.soft,
        spin: r.range(-0.04, 0.04),
        wind: 1.2,
        plume: 2,
        y0: y,
      },
      r.next(),
    );
  }

  /** 土煙：地面や崩れる建物から横へ広がり、光を受けて明るく漂う。 */
  dust(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, tint = 1, opacity = 0.4): void {
    const r = this.rng;
    const [ar, ag, ab] = FX.dust.albedo;
    const tone = r.range(0.85, 1.15) * tint;
    this.soft.pool.spawn(
      {
        x,
        y,
        z,
        vx,
        vy,
        vz,
        life: life * r.range(0.8, 1.2),
        size0: size * 0.35,
        size1: size,
        r: ar * tone,
        g: ag * tone,
        b: ab * tone,
        alpha: opacity * r.range(0.75, 1.25),
        drag: 1.1,
        buoyancy: 0.6,
        shape: SHAPE.soft,
        spin: r.range(-0.3, 0.3),
        wind: 0.7,
      },
      r.next(),
    );
  }

  /**
   * 這う土煙（r03-fx）：崩れる建物の道に面した辺 (x,z)・外向き (nx,nz) から出て、道に沿って (tx,tz) の両側へ這う。
   * 横の速さは大きく、上がる速さと浮力は小さい。抵抗で止まりながら膨らみ、ゆっくり上がる。
   */
  crawl(x: number, y: number, z: number, nx: number, nz: number, tx: number, tz: number, tint = 1): void {
    const r = this.rng;
    const C = FX.crawl;
    const [ar, ag, ab] = FX.dust.albedo;
    const tone = r.range(0.85, 1.12) * tint;
    const out = r.range(C.out[0], C.out[1]);
    const along = r.range(C.along[0], C.along[1]) * (r.next() < 0.5 ? -1 : 1);
    this.soft.pool.spawn(
      {
        x,
        y: y + r.range(0.5, 3),
        z,
        vx: nx * out + tx * along,
        vy: r.range(C.rise[0], C.rise[1]),
        vz: nz * out + tz * along,
        life: r.range(C.life[0], C.life[1]),
        size0: C.size[0] * r.range(0.8, 1.2),
        size1: C.size[1] * r.range(0.75, 1.2),
        r: ar * tone,
        g: ag * tone,
        b: ab * tone,
        alpha: r.range(0.34, 0.5),
        drag: 0.42,
        buoyancy: 0.12,
        shape: SHAPE.soft,
        spin: r.range(-0.2, 0.2),
        wind: 0.45,
      },
      r.next(),
    );
  }

  /** 火の粉：明るい点が舞い上がる。 */
  ember(x: number, y: number, z: number): void {
    const r = this.rng;
    const [cr, cg, cb] = FX.ember.color;
    const k = FX.ember.intensity * r.range(0.5, 1.2);
    this.add.pool.spawn(
      {
        x,
        y,
        z,
        vx: r.range(-4, 4),
        vy: r.range(7, 16),
        vz: r.range(-4, 4),
        life: r.range(2, 4),
        size0: r.range(0.35, 0.7),
        size1: 0.2,
        r: cr * k,
        g: cg * k,
        b: cb * k,
        alpha: 1,
        drag: 0.5,
        buoyancy: 1.5,
        shape: SHAPE.spark,
        wind: 1.4,
        bounce: true,
      },
      r.next(),
    );
  }

  /** ガラス片：壁から外へ飛び出し、回りながら落ちて夕日を返す。 */
  shard(x: number, y: number, z: number, nx: number, nz: number): void {
    const r = this.rng;
    const [cr, cg, cb] = FX.glass.color;
    const k = FX.glass.intensity;
    const out = r.range(3, 11);
    this.add.pool.spawn(
      {
        x: x + nx * 0.8,
        y,
        z: z + nz * 0.8,
        vx: nx * out + r.range(-2.5, 2.5),
        vy: r.range(-1, 5),
        vz: nz * out + r.range(-2.5, 2.5),
        life: r.range(2.4, 4.2),
        size0: r.range(0.45, 1.2),
        size1: r.range(0.3, 0.8),
        r: cr * k,
        g: cg * k,
        b: cb * k,
        alpha: 1,
        drag: 0.25,
        buoyancy: -FX.gravity,
        shape: SHAPE.shard,
        spin: r.range(-9, 9),
        wind: 0.2,
        bounce: true,
      },
      r.next(),
    );
  }

  /** 閃光（着火や喉の光）。 */
  flash(x: number, y: number, z: number, size: number, intensity: number, life = 0.35): void {
    const r = this.rng;
    this.add.pool.spawn(
      { x, y, z, vx: 0, vy: 1, vz: 0, life, size0: size, size1: size * 1.6, r: intensity, g: intensity * 0.55, b: intensity * 0.22, alpha: 1, drag: 0, buoyancy: 0, shape: SHAPE.flash, wind: 0 },
      r.next(),
    );
  }

  /**
   * 吐く炎の粒（r03-fx で3層に）。layer：'core' は口からの細く速い芯（白に近い黄の筋）、'body' は広がる橙の流れ、
   * 'tip' は届く所で膨らむ渦（すぐに赤から煤へ）。向き (dx,dy,dz)、寿命 life（届くまでの秒数）、reach は届く距離（m）。
   */
  breathFlame(layer: 'core' | 'body' | 'tip', x: number, y: number, z: number, dx: number, dy: number, dz: number, life: number, reach: number): void {
    const r = this.rng;
    const B = FX.breathFlame;
    if (layer === 'tip') {
      const T = B.tip;
      const sp = B.speed * r.range(0.18, 0.32);
      this.fire.pool.spawn(
        {
          x: x + dx * reach * r.range(0.72, 0.9) + r.range(-2, 2),
          y: y + dy * reach * r.range(0.72, 0.9) + r.range(-1.5, 2.5),
          z: z + dz * reach * r.range(0.72, 0.9) + r.range(-2, 2),
          vx: dx * sp + r.range(-4, 4),
          vy: dy * sp + r.range(1, 6),
          vz: dz * sp + r.range(-4, 4),
          life: r.range(0.45, 0.8),
          size0: T.size0,
          size1: T.size1 + reach * 0.08,
          r: 1,
          g: 1,
          b: 1,
          alpha: T.alpha,
          drag: 1.4,
          buoyancy: 7,
          shape: SHAPE.flame,
          wind: 0.5,
          heat: T.heat * r.range(0.85, 1.1),
          stretch: 0.5,
        },
        r.next(),
      );
      return;
    }
    const L = layer === 'core' ? B.core : B.body;
    const spread = L.spread;
    const speed = B.speed * (layer === 'core' ? r.range(1.0, 1.08) : r.range(0.82, 1.0));
    const size1 = layer === 'core' ? L.size1 : L.size1 + reach * B.body.sizePerM;
    this.fire.pool.spawn(
      {
        x: x + r.range(-0.5, 0.5),
        y: y + r.range(-0.5, 0.5),
        z: z + r.range(-0.5, 0.5),
        vx: (dx + r.range(-spread, spread)) * speed,
        vy: (dy + r.range(-spread, spread)) * speed,
        vz: (dz + r.range(-spread, spread)) * speed,
        life: layer === 'core' ? life * B.core.lifeScale * r.range(0.8, 1.1) : life * r.range(0.9, 1.08),
        size0: L.size0,
        size1,
        r: 1,
        g: 1,
        b: 1,
        alpha: L.alpha,
        drag: layer === 'core' ? 0.15 : 0.3,
        buoyancy: layer === 'core' ? 1.5 : 6,
        shape: SHAPE.flame,
        wind: 0.3,
        heat: L.heat * r.range(0.94, 1.04),
        stretch: L.stretch,
      },
      r.next(),
    );
  }

  /** 壁に当たって広がる炎（当たった点 (x,y,z)、壁の向き (nx,nz)）。壁に沿って四方へ流れ、橙から赤へ冷える。 */
  splash(x: number, y: number, z: number, nx: number, nz: number): void {
    const r = this.rng;
    const a = r.range(0, Math.PI * 2);
    // 壁の面の上の向き：横（接線）と上
    const tx = -nz;
    const tz = nx;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sp = r.range(9, 20);
    this.fire.pool.spawn(
      {
        x: x + nx * r.range(0.5, 2.5),
        y: y + r.range(-1.5, 2),
        z: z + nz * r.range(0.5, 2.5),
        vx: tx * ca * sp + nx * r.range(0.5, 3),
        vy: sa * sp * 0.7 + r.range(2, 6),
        vz: tz * ca * sp + nz * r.range(0.5, 3),
        life: r.range(0.5, 0.95),
        size0: r.range(2.5, 4),
        size1: r.range(8, 13),
        r: 1,
        g: 1,
        b: 1,
        alpha: 0.42,
        drag: 1.6,
        buoyancy: 8,
        shape: SHAPE.flame,
        wind: 0.5,
        heat: r.range(0.62, 0.8),
        stretch: 0.8,
      },
      r.next(),
    );
  }
}
