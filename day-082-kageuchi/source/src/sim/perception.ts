// OWNER: core
// 知覚の計算：見える距離 D・視界の角・満ちるまでの時間 T・視界の扇。純粋な関数だけを置く（テストで直接たたく）。
import type { MovingLight, Phase } from '../contract/snapshot';
import { SIGHT, SUSPICION } from '../config/rules';
import { DEG, clamp } from './math';
import { boxEntryT, falloff, type Box, type StageQuery } from './query';

/** プレイヤーの構え（見える距離・不審の溜まり方・足音が変わる）。 */
export type MoveStance = 'crouch' | 'walk' | 'run';

export function stanceSightMul(st: MoveStance): number {
  return st === 'crouch' ? SIGHT.stanceCrouch : st === 'run' ? SIGHT.stanceRun : SIGHT.stanceWalk;
}

export function phaseSightMul(phase: Phase): number {
  switch (phase) {
    case 'caution':
      return SIGHT.phaseCaution;
    case 'evasion':
      return SIGHT.phaseEvasion;
    case 'alert':
      return SIGHT.phaseAlert;
    default:
      return SIGHT.phaseNormal;
  }
}

/** 視界の半角（ラジアン）。発見中は広い。 */
export function halfAngleRad(phase: Phase): number {
  return (phase === 'alert' ? SIGHT.halfAngleAlert : SIGHT.halfAngle) * DEG;
}

/** 見える距離 D（m）。bush は植え込みでしゃがんでいるとき SIGHT.bushCrouch、それ以外は 1。 */
export function sightDistance(light: number, stanceMul: number, sightMul: number, phaseMul: number, bush: number): number {
  return (SIGHT.base + SIGHT.perLight * light) * stanceMul * sightMul * phaseMul * bush;
}

/** 規則どおりの満ちるまでの時間（係数込み・下限なし）。 */
export function rawFillTime(d: number, sightD: number, mul: number): number {
  const span = sightD - SUSPICION.fillNear;
  const k = span > 1e-6 ? clamp((d - SUSPICION.fillNear) / span, 0, 1) : 0;
  return (SUSPICION.fillBase + SUSPICION.fillSpan * k) * mul;
}

/** 「人が遊べる約束」1 の最短：3m より遠ければ 0.7 秒、近ければ 0.4 秒。 */
export function minGapFor(d: number): number {
  return d > SUSPICION.farDistance ? SUSPICION.minGapFar : SUSPICION.minGap;
}

/** 満ちるまでの時間。規則の値を、約束の最短で下から切り詰める（係数を掛け合わせると 0.16 秒まで縮むため）。 */
export function fillTime(d: number, sightD: number, mul: number): number {
  return Math.max(rawFillTime(d, sightD, mul), minGapFor(d));
}

/**
 * 視界の場：ある番兵の目から見て、その地点に立つ者が見える距離 D を返す。判定（guards.ts の canSee）と
 * 表示（buildCone の扇）が、この同じ dAt を使う（r01-integrate: 扇に出ない所で見つかる食い違いを無くすため）。
 * 明るさは StageQuery.brightnessAt と同じ足し方（空の明るさ＋置いてある灯り＋動く灯りを、同じ順で足して 0..1 に切る）。
 * prepare で目のまわり（届く最大の D の内）の灯り・暗い場所・植え込み・壁だけを拾っておき、1点あたりの計算を軽くする。
 */
export class SightField {
  ex = 0;
  ez = 0;
  /** 明るさ 1・植え込みなしのときの D。 */
  maxD = 0;
  /** 拾った灯りを全部足しても届かない先。この先に見える所は無いので、線はここまでしか伸ばさない。 */
  limit = 0;
  private q: StageQuery | null = null;
  private stanceMul = 1;
  private sightMul = 1;
  private phaseMul = 1;
  private nz = 0;
  private readonly zones = new Float64Array(5 * 16);
  private ns = 0;
  private readonly st = new Float64Array(5 * 32);
  private nm = 0;
  private readonly mv = new Float64Array(4 * 16);
  private nh = 0;
  private readonly hs = new Float64Array(3 * 48);
  private nb = 0;
  private readonly boxes: Box[] = [];
  /** 空の明るさだけで決まる D の上限（暗い場所の最大の明るさで）。灯りの外ではこれより先は見えない。 */
  ambD = 0;
  // 線ごとの作業：その線に掛かる灯りだけを拾ったもの（rayBegin が作る）
  private rns = 0;
  private readonly rst = new Float64Array(5 * 32);
  private rnm = 0;
  private readonly rmv = new Float64Array(4 * 16);
  /** その線で、拾った灯りがどれも届かなくなる距離。 */
  rayEnd = 0;

