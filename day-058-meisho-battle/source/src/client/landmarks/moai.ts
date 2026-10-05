// モアイ（アフ・トンガリキ）：海岸の草地に長い石の台（アフ）があり、その上に15体のモアイが海に背を向けて一列に並ぶ。
// 正面（+Z）が内陸＝モアイの顔の向き、奥（-Z）が海。右手前に石切り場の山（ラノ・ララク）の斜面と、そこに埋まった頭。
// 白いうちは「台の上に並ぶ縦長の石」まで（ストーンヘンジやラシュモア山、アブ・シンベルと迷う）。
// 段階3の張り出した眉・長い鼻・あご・長い耳と、1体だけの頭の帽子（プカオ）で決まり、色塗りの灰褐色の石と海、段階4の馬と人でほぼ全員が当たる。
// 像は祭祀にかかわる石像なので、壊れる・倒れる見せ方は作らない（research/rights.md）。胴は地面から立ち上がるように出す。
import { type Kit, type Vec3, type XZ } from './kit'

// 研究メモの色（#6F6559）のままだと、この描画では黒い板に見える。少し明るい灰褐色にする
const TUFF = ['#8C8070', '#918574', '#877B6C', '#958978'] as const
const TUFF_DARK = '#5C5248'
const PUKAO = '#A0523A'
const AHU = '#7D7468'
const AHU_TOP = '#8E8578'
const GRASS = '#7DA35A'
const SEA = '#2D6A8F'
const PATH = '#B59B78'
const ROCK = '#4E4A45'

/** 台（アフ）の中心線と、上面の高さ */
const AHU_Z = -0.3
const AHU_H = 0.2
const AHU_LEN = 8.15

/** 15体の高さ（台の上から頭のてっぺんまで）。大きさは少しずつ不ぞろい */
const HEIGHTS = [1.22, 1.3, 1.38, 1.42, 1.32, 1.5, 1.4, 1.56, 1.44, 1.36, 1.48, 1.28, 1.38, 1.24, 1.18] as const
/** 頭に帽子（プカオ）を載せる像の番号 */
const WITH_PUKAO = 9

/** 海岸線（左の端から右の端へ）。これより奥が海 */
const COAST: readonly XZ[] = [
  [-4.83, -0.85],
  [-4.0, -1.05],
  [-3.1, -0.98],
  [-2.2, -1.2],
  [-1.2, -1.08],
  [-0.2, -1.3],
  [0.8, -1.16],
  [1.8, -1.36],
  [2.8, -1.18],
  [3.7, -1.02],
  [4.66, -1.5],
]

