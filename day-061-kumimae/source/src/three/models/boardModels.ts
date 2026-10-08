/**
 * マザーボード・CPU・メモリ・SSDの模式図。それぞれ「箱の最小の角」を原点にした局所座標（mm）で作る。
 * 局所座標の軸はケースと同じ（+x＝ガラス側＝基板の部品面、+y＝上、+z＝前面）。
 *
 * マザーボードの外形（body）は基板の板だけ（厚み 1.6mm＝layout の箱）。ソケット・VRM の放熱板・スロットなどは
 * detail の札で、板の前（+x）に出る。どれも基板の縦横の中に収める。
 */
import * as THREE from 'three'
import { BOARD_SPECS, cpuPackageMm, LAYOUT_MM } from '../../domain/layout'
import type { Cpu, Memory, Motherboard, Storage } from '../../domain/types'
import { cylinder, extrude, MeshBag, rbox, roundedRectShape } from './geometry'
import { tonesOf, type MaterialKit } from './materials'

const PCB = LAYOUT_MM.boardThickness

/** マザーボード。局所座標: x 0..1.6（板）、y 0..縦（下端が 0）、z 0..横（背面の端が 0） */
export function buildMotherboard(mb: Motherboard, kit: MaterialKit): THREE.Group {
  const spec = BOARD_SPECS[mb.formFactor]
  const tall = mb.dimensionsMm.width
  const deep = mb.dimensionsMm.depth
  const tone = tonesOf(mb.color).body
  const bag = new MeshBag()
  // 基板座標 (u, v) → 局所 (z, y)
  const Y = (v: number) => tall - v
  const box = (u0: number, u1: number, v0: number, v1: number, h: number, r = 1.5) =>
    rbox(PCB, Y(Math.min(v1, tall)), Math.max(0, u0), PCB + h, Y(Math.max(0, v0)), Math.min(u1, deep), r)

  bag.add(kit.get('pcb', tone), rbox(0, 0, 0, PCB, tall, deep, 0.6))

  // 白い基板の放熱板は銀（白一色だと形が読めない）、黒い基板は黒
  const heat = kit.get('metal', tone === 'white' ? 'silver' : 'black')
  const slot = kit.get('plastic', tone === 'white' ? 'white' : 'black')
  const { u: su, v: sv } = spec.socket

  // 背面 I/O のカバー
  bag.add(heat, box(0, 26, 2, Math.min(sv + 44, tall * 0.5), 24, 3), 'detail')
  // VRM の放熱板（ソケットの上と背面側）。水冷ヘッド（80mm 角）と空冷のベースに重ならない所に置く
  if (sv - 42 - 8 >= 8) bag.add(heat, box(30, su + 26, 8, sv - 42, 18, 2.5), 'detail')
  if (su - 44 - 30 >= 10) bag.add(heat, box(30, su - 44, sv - 42, sv + 40, 18, 2.5), 'detail')

  // ソケット（CPU の周りの枠）とレバー
  const frame = roundedRectShape(58, 58, 3)
  const hole = new THREE.Path()
  hole.moveTo(-21, -21)
  hole.lineTo(-21, 21)
  hole.lineTo(21, 21)
  hole.lineTo(21, -21)
  hole.lineTo(-21, -21)
  frame.holes.push(hole)
  // 形は (a, b) 平面 → x 方向へ押し出す。extrude の 'x' は形の x→z?（下の中心で合わせる）
  bag.add(kit.get('nickel'), extrude(frame, 4, 'x', PCB + 2, Y(sv), su), 'detail')
  bag.add(kit.get('nickel'), cylinder('y', PCB + 3, Y(sv), su + 33, 1.2, 60, 12), 'detail')

  // メモリスロット（両端のラッチ付き）
  const slots = Math.min(mb.memorySlots, spec.ramSlots)
  for (let i = 0; i < slots; i++) {
    const u = slots === 1 ? spec.ramU[0] : spec.ramU[0] + ((spec.ramU[1] - spec.ramU[0]) * i) / (slots - 1)
    bag.add(slot, box(u - 4.25, u + 4.25, spec.ramV[0] - 4, spec.ramV[1] + 4, 6, 0.8), 'detail')
    bag.add(slot, box(u - 3, u + 3, spec.ramV[0] - 9, spec.ramV[0] - 4, 9, 0.6), 'detail')
    bag.add(slot, box(u - 3, u + 3, spec.ramV[1] + 4, spec.ramV[1] + 9, 9, 0.6), 'detail')
  }

  // PCIe x16（金属で補強）と、下の段のスロット。u は GPU の端子に合わせた LAYOUT_MM.pcieX16（数字の出どころは1か所）
  const x16 = LAYOUT_MM.pcieX16
  bag.add(kit.get('accent'), box(x16.u0, x16.u0 + x16.length, spec.pcieV - 4, spec.pcieV + 4, 11, 1), 'detail')
  if (mb.formFactor !== 'ITX') {
    for (const dv of [40.64, 81.28]) {
      if (spec.pcieV + dv + 4 > tall - 6) break
      bag.add(slot, box(x16.u0, x16.u0 + x16.length, spec.pcieV + dv - 3.5, spec.pcieV + dv + 3.5, 9, 0.8), 'detail')
    }
  }
  // チップセットの放熱板（ATX だけ。GPU の下の広い所）
  if (mb.formFactor === 'ATX') bag.add(heat, box(deep - 80, deep - 26, spec.pcieV + 62, Math.min(spec.pcieV + 108, tall - 8), 9, 2), 'detail')
  // 24 ピンの電源コネクタ（前面の端。Mini-ITX はメモリスロットと場所が重なるので描かない）
  if (mb.formFactor !== 'ITX') bag.add(kit.get('dark'), box(deep - 9, deep - 1, 58, 112, 10, 0.8), 'detail')
  bag.repeat(kit.get('aluminum'), cylinder('x', PCB + 4, 0, 0, 3, 8, 12),
    Array.from({ length: 10 }, (_, i) => [0, tall - 12 - i * 11, 28] as [number, number, number]), 'capacitors')
  bag.repeat(heat, rbox(PCB + 18, 0, 0, PCB + 22, 1.2, 20),
    Array.from({ length: 16 }, (_, i) => [0, tall - 8 - i * 4, 3] as [number, number, number]), 'fins:vrm')
  if (spec.m2V !== null) bag.add(heat, box(su - 40, su + 40, spec.m2V - 8, spec.m2V - 2, 4, 0.5), 'detail')
  return bag.build(`motherboard:${mb.id}`)
}

