// 模型を作る道具。名所1つ＝1ファイルの build(kit) から呼ぶ。使い方は同じフォルダの KIT.md。
// 単位は台座の大きさ（台座は半径5・高さ0.4）。原点は台座の上面の中心、y が上、+Z が既定のカメラ側（正面）。
// three.js の形を作るだけで、描画はしない（テストからも動かせる）。
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { Appear } from '../render/assembly'
import type { StageNo } from '../render/stages'

export type Vec3 = readonly [number, number, number]
export type XZ = readonly [number, number]

/** 仕上げ。白い段階ではどれもつや消しの粘土になり、色塗りで本来の質感が出る */
export type Finish = 'matte' | 'satin' | 'gloss' | 'metal' | 'gold' | 'water'

/** 仕上げごとの [金属らしさ, ざらつき] */
const FINISH: Readonly<Record<Finish, readonly [number, number]>> = {
  matte: [0, 0.86],
  satin: [0, 0.58],
  gloss: [0, 0.32],
  metal: [0.8, 0.36],
  // 金属らしさを上げすぎると空の映り込みだけになり、くすんだ黄土色に見える。地の色も少し残す
  // 講評r1：まだ黄土色のつや消しに見えた → 金属らしさ 0.72→0.6（日なたで地の色が明るく出る）、ざらつき 0.3→0.22（つやを強く）。
  // 映り込みそのものは render/paintMaterial.ts で金属だけ強めた
  gold: [0.6, 0.22],
  water: [0, 0.08],
}

/** 1か所あたりの上限（docs/04） */
export const LIMITS = { parts: 350, triangles: 60000 } as const

/** 部品を置いてよい範囲（中心からの距離）。地面の半径 4.93（render/stageSet.ts の GROUND_RADIUS）＋わずかな余裕 */
export const REACH_LIMIT = 4.96

/** よく使う本当の色。名所どうしで色の調子をそろえるため、まずここから選ぶ */
export const COLORS = {
  // 地面
  lawn: '#86B860',
  grass: '#78A955',
  moss: '#6C9A57',
  forest: '#3D7444',
  pine: '#2E6744',
  soil: '#B48C63',
  sand: '#E5C68E',
  desert: '#E2BE82',
  rock: '#A39C91',
  snow: '#F3F5F7',
  gravel: '#CFC6B4',
  // 水
  water: '#3E8CB8',
  pond: '#3F8A86',
  sea: '#2D7DB2',
  // 街
  road: '#7E8082',
  pavement: '#C9C1B1',
  concrete: '#C3C0B8',
  stone: '#CBBF9E',
  brick: '#B5694A',
  glass: '#4D6A82',
  // 建物
  white: '#F5F2EA',
  plaster: '#EEE8DA',
  wood: '#9A6A43',
  darkWood: '#5E4130',
  roofTile: '#4B5561',
  roofBark: '#4E3F33',
  copperGreen: '#5FA48B',
  vermilion: '#D8452C',
  towerOrange: '#E8562A',
  // 講評r1：金がくすんだ黄土色に見えた → 黄みと明るさを上げる（#F0C34C→#F6CE58）
  gold: '#F6CE58',
  // 人・車
  skin: '#EFC6A0',
  tire: '#2E2F33',
} as const

export interface Place {
  /** 形の底の中心の位置。省略は原点 */
  at?: Vec3
  /** Y軸まわりの回転（度）。上から見て反時計回り */
  rotY?: number
  /** X・Y・Z軸まわりの回転（度）。傾けたいとき。rotY と同時に使うと rot が先にかかる */
  rot?: Vec3
  /** 拡大。数1つなら全方向。負の値（鏡写し）は使わない */
  scale?: number | Vec3
}

export interface Look {
  /** 本当の色（#RRGGBB）。白い段階では見えず、色塗りで出る */
  color?: string
  finish?: Finish
}

export type Opts<T> = T & Place & Look

/** 作り終えた部品1つ。geometry は position・normal・aTrue（本当の色）・aFinish（金属らしさ・ざらつき・最初から色つきか）・index を持つ */
export interface BuiltPart {
  geometry: BufferGeometry
  stage: StageNo
  order: number
  appear: Appear
  minY: number
  maxY: number
  /** 中心軸から部品の中心までの水平距離 */
  radial: number
  /** 中心軸からいちばん遠い点までの水平距離 */
  reach: number
  /** 外接球の半径の目安（箱の対角の半分） */
  size: number
  center: Vector3
  triangles: number
}

export interface LandmarkModel {
  id: string
  parts: BuiltPart[]
  /** 地面（台座の上面）の本当の色（線形の値） */
  groundColor: Color
  /** いちばん高い点 */
  height: number
  triangles: number
  /** カメラの寄せ方に使う外形。[中心軸からの距離, 高さ] の組 */
  envelope: [number, number][]
  /** 上限を超えたなどの注意 */
  warnings: string[]
}

export type LandmarkBuilder = (kit: Kit) => void

const DEG = Math.PI / 180

