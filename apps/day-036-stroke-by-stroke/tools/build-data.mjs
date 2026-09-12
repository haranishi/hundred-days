#!/usr/bin/env node
// KanjiVG の配布XMLから、画面が使う分だけを取り出して data/kvg/*.json を作る。
//
// 取り出すのは1画ごとの「種別（kvg:type）」と「パス（d）」だけ。KanjiVG が持つ
// 部首の入れ子・異体字（kvg:kanji_09038-Kaisho のような id）・要素名は使わない。
//
// 座標は小数1桁に丸める。KanjiVG は相対座標（c コマンド）なので、単純に丸めると
// 誤差が画の終端まで積み上がる。丸めで出た端数を次の座標へ繰り越して、現在位置が
// ずれないようにしている。仕上げに元のパスと曲線を突き合わせて、ずれが 0.25 単位
// （109四方の 0.23%＝360pxで1px弱）を超えていないことを確かめる。
//
// 出典とライセンスは data/SOURCES.md。派生データなので CC BY-SA 3.0 のまま。
//
// 使い方: node tools/build-data.mjs [--xml <path>]

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(HERE, '..')
const OUT = path.join(APP, 'data', 'kvg')
const RELEASE = 'r20250816'
const XML_URL = `https://github.com/KanjiVG/kanjivg/releases/download/${RELEASE}/kanjivg-20250816.xml.gz`
const CACHE = path.join(APP, 'tools', '.cache', 'kanjivg.xml')

// KanjiVG が使うコマンドはこの3種だけ。ほかが出たら黙って壊れるより落とす。
const GROUP = { m: 2, c: 6, s: 4 }
const MAX_DRIFT = 0.25 // 実測の最大は 0.188（79,907画中）

export function tokenizePath(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || []
  const out = []
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i++]
    const size = GROUP[cmd.toLowerCase()]
    if (!size) throw new Error(`扱えないコマンド: ${cmd} in ${d}`)
    const groups = []
    while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
      const g = tokens.slice(i, i + size).map(Number)
      if (g.length < size || g.some((n) => !Number.isFinite(n))) {
        throw new Error(`引数の数が合わない: ${cmd} in ${d}`)
      }
      groups.push(g)
      i += size
    }
    if (!groups.length) throw new Error(`引数がない: ${cmd} in ${d}`)
    out.push({ cmd, groups })
  }
  return out
}

function fmt(v, decimals) {
  let t = v.toFixed(decimals).replace(/\.?0+$/, '')
  if (t === '' || t === '-' || t === '-0') t = '0'
  return t.replace(/^(-?)0\./, '$1.')
}

// 「-」と、小数点を持つ数のあとの「.」は、それ自体が区切りになる。
function joinNumbers(nums, decimals) {
  let out = ''
  let prev = ''
  for (const n of nums) {
    const t = fmt(n, decimals)
    if (out !== '') {
      const glue = t.startsWith('-') || (t.startsWith('.') && prev.includes('.'))
      if (!glue) out += ','
    }
    out += t
    prev = t
  }
  return out
}

export function minifyPath(d, decimals = 1) {
  let out = ''
  // 丸めの端数（x, y）。相対コマンドの終点にだけ繰り越す。
  let carry = [0, 0]
  for (const { cmd, groups } of tokenizePath(d)) {
    const relative = cmd === cmd.toLowerCase()
    const size = GROUP[cmd.toLowerCase()]
    const nums = []
    for (const g of groups) {
      for (let k = 0; k < size; k++) {
        const axis = k === size - 2 ? 0 : k === size - 1 ? 1 : -1
        if (relative && axis >= 0) {
          const target = g[k] + carry[axis]
          const r = Number(fmt(target, decimals))
          carry[axis] = target - r
          nums.push(r)
        } else {
          nums.push(Number(fmt(g[k], decimals)))
        }
      }
    }
    if (!relative) carry = [0, 0]
    out += cmd + joinNumbers(nums, decimals)
  }
  return out
}

