/**
 * 形の道具。部品はすべて mm で作り、場面の根で 0.001 倍して m にする。
 *
 * - 形は MeshBag に「材質と一緒に」足していき、最後に材質ごとに1つのメッシュへまとめる（描画の回数を減らす）
 * - メッシュには用途の札（userData.kumimae）を付ける。body＝外形を決める本体／detail＝基板の上の部品などの飾り／
 *   decor＝ホースや縁の光など。外形の測定（measuredBox）は body だけを数える
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { forgetModels } from '../modelUse'

/** rim＝黒いケースの外形の縁の輪郭光（外形の測定には含めない） */
export type MeshTag = 'body' | 'detail' | 'decor' | 'rim'
export const TAG_KEY = 'kumimae'

export type Axis = 'x' | 'y' | 'z'

/** マージできる形にそろえる（インデックスなし・position/normal/uv の3つだけ） */
function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g
  if (out !== g) g.dispose()
  if (!out.getAttribute('normal')) out.computeVertexNormals()
  if (!out.getAttribute('uv')) {
    const n = out.getAttribute('position').count
    out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
  }
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name)
  }
  out.clearGroups()
  return out
}

/** 材質と札ごとに形を集め、最後にまとめる袋 */
export class MeshBag {
  private readonly instances: THREE.InstancedMesh[] = []

  repeat(material: THREE.Material, geometry: THREE.BufferGeometry, positions: [number, number, number][], name: string, tag: MeshTag = 'detail'): this {
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length)
    positions.forEach((p, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(...p)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    mesh.name = name
    mesh.userData[TAG_KEY] = tag
    this.instances.push(mesh)
    return this
  }

  private readonly buckets = new Map<string, { material: THREE.Material; tag: MeshTag; geometries: THREE.BufferGeometry[] }>()

  add(material: THREE.Material, geometry: THREE.BufferGeometry, tag: MeshTag = 'body'): this {
    const key = `${material.uuid}:${tag}`
    let b = this.buckets.get(key)
    if (!b) {
      b = { material, tag, geometries: [] }
      this.buckets.set(key, b)
    }
    b.geometries.push(normalize(geometry))
    return this
  }

  /** まとめたメッシュを group に入れて返す */
  build(name: string): THREE.Group {
    const group = new THREE.Group()
    group.name = name
    for (const b of this.buckets.values()) {
      const merged = b.geometries.length === 1 ? b.geometries[0]! : mergeGeometries(b.geometries, false)
      if (!merged) throw new Error(`形をまとめられません: ${name}`)
      if (merged !== b.geometries[0]) for (const g of b.geometries) g.dispose()
      merged.computeBoundingBox()
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, b.material)
      mesh.userData[TAG_KEY] = b.tag
      mesh.name = `${name}:${b.tag}`
      if (isTransparent(b.material)) mesh.renderOrder = 2
      group.add(mesh)
    }
    // 引数なしの add() は three が console.error を出す（繰り返しの形が無い部品が大半）
    if (this.instances.length > 0) group.add(...this.instances)
    this.instances.length = 0
    this.buckets.clear()
    return group
  }
}

const isTransparent = (m: THREE.Material) => m.transparent === true

// ---------------------------------------------------------------- 基本の形（mm・置く位置まで決めて返す）

/** 角を丸めた箱。[x0,x1]×[y0,y1]×[z0,z1] をちょうど埋める */
export function rbox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, radius = 0, segments = 2): THREE.BufferGeometry {
  const w = x1 - x0
  const h = y1 - y0
  const d = z1 - z0
  if (!(w > 0 && h > 0 && d > 0)) throw new Error(`大きさが 0 以下の箱: ${w}×${h}×${d}`)
  const r = Math.min(radius, w / 2, h / 2, d / 2)
  const g = r > 0.01 ? new RoundedBoxGeometry(w, h, d, segments, r) : new THREE.BoxGeometry(w, h, d)
  g.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2)
  return g
}

/** 回転で軸を向ける（円柱などの y 軸の形を axis に向ける） */
function orientY(g: THREE.BufferGeometry, axis: Axis): THREE.BufferGeometry {
  if (axis === 'x') g.rotateZ(-Math.PI / 2)
  else if (axis === 'z') g.rotateX(Math.PI / 2)
  return g
}

/** 円柱。中心 (cx,cy,cz)、軸 axis、半径 r、長さ len */
export function cylinder(axis: Axis, cx: number, cy: number, cz: number, r: number, len: number, segments = 32, rTop = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, r, len, segments)
  orientY(g, axis)
  g.translate(cx, cy, cz)
  return g
}

/** 輪（トーラス）。軸 axis の周りに半径 R、太さ r */
export function ring(axis: Axis, cx: number, cy: number, cz: number, R: number, r: number, segments = 48): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(R, r, 8, segments)
  // TorusGeometry は z 軸の周り
  if (axis === 'x') g.rotateY(Math.PI / 2)
  else if (axis === 'y') g.rotateX(Math.PI / 2)
  g.translate(cx, cy, cz)
  return g
}

