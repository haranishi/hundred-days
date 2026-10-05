// ハドリアヌスの長城：なだらかな草原の低い石壁と、壁に接続する方形の小砦の遺構。
import { type Kit, type XZ } from './kit'

const STONE = ['#ACA695', '#999581', '#B9B39F'] as const
const LINE: readonly XZ[] = [[-3.9, -1.7], [-2.85, -1.42], [-1.65, -0.82], [-0.4, -0.25], [0.9, 0.32], [2.05, 0.95], [3.55, 1.72]]

export function build(kit: Kit): void {
  kit.ground('#8CA864')
  kit.stage(1)
  kit.mound({ r: 2.3, rx: 2.3, rz: 1.8, h: 0.5, at: [-1.3, 0, -1.2], color: '#809950' })
  kit.mound({ r: 2.4, rx: 2.4, rz: 1.8, h: 0.64, at: [2.0, 0, 1.1], color: '#8AA35A' })
  kit.mound({ r: 1.3, h: 0.19, at: [-0.8, 0, 2.7], color: '#92AA65' })
  // 低い土色の溝。丘の尾根を走る高い歩道付きの長城とは作り分ける。
  kit.box({ w: 4.1, h: 0.025, d: 0.2, rotY: -28, at: [-0.8, 0.01, -1.95], color: '#837850' })
  for (let i = 0; i < LINE.length - 1; i++) wall(kit, LINE[i]!, LINE[i + 1]!, 0.22, i)

  kit.stage(2)
  for (let i = 0; i < LINE.length - 1; i++) wall(kit, LINE[i]!, LINE[i + 1]!, 0.46, i, 0.22)

  kit.stage(3)
  kit.order(-1)
  // Milecastle の現在の基礎遺構を誇張して読める高さへ。屋根や架空の高塔は付けない。
  const y = kit.groundAt(-0.5, 0.9)
  kit.at({ at: [-0.5, y - 0.025, 0.9], rotY: -26 }, () => kit.part(() => {
    kit.box({ w: 1.5, h: 0.025, d: 1.66, color: '#9FA16D' })
    for (const s of [-1, 1]) kit.box({ w: 0.15, h: 0.38, d: 1.68, at: [s * 0.74, 0, 0], color: STONE[0] })
    kit.box({ w: 1.6, h: 0.37, d: 0.15, at: [0, 0, -0.78], color: STONE[1] })
    for (const x of [-0.52, 0.52]) kit.box({ w: 0.57, h: 0.33, d: 0.15, at: [x, 0, 0.78], color: STONE[0] })
    kit.box({ w: 0.1, h: 0.18, d: 1.05, at: [0.12, 0, -0.13], color: STONE[1] })
    kit.box({ w: 0.52, h: 0.18, d: 0.11, at: [-0.25, 0, 0.28], color: STONE[1] })
  }))
  kit.order(0)
  for (let i = 0; i < LINE.length - 1; i++) {
    const a = LINE[i]!, b = LINE[i + 1]!
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.ceil(len / 0.19)
    kit.part(() => {
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
        kit.box({ w: len / n - 0.009, h: 0.055, d: 0.27, rotY: -Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, at: [x, kit.groundAt(x, z) + 0.645, z], color: STONE[(i + j) % 3] })
      }
    })
  }

  kit.stage(4)
  for (const [x, z] of [[-2.65, 0.35], [-1.8, 1.35], [1.55, -1.25], [2.5, -0.7], [-1.0, 2.85]] as const) {
    sheep(kit, x, z)
  }
  for (const [x, z] of [[-3.1, -0.75], [-2.1, -0.15], [1.55, 1.65], [2.5, 2.2]] as const) kit.person({ at: [x, Math.max(0, kit.groundAt(x, z) - 0.01), z], color: '#3D6178' })
  for (const [x, z] of [[-3.05, -2.5], [-1.85, -2.75], [0.8, -2.35], [2.8, -1.9], [3.3, 0.25]] as const) kit.sphere({ r: kit.range(0.07, 0.12), squash: 0.5, seg: 7, at: [x, kit.groundAt(x, z), z], color: '#A39C8B' })
}

function wall(kit: Kit, a: XZ, b: XZ, h: number, colorIndex: number, offset = 0): void {
  const n = 6
  const angle = -Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
  const step = Math.hypot(b[0] - a[0], b[1] - a[1]) / n
  kit.part(() => {
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
      kit.box({ w: step + 0.025, h, d: 0.245, rotY: angle, at: [x, Math.max(0, kit.groundAt(x, z) - 0.03) + offset, z], color: STONE[(colorIndex + j) % 3] })
    }
  })
}

function sheep(kit: Kit, x: number, z: number): void {
  kit.at({ at: [x, kit.groundAt(x, z), z], rotY: kit.range(0, 360) }, () => kit.part(() => {
    for (const dx of [-0.045, 0.045]) for (const dz of [-0.07, 0.07]) kit.box({ w: 0.02, h: 0.08, d: 0.02, at: [dx, 0, dz], color: '#776D5B' })
    kit.sphere({ r: 0.085, squash: 0.65, seg: 8, scale: [0.8, 1, 1.3], at: [0, 0.05, 0], color: '#EAE4D1' })
    kit.sphere({ r: 0.04, seg: 7, at: [0, 0.085, 0.11], color: '#7C7668' })
  }))
}
