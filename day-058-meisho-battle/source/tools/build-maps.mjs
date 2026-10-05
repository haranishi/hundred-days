// 答えあわせの地図を作る。Natural Earth（npm の world-atlas）の陸地を、SVG の path にして
// src/client/map/paths.ts に書き出す。地図を作り直すときだけ手で走らせる：node tools/build-maps.mjs
//
// - 日本の地図：北海道〜九州と周りの陸地（国境は描かない）。沖縄・奄美の島々は右下の枠に入れる
// - 世界の地図：南極を除いた陸地（正距円筒図法。経度と緯度をそのまま横と縦にする）
// - どちらも経度・緯度から画面の座標へは1次式で写せる。印を付ける側（map-view.ts）は、ここで書き出した係数だけを使う
// - 国境を描かないのは、境界の扱いが分かれる場所（北方領土など）で、どちらかの立場を描かないため
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const topojson = require('topojson-client')
const land50 = require('world-atlas/land-50m.json')
const land110 = require('world-atlas/land-110m.json')

const OUT = resolve(import.meta.dirname, '../src/client/map/paths.ts')
const DEG = Math.PI / 180

/** 陸地の多角形の一覧。多角形は輪の配列、輪は [経度, 緯度] の配列 */
function landPolygons(topology) {
  const geo = topojson.feature(topology, topology.objects.land)
  const features = geo.type === 'FeatureCollection' ? geo.features : [geo]
  const out = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') out.push(g.coordinates)
    else if (g.type === 'MultiPolygon') out.push(...g.coordinates)
  }
  return out
}

/** 輪を長方形で切り取る（Sutherland–Hodgman）。経度・緯度のまま切る（写し方が1次式なので同じ結果になる） */
function clipRing(ring, box) {
  let pts = ring.slice(0, -1) // GeoJSON の輪は最初と最後が同じ点
  const edges = [
    [(p) => p[0] >= box.lonMin, (a, b) => crossX(a, b, box.lonMin)],
    [(p) => p[0] <= box.lonMax, (a, b) => crossX(a, b, box.lonMax)],
    [(p) => p[1] >= box.latMin, (a, b) => crossY(a, b, box.latMin)],
    [(p) => p[1] <= box.latMax, (a, b) => crossY(a, b, box.latMax)],
  ]
  for (const [inside, cross] of edges) {
    if (pts.length === 0) break
    const next = []
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]
      const prev = pts[(i + pts.length - 1) % pts.length]
      const curIn = inside(cur)
      const prevIn = inside(prev)
      if (curIn) {
        if (!prevIn) next.push(cross(prev, cur))
        next.push(cur)
      } else if (prevIn) {
        next.push(cross(prev, cur))
      }
    }
    pts = next
  }
  return pts
}

function crossX(a, b, x) {
  const t = (x - a[0]) / (b[0] - a[0])
  return [x, a[1] + (b[1] - a[1]) * t]
}

function crossY(a, b, y) {
  const t = (y - a[1]) / (b[1] - a[1])
  return [a[0] + (b[0] - a[0]) * t, y]
}

