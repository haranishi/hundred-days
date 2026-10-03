// OWNER: render
// 大気の計算（three を使わない純粋な数式）。空・霧・環境反射・太陽の色は、すべてここから取る。
// レイリー散乱・ミー散乱・オゾン吸収の単一散乱に、多重散乱の簡易な近似を足した模型。
// 物理定数は地球の実測値（Bruneton & Neyret 2008、Hillaire 2020 が使う公開値）を config/render.ts に置く。

export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

export interface AtmosphereParams {
  planetRadius: number;
  atmosphereTop: number;
  /** レイリー散乱係数（地表、1/m） */
  rayleigh: RGB;
  rayleighHeight: number;
  /** ミー散乱・消散係数（地表、1/m）。エアロゾルの量（もや）で決まる */
  mieScattering: number;
  mieExtinction: number;
  mieHeight: number;
  /** ミー散乱の前方性（0..1） */
  mieG: number;
  /** オゾンの吸収係数（最大、1/m） */
  ozone: RGB;
  ozoneCenter: number;
  ozoneHalfWidth: number;
  /** 多重散乱の近似の強さ（単一散乱を等方的に足す割合） */
  multiScatter: number;
  /** 空を計算するときの視点の高さ（m） */
  viewerAltitude: number;
  /**
   * r05-dusk：エアロゾルの散乱・消散の波長の傾き（オングストローム指数 α。係数は (550nm/λ)^α 倍）。
   * 0 で波長によらない灰色。粒の細かい都市のもや・煙は 1.5〜2.5 で、青ほど強く消すので、低い太陽の光と地平の空が暖色へ寄る
   */
  mieAngstrom?: number;
  /** r05-dusk：夕方の規則（地平の帯と高い空の紫）。無ければ物理の散乱だけ */
  dusk?: DuskParams;
}

/** 3色の代表の波長（nm）。エアロゾルの波長の傾きに使う（レイリー散乱の係数はこの波長の公開値）。 */
const WAVELENGTHS: RGB = [680, 550, 440];

/** エアロゾルの係数の、色ごとの倍率（550nm を 1）。 */
export function mieSpectrum(p: AtmosphereParams): RGB {
  const a = p.mieAngstrom ?? 0;
  return [Math.pow(550 / WAVELENGTHS[0], a), 1, Math.pow(550 / WAVELENGTHS[2], a)];
}

/** 空の表（LUT）の大きさと、仰角の下限（地平線の少し下まで持つ）。GLSL 側と共有する。 */
export const SKY_LUT = { width: 128, height: 64, elevationMin: -0.08 } as const;

const PI = Math.PI;

