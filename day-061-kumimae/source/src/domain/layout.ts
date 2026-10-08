/**
 * 入力寸法からケースの中に部品を模式的に置く。すべて純粋関数。
 *
 * 座標: 原点はケース外形の「右側面・底面・背面」の角。+x＝ガラス側、+y＝上、+z＝前面。
 * 計算は mm で行い、外へ出す箱は m（1 = 1m）にする。
 *
 * ケース内部の面を入力された収容上限から逆算する。
 *   マザーボード表面 x = W − t − 最大クーラー高 ／ GPU 前方の障害面 z = t + 最大GPU長 ／ 電源室の前端 z = t + 最大電源長
 * こうすると「数値の判定（compat.ts）」と「3Dの箱」が作りの段階で一致する。
 */
import type {
  AioCooler,
  AirCooler,
  CaseLayoutKind,
  Category,
  FanMountPosition,
  FormFactor,
  Motherboard,
  PcCase,
  Psu,
  RadiatorPosition,
  ResolvedBuild,
} from './types'
import { CATEGORIES } from './types'
import { formatMm as fmt } from './format'

export type Vec3 = [number, number, number]
export interface Box {
  min: Vec3
  max: Vec3
}

export const MM_TO_M = 0.001

/** 模式図の基準値（mm）。実製品の取付寸法や外観を再現するものではない */
export const LAYOUT_MM = {
  /** 板厚 t */
  panel: 4,
  /** 足の高さ（外形の高さに含む） */
  foot: 20,
  /** standard: シュラウド上面 = 足 + 電源の高さ + 30 */
  shroudAbovePsu: 30,
  /** standard: マザーボード下端 = シュラウド上面 + 10 */
  mbAboveShroud: 10,
  /** マザーボード上端は「天面の内面 − 10」まで。超えたら異常 */
  mbTopMargin: 10,
  /** dual-chamber: 底面ファン（またはラジエーター）の空間 */
  dualBottomSpace: 35,
  /** dual-chamber: 底面ファンの厚み */
  dualBottomFan: 25,
  /** dual-chamber: 電源室の幅がこれ以上なら電源を寝かせる */
  psuFlatMinChamber: 160,
  /** 基板の模式図用厚み */
  boardThickness: 1.6,
  /**
   * 基板の縦位置をそろえる共通の基準。
   * 基板の上端をこの基準にそろえる。実製品の取付位置は判定しない。
   */
  atxBoardHeight: 304.8,
  /** マザーボード背面端 z = t + 15 */
  mbBackOffset: 15,
  /** CPUの模式図用仮寸法。ソケット別の実寸・取付金具の干渉は判定しない。 */
  cpuPackage: { size: 40, height: 7 },
  /** 代表値: 簡易水冷ヘッドの一辺 */
  aioHeadSize: 80,
  /** メモリ1枚: 長さ 133（模式図用）、厚み（代表値） */
  dimm: { length: 133, thickness: 7 },
  /** M.2 SSD: 80×22（模式図用）、厚み（代表値）、ヒートシンク付きで足す厚み（代表値） */
  m2: { length: 80, width: 22, thickness: 2.4, heatsinkExtra: 8 },
  /** 代表値: ケースファン */
  fan: { size: 120, thickness: 25, gap: 5 },
  /** 代表値: 天面ラジエーターの背面側の余白（背面ファンの分） */
  radiatorRearOffset: 30,
  /** 代表値: ファンと天面の間 */
  fanTopMargin: 10,
  /** 模式図の前面（standard）・底面（dual-chamber）のファンは最大3 */
  maxFrontFans: 3,
  maxBottomFans: 3,
  /** 模式図の背面の排気は1基 */
  maxRearFans: 1,
  /** 汎用配置で用いるPCIe x16スロットの代表位置と長さ（mm）。 */
  pcieX16: { u0: 29.5, length: 89 },
  /** 汎用配置：基板中心をGPUの上面から3.8mm下に仮定する。 */
  gpuBoardBelowTop: 3.8,
} as const

/** CPUは一律40mm角の模式図。ソケット名による実製品の外形再現は行わない。 */
export function cpuPackageMm(_socket: string): { u: number; v: number } {
  return { u: LAYOUT_MM.cpuPackage.size, v: LAYOUT_MM.cpuPackage.size }
}

/** マザーボード上の模式的な位置。u＝背面端から前へ、v＝上端から下へ（mm） */
export interface BoardSpec {
  socket: { u: number; v: number }
  /** メモリスロットの u（最初と最後）。スロットは等間隔 */
  ramU: [number, number]
  ramSlots: number
  /** メモリスロットの v の範囲（上端・下端）。どの規格も同じ模式的な範囲を使う */
  ramV: [number, number]
  /** 1本目の PCIe x16 の v */
  pcieV: number
  /** M.2 の上端の v。null＝裏面（表示しない） */
  m2V: number | null
}