/** 文字列から 32bit の種を作る（FNV-1a） */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 種つきの乱数（mulberry32）。0 以上 1 未満 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Kit {
  readonly id: string
  private stageNo: StageNo = 1
  private orderNo = 0
  private appearStyle: Appear = 'drop'
  private readonly stack: Matrix4[] = [new Matrix4()]
  private collecting: BufferGeometry[] | null = null
  private readonly built: BuiltPart[] = []
  private groundHex: string = COLORS.lawn
  private readonly mounds: { x: number; z: number; rx: number; rz: number; y: number; h: number }[] = []
  private readonly random: () => number

  constructor(id: string) {
    this.id = id
    this.random = seededRandom(hashString(id))
  }

  // ---- 段階・順番・出方 ----

  /** これから作る部品の段階（1〜4）。docs/04 の段階の意味に合わせる */
  stage(n: StageNo): void {
    this.stageNo = n
  }

  /** 同じ段階の中で、小さい組から先に出す（既定 0）。指定がなければ下から上・中心から外 */
  order(n: number): void {
    this.orderNo = n
  }

  /** これから作る部品の出方。drop＝上から落ちる（既定）、grow＝地面から伸びる */
  appear(style: Appear): void {
    this.appearStyle = style
  }

  /** 地面（台座の上面）の本当の色。段階1〜3は白く、色塗りでこの色になる */
  ground(color: string): void {
    this.groundHex = color
  }

  /** それまでに作った丘（mound）の上の、(x, z) での地面の高さ。木や人を斜面に置くときに使う（少し埋めると浮かない） */
  groundAt(x: number, z: number): number {
    let h = 0
    for (const m of this.mounds) {
      const d = Math.hypot((x - m.x) / m.rx, (z - m.z) / m.rz)
      if (d < 1) h = Math.max(h, m.y + (m.h * (1 + Math.cos(Math.PI * d))) / 2)
    }
    return h
  }

  /** 中で作った形をまとめて1つの部品にする（一緒に落ちて、着地の知らせも1回） */
  part(fn: () => void, opts: { appear?: Appear } = {}): void {
    if (this.collecting) {
      fn()
      return
    }
    const chunks: BufferGeometry[] = []
    this.collecting = chunks
    try {
      fn()
    } finally {
      this.collecting = null
    }
    if (chunks.length > 0) this.finishPart(chunks, opts.appear ?? this.appearStyle)
  }

  /** 置き場所をずらした座標の中で作る（入れ子にできる） */
  at(place: Place, fn: () => void): void {
    const top = this.stack[this.stack.length - 1] ?? new Matrix4()
    this.stack.push(top.clone().multiply(placeMatrix(place)))
    try {
      fn()
    } finally {
      this.stack.pop()
    }
  }

  // ---- 乱数（名所 id から作った種だけを使う） ----

  rand(): number {
    return this.random()
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.random()
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.random() * items.length)]
    if (item === undefined) throw new Error('pick に空の配列が渡された')
    return item
  }
  chance(probability: number): boolean {
    return this.random() < probability
  }

  /** 円周上に count 個並べる。fn(i, x, z, 向きの角度[度]) */
  ring(count: number, radius: number, fn: (i: number, x: number, z: number, angleDeg: number) => void, startDeg = 0): void {
    for (let i = 0; i < count; i++) {
      const a = startDeg + (360 * i) / count
      fn(i, Math.sin(a * DEG) * radius, Math.cos(a * DEG) * radius, a)
    }
  }

  /** 中心からの距離 rMin〜rMax の輪の中に、互いに gap 以上離して count 個ばらまく。ok(x, z) が false の場所は避ける */
  scatter(
    opts: { count: number; rMin?: number; rMax: number; gap?: number; ok?: (x: number, z: number) => boolean },
    fn: (i: number, x: number, z: number) => void,
  ): void {
    const placed: XZ[] = []
    const rMin = opts.rMin ?? 0
    const gap = opts.gap ?? 0.2
    let tries = 0
    while (placed.length < opts.count && tries < opts.count * 60) {
      tries++
      const r = Math.sqrt(this.range(rMin * rMin, opts.rMax * opts.rMax))
      const a = this.range(0, Math.PI * 2)
      const x = Math.sin(a) * r
      const z = Math.cos(a) * r
      if (opts.ok && !opts.ok(x, z)) continue
      if (placed.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < gap * gap)) continue
      placed.push([x, z])
      fn(placed.length - 1, x, z)
    }
  }

  // ---- 基本の形（at は形の底の中心） ----

  /** Takes ownership of authored low-poly geometry; coordinates use the same ground origin. */
  mesh(o: Opts<{ geometry: BufferGeometry }>): void {
    if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals()
    this.emit(o.geometry, o, o)
  }

  box(o: Opts<{ w: number; h: number; d: number }>): void {
    this.emit(new BoxGeometry(o.w, o.h, o.d).translate(0, o.h / 2, 0), o, o)
  }

  /** 円柱。rTop を変えると先細り。seg は 8〜16 で十分 */
  cylinder(o: Opts<{ r: number; h: number; rTop?: number; seg?: number }>): void {
    const g = new CylinderGeometry(o.rTop ?? o.r, o.r, o.h, o.seg ?? 12)
    this.emit(g.translate(0, o.h / 2, 0), o, o)
  }

  cone(o: Opts<{ r: number; h: number; seg?: number }>): void {
    this.emit(new ConeGeometry(o.r, o.h, o.seg ?? 12).translate(0, o.h / 2, 0), o, o)
  }

  /** 球。squash で縦につぶす（0.5 なら半分の高さ） */
  sphere(o: Opts<{ r: number; seg?: number; squash?: number }>): void {
    const seg = o.seg ?? 12
    const squash = o.squash ?? 1
    const g = new SphereGeometry(o.r, seg, Math.max(4, Math.round(seg * 0.6)))
    g.scale(1, squash, 1).translate(0, o.r * squash, 0)
    this.emit(g, o, o)
  }

  /** 回転体。points は [半径, 高さ] を下から順に。影を正しく落とすため、半径0で始めて半径0で終える */
  lathe(o: Opts<{ points: readonly XZ[]; seg?: number }>): void {
    const pts = o.points.map(([r, y]) => new Vector2(Math.max(0, r), y))
    this.emit(new LatheGeometry(pts, o.seg ?? 16), o, o)
  }

  /** 上から見た輪郭 points（[x, z] の並び）を、高さ h だけ持ち上げた柱 */
  extrude(o: Opts<{ points: readonly XZ[]; h: number }>): void {
    this.emit(extrudeFootprint(o.points, o.h), o, o)
  }

  /** 輪。既定は正面（+Z）を向いて立つ。flat で地面に寝かせる。arc で欠けた輪（度） */
  torus(o: Opts<{ r: number; tube: number; arc?: number; seg?: number; flat?: boolean }>): void {
    const seg = o.seg ?? 24
    const g = new TorusGeometry(o.r, o.tube, 8, seg, (o.arc ?? 360) * DEG)
    if (o.flat) g.rotateX(-Math.PI / 2).translate(0, o.tube, 0)
    else g.translate(0, o.r + o.tube, 0)
    this.emit(g, o, o)
  }

  /** 四角すい台。topW / topD を 0 にすると四角すい */
  frustum(o: Opts<{ w: number; h: number; d?: number; topW?: number; topD?: number }>): void {
    const d = o.d ?? o.w
    const tw = o.topW ?? 0
    const td = o.topD ?? (o.topW !== undefined ? (o.topW * d) / o.w : 0)
    this.emit(frustumGeometry(o.w, d, tw, td, o.h), o, o)
  }

  /** 四角すい（ピラミッド） */
  pyramid(o: Opts<{ w: number; h: number; d?: number }>): void {
    this.emit(frustumGeometry(o.w, o.d ?? o.w, 0, 0, o.h), o, o)
  }

  /** 2点を結ぶ角材。size は太さ、width を渡すと平たい板（葉など） */
  beam(o: Look & { from: Vec3; to: Vec3; size: number; width?: number }): void {
    this.emit(beamGeometry(o.from, o.to, o.size, o.width), o, {})
  }

  // ---- 屋根 ----

  /** 切妻屋根。棟は X 方向（幅 w）。overhang は軒の出 */
  gableRoof(o: Opts<{ w: number; d: number; h: number; overhang?: number }>): void {
    this.emit(gableRoofGeometry(o.w, o.d, o.h, o.overhang ?? 0.08), o, o)
  }

  /** 寄棟屋根。棟は X 方向。ridge は棟の長さの半分（省略で自然な長さ） */
  hipRoof(o: Opts<{ w: number; d: number; h: number; overhang?: number; ridge?: number }>): void {
    this.emit(hipRoofGeometry(o.w, o.d, o.h, o.overhang ?? 0.08, o.ridge), o, o)
  }

  /**
   * 反りのある和風の屋根。style：irimoya（入母屋＝上に三角の妻）・yosemune（寄棟）・hogyo（方形＝四角すい）・
   * skirt（下の階の屋根＝上の壁 top のまわりを囲むだけ）。棟は X 方向。w・d は壁の大きさ（軒の出は別）
   */
  curvedRoof(
    o: Opts<{
      w: number
      d: number
      h: number
      style?: 'irimoya' | 'yosemune' | 'hogyo' | 'skirt'
      overhang?: number
      upturn?: number
      curve?: number
      thick?: number
      ridge?: number
      top?: { w: number; d: number }
      gableColor?: string
    }>,
  ): void {
    const roofLook: Look = { color: o.color ?? COLORS.roofTile, finish: o.finish ?? 'satin' }
    const gableLook: Look = { color: o.gableColor ?? roofLook.color, finish: 'matte' }
    const pieces = curvedRoofGeometry({
      w: o.w,
      d: o.d,
      h: o.h,
      style: o.style ?? 'irimoya',
      overhang: o.overhang ?? 0.22,
      upturn: o.upturn ?? 0.12,
      curve: o.curve ?? 1.6,
      thick: o.thick ?? 0.05,
      ridge: o.ridge,
      top: o.top,
    })
    this.part(() => {
      this.emit(pieces.roof, roofLook, o)
      if (pieces.gables) this.emit(pieces.gables, gableLook, o)
    })
  }

  // ---- 形の決まった道具 ----

  /** アーチ（門の形）。正面は +Z。thick は柱の太さ */
  arch(o: Opts<{ w: number; h: number; d: number; thick: number; seg?: number }>): void {
    this.emit(archGeometry(o.w, o.h, o.d, o.thick, o.seg ?? 10), o, o)
  }

  /** 格子の塔の一節。底の幅 w0・上の幅 w1・高さ h の四角い枠に、柱とX字の筋かい。faces:false で筋かいを省き、4本の脚と上の梁だけ */
  lattice(o: Opts<{ w0: number; w1: number; h: number; bays?: number; post?: number; member?: number; faces?: boolean }>): void {
    this.emit(latticeGeometry(o.w0, o.w1, o.h, o.bays ?? 2, o.post ?? 0.06, o.member ?? 0.03, o.faces ?? true), o, o)
  }

  /** 階段。手前（+Z）が低い */
  stairs(o: Opts<{ w: number; d: number; h: number; steps?: number }>): void {
    const steps = Math.max(1, o.steps ?? 5)
    const geos: BufferGeometry[] = []
    for (let i = 0; i < steps; i++) {
      const sh = (o.h * (i + 1)) / steps
      const sd = o.d / steps
      geos.push(new BoxGeometry(o.w, sh, sd).translate(0, sh / 2, o.d / 2 - sd * (i + 0.5)))
    }
    this.emit(mergeGeometries(geos.map(normalize)), o, o)
  }

  /** 水面。r で円、points で好きな形。地面からわずかに浮いた薄い板。既定は地面から伸びる出方 */
  water(o: Opts<{ r?: number; points?: readonly XZ[]; h?: number; appear?: Appear }>): void {
    const h = o.h ?? 0.03
    const g = o.points ? extrudeFootprint(o.points, h) : new CylinderGeometry(o.r ?? 1, o.r ?? 1, h, 40).translate(0, h / 2, 0)
    this.emit(g, { color: o.color ?? COLORS.water, finish: o.finish ?? 'water' }, o, o.appear ?? 'grow')
  }

  /** 土の盛り上がり（なだらかな丘）。rx・rz で楕円に。既定は地面から伸びる出方 */
  mound(o: Opts<{ r: number; h: number; rx?: number; rz?: number; seg?: number; appear?: Appear }>): void {
    // 底のふたは付けない（ふちの法線がなまって、丘のすそに暗い帯が出るため）。地面に置くので下は見えない
    const pts: Vector2[] = []
    const n = 8
    for (let k = 0; k <= n; k++) {
      const s = k / n
      pts.push(new Vector2(o.r * (1 - s), (o.h * (1 - Math.cos(Math.PI * s))) / 2))
    }
    const g = new LatheGeometry(pts, o.seg ?? 20)
    g.scale((o.rx ?? o.r) / o.r, 1, (o.rz ?? o.r) / o.r)
    const top = this.stack[this.stack.length - 1] ?? new Matrix4()
    const c = new Vector3(...(o.at ?? [0, 0, 0])).applyMatrix4(top)
    const s = typeof o.scale === 'number' ? o.scale : 1
    this.mounds.push({ x: c.x, z: c.z, y: c.y, rx: (o.rx ?? o.r) * s, rz: (o.rz ?? o.r) * s, h: o.h * s })
    this.emit(g, { color: o.color ?? COLORS.grass, finish: o.finish ?? 'matte' }, o, o.appear ?? 'grow')
  }

  /** 木。kind：round（丸い木）・cone（円すいの木）・pine（松）・sakura（桜）・palm（ヤシ）。h は全体の高さ */
  tree(o: Place & { kind?: 'round' | 'cone' | 'pine' | 'sakura' | 'palm'; h?: number; color?: string; appear?: Appear }): void {
    const h = o.h ?? 0.6
    const kind = o.kind ?? 'round'
    const trunk: Look = { color: kind === 'palm' ? '#8C7A62' : COLORS.wood }
    this.part(
      () =>
        this.at(o, () => {
          if (kind === 'round') {
            this.cylinder({ r: 0.06 * h, rTop: 0.045 * h, h: 0.42 * h, seg: 6, ...trunk })
            this.sphere({ r: 0.32 * h, at: [0, 0.34 * h, 0], seg: 9, color: o.color ?? COLORS.grass })
          } else if (kind === 'cone') {
            this.cylinder({ r: 0.05 * h, h: 0.25 * h, seg: 6, ...trunk })
            this.cone({ r: 0.27 * h, h: 0.82 * h, at: [0, 0.18 * h, 0], seg: 9, color: o.color ?? COLORS.forest })
          } else if (kind === 'pine') {
            const c = o.color ?? COLORS.pine
            this.beam({ from: [0, 0, 0], to: [0.1 * h, 0.42 * h, 0.02 * h], size: 0.07 * h, ...trunk })
            this.beam({ from: [0.1 * h, 0.42 * h, 0.02 * h], to: [-0.04 * h, 0.78 * h, 0], size: 0.06 * h, ...trunk })
            this.sphere({ r: 0.26 * h, squash: 0.36, at: [0.2 * h, 0.4 * h, 0.06 * h], seg: 9, color: c })
            this.sphere({ r: 0.22 * h, squash: 0.38, at: [-0.14 * h, 0.58 * h, -0.05 * h], seg: 9, color: c })
            this.sphere({ r: 0.18 * h, squash: 0.42, at: [-0.02 * h, 0.8 * h, 0.02 * h], seg: 9, color: c })
          } else if (kind === 'sakura') {
            const c = o.color ?? '#F2B5C6'
            this.cylinder({ r: 0.06 * h, rTop: 0.04 * h, h: 0.45 * h, seg: 6, color: COLORS.darkWood })
            this.sphere({ r: 0.27 * h, at: [0, 0.42 * h, 0], seg: 9, color: c })
            this.sphere({ r: 0.2 * h, at: [0.2 * h, 0.36 * h, 0.05 * h], seg: 8, color: c })
            this.sphere({ r: 0.2 * h, at: [-0.18 * h, 0.38 * h, -0.06 * h], seg: 8, color: c })
          } else {
            const c = o.color ?? '#4F9A3B'
            const p1: Vec3 = [0.05 * h, 0.35 * h, 0]
            const p2: Vec3 = [0.12 * h, 0.68 * h, 0]
            const top: Vec3 = [0.16 * h, 0.9 * h, 0]
            this.beam({ from: [0, 0, 0], to: p1, size: 0.06 * h, ...trunk })
            this.beam({ from: p1, to: p2, size: 0.055 * h, ...trunk })
            this.beam({ from: p2, to: top, size: 0.05 * h, ...trunk })
            for (let k = 0; k < 7; k++) {
              const a = (k / 7) * Math.PI * 2 + 0.3
              const end: Vec3 = [top[0] + Math.cos(a) * 0.36 * h, top[1] - 0.12 * h, top[2] + Math.sin(a) * 0.36 * h]
              this.beam({ from: top, to: end, size: 0.012 * h, width: 0.1 * h, color: c })
            }
          }
        }),
      { appear: o.appear ?? 'grow' },
    )
  }

  /** 人（背丈 0.1 前後）。color は服の色。省略すると種から選ぶ */
  person(o: Place & { color?: string; h?: number }): void {
    const s = (o.h ?? 0.11) / 0.11
    const color = o.color ?? this.pick(PEOPLE_COLORS)
    this.part(() =>
      this.at(o, () =>
        this.at({ scale: s }, () => {
          this.cylinder({ r: 0.024, rTop: 0.018, h: 0.064, seg: 6, color })
          this.sphere({ r: 0.019, at: [0, 0.064, 0], seg: 6, color: COLORS.skin })
        }),
      ),
    )
  }

  /** 車。前は +Z。color は車体の色 */
  car(o: Place & { color?: string; len?: number }): void {
    const s = (o.len ?? 0.26) / 0.26
    const color = o.color ?? this.pick(CAR_COLORS)
    this.part(() =>
      this.at(o, () =>
        this.at({ scale: s }, () => {
          this.box({ w: 0.118, h: 0.026, d: 0.2, color: COLORS.tire })
          this.box({ w: 0.124, h: 0.05, d: 0.26, at: [0, 0.02, 0], color, finish: 'gloss' })
          this.box({ w: 0.106, h: 0.044, d: 0.13, at: [0, 0.07, -0.015], color: '#34404E', finish: 'gloss' })
        }),
      ),
    )
  }

  /** 船。kind：row（小舟）・ship（客船）。前は +Z。水面の上に置く */
  boat(o: Place & { kind?: 'row' | 'ship'; len?: number; color?: string }): void {
    const kind = o.kind ?? 'row'
    const len = o.len ?? (kind === 'row' ? 0.5 : 1.0)
    this.part(() =>
      this.at(o, () => {
        const w = len * (kind === 'row' ? 0.36 : 0.26)
        const hull: XZ[] = [
          [-w / 2, -len / 2],
          [w / 2, -len / 2],
          [w / 2, len * 0.1],
          [0, len / 2],
          [-w / 2, len * 0.1],
        ]
        if (kind === 'row') {
          this.extrude({ points: hull, h: len * 0.14, color: o.color ?? COLORS.wood })
          this.box({ w: w * 0.9, h: len * 0.03, d: len * 0.1, at: [0, len * 0.1, -len * 0.08], color: '#C9A877' })
        } else {
          this.extrude({ points: hull, h: len * 0.1, color: o.color ?? COLORS.white, finish: 'satin' })
          this.extrude({ points: hull, h: len * 0.025, at: [0, len * 0.1, 0], color: '#2F5F9E' })
          this.box({ w: w * 0.7, h: len * 0.09, d: len * 0.42, at: [0, len * 0.125, -len * 0.08], color: COLORS.white })
          this.cylinder({ r: len * 0.035, h: len * 0.1, at: [0, len * 0.215, -len * 0.14], seg: 8, color: '#C8402F' })
        }
      }),
    )
  }

  /** 鹿。前は +Z */
  deer(o: Place & { color?: string }): void {
    const c = o.color ?? '#A8743F'
    this.part(() =>
      this.at(o, () => {
        for (const [x, z] of [[-0.017, -0.045], [0.017, -0.045], [-0.017, 0.045], [0.017, 0.045]] as const) {
          this.box({ w: 0.013, h: 0.07, d: 0.013, at: [x, 0, z], color: c })
        }
        this.box({ w: 0.05, h: 0.05, d: 0.13, at: [0, 0.062, 0], color: c })
        this.beam({ from: [0, 0.1, 0.05], to: [0, 0.155, 0.075], size: 0.024, color: c })
        this.box({ w: 0.028, h: 0.028, d: 0.05, at: [0, 0.145, 0.088], color: c })
        this.box({ w: 0.016, h: 0.014, d: 0.012, at: [0, 0.09, -0.068], color: '#F3EEE4' })
      }),
    )
  }

  /** らくだ。rider で人を乗せる。前は +Z */
  camel(o: Place & { color?: string; rider?: boolean }): void {
    const c = o.color ?? '#C59A68'
    this.part(() =>
      this.at(o, () => {
        for (const [x, z] of [[-0.03, -0.07], [0.03, -0.07], [-0.03, 0.07], [0.03, 0.07]] as const) {
          this.box({ w: 0.018, h: 0.13, d: 0.018, at: [x, 0, z], color: c })
        }
        this.sphere({ r: 0.07, squash: 0.7, at: [0, 0.11, 0], seg: 8, color: c, scale: [0.85, 1, 1.4] })
        this.sphere({ r: 0.042, at: [0, 0.165, -0.01], seg: 7, color: c })
        this.beam({ from: [0, 0.15, 0.08], to: [0, 0.125, 0.15], size: 0.026, color: c })
        this.beam({ from: [0, 0.125, 0.15], to: [0, 0.205, 0.19], size: 0.024, color: c })
        this.box({ w: 0.028, h: 0.03, d: 0.06, at: [0, 0.195, 0.205], color: c })
        if (o.rider) {
          this.cylinder({ r: 0.02, rTop: 0.016, h: 0.05, at: [0, 0.2, -0.01], seg: 6, color: '#F1EEE6' })
          this.sphere({ r: 0.016, at: [0, 0.25, -0.01], seg: 6, color: COLORS.skin })
        }
      }),
    )
  }

  // ---- 仕上げ ----

  /** build のあとに呼ぶ。部品の一覧・高さ・外形・上限の注意を返す */
  finish(): LandmarkModel {
    const warnings: string[] = []
    const triangles = this.built.reduce((sum, p) => sum + p.triangles, 0)
    if (this.built.length > LIMITS.parts) warnings.push(`部品が ${this.built.length} 個（上限 ${LIMITS.parts}）`)
    if (triangles > LIMITS.triangles) warnings.push(`三角形が ${triangles} 枚（上限 ${LIMITS.triangles}）`)
    let height = 0
    let reach = 0
    for (const p of this.built) {
      height = Math.max(height, p.maxY)
      reach = Math.max(reach, p.reach)
    }
    if (reach > REACH_LIMIT) warnings.push(`台座からはみ出している（中心から ${reach.toFixed(2)}）`)
    return {
      id: this.id,
      parts: this.built,
      groundColor: new Color(this.groundHex),
      height,
      triangles,
      envelope: buildEnvelope(this.built),
      warnings,
    }
  }

  // ---- 内部 ----

  /** 形を今の座標へ置き、色を付けて、部品にする（part の中なら貯める） */
  private emit(geometry: BufferGeometry, look: Look, place: Place, appear?: Appear): void {
    const top = this.stack[this.stack.length - 1] ?? new Matrix4()
    const m = top.clone().multiply(placeMatrix(place))
    const g = normalize(geometry)
    g.applyMatrix4(m)
    if (m.determinant() < 0) flipWinding(g)
    paintAttributes(g, look)
    if (this.collecting) this.collecting.push(g)
    else this.finishPart([g], appear ?? this.appearStyle)
  }

  private finishPart(chunks: BufferGeometry[], appear: Appear): void {
    const geometry = chunks.length === 1 && chunks[0] ? chunks[0] : mergeGeometries(chunks)
    const colored = this.stageNo === 4 ? 1 : 0
    const fin = geometry.getAttribute('aFinish') as BufferAttribute
    for (let i = 0; i < fin.count; i++) fin.setZ(i, colored)
    const pos = geometry.getAttribute('position') as BufferAttribute
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    let reach = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      maxZ = Math.max(maxZ, z)
      reach = Math.max(reach, Math.hypot(x, z))
    }
    const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
    this.built.push({
      geometry,
      stage: this.stageNo,
      order: this.orderNo,
      appear,
      minY,
      maxY,
      radial: Math.hypot(center.x, center.z),
      reach,
      size: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2,
      center,
      triangles: (geometry.index?.count ?? pos.count) / 3,
    })
  }
}

