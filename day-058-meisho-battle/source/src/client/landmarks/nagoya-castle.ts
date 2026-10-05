// 緑青の屋根を重ねる大天守、つながる小天守、大棟両端の金鯱。
import { COLORS, type Kit } from './kit'

const WALL = '#E8E3CE'
const GREEN = '#6C9D83'
const X = 0.52
const Z = -0.9
const BASE = 0.68
const TIERS = [
  { w: 2.18, d: 1.87, h: 0.48, r: 0.19 },
  { w: 1.82, d: 1.53, h: 0.41, r: 0.17 },
  { w: 1.49, d: 1.27, h: 0.36, r: 0.16 },
  { w: 1.2, d: 1.01, h: 0.32, r: 0.14 },
  { w: 0.95, d: 0.8, h: 0.35, r: 0.44 },
] as const

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.box({ w: 4.1, h: 0.025, d: 4.2, at: [0, 0, -0.3], color: '#BDC18B' })
  kit.frustum({ w: 2.72, d: 2.42, h: BASE, topW: 2.32, topD: 2.02, at: [X, 0, Z], color: '#A6A08C' })
  kit.frustum({ w: 1.55, d: 1.44, h: 0.52, topW: 1.2, topD: 1.08, at: [-1.18, 0, 0.43], color: '#A6A08C' })
  kit.box({ w: TIERS[0].w, d: TIERS[0].d, h: TIERS[0].h, at: [X, BASE, Z], color: WALL })

  kit.stage(2)
  let y = BASE
  TIERS.forEach((tier, i) => {
    if (i > 0) kit.box({ w: tier.w, d: tier.d, h: tier.h, at: [X, y, Z], color: WALL })
    const next = TIERS[i + 1]
    kit.curvedRoof({ w: tier.w, d: tier.d, h: tier.r, at: [X, y + tier.h, Z], style: next ? 'skirt' : 'irimoya', top: next ? { w: next.w, d: next.d } : undefined, overhang: 0.23, upturn: 0.08, thick: 0.04, color: GREEN, gableColor: WALL })
    y += tier.h + tier.r * (i === TIERS.length - 1 ? 1 : 0.6)
  })

  kit.stage(3)
  for (const s of [-1, 1]) fish(kit, X + s * 0.39, y, Z, s)
  kit.part(() => {
    const sx = -1.18
    const sz = 0.43
    kit.box({ w: 1.07, h: 0.45, d: 0.95, at: [sx, 0.52, sz], color: WALL })
    kit.curvedRoof({ w: 1.07, d: 0.95, h: 0.18, style: 'skirt', top: { w: 0.77, d: 0.7 }, at: [sx, 0.97, sz], overhang: 0.18, color: GREEN })
    kit.box({ w: 0.77, h: 0.38, d: 0.7, at: [sx, 1.1, sz], color: WALL })
    kit.curvedRoof({ w: 0.77, d: 0.7, h: 0.4, at: [sx, 1.48, sz], overhang: 0.2, upturn: 0.08, color: GREEN, gableColor: WALL })
    kit.box({ w: 0.78, h: 0.31, d: 0.4, at: [-0.6, BASE, 0.12], color: WALL })
    kit.gableRoof({ w: 0.78, d: 0.4, h: 0.17, at: [-0.6, BASE + 0.31, 0.12], overhang: 0.1, color: GREEN })
  })
  y = BASE
  kit.part(() => {
    TIERS.forEach((tier, i) => {
      for (let j = 0; j < 5 - Math.floor(i / 2); j++) {
        const count = 5 - Math.floor(i / 2)
        const x = X + (j - (count - 1) / 2) * tier.w * 0.18
        kit.box({ w: 0.105, h: 0.16, d: 0.025, at: [x, y + tier.h * 0.38, Z + tier.d / 2 + 0.01], color: '#474C45' })
      }
      if (i < 3) {
        for (const dx of i === 1 ? [-0.38, 0.38] : [0]) kit.gableRoof({ w: 0.6 - i * 0.06, d: 0.28, h: 0.27 - i * 0.035, at: [X + dx, y + tier.h, Z + tier.d / 2 - 0.025], overhang: 0.05, color: GREEN })
      }
      y += tier.h + tier.r * (i === TIERS.length - 1 ? 1 : 0.6)
    })
  })

  kit.stage(4)
  kit.part(() => {
    // 本丸御殿は天守と混ぜず、手前に低い檜皮色の屋根を並べる。
    kit.box({ w: 2.15, h: 0.34, d: 0.98, at: [0.55, 0, 2.05], color: '#DDC497' })
    kit.curvedRoof({ w: 2.15, d: 0.98, h: 0.34, at: [0.55, 0.34, 2.05], overhang: 0.2, color: COLORS.roofBark })
    kit.box({ w: 0.95, h: 0.32, d: 0.72, at: [1.93, 0, 1.8], color: '#DDC497' })
    kit.curvedRoof({ w: 0.95, d: 0.72, h: 0.3, at: [1.93, 0.32, 1.8], overhang: 0.13, color: COLORS.roofBark })
  })
  for (const [x, z] of [[-2.9, -1.7], [-2.9, 1.5], [2.95, -1.4], [2.9, 1.1], [-1.8, -3.3], [1.85, -3.3], [0, -3.7]] as const) kit.tree({ kind: 'pine', h: kit.range(0.52, 0.75), at: [x, 0, z], rotY: kit.range(0, 360) })
  kit.box({ w: 0.6, h: 0.02, d: 2.25, at: [-2.25, 0, 1.9], color: COLORS.gravel })
  for (let i = 0; i < 7; i++) kit.person({ at: [-2.25 + kit.range(-0.12, 0.12), 0.02, 1.03 + i * 0.25], rotY: 180 })
  for (const x of [-1.5, 1.55]) kit.tree({ kind: 'sakura', h: 0.6, at: [x, 0, 3.4] })
}

function fish(kit: Kit, x: number, y: number, z: number, s: number): void {
  kit.part(() => {
    const look = { color: COLORS.gold, finish: 'gold' as const }
    kit.sphere({ r: 0.095, squash: 0.65, scale: [1.3, 1, 0.7], seg: 10, at: [x, y, z], ...look })
    kit.beam({ from: [x, y + 0.1, z], to: [x + s * 0.08, y + 0.28, z], size: 0.09, ...look })
    kit.beam({ from: [x + s * 0.08, y + 0.28, z], to: [x + s * 0.03, y + 0.43, z], size: 0.075, width: 0.16, ...look })
    kit.sphere({ r: 0.06, seg: 8, at: [x - s * 0.075, y + 0.03, z], ...look })
    kit.beam({ from: [x, y + 0.12, z], to: [x - s * 0.09, y + 0.18, z], size: 0.025, width: 0.1, ...look })
  })
}