export const BOARD_SPECS: Record<FormFactor, BoardSpec> = {
  ATX: { socket: { u: 115, v: 80 }, ramU: [172, 206], ramSlots: 4, ramV: [15, 148], pcieV: 186, m2V: 150 },
  mATX: { socket: { u: 115, v: 80 }, ramU: [172, 206], ramSlots: 4, ramV: [15, 148], pcieV: 186, m2V: 150 },
  ITX: { socket: { u: 80, v: 62 }, ramU: [142, 158], ramSlots: 2, ramV: [15, 148], pcieV: 164.5, m2V: null },
}

// ---------------------------------------------------------------- 箱の道具

/** 判定の許容誤差（mm）。データの精度（0.01mm）よりずっと小さく、浮動小数の誤差よりずっと大きい */
export const EPS_MM = 1e-6
export const EPS_M = EPS_MM * MM_TO_M

export const boxMm = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box => ({
  min: [x0, y0, z0],
  max: [x1, y1, z1],
})

export function boxContains(outer: Box, inner: Box, eps = EPS_MM): boolean {
  for (let i = 0; i < 3; i++) {
    if (inner.min[i]! < outer.min[i]! - eps || inner.max[i]! > outer.max[i]! + eps) return false
  }
  return true
}

/** はみ出し量（内側なら 0 以下）。軸ごとの最大 */
export function boxOvershoot(outer: Box, inner: Box): number {
  let worst = -Infinity
  for (let i = 0; i < 3; i++) {
    worst = Math.max(worst, outer.min[i]! - inner.min[i]!, inner.max[i]! - outer.max[i]!)
  }
  return worst
}

/** 接しているだけなら重なりではない（体積を持つ重なりだけ） */
export function boxesOverlap(a: Box, b: Box, eps = EPS_MM): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.max[i]! <= b.min[i]! + eps || b.max[i]! <= a.min[i]! + eps) return false
  }
  return true
}

export function unionBox(boxes: Box[]): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, b.min[i]!)
      max[i] = Math.max(max[i]!, b.max[i]!)
    }
  }
  return { min, max }
}

const scale = (b: Box, k: number): Box => ({
  min: [b.min[0] * k, b.min[1] * k, b.min[2] * k],
  max: [b.max[0] * k, b.max[1] * k, b.max[2] * k],
})
const scaleVec = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]

// ---------------------------------------------------------------- ケースの上限

export interface CaseLimits {
  gpuLengthMm: number
  coolerHeightMm: number
  psuLengthMm: number
  /** 入力値が外形からはみ出し、外形の内面で止めた */
  clamped: { gpu: boolean; cooler: boolean; psu: boolean }
}

/** 判定と配置に使う上限。入力値が外形に収まらないときは外形の内面で止める */
export function caseLimits(c: PcCase): CaseLimits {
  const t = LAYOUT_MM.panel
  const { width: W, depth: D } = c.dimensionsMm
  const gpuRoom = D - 2 * t
  const psuRoom = D - 2 * t
  const coolerRoom = W - 2 * t - LAYOUT_MM.boardThickness
  return {
    gpuLengthMm: Math.min(c.maxGpuLengthMm, gpuRoom),
    coolerHeightMm: Math.min(c.maxCoolerHeightMm, coolerRoom),
    psuLengthMm: Math.min(c.maxPsuLengthMm, psuRoom),
    clamped: {
      gpu: c.maxGpuLengthMm > gpuRoom,
      cooler: c.maxCoolerHeightMm > coolerRoom,
      psu: c.maxPsuLengthMm > psuRoom,
    },
  }
}

/** 基板と電源（ラジエーターの位置を決めるときに渡す） */
export interface MountPlacement {
  motherboard: Motherboard
  psu: Psu
}

/**
 * 基板の上下端と standard のシュラウド上面（mm）。
 * 基板の模式的な縦位置: どの基板も上端を ATX の上端にそろえる。ATX の上端＝テンプレートの基準（ATX の下端）＋ATX の縦。
 * Micro-ATX・Mini-ITX は下に空きが出る（下端をそろえると、Mini-ITX の GPU がシュラウドや底面ファンに食い込む）。
 * データの丸めで ATX より 0.2mm 長い基板（305mm）は、下端を基準に置く（下へははみ出させない）。
 */
export function boardVerticalMm(c: PcCase, psu: Psu, mb: Motherboard): { shroudTopY: number | null; mbTopY: number; mbBottomY: number } {
  const L = LAYOUT_MM
  let shroudTopY: number | null = null
  let atxBottomY: number
  if (c.layout === 'standard') {
    shroudTopY = L.foot + psu.dimensionsMm.height + L.shroudAbovePsu
    atxBottomY = shroudTopY + L.mbAboveShroud
  } else {
    atxBottomY = L.foot + L.panel + L.dualBottomSpace + L.dualBottomFan
  }
  const tall = mb.dimensionsMm.width
  const mbTopY = atxBottomY + Math.max(L.atxBoardHeight, tall)
  return { shroudTopY, mbTopY, mbBottomY: mbTopY - tall }
}

