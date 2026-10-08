/** 寸法から作った汎用形状を、互換性判定と同じlayoutの位置へ置く。単位はmm。 */
import * as THREE from 'three'
import { type Box, type Layout, type Piece } from '../domain/layout'
import type { Category, Look, ResolvedBuild } from '../domain/types'
import { buildCpu, buildMemoryModule, buildMotherboard, buildStorage } from './models/boardModels'
import { buildCaseShell, buildCaseStructure } from './models/caseModel'
import { buildAioHead, buildAirCooler, buildHoses, buildRadiator, type AirCoolerFit } from './models/coolerModels'
import { buildGpu } from './models/gpuModel'
import type { MaterialKit, RgbChannel } from './models/materials'
import { buildPsu } from './models/psuModel'
import { noteModel } from './modelUse'

export const MM_PER_M = 1000
export interface MmBox { min: [number, number, number]; max: [number, number, number] }
export const toMm = (b: Box): MmBox => ({ min: b.min.map((n) => n * MM_PER_M) as MmBox['min'], max: b.max.map((n) => n * MM_PER_M) as MmBox['max'] })

export interface PartModel {
  category: Category
  id: string
  group: THREE.Group
  sidePanel: THREE.Group | null
  ownedMaterials: THREE.Material[]
  rgb: RgbChannel | null
  outlineBoxes?: MmBox[]
}

const at = (g: THREE.Group, b: MmBox, name: string) => { g.position.set(...b.min); g.name = name; return g }
const pieceMm = (pieces: Piece[], name: string): MmBox => {
  const p = pieces.find((x) => x.name === name)
  if (!p) throw new Error(`layout に ${name} がありません`)
  return toMm(p.box)
}

export function airCoolerFit(pieces: Piece[]): AirCoolerFit {
  const tower = pieceMm(pieces, 'cooler:tower')
  const over = pieces.find((p) => p.name === 'cooler:overhang')
  if (!over) return { depth: tower.max[2] - tower.min[2], overhang: null }
  const o = toMm(over.box)
  return { depth: o.max[2] - tower.min[2], overhang: { fromZ: o.min[2] - tower.min[2], floorX: o.min[0] - tower.min[0] } }
}

export function buildPartModel(category: Category, b: ResolvedBuild, layout: Layout, look: Look, kit: MaterialKit): PartModel {
  const placed = layout.parts[category]
  const root = new THREE.Group()
  root.name = `part:${category}`
  let sidePanel: THREE.Group | null = null
  let ownedMaterials: THREE.Material[] = []
  let rgb: RgbChannel | null = null
  const put = (g: THREE.Group, name: string) => root.add(at(g, pieceMm(placed.pieces, name), name))
  switch (category) {
    case 'case': {
      const tone = look.caseColor === 'white' ? 'white' : 'black'
      const shell = buildCaseShell(b.case, tone, kit)
      root.add(shell.group, buildCaseStructure(layout, tone, kit))
      sidePanel = shell.sidePanel
      ownedMaterials = shell.ownedMaterials
      break
    }
    case 'motherboard': put(buildMotherboard(b.motherboard, kit), 'motherboard'); break
    case 'cpu': put(buildCpu(b.cpu, kit), 'cpu'); break
    case 'storage': put(buildStorage(b.storage, kit), 'storage'); break
    case 'memory':
      for (const p of placed.pieces) root.add(at(buildMemoryModule(b.memory, kit), toMm(p.box), p.name))
      rgb = b.memory.rgb ? 'memory' : null
      break
    case 'gpu': put(buildGpu(b.gpu, kit), 'gpu'); rgb = b.gpu.rgb ? 'gpu' : null; break
    case 'psu': put(buildPsu(b.psu, layout.psuOrientation, kit), 'psu'); break
    case 'cooler': {
      const c = b.cooler
      rgb = c.rgb ? 'cooler' : null
      if (c.type === 'air') put(buildAirCooler(c, airCoolerFit(placed.pieces), kit), 'cooler:tower')
      else {
        const head = pieceMm(placed.pieces, 'cooler:head')
        const rad = pieceMm(placed.pieces, 'cooler:radiator')
        const mount = layout.radiator?.mount === 'front' ? 'front' : 'top'
        root.add(at(buildAioHead(c, kit), head, 'cooler:head'), at(buildRadiator(c, mount, kit), rad, 'cooler:radiator'), buildHoses(c, head, rad, mount, kit))
      }
      break
    }
  }
  root.visible = placed.visible
  noteModel(root, { category, id: placed.id, source: 'diagram' })
  return { category, id: placed.id, group: root, sidePanel, ownedMaterials, rgb }
}

/** 寸法・区画・選択色が変わったときだけ形を作り直す。 */
export function modelSignature(category: Category, b: ResolvedBuild, layout: Layout, look: Look): string {
  const placed = layout.parts[category]
  const anchor = placed.box.min
  const rel = placed.pieces.map((p) => [p.name, ...p.box.min.map((v, i) => round(v - anchor[i])), ...p.box.max.map((v, i) => round(v - anchor[i]))])
  const extra: unknown[] = []
  if (category === 'case') extra.push(look.caseColor, layout.structure, layout.planes, layout.parts.psu.box)
  if (category === 'psu') extra.push(layout.psuOrientation)
  if (category === 'cooler') extra.push(layout.radiator?.mount, b.cooler.type)
  return JSON.stringify([category, placed.id, rel, placed.visible, extra])
}
const round = (v: number) => Math.round(v * 1e7) / 1e7