/** CPU。局所座標: x 0..7（基板の面から）、y 0..縦、z 0..横（模式図用の仮寸法40×40） */
export function buildCpu(cpu: Cpu, kit: MaterialKit): THREE.Group {
  const { u, v } = cpuPackageMm(cpu.socket)
  const h = LAYOUT_MM.cpuPackage.height
  const bag = new MeshBag()
  bag.add(kit.get('substrate'), rbox(0, 0, 0, 1.6, v, u, 0.5))
  bag.add(kit.get('nickel'), rbox(1.6, 3, 3, h, v - 3, u - 3, 1.4))
  return bag.build('cpu')
}

/** メモリ1枚。局所座標: x 0..高さ（基板の面から）、y 0..133、z 0..7。RGB 付きは上端に光る帯 */
export function buildMemoryModule(mem: Memory, kit: MaterialKit): THREE.Group {
  const h = mem.heightMm
  const L = LAYOUT_MM.dimm.length
  const T = LAYOUT_MM.dimm.thickness
  const tone = tonesOf(mem.color).body
  const bag = new MeshBag()
  const contact = Math.min(3.5, h * 0.1)
  const pcbTop = Math.min(7, h * 0.3)
  // 端子（スロットに入る所）と基板
  bag.add(kit.get('gold'), rbox(0, 4, T / 2 - 0.65, contact, L - 4, T / 2 + 0.65, 0.2))
  bag.add(kit.get('pcb', 'black'), rbox(contact, 1, T / 2 - 0.65, pcbTop, L - 1, T / 2 + 0.65, 0.2))
  // 上端: RGB 付きは光る帯、無い製品は細い稜線（差し色）
  const top = mem.rgb ? Math.min(8, h * 0.22) : Math.min(2, h * 0.2)
  // 放熱板（左右の2枚を1つの角丸の箱で）
  bag.add(kit.get('metal', tone), rbox(Math.min(6, h * 0.2), 0, 0, h - top, L, T, 1.4))
  if (mem.rgb) bag.add(kit.rgb('memory'), rbox(h - top, 1.5, 0.7, h, L - 1.5, T - 0.7, 1.2))
  else bag.add(kit.get('metal', tone === 'white' ? 'white' : 'silver'), rbox(h - top, 4, 1.2, h, L - 4, T - 1.2, 0.6))
  return bag.build(`memory:${mem.id}`)
}

/** SSD（M.2 2280）。局所座標: x 0..厚み、y 0..22、z 0..80。ヒートシンク付きは厚みを足す */
export function buildStorage(ssd: Storage, kit: MaterialKit): THREE.Group {
  const m2 = LAYOUT_MM.m2
  const bag = new MeshBag()
  bag.add(kit.get('pcb', 'black'), rbox(0, 0, 0, 0.8, m2.width, m2.length, 0.2))
  bag.add(kit.get('gold'), rbox(0.05, 2, 0, 0.75, m2.width - 2, 3.5), 'detail')
  // コントローラと NAND、ラベル
  bag.add(kit.get('dark'), rbox(0.8, 3, 7, m2.thickness, m2.width - 3, 21, 0.4))
  bag.add(kit.get('dark'), rbox(0.8, 3, 25, m2.thickness, m2.width - 3, 47, 0.4))
  bag.add(kit.get('dark'), rbox(0.8, 3, 51, m2.thickness, m2.width - 3, 73, 0.4))
  if (ssd.heatsink) {
    const t0 = m2.thickness
    const t1 = t0 + m2.heatsinkExtra
    bag.add(kit.get('metal', 'black'), rbox(t0, 0, 0, t1 - 2, m2.width, m2.length, 1))
    for (let k = 0; k < 5; k++) {
      const y0 = 1.5 + k * 4
      bag.add(kit.get('metal', 'black'), rbox(t1 - 2, y0, 1, t1, y0 + 2.2, m2.length - 1, 0.5))
    }
  }
  return bag.build(`storage:${ssd.id}`)
}
