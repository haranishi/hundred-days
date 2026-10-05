// 大内宿：広い一本の街道に向かい、厚い茅葺きの家が二列に並ぶ。
import { COLORS, type Kit } from './kit'

const ROWS = [-2.5, -0.84, 0.84, 2.5] as const
const THATCH = ['#8C7759', '#9C8666', '#7C684B'] as const
const WOOD = '#6C4F36'

export function build(kit: Kit): void {
  kit.ground('#8F9D64')
  kit.stage(1)
  kit.box({ w: 1.4, h: 0.024, d: 7.9, color: '#CAB899' })
  kit.mound({ r: 2.5, rx: 2.5, rz: 0.78, h: 0.8, at: [0, 0, -3.94], color: '#486E45' })
  for (const s of [-1, 1]) for (const z of ROWS) kit.box({ w: 0.95, h: 0.35, d: 1.19, at: [s * 1.52, 0, z], color: '#C6B392' })

  kit.stage(2)
  for (const s of [-1, 1]) for (const z of ROWS) kit.hipRoof({ w: 1.19, d: 0.95, h: 0.49, ridge: 0.23, overhang: 0.02, rotY: 90, at: [s * 1.52, 0.35, z], color: WOOD })

  kit.stage(3)
  let i = 0
  for (const s of [-1, 1]) for (const z of ROWS) {
    const c = THATCH[i++ % 3]
    kit.at({ at: [s * 1.52, 0, z], rotY: 90 }, () => kit.part(() => {
      kit.box({ w: 1.49, h: 0.11, d: 1.25, at: [0, 0.34, 0], color: c })
      kit.hipRoof({ w: 1.49, d: 1.25, h: 0.57, ridge: 0.27, overhang: 0, at: [0, 0.45, 0], color: c })
      kit.box({ w: 0.7, h: 0.065, d: 0.16, at: [0, 0.99, 0], color: '#655039' })
      kit.box({ w: 0.83, h: 0.25, d: 0.025, at: [0, 0.065, -s * 0.492], color: '#463628' })
      for (let j = 0; j < 7; j++) kit.box({ w: 0.018, h: 0.25, d: 0.03, at: [-0.35 + j * 0.116, 0.065, -s * 0.51], color: WOOD })
      kit.box({ w: 1.21, h: 0.035, d: 0.19, at: [0, 0.016, -s * 0.53], color: WOOD })
    }))
  }
  // 街道の両脇の水路。家の側へ埋め込み、道には置かない。
  for (const s of [-1, 1]) kit.water({ points: [[s * 0.72 - 0.055, -3.5], [s * 0.72 + 0.055, -3.5], [s * 0.72 + 0.055, 3.5], [s * 0.72 - 0.055, 3.5]], color: '#638D91', h: 0.02 })

  kit.stage(4)
  for (const [x, z] of [[-2.8, -2.7], [2.8, -2.7], [-2.95, -0.7], [2.9, 1.1], [-2.5, 2.4], [2.5, 2.7]] as const) kit.tree({ kind: 'round', h: kit.range(0.52, 0.68), at: [x, 0, z], color: '#487448' })
  for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) kit.tree({ kind: 'cone', h: 0.5, at: [x, Math.max(0, kit.groundAt(x, -4) - 0.03), -4], color: '#375E3B' })
  for (const [x, z] of [[-0.3, 2.5], [0.4, 1.4], [0.1, 0.2], [-0.35, -0.7], [0.45, -2], [-0.25, 3.25], [0.25, 3.4]] as const) kit.person({ at: [x, 0.025, z], rotY: kit.range(0, 360) })
  for (const s of [-1, 1]) for (const z of [-0.6, 1.08]) kit.box({ w: 0.24, h: 0.06, d: 0.4, at: [s * 0.96, 0.025, z], color: COLORS.wood })
}