  /** 目の位置と、明るさ以外の係数（構え・番兵の sightMul・寺の構え）を決め、まわりの物を拾う。walls は扇のときだけ。 */
  prepare(
    q: StageQuery,
    ex: number,
    ez: number,
    stanceMul: number,
    sightMul: number,
    phaseMul: number,
    crouch: boolean,
    moving: readonly MovingLight[],
    walls: boolean,
  ): this {
    this.q = q;
    this.ex = ex;
    this.ez = ez;
    this.stanceMul = stanceMul;
    this.sightMul = sightMul;
    this.phaseMul = phaseMul;
    const maxD = (SIGHT.base + SIGHT.perLight) * stanceMul * sightMul * phaseMul;
    this.maxD = maxD;
    const x0 = ex - maxD;
    const x1 = ex + maxD;
    const z0 = ez - maxD;
    const z1 = ez + maxD;
    this.nz = 0;
    for (const d of q.stage.darkZones) {
      const r = d.rect;
      if (r.x1 < x0 || r.x0 > x1 || r.z1 < z0 || r.z0 > z1 || this.nz >= 16) continue;
      const k = this.nz++ * 5;
      this.zones[k] = r.x0;
      this.zones[k + 1] = r.z0;
      this.zones[k + 2] = r.x1;
      this.zones[k + 3] = r.z1;
      this.zones[k + 4] = d.ambient;
    }
    // 届かない灯りは足しても 0 なので、拾わなくても和は変わらない（順は stage のまま）
    this.ns = 0;
    for (const l of q.lights) {
      const reach = maxD + Math.sqrt(l.r2);
      if (Math.abs(l.x - ex) > reach || Math.abs(l.z - ez) > reach || this.ns >= 32) continue;
      const k = this.ns++ * 5;
      this.st[k] = l.x;
      this.st[k + 1] = l.z;
      this.st[k + 2] = l.r2;
      this.st[k + 3] = l.inv2;
      this.st[k + 4] = l.intensity;
    }
    this.nm = 0;
    for (const l of moving) {
      const reach = maxD + l.radius;
      if (Math.abs(l.x - ex) > reach || Math.abs(l.z - ez) > reach || this.nm >= 16) continue;
      const k = this.nm++ * 4;
      this.mv[k] = l.x;
      this.mv[k + 1] = l.z;
      this.mv[k + 2] = l.radius * l.radius;
      this.mv[k + 3] = l.intensity;
    }
    this.nh = 0;
    if (crouch) {
      for (const h of q.stage.hides) {
        const reach = maxD + h.radius;
        if (Math.abs(h.center.x - ex) > reach || Math.abs(h.center.z - ez) > reach || this.nh >= 48) continue;
        const k = this.nh++ * 3;
        this.hs[k] = h.center.x;
        this.hs[k + 1] = h.center.z;
        this.hs[k + 2] = h.radius * h.radius;
      }
    }
    // 一番明るくなり得る値（空の明るさの最大＋拾った灯りの強さの和）で決まる D より先は、どこも見えない
    let lmax = q.stage.baseAmbient;
    for (let i = 0; i < this.nz; i++) lmax = Math.max(lmax, this.zones[i * 5 + 4]);
    for (let i = 0; i < this.ns; i++) lmax += this.st[i * 5 + 4];
    for (let i = 0; i < this.nm; i++) lmax += this.mv[i * 4 + 3];
    this.limit = Math.min(maxD, sightDistance(Math.min(1, lmax), stanceMul, sightMul, phaseMul, 1));
    let amax = q.stage.baseAmbient;
    for (let i = 0; i < this.nz; i++) amax = Math.max(amax, this.zones[i * 5 + 4]);
    this.ambD = sightDistance(Math.min(1, amax), stanceMul, sightMul, phaseMul, 1);
    this.nb = 0;
    if (walls) {
      for (const b of q.boxes) {
        if (b.maxX < x0 || b.minX > x1 || b.maxZ < z0 || b.minZ > z1) continue;
        this.boxes[this.nb++] = b;
      }
    }
    return this;
  }