const PEOPLE_COLORS = ['#3D5BA9', '#C8453B', '#E2A93B', '#3F8C6B', '#6D4C93', '#F2F0EA', '#2F3A4F', '#D9738F'] as const
const CAR_COLORS = ['#E8E6E1', '#C83A32', '#2F5FA8', '#2B2D33', '#F0C43A', '#9AA3AD'] as const

/** 名所 id と作り方から模型を作る */
export function buildModel(id: string, builder: LandmarkBuilder): LandmarkModel {
  const kit = new Kit(id)
  builder(kit)
  return kit.finish()
}

// ===== 形の下ごしらえ =====

function placeMatrix(place: Place): Matrix4 {
  const [x, y, z] = place.at ?? [0, 0, 0]
  const q = new Quaternion()
  if (place.rot) q.setFromEuler(new Euler(place.rot[0] * DEG, place.rot[1] * DEG, place.rot[2] * DEG))
  if (place.rotY) q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), place.rotY * DEG))
  const s = place.scale ?? 1
  const scale = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(s[0], s[1], s[2])
  return new Matrix4().compose(new Vector3(x, y, z), q, scale)
}

/** position と normal だけを残し、index を必ず持たせた複製を作る */
function normalize(src: BufferGeometry): BufferGeometry {
  const pos = src.getAttribute('position')
  if (!src.getAttribute('normal')) src.computeVertexNormals()
  const nor = src.getAttribute('normal')
  const g = new BufferGeometry()
  const p = new Float32Array(pos.count * 3)
  const n = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    p[i * 3] = pos.getX(i)
    p[i * 3 + 1] = pos.getY(i)
    p[i * 3 + 2] = pos.getZ(i)
    n[i * 3] = nor.getX(i)
    n[i * 3 + 1] = nor.getY(i)
    n[i * 3 + 2] = nor.getZ(i)
  }
  g.setAttribute('position', new BufferAttribute(p, 3))
  g.setAttribute('normal', new BufferAttribute(n, 3))
  const index = src.getIndex()
  const idx = new Uint32Array(index ? index.count : pos.count)
  for (let i = 0; i < idx.length; i++) idx[i] = index ? index.getX(i) : i
  g.setIndex(new BufferAttribute(idx, 1))
  src.dispose()
  return g
}

