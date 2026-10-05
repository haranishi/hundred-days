// 黒漆の下見板と白漆喰、五重の大天守・乾小天守・月見櫓。堀と朱の橋。
import { COLORS, type Kit, type XZ } from './kit'

const BLACK = '#252B31'
const WHITE = '#F0EFDD'
const ROOF = '#505964'
const X = 0.45
const Z = -0.75
const BASE = 0.45
const TIERS = [
  { w: 1.8, d: 1.55, h: 0.47, r: 0.17 },
  { w: 1.54, d: 1.34, h: 0.42, r: 0.16 },
  { w: 1.25, d: 1.09, h: 0.34, r: 0.14 },
  { w: 1.01, d: 0.87, h: 0.31, r: 0.13 },
  { w: 0.78, d: 0.69, h: 0.36, r: 0.4 },
] as const
const POND: readonly XZ[] = [[-3.5, -2.7], [2.7, -2.7], [3.85, -0.4], [3.3, 2.15], [1.0, 3.5], [-1.5, 3.5], [-3.4, 2.0], [-3.85, -0.15]]

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.water({ points: POND, color: '#448F91' })
  kit.extrude({ points: [[-1.85, -2.2], [2.2, -2.2], [2.2, 0.55], [1.1, 1.1], [-1.85, 0.95]], h: 0.28, color: '#9B9683' })
  kit.box({ w: 3.85, h: 0.03, d: 2.7, at: [0.17, 0.28, -0.79], color: COLORS.gravel })
  kit.frustum({ w: 2.02, d: 1.76, topW: 1.85, topD: 1.59, h: BASE - 0.31, at: [X, 0.31, Z], color: '#979383' })
  wall(kit, X, Z, BASE, TIERS[0].w, TIERS[0].d, TIERS[0].h)

  kit.stage(2)
  let y = BASE
  TIERS.forEach((tier, i) => {
    if (i > 0) wall(kit, X, Z, y, tier.w, tier.d, tier.h)
    const next = TIERS[i + 1]
    kit.curvedRoof({ w: tier.w, d: tier.d, h: tier.r, at: [X, y + tier.h, Z], style: next ? 'skirt' : 'irimoya', top: next ? { w: next.w, d: next.d } : undefined, overhang: 0.16, upturn: 0.06, thick: 0.035, color: ROOF, gableColor: WHITE })
    y += tier.h + tier.r * (i === TIERS.length - 1 ? 1 : 0.6)
  })

  kit.stage(3)
  smallKeep(kit, -1.2, -1.05)
  kit.part(() => {
    kit.box({ w: 0.7, h: 0.5, d: 0.45, at: [-0.62, BASE, -0.9], color: BLACK })
    kit.gableRoof({ w: 0.7, d: 0.45, h: 0.19, at: [-0.62, BASE + 0.5, -0.9], color: ROOF })
  })
  kit.part(() => {
    // 月見櫓の朱塗りの回縁は、黒い城だけでは迷う候補を絞る手がかり。
    kit.box({ w: 0.94, h: 0.08, d: 0.88, at: [1.55, BASE, 0.18], color: BLACK })
    kit.box({ w: 0.68, h: 0.5, d: 0.67, at: [1.55, BASE + 0.08, 0.08], color: WHITE })
    kit.curvedRoof({ w: 0.68, d: 0.67, h: 0.34, at: [1.55, BASE + 0.58, 0.08], overhang: 0.16, color: ROOF })
    for (let i = 0; i < 6; i++) kit.box({ w: 0.025, h: 0.17, d: 0.025, at: [1.08 + i * 0.188, BASE + 0.08, 0.64], color: COLORS.vermilion })
    kit.box({ w: 1.03, h: 0.025, d: 0.035, at: [1.55, BASE + 0.25, 0.64], color: COLORS.vermilion })
  })
  y = BASE
  kit.part(() => {
    TIERS.forEach((tier, i) => {
      for (const dx of [-0.26, 0.26]) {
        kit.box({ w: 0.13, h: tier.h * 0.32, d: 0.025, at: [X + dx, y + tier.h * 0.59, Z + tier.d / 2 + 0.015], color: BLACK })
      }
      if (i < 3) kit.gableRoof({ w: 0.53 - i * 0.05, d: 0.24, h: 0.23 - i * 0.025, at: [X, y + tier.h, Z + tier.d / 2 - 0.04], overhang: 0.04, color: ROOF })
      y += tier.h + tier.r * (i === TIERS.length - 1 ? 1 : 0.6)
    })
  })
  redBridge(kit)

  kit.stage(4)
  for (const [x, z] of [[-3.1, -2.6], [2.75, -2.75], [3.95, 0.65], [-3.9, 0.95], [-2.6, 2.85], [2.75, 2.8], [0.1, -3.75]] as const) kit.tree({ kind: 'sakura', h: kit.range(0.46, 0.62), at: [x, 0, z], rotY: kit.range(0, 360) })
  for (const x of [-1.35, -0.85, -0.35, 0.2]) kit.person({ at: [x, 0.31, 0.4], rotY: 180 })
  for (let i = 0; i < 6; i++) kit.person({ at: [-1.2 + i * 0.45, 0, 3.95], rotY: 180 })
  kit.tree({ kind: 'pine', h: 0.52, at: [1.85, 0.31, -1.8], rotY: 60 })
}

function wall(kit: Kit, x: number, z: number, y: number, w: number, d: number, h: number): void {
  kit.part(() => {
    kit.box({ w, h: h * 0.65, d, at: [x, y, z], color: BLACK })
    kit.box({ w, h: h * 0.35, d, at: [x, y + h * 0.65, z], color: WHITE })
  })
}

function smallKeep(kit: Kit, x: number, z: number): void {
  kit.part(() => {
    let y = BASE
    for (let i = 0; i < 3; i++) {
      const w = 0.83 - i * 0.17
      const d = 0.74 - i * 0.14
      wall(kit, x, z, y, w, d, 0.31)
      kit.curvedRoof({ w, d, h: i === 2 ? 0.3 : 0.13, at: [x, y + 0.31, z], style: i === 2 ? 'irimoya' : 'skirt', top: { w: w - 0.17, d: d - 0.14 }, overhang: 0.12, color: ROOF, gableColor: WHITE })
      y += 0.39
    }
  })
}

function redBridge(kit: Kit): void {
  kit.part(() => {
    for (let i = 0; i < 10; i++) {
      const x = -3.43 + i * 0.168
      const y = 0.2 + 0.17 * Math.sin(Math.PI * i / 9)
      kit.box({ w: 0.17, h: 0.04, d: 0.43, at: [x, y, 0.67], color: '#9C5A39' })
      for (const z of [0.43, 0.91]) {
        kit.box({ w: 0.025, h: 0.15, d: 0.025, at: [x, y + 0.04, z], color: COLORS.vermilion })
        if (i < 9) kit.beam({ from: [x, y + 0.19, z], to: [x + 0.168, 0.39 + 0.17 * Math.sin(Math.PI * (i + 1) / 9), z], size: 0.03, color: COLORS.vermilion })
      }
    }
  })
}
