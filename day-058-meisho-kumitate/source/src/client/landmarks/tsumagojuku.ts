// 妻籠宿：直角に二回折れる枡形、低い木造の町家、白壁・黒格子の脇本陣奥谷。
// 枡形は他の宿場にもある。建物の大小差と奥谷の庭を合わせて妻籠の手がかりにする。
import { COLORS, type Kit, type XZ } from './kit'

interface House {
  x: number; z: number; w: number; d: number; h: number; turn: number; board: boolean; color: string
}

const HOUSES: readonly House[] = [
  { x: -2.05, z: 2.92, w: 1.22, d: 1.0, h: 0.56, turn: 90, board: true, color: '#8C684B' },
  { x: 0.07, z: 2.96, w: 1.22, d: 1.0, h: 0.61, turn: -90, board: false, color: '#A2825B' },
  { x: -2.05, z: 1.43, w: 1.05, d: 1.0, h: 0.44, turn: 90, board: true, color: '#A88B63' },
  { x: 0.07, z: 1.55, w: 1.08, d: 1.0, h: 0.5, turn: -90, board: true, color: '#6D533D' },
  { x: -0.18, z: -1.35, w: 1.15, d: 1.0, h: 0.49, turn: 90, board: false, color: '#BBA17C' },
  { x: -0.18, z: -2.9, w: 1.25, d: 1.0, h: 0.57, turn: 90, board: true, color: '#8C684B' },
]
const INN = { x: 2.74, z: -1.52, w: 2.6, d: 1.24, h: 0.94 }
const ROAD: readonly XZ[] = [
  [-1.3, 3.9], [-0.6, 3.9], [-0.6, 0.65], [1.3, 0.65],
  [1.3, -3.95], [0.6, -3.95], [0.6, -0.05], [-1.3, -0.05],
]