export function build(kit: Kit): void {
  kit.ground(GRASS)

  // ---- 段階1：海・海岸の道・石切り場の山・台（アフ）・15体の胴（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.part(
    () => {
      kit.water({ points: seaOutline(), h: 0.03, color: SEA })
      for (let i = 0; i + 1 < PATH_LINE.length; i++) strip(kit, PATH_LINE[i] as XZ, PATH_LINE[i + 1] as XZ, 0.26, PATH)
    },
    { appear: 'grow' },
  )
  kit.mound({ r: 1.3, rx: 1.3, rz: 1.05, h: 0.62, at: [2.55, 0, 2.55], color: '#86A85F' })
  kit.order(0)
  ahu(kit)
  for (let i = 0; i < HEIGHTS.length; i++) {
    kit.appear('grow')
    torso(kit, i)
  }
  kit.appear('drop')

  // ---- 段階2：形の特徴＝四角い頭が載り、縦長の像の列になる（白） ----
  kit.stage(2)
  for (let i = 0; i < HEIGHTS.length; i++) head(kit, i)

  // ---- 段階3：決め手の細部（白）＝張り出した眉・長い鼻・唇とあご・長い耳・腕と手、1体の帽子（プカオ） ----
  kit.stage(3)
  for (let i = 0; i < HEIGHTS.length; i++) face(kit, i)

  // ---- 段階4：周りの景色（色つき）＝石切り場の斜面に埋まった頭・草をはむ馬・海辺の黒い岩と波・人 ----
  kit.stage(4)
  const hill = (x: number, z: number) => Math.max(0, kit.groundAt(x, z) - 0.06)
  for (const [x, z, h, rot] of [
    [2.05, 2.25, 0.62, -20],
    [2.75, 2.05, 0.7, 5],
    [3.25, 2.55, 0.55, 30],
  ] as const) {
    kit.at({ at: [x, hill(x, z), z], rotY: rot, rot: [-8, 0, 0] }, () => buriedHead(kit, h))
  }
  // 馬（草地で草をはむ）
  for (const [x, z, rot, color, graze] of [
    [-2.6, 1.6, 30, '#7A4E2D', true],
    [-2.2, 1.95, -60, '#2F2A26', false],
    [-3.3, 0.9, 80, '#9A5B33', true],
    [-1.2, 2.7, 150, '#E8E2D6', true],
    [0.4, 2.35, -120, '#7A4E2D', false],
  ] as const) {
    horse(kit, [x, 0, z], rot, color, graze)
  }
  // 入口のそばに1体だけで立つモアイ
  loneMoai(kit, [-2.75, 0, 2.35], 20, 1.05)
  // 草地に散らばる溶岩の石
  kit.part(() => {
    kit.scatter({ count: 16, rMin: 1.2, rMax: 4.5, gap: 0.4, ok: (x, z) => z > 0.4 && Math.abs(z - 1.3) > 0.3 }, (_i, x, z) => {
      kit.sphere({ r: kit.range(0.04, 0.09), squash: 0.6, at: [x, 0, z], seg: 6, color: kit.pick([ROCK, '#5A554E', '#6B645B']) })
    })
  })
  // 台の前で眺める人
  for (const [x, z] of [
    [-1.8, 0.95],
    [-1.6, 1.08],
    [-0.4, 1.12],
    [-0.2, 1.0],
    [0.9, 1.05],
    [1.15, 0.95],
    [2.2, 1.12],
    [-3.0, 1.0],
    [3.3, 1.05],
    [-2.55, 2.0],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: 180 + kit.range(-30, 30) })
  }
  // 海辺の黒い溶岩の岩
  kit.part(() => {
    COAST.forEach(([x, z], i) => {
      // 両端は台座の縁に近いので置かない
      if (i === 0 || i === COAST.length - 1) return
      for (let k = 0; k < 3; k++) {
        const r = kit.range(0.07, 0.16)
        kit.sphere({ r, squash: 0.6, at: [x + kit.range(-0.3, 0.3), 0, z + kit.range(-0.12, 0.08)], seg: 7, color: i % 2 === 0 ? ROCK : '#5A554E' })
      }
    })
  })
  // 海の中の岩と、岸に寄せる白い波
  kit.part(() => {
    // 海の中の低い岩（いくつかの平たい石の集まり）
    for (const [x, z, r] of [
      [-2.7, -2.2, 0.16],
      [1.5, -2.6, 0.2],
      [3.1, -2.0, 0.12],
    ] as const) {
      for (let k = 0; k < 3; k++) {
        kit.sphere({ r: r * kit.range(0.6, 1), squash: 0.4, at: [x + kit.range(-0.15, 0.15), 0, z + kit.range(-0.1, 0.1)], seg: 7, color: kit.pick([ROCK, '#5A554E']) })
      }
    }
    for (let i = 1; i + 2 < COAST.length; i++) {
      const [x0, z0] = COAST[i] as XZ
      const [x1, z1] = COAST[i + 1] as XZ
      const mid: XZ = [(x0 + x1) / 2, (z0 + z1) / 2 - 0.16]
      strip(kit, [x0, z0 - 0.16], mid, 0.05, '#F2F6F8', 0.032)
      strip(kit, mid, [x1, z1 - 0.16], 0.05, '#F2F6F8', 0.032)
    }
  })
}

/** 海岸の道（台の前を横切る） */
const PATH_LINE: readonly XZ[] = [
  [-4.6, 1.25],
  [-3.0, 1.15],
  [-1.0, 1.25],
  [1.0, 1.2],
  [2.6, 1.35],
  [4.4, 1.6],
]

/** 像 i の位置（台の上の中心線） */
function moaiX(i: number): number {
  return -3.75 + (7.5 * i) / (HEIGHTS.length - 1)
}

/** 像 i の石の色 */
function tuff(i: number): string {
  return TUFF[i % TUFF.length] as string
}