/** 押し出し（形は xy 平面、z 方向へ depth）。axis はできあがりの押し出しの向き */
export function extrude(shape: THREE.Shape, depth: number, axis: Axis, cx: number, cy: number, cz: number, curveSegments = 24): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments })
  g.translate(0, 0, -depth / 2)
  if (axis === 'x') g.rotateY(Math.PI / 2)
  else if (axis === 'y') g.rotateX(-Math.PI / 2)
  g.translate(cx, cy, cz)
  return g
}

/** 角丸の四角（形） */
export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  const rr = Math.min(r, w / 2, h / 2)
  s.moveTo(x + rr, y)
  s.lineTo(x + w - rr, y)
  s.quadraticCurveTo(x + w, y, x + w, y + rr)
  s.lineTo(x + w, y + h - rr)
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  s.lineTo(x + rr, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - rr)
  s.lineTo(x, y + rr)
  s.quadraticCurveTo(x, y, x + rr, y)
  return s
}

/** 平らな板（片面）。UV を mm/tile で振る（メッシュ板の穴の大きさをそろえる） */
export function tiledPlane(axis: Axis, c0: [number, number, number], size: [number, number], tileMm: number): THREE.BufferGeometry {
  const [a, b] = size
  const g = new THREE.PlaneGeometry(a, b)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * a) / tileMm, (uv.getY(i) * b) / tileMm)
  // PlaneGeometry は xy 平面で +z 向き
  if (axis === 'x') g.rotateY(Math.PI / 2)
  else if (axis === 'y') g.rotateX(-Math.PI / 2)
  g.translate(c0[0], c0[1], c0[2])
  return g
}

// ---------------------------------------------------------------- ファン（ケースファン・クーラーのファン・GPU のファン）

/**
 * ファンの外形の向き。回転の軸 axis と、軸に直交する2辺（side1・side2）がどの座標に行くか。
 * - axis 'z': side1 → x、side2 → y
 * - axis 'x': side1 → z、side2 → y
 * - axis 'y': side1 → x、side2 → z
 */
export function fanExtents(axis: Axis, side1: number, side2: number, thickness: number): [number, number, number] {
  if (axis === 'z') return [side1, side2, thickness]
  if (axis === 'x') return [thickness, side2, side1]
  return [side1, thickness, side2]
}

/** 正準（軸 z・side1 が x・side2 が y・中心が原点）の形を、axis の向きに回す */
function orientFan(g: THREE.BufferGeometry, axis: Axis): THREE.BufferGeometry {
  // y 軸の周りに +90°: (x, y, z) → (z, y, −x)。軸 z → x、side1(x) → z
  if (axis === 'x') g.rotateY(Math.PI / 2)
  // x 軸の周りに −90°: (x, y, z) → (x, z, −y)。軸 z → y、side2(y) → z
  else if (axis === 'y') g.rotateX(-Math.PI / 2)
  return g
}

export interface FanMaterials {
  frame: THREE.Material
  blade: THREE.Material
  hub: THREE.Material
  /** 光る輪（RGB 付きのファン） */
  rgb?: THREE.Material | null
}

/** 羽根（扇形を薄く押し出し、放射方向の軸の周りにひねる）。厚み t の中に収まる */
export function blades(n: number, r0: number, r1: number, t: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const span = ((Math.PI * 2) / n) * 0.62
  // 薄い外寸では羽根の厚みも縮め、傾けた羽根がファンの幅を超えないようにする。
  const plate = Math.min(0.9, t * 0.3, r1 * 0.1)
  const reach = r1 * Math.sin(span / 2 + 0.16)
  const pitch = Math.min(0.5, Math.asin(Math.max(0, Math.min(1, (t / 2 - plate / 2 - 0.05) / reach))))
  for (let i = 0; i < n; i++) {
    const shape = new THREE.Shape()
    shape.moveTo(r0 * Math.cos(-span / 2), r0 * Math.sin(-span / 2))
    shape.absarc(0, 0, r1, -span / 2 + 0.08, span / 2 + 0.16, false)
    shape.absarc(0, 0, r0, span / 2, -span / 2, true)
    const g = new THREE.ExtrudeGeometry(shape, { depth: plate, bevelEnabled: false, curveSegments: 8 })
    g.translate(0, 0, -plate / 2)
    g.rotateX(pitch)
    g.rotateZ((i / n) * Math.PI * 2)
    out.push(g)
  }
  return out
}

/**
 * 角丸の四角い枠のファン（ケースファン・クーラーのファン）。
 * 外形は center を中心に fanExtents(axis, side1, side2, thickness) をちょうど埋める。羽根・ハブ・光る輪は枠の中に収める。
 */