  /** その地点の明るさ L（StageQuery.brightnessAt と同じ値。目から maxD の内で正しい）。 */
  lightAt(x: number, z: number): number {
    let amb = Infinity;
    for (let i = 0; i < this.nz; i++) {
      const k = i * 5;
      if (x >= this.zones[k] && x <= this.zones[k + 2] && z >= this.zones[k + 1] && z <= this.zones[k + 3] && this.zones[k + 4] < amb) amb = this.zones[k + 4];
    }
    if (amb === Infinity) amb = this.q ? this.q.stage.baseAmbient : 0;
    let sumS = 0;
    for (let i = 0; i < this.ns; i++) {
      const k = i * 5;
      const dx = x - this.st[k];
      const dz = z - this.st[k + 1];
      const d2 = dx * dx + dz * dz;
      if (d2 < this.st[k + 2]) sumS += this.st[k + 4] * falloff(d2 * this.st[k + 3]);
    }
    let sumM = 0;
    for (let i = 0; i < this.nm; i++) {
      const k = i * 4;
      const dx = x - this.mv[k];
      const dz = z - this.mv[k + 1];
      const d2 = dx * dx + dz * dz;
      if (d2 < this.mv[k + 2]) sumM += this.mv[k + 3] * falloff(d2 / this.mv[k + 2]);
    }
    const l = amb + sumS + sumM;
    return l < 0 ? 0 : l > 1 ? 1 : l;
  }

  /** その地点に立つ者が見える距離 D（明るさ・構え・sightMul・寺の構え・植え込み）。判定と扇の共通の関数。 */
  dAt(x: number, z: number): number {
    let bush = 1;
    for (let i = 0; i < this.nh; i++) {
      const k = i * 3;
      const dx = x - this.hs[k];
      const dz = z - this.hs[k + 1];
      if (dx * dx + dz * dz <= this.hs[k + 2]) {
        bush = SIGHT.bushCrouch;
        break;
      }
    }
    return sightDistance(this.lightAt(x, z), this.stanceMul, this.sightMul, this.phaseMul, bush);
  }

  /**
   * 線を1本始める：目から向き (dx, dz) の線に掛かる灯り（線との距離が半径より小さく、前にある物）だけを拾い、rayEnd を決める。
   * 掛からない灯りは、その線の上のどの点でも足されない（d² ≥ r²）ので、dAtRay の値は dAt と同じになる。
   */
  rayBegin(dx: number, dz: number): void {
    let end = 0;
    this.rns = 0;
    for (let i = 0; i < this.ns; i++) {
      const k = i * 5;
      const ox = this.st[k] - this.ex;
      const oz = this.st[k + 1] - this.ez;
      const t = ox * dx + oz * dz;
      const perp2 = ox * ox + oz * oz - t * t;
      const r2 = this.st[k + 2];
      if (perp2 >= r2 * (1 + 1e-9) + 1e-9) continue;
      const far = t + Math.sqrt(Math.max(0, r2 - perp2));
      if (far <= 0) continue;
      if (far > end) end = far;
      const o = this.rns++ * 5;
      for (let j = 0; j < 5; j++) this.rst[o + j] = this.st[k + j];
    }
    this.rnm = 0;
    for (let i = 0; i < this.nm; i++) {
      const k = i * 4;
      const ox = this.mv[k] - this.ex;
      const oz = this.mv[k + 1] - this.ez;
      const t = ox * dx + oz * dz;
      const perp2 = ox * ox + oz * oz - t * t;
      const r2 = this.mv[k + 2];
      if (perp2 >= r2 * (1 + 1e-9) + 1e-9) continue;
      const far = t + Math.sqrt(Math.max(0, r2 - perp2));
      if (far <= 0) continue;
      if (far > end) end = far;
      const o = this.rnm++ * 4;
      for (let j = 0; j < 4; j++) this.rmv[o + j] = this.mv[k + j];
    }
    this.rayEnd = end;
  }

