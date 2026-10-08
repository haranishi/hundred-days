/** 入力された構成を扱う純粋なカタログ関数。実製品データは同梱しない。 */
import type { Build, Catalog, Category, Part, PartByCategory, ResolvedBuild } from './types'
import { CATEGORIES } from './types'


export function listParts<K extends Category>(catalog: Catalog, category: K): PartByCategory[K][] {
  return catalog.parts[category]
}

export function findPart<K extends Category>(catalog: Catalog, category: K, id: string): PartByCategory[K] | undefined {
  return catalog.parts[category].find((p) => p.id === id)
}

export function getPart<K extends Category>(catalog: Catalog, category: K, id: string): PartByCategory[K] {
  const part = findPart(catalog, category, id)
  if (!part) throw new Error(`カタログに無い部品です: ${category} ${id}`)
  return part
}

export function findByShort<K extends Category>(catalog: Catalog, category: K, short: string): PartByCategory[K] | undefined {
  return catalog.parts[category].find((p) => p.short === short)
}

/** すべてのカテゴリの ID がカタログにあるか */
export function isKnownBuild(catalog: Catalog, build: Partial<Build>): build is Build {
  return CATEGORIES.every((c) => typeof build[c] === 'string' && findPart(catalog, c, build[c] as string) !== undefined)
}

export function resolveBuild(catalog: Catalog, build: Build): ResolvedBuild {
  const out = {} as Record<Category, Part>
  for (const c of CATEGORIES) out[c] = getPart(catalog, c, build[c])
  return out as ResolvedBuild
}

/** 1つのカテゴリだけ差し替えた構成 */
export function withPart(build: Build, category: Category, id: string): Build {
  return { ...build, [category]: id }
}

/** 部品の表示名（ブランド＋品名） */
export function partLabel(part: Part): string {
  return part.name.startsWith(part.brand) ? part.name : `${part.brand} ${part.name}`
}

/** 未確認の項目か（画面で「未確認」と出す） */
export function isUnverified(part: Part, field: string): boolean {
  return part.unverified.includes(field)
}