export function addFan(
  bag: MeshBag,
  o: FanMaterials & { axis: Axis; center: [number, number, number]; side1: number; side2?: number; thickness: number; blades?: number },
): void {
  const s1 = o.side1
  const s2 = o.side2 ?? o.side1
  const t = o.thickness
  const minSide = Math.min(s1, s2)
  const list: { g: THREE.BufferGeometry; m: THREE.Material }[] = []
  const outer = roundedRectShape(s1, s2, minSide * 0.08)
  const rHole = minSide * 0.46
  const hole = new THREE.Path()
  hole.absarc(0, 0, rHole, 0, Math.PI * 2, true)
  outer.holes.push(hole)
  const frame = new THREE.ExtrudeGeometry(outer, { depth: t, bevelEnabled: false, curveSegments: 32 })
  frame.translate(0, 0, -t / 2)
  list.push({ g: frame, m: o.frame })
  const hubR = rHole * 0.34
  const hub = new THREE.CylinderGeometry(hubR, hubR, t * 0.86, 32)
  hub.rotateX(Math.PI / 2)
  list.push({ g: hub, m: o.hub })
  for (const g of blades(o.blades ?? 7, hubR * 0.92, rHole * 0.97, t)) list.push({ g, m: o.blade })
  if (o.rgb) {
    const inner = new THREE.TorusGeometry(hubR + Math.min(1.2, rHole * 0.05), Math.min(1.1, t * 0.2, hubR * 0.3), 8, 40)
    inner.translate(0, 0, t / 2 - Math.min(1.2, t * 0.25))
    list.push({ g: inner, m: o.rgb })
    const rim = new THREE.TorusGeometry(rHole * 0.98, Math.min(0.9, t * 0.18, rHole * 0.08), 6, 64)
    rim.translate(0, 0, t / 2 - Math.min(1, t * 0.2))
    list.push({ g: rim, m: o.rgb })
  }
  for (const { g, m } of list) {
    orientFan(g, o.axis)
    g.translate(o.center[0], o.center[1], o.center[2])
    bag.add(m, g)
  }
}

/**
 * 丸い枠のファン（GPU の外装に埋めたファン）。外形は直径 d × 厚み t（軸 axis）。center が中心。
 */
export function addRoundFan(
  bag: MeshBag,
  o: FanMaterials & { axis: Axis; center: [number, number, number]; diameter: number; thickness: number; blades?: number },
): void {
  const R = o.diameter / 2
  const t = o.thickness
  const list: { g: THREE.BufferGeometry; m: THREE.Material }[] = []
  // 枠: 薄い筒（外半径 R、内半径 R − 2.4）
  const shape = new THREE.Shape()
  shape.absarc(0, 0, R, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, R - 2.4, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const frame = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 48 })
  frame.translate(0, 0, -t / 2)
  list.push({ g: frame, m: o.frame })
  // 奥の暗い円板（外装の中が見えないように）
  const back = new THREE.CircleGeometry(R - 2.4, 48)
  back.rotateX(Math.PI) // 外（−z）へ向ける：外から覗いたときに見える面
  back.translate(0, 0, t / 2 - 0.05)
  list.push({ g: back, m: o.hub })
  const hubR = R * 0.3
  const hub = new THREE.CylinderGeometry(hubR, hubR, t * 0.9, 32)
  hub.rotateX(Math.PI / 2)
  list.push({ g: hub, m: o.hub })
  for (const g of blades(o.blades ?? 9, hubR * 0.95, R - 3, t)) list.push({ g, m: o.blade })
  for (const { g, m } of list) {
    orientFan(g, o.axis)
    g.translate(o.center[0], o.center[1], o.center[2])
    bag.add(m, g)
  }
}

// ---------------------------------------------------------------- 外形の測定

/** 札が body のメッシュだけで外形を測る（部品の外形＝データの寸法を確かめる用） */
export function measuredBox(root: THREE.Object3D, tags: MeshTag[] = ['body'], skip?: (mesh: THREE.Mesh) => boolean): THREE.Box3 {
  // 親（場面の根の 0.001 倍など）の行列から更新する（updateMatrixWorld は親の古い行列を使う）
  root.updateWorldMatrix(true, true)
  const box = new THREE.Box3()
  const tmp = new THREE.Box3()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !tags.includes(mesh.userData[TAG_KEY] as MeshTag) || skip?.(mesh)) return
    const inst = mesh as THREE.InstancedMesh
    if (inst.isInstancedMesh) {
      if (!inst.boundingBox) inst.computeBoundingBox()
      tmp.copy(inst.boundingBox!).applyMatrix4(mesh.matrixWorld)
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld)
    }
    box.union(tmp)
  })
  return box
}

/** 形と材質を捨てる（共有の材質は捨てない）。模式図の記録（modelUse）も消す */
export function disposeObject(root: THREE.Object3D, disposeMaterials = false): void {
  forgetModels(root)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    if (disposeMaterials && mesh.material) {
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of ms) m.dispose()
    }
  })
}