/** 簡易水冷のヘッドの箱（mm）。ソケットの上、CPU の上面から */
function aioHeadBoxMm(mbSurfaceX: number, socket: { y: number; z: number }, pumpHeightMm: number): Box {
  const L = LAYOUT_MM
  const x0 = mbSurfaceX + L.cpuPackage.height
  const h = L.aioHeadSize / 2
  return boxMm(x0, x0 + pumpHeightMm, socket.y - h, socket.y + h, socket.z - h, socket.z + h)
}

/** 天面ラジエーターの箱（mm）。ガラス側に寄せて天面の内面に付け、背面側は背面ファンの分を空ける。奥行きに収まらなければ前面の内面で止める */
function topRadiatorBoxMm(c: PcCase, r: AioCooler['radiatorDimensionsMm']): { box: Box; z0: number } {
  const L = LAYOUT_MM
  const t = L.panel
  const { width: W, height: H, depth: D } = c.dimensionsMm
  const glassX = W - t
  const ceilY = H - t
  let z0 = t + L.radiatorRearOffset
  let z1 = z0 + r.length
  if (z1 > D - t) {
    z1 = D - t
    z0 = z1 - r.length
  }
  return { box: boxMm(glassX - r.width, glassX, ceilY - r.thickness, ceilY, z0, z1), z0 }
}

/** 天面に付けたラジエーターが水冷ヘッドに当たるか（3Dの代表値で見る） */
function topRadiatorHitsHead(c: PcCase, cooler: AioCooler, p: MountPlacement): boolean {
  const L = LAYOUT_MM
  const t = L.panel
  const mbSurfaceX = c.dimensionsMm.width - t - caseLimits(c).coolerHeightMm
  const { mbTopY } = boardVerticalMm(c, p.psu, p.motherboard)
  const spec = BOARD_SPECS[p.motherboard.formFactor]
  const socket = { z: t + L.mbBackOffset + spec.socket.u, y: mbTopY - spec.socket.v }
  const head = aioHeadBoxMm(mbSurfaceX, socket, cooler.pumpHeightMm)
  return boxesOverlap(head, topRadiatorBoxMm(c, cooler.radiatorDimensionsMm).box)
}

/**
 * 簡易水冷のラジエーターの位置。天面が対応していれば天面、無理なら前面。どちらも無理なら null。
 * placement（基板と電源）を渡すと、天面の厚みの上限が公表されていないケースで、天面に付けると水冷ヘッドに当たる
 * とき（天井の低いケースの Mini-ITX。ソケットが上端に近い）は、前面が対応していれば前面にする。
 * 公表があるケースは、その上限の判定（aio-case-thickness）に任せて天面のままにする（厚すぎる物を前面へ逃がさない）。
 * compat.ts と layoutBuild は同じ引数で呼び、数値の判定と3Dの位置をそろえる。
 */
export function radiatorMount(c: PcCase, cooler: AioCooler, placement?: MountPlacement): 'top' | 'front' | null {
  const top = c.radiatorSupport.top.includes(cooler.radiatorMm)
  const front = c.radiatorSupport.front.includes(cooler.radiatorMm)
  if (top) {
    const blocked =
      front && placement !== undefined && c.maxRadiatorThicknessMm.top === null && topRadiatorHitsHead(c, cooler, placement)
    if (!blocked) return 'top'
  }
  if (front) return 'front'
  return null
}

/** メモリを挿すスロット（0始まり）。4本のボードに2枚組なら 2本目と4本目で模式表示する */
export function chooseMemorySlots(modules: number, slots: number): number[] {
  if (modules >= slots) return Array.from({ length: slots }, (_, i) => i)
  if (slots === 4 && modules === 2) return [1, 3]
  if (slots === 4 && modules === 1) return [1]
  return Array.from({ length: modules }, (_, i) => i)
}

// ---------------------------------------------------------------- 配置の結果

export interface Piece {
  name: string
  box: Box
  /**
   * ケースの付属ファンの回転の軸の向き（空気の入る側＝外へ向いた単位ベクトル）。斜めに付けるファン（前右）だけに入れ、箱は回した
   * ファンを囲む箱。無ければ名前で決める（底面は y、ほかは z）
   */
  axis?: Vec3
}

export interface PlacedPart {
  category: Category
  id: string
  /** 部品全体を囲む箱（m） */
  box: Box
  /** 細かい箱（メモリ1枚ずつ、クーラーの塔の部分など）（m） */
  pieces: Piece[]
  visible: boolean
}

export type LayoutConflictKind =
  | 'board-overflow'
  | 'psu-chamber-too-narrow'
  | 'radiator-unsupported'
  | 'radiator-too-long'
  | 'memory-without-slot'

export interface LayoutConflict {
  kind: LayoutConflictKind
  mm: number
  message: string
}