/** 仰角・方位角（北=0、東=90、度）から太陽の向き（地面から太陽へ向かう単位ベクトル）。x=東、z=南。 */
export function sunDirection(elevationDeg: number, azimuthDeg: number): Vec3 {
  const el = (elevationDeg * PI) / 180;
  const az = (azimuthDeg * PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

function densities(p: AtmosphereParams, alt: number): { r: number; m: number; o: number } {
  const a = Math.max(0, alt);
  return {
    r: Math.exp(-a / p.rayleighHeight),
    m: Math.exp(-a / p.mieHeight),
    o: Math.max(0, 1 - Math.abs(a - p.ozoneCenter) / p.ozoneHalfWidth),
  };
}

function extinction(p: AtmosphereParams, alt: number): RGB {
  const d = densities(p, alt);
  const ms = mieSpectrum(p);
  return [
    p.rayleigh[0] * d.r + p.mieExtinction * ms[0] * d.m + p.ozone[0] * d.o,
    p.rayleigh[1] * d.r + p.mieExtinction * ms[1] * d.m + p.ozone[1] * d.o,
    p.rayleigh[2] * d.r + p.mieExtinction * ms[2] * d.m + p.ozone[2] * d.o,
  ];
}

/** 半径 r・天頂角の余弦 mu の光線が大気の上端に届くまでの距離。 */
function distanceToTop(p: AtmosphereParams, r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + p.atmosphereTop * p.atmosphereTop;
  return Math.max(0, -r * mu + Math.sqrt(Math.max(0, disc)));
}

/** 地面に当たるならその距離、当たらなければ -1。 */
function distanceToGround(p: AtmosphereParams, r: number, mu: number): number {
  if (mu >= 0) return -1;
  const disc = r * r * (mu * mu - 1) + p.planetRadius * p.planetRadius;
  if (disc < 0) return -1;
  return -r * mu - Math.sqrt(disc);
}

/** 高さ alt から天頂角の余弦 mu の向きに、大気の上端まで抜ける透過率。地面に遮られれば 0。 */
export function transmittanceToTop(p: AtmosphereParams, alt: number, mu: number, steps = 48): RGB {
  const r = p.planetRadius + Math.max(0, alt);
  if (distanceToGround(p, r, mu) >= 0) return [0, 0, 0];
  const len = distanceToTop(p, r, mu);
  const od: RGB = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    // 始点の近くを細かく刻む（密度は低い所ほど大きい）
    const s0 = i / steps;
    const s1 = (i + 1) / steps;
    const t0 = len * s0 * s0;
    const t1 = len * s1 * s1;
    const t = (t0 + t1) / 2;
    const rt = Math.sqrt(r * r + t * t + 2 * r * mu * t);
    const e = extinction(p, rt - p.planetRadius);
    const dt = t1 - t0;
    od[0] += e[0] * dt;
    od[1] += e[1] * dt;
    od[2] += e[2] * dt;
  }
  return [Math.exp(-od[0]), Math.exp(-od[1]), Math.exp(-od[2])];
}

/** 透過率の表（高さ × 天頂角）。空の積分を速くするため。 */
export class TransmittanceTable {
  private readonly data: Float32Array;
  static readonly altSize = 64;
  static readonly muSize = 256;
  static readonly altMax = 100_000;
  static readonly muMin = -0.3;

  constructor(private readonly p: AtmosphereParams) {
    const { altSize, muSize } = TransmittanceTable;
    this.data = new Float32Array(altSize * muSize * 3);
    for (let a = 0; a < altSize; a++) {
      const alt = this.altAt(a / (altSize - 1));
      for (let m = 0; m < muSize; m++) {
        const mu = TransmittanceTable.muMin + (1 - TransmittanceTable.muMin) * (m / (muSize - 1));
        const t = transmittanceToTop(p, alt, mu, 40);
        const k = (a * muSize + m) * 3;
        this.data[k] = t[0];
        this.data[k + 1] = t[1];
        this.data[k + 2] = t[2];
      }
    }
  }

  private altAt(x: number): number {
    return TransmittanceTable.altMax * x * x;
  }

  sample(alt: number, mu: number): RGB {
    const { altSize, muSize } = TransmittanceTable;
    const r = this.p.planetRadius + Math.max(0, alt);
    if (distanceToGround(this.p, r, mu) >= 0) return [0, 0, 0];
    const ax = Math.sqrt(Math.min(1, Math.max(0, alt) / TransmittanceTable.altMax)) * (altSize - 1);
    const mx = ((Math.min(1, Math.max(TransmittanceTable.muMin, mu)) - TransmittanceTable.muMin) / (1 - TransmittanceTable.muMin)) * (muSize - 1);
    const a0 = Math.min(altSize - 2, Math.floor(ax));
    const m0 = Math.min(muSize - 2, Math.floor(mx));
    const fa = ax - a0;
    const fm = mx - m0;
    const out: RGB = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const v00 = this.data[(a0 * muSize + m0) * 3 + c];
      const v01 = this.data[(a0 * muSize + m0 + 1) * 3 + c];
      const v10 = this.data[((a0 + 1) * muSize + m0) * 3 + c];
      const v11 = this.data[((a0 + 1) * muSize + m0 + 1) * 3 + c];
      out[c] = (v00 * (1 - fm) + v01 * fm) * (1 - fa) + (v10 * (1 - fm) + v11 * fm) * fa;
    }
    return out;
  }
}

function rayleighPhase(cosTheta: number): number {
  return (3 / (16 * PI)) * (1 + cosTheta * cosTheta);
}

function miePhase(cosTheta: number, g: number): number {
  const g2 = g * g;
  const num = 3 * (1 - g2) * (1 + cosTheta * cosTheta);
  const den = 8 * PI * (2 + g2) * Math.pow(Math.max(1e-6, 1 + g2 - 2 * g * cosTheta), 1.5);
  return num / den;
}