function flipWinding(g: BufferGeometry): void {
  const index = g.getIndex()
  if (!index) return
  for (let i = 0; i + 2 < index.count; i += 3) {
    const b = index.getX(i + 1)
    index.setX(i + 1, index.getX(i + 2))
    index.setX(i + 2, b)
  }
}

const tmpColor = new Color()

function paintAttributes(g: BufferGeometry, look: Look): void {
  const count = g.getAttribute('position').count
  tmpColor.set(look.color ?? COLORS.white)
  const [metal, rough] = FINISH[look.finish ?? 'matte']
  const c = new Float32Array(count * 3)
  const f = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    c[i * 3] = tmpColor.r
    c[i * 3 + 1] = tmpColor.g
    c[i * 3 + 2] = tmpColor.b
    f[i * 3] = metal
    f[i * 3 + 1] = rough
    f[i * 3 + 2] = 0
  }
  g.setAttribute('aTrue', new BufferAttribute(c, 3))
  g.setAttribute('aFinish', new BufferAttribute(f, 3))
}

const ATTRS = ['position', 'normal', 'aTrue', 'aFinish'] as const

/** 同じ属性を持つ形をつなげて1つにする */
export function mergeGeometries(list: readonly BufferGeometry[]): BufferGeometry {
  let vertices = 0
  let indices = 0
  for (const g of list) {
    vertices += g.getAttribute('position').count
    indices += g.getIndex()?.count ?? 0
  }
  const out = new BufferGeometry()
  const first = list[0]
  for (const name of ATTRS) {
    if (!first?.getAttribute(name)) continue
    const arr = new Float32Array(vertices * 3)
    let offset = 0
    for (const g of list) {
      const a = g.getAttribute(name)
      arr.set(a.array as Float32Array, offset)
      offset += a.count * 3
    }
    out.setAttribute(name, new BufferAttribute(arr, 3))
  }
  const idx = new Uint32Array(indices)
  let io = 0
  let vo = 0
  for (const g of list) {
    const index = g.getIndex()
    if (index) for (let i = 0; i < index.count; i++) idx[io++] = index.getX(i) + vo
    vo += g.getAttribute('position').count
  }
  out.setIndex(new BufferAttribute(idx, 1))
  return out
}

