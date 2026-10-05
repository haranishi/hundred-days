// Present-day ruin: 8-column ends, 17-column flanks, partial pediments; no intact roof.
import { COLORS, type Kit } from './kit'

export function build(kit: Kit): void {
  const marble = '#DDD2B8'
  kit.ground(COLORS.gravel)
  kit.stage(1)
  kit.mound({ r: 4.2, rx: 4.3, rz: 3.8, h: 0.33, color: '#B9AD91' })
  for (let i = 0; i < 3; i++) kit.box({ w: 3.5 - i * 0.12, d: 5.8 - i * 0.12, h: 0.1, at: [0, 0.3 + i * 0.1, 0], color: marble })
  kit.stage(2)
  kit.part(() => {
    for (const z of [-2.63, 2.63]) for (let i = 0; i < 8; i++) column(kit, -1.42 + i * 0.406, z, marble)
    for (const x of [-1.42, 1.42]) for (let i = 1; i < 16; i++) column(kit, x, -2.63 + i * 0.329, marble)
  })
  kit.box({ w: 2.05, h: 1.25, d: 0.16, at: [0, 0.6, -0.7], color: marble })
  kit.box({ w: 0.18, h: 0.95, d: 2.3, at: [-0.97, 0.6, 0.42], color: marble })
  kit.stage(3)
  kit.part(() => {
    for (const z of [-2.63, 2.63]) {
      kit.box({ w: 3.15, d: 0.3, h: 0.25, at: [0, 2.19, z], color: marble })
      // Surviving triangular corners, with the middle of the pediment absent.
      for (const side of [-1, 1]) kit.extrude({
        points: [[side * 1.57, 0], [side * 0.48, 0], [side * 0.48, -0.43]],
        h: 0.3, at: [0, 2.44, z - 0.15], rot: [90, 0, 0], color: marble,
      })
      for (let i = 0; i < 15; i++) kit.box({ w: 0.07, h: 0.16, d: 0.018, at: [-1.44 + i * 0.206, 2.23, z + (z > 0 ? 0.16 : -0.16)], color: '#C3B89F' })
    }
    for (const x of [-1.42, 1.42]) kit.box({ w: 0.28, d: 5.52, h: 0.24, at: [x, 2.19, 0], color: marble })
  })
  kit.stage(4)
  for (const [x, z] of [[-2.3, 1.4], [2.2, 1.1], [-2, -1.7], [2, -2.3]] as const) kit.box({ w: 0.35, h: 0.13, d: 0.25, at: [x, kit.groundAt(x, z), z], rotY: 21, color: marble })
  for (const x of [-0.9, 0.5, 1.1]) kit.person({ at: [x, 0.15, 3.24], h: 0.1 })
}

function column(kit: Kit, x: number, z: number, color: string): void {
  kit.cylinder({ r: 0.135, rTop: 0.108, h: 1.48, at: [x, 0.6, z], seg: 12, color })
  kit.cylinder({ r: 0.157, h: 0.065, at: [x, 2.08, z], seg: 12, color })
  kit.box({ w: 0.31, d: 0.31, h: 0.045, at: [x, 2.145, z], color })
}