/**
 * 視点から方向 view を見たときの、大気の散乱だけの放射輝度（大気の上端の太陽照度を 1 とした単位）。
 * 地平線より下を向く光線は地面までで打ち切る。夕方の規則（duskBand・duskSkyTint）を足す前の物理の値。
 */
export function scatteredRadiance(p: AtmosphereParams, table: TransmittanceTable, view: Vec3, sun: Vec3, steps = 40): RGB {
  const r0 = p.planetRadius + p.viewerAltitude;
  const mu = view[1];
  const ground = distanceToGround(p, r0, mu);
  const len = ground >= 0 ? ground : distanceToTop(p, r0, mu);
  const cosTheta = view[0] * sun[0] + view[1] * sun[1] + view[2] * sun[2];
  const pr = rayleighPhase(cosTheta);
  const pm = miePhase(cosTheta, p.mieG);
  const iso = 1 / (4 * PI);
  const ms = mieSpectrum(p);
  const od: RGB = [0, 0, 0];
  const L: RGB = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const s0 = i / steps;
    const s1 = (i + 1) / steps;
    const t0 = len * s0 * s0;
    const t1 = len * s1 * s1;
    const t = (t0 + t1) / 2;
    const dt = t1 - t0;
    // 惑星の中心を原点に、視点を (0, r0, 0) に置いた座標
    const px = view[0] * t;
    const py = r0 + view[1] * t;
    const pz = view[2] * t;
    const rt = Math.sqrt(px * px + py * py + pz * pz);
    const alt = rt - p.planetRadius;
    const d = densities(p, alt);
    const e = extinction(p, alt);
    // 視点からこの点までの透過率（区間の中央までの光学的厚み）
    const tv: RGB = [
      Math.exp(-(od[0] + e[0] * dt * 0.5)),
      Math.exp(-(od[1] + e[1] * dt * 0.5)),
      Math.exp(-(od[2] + e[2] * dt * 0.5)),
    ];
    od[0] += e[0] * dt;
    od[1] += e[1] * dt;
    od[2] += e[2] * dt;
    const muSun = (px * sun[0] + py * sun[1] + pz * sun[2]) / rt;
    const ts = table.sample(alt, muSun);
    for (let c = 0; c < 3; c++) {
      const scatR = p.rayleigh[c] * d.r;
      const scatM = p.mieScattering * ms[c] * d.m;
      const single = scatR * pr + scatM * pm;
      const multi = (scatR + scatM) * iso * p.multiScatter;
      L[c] += tv[c] * ts[c] * (single + multi) * dt;
    }
  }
  return L;
}

/** 視点の高さでの、太陽の方向への透過率（直射光の色）。 */
export function sunTransmittance(p: AtmosphereParams, table: TransmittanceTable, sun: Vec3): RGB {
  return table.sample(p.viewerAltitude, sun[1]);
}

// ---- r05-dusk：夕方の規則 ----
// 12.5° の太陽の物理の空は、太陽と反対の側が昼の青のまま（暖かいのは地平の 2〜3° だけで、通りからはビルに隠れる）。
// 低い太陽の夕方らしさを、空の関数の中の2つの項で足す。どちらも太陽の仰角が上がると消える（DuskParams.fadeDeg）。
// ・地平の帯：低い太陽の光が地表すれすれの長い道のりで赤くなり、地平のもやで散らばって、どの方位にも暖かい帯を作る。
//   色は地表での太陽の透過率を bandReddening 乗したもの（太陽が低いほど赤く暗い）。高さは仰角で指数的に減る。
//   太陽の側は物理の前方散乱がもう暖かいので弱く、太陽と反対の側（street・breath・標本が見る空）を強くする
// ・高い空の紫：夕方の高い空は、長い道のりで緑を吸われた光（オゾンのシャピュイ帯）と、地平の暖かい光の多重散乱で紫へ寄る。
//   散乱だけの空に、仰角が高いほど強い色の掛け算（skyTint）を掛ける
// 空の表がこの2つを含むので、霧・環境マップ・水面・雲の環境光も同じ帯と紫を引く（色の出どころは1つのまま）。