/** カメラの寄せ方に使う外形。頂点を高さ 0.25 刻みに分け、刻みごとに中心軸からいちばん遠い距離を取る */
function buildEnvelope(parts: readonly BuiltPart[]): [number, number][] {
  const step = 0.25
  const bins = new Map<number, [number, number]>()
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      const k = Math.round(y / step)
      const cur = bins.get(k)
      if (!cur) bins.set(k, [r, y])
      else bins.set(k, [Math.max(cur[0], r), Math.max(cur[1], y)])
    }
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
}

// ===== 形の作り方 =====

/** 平らな面の集まりから立体を作る。各面は外から見て反時計回りの点の並び */
function solid(faces: ReadonlyArray<ReadonlyArray<Vec3>>): BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  for (const raw of faces) {
    const face = raw.filter((p, i) => {
      const q = raw[(i + raw.length - 1) % raw.length]
      return !q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-9
    })
    if (face.length < 3) continue
    let nx = 0
    let ny = 0
    let nz = 0
    for (let i = 0; i < face.length; i++) {
      const a = face[i] as Vec3
      const b = face[(i + 1) % face.length] as Vec3
      nx += (a[1] - b[1]) * (a[2] + b[2])
      ny += (a[2] - b[2]) * (a[0] + b[0])
      nz += (a[0] - b[0]) * (a[1] + b[1])
    }
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-12) continue
    const base = pos.length / 3
    for (const p of face) {
      pos.push(p[0], p[1], p[2])
      nor.push(nx / len, ny / len, nz / len)
    }
    for (let i = 1; i + 1 < face.length; i++) idx.push(base, base + i, base + i + 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setIndex(idx)
  return g
}