  /** rayBegin で始めた線の上の点の D（dAt と同じ値。拾った灯りだけを、同じ順で足す）。 */
  dAtRay(x: number, z: number): number {
    let bush = 1;
    for (let i = 0; i < this.nh; i++) {
      const k = i * 3;
      const dx = x - this.hs[k];
      const dz = z - this.hs[k + 1];
      if (dx * dx + dz * dz <= this.hs[k + 2]) {
        bush = SIGHT.bushCrouch;
        break;
      }
    }
    let amb = Infinity;
    for (let i = 0; i < this.nz; i++) {
      const k = i * 5;
      if (x >= this.zones[k] && x <= this.zones[k + 2] && z >= this.zones[k + 1] && z <= this.zones[k + 3] && this.zones[k + 4] < amb) amb = this.zones[k + 4];
    }
    if (amb === Infinity) amb = this.q ? this.q.stage.baseAmbient : 0;
    let sumS = 0;
    for (let i = 0; i < this.rns; i++) {
      const k = i * 5;
      const dx = x - this.rst[k];
      const dz = z - this.rst[k + 1];
      const d2 = dx * dx + dz * dz;
      if (d2 < this.rst[k + 2]) sumS += this.rst[k + 4] * falloff(d2 * this.rst[k + 3]);
    }
    let sumM = 0;
    for (let i = 0; i < this.rnm; i++) {
      const k = i * 4;
      const dx = x - this.rmv[k];
      const dz = z - this.rmv[k + 1];
      const d2 = dx * dx + dz * dz;
      if (d2 < this.rmv[k + 2]) sumM += this.rmv[k + 3] * falloff(d2 / this.rmv[k + 2]);
    }
    const l0 = amb + sumS + sumM;
    const l = l0 < 0 ? 0 : l0 > 1 ? 1 : l0;
    return sightDistance(l, this.stanceMul, this.sightMul, this.phaseMul, bush);
  }

  /** 目から向き (dx, dz) へ伸ばした線が、最初に壁か建物に当たるまでの距離（prepare の walls=true のとき）。 */
  wallAlong(dx: number, dz: number, maxLen: number): number {
    let wall = maxLen;
    for (let m = 0; m < this.nb; m++) {
      const t = boxEntryT(this.boxes[m], this.ex, this.ez, dx, dz, wall);
      if (t < wall) wall = t;
    }
    return wall;
  }
}

/** 扇の出力：目から続く扇（poly）と、暗い隙間の向こうの灯りの島（帯）。 */
export interface ConeBuffers {
  /** [目の x, z, 線1の x, z, …]（SIGHT.coneRays＋1 点） */
  poly: Float32Array;
  /** 帯1本につき 8 つ：手前の左・手前の右・奥の右・奥の左（x, z の順）。左右は線の角の幅 */
  bands: Float32Array;
}

/**
 * 視界の扇。目から SIGHT.coneRays 本の線を伸ばし、SIGHT.coneStep 刻みで「その地点で見えるか」（距離 ≤ dAt）を調べる。
 * 線ごとに、壁か建物に当たるまで（見えうる最大の D まで）進め、見える区間を全部集める。目から続く最初の区間は扇（poly）に、
 * 暗い隙間の向こうの区間（灯りの島）は帯（bands）にする。境は前後の刻みの間を線形に詰める。
 * 帯は、隣の線の島と区間が重なれば台形でつなぎ（島のふちが階段にならない）、つながらない側は線の角の幅の半分だけ張り出す。
 * field は prepare(…, walls=true) 済みのもの。帯の本数を返す。
 */
