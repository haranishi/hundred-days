/** 外寸と内部の区画を示す汎用ケース。外装の意匠や特定製品の装飾は再現しない。 */
import * as THREE from 'three'
import { LAYOUT_MM, type Layout } from '../../domain/layout'
import type { PcCase } from '../../domain/types'
import { addFan, MeshBag, rbox, type Axis } from './geometry'
import type { MaterialKit, Tone } from './materials'

export interface CaseShell {
  group: THREE.Group
  sidePanel: THREE.Group
  ownedMaterials: THREE.Material[]
}

/** 外形は入力した W×H×D。内部が読めるように4本の柱と透明な側面で示す。 */
export function buildCaseShell(c: PcCase, tone: Tone, kit: MaterialKit): CaseShell {
  const { width: W, height: H, depth: D } = c.dimensionsMm
  const shortest = Math.min(W, H, D)
  const t = Math.min(LAYOUT_MM.panel, shortest / 4)
  const rail = Math.min(7, shortest / 4)
  const bag = new MeshBag()
  const paint = kit.get('paint', tone)
  bag.add(paint, rbox(0, 0, 0, W, t, D))
  for (const y of [0, H - rail]) {
    for (const z of [0, D - rail]) bag.add(paint, rbox(0, y, z, W, y + rail, z + rail))
    for (const x of [0, W - rail]) bag.add(paint, rbox(x, y, 0, x + rail, y + rail, D))
  }
  for (const x of [0, W - rail]) for (const z of [0, D - rail]) {
    bag.add(paint, rbox(x, rail, z, x + rail, H - rail, z + rail))
  }
  // トレイ側の板は薄く示す。反対の透明面は分解時に消える独立材質。
  bag.add(paint, rbox(0, rail, rail, t, H - rail, D - rail))
  const panelMaterial = kit.get('glass', tone).clone()
  panelMaterial.userData.baseOpacity = panelMaterial.opacity
  const side = new MeshBag()
  side.add(panelMaterial, rbox(W - t, rail, rail, W, H - rail, D - rail))
  const group = bag.build('case:shell')
  const sidePanel = side.build('case:sideGlass')
  group.add(sidePanel)
  return { group, sidePanel, ownedMaterials: [panelMaterial] }
}

const mm = (b: { min: readonly number[]; max: readonly number[] }) => ({ min: b.min.map((n) => n * 1000), max: b.max.map((n) => n * 1000) })

/** 区画・ファンの位置は互換性判定と同じ layout から作る。装飾や穴配置は加えない。 */
export function buildCaseStructure(layout: Layout, tone: Tone, kit: MaterialKit): THREE.Group {
  const root = new THREE.Group()
  root.name = 'case:structure'
  const outer = mm(layout.caseBox)
  for (const s of layout.structure) {
    const b = mm(s.box)
    // 部品がケースを超える入力でも、仮の内部板がケースの外寸を広げない。
    b.min = b.min.map((v, i) => Math.max(outer.min[i]!, v))
    b.max = b.max.map((v, i) => Math.min(outer.max[i]!, v))
    if (b.max.some((v, i) => v <= b.min[i]!)) continue
    const bag = new MeshBag()
    if (s.name === 'shroud') {
      bag.add(kit.get('paintInner', tone), rbox(...b.min as [number, number, number], ...b.max as [number, number, number]))
    } else {
      const axis: Axis = s.name.startsWith('fan:bottom') ? 'y' : 'z'
      // 占有範囲を示すファン。斜め取付を含め、外観はすべて同じ記号にする。
      addFan(bag, {
        axis,
        center: b.min.map((v, i) => (v + b.max[i]) / 2) as [number, number, number],
        side1: b.max[0] - b.min[0],
        side2: axis === 'y' ? b.max[2] - b.min[2] : b.max[1] - b.min[1],
        thickness: axis === 'y' ? b.max[1] - b.min[1] : b.max[2] - b.min[2],
        frame: kit.get('plastic', tone), blade: kit.get('accent'), hub: kit.get('dark'), blades: 5,
      })
    }
    // 別々のメッシュにして、ガイドが電源カバーだけを隠せるようにする。
    const built = bag.build(s.name)
    root.add(...[...built.children])
  }
  const p = layout.planes
  const trayX = p.trayX * 1000 - 6
  const psu = mm(layout.parts.psu.box)
  const trayBottom = Math.max(outer.min[1]!, (p.shroudTopY ?? p.floorY) * 1000)
  const trayTop = Math.min(outer.max[1]!, p.ceilY * 1000)
  if (trayBottom < trayTop && p.backZ < p.frontZ && trayX > LAYOUT_MM.panel + 3 && trayX <= outer.max[0]! && (layout.template !== 'dual-chamber' || trayX > psu.max[0] + 2)) {
    const bag = new MeshBag()
    bag.add(kit.get('paintInner', tone), rbox(trayX - 2, trayBottom, p.backZ * 1000, trayX, trayTop, p.frontZ * 1000), 'detail')
    root.add(...[...bag.build('case:tray').children])
  }
  return root
}