export interface LayoutPlanes {
  /** ガラスの内面（x） */
  glassX: number
  /** マザーボード表面（x） */
  mbSurfaceX: number
  /** トレイ面（x）。dual-chamber ではこれより小さい x が電源室 */
  trayX: number
  /** 底面の内面（y） */
  floorY: number
  /** 天面の内面（y） */
  ceilY: number
  backZ: number
  frontZ: number
  /** 前方の障害面 z = t + 最大GPU長（前面ファン・前面ラジエーターの取付面） */
  frontMountZ: number
  /** GPU が越えてはいけない面（z）。前面ラジエーターがあればその背面、無ければ frontMountZ */
  gpuFrontZ: number
  /** 電源室の前端の障害面（z） */
  psuFrontZ: number
  /** 天面ラジエーターの厚みの上限の面（y）。公表が無ければ null */
  radiatorLimitY: number | null
  /** 前面ラジエーターの厚みの上限の面（z）。公表が無ければ null */
  radiatorLimitZ: number | null
  /** マザーボード上端の上限（y） */
  mbTopLimitY: number
  /** standard のシュラウド上面（y）。dual-chamber は null */
  shroudTopY: number | null
}

export interface Layout {
  unit: 'm'
  template: CaseLayoutKind
  caseBox: Box
  /** 外形の内面で囲んだ箱 */
  interior: Box
  planes: LayoutPlanes
  /** ケースの内部構造（シュラウド・ファン） */
  structure: Piece[]
  parts: Record<Category, PlacedPart>
  radiator: { mount: 'top' | 'front' | null; hose: { from: Vec3; to: Vec3 } } | null
  psuOrientation: 'flat' | 'upright'
  /** 体積を持つ重なり（名前の組） */
  overlaps: { a: string; b: string }[]
  conflicts: LayoutConflict[]
  /** 表示上の割り切り（置ききれなかったファンなど） */
  notes: string[]
}

// ---------------------------------------------------------------- 配置

interface Solid {
  name: string
  box: Box
  /** 重なりの判定から外す相手（電源とシュラウドなど、入れ子が正しいもの） */
  ignore?: string[]
}

