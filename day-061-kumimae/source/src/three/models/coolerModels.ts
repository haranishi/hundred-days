/** 冷却装置の外寸・メモリ上の余白・取付方式を示す汎用形状。 */
import * as THREE from 'three'
import { LAYOUT_MM } from '../../domain/layout'
import type { AioCooler, AirCooler } from '../../domain/types'
import { addFan, MeshBag, rbox } from './geometry'
import { tonesOf, type MaterialKit } from './materials'

export interface AirCoolerFit {
  depth: number
  overhang: { fromZ: number; floorX: number } | null
  /** 単体比較では製品の全高、組付け時はlayoutのCPU上からの高さ。 */
  height?: number
}

export function airCoolerExtentsMm(c: AirCooler): { x: number; y: number; z: number } {
  return { x: c.heightMm - Math.min(LAYOUT_MM.cpuPackage.height, c.heightMm / 2), y: c.dimensionsMm.width, z: c.dimensionsMm.depth }
}

export function buildAirCooler(c: AirCooler, fit: AirCoolerFit, kit: MaterialKit): THREE.Group {
  const X = fit.height ?? airCoolerExtentsMm(c).x
  const W = c.dimensionsMm.width
  const D = fit.depth
  const fanT = Math.min(6, D / 4)
  const coreEnd = D - fanT
  const split = Math.min(D, Math.max(D / 100, fit.overhang?.fromZ ?? D))
  const floor = Math.min(X * 0.8, Math.max(0, fit.overhang?.floorX ?? 0))
  const finBase = Math.min(28, X / 4)
  const bag = new MeshBag()
  const tone = tonesOf(c.color).body
  // ベースと一本の支柱。放熱部は同じ平板の記号に統一する。
  const baseHalf = Math.min(18, split * 0.4)
  bag.add(kit.get('nickel'), rbox(0, W * 0.3, split / 2 - baseHalf, finBase + Math.min(1, X * 0.02), W * 0.7, split / 2 + baseHalf, 1))
  bag.add(kit.get('radiator', tone), rbox(finBase, W * 0.35, split * 0.3, X, W * 0.65, Math.min(coreEnd, split * 0.7)))
  const finT = Math.min(2, (X - finBase) / 16)
  for (let i = 0; i < 8; i++) {
    const x = finBase + (X - finBase - finT) * i / 7
    const zEnd = Math.min(coreEnd, x >= floor ? D : split)
    bag.add(kit.get('accent'), rbox(x, 0, 0, x + finT, W, zEnd))
  }
  const fanFloor = Math.max(finBase, split < D ? floor : 0)
  const fanSide = Math.min(c.fans.sizeMm, W * 0.9, (X - fanFloor) * 0.9)
  addFan(bag, {
    axis: 'z', center: [(fanFloor + X) / 2, W / 2, D - fanT / 2], side1: fanSide, thickness: fanT,
    frame: kit.get('plastic', tone), blade: kit.get('accent'), hub: kit.get('dark'), rgb: c.rgb ? kit.rgb('cooler') : null, blades: 5,
  })
  return bag.build('diagram:air-cooler')
}

export function buildAioHead(c: AioCooler, kit: MaterialKit): THREE.Group {
  const S = LAYOUT_MM.aioHeadSize
  const H = c.pumpHeightMm
  const bag = new MeshBag()
  bag.add(kit.get('plastic', tonesOf(c.color).body), rbox(0, 0, 0, H - 1, S, S, 3))
  bag.add(c.rgb ? kit.rgb('cooler') : kit.get('accent'), rbox(H - 1, 0, 0, H, S, S))
  return bag.build('diagram:pump')
}

export type RadiatorMount = 'top' | 'front'
export function buildRadiator(c: AioCooler, mount: RadiatorMount, kit: MaterialKit): THREE.Group {
  const { width: W, thickness: T, length: L } = c.radiatorDimensionsMm
  const bag = new MeshBag()
  const tone = tonesOf(c.color).body
  const fanT = Math.min(25, T / 2)
  bag.add(kit.get('radiator', tone), rbox(0, fanT, 0, W, T, L, 2))
  const count = Math.max(1, c.fans.count)
  const step = L / count
  const size = Math.min(c.fans.sizeMm, W, step - 4)
  for (let i = 0; i < count; i++) addFan(bag, {
    axis: 'y', center: [W / 2, fanT / 2, step * (i + 0.5)], side1: size, thickness: fanT,
    frame: kit.get('plastic', tone), blade: kit.get('accent'), hub: kit.get('dark'), rgb: c.rgb ? kit.rgb('cooler') : null, blades: 5,
  })
  const group = bag.build('diagram:radiator')
  if (mount === 'front') {
    for (const child of group.children) {
      const mesh = child as THREE.Mesh
      mesh.geometry.rotateX(Math.PI / 2)
      mesh.geometry.translate(0, L, 0)
      mesh.geometry.computeBoundingBox()
      mesh.geometry.computeBoundingSphere()
    }
  }
  return group
}

/** ホースは接続関係だけを表す共通の細い線。長さ・経路の適合判定には使用しない。 */
export function buildHoses(c: AioCooler, head: { min: number[]; max: number[] }, rad: { min: number[]; max: number[] }, mount: RadiatorMount, kit: MaterialKit): THREE.Group {
  const bag = new MeshBag()
  const x = (rad.min[0] + rad.max[0]) / 2
  for (const k of [-1, 1]) {
    const start = new THREE.Vector3(head.max[0], (head.min[1] + head.max[1]) / 2 + k * 12, (head.min[2] + head.max[2]) / 2)
    const end = mount === 'top' ? new THREE.Vector3(x + k * 12, rad.min[1], rad.min[2] + 20) : new THREE.Vector3(x + k * 12, rad.max[1] - 20, rad.min[2])
    const c1 = start.clone().add(new THREE.Vector3(30, 0, 0))
    const c2 = end.clone().add(mount === 'top' ? new THREE.Vector3(0, -30, 0) : new THREE.Vector3(0, 0, -30))
    bag.add(kit.get('hose', tonesOf(c.color).body), new THREE.TubeGeometry(new THREE.CubicBezierCurve3(start, c1, c2, end), 24, 5, 8, false), 'decor')
  }
  return bag.build('diagram:hoses')
}
