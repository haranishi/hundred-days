// 東京タワー：格子の塔（赤と白の帯）、展望台2つ、足もとのビル、芝公園と増上寺、まわりのビル街。
// 白いうちは「鉄塔」までしかわからず（エッフェル塔と迷う）、展望台と帯の色で決まる。
import { COLORS, type Kit } from './kit'

const ORANGE = COLORS.towerOrange
const WHITE = '#F3F1EB'
const GLASS = '#3F5568'

/** 高さ y での塔の半幅。足もとで大きく開き、上ほど細い */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, 1.02],
  [0.5, 0.79],
  [1.0, 0.61],
  [1.5, 0.48],
  [2.0, 0.39],
  [2.5, 0.32],
  [3.0, 0.26],
  [3.5, 0.2],
  [4.0, 0.15],
  [4.45, 0.11],
]

function half(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [y1, w1] = PROFILE[i] as readonly [number, number]
    const [y0, w0] = PROFILE[i - 1] as readonly [number, number]
    if (y <= y1) return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0)
  }
  return 0.11
}

const BODY_TOP = 4.45
const BANDS = 9

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)

  // ---- 段階1：足もとと地面（白） ----
  kit.stage(1)
  kit.box({ w: 3.3, h: 0.02, d: 2.9, color: COLORS.pavement })
  kit.box({ w: 8.0, h: 0.025, d: 0.42, at: [0, 0, 2.55], color: COLORS.road })
  // 増上寺の前で行き止まる参道のような道
  kit.box({ w: 0.42, h: 0.025, d: 4.4, at: [-2.75, 0, 1.6], color: COLORS.road })
  kit.mound({ r: 1.3, h: 0.22, rx: 1.3, rz: 0.85, at: [-2.85, 0, -2.0], color: COLORS.grass })
  kit.mound({ r: 0.8, h: 0.16, at: [-1.4, 0, -3.5], color: COLORS.grass })
  // 足もとのビル（フットタウン）
  kit.box({ w: 1.5, h: 0.36, d: 1.2, color: '#E9E5DC' })
  // 塔の下の3つの帯（いちばん下は4本の脚だけ）
  const bandH = BODY_TOP / BANDS
  for (let k = 0; k < 3; k++) band(kit, k, bandH)

  // ---- 段階2：格子の塔の形（白） ----
  kit.stage(2)
  for (let k = 3; k < BANDS; k++) band(kit, k, bandH)

  // ---- 段階3：決め手の細部（白）＝展望台2つとアンテナ ----
  kit.stage(3)
  deck(kit, 2.42, 0.52, [0.07, 0.13, 0.03, 0.11, 0.05])
  deck(kit, 4.18, 0.25, [0.04, 0.08, 0.04])
  kit.lattice({ w0: 0.2, w1: 0.12, h: 0.42, at: [0, BODY_TOP, 0], bays: 2, post: 0.025, member: 0.012, color: WHITE })
  const mast: [number, number, string][] = [
    [4.87, 5.12, ORANGE],
    [5.12, 5.37, WHITE],
    [5.37, 5.6, ORANGE],
    [5.6, 5.82, WHITE],
  ]
  kit.part(() => {
    for (const [y0, y1, color] of mast) {
      const r0 = 0.045 - (y0 - 4.87) * 0.025
      const r1 = 0.045 - (y1 - 4.87) * 0.025
      kit.cylinder({ r: r0, rTop: r1, h: y1 - y0, at: [0, y0, 0], seg: 8, color, finish: 'satin' })
    }
  })
  // ビルの屋上の設備
  kit.box({ w: 0.9, h: 0.08, d: 0.5, at: [0.15, 0.36, 0.15], color: '#D3CFC6' })

  // ---- 段階4：周りの景色（色つき） ----
  kit.stage(4)
  zojoji(kit)
  cityBlocks(kit)
  // 芝公園の木
  kit.scatter(
    { count: 16, rMin: 2.0, rMax: 4.5, gap: 0.42, ok: (x, z) => x < -1.2 && z < 1.9 && !(x > -3.3 && x < -2.2) },
    (i, x, z) => kit.tree({ kind: i % 4 === 0 ? 'cone' : 'round', h: kit.range(0.42, 0.62), at: [x, 0, z] }),
  )
  kit.scatter({ count: 6, rMin: 2.0, rMax: 4.4, gap: 0.5, ok: (x, z) => x > 1.0 && z > -1.0 && z < 2.1 }, (_i, x, z) =>
    kit.tree({ kind: 'round', h: kit.range(0.4, 0.5), at: [x, 0, z] }),
  )
  // 道路の車
  for (const [x, dir] of [
    [-3.3, 1],
    [-1.2, -1],
    [0.9, 1],
    [2.8, -1],
  ] as const) {
    kit.car({ at: [x, 0.025, 2.55 + dir * 0.1], rotY: dir * 90 })
  }
  for (const [z, dir] of [
    [0.2, 1],
    [1.5, -1],
    [3.5, 1],
  ] as const) {
    kit.car({ at: [-2.75 - dir * 0.1, 0.025, z], rotY: dir > 0 ? 0 : 180 })
  }
  // 足もとの広場の人
  for (const [x, z] of [
    [-1.2, 1.05],
    [-0.9, 1.25],
    [0.4, 1.15],
    [1.1, 0.95],
    [1.3, -0.2],
    [-1.35, -0.4],
    [0.2, -1.1],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
}

/** 塔の帯 k（下から0）。偶数がオレンジ、奇数が白。いちばん下は4本の脚と梁だけ */
function band(kit: Kit, k: number, bandH: number): void {
  const y0 = k * bandH
  const y1 = (k + 1) * bandH
  const color = k % 2 === 0 ? ORANGE : WHITE
  kit.lattice({
    w0: half(y0) * 2,
    w1: half(y1) * 2,
    h: y1 - y0,
    at: [0, y0, 0],
    bays: k < 2 ? 1 : 2,
    post: k === 0 ? 0.2 : Math.max(0.04, 0.11 - k * 0.009),
    member: Math.max(0.018, 0.04 - k * 0.0025),
    faces: k !== 0,
    color,
    finish: 'satin',
  })
}

/** 展望台。八角形の階を、白い枠と暗いガラスの帯で重ねる */
function deck(kit: Kit, y: number, r: number, layers: readonly number[]): void {
  kit.part(() => {
    let h = y
    layers.forEach((t, i) => {
      const glass = i % 2 === 1
      kit.cylinder({ r: glass ? r * 0.96 : r, h: t, at: [0, h, 0], seg: 8, rotY: 22.5, color: glass ? GLASS : WHITE, finish: glass ? 'gloss' : 'satin' })
      h += t
    })
  })
}

/** 増上寺の大殿（芝公園の中） */
function zojoji(kit: Kit): void {
  kit.at({ at: [-2.75, 0, -1.25], rotY: 0 }, () => {
    kit.part(() => {
      kit.box({ w: 1.15, h: 0.08, d: 0.85, color: COLORS.stone })
      kit.box({ w: 0.95, h: 0.32, d: 0.66, at: [0, 0.08, 0], color: '#EFE8D8' })
      for (const x of [-0.42, -0.21, 0, 0.21, 0.42]) {
        kit.box({ w: 0.04, h: 0.32, d: 0.04, at: [x, 0.08, 0.33], color: COLORS.vermilion })
      }
      kit.curvedRoof({ w: 0.95, d: 0.66, h: 0.42, at: [0, 0.4, 0], style: 'irimoya', overhang: 0.16, upturn: 0.06, color: '#565C63' })
    })
  })
}

/** まわりのビル街（色はおだやかな白・灰・ガラス） */
function cityBlocks(kit: Kit): void {
  const blocks: [number, number, number, number, number, string][] = [
    [3.3, -1.2, 0.7, 1.15, 0.6, '#DCE0E5'],
    [2.4, -2.7, 0.8, 0.75, 0.7, '#9FB6C8'],
    [3.7, 0.4, 0.55, 0.55, 0.8, '#E8DFD0'],
    [0.9, -3.7, 1.0, 0.6, 0.55, '#D7D2C8'],
    [-0.5, -3.9, 0.6, 0.95, 0.5, '#B9C6D2'],
    [1.7, 3.55, 0.7, 0.42, 0.55, '#E6E0D4'],
    [3.1, 3.0, 0.5, 0.7, 0.5, '#C8CED6'],
    [-1.5, 3.75, 0.8, 0.36, 0.45, '#EDE6D9'],
    [4.0, -0.6, 0.45, 0.85, 0.45, '#AFC0CF'],
  ]
  for (const [x, z, w, h, d, color] of blocks) {
    kit.part(() => {
      kit.box({ w, h, d, at: [x, 0, z], color, finish: 'satin' })
      // 窓の帯（壁よりわずかに外へ出した暗い帯）
      const floors = Math.max(1, Math.floor(h / 0.18))
      for (let f = 0; f < floors; f++) {
        kit.box({ w: w + 0.012, h: 0.05, d: d + 0.012, at: [x, 0.08 + f * 0.18, z], color: '#56677A', finish: 'gloss' })
      }
      kit.box({ w: w * 0.5, h: 0.06, d: d * 0.4, at: [x, h, z], color: '#C5C1B8' })
    })
  }
}
