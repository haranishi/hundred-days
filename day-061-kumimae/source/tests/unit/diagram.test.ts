import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EXAMPLES, FIELDS, evaluateInput } from '../../src/domain/manual'
import { CATEGORIES, type ResolvedBuild } from '../../src/domain/types'
import { cpuPackageMm } from '../../src/domain/layout'
import { createDiagramScene, diagramCameraFit } from '../../src/manual/diagramScene'
import { measuredBox } from '../../src/three/models/geometry'
import { modelUses } from '../../src/three/modelUse'

const round = (n: number) => Math.round(n * 1000) / 1000
const expectVectorNear = (actual: number[], expected: number[]) => actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 7))
const exampleBuild = (index = 0): ResolvedBuild => {
  const result = evaluateInput(EXAMPLES[index]!.values)
  if (!result.resolved) throw new Error('合成例の寸法を描画できません')
  return result.resolved
}
afterEach(() => vi.unstubAllGlobals())

describe('手入力仕様の寸法模式図', () => {
  it('CPUはソケット名によらず模式図用の40mm角で示す', () => {
    expect(cpuPackageMm('socket-a')).toEqual({ u: 40, v: 40 })
    expect(cpuPackageMm('socket-b')).toEqual({ u: 40, v: 40 })
  })
  it.each(FIELDS.filter((field) => field.unit === 'mm').flatMap((field) => [field.min!, field.max!].map((value) => ({ key: field.key, category: field.category, value }))))('入力範囲の端でも外寸を保った有限な図形になる: $key=$value', ({ key, category, value }) => {
    const result = evaluateInput({ ...EXAMPLES[0]!.values, [key]: String(value) })
    if (!result.resolved) { expect(Object.keys(result.errors).length).toBeGreaterThan(0); return }
    const scene = createDiagramScene(result.resolved, 'white')
    try {
      const bounds = scene.bounds()
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true)
      const actual = measuredBox(scene.parts.get(category)!.group)
      const expected = scene.layout.parts[category].box
      expectVectorNear(actual.min.toArray(), expected.min)
      expectVectorNear(actual.max.toArray(), expected.max)
      scene.root.traverse((object) => {
        const positions = (object as THREE.Mesh).geometry?.getAttribute('position')
        if (positions) expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
      })
    } finally { scene.dispose() }
  })
  it.each(['min', 'max'] as const)('全寸法を同時に%sにしても描画・選択・分解できる', (edge) => {
    const values = { ...EXAMPLES[0]!.values }
    for (const field of FIELDS.filter((field) => field.unit === 'mm')) values[field.key] = String(field[edge])
    const result = evaluateInput(values)
    expect(result.resolved).not.toBeNull()
    const scene = createDiagramScene(result.resolved!, 'white')
    try {
      scene.explode(true)
      for (const category of CATEGORIES) scene.select(category)
      expect([...scene.bounds().min.toArray(), ...scene.bounds().max.toArray()].every(Number.isFinite)).toBe(true)
    } finally { scene.dispose() }
  })
  it.each(CATEGORIES)('%sの表示外形は配置・互換性判定の箱と一致する', (category) => {
    const scene = createDiagramScene(exampleBuild(), 'white')
    try {
      const actual = measuredBox(scene.parts.get(category)!.group)
      const expected = scene.layout.parts[category].box
      expectVectorNear(actual.min.toArray(), expected.min)
      expectVectorNear(actual.max.toArray(), expected.max)
    } finally { scene.dispose() }
  })

  it('ケースに入らないGPUも縮めず、入力した長さと不足分を目で確かめられる', () => {
    const build = exampleBuild(1)
    const scene = createDiagramScene(build, 'black')
    try {
      const gpu = measuredBox(scene.parts.get('gpu')!.group)
      expect((gpu.max.z - gpu.min.z) * 1000).toBeCloseTo(build.gpu.dimensionsMm.length, 5)
      expect((gpu.max.z - scene.layout.planes.gpuFrontZ) * 1000).toBeCloseTo(40, 5)
    } finally { scene.dispose() }
  })

  it('分解・選択・復元を繰り返しても寸法を変えず、選択枠も部品に追従する', () => {
    const scene = createDiagramScene(exampleBuild(), 'white')
    try {
      const initial = scene.bounds().clone()
      scene.select('gpu')
      const original = measuredBox(scene.parts.get('gpu')!.group).getSize(new THREE.Vector3())
      scene.explode(true)
      const gpu = scene.parts.get('gpu')!.group
      const outline = scene.root.getObjectByName('manual:selected-part')!
      expect(outline.position).toEqual(gpu.position)
      expect(gpu.position.x).toBeGreaterThan(0)
      expect(measuredBox(gpu).getSize(new THREE.Vector3()).distanceTo(original)).toBeLessThan(0.000001)
      expect(scene.parts.get('case')!.sidePanel!.visible).toBe(false)
      scene.select('cpu')
      scene.explode(false)
      expect(scene.parts.get('case')!.sidePanel!.visible).toBe(true)
      expect(scene.root.getObjectsByProperty('name', 'manual:selected-part')).toHaveLength(1)
      expect(scene.bounds().min.distanceTo(initial.min)).toBeLessThan(0.000001)
      expect(scene.bounds().max.distanceTo(initial.max)).toBeLessThan(0.000001)
    } finally { scene.dispose() }
  })

  it('ブランド名・製品名・IDが変わっても形や材質を分岐しない', () => {
    const build = exampleBuild()
    const renamed = structuredClone(build)
    for (const category of CATEGORIES) {
      renamed[category].id = `another-${category}`
      renamed[category].brand = '任意のメーカー'
      renamed[category].name = '任意の製品名'
    }
    const before = createDiagramScene(build, 'white')
    const after = createDiagramScene(renamed, 'white')
    try { expect(fingerprint(after.root)).toEqual(fingerprint(before.root)) }
    finally { before.dispose(); after.dispose() }
  })

  it('選択を含む生成物・材質・モデル記録を破棄でき、再生成で増え続けない', () => {
    const previous = modelUses().length
    const scene = createDiagramScene(exampleBuild(), 'black')
    scene.select('memory')
    const disposals: string[] = []
    scene.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.addEventListener('dispose', () => disposals.push('geometry'))
    })
    expect(modelUses().length).toBe(previous + 8)
    scene.dispose()
    expect(disposals.length).toBeGreaterThan(8)
    expect(modelUses()).toHaveLength(previous)
    const n = disposals.length
    scene.dispose()
    expect(disposals).toHaveLength(n)
  })

  it('生成・部品選択・分解にネットワークや外部モデルを使用しない', () => {
    const fetch = vi.fn(() => { throw new Error('模式図に外部通信は不要です') })
    vi.stubGlobal('fetch', fetch)
    const scene = createDiagramScene(exampleBuild(), 'white')
    try { scene.select('gpu'); scene.explode(true); scene.select('psu'); scene.explode(false) }
    finally { scene.dispose() }
    expect(fetch).not.toHaveBeenCalled()
    const dir = resolve('src/three')
    expect(existsSync(resolve(dir, 'productModels.ts'))).toBe(false)
    const source = walk(dir).filter((p) => /\.(ts|tsx)$/.test(p)).map((p) => readFileSync(p, 'utf8')).join('\n')
    expect(source).not.toMatch(/GLTFLoader|loadAsync|parseProductModel|registerProductScene/)
  })

  it.each([0.5, 1, 2])('画角比%sでモデル全体が視野へ収まる距離を取る', (aspect) => {
    const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 0.5, 0.48))
    const fit = diagramCameraFit(bounds, aspect)
    const vertical = THREE.MathUtils.degToRad(42)
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect)
    expect(fit.distance * Math.sin(Math.min(vertical, horizontal) / 2)).toBeGreaterThan(fit.radius)
    expect(fit.center).toEqual(bounds.getCenter(new THREE.Vector3()))
  })
})

function fingerprint(root: THREE.Object3D): unknown[] {
  const meshes: unknown[] = []
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    meshes.push([Array.from(mesh.geometry.getAttribute('position').array).map(round), mat.map((m) => m.name), mesh.matrixWorld.elements.map(round)])
  })
  return meshes
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)])
}