function frustumGeometry(bw: number, bd: number, tw: number, td: number, h: number): BufferGeometry {
  const b = (x: number, z: number): Vec3 => [x * bw * 0.5, 0, z * bd * 0.5]
  const t = (x: number, z: number): Vec3 => [x * tw * 0.5, h, z * td * 0.5]
  const B0 = b(-1, -1)
  const B1 = b(1, -1)
  const B2 = b(1, 1)
  const B3 = b(-1, 1)
  const T0 = t(-1, -1)
  const T1 = t(1, -1)
  const T2 = t(1, 1)
  const T3 = t(-1, 1)
  return solid([
    [B0, B1, B2, B3],
    [T3, T2, T1, T0],
    [B3, B2, T2, T3],
    [B1, B0, T0, T1],
    [B2, B1, T1, T2],
    [B0, B3, T3, T0],
  ])
}

function gableRoofGeometry(w: number, d: number, h: number, over: number): BufferGeometry {
  const W = w / 2 + over
  const D = d / 2 + over
  const E0: Vec3 = [-W, 0, -D]
  const E1: Vec3 = [W, 0, -D]
  const E2: Vec3 = [W, 0, D]
  const E3: Vec3 = [-W, 0, D]
  const R0: Vec3 = [-W, h, 0]
  const R1: Vec3 = [W, h, 0]
  return solid([
    [E0, E1, E2, E3],
    [E3, E2, R1, R0],
    [E1, E0, R0, R1],
    [E2, E1, R1],
    [E0, E3, R0],
  ])
}