export interface DuskParams {
  /** 地平の帯のいちばん下の明るさ（大気の上端の太陽照度を 1 とした単位） */
  bandStrength: number;
  /** 帯の高さ（度）。この仰角で 1/e に減る */
  bandHeightDeg: number;
  /** 帯の強さの方位の比：太陽と反対の側（bandAntiSolar）と太陽の側（bandSunSide）。太陽の側は物理の前方散乱がもう暖かい */
  bandAntiSolar: number;
  bandSunSide: number;
  /** 帯の色：地表での太陽の透過率を何乗するか（光の道のりの倍率。大きいほど赤い） */
  bandReddening: number;
  /** 高い空の散乱光に掛ける色。仰角 skyTintDeg[0] から掛かり始め、skyTintDeg[1] より上で全部掛かる */
  skyTint: RGB;
  skyTintDeg: [number, number];
  /** 太陽の仰角（度）がこの2つの間で、夕方の規則が 1 → 0 へ消える */
  fadeDeg: [number, number];
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 夕方の規則の重み（太陽が低いほど 1、高いと 0）。 */
export function duskWeight(p: AtmosphereParams, sun: Vec3): number {
  if (!p.dusk) return 0;
  const el = (Math.asin(Math.max(-1, Math.min(1, sun[1]))) * 180) / PI;
  return 1 - smooth(p.dusk.fadeDeg[0], p.dusk.fadeDeg[1], el);
}

/** 地平の帯の、太陽の方位でのいちばん下の色（大気の上端の太陽照度を 1 とした単位）。太陽の高さと大気で決まる。 */
export function duskBandColor(p: AtmosphereParams, table: TransmittanceTable, sun: Vec3): RGB {
  const w = duskWeight(p, sun);
  if (!p.dusk || w <= 0) return [0, 0, 0];
  // 地表で受ける太陽の光（地平より下なら 0）を、帯までの長い道のりの分だけ赤くする
  const t = table.sample(0, sun[1]);
  const k = p.dusk.bandReddening;
  const s = p.dusk.bandStrength * w;
  return [s * Math.pow(t[0], k), s * Math.pow(t[1], k), s * Math.pow(t[2], k)];
}

/**
 * 方向 view の地平の帯の重み（色を掛ける前。帯 = duskBandColor × この値）。
 * r06-light：空の表の4つ目の値に入れる。霧が近い所で帯を外す（距離で足す）ときと、補助光から帯を外すときに使う。
 */
export function duskBandWeight(p: AtmosphereParams, view: Vec3, sun: Vec3): number {
  if (!p.dusk) return 0;
  const el = Math.asin(Math.max(0, Math.min(1, view[1])));
  const vertical = Math.exp(-el / ((p.dusk.bandHeightDeg * PI) / 180));
  const hv = horizontal(view);
  const hs = horizontal(sun);
  const toward = (1 + hv[0] * hs[0] + hv[1] * hs[1]) / 2;
  const azimuth = p.dusk.bandAntiSolar + (p.dusk.bandSunSide - p.dusk.bandAntiSolar) * toward * toward;
  return vertical * azimuth;
}

/** 方向 view に足す地平の帯（大気の上端の太陽照度を 1 とした単位）。 */
export function duskBand(p: AtmosphereParams, table: TransmittanceTable, view: Vec3, sun: Vec3): RGB {
  if (!p.dusk) return [0, 0, 0];
  const color = duskBandColor(p, table, sun);
  const k = duskBandWeight(p, view, sun);
  return [color[0] * k, color[1] * k, color[2] * k];
}

/** 方向 view の散乱光に掛ける夕方の色（地平の近くは 1、高い空ほど skyTint）。 */
export function duskSkyTint(p: AtmosphereParams, view: Vec3, sun: Vec3): RGB {
  const w = duskWeight(p, sun);
  if (!p.dusk || w <= 0) return [1, 1, 1];
  const el = (Math.asin(Math.max(0, Math.min(1, view[1]))) * 180) / PI;
  const k = w * smooth(p.dusk.skyTintDeg[0], p.dusk.skyTintDeg[1], el);
  const t = p.dusk.skyTint;
  return [1 + (t[0] - 1) * k, 1 + (t[1] - 1) * k, 1 + (t[2] - 1) * k];
}

/**
 * 視点から方向 view を見たときの空の放射輝度（大気の上端の太陽照度を 1 とした単位）。空の表・霧・環境マップはこの値を引く。
 * 大気の散乱（scatteredRadiance）に、夕方の規則（高い空の紫と地平の帯）を重ねる。
 */
export function skyRadiance(p: AtmosphereParams, table: TransmittanceTable, view: Vec3, sun: Vec3, steps = 40): RGB {
  const L = scatteredRadiance(p, table, view, sun, steps);
  if (!p.dusk) return L;
  const tint = duskSkyTint(p, view, sun);
  const band = duskBand(p, table, view, sun);
  return [L[0] * tint[0] + band[0], L[1] * tint[1] + band[1], L[2] * tint[2] + band[2]];
}

// ---- 空の表：u は太陽との方位差 0..π、v は仰角（地平線の近くを細かく） ----

function horizontal(v: Vec3): [number, number] {
  const len = Math.hypot(v[0], v[2]);
  return len > 1e-6 ? [v[0] / len, v[2] / len] : [1, 0];
}

/** 方向から表の座標（0..1）。GLSL の atmoLutUv と同じ式。 */
export function skyLutUv(dir: Vec3, sun: Vec3): [number, number] {
  const el = Math.asin(Math.max(-1, Math.min(1, dir[1])));
  const hd = horizontal(dir);
  const hs = horizontal(sun);
  const c = Math.max(-1, Math.min(1, hd[0] * hs[0] + hd[1] * hs[1]));
  const u = Math.acos(c) / PI;
  const range = PI / 2 - SKY_LUT.elevationMin;
  const v = Math.sqrt(Math.max(0, Math.min(1, (el - SKY_LUT.elevationMin) / range)));
  return [u, v];
}

/** 表の座標から方向（表を作るとき用）。 */
export function skyLutDirection(u: number, v: number, sun: Vec3): Vec3 {
  const el = SKY_LUT.elevationMin + (PI / 2 - SKY_LUT.elevationMin) * v * v;
  const hs = horizontal(sun);
  const phi = u * PI;
  const hx = hs[0] * Math.cos(phi) - hs[1] * Math.sin(phi);
  const hz = hs[0] * Math.sin(phi) + hs[1] * Math.cos(phi);
  return [Math.cos(el) * hx, Math.sin(el), Math.cos(el) * hz];
}

/**
 * 空の表を作る（RGBA、放射輝度は太陽照度 1 あたり）。
 * r06-light：4つ目の値（A）は地平の帯の重み（duskBandWeight）。帯の色（duskBandColor）を掛けると、その方向の帯の分になる
 */
export function buildSkyLut(p: AtmosphereParams, table: TransmittanceTable, sun: Vec3): Float32Array {
  const { width, height } = SKY_LUT;
  const out = new Float32Array(width * height * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const dir = skyLutDirection(i / (width - 1), j / (height - 1), sun);
      const L = skyRadiance(p, table, dir, sun);
      const k = (j * width + i) * 4;
      out[k] = L[0];
      out[k + 1] = L[1];
      out[k + 2] = L[2];
      out[k + 3] = duskBandWeight(p, dir, sun);
    }
  }
  return out;
}

