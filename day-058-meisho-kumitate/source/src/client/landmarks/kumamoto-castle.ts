// 広い三重の大天守と横の小天守。黒い下見板、反り上がる高石垣。
import { COLORS, type Kit } from './kit'

const BLACK = '#2C3034'
const WHITE = '#EDE9DA'
const ROOF = '#5B6066'
const BASE = 0.94
const X = 0.58
const Z = -0.7
const TIERS = [{ w: 2.1, d: 1.85, h: 0.67, r: 0.28 }, { w: 1.69, d: 1.43, h: 0.65, r: 0.28 }, { w: 1.14, d: 0.95, h: 0.53, r: 0.48 }] as const

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  for (const [w, d, tw, td, h, y] of [[3.75, 3.2, 3.25, 2.82, 0.3, 0], [3.25, 2.82, 3.05, 2.67, 0.3, 0.3], [3.05, 2.67, 2.97, 2.6, 0.32, 0.6]] as const) kit.frustum({ w, d, topW: tw, topD: td, h, at: [0.05, y, -0.65], color: '#938A78' })
  kit.box({ w: 2.97, h: 0.02, d: 2.6, at: [0.05, 0.92, -0.65], color: COLORS.gravel })
  kit.box({ w: 0.6, h: 0.025, d: 2.35, at: [-2.18, 0, 1.5], color: COLORS.gravel })
  wall(kit, X, Z, BASE, TIERS[0].w, TIERS[0].d, TIERS[0].h)

  kit.stage(2)
  let y = BASE
  TIERS.forEach((tier, i) => {
    if (i > 0) wall(kit, X, Z, y, tier.w, tier.d, tier.h)
    const next = TIERS[i + 1]
    kit.curvedRoof({ w: tier.w, d: tier.d, h: tier.r, at: [X, y + tier.h, Z], style: next ? 'skirt' : 'irimoya', top: next ? { w: next.w, d: next.d } : undefined, overhang: 0.24, upturn: 0.085, color: ROOF, gableColor: WHITE })
    y += tier.h + tier.r * 0.66
  })

  kit.stage(3)
  kit.part(() => {
    let sy = BASE
    for (let i = 0; i < 2; i++) {
      const w = 1.05 - i * 0.22
      const d = 1.25 - i * 0.2
      wall(kit, -1.16, -0.75, sy, w, d, i === 0 ? 0.58 : 0.48)
      kit.curvedRoof({ w, d, h: i === 0 ? 0.2 : 0.42, at: [-1.16, sy + (i === 0 ? 0.58 : 0.48), -0.75], style: i === 0 ? 'skirt' : 'irimoya', top: { w: 0.83, d: 1.05 }, overhang: 0.2, upturn: 0.08, color: ROOF, gableColor: WHITE })
      sy += 0.72
    }
    kit.box({ w: 0.5, h: 0.36, d: 0.62, at: [-0.53, BASE, -0.75], color: BLACK })
    kit.gableRoof({ w: 0.5, d: 0.62, h: 0.18, at: [-0.53, BASE + 0.36, -0.75], color: ROOF })
  })
  y = BASE
  kit.part(() => {
    TIERS.forEach((tier, i) => {
      for (const dx of [-0.38, 0.38]) {
        kit.gableRoof({ w: 0.62 - i * 0.09, d: 0.24, h: 0.28 - i * 0.025, at: [X + (i === 2 ? dx * 0.6 : dx), y + tier.h, Z + tier.d / 2 - 0.025], overhang: 0.04, color: ROOF })
      }
      for (let j = 0; j < 5 - i; j++) kit.box({ w: 0.12, h: 0.22, d: 0.025, at: [X - tier.w * 0.33 + j * tier.w * 0.165, y + tier.h * 0.45, Z + tier.d / 2 + 0.018], color: BLACK })
      y += tier.h + tier.r * 0.66
    })
    for (const dx of [-0.45, 0.45]) {
      kit.beam({ from: [X + dx, y + 0.1, Z], to: [X + dx * 1.12, y + 0.38, Z], size: 0.065, color: ROOF })
    }
  })
  // 石垣の目地は細い実際の出っ張りで、曲面の高さを読ませる。
  kit.part(() => {
    for (let i = 0; i < 4; i++) {
      const w = 3.65 - i * 0.22
      kit.box({ w, h: 0.018, d: 0.035, at: [0.05, 0.12 + i * 0.22, 0.9 - i * 0.08], color: '#7D776B' })
    }
  })

  kit.stage(4)
  kit.part(() => {
    kit.box({ w: 2.15, h: 0.42, d: 1.1, at: [0.48, 0, 1.93], color: '#C4A77D' })
    kit.curvedRoof({ w: 2.15, d: 1.1, h: 0.35, at: [0.48, 0.42, 1.93], style: 'irimoya', overhang: 0.2, color: ROOF })
    kit.box({ w: 0.8, h: 0.4, d: 0.55, at: [1.77, 0, 1.65], color: '#C4A77D' })
    kit.gableRoof({ w: 0.8, d: 0.55, h: 0.23, at: [1.77, 0.4, 1.65], overhang: 0.11, color: ROOF })
  })
  for (const [x, z] of [[-2.8, -1.4], [-2.75, -2.4], [2.75, -1.85], [2.6, -2.8], [-1.15, -3.4], [1.3, -3.4], [-2.7, 2.5], [2.7, 2.5]] as const) kit.tree({ kind: 'pine', h: kit.range(0.52, 0.78), at: [x, 0, z], rotY: kit.range(0, 360) })
  kit.tree({ kind: 'round', h: 0.95, color: '#C1B445', at: [-2.25, 0, 0.08] })
  for (let i = 0; i < 6; i++) kit.person({ at: [-2.2 + kit.range(-0.12, 0.12), 0.025, 0.55 + i * 0.34], rotY: 180 })
}

function wall(kit: Kit, x: number, z: number, y: number, w: number, d: number, h: number): void {
  kit.part(() => {
    kit.box({ w, d, h: h * 0.68, at: [x, y, z], color: BLACK })
    kit.box({ w, d, h: h * 0.32, at: [x, y + h * 0.68, z], color: WHITE })
  })
}