/** 構成を置く。返す箱はすべて m */
export function layoutBuild(b: ResolvedBuild): Layout {
  const L = LAYOUT_MM
  const c = b.case
  const t = L.panel
  const { width: W, height: H, depth: D } = c.dimensionsMm
  const limits = caseLimits(c)
  const conflicts: LayoutConflict[] = []
  const notes: string[] = []

  // ---- ケースの面（収容上限から逆算）
  const glassX = W - t
  const mbSurfaceX = glassX - limits.coolerHeightMm
  const trayX = mbSurfaceX - L.boardThickness
  const floorY = L.foot + t
  const ceilY = H - t
  const backZ = t
  const frontZ = D - t
  const frontMountZ = backZ + limits.gpuLengthMm
  const psuFrontZ = backZ + limits.psuLengthMm
  const mbTopLimitY = ceilY - L.mbTopMargin
  const topRadiatorLimit = c.maxRadiatorThicknessMm.top
  const frontRadiatorLimit = c.maxRadiatorThicknessMm.front
  const radiatorLimitY = topRadiatorLimit === null ? null : ceilY - topRadiatorLimit
  const radiatorLimitZ = frontRadiatorLimit === null ? null : frontMountZ - frontRadiatorLimit

  // ---- マザーボードの高さ（テンプレートで切り替え。上端を共通の基準にそろえる）
  const psuDims = b.psu.dimensionsMm
  const mb = b.motherboard
  const spec = BOARD_SPECS[mb.formFactor]
  const boardDeep = mb.dimensionsMm.depth
  const { shroudTopY, mbTopY, mbBottomY } = boardVerticalMm(c, b.psu, mb)
  const mbBackZ = backZ + L.mbBackOffset
  if (mbTopY > mbTopLimitY + EPS_MM) {
    conflicts.push({
      kind: 'board-overflow',
      mm: mbTopY - mbTopLimitY,
      message: `マザーボードの上端が ${fmt(mbTopY - mbTopLimitY)}mm はみ出します（配置の基準かデータの誤り）`,
    })
  }
  const at = (u: number, v: number) => ({ z: mbBackZ + u, y: mbTopY - v })
  const socket = at(spec.socket.u, spec.socket.v)

  const partsMm: Record<Category, { pieces: Piece[]; visible: boolean }> = {} as Record<
    Category,
    { pieces: Piece[]; visible: boolean }
  >

  // ケース（外形）
  const caseBox = boxMm(0, W, 0, H, 0, D)
  partsMm.case = { pieces: [{ name: 'case', box: caseBox }], visible: true }

  // マザーボード
  partsMm.motherboard = {
    pieces: [{ name: 'motherboard', box: boxMm(trayX, mbSurfaceX, mbBottomY, mbTopY, mbBackZ, mbBackZ + boardDeep) }],
    visible: true,
  }

  // CPU（ソケットの中心に置く。一律の模式図用仮寸法＝cpuPackageMm）
  const pkg = cpuPackageMm(b.cpu.socket)
  partsMm.cpu = {
    pieces: [
      {
        name: 'cpu',
        box: boxMm(mbSurfaceX, mbSurfaceX + L.cpuPackage.height, socket.y - pkg.v / 2, socket.y + pkg.v / 2, socket.z - pkg.u / 2, socket.z + pkg.u / 2),
      },
    ],
    visible: true,
  }

  // メモリ（縦 133mm、+x に高さぶん）
  const slotCount = Math.min(mb.memorySlots, spec.ramSlots)
  const slotU = (i: number) =>
    slotCount === 1 ? spec.ramU[0] : spec.ramU[0] + ((spec.ramU[1] - spec.ramU[0]) * i) / (slotCount - 1)
  const used = chooseMemorySlots(b.memory.modules, slotCount)
  if (b.memory.modules > slotCount) {
    conflicts.push({
      kind: 'memory-without-slot',
      mm: 0,
      message: `メモリ ${b.memory.modules}枚のうち ${b.memory.modules - slotCount}枚は挿す場所がありません`,
    })
  }
  const dimmHalf = L.dimm.thickness / 2
  partsMm.memory = {
    pieces: used.map((slot, i) => ({
      name: `memory#${i}`,
      box: boxMm(
        mbSurfaceX,
        mbSurfaceX + b.memory.heightMm,
        mbTopY - spec.ramV[1],
        mbTopY - spec.ramV[0],
        mbBackZ + slotU(slot) - dimmHalf,
        mbBackZ + slotU(slot) + dimmHalf,
      ),
    })),
    visible: true,
  }

  // SSD（M.2 位置に平置き。Mini-ITX は裏面扱いで表示しない）
  const ssdThick = L.m2.thickness + (b.storage.heatsink ? L.m2.heatsinkExtra : 0)
  if (spec.m2V !== null) {
    const topY = mbTopY - spec.m2V
    partsMm.storage = {
      pieces: [
        {
          name: 'storage',
          box: boxMm(
            mbSurfaceX,
            mbSurfaceX + ssdThick,
            topY - L.m2.width,
            topY,
            socket.z - L.m2.length / 2,
            socket.z + L.m2.length / 2,
          ),
        },
      ],
      visible: true,
    }
  } else {
    const cy = (mbBottomY + mbTopY) / 2
    const cz = mbBackZ + boardDeep / 2
    partsMm.storage = {
      pieces: [
        {
          name: 'storage',
          box: boxMm(trayX - ssdThick, trayX, cy - L.m2.width / 2, cy + L.m2.width / 2, cz - L.m2.length / 2, cz + L.m2.length / 2),
        },
      ],
      visible: false,
    }
  }

  // GPU（基板は床と平行。長さ +z・ブラケットが背面の内面、高さ +x、厚みはスロットから下）。
  // 基板の中心（端子）を x16 の中心（pcieV）に合わせるので、箱の上面は gpuBoardBelowTop だけ上
  const g = b.gpu.dimensionsMm
  const slotY = mbTopY - spec.pcieV
  const gpuTop = slotY + L.gpuBoardBelowTop
  partsMm.gpu = {
    pieces: [{ name: 'gpu', box: boxMm(mbSurfaceX, mbSurfaceX + g.height, gpuTop - g.thickness, gpuTop, backZ, backZ + g.length) }],
    visible: true,
  }

  // 電源（背面の内面から置く）
  const psuLen = psuDims.length
  let psuOrientation: 'flat' | 'upright' = 'flat'
  let psuBox: Box
  if (c.layout === 'standard') {
    const cx = W / 2
    psuBox = boxMm(cx - psuDims.width / 2, cx + psuDims.width / 2, floorY, floorY + psuDims.height, backZ, backZ + psuLen)
  } else {
    // dual-chamber: マザーボードの裏が電源室。幅 160mm 以上なら寝かせ、足りなければ立てる（86mm を x 方向に）
    const chamber = trayX - t
    if (chamber >= L.psuFlatMinChamber) {
      const x0 = t + (chamber - psuDims.width) / 2
      psuBox = boxMm(x0, x0 + psuDims.width, floorY, floorY + psuDims.height, backZ, backZ + psuLen)
    } else {
      psuOrientation = 'upright'
      const x0 = t + (chamber - psuDims.height) / 2
      psuBox = boxMm(x0, x0 + psuDims.height, floorY, floorY + psuDims.width, backZ, backZ + psuLen)
      if (chamber < psuDims.height) {
        conflicts.push({
          kind: 'psu-chamber-too-narrow',
          mm: psuDims.height - chamber,
          message: `電源室の幅 ${fmt(chamber)}mm に電源（${fmt(psuDims.height)}mm）が入りません`,
        })
      }
    }
  }
  partsMm.psu = { pieces: [{ name: 'psu', box: psuBox }], visible: true }

  // CPUクーラー
  const cooler = b.cooler
  let radiator: Layout['radiator'] = null
  let frontRadiatorBackZ: number | null = null
  let topRadiatorThickness = 0
  if (cooler.type === 'air') {
    partsMm.cooler = { pieces: airCoolerPieces(cooler, mbSurfaceX, socket, mbBackZ + spec.ramU[0] - dimmHalf), visible: true }
  } else {
    const head = aioHeadBoxMm(mbSurfaceX, socket, cooler.pumpHeightMm)
    // compat.ts と同じ引数で位置を決める（天面だとヘッドに当たるなら前面。radiatorMount の説明）
    const mount = radiatorMount(c, cooler, { motherboard: mb, psu: b.psu })
    const r = cooler.radiatorDimensionsMm
    let rad: Box
    if (mount === 'front') {
      // 前面: GPU 前方の障害面の内側に立てる。GPU の上限はラジエーター厚だけ短くなる（compat と同じ）
      const xc = (mbSurfaceX + glassX) / 2
      const y1 = ceilY - L.fanTopMargin
      const y0 = Math.max(floorY, y1 - r.length)
      rad = boxMm(xc - r.width / 2, xc + r.width / 2, y0, y1, frontMountZ - r.thickness, frontMountZ)
      frontRadiatorBackZ = frontMountZ - r.thickness
    } else {
      // 天面（非対応でも天面に置いて見せる。判定は compat が不可にする）
      if (mount === null) {
        conflicts.push({
          kind: 'radiator-unsupported',
          mm: 0,
          message: `このケースの天面・前面は ${cooler.radiatorMm}mm のラジエーターに対応していません`,
        })
      }
      const top = topRadiatorBoxMm(c, r)
      if (top.z0 < backZ - EPS_MM) {
        conflicts.push({
          kind: 'radiator-too-long',
          mm: backZ - top.z0,
          message: `ラジエーター（${fmt(r.length)}mm）がケースの奥行きに収まりません`,
        })
      }
      rad = top.box
      topRadiatorThickness = r.thickness
    }
    // ホースの両端（3D の曲線用）: ヘッドの上面の中心 → ラジエーターの背面側の端
    const headTop: Vec3 = [head.max[0], socket.y, socket.z]
    const radEnd: Vec3 =
      mount === 'front'
        ? [(rad.min[0] + rad.max[0]) / 2, (rad.min[1] + rad.max[1]) / 2, rad.min[2]]
        : [(rad.min[0] + rad.max[0]) / 2, rad.min[1], rad.min[2] + L.fan.size / 4]
    radiator = { mount, hose: { from: scaleVec(headTop, MM_TO_M), to: scaleVec(radEnd, MM_TO_M) } }
    partsMm.cooler = {
      pieces: [
        { name: 'cooler:head', box: head },
        { name: 'cooler:radiator', box: rad },
      ],
      visible: true,
    }
  }

  // ---- ケースの内部構造: シュラウドとファン
  const structure: Piece[] = []
  const F = L.fan
  const fans: Piece[] = []
  if (c.layout === 'standard' && shroudTopY !== null) {
    // 前面ラジエーターがあれば、シュラウドはその背面で止める（実物もラジエーターの所が切り欠いてある）
    const shroudFrontZ = Math.min(frontMountZ, frontZ, frontRadiatorBackZ ?? Infinity)
    structure.push({ name: 'shroud', box: boxMm(t, W - t, floorY, shroudTopY, backZ, shroudFrontZ) })
  }
  // ファンの位置と数：入力に取付位置があれば使い、無ければテンプレートの決まり
  // （standard は前面、dual-chamber は底面、残りは背面）。仕様の位置のうち、まだ3Dに置けない位置（天面）は注記に数える
  const mounts = c.includedFanMounts
  const mounted = (p: FanMountPosition) => (mounts ?? []).filter((m) => m.position === p).reduce((s, m) => s + m.count, 0)
  const sizeAt = (p: FanMountPosition) => (mounts ?? []).find((m) => m.position === p)?.sizeMm ?? F.size
  const front = mounts ? Math.min(L.maxFrontFans, mounted('front')) : c.layout === 'standard' ? Math.min(L.maxFrontFans, c.includedFans) : 0
  const bottom = mounts ? Math.min(L.maxBottomFans, mounted('bottom')) : c.layout === 'dual-chamber' ? Math.min(L.maxBottomFans, c.includedFans) : 0
  const rear = mounts ? Math.min(L.maxRearFans, mounted('rear')) : Math.min(L.maxRearFans, c.includedFans - front - bottom)
  let skipped = c.includedFans - front - bottom - rear
  // 前面（standard）: 障害面の前に縦に並べる。天面ラジエーターがあればその下から
  const frontTop = ceilY - L.fanTopMargin - topRadiatorThickness
  const frontSize = sizeAt('front')
  for (let k = 0; k < front; k++) {
    const y1 = frontTop - k * (frontSize + F.gap)
    const y0 = y1 - frontSize
    if (y0 < floorY) {
      skipped++
      continue
    }
    const z0 = Math.min(frontMountZ, frontZ - F.thickness)
    const xc = W / 2
    fans.push({ name: `fan:front#${k}`, box: boxMm(xc - frontSize / 2, xc + frontSize / 2, y0, y1, z0, z0 + F.thickness) })
  }
  // 前右など取付角度が未確認の位置は、写真から推定せず未描画の注記へ含める。
  // 底面（dual-chamber）: ガラス側の部屋の底に横に並べる
  for (let k = 0; k < bottom; k++) {
    const z1 = Math.min(frontMountZ, frontZ) - k * (F.size + F.gap)
    const z0 = z1 - F.size
    if (z0 < backZ) {
      skipped++
      continue
    }
    const xc = (mbSurfaceX + glassX) / 2
    fans.push({ name: `fan:bottom#${k}`, box: boxMm(xc - F.size / 2, xc + F.size / 2, floorY, floorY + F.thickness, z0, z1) })
  }
  // 残りは背面の排気（1基）。GPU より上に収まり、CPUクーラーに当たらないときだけ
  // （Mini-ITX はソケットが背面寄りなので、奥行きの大きい空冷の塔が背面ファンの位置まで来る。代表値の割り切り）
  const rearSize = sizeAt('rear')
  for (let k = 0; k < rear; k++) {
    const y1 = ceilY - L.fanTopMargin - k * (rearSize + F.gap)
    const y0 = y1 - rearSize
    const x0 = Math.min(mbSurfaceX + F.gap, glassX - rearSize)
    const fanBox = boxMm(x0, x0 + rearSize, y0, y1, backZ, backZ + F.thickness)
    if (y0 < slotY + F.gap || partsMm.cooler.pieces.some((p) => boxesOverlap(fanBox, p.box))) {
      skipped += rear - k
      break
    }
    fans.push({ name: `fan:rear#${k}`, box: fanBox })
  }
  if (skipped > 0) notes.push(`付属ファン ${c.includedFans}基のうち ${skipped}基は3Dに置いていません（場所の割り切り）`)
  structure.push(...fans)

  // ---- 重なり（体積を持つもの）。ケースの外形とは比べない
  const solids: Solid[] = []
  for (const cat of CATEGORIES) {
    if (cat === 'case') continue
    if (!partsMm[cat].visible && cat === 'storage') continue
    for (const p of partsMm[cat].pieces) solids.push({ name: p.name, box: p.box, ignore: p.name === 'psu' ? ['shroud'] : [] })
  }
  for (const s of structure) solids.push({ name: s.name, box: s.box })
  const overlaps: { a: string; b: string }[] = []
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!
      const bb = solids[j]!
      if (a.ignore?.includes(bb.name) || bb.ignore?.includes(a.name)) continue
      if (boxesOverlap(a.box, bb.box)) overlaps.push({ a: a.name, b: bb.name })
    }
  }

  // ---- m にして返す
  const parts = {} as Record<Category, PlacedPart>
  const ids: Record<Category, string> = {
    case: c.id,
    motherboard: mb.id,
    cpu: b.cpu.id,
    cooler: cooler.id,
    memory: b.memory.id,
    gpu: b.gpu.id,
    storage: b.storage.id,
    psu: b.psu.id,
  }
  for (const cat of CATEGORIES) {
    const pm = partsMm[cat]
    const pieces = pm.pieces.map((p) => ({ name: p.name, box: scale(p.box, MM_TO_M) }))
    parts[cat] = {
      category: cat,
      id: ids[cat],
      box: unionBox(pieces.map((p) => p.box)),
      pieces,
      visible: pm.visible,
    }
  }
  if (frontRadiatorBackZ !== null) notes.push('ラジエーターを前面に置いたため、GPU の長さの上限はラジエーターの厚みだけ短くなります')

  return {
    unit: 'm',
    template: c.layout,
    caseBox: scale(caseBox, MM_TO_M),
    interior: scale(boxMm(t, W - t, floorY, ceilY, t, D - t), MM_TO_M),
    planes: {
      glassX: glassX * MM_TO_M,
      mbSurfaceX: mbSurfaceX * MM_TO_M,
      trayX: trayX * MM_TO_M,
      floorY: floorY * MM_TO_M,
      ceilY: ceilY * MM_TO_M,
      backZ: backZ * MM_TO_M,
      frontZ: frontZ * MM_TO_M,
      frontMountZ: frontMountZ * MM_TO_M,
      gpuFrontZ: (frontRadiatorBackZ ?? frontMountZ) * MM_TO_M,
      psuFrontZ: psuFrontZ * MM_TO_M,
      radiatorLimitY: radiatorLimitY === null ? null : radiatorLimitY * MM_TO_M,
      radiatorLimitZ: radiatorLimitZ === null ? null : radiatorLimitZ * MM_TO_M,
      mbTopLimitY: mbTopLimitY * MM_TO_M,
      shroudTopY: shroudTopY === null ? null : shroudTopY * MM_TO_M,
    },
    structure: structure.map((s) => ({ ...s, box: scale(s.box, MM_TO_M) })),
    parts,
    radiator,
    psuOrientation,
    overlaps,
    conflicts,
    notes,
  }
}

