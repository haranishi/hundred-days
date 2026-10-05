// ブルックリン橋：二連の尖頭アーチを開けた二主塔と、垂れた主索・扇状の斜めの索。
import { COLORS, type Kit, type Vec3, type XZ } from './kit'

const STONE = '#B9AE98'
const CABLE = '#6B6961'
const DECK = 0.76
const TX = 1.52
const TOP = 2.99

export function build(kit: Kit): void {
  kit.ground('#BCC0A8')
  kit.stage(1)
  kit.water({ points: [[-2.4, -4.05], [2.4, -4.05], [2.4, 4.05], [-2.4, 4.05]], h: 0.035, color: '#5E8C9C' })
  for (const s of [-1, 1]) {
    kit.box({ w: 1.82, h: 0.16, d: 3.5, at: [s * 3.42, 0, 0], color: '#C9C0AC' })
    kit.box({ w: 0.78, h: 0.47, d: 1.4, at: [s * TX, 0, 0], color: '#A79B84' })
    kit.part(() => {
      for (const z of [-0.54, 0, 0.54]) kit.box({ w: 0.58, h: 0.52, d: 0.2, at: [s * TX, 0.47, z], color: STONE })
    })
  }

  kit.stage(2)
  kit.box({ w: 8.42, h: 0.1, d: 1.04, at: [0, DECK - 0.1, 0], color: '#8F8C7E' })
  for (const s of [-1, 1]) kit.at({ at: [s * TX, 0.47, 0], rotY: 90 }, () => {
    for (const x of [-0.28, 0.28]) kit.part(() => {
      plate(kit, archFrame(0.61, 2.36, 0.39, 1.65, 2.11), 0.58, [x, 0, 0], STONE)
    })
    kit.box({ w: 1.24, h: 0.16, d: 0.63, at: [0, 2.36, 0], color: STONE })
  })

  kit.stage(3)
  kit.order(-1)
  for (const z of [-0.44, 0.44]) kit.part(() => {
    // 中央は放物線状の主索。塔橋の青い上部通路や跳ね橋は作らない。
    const n = 24
    for (let i = 0; i < n; i++) {
      const x0 = -TX + i * TX * 2 / n
      const x1 = -TX + (i + 1) * TX * 2 / n
      kit.beam({ from: [x0, cableY(x0), z], to: [x1, cableY(x1), z], size: 0.026, color: CABLE, finish: 'metal' })
    }
    for (let i = 1; i < 16; i++) {
      const x = -TX + i * TX * 2 / 16
      kit.beam({ from: [x, DECK, z], to: [x, cableY(x), z], size: 0.012, color: CABLE })
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12
        const t1 = (i + 1) / 12
        const p = (t: number): Vec3 => [s * (TX + (4.05 - TX) * t), DECK + 0.1 + (TOP - DECK - 0.1) * (1 - t) ** 2, z]
        kit.beam({ from: p(t0), to: p(t1), size: 0.026, color: CABLE })
      }
      for (const target of [0.1, 0.45, 0.8, 1.13]) kit.beam({ from: [s * TX, TOP - 0.06, z], to: [s * target, DECK + 0.035, z], size: 0.013, color: CABLE })
      for (const target of [2.05, 2.55, 3.05, 3.55]) kit.beam({ from: [s * TX, TOP - 0.06, z], to: [s * target, DECK + 0.035, z], size: 0.013, color: CABLE })
    }
  })
  kit.order(0)
  kit.part(() => {
    kit.box({ w: 8.39, h: 0.012, d: 0.75, at: [0, DECK, 0], color: COLORS.road })
    kit.box({ w: 8.39, h: 0.035, d: 0.15, at: [0, DECK + 0.012, 0], color: '#C8B699' })
    for (const z of [-0.54, 0.54]) {
      kit.box({ w: 8.42, h: 0.035, d: 0.018, at: [0, DECK + 0.14, z], color: CABLE })
      for (let j = 0; j < 28; j++) kit.box({ w: 0.018, h: 0.18, d: 0.02, at: [-4.08 + j * 0.302, DECK - 0.04, z], color: CABLE })
    }
    for (const s of [-1, 1]) kit.box({ w: 0.63, h: 0.065, d: 1.28, at: [s * TX, TOP - 0.06, 0], color: '#A89C86' })
  })

  kit.stage(4)
  kit.boat({ kind: 'ship', len: 0.65, at: [0.5, 0.035, 2.6], rotY: 150, color: '#EAE4D8' })
  kit.boat({ kind: 'row', len: 0.38, at: [-0.75, 0.035, -2.1], rotY: 10 })
  for (const [x, z] of [[-3.7, -1.2], [-3.15, -1.15], [3.3, -1.15], [3.92, -1.07]] as const) {
    const h = kit.range(0.65, 1.15)
    kit.part(() => {
      kit.box({ w: 0.43, h, d: 0.48, at: [x, 0.16, z], color: kit.pick(['#967859', '#BBAA8B', '#AA8162']) })
      kit.box({ w: 0.45, h: 0.045, d: 0.5, at: [x, 0.16 + h, z], color: '#797266' })
    })
  }
  for (const x of [-3.6, -3, 3, 3.6]) kit.tree({ kind: 'round', h: 0.4, at: [x, 0.16, 1.1] })
  for (const x of [-2.6, -0.7, 0.65, 2.9]) kit.car({ at: [x, DECK + 0.02, x > 0 ? 0.25 : -0.25], rotY: x > 0 ? 90 : -90, len: 0.2 })
  for (const x of [-2.3, -0.4, 0.4, 2.3]) kit.person({ at: [x, DECK + 0.048, 0], h: 0.08, rotY: 90 })
}

function cableY(x: number): number { return DECK + 0.54 + (TOP - DECK - 0.54) * (x / TX) ** 2 }

function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color }))
}

function archFrame(w: number, h: number, opening: number, spring: number, top: number): XZ[] {
  const r = opening / 2
  // 尖頭アーチの輪郭を角度の細分で独自に作る。二つの弧が一点で接する。
  const curve: XZ[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    curve.push([r * (1 - t), spring + (top - spring) * Math.sin(t * 1.2) / Math.sin(1.2)])
  }
  for (let i = 1; i <= 8; i++) {
    const t = i / 8
    curve.push([-r * t, spring + (top - spring) * Math.sin((1 - t) * 1.2) / Math.sin(1.2)])
  }
  return [[-w / 2, 0], [-w / 2, h], [w / 2, h], [w / 2, 0], [r, 0], ...curve, [-r, 0]]
}