/** 表を CPU で引く（双線形、4つの値）。GPU の texture() と同じ位置を読む。 */
function sampleSkyLut4(lut: Float32Array, dir: Vec3, sun: Vec3): [number, number, number, number] {
  const { width, height } = SKY_LUT;
  const [u, v] = skyLutUv(dir, sun);
  const x = u * (width - 1);
  const y = v * (height - 1);
  const x0 = Math.min(width - 2, Math.floor(x));
  const y0 = Math.min(height - 2, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const at = (xx: number, yy: number): number => lut[(yy * width + xx) * 4 + c];
    out[c] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  }
  return out;
}

/** 表を CPU で引く（双線形）。GPU の texture() と同じ位置を読む。 */
export function sampleSkyLut(lut: Float32Array, dir: Vec3, sun: Vec3): RGB {
  const s = sampleSkyLut4(lut, dir, sun);
  return [s[0], s[1], s[2]];
}

/** 表を CPU で引き、地平の帯を bandKeep の割合だけ残した色（0 で帯を外す、1 で表のまま）。GLSL の atmoSkyBand と同じ式。 */
export function sampleSkyLutBand(lut: Float32Array, band: RGB, dir: Vec3, sun: Vec3, bandKeep: number): RGB {
  const s = sampleSkyLut4(lut, dir, sun);
  const k = (1 - bandKeep) * s[3];
  return [Math.max(0, s[0] - band[0] * k), Math.max(0, s[1] - band[1] * k), Math.max(0, s[2] - band[2] * k)];
}

