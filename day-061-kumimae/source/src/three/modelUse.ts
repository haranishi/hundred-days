/**
 * いま作ってある寸法模式図の記録。
 * 単体テストで模式図の生成・破棄と、モデル記録の増え続けを確かめるため。
 * 形を作ったときに noteModel、捨てたとき（geometry.ts の disposeObject）に forgetModels で消す。
 */
import type * as THREE from 'three'
import type { Category } from '../domain/types'

export type ModelSource = 'diagram'

export interface ModelUse {
  category: Category
  id: string
  source: ModelSource
}

const uses = new Map<THREE.Object3D, ModelUse>()
export function noteModel(root: THREE.Object3D, info: ModelUse): void {
  uses.set(root, info)
}

/** root の中で記録した形を消す（捨てたとき） */
export function forgetModels(root: THREE.Object3D): void {
  if (uses.size === 0) return
  root.traverse((o) => {
    uses.delete(o)
  })
}

export function modelUses(): ModelUse[] {
  return [...uses.values()]
}

/** root の中で記録した形（単体テストで、作った部品の形の出どころを確かめる） */
export function modelUseIn(root: THREE.Object3D): ModelUse | null {
  let found: ModelUse | null = null
  root.traverse((o) => {
    found ??= uses.get(o) ?? null
  })
  return found
}
