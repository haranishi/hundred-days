// 時間帯の色。空・地平・日差し・環境光・霧・机の色を、1つの設定から全部取る（docs/04「色の出どころを1つにする」）。
// どれかだけ直して浮くのを防ぐため、描画のほかの場所では色を直接書かず、ここで作った Palette を読む。
import { Color, DataTexture, EquirectangularReflectionMapping, FloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat, Vector3 } from 'three'

export interface TimeOfDay {
  name: string
  /** 太陽の高さ（度） */
  sunElevation: number
  /** 太陽の向き（度）。正面（+Z）から見て、左がマイナス */
  sunAzimuth: number
  /** 日差しの色と強さ */
  sun: string
  sunIntensity: number
  /** 天頂の空の色と、地平の霞の色 */
  sky: string
  haze: string
  /** 展示台を置く机の色 */
  desk: string
  /** 空からの環境光の強さ */
  skyLight: number
}

/** 明るい昼。暖かい日差しが左前の上から当たり、影は右奥へ落ちる */
export const BRIGHT_DAY: TimeOfDay = {
  name: '明るい昼',
  // 正面寄りから当てると、斜面が地面と同じ明るさになって白い模型の形が消える（ピラミッドで実測）。
  // 左から少し低めに当てて、面ごとの明暗と影の長さで形を読ませる
  sunElevation: 44,
  sunAzimuth: -58,
  sun: '#FFEED5',
  sunIntensity: 3.1,
  sky: '#86B8E4',
  haze: '#F1F0E8',
  // 講評r1：砂色の台座（ピラミッド）が、同じ色合いの机と背景に溶けた → 机を灰色寄りに（#E6D3B4→#D9D0C3）。
  // 背景の下側と霧も机から作るので一緒に変わる。砂の黄みや白い粘土と色合いで分かれ、台座が浮いて見える
  desk: '#D9D0C3',
  skyLight: 0.6,
}

/** 時間帯の設定から導いた、描画で使う色の一式（値は線形） */
export interface Palette {
  backgroundTop: Color
  backgroundBottom: Color
  fog: Color
  sunColor: Color
  sunIntensity: number
  /** 台座の中心から太陽へ向かう向き */
  sunDirection: Vector3
  hemiSky: Color
  hemiGround: Color
  hemiIntensity: number
  envZenith: Color
  envHorizon: Color
  envGround: Color
  envIntensity: number
  desk: Color
  /** 机に焼き込む影の色の倍率（日なたに対する日陰の明るさ。空の光だけが当たる） */
  deskShadow: Color
  /** 金属の映り込みの倍率と、映り込みの下限の明るさ（金属だけに効く。paintMaterial.ts） */
  metalReflect: number
  metalFloor: Color
}

const DEG = Math.PI / 180
/** 金属の映り込みの強め方。値は撮影画像を見て決めた（金閣寺の金の壁） */
const METAL_REFLECT = 2.0
const METAL_FLOOR = 1.8

export function derivePalette(t: TimeOfDay): Palette {
  const sky = new Color(t.sky)
  const haze = new Color(t.haze)
  const desk = new Color(t.desk)
  const el = t.sunElevation * DEG
  const az = t.sunAzimuth * DEG
  // 空の光は、天頂の青を霞で半分薄めて使う（青そのままだと上向きの面と影が冷たく見えるため）
  const skyLight = sky.clone().lerp(haze, 0.5)
  // 机の日陰の明るさ：上向きの面が受ける空の光 ÷（空の光＋日差し）。三つの色ごとに出すので、影は少し青みを帯びる
  const sunColor = new Color(t.sun)
  const ambient = skyLight.clone().lerp(haze, 0.5).multiplyScalar(t.skyLight)
  const direct = sunColor.clone().multiplyScalar((t.sunIntensity * Math.sin(el)) / Math.PI)
  const deskShadow = new Color(ambient.r / (ambient.r + direct.r), ambient.g / (ambient.g + direct.g), ambient.b / (ambient.b + direct.b))
  return {
    backgroundTop: sky.clone(),
    backgroundBottom: haze.clone().lerp(desk, 0.45),
    fog: haze.clone().lerp(desk, 0.5),
    sunColor: new Color(t.sun),
    sunIntensity: t.sunIntensity,
    sunDirection: new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize(),
    hemiSky: skyLight.clone(),
    hemiGround: desk.clone().multiplyScalar(0.6),
    hemiIntensity: t.skyLight * 1.4,
    envZenith: skyLight.clone(),
    envHorizon: haze.clone(),
    envGround: desk.clone().multiplyScalar(0.6),
    envIntensity: t.skyLight,
    desk,
    deskShadow,
    // 講評r1：金がくすんだ黄土色に見えた。カメラが見下ろすので、金の壁は暗い机（環境の下半分）を映していた
    // → 金属だけ映り込みを強め（1倍→METAL_REFLECT 倍）、下限を霞の明るさにする（明るい周りを映す）
    metalReflect: METAL_REFLECT,
    metalFloor: haze.clone().lerp(sunColor, 0.35).multiplyScalar(t.skyLight * METAL_FLOOR),
  }
}

/** 環境光と映り込みのための空の画像（正距円筒）。パレットの色だけから作る */
export function createSkyTexture(p: Palette): DataTexture {
  const W = 128
  const H = 64
  const data = new Float32Array(W * H * 4)
  const dir = new Vector3()
  const c = new Color()
  for (let j = 0; j < H; j++) {
    const e = ((j + 0.5) / H - 0.5) * Math.PI
    for (let i = 0; i < W; i++) {
      const phi = ((i + 0.5) / W - 0.5) * Math.PI * 2
      dir.set(Math.cos(phi) * Math.cos(e), Math.sin(e), Math.sin(phi) * Math.cos(e))
      if (dir.y >= 0) c.copy(p.envHorizon).lerp(p.envZenith, smooth(0, 0.65, dir.y))
      else c.copy(p.envHorizon).lerp(p.envGround, smooth(0, -0.35, dir.y))
      const s = Math.max(0, dir.dot(p.sunDirection))
      const glow = s ** 400 * 14 + s ** 10 * 0.18
      const k = (j * W + i) * 4
      data[k] = c.r + p.sunColor.r * glow
      data[k + 1] = c.g + p.sunColor.g * glow
      data[k + 2] = c.b + p.sunColor.b * glow
      data[k + 3] = 1
    }
  }
  const tex = new DataTexture(data, W, H, RGBAFormat, FloatType)
  tex.mapping = EquirectangularReflectionMapping
  tex.colorSpace = LinearSRGBColorSpace
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