export function buildCone(out: ConeBuffers, field: SightField, viewYaw: number, half: number, exact = false): number {
  const rays = SIGHT.coneRays;
  const step = SIGHT.coneStep;
  const ex = field.ex;
  const ez = field.ez;
  const maxD = field.limit;
  const poly = out.poly;
  const bands = out.bands;
  const maxBands = Math.floor(bands.length / 8);
  const da = rays > 1 ? (2 * half) / (rays - 1) : 0;
  const lo = viewYaw - half;
  const hi = viewYaw + half;
  poly[0] = ex;
  poly[1] = ez;
  const d0 = field.dAt(ex, ez);

  // 1. 線ごとの区間
  for (let r = 0; r < rays; r++) {
    const a = lo + da * r;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const wall = field.wallAlong(dx, dz, maxD);
    // 線に掛かる灯りだけを拾う。灯りがどれも届かず、空の明るさだけの D も越えた先は、もう見える所が無いので打ち切る
    // （exact=true は打ち切りも拾い分けもしない確かめ用。結果は同じになることをテストで見る）
    field.rayBegin(dx, dz);
    const stopAt = exact ? Infinity : Math.max(field.rayEnd, field.ambD);
    // f(s) = s − D(s)。f ≤ 0 の所が見える
    let prevS = 0;
    let prevD = d0;
    let prevF = -d0;
    let visible = true;
    let start = 0;
    let first = -1;
    let ns = 0;
    const push = (s0: number, s1: number): void => {
      if (ns < MAX_SPANS && s1 - s0 >= 0.05) {
        SPANS[(r * MAX_SPANS + ns) * 2] = s0;
        SPANS[(r * MAX_SPANS + ns) * 2 + 1] = s1;
        ns++;
      }
    };
    for (let s = step; s <= wall; s += step) {
      if (!visible && s > stopAt) break;
      const dHere = exact ? field.dAt(ex + dx * s, ez + dz * s) : field.dAtRay(ex + dx * s, ez + dz * s);
      const f = s - dHere;
      if (visible && f > 0) {
        const end = prevS + ((s - prevS) * -prevF) / (f - prevF);
        if (first < 0) first = end;
        else push(start, end);
        visible = false;
      } else if (!visible && f <= 0) {
        start = prevS + ((s - prevS) * prevF) / (prevF - f);
        visible = true;
      }
      prevS = s;
      prevD = dHere;
      prevF = f;
    }
    if (visible) {
      // 最後の刻みまで見えていた：その先は D が変わらないとみなし、壁か D で止める
      const end = Math.min(wall, Math.max(prevS, prevD));
      if (first < 0) first = end;
      else push(start, end);
    }
    if (first > wall) first = wall;
    NSPANS[r] = ns;
    poly[2 + r * 2] = ex + dx * first;
    poly[3 + r * 2] = ez + dz * first;
  }

  // 2. 島を帯にする
  let nb = 0;
  const quad = (aL: number, l0: number, l1: number, aR: number, r0: number, r1: number): void => {
    if (nb >= maxBands) return;
    const cl = Math.cos(aL);
    const sl = Math.sin(aL);
    const cr = Math.cos(aR);
    const sr = Math.sin(aR);
    const k = nb++ * 8;
    bands[k] = ex + cl * l0;
    bands[k + 1] = ez + sl * l0;
    bands[k + 2] = ex + cr * r0;
    bands[k + 3] = ez + sr * r0;
    bands[k + 4] = ex + cr * r1;
    bands[k + 5] = ez + sr * r1;
    bands[k + 6] = ex + cl * l1;
    bands[k + 7] = ez + sl * l1;
  };
  const overlaps = (r: number, s0: number, s1: number): boolean => {
    if (r < 0 || r >= rays) return false;
    for (let j = 0; j < NSPANS[r]; j++) {
      const b0 = SPANS[(r * MAX_SPANS + j) * 2];
      const b1 = SPANS[(r * MAX_SPANS + j) * 2 + 1];
      if (s0 < b1 && b0 < s1) return true;
    }
    return false;
  };
  for (let r = 0; r < rays; r++) {
    const a = lo + da * r;
    for (let i = 0; i < NSPANS[r]; i++) {
      const s0 = SPANS[(r * MAX_SPANS + i) * 2];
      const s1 = SPANS[(r * MAX_SPANS + i) * 2 + 1];
      // 右（次の線）の島と重なる区間は台形でつなぐ
      let joined = false;
      if (r + 1 < rays) {
        for (let j = 0; j < NSPANS[r + 1]; j++) {
          const b0 = SPANS[((r + 1) * MAX_SPANS + j) * 2];
          const b1 = SPANS[((r + 1) * MAX_SPANS + j) * 2 + 1];
          if (s0 < b1 && b0 < s1) {
            quad(a, s0, s1, a + da, b0, b1);
            joined = true;
          }
        }
      }
      if (!joined) quad(a, s0, s1, Math.min(hi, a + da / 2), s0, s1);
      if (!overlaps(r - 1, s0, s1)) quad(Math.max(lo, a - da / 2), s0, s1, a, s0, s1);
    }
  }
  return nb;
}

/** 線1本あたりの島の区間の上限と、作業用の配列（線ごとに [s0, s1] を並べる）。 */
const MAX_SPANS = 8;
const SPANS = new Float64Array(SIGHT.coneRays * MAX_SPANS * 2);
const NSPANS = new Int32Array(SIGHT.coneRays);

/** 点が扇（目から続く扇の多角形か、灯りの島の帯のどれか）の中にあるか。テストと調べ用。 */
export function coneContains(poly: Float32Array, bands: Float32Array, bandCount: number, x: number, z: number): boolean {
  const n = poly.length / 2;
  if (n >= 3 && insidePolygon(poly, 0, n, x, z)) return true;
  for (let b = 0; b < bandCount; b++) if (insidePolygon(bands, b * 8, 4, x, z)) return true;
  return false;
}

function insidePolygon(p: Float32Array, off: number, n: number, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[off + i * 2];
    const zi = p[off + i * 2 + 1];
    const xj = p[off + j * 2];
    const zj = p[off + j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