/** r06-light：霧（もや）の色の決め方（config/render.ts の FOG の一部）。 */
export interface HazeParams {
  /** 帯の色が入り始める距離と、全部入る距離（m） */
  bandDistance: [number, number];
  /** 近いもやの色を取る仰角の下限（度） */
  nearLiftDeg: number;
  /** 近いもやに残す地平の帯の割合 */
  nearBand: number;
}

/**
 * r06-light：距離 dist（m）の所のもやの色（大気の上端の太陽照度 1 あたり）。GLSL の atmoHazeColor と同じ式。
 * 近いもやは、仰角を nearLiftDeg まで持ち上げた空の色（帯は nearBand の割合だけ）。遠いもやは地平線の空の色（帯ごと）。
 */
export function hazeColor(lut: Float32Array, band: RGB, dir: Vec3, dist: number, sun: Vec3, h: HazeParams): RGB {
  const liftY = Math.sin((h.nearLiftDeg * PI) / 180);
  const ly = Math.max(dir[1], liftY);
  const ll = Math.hypot(dir[0], ly, dir[2]);
  const near = sampleSkyLutBand(lut, band, [dir[0] / ll, ly / ll, dir[2] / ll], sun, h.nearBand);
  const far = sampleSkyLut(lut, [dir[0], Math.max(0, dir[1]), dir[2]], sun);
  const t = smooth(h.bandDistance[0], h.bandDistance[1], dist);
  return [near[0] + (far[0] - near[0]) * t, near[1] + (far[1] - near[1]) * t, near[2] + (far[2] - near[2]) * t];
}

// ---- r06-light：補助光（空からの光の拡散の分）を球面調和（L2、9個の係数）で持つ ----
// 採点 r05 の1位「日陰の壁まで暖色になった（closeup の左の壁 色相150°→39°）。画面が琥珀ひと色」。
// 外して測ると、日陰の色はほぼ全部が補助光（街ごと焼いた環境マップの拡散）から来ていて、暖めていたのは
// 環境マップに入った地平の帯と、日の当たった琥珀の街だった（帯を外すと closeup の壁 40°・28% → 56°・13%）。
// 夕方の暖かい色は、直射の光と地平の帯と遠くのもやにだけ持たせる。日陰に回る補助光は：
// ・空の上（cityHorizonDeg より高い所）は空の表の色から、地平の帯を bandWeight の割合だけ入れて取る（青紫）
// ・それより低い方向と下半分は、街と地面の照り返し（反射率 × 地面が受ける空の光と、日の当たる割合の分の直射 ÷ π）
// 鏡面（ガラスと水の映り込み）は環境マップのまま（暖かい地平の帯と街を映す）。

export interface AmbientParams {
  /** 地平の帯のうち、補助光に入れる割合（0 で入れない） */
  bandWeight: number;
  /** 街に隠れる低い空の仰角（度）。これより低い方向は、空の代わりに街と地面の照り返し */
  cityHorizonDeg: number;
  /** 照り返しの元の、街と地面の平均の反射率（線形の RGB） */
  groundAlbedo: RGB;
  /** 照り返しのうち、日の当たっている面の割合（0..1） */
  sunlitFraction: number;
}