/**
 * 空冷クーラーの箱。ソケットの上に塔を立て、高さは +x。メモリの上に張り出す部分は、メモリの隙間の高さから始める。
 * 前後はソケット中心へ対称に置く代表配置。製品固有の非対称な形やファンの持ち上げは再現しない。
 * - none（張り出さないと公表）: メモリの列の手前で塔を止める
 * - limit（隙間の公表値あり）: 張り出す部分の下面を「表面 + 隙間」にする（数値の判定と一致させる）
 * - unknown: 塔をそのまま置く（重なりで「目安」判定）
 */
function airCoolerPieces(cooler: AirCooler, mbSurfaceX: number, socket: { y: number; z: number }, ramStartZ: number): Piece[] {
  const L = LAYOUT_MM
  const { width, depth } = cooler.dimensionsMm
  // CPU自体は仮寸法のため、薄い入力では基部の記号も縮めて高さの上限を保つ。
  const x0 = mbSurfaceX + Math.min(L.cpuPackage.height, cooler.heightMm / 2)
  const x1 = mbSurfaceX + cooler.heightMm
  const y0 = socket.y - width / 2
  const y1 = socket.y + width / 2
  const z0 = socket.z - depth / 2
  const z1 = z0 + depth
  const rc = cooler.ramClearance
  const overhangs = z1 > ramStartZ + EPS_MM && z0 < ramStartZ
  if (rc.kind === 'none' && overhangs) {
    return [{ name: 'cooler:tower', box: boxMm(x0, x1, y0, y1, z0, ramStartZ) }]
  }
  if (rc.kind === 'limit' && overhangs) {
    return [
      { name: 'cooler:tower', box: boxMm(x0, x1, y0, y1, z0, ramStartZ) },
      { name: 'cooler:overhang', box: boxMm(Math.max(x0, mbSurfaceX + rc.mm), x1, y0, y1, ramStartZ, z1) },
    ]
  }
  return [{ name: 'cooler:tower', box: boxMm(x0, x1, y0, y1, z0, z1) }]
}

