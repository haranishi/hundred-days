/** GPUの外寸と冷却面を示す模式図。端子配置・カバー・装飾の製品差は再現しない。 */
import type * as THREE from 'three'
import type { Gpu } from '../../domain/types'
import { addFan, MeshBag, rbox } from './geometry'
import { tonesOf, type MaterialKit } from './materials'

export function gpuExtentsMm(gpu: Gpu): { x: number; y: number; z: number } {
  const d = gpu.dimensionsMm
  return { x: d.height, y: d.thickness, z: d.length }
}

export function buildGpu(gpu: Gpu, kit: MaterialKit): THREE.Group {
  const { x: H, y: T, z: L } = gpuExtentsMm(gpu)
  const tone = tonesOf(gpu.color).body
  const bag = new MeshBag()
  const fanT = Math.min(8, T / 3)
  const bracket = Math.min(2, L / 10)
  const light = Math.min(1, H / 10)
  bag.add(kit.get('shroud', tone), rbox(0, fanT, bracket, gpu.rgb ? H - light : H, T, L, 2))
  bag.add(kit.get('accent'), rbox(0, 0, 0, H, T, bracket))
  // 同じ5枚羽根の記号を等間隔に並べる。個別製品のファン形状ではない。
  const count = Math.max(1, gpu.fans)
  const margin = Math.min(8, L / 20)
  const step = (L - 2 * margin) / count
  const size = Math.min(H * 0.9, step * 0.9)
  for (let i = 0; i < count; i++) addFan(bag, {
    axis: 'y', center: [H / 2, fanT / 2, margin + step * (i + 0.5)], side1: size, thickness: fanT,
    frame: kit.get('plastic', tone), blade: kit.get('accent'), hub: kit.get('dark'), blades: 5,
  })
  if (gpu.rgb) bag.add(kit.rgb('gpu'), rbox(H - light, fanT, bracket, H, T, L))
  return bag.build('diagram:gpu')
}