function hipRoofGeometry(w: number, d: number, h: number, over: number, ridge?: number): BufferGeometry {
  const W = w / 2 + over
  const D = d / 2 + over
  const rx = Math.min(W, Math.max(0, ridge ?? W - D))
  const E0: Vec3 = [-W, 0, -D]
  const E1: Vec3 = [W, 0, -D]
  const E2: Vec3 = [W, 0, D]
  const E3: Vec3 = [-W, 0, D]
  const R0: Vec3 = [-rx, h, 0]
  const R1: Vec3 = [rx, h, 0]
  return solid([
    [E0, E1, E2, E3],
    [E3, E2, R1, R0],
    [E1, E0, R0, R1],
    [E2, E1, R1],
    [E0, E3, R0],
  ])
}

interface CurvedRoofParams {
  w: number
  d: number
  h: number
  style: 'irimoya' | 'yosemune' | 'hogyo' | 'skirt'
  overhang: number
  upturn: number
  curve: number
  thick: number
  ridge?: number | undefined
  top?: { w: number; d: number } | undefined
}

/**
 * 反り屋根。軒の四角から棟へ向かって輪を積み、各辺を面として張る。
 * 隅ほど軒先が持ち上がり（反り）、上ほど急になる（凹んだ斜面）。入母屋は上の部分の妻側を垂直な三角にする。
 */