export function build(kit: Kit): void {
  kit.ground('#869063')
  kit.stage(1)
  for (const h of HOUSES) onHouse(kit, h, () => kit.box({ w: h.w, h: h.h, d: h.d, color: h.color }))
  onInn(kit, () => {
    kit.box({ w: INN.w + 0.12, h: 0.06, d: INN.d + 0.12, color: '#ABA08C' })
    kit.box({ w: INN.w, h: INN.h, d: INN.d, at: [0, 0.06, 0], color: COLORS.plaster })
  })

  kit.stage(2)
  kit.order(-1)
  // 斜めの軽いずれから、先を見通せない二つの直角へ。道は実際の土色の薄い立体。
  kit.extrude({ points: ROAD, h: 0.024, color: '#BDAF93' })
  kit.part(() => {
    kit.box({ w: 0.09, h: 0.23, d: 0.42, at: [-0.54, 0, 0.91], color: '#A79D87' })
    kit.box({ w: 1.02, h: 0.23, d: 0.09, at: [-0.03, 0, 0.72], color: '#A79D87' })
    kit.box({ w: 0.09, h: 0.23, d: 0.48, at: [0.53, 0, -0.37], color: '#A79D87' })
    kit.box({ w: 0.96, h: 0.23, d: 0.09, at: [0.1, 0, -0.13], color: '#A79D87' })
  })
  kit.order(0)
  for (const h of HOUSES) onHouse(kit, h, () => kit.gableRoof({ w: h.w, d: h.d, h: 0.21, overhang: 0.13, at: [0, h.h, 0], color: h.board ? '#625448' : COLORS.roofTile }))
  onInn(kit, () => kit.gableRoof({ w: INN.w, d: INN.d, h: 0.3, overhang: 0.16, at: [0, 1.0, 0], color: COLORS.roofTile }))
  kit.box({ w: 0.72, h: 0.016, d: 2.55, at: [1.72, 0, INN.z], color: '#9AAB70' })
  kit.box({ w: 1.02, h: 0.026, d: 0.25, at: [1.71, 0, INN.z], color: COLORS.gravel })

  kit.stage(3)
  kit.order(-1)
  onInn(kit, () => kit.part(() => {
    // 公式外観写真の二階の黒格子、白壁、下のなまこ壁を別々の立体で読ませる。
    const front = INN.d / 2 + 0.025
    kit.box({ w: 2.21, h: 0.32, d: 0.029, at: [0, 0.53, front], color: '#352E26' })
    for (let i = 0; i < 19; i++) kit.box({ w: 0.022, h: 0.33, d: 0.04, at: [-1.03 + i * 0.114, 0.53, front + 0.023], color: '#664C35' })
    kit.box({ w: 2.46, h: 0.052, d: 0.05, at: [0, 0.48, front + 0.015], color: '#694B33' })
    kit.box({ w: 2.04, h: 0.047, d: 0.048, at: [0, 0.44, front + 0.019], color: COLORS.plaster })
    kit.box({ w: 1.74, h: 0.31, d: 0.035, at: [0, 0.1, front], color: '#3E3125' })
    for (let i = 0; i < 14; i++) kit.box({ w: 0.02, h: 0.32, d: 0.046, at: [-0.77 + i * 0.119, 0.1, front + 0.021], color: '#6D4B31' })
    for (const x of [-0.87, 0.87]) kit.box({ w: 0.06, h: 0.88, d: 0.067, at: [x, 0.08, front + 0.02], color: '#60432D' })
    for (const x of [-1.12, 1.12]) {
      kit.box({ w: 0.27, h: 0.27, d: 0.035, at: [x, 0.08, front + 0.01], color: '#45453F' })
      for (const y of [0.115, 0.23]) {
        kit.beam({ from: [x - 0.11, y, front + 0.05], to: [x + 0.11, y + 0.11, front + 0.05], size: 0.018, color: COLORS.plaster })
        kit.beam({ from: [x + 0.11, y, front + 0.05], to: [x - 0.11, y + 0.11, front + 0.05], size: 0.018, color: COLORS.plaster })
      }
    }
    kit.box({ w: 2.4, h: 0.036, d: 0.26, at: [0, 0.07, front + 0.085], color: COLORS.darkWood })
    kit.gableRoof({ w: 2.39, d: 0.47, h: 0.1, overhang: 0.025, at: [0, 0.43, front], color: '#63554B' })
  }))
  kit.part(() => {
    for (const z of [INN.z - 0.35, INN.z + 0.35]) kit.box({ w: 0.075, h: 0.34, d: 0.075, at: [1.36, 0, z], color: '#9B9586' })
    for (let i = 0; i < 7; i++) kit.box({ w: 0.115, h: 0.045, d: 0.108, at: [-0.47 + i * 0.143, 0.23, 0.72], color: '#C0B39B' })
    for (let i = 0; i < 6; i++) kit.box({ w: 0.115, h: 0.045, d: 0.108, at: [-0.3 + i * 0.145, 0.23, -0.13], color: '#C0B39B' })
  })
  kit.order(0)
  for (const h of HOUSES) onHouse(kit, h, () => kit.part(() => {
    const front = h.d / 2 + 0.025
    kit.box({ w: h.w - 0.08, h: 0.26, d: 0.025, at: [0, 0.05, front], color: '#3E3027' })
    for (let j = 0; j < 10; j++) kit.box({ w: 0.018, h: 0.26, d: 0.03, at: [-h.w * 0.42 + j * h.w * 0.084, 0.05, front + 0.019], color: '#77543A' })
    kit.box({ w: h.w + 0.03, h: 0.035, d: 0.22, at: [0, 0.04, front + 0.065], color: COLORS.darkWood })
    kit.gableRoof({ w: h.w + 0.015, d: 0.42, h: 0.075, overhang: 0.025, at: [0, 0.33, front], color: '#65564A' })
    if (h.h > 0.5) {
      kit.box({ w: h.w * 0.64, h: 0.12, d: 0.025, at: [0, 0.4, front], color: '#E3D8BD' })
      for (const x of [-0.3, 0, 0.3]) kit.box({ w: 0.025, h: 0.12, d: 0.029, at: [x * h.w, 0.4, front + 0.02], color: '#654733' })
    }
    if (h.board) for (const x of [-0.35, 0, 0.35]) for (const s of [-1, 1]) kit.box({ w: 0.09, h: 0.035, d: 0.075, at: [x * h.w, h.h + 0.14, s * 0.22], color: '#A5A096' })
  }))
  kit.extrude({ points: [[-1.38, 3.72], [-1.32, 3.72], [-1.32, -0.07], [0.57, -0.07], [0.57, -3.62], [0.51, -3.62], [0.51, -0.13], [-1.38, -0.13]], h: 0.022, color: '#5D7370' })

  kit.stage(4)
  // 主特徴を隠さないよう、山裾と森は完成後の背景にだけ置く。
  kit.mound({ r: 2.18, rx: 2.18, rz: 0.82, h: 0.58, at: [-0.25, 0, -3.8], color: '#466046' })
  for (const x of [-1.5, -0.8, -0.1, 0.6, 1.3]) kit.tree({ kind: 'cone', h: 0.43, at: [x, Math.max(0, kit.groundAt(x, -3.83) - 0.03), -3.83], color: '#31573A' })
  for (const [x, z] of [[-2.55, -2.75], [-2.7, -1.3], [-2.95, 0.45], [2.75, 1.75], [2.4, 2.9]] as const) kit.tree({ kind: 'round', h: kit.range(0.37, 0.48), at: [x, 0, z], color: '#4C7245' })
  kit.tree({ kind: 'pine', h: 0.48, at: [1.77, 0.016, -0.61], rotY: 180 })
  kit.tree({ kind: 'round', h: 0.3, at: [1.73, 0.016, -2.43], color: '#779150' })
  for (const [x, z] of [[-0.94, 3.12], [-0.94, 1.15], [-0.76, 0.34], [0.34, 0.29], [0.95, -1.7], [1.76, -1.52]] as const) kit.person({ at: [x, 0.026, z], rotY: kit.range(0, 360) })
}

function onHouse(kit: Kit, h: House, fn: () => void): void { kit.at({ at: [h.x, 0, h.z], rotY: h.turn }, fn) }
function onInn(kit: Kit, fn: () => void): void { kit.at({ at: [INN.x, 0, INN.z], rotY: -90 }, fn) }
