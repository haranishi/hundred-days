/** 電源の占有範囲と冷却面を示す汎用形状。端子の個数・配置は表現しない。 */
import type * as THREE from 'three'
import type { Psu } from '../../domain/types'
import { addFan, MeshBag, rbox } from './geometry'
import { tonesOf, type MaterialKit } from './materials'

export type PsuOrientation = 'flat' | 'upright'
export function psuExtentsMm(psu: Psu, orientation: PsuOrientation): { x: number; y: number; z: number } {
  const d = psu.dimensionsMm
  return orientation === 'flat' ? { x: d.width, y: d.height, z: d.length } : { x: d.height, y: d.width, z: d.length }
}

export function buildPsu(psu: Psu, orientation: PsuOrientation, kit: MaterialKit): THREE.Group {
  const { x: X, y: Y, z: Z } = psuExtentsMm(psu, orientation)
  const flat = orientation === 'flat'
  const tone = tonesOf(psu.color).body
  const bag = new MeshBag()
  const depth = Math.min(6, (flat ? Y : X) / 3)
  const end = Math.min(1, Z / 10)
  bag.add(kit.get('paint', tone), rbox(flat ? 0 : depth, flat ? depth : 0, 0, X, Y, Z - end, 2))
  const side = Math.min(flat ? X : Y, Z) * 0.85
  addFan(bag, {
    axis: flat ? 'y' : 'x', center: [flat ? X / 2 : depth / 2, flat ? depth / 2 : Y / 2, Z / 2],
    side1: side, thickness: depth, frame: kit.get('plastic', tone), blade: kit.get('accent'), hub: kit.get('dark'), blades: 5,
  })
  bag.add(kit.get('dark'), rbox(flat ? 0 : depth, flat ? depth : 0, Z - end, X, Y, Z))
  return bag.build('diagram:psu')
}
