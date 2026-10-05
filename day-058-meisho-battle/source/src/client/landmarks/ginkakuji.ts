// 二層の観音殿。銀色には塗らず、銀沙灘と向月台を遅い手がかりにする。
import { COLORS, type Kit, type Vec3, type XZ } from './kit'

const X = -0.85
const Z = -0.85
const TIMBER = '#62503D'
const ROOF = '#514439'
const SAND = '#E8E5D7'
const POND: readonly XZ[] = [[-3.7, -0.05], [-2.5, -0.25], [-1.4, 0.05], [-0.4, 0.55], [-0.25, 1.45], [-1.25, 2.2], [-2.7, 2.35], [-3.55, 1.35]]

export function build(kit: Kit): void {
  kit.ground(COLORS.moss)
  kit.stage(1)
  kit.water({ points: POND, color: COLORS.pond })
  kit.mound({ r: 1.7, rx: 2.3, rz: 1.2, h: 0.75, at: [0.7, 0, -3.25], color: COLORS.forest })
  kit.box({ w: 2.1, h: 0.1, d: 1.85, at: [X, 0, Z], color: COLORS.stone })
  kit.box({ w: 1.9, h: 0.7, d: 1.65, at: [X, 0.1, Z], color: TIMBER })
  kit.box({ w: 0.45, h: 0.025, d: 2.15, at: [2.75, 0, 1.4], color: COLORS.gravel })

  kit.stage(2)
  kit.curvedRoof({ w: 1.9, d: 1.65, h: 0.25, style: 'skirt', top: { w: 1.2, d: 1.05 }, at: [X, 0.8, Z], overhang: 0.23, upturn: 0.05, color: ROOF })
  kit.box({ w: 1.2, h: 0.58, d: 1.05, at: [X, 1.0, Z], color: COLORS.plaster })
  kit.curvedRoof({ w: 1.2, d: 1.05, h: 0.5, style: 'hogyo', at: [X, 1.58, Z], overhang: 0.28, upturn: 0.12, color: ROOF })
  kit.part(() => {
    for (const dx of [-0.78, -0.39, 0, 0.39, 0.78]) {
      kit.box({ w: 0.28, h: 0.48, d: 0.03, at: [X + dx, 0.2, Z + 0.83], color: '#2F322C' })
      kit.box({ w: 0.045, h: 0.67, d: 0.045, at: [X + dx, 0.1, Z + 0.87], color: TIMBER })
    }
  })

  kit.stage(3)
  // 庭園の白砂の段と、頂上が平らな円錐台は銀閣の固有の手がかり。
  kit.box({ w: 2.2, h: 0.08, d: 1.8, at: [1.3, 0, 0.7], color: SAND })
  kit.part(() => {
    for (let i = 0; i < 14; i++) kit.box({ w: 2.14, h: 0.018, d: 0.022, at: [1.3, 0.08, -0.1 + i * 0.12], color: '#D4D1C4' })
  })
  kit.cylinder({ r: 0.66, rTop: 0.29, h: 0.54, seg: 24, at: [1.35, 0, 2.35], color: SAND })
  kit.part(() => {
    for (const dx of [-0.3, 0.3]) {
      kit.box({ w: 0.25, h: 0.26, d: 0.025, at: [X + dx, 1.13, Z + 0.54], color: '#2F322C' })
      kit.sphere({ r: 0.125, squash: 0.45, scale: [1, 1, 0.12], seg: 8, at: [X + dx, 1.35, Z + 0.54], color: '#2F322C' })
    }
    for (const dx of [-0.58, 0.58]) kit.box({ w: 0.045, h: 0.58, d: 0.05, at: [X + dx, 1, Z + 0.54], color: TIMBER })
  })
  bird(kit, [X, 2.07, Z])

  kit.stage(4)
  kit.part(() => {
    kit.box({ w: 1.15, h: 0.5, d: 0.95, at: [1.5, 0.07, -1.85], color: TIMBER })
    kit.curvedRoof({ w: 1.15, d: 0.95, h: 0.4, overhang: 0.16, at: [1.5, 0.57, -1.85], color: ROOF })
  })
  kit.tree({ kind: 'pine', h: 0.62, at: [-2.8, 0, 0], rotY: 100 })
  kit.tree({ kind: 'pine', h: 0.55, at: [-2.6, 0, 2.75], rotY: 20 })
  kit.scatter({ count: 19, rMin: 2.4, rMax: 4.35, gap: 0.48, ok: (x, z) => z < -2.55 || (x < -3.3 && z < -0.2) }, (_i, x, z) => {
    kit.tree({ kind: kit.pick(['round', 'pine', 'cone'] as const), h: kit.range(0.55, 0.85), at: [x, Math.max(0, kit.groundAt(x, z) - 0.04), z], color: COLORS.forest })
  })
  for (let i = 0; i < 6; i++) kit.person({ at: [2.7 + kit.range(-0.1, 0.1), 0.025, 0.55 + i * 0.3], rotY: 270 })
  for (const [x, z] of [[-3.65, 1.8], [-3.35, 0], [-0.2, 2.4], [-2.15, 2.6]] as const) kit.sphere({ r: 0.11, squash: 0.65, seg: 8, at: [x, 0, z], color: COLORS.rock })
}

function bird(kit: Kit, at: Vec3): void {
  kit.at({ at }, () => kit.part(() => {
    kit.box({ w: 0.05, h: 0.06, d: 0.16, at: [0, 0.04, 0], color: '#6A6450' })
    kit.beam({ from: [0, 0.07, 0.04], to: [0, 0.18, 0.09], size: 0.035, color: '#6A6450' })
    for (const s of [-1, 1]) kit.beam({ from: [0, 0.09, 0], to: [s * 0.16, 0.18, -0.03], size: 0.025, width: 0.075, color: '#6A6450' })
  }))
}