/** 点の列を Douglas–Peucker で間引く（閉じた輪として扱う） */
function simplify(pts, tol) {
  if (pts.length <= 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [s, e] = stack.pop()
    let best = -1
    let bestD = tol
    const [ax, ay] = pts[s]
    const [bx, by] = pts[e]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i]
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (d > bestD) {
        best = i
        bestD = d
      }
    }
    if (best >= 0) {
      keep[best] = 1
      stack.push([s, best], [best, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

function area(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** 経度・緯度の長方形を、画面の長方形へ1次式で写す係数 */
function linearProjection(box, k, lat0, offsetX, offsetY) {
  const kx = k * Math.cos(lat0 * DEG)
  // x = ax * lon + bx、y = ay * lat + by
  return { ax: kx, bx: offsetX - kx * box.lonMin, ay: -k, by: offsetY + k * box.latMax }
}

function project(p, proj) {
  return [proj.ax * p[0] + proj.bx, proj.ay * p[1] + proj.by]
}

/**
 * 日付変更線（経度±180）をまたぐ輪は、world-atlas ではつながったまま（180 から -180 へ飛ぶ）なので、
 * 飛びをなくして続けた輪にしてから、はみ出した側を360度ずらした写しも作る。それぞれを長方形で切れば左右に分かれる
 */
function wrappedCopies(ring) {
  const out = [ring[0].slice()]
  let offset = 0
  for (let i = 1; i < ring.length; i++) {
    const d = ring[i][0] - ring[i - 1][0]
    if (d > 180) offset -= 360
    else if (d < -180) offset += 360
    out.push([ring[i][0] + offset, ring[i][1]])
  }
  let lonMin = Infinity
  let lonMax = -Infinity
  for (const [lon] of out) {
    lonMin = Math.min(lonMin, lon)
    lonMax = Math.max(lonMax, lon)
  }
  const copies = [out]
  if (lonMax > 180) copies.push(out.map(([lon, lat]) => [lon - 360, lat]))
  if (lonMin < -180) copies.push(out.map(([lon, lat]) => [lon + 360, lat]))
  return copies
}

/** 多角形の一覧を、長方形で切って写し、間引いて path の文字列にする */
function toPath(polygons, box, proj, tol, minArea) {
  let d = ''
  let rings = 0
  for (const poly of polygons) {
    for (const ring of poly.flatMap(wrappedCopies)) {
      // 長方形と重ならない輪は先に捨てる
      let lonMin = Infinity
      let lonMax = -Infinity
      let latMin = Infinity
      let latMax = -Infinity
      for (const [lon, lat] of ring) {
        lonMin = Math.min(lonMin, lon)
        lonMax = Math.max(lonMax, lon)
        latMin = Math.min(latMin, lat)
        latMax = Math.max(latMax, lat)
      }
      if (lonMax < box.lonMin || lonMin > box.lonMax || latMax < box.latMin || latMin > box.latMax) continue
      const clipped = clipRing(ring, box)
      if (clipped.length < 3) continue
      const projected = simplify(
        clipped.map((p) => project(p, proj)),
        tol,
      )
      // 整数に丸め、同じ点の続きを消す
      const pts = []
      for (const [x, y] of projected) {
        const q = [Math.round(x), Math.round(y)]
        const last = pts[pts.length - 1]
        if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q)
      }
      if (pts.length >= 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop()
      if (pts.length < 3 || Math.abs(area(pts)) < minArea) continue
      d += `M${pts[0][0]} ${pts[0][1]}`
      let prev = pts[0]
      let seg = 'l'
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - prev[0]
        const dy = pts[i][1] - prev[1]
        seg += `${i > 1 && dx >= 0 ? ' ' : ''}${dx}${dy >= 0 ? ' ' : ''}${dy}`
        prev = pts[i]
      }
      d += `${seg}z`
      rings++
    }
  }
  return { d, rings }
}

// ── 日本の地図 ──

/** 本土の枠（北海道〜九州。東は択捉島まで入れて、右下の海に沖縄の枠を置く） */
const JP_MAIN = { lonMin: 128.6, lonMax: 149.0, latMin: 30.0, latMax: 45.8 }
const JP_K = 48
const JP_LAT0 = 38
/** 沖縄・奄美の枠（右下に置く） */
const JP_INSET = { lonMin: 122.8, lonMax: 131.4, latMin: 24.0, latMax: 29.4 }
const JP_INSET_K = 36
const JP_INSET_LAT0 = 26.5

function japanMap() {
  const polys = landPolygons(land50)
  const mainProj = linearProjection(JP_MAIN, JP_K, JP_LAT0, 0, 0)
  const width = Math.round(mainProj.ax * JP_MAIN.lonMax + mainProj.bx)
  const height = Math.round(mainProj.ay * JP_MAIN.latMin + mainProj.by)
  const insetW = Math.round(JP_INSET_K * Math.cos(JP_INSET_LAT0 * DEG) * (JP_INSET.lonMax - JP_INSET.lonMin))
  const insetH = Math.round(JP_INSET_K * (JP_INSET.latMax - JP_INSET.latMin))
  const margin = 14
  const ix = width - insetW - margin
  const iy = height - insetH - margin
  const insetProj = linearProjection(JP_INSET, JP_INSET_K, JP_INSET_LAT0, ix, iy)
  const main = toPath(polys, JP_MAIN, mainProj, 0.7, 1.5)
  const inset = toPath(polys, JP_INSET, insetProj, 0.6, 1)
  return {
    width,
    height,
    land: main.d + inset.d,
    frames: `M${ix - 6} ${iy - 6}h${insetW + 12}v${insetH + 12}h${-(insetW + 12)}z`,
    // 先に枠の中（沖縄）を調べ、どれにも入らなければ本土の写し方を使う
    regions: [
      { ...JP_INSET, proj: insetProj },
      { ...JP_MAIN, proj: mainProj },
    ],
    rings: main.rings + inset.rings,
  }
}

// ── 世界の地図 ──

const WORLD = { lonMin: -180, lonMax: 180, latMin: -58, latMax: 84 }
const WORLD_K = 2.5

function worldMap() {
  const polys = landPolygons(land110)
  const proj = linearProjection(WORLD, WORLD_K, 0, 0, 0)
  const width = Math.round(proj.ax * WORLD.lonMax + proj.bx)
  const height = Math.round(proj.ay * WORLD.latMin + proj.by)
  const land = toPath(polys, WORLD, proj, 0.35, 0.6)
  return { width, height, land: land.d, frames: '', regions: [{ ...WORLD, proj }], rings: land.rings }
}

function round(v) {
  return Math.round(v * 1e6) / 1e6
}

function emit(name, m) {
  const regions = m.regions
    .map(
      (r) =>
        `    { lonMin: ${r.lonMin}, lonMax: ${r.lonMax}, latMin: ${r.latMin}, latMax: ${r.latMax}, ax: ${round(r.proj.ax)}, bx: ${round(r.proj.bx)}, ay: ${round(r.proj.ay)}, by: ${round(r.proj.by)} },`,
    )
    .join('\n')
  return `export const ${name}: MapData = {
  width: ${m.width},
  height: ${m.height},
  regions: [
${regions}
  ],
  frames: ${JSON.stringify(m.frames)},
  land: ${JSON.stringify(m.land)},
}
`
}

const jp = japanMap()
const world = worldMap()
const src = `// ⚠️ tools/build-maps.mjs が作るファイル。手で直さない（作り直す：node tools/build-maps.mjs）。
// 地図のもと：Natural Earth（パブリックドメイン）を npm の world-atlas（ISC）経由で使う。
// 日本は 1:50m の陸地、世界は 1:110m の陸地。国境は描かない。

/** 経度・緯度の長方形と、その中の点を地図の座標へ写す1次式（x = ax × 経度 + bx、y = ay × 緯度 + by） */
export interface MapRegion {
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
  ax: number
  bx: number
  ay: number
  by: number
}

export interface MapData {
  /** viewBox の幅と高さ */
  width: number
  height: number
  /** 先に並んだ長方形から調べる。どれにも入らない点は最後の長方形の式で写す */
  regions: MapRegion[]
  /** 別の枠（沖縄など）の囲み線 */
  frames: string
  /** 陸地の path（塗りは evenodd） */
  land: string
}

${emit('JAPAN_MAP', jp)}
${emit('WORLD_MAP', world)}`

writeFileSync(OUT, src)
console.log(`日本：${jp.width}×${jp.height}・輪 ${jp.rings} 個・${jp.land.length} 文字`)
console.log(`世界：${world.width}×${world.height}・輪 ${world.rings} 個・${world.land.length} 文字`)
console.log(`書き出し：${OUT}`)