/** 海（海岸線より奥）の輪郭。台座の円に収める */
function seaOutline(): XZ[] {
  const r = 4.9
  const pts: XZ[] = [...COAST]
  const last = COAST[COAST.length - 1] as XZ
  const first = COAST[0] as XZ
  const a1 = Math.atan2(last[1], last[0])
  let a0 = Math.atan2(first[1], first[0])
  if (a0 > a1) a0 -= Math.PI * 2
  // 右の端から、奥の円周を回って左の端へ
  const n = 18
  for (let i = 0; i <= n; i++) {
    const a = a1 - ((a1 - a0) * i) / n
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}

/** 長い石の台（アフ）と、前の石を敷いた緩い斜面。横から見た形を左右へ伸ばして作る */
function ahu(kit: Kit): void {
  kit.part(() => {
    kit.at({ at: [AHU_LEN / 2, 0, AHU_Z], rotY: 90 }, () => {
      // この座標の x は世界の -z（奥が +）、押し出しは世界の -x へ
      const profile: XZ[] = [
        [0.32, 0],
        [0.32, AHU_H],
        [-0.3, AHU_H],
        [-0.92, 0],
      ]
      kit.extrude({ points: profile, h: AHU_LEN, rot: [-90, 0, 0], at: [0, 0, 0], color: AHU })
    })
    kit.box({ w: AHU_LEN - 0.04, h: 0.012, d: 0.6, at: [0, AHU_H, AHU_Z - 0.01], color: AHU_TOP })
  })
}

/** 胴（台の上の、像の下の半分弱）。肩の方が少し広い */
function torso(kit: Kit, i: number): void {
  const H = HEIGHTS[i] as number
  kit.at({ at: [moaiX(i), AHU_H, AHU_Z], rotY: kit.range(-3, 3) }, () =>
    kit.part(() => {
      kit.frustum({ w: 0.26 * H, d: 0.19 * H, topW: 0.31 * H, topD: 0.21 * H, h: 0.44 * H, color: tuff(i) })
    }),
  )
}

/** 頭（四角い塊。胴より少し前へ出て、奥行きがある。顔の細部は段階3） */
function head(kit: Kit, i: number): void {
  const H = HEIGHTS[i] as number
  kit.at({ at: [moaiX(i), AHU_H + 0.44 * H, AHU_Z], rotY: 0 }, () =>
    kit.part(() => {
      kit.frustum({ w: 0.28 * H, d: 0.27 * H, topW: 0.255 * H, topD: 0.24 * H, h: 0.56 * H, at: [0, 0, 0.025 * H], color: tuff(i) })
    }),
  )
}

/** 顔の細部と腕。大きく張り出した眉と、その下の目の影・長い鼻・唇・突き出たあご・長い耳・胴にそう腕と腹の上の手 */
function face(kit: Kit, i: number): void {
  const H = HEIGHTS[i] as number
  const c = tuff(i)
  kit.at({ at: [moaiX(i), AHU_H, AHU_Z], rotY: 0 }, () =>
    kit.part(() => faceParts(kit, H, c, i === WITH_PUKAO)),
  )
}

/** 顔の部品（像の足もとを原点に、高さ H の像の顔）。遠くからでも読めるよう、実物より張り出しを大きくする */
function faceParts(kit: Kit, H: number, c: string, pukao: boolean): void {
  // 頭の正面（あごの高さで 0.16H、てっぺんで 0.145H）
  const zf = 0.155 * H
  kit.box({ w: 0.3 * H, h: 0.065 * H, d: 0.1 * H, at: [0, 0.79 * H, zf], color: c })
  for (const s of [-1, 1]) kit.box({ w: 0.085 * H, h: 0.05 * H, d: 0.012, at: [s * 0.075 * H, 0.74 * H, zf + 0.004], color: TUFF_DARK })
  kit.beam({ from: [0, 0.79 * H, zf + 0.02 * H], to: [0, 0.6 * H, zf + 0.09 * H], size: 0.07 * H, width: 0.09 * H, color: c })
  kit.box({ w: 0.12 * H, h: 0.05 * H, d: 0.08 * H, at: [0, 0.575 * H, zf + 0.03 * H], color: c })
  kit.box({ w: 0.15 * H, h: 0.025 * H, d: 0.04 * H, at: [0, 0.535 * H, zf + 0.008 * H], color: TUFF_DARK })
  kit.box({ w: 0.22 * H, h: 0.085 * H, d: 0.1 * H, at: [0, 0.44 * H, zf + 0.0 * H], color: c })
  for (const s of [-1, 1]) kit.box({ w: 0.045 * H, h: 0.28 * H, d: 0.085 * H, at: [s * 0.145 * H, 0.55 * H, 0.02 * H], color: c })
  for (const s of [-1, 1]) {
    kit.beam({ from: [s * 0.15 * H, 0.42 * H, 0], to: [s * 0.135 * H, 0.15 * H, 0.06 * H], size: 0.04 * H, color: c })
    kit.box({ w: 0.11 * H, h: 0.035 * H, d: 0.025 * H, at: [s * 0.065 * H, 0.12 * H, 0.1 * H], color: c })
  }
  if (pukao) {
    kit.cylinder({ r: 0.135 * H, rTop: 0.125 * H, h: 0.13 * H, at: [0, H, 0.015 * H], seg: 12, color: PUKAO })
    kit.cylinder({ r: 0.07 * H, h: 0.03 * H, at: [0, H + 0.13 * H, 0.015 * H], seg: 10, color: '#8E4632' })
  }
}

/** 1体だけで立つモアイ（入口のそば。低い石の台の上）。at は地面の点 */
function loneMoai(kit: Kit, at: Vec3, rotY: number, H: number): void {
  const c = '#8F8373'
  kit.at({ at, rotY }, () =>
    kit.part(() => {
      kit.box({ w: 0.5, h: 0.08, d: 0.4, color: AHU })
      kit.at({ at: [0, 0.08, 0] }, () => {
        kit.frustum({ w: 0.26 * H, d: 0.19 * H, topW: 0.31 * H, topD: 0.21 * H, h: 0.44 * H, color: c })
        kit.frustum({ w: 0.28 * H, d: 0.27 * H, topW: 0.255 * H, topD: 0.24 * H, h: 0.56 * H, at: [0, 0.44 * H, 0.025 * H], color: c })
        faceParts(kit, H, c, false)
      })
    }),
  )
}

/** 石切り場の斜面に、首まで埋まった頭（at は斜面の点。前は +Z） */
function buriedHead(kit: Kit, h: number): void {
  const c = '#6E6458'
  kit.part(() => {
    kit.frustum({ w: 0.3 * h, d: 0.24 * h, topW: 0.27 * h, topD: 0.22 * h, h: 0.55 * h, color: c })
    kit.box({ w: 0.29 * h, h: 0.05 * h, d: 0.07 * h, at: [0, 0.4 * h, 0.12 * h], color: c })
    kit.beam({ from: [0, 0.4 * h, 0.12 * h], to: [0, 0.24 * h, 0.18 * h], size: 0.06 * h, width: 0.075 * h, color: c })
    kit.box({ w: 0.2 * h, h: 0.07 * h, d: 0.07 * h, at: [0, 0.06 * h, 0.12 * h], color: c })
    for (const s of [-1, 1]) kit.box({ w: 0.035 * h, h: 0.24 * h, d: 0.07 * h, at: [s * 0.148 * h, 0.14 * h, 0], color: c })
  })
}

/** 馬（前は +Z）。graze で首を下げて草をはむ */
function horse(kit: Kit, at: Vec3, rotY: number, color: string, graze: boolean): void {
  const mane = '#2A2420'
  kit.part(() =>
    kit.at({ at, rotY }, () => {
      for (const [x, z] of [
        [-0.022, -0.05],
        [0.022, -0.05],
        [-0.022, 0.05],
        [0.022, 0.05],
      ] as const) {
        kit.box({ w: 0.014, h: 0.065, d: 0.014, at: [x, 0, z], color })
      }
      kit.box({ w: 0.055, h: 0.05, d: 0.15, at: [0, 0.058, 0], color })
      const neckTop: Vec3 = graze ? [0, 0.04, 0.13] : [0, 0.15, 0.1]
      kit.beam({ from: [0, 0.09, 0.06], to: neckTop, size: 0.03, color })
      kit.beam({ from: [0, 0.105, 0.055], to: [neckTop[0], neckTop[1] + 0.012, neckTop[2] - 0.012], size: 0.012, width: 0.01, color: mane })
      kit.box({ w: 0.03, h: 0.03, d: 0.065, at: [0, neckTop[1] - 0.015, neckTop[2] + 0.02], rot: graze ? [55, 0, 0] : [0, 0, 0], color })
      kit.beam({ from: [0, 0.095, -0.075], to: [0, 0.03, -0.1], size: 0.012, color: mane })
    }),
  )
}

/** 地面に置く細長い帯（道や波）。from から to まで */
function strip(kit: Kit, from: XZ, to: XZ, width: number, color: string, y = 0): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI
  kit.box({ w: width, h: 0.016, d: len + width * 0.6, at: [(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2], rotY, color })
}