function curvedRoofGeometry(o: CurvedRoofParams): { roof: BufferGeometry; gables: BufferGeometry | null } {
  const W = o.w / 2 + o.overhang
  const D = o.d / 2 + o.overhang
  let topX = 0
  let topZ = 0
  if (o.style === 'skirt') {
    topX = (o.top?.w ?? o.w * 0.6) / 2
    topZ = (o.top?.d ?? o.d * 0.6) / 2
  } else if (o.style === 'yosemune') {
    topX = o.ridge ?? Math.max(0, W - D)
  } else if (o.style === 'irimoya') {
    topX = o.ridge ?? Math.max(W * 0.38, W - D * 0.62)
  }
  const gableT = 0.5
  const K = 10
  const M = 10
  const ax = (t: number) => {
    if (o.style === 'irimoya') return W + (topX - W) * Math.min(1, t / gableT)
    return W + (topX - W) * t
  }
  const az = (t: number) => D + (topZ - D) * t
  const y = (t: number) => o.h * t ** o.curve
  const lift = (t: number, c: number) => o.upturn * c ** 2.5 * (1 - t) ** 2
  // 4つの隅（上から見て）を、外から見て右から左へ回る順に並べる
  const corner = (k: 0 | 1 | 2 | 3, t: number): [number, number] => {
    const X = ax(t)
    const Z = az(t)
    return k === 0 ? [X, Z] : k === 1 ? [-X, Z] : k === 2 ? [-X, -Z] : [X, -Z]
  }
  const roofPieces: BufferGeometry[] = []
  const gablePieces: BufferGeometry[] = []
  const point = (side: 0 | 1 | 2 | 3, t: number, u: number): Vec3 => {
    const a = corner(side, t)
    const b = corner(((side + 1) % 4) as 0 | 1 | 2 | 3, t)
    const c = Math.abs(2 * u - 1)
    return [a[0] + (b[0] - a[0]) * u, y(t) + lift(t, c), a[1] + (b[1] - a[1]) * u]
  }
  for (const side of [0, 1, 2, 3] as const) {
    const isEnd = side === 1 || side === 3
    if (o.style === 'irimoya' && isEnd) {
      roofPieces.push(gridPatch((k, i) => point(side, (k / K) * gableT, i / M), K, M))
      gablePieces.push(gridPatch((k, i) => point(side, gableT + (k / K) * (1 - gableT), i / M), K, M))
    } else {
      roofPieces.push(gridPatch((k, i) => point(side, k / K, i / M), K, M))
    }
  }
  // 軒先の厚み（鼻隠し）と底のふた
  const eave: Vec3[] = []
  for (const side of [0, 1, 2, 3] as const) {
    for (let i = 0; i < M; i++) eave.push(point(side, 0, i / M))
  }
  const strips: Vec3[][] = []
  const bottom: Vec3[] = []
  for (let i = 0; i < eave.length; i++) {
    const a = eave[i] as Vec3
    const b = eave[(i + 1) % eave.length] as Vec3
    const la: Vec3 = [a[0], a[1] - o.thick, a[2]]
    const lb: Vec3 = [b[0], b[1] - o.thick, b[2]]
    // a は外から見て右、b は左。右下→右上→左上→左下 の順が外向き
    strips.push([la, a, b, lb])
    bottom.push(la)
  }
  const cap: Vec3[][] = []
  const center: Vec3 = [0, -o.thick, 0]
  for (let i = 0; i < bottom.length; i++) {
    cap.push([center, bottom[i] as Vec3, bottom[(i + 1) % bottom.length] as Vec3])
  }
  roofPieces.push(solid([...strips, ...cap]))
  if (topX > 0 && o.style !== 'skirt') {
    const cap2 = new BoxGeometry(topX * 2 + 0.06, 0.05, 0.06).translate(0, o.h + 0.01, 0)
    roofPieces.push(cap2)
  }
  const roof = mergeGeometries(roofPieces.map(normalize))
  const gables = gablePieces.length > 0 ? mergeGeometries(gablePieces.map(normalize)) : null
  return { roof, gables }
}

/** (K+1)×(M+1) の格子の面。点は k（下→上）・i（外から見て右→左）で決める */
function gridPatch(at: (k: number, i: number) => Vec3, K: number, M: number): BufferGeometry {
  const pos: number[] = []
  for (let k = 0; k <= K; k++) {
    for (let i = 0; i <= M; i++) pos.push(...at(k, i))
  }
  const idx: number[] = []
  const id = (k: number, i: number) => k * (M + 1) + i
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < M; i++) {
      const A = id(k, i)
      const B = id(k, i + 1)
      const C = id(k + 1, i + 1)
      const Dd = id(k + 1, i)
      idx.push(A, Dd, C, A, C, B)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function beamGeometry(from: Vec3, to: Vec3, size: number, width?: number): BufferGeometry {
  const a = new Vector3(...from)
  const b = new Vector3(...to)
  const dir = b.clone().sub(a)
  const len = Math.max(1e-6, dir.length())
  const g = new BoxGeometry(width ?? size, len, size).translate(0, len / 2, 0)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize())
  g.applyQuaternion(q)
  g.translate(a.x, a.y, a.z)
  return g
}

function extrudeFootprint(points: readonly XZ[], h: number): BufferGeometry {
  const shape = new Shape(points.map(([x, z]) => new Vector2(x, -z)))
  const g = new ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 })
  g.rotateX(-Math.PI / 2)
  return g
}

function archGeometry(w: number, h: number, d: number, thick: number, seg: number): BufferGeometry {
  const inner = w / 2 - thick
  const spring = Math.max(0, h - thick - inner)
  const s = new Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(-inner, 0)
  s.lineTo(-inner, spring)
  for (let i = 1; i <= seg; i++) {
    const a = Math.PI - (Math.PI * i) / seg
    s.lineTo(Math.cos(a) * inner, spring + Math.sin(a) * inner)
  }
  s.lineTo(inner, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, h)
  s.lineTo(-w / 2, h)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: d, bevelEnabled: false, steps: 1 })
  g.translate(0, 0, -d / 2)
  return g
}

function latticeGeometry(w0: number, w1: number, h: number, bays: number, post: number, member: number, faces: boolean): BufferGeometry {
  const a0 = w0 / 2
  const a1 = w1 / 2
  const corners: XZ[] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ]
  const at = (c: XZ, y: number): Vec3 => {
    const a = a0 + (a1 - a0) * (y / h)
    return [c[0] * a, y, c[1] * a]
  }
  const parts: BufferGeometry[] = []
  for (const c of corners) parts.push(beamGeometry(at(c, 0), at(c, h), post))
  for (let s = 0; s < 4; s++) {
    const c0 = corners[s] as XZ
    const c1 = corners[(s + 1) % 4] as XZ
    if (!faces) {
      parts.push(beamGeometry(at(c0, h), at(c1, h), member * 1.6))
      continue
    }
    for (let b = 0; b < bays; b++) {
      const y0 = (h * b) / bays
      const y1 = (h * (b + 1)) / bays
      parts.push(beamGeometry(at(c0, y0), at(c1, y1), member))
      parts.push(beamGeometry(at(c1, y0), at(c0, y1), member))
      parts.push(beamGeometry(at(c0, y1), at(c1, y1), member))
      if (b === 0) parts.push(beamGeometry(at(c0, y0), at(c1, y0), member))
    }
  }
  return mergeGeometries(parts.map(normalize))
}
