/** 模式図の共通材質。メーカー固有の配色・表面模様・画像テクスチャを使わない。 */
import * as THREE from 'three'
import type { Severity } from '../../domain/types'

export type Role = 'paint' | 'paintInner' | 'glass' | 'rubber' | 'pcb' | 'substrate' | 'metal' | 'aluminum' | 'copper' | 'nickel' | 'plastic' | 'shroud' | 'accent' | 'dark' | 'gold' | 'radiator' | 'hose' | 'rim'
export type Tone = 'black' | 'white' | 'silver'
export type RgbChannel = 'case' | 'cooler' | 'memory' | 'gpu'
export type KitView = 'stage' | 'inspect'
export const RGB_CHANNELS: readonly RgbChannel[] = ['case', 'cooler', 'memory', 'gpu']

export interface MaterialKit {
  get(role: Role, tone?: Tone): THREE.Material
  rgb(channel: RgbChannel): THREE.Material
}

/** 白黒の分類だけを使用する。製品独自の差し色は再現しない。 */
export function tonesOf(color: string | undefined): { body: Tone; accent: Tone } {
  const tone = color?.toLowerCase().includes('white') ? 'white' : 'black'
  return { body: tone, accent: 'silver' }
}

const BODY_COLOR: Record<Tone, string> = { black: '#424751', white: '#dce1e9', silver: '#a6b0be' }
const METALS: Partial<Record<Role, string>> = { aluminum: '#a6b0be', nickel: '#b4becd', accent: '#99a9bb', copper: '#a6b0be', gold: '#b6a86b' }

function material(role: Role, tone: Tone, view: KitView): THREE.MeshStandardMaterial {
  const metal = METALS[role]
  const color = metal ?? (role === 'dark' || role === 'rubber' ? '#242932' : role === 'pcb' || role === 'substrate' ? '#586577' : BODY_COLOR[tone])
  const m = new THREE.MeshStandardMaterial({ color, metalness: metal || role === 'metal' ? 0.25 : 0.05, roughness: 0.7 })
  if (role === 'glass') {
    m.color.set('#a5b4c8')
    m.transparent = true
    m.opacity = 0.035
    m.depthWrite = false
    m.side = THREE.DoubleSide
  }
  // 暗い部品も輪郭が読めるよう、同じ材質ルールで補助する。
  if (view === 'inspect' && !m.transparent) m.userData.inspectEnv = 0.8
  m.name = `diagram:${role}:${tone}`
  return m
}

export function applyInspectEnvironment(root: THREE.Object3D, environment: THREE.Texture | null, intensity: number, rotation?: THREE.Euler): number {
  let changed = 0
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as THREE.MeshStandardMaterial
      if (!std.isMeshStandardMaterial || std.userData.inspectEnv === undefined) continue
      if (std.envMap !== environment) { std.envMap = environment; std.needsUpdate = true }
      std.envMapIntensity = intensity * Number(std.userData.inspectEnv)
      if (rotation) std.envMapRotation.copy(rotation)
      changed++
    }
  })
  return changed
}

/** 材質はキット内で共有し、キットを破棄するときだけ解放する。 */
export function createMaterialKit(view: KitView = 'stage'): MaterialKit & { view: KitView; rgbMaterials: Record<RgbChannel, THREE.MeshStandardMaterial>; dispose(): void } {
  const cache = new Map<string, THREE.Material>()
  const rgbMaterials = Object.fromEntries(RGB_CHANNELS.map((channel) => {
    const m = new THREE.MeshStandardMaterial({ color: '#e7eaf0', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.7 })
    m.userData.role = 'rgb'
    m.name = `diagram:rgb:${channel}`
    return [channel, m]
  })) as Record<RgbChannel, THREE.MeshStandardMaterial>
  return {
    view,
    rgbMaterials,
    get(role, tone = 'black') {
      const key = `${role}:${tone}`
      let m = cache.get(key)
      if (!m) { m = material(role, tone, view); cache.set(key, m) }
      return m
    },
    rgb: (channel) => rgbMaterials[channel],
    dispose() {
      for (const m of cache.values()) m.dispose()
      for (const m of Object.values(rgbMaterials)) m.dispose()
      cache.clear()
    },
  }
}

export const SEVERITY_COLORS: Record<Severity, string> = { ok: '#5aaeff', warn: '#ffa94d', error: '#ff6b4f' }
