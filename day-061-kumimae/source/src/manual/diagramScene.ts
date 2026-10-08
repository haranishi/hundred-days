import * as THREE from 'three'
import { layoutBuild, type Box } from '../domain/layout'
import { CATEGORIES, type Category, type ResolvedBuild } from '../domain/types'
import { buildPartModel, type PartModel } from '../three/assemble'
import { disposeObject } from '../three/models/geometry'
import { createMaterialKit } from '../three/models/materials'

/** 汎用の分解図で部品を分ける距離。外寸や互換性の計算には含めない。 */
const EXPLODE_MM: Record<Category, number> = { case: 0, motherboard: 40, cpu: 110, cooler: 220, memory: 150, gpu: 300, storage: 80, psu: 380 }

/** 入力済み寸法からだけ作る図形。製品カタログ・状態ストア・外部モデルを参照しない。 */
export function createDiagramScene(build: ResolvedBuild, color: 'white' | 'black') {
  const layout = layoutBuild(build)
  const kit = createMaterialKit()
  const root = new THREE.Group()
  root.name = 'manual:dimension-diagram'
  root.scale.setScalar(0.001)
  const parts = new Map<Category, PartModel>()
  let selection: THREE.Group | null = null
  let selectionMaterial: THREE.LineBasicMaterial | null = null
  let selected: Category = 'case'
  let disposed = false
  try {
    for (const category of CATEGORIES) {
      const model = buildPartModel(category, build, layout, { caseColor: color, rgbColor: 'b79aff', rgbMode: 'static' }, kit)
      parts.set(category, model)
      root.add(model.group)
    }
  } catch (error) {
    for (const model of parts.values()) { disposeObject(model.group); model.ownedMaterials.forEach((m) => m.dispose()) }
    kit.dispose()
    throw error
  }

  const clearSelection = () => {
    if (!selection) return
    selection.removeFromParent()
    disposeObject(selection)
    selectionMaterial?.dispose()
    selection = null
    selectionMaterial = null
  }
  return {
    root,
    layout,
    parts,
    select(category: Category) {
      clearSelection()
      selected = category
      selection = new THREE.Group()
      selection.name = 'manual:selected-part'
      const material = new THREE.LineBasicMaterial({ color: '#c5afff', depthTest: false, transparent: true, opacity: 0.95 })
      selectionMaterial = material
      const boxes = category === 'case' ? [layout.caseBox] : layout.parts[category].pieces.map((p) => p.box)
      for (const box of boxes) {
        const geometry = boxEdges(box)
        const line = new THREE.LineSegments(geometry, material)
        line.renderOrder = 10
        selection.add(line)
      }
      selection.position.copy(parts.get(category)!.group.position)
      root.add(selection)
    },
    explode(active: boolean) {
      for (const [category, model] of parts) {
        model.group.position.x = active ? EXPLODE_MM[category] : 0
        model.group.position.z = active && category === 'psu' ? 170 : 0
        if (model.sidePanel) model.sidePanel.visible = !active
      }
      if (selection) selection.position.copy(parts.get(selected)!.group.position)
      root.updateMatrixWorld(true)
    },
    bounds() {
      root.updateMatrixWorld(true)
      return new THREE.Box3().setFromObject(root)
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearSelection()
      for (const model of parts.values()) {
        disposeObject(model.group)
        model.ownedMaterials.forEach((m) => m.dispose())
      }
      root.clear()
      kit.dispose()
    },
  }
}

function boxEdges(box: Box): THREE.EdgesGeometry {
  const size = box.max.map((v, i) => (v - box.min[i]) * 1000)
  const body = new THREE.BoxGeometry(size[0], size[1], size[2])
  const geometry = new THREE.EdgesGeometry(body)
  body.dispose()
  geometry.translate(...box.min.map((v, i) => (v + box.max[i]) * 500) as [number, number, number])
  return geometry
}

/** 球が縦横どちらの画角にも収まる距離。ケース変更・分解・縦画面で同じ尺度を使う。 */
export function diagramCameraFit(bounds: THREE.Box3, aspect: number, verticalFov = 42) {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  const vertical = THREE.MathUtils.degToRad(verticalFov)
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(0.1, aspect))
  const distance = Math.max(0.25, sphere.radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.12)
  return { center: sphere.center, radius: sphere.radius, distance }
}