/** 球面調和の基底（three の SphericalHarmonics3 と同じ並び。y が上）。 */
export function shBasis(d: Vec3): number[] {
  const [x, y, z] = d;
  return [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
}

/** 放射輝度の球面調和の係数から、法線 n の面が受ける放射照度（Ramamoorthi と Hanrahan の式。GLSL の atmoAmbient と同じ）。 */
export function shIrradiance(sh: RGB[], n: Vec3): RGB {
  const [x, y, z] = n;
  const w = [0.886227, 2 * 0.511664 * y, 2 * 0.511664 * z, 2 * 0.511664 * x, 2 * 0.429043 * x * y, 2 * 0.429043 * y * z, 0.743125 * z * z - 0.247708, 2 * 0.429043 * x * z, 0.429043 * (x * x - y * y)];
  const out: RGB = [0, 0, 0];
  for (let i = 0; i < 9; i++) for (let c = 0; c < 3; c++) out[c] += sh[i][c] * w[i];
  return [Math.max(0, out[0]), Math.max(0, out[1]), Math.max(0, out[2])];
}

/** 経度・緯度の格子で全方向をなめる（向き・立体角）。 */
function forEachDirection(res: number, f: (d: Vec3, dOmega: number) => void): void {
  const nt = res;
  const np = res * 2;
  const dt = PI / nt;
  const dp = (2 * PI) / np;
  for (let i = 0; i < nt; i++) {
    const t = (i + 0.5) * dt;
    const st = Math.sin(t);
    const dOmega = st * dt * dp;
    for (let j = 0; j < np; j++) {
      const ph = (j + 0.5) * dp;
      f([st * Math.cos(ph), Math.cos(t), st * Math.sin(ph)], dOmega);
    }
  }
}

/** 補助光の放射輝度の方向ごとの値を返す関数（空の上は帯を減らした空、低い所と下は照り返し）。 */
export function ambientRadianceField(p: AtmosphereParams, table: TransmittanceTable, lut: Float32Array, sun: Vec3, a: AmbientParams): (d: Vec3) => RGB {
  const band = duskBandColor(p, table, sun);
  const horizonY = Math.sin((a.cityHorizonDeg * PI) / 180);
  const sky = (d: Vec3): RGB => sampleSkyLutBand(lut, band, d, sun, a.bandWeight);
  // 地面が受ける空の光（街に隠れない空だけ）と、日の当たる割合の分の直射
  const eSky: RGB = [0, 0, 0];
  forEachDirection(32, (d, dOmega) => {
    if (d[1] < horizonY) return;
    const L = sky(d);
    for (let c = 0; c < 3; c++) eSky[c] += L[c] * d[1] * dOmega;
  });
  const tSun = sunTransmittance(p, table, sun);
  const sinSun = Math.max(0, sun[1]);
  const ground: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) ground[c] = (a.groundAlbedo[c] * (eSky[c] + tSun[c] * sinSun * a.sunlitFraction)) / PI;
  return (d: Vec3): RGB => (d[1] >= horizonY ? sky(d) : ground);
}

/** 補助光の放射輝度を球面調和（L2）に射影した9個の係数（大気の上端の太陽照度を 1 とした単位）。 */
export function ambientSH(p: AtmosphereParams, table: TransmittanceTable, lut: Float32Array, sun: Vec3, a: AmbientParams, res = 48): RGB[] {
  const field = ambientRadianceField(p, table, lut, sun, a);
  const sh: RGB[] = Array.from({ length: 9 }, () => [0, 0, 0] as RGB);
  forEachDirection(res, (d, dOmega) => {
    const L = field(d);
    const b = shBasis(d);
    for (let i = 0; i < 9; i++) for (let c = 0; c < 3; c++) sh[i][c] += L[c] * b[i] * dOmega;
  });
  return sh;
}

/** 補助光の放射照度を、球面調和を通さずに直接積分する（テストで球面調和の近似を確かめる用）。 */
export function ambientIrradianceDirect(p: AtmosphereParams, table: TransmittanceTable, lut: Float32Array, sun: Vec3, a: AmbientParams, n: Vec3, res = 64): RGB {
  const field = ambientRadianceField(p, table, lut, sun, a);
  const E: RGB = [0, 0, 0];
  forEachDirection(res, (d, dOmega) => {
    const c = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    if (c <= 0) return;
    const L = field(d);
    for (let k = 0; k < 3; k++) E[k] += L[k] * c * dOmega;
  });
  return E;
}

export const luminance = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