// 検算用。M/m/C/c/S/s だけを解いて、曲線上の点を等間隔（媒介変数）で拾う。
export function samplePath(d, perSegment = 12) {
  const points = []
  let cur = [0, 0]
  let start = [0, 0]
  let prevCtrl = null
  const cubic = (p0, p1, p2, p3) => {
    for (let i = 1; i <= perSegment; i++) {
      const t = i / perSegment
      const u = 1 - t
      points.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ])
    }
  }
  for (const { cmd, groups } of tokenizePath(d)) {
    const rel = cmd === cmd.toLowerCase()
    const at = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y])
    for (const g of groups) {
      if (cmd.toLowerCase() === 'm') {
        cur = at(g[0], g[1])
        start = cur
        points.push(cur)
        prevCtrl = null
      } else if (cmd.toLowerCase() === 'c') {
        const p1 = at(g[0], g[1])
        const p2 = at(g[2], g[3])
        const p3 = at(g[4], g[5])
        cubic(cur, p1, p2, p3)
        prevCtrl = p2
        cur = p3
      } else {
        const p1 = prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur
        const p2 = at(g[0], g[1])
        const p3 = at(g[2], g[3])
        cubic(cur, p1, p2, p3)
        prevCtrl = p2
        cur = p3
      }
    }
  }
  void start
  return points
}

export function maxDrift(a, b) {
  const pa = samplePath(a)
  const pb = samplePath(b)
  if (pa.length !== pb.length) return Infinity
  let worst = 0
  for (let i = 0; i < pa.length; i++) {
    worst = Math.max(worst, Math.hypot(pa[i][0] - pb[i][0], pa[i][1] - pb[i][1]))
  }
  return worst
}

// 画の並び順は XML の出現順がそのまま筆順。入れ子の g は無視してよい。
export function parseKanjiVG(xml) {
  const out = new Map()
  const re = /<kanji id="kvg:kanji_([0-9a-f]+)(-[^"]*)?">([\s\S]*?)<\/kanji>/g
  let m
  while ((m = re.exec(xml))) {
    if (m[2]) continue
    const strokes = []
    const pathRe = /<path[^>]*?>/g
    let p
    while ((p = pathRe.exec(m[3]))) {
      const d = p[0].match(/ d="([^"]+)"/)
      if (!d) continue
      const type = p[0].match(/kvg:type="([^"]+)"/)
      strokes.push([type ? type[1] : '', d[1]])
    }
    if (strokes.length) out.set(parseInt(m[1], 16), strokes)
  }
  return out
}

// シャード名は符号位置の上位バイト。画面側も同じ式で求めるので索引はいらない。
export function shardName(codePoint) {
  return (codePoint >> 8).toString(16).padStart(2, '0')
}

async function readXml(given) {
  if (given) return fs.readFileSync(given, 'utf8')
  if (fs.existsSync(CACHE)) return fs.readFileSync(CACHE, 'utf8')
  process.stdout.write(`KanjiVG ${RELEASE} を取得中...\n`)
  const res = await fetch(XML_URL)
  if (!res.ok) throw new Error(`XMLを取得できない: ${res.status}`)
  const xml = zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8')
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, xml)
  return xml
}

async function main() {
  const i = process.argv.indexOf('--xml')
  const xml = await readXml(i > -1 ? process.argv[i + 1] : null)
  const chars = parseKanjiVG(xml)

  const shards = new Map()
  let worst = { drift: 0, cp: 0 }
  let strokes = 0
  for (const [cp, list] of chars) {
    const packed = list.map(([type, d]) => {
      const small = minifyPath(d)
      const drift = maxDrift(d, small)
      if (drift > worst.drift) worst = { drift, cp }
      if (drift > MAX_DRIFT) {
        throw new Error(`丸めのずれが大きい: U+${cp.toString(16)} ${drift.toFixed(3)}`)
      }
      return [type, small]
    })
    strokes += packed.length
    const name = shardName(cp)
    if (!shards.has(name)) shards.set(name, {})
    shards.get(name)[cp.toString(16)] = packed
  }

  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })
  let bytes = 0
  let biggest = 0
  const names = [...shards.keys()].sort()
  for (const name of names) {
    const json = JSON.stringify(shards.get(name))
    fs.writeFileSync(path.join(OUT, `${name}.json`), json)
    bytes += json.length
    biggest = Math.max(biggest, json.length)
  }
  /* どのファイルが在るかの索引。無い字のために404を出しに行かないで済む。 */
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ release: RELEASE, shards: names }))
  process.stdout.write(
    `${chars.size}字 / ${strokes}画 → ${shards.size}ファイル ` +
      `計${(bytes / 1048576).toFixed(2)}MB 最大${(biggest / 1024).toFixed(0)}KB ` +
      `丸めの最大ずれ${worst.drift.toFixed(3)}（U+${worst.cp.toString(16)}）\n`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(String(e && e.stack ? e.stack : e) + '\n')
    process.exit(1)
  })
}