// ---------------------------------------------------------------- 判定に使う問い

export interface CaseFit {
  inside: boolean
  /** はみ出し量（mm）。入っていれば 0 以下 */
  overshootMm: number
}

/**
 * 部品の箱がケースの中に収まるか（3Dの側の判定）。
 * ケースの内面に加え、GPU は前方の障害面、電源は電源室の前端、天面ラジエーターは厚みの上限の面を越えないこと。
 * compat.ts の数値の判定と一致することをテストで確かめる。
 */
export function fitsInCase(layout: Layout, category: Category): CaseFit {
  const region = allowedRegion(layout, category)
  const part = layout.parts[category]
  let worst = -Infinity
  for (const p of part.pieces) {
    const r = p.name === 'cooler:radiator' ? radiatorRegion(layout, region) : region
    worst = Math.max(worst, boxOvershoot(r, p.box))
  }
  const overshootMm = worst / MM_TO_M
  return { inside: overshootMm <= EPS_MM, overshootMm }
}

function allowedRegion(layout: Layout, category: Category): Box {
  const { interior, planes } = layout
  const max: Vec3 = [...interior.max]
  if (category === 'gpu') max[2] = Math.min(max[2], planes.gpuFrontZ)
  if (category === 'psu') max[2] = Math.min(max[2], planes.psuFrontZ)
  if (category === 'case') return layout.caseBox
  return { min: [...interior.min], max }
}

