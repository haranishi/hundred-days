// Ten-pointed brick shaft and conical roof, with two inscription bands represented without text.
import { COLORS, type Kit, type XZ } from './kit'

function star(radius: number): XZ[] {
  return Array.from({ length: 20 }, (_, i): XZ => {
    const a = (i / 20) * Math.PI * 2
    const r = radius * (i % 2 === 0 ? 1 : 0.79)
    return [Math.sin(a) * r, Math.cos(a) * r]
  })
}

export function build(kit: Kit): void {
  const brick = '#B38958'
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.mound({ r: 2.7, h: 0.4, color: COLORS.grass })
  kit.cylinder({ r: 1.14, h: 0.12, at: [0, 0.36, 0], color: COLORS.stone, seg: 20 })
  kit.extrude({ points: star(0.96), h: 1.58, at: [0, 0.48, 0], color: brick })
  kit.stage(2)
  kit.extrude({ points: star(0.92), h: 1.55, at: [0, 2.04, 0], color: brick })
  kit.extrude({ points: star(0.88), h: 0.5, at: [0, 3.57, 0], color: brick })
  // Round 2: conical crown joins the ten-rib shaft in stage 2.
  // Identification awaits the next image review; later bands remain stage 3.
  kit.order(-1)
  kit.cone({ r: 0.9, h: 1.58, at: [0, 4.07, 0], seg: 20, color: '#C59A64' })
  kit.order(0)
  kit.stage(3)
  for (const y of [0.95, 3.71]) kit.extrude({ points: star(y < 2 ? 0.965 : 0.9), h: 0.075, at: [0, y, 0], color: '#8F6E47' })
  kit.part(() => {
    kit.box({ w: 0.32, h: 0.66, d: 0.025, at: [0, 0.5, 0.765], color: '#4E3D2E' })
    kit.arch({ w: 0.41, h: 0.85, d: 0.045, thick: 0.07, at: [0, 0.48, 0.785], color: brick })
  })
  kit.stage(4)
  kit.stairs({ w: 0.7, d: 1.6, h: 0.44, steps: 7, at: [0, 0, 1.52], color: COLORS.pavement })
  for (const x of [-2.1, 2.1]) kit.tree({ h: 0.65, at: [x, 0.05, -1.1] })
  for (const x of [-0.6, 0.5]) kit.person({ at: [x, 0, 2.75], h: 0.11 })
}
