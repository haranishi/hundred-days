// 答えあわせの地図。名所の緯度経度に印を付ける（日本の名所は日本の地図、世界の名所は世界の地図）。
// 陸地の線は tools/build-maps.mjs が作った paths.ts をそのまま使う。

import type { Landmark } from '../../shared/types'
import { s } from '../ui/dom'
import { JAPAN_MAP, WORLD_MAP, type MapData, type MapRegion } from './paths'

export { JAPAN_MAP, WORLD_MAP }

/** 地図の座標（viewBox の中）。枠の外の点は、見える範囲の端に寄せる */
export function projectPoint(map: MapData, lat: number, lon: number): { x: number; y: number } {
  const inside = (r: MapRegion): boolean => lon >= r.lonMin && lon <= r.lonMax && lat >= r.latMin && lat <= r.latMax
  const region = map.regions.find(inside) ?? map.regions[map.regions.length - 1]
  if (!region) return { x: map.width / 2, y: map.height / 2 }
  const x = region.ax * lon + region.bx
  const y = region.ay * lat + region.by
  const pad = 8
  return { x: Math.min(map.width - pad, Math.max(pad, x)), y: Math.min(map.height - pad, Math.max(pad, y)) }
}

export function mapFor(landmark: Pick<Landmark, 'scope'>): MapData {
  return landmark.scope === 'japan' ? JAPAN_MAP : WORLD_MAP
}

/** 名所の場所に印を付けた地図（SVG）。読み上げには「◯◯の場所を示す地図」と伝える */
export function createLocatorMap(landmark: Pick<Landmark, 'scope' | 'lat' | 'lon' | 'place' | 'name'>): SVGSVGElement {
  const map = mapFor(landmark)
  const { x, y } = projectPoint(map, landmark.lat, landmark.lon)
  // 世界の地図は横に広いので、印を大きめにする
  const r = map === WORLD_MAP ? 7 : 13
  const svg = s(
    'svg',
    {
      viewBox: `0 0 ${map.width} ${map.height}`,
      class: `locator-map ${map === WORLD_MAP ? 'is-world' : 'is-japan'}`,
      role: 'img',
      'aria-label': `${landmark.name}の場所（${landmark.place}）を示す地図`,
      preserveAspectRatio: 'xMidYMid meet',
      'data-x': x.toFixed(1),
      'data-y': y.toFixed(1),
    },
    s('rect', { class: 'map-sea', x: 0, y: 0, width: map.width, height: map.height }),
    s('path', { class: 'map-land', d: map.land, 'fill-rule': 'evenodd' }),
    map.frames ? s('path', { class: 'map-frame', d: map.frames }) : null,
    s(
      'g',
      { class: 'map-marker', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
      s('circle', { class: 'map-marker-pulse', r: r * 2.2 }),
      s('circle', { class: 'map-marker-dot', r }),
    ),
  )
  return svg
}
