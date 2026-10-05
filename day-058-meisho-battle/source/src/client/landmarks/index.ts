// One model per file. Only the requested model module is downloaded.
import { buildModel, type LandmarkBuilder, type LandmarkModel } from './kit'
import { build as title } from './title'

const modules = import.meta.glob<{ build?: LandmarkBuilder }>(['./*.ts', '!./title.ts', '!./kit.ts', '!./index.ts', '!./_*.ts'])
const NOT_LANDMARKS = new Set(['kit', 'index', 'title'])
const paths = new Map(Object.keys(modules).flatMap(path => {
  const id = path.replace(/^\.\//, '').replace(/\.ts$/, '')
  return NOT_LANDMARKS.has(id) || id.startsWith('_') ? [] : [[id, path] as const]
}))
const builders = new Map<string, LandmarkBuilder>([['title', title]])
const pending = new Map<string, Promise<void>>()
export const MODELED_IDS: readonly string[] = [...paths.keys(), 'title'].sort()
export function hasModel(id: string): boolean { return id === 'title' || paths.has(id) }

/** Share concurrent requests, retry failed downloads; no GPU geometry is cached. */
export async function preloadLandmark(id: string): Promise<void> {
  if (builders.has(id)) return
  const path = paths.get(id)
  if (!path) return
  let request = pending.get(id)
  if (!request) {
    request = modules[path]!().then(mod => {
      if (typeof mod.build !== 'function') throw new Error(`${path}: build(kit) missing`)
      builders.set(id, mod.build)
    }).finally(() => pending.delete(id))
    pending.set(id, request)
  }
  await request
}

/** Call preloadLandmark first. An unloaded known model must never silently be a blank quiz. */
export function buildLandmark(id: string): LandmarkModel | null {
  const builder = builders.get(id)
  if (!builder && hasModel(id)) throw new Error(`Model not loaded: ${id}`)
  return builder ? buildModel(id, builder) : null
}