/** ラジエーターは取付面から「厚みの上限」の範囲に収まること（上限値があるときだけ） */
function radiatorRegion(layout: Layout, region: Box): Box {
  const mount = layout.radiator?.mount
  const { radiatorLimitY, radiatorLimitZ } = layout.planes
  if (mount === 'top' && radiatorLimitY !== null) {
    return { min: [region.min[0], Math.max(region.min[1], radiatorLimitY), region.min[2]], max: region.max }
  }
  if (mount === 'front' && radiatorLimitZ !== null) {
    return { min: [region.min[0], region.min[1], Math.max(region.min[2], radiatorLimitZ)], max: region.max }
  }
  return region
}

/** 名前の前半が一致する2つの部品が重なっているか（例: 'cooler' と 'memory#'） */
export function overlapsBetween(layout: Layout, prefixA: string, prefixB: string): boolean {
  return layout.overlaps.some(
    (o) => (o.a.startsWith(prefixA) && o.b.startsWith(prefixB)) || (o.a.startsWith(prefixB) && o.b.startsWith(prefixA)),
  )
}

/** 位置の名前（天面・前面など）→ ケースの上限 */
export function radiatorThicknessLimit(c: PcCase, position: RadiatorPosition): number | null {
  return c.maxRadiatorThicknessMm[position]
}
