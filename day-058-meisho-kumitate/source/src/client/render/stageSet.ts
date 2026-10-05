// 展示の舞台：背景の空のグラデーション、机、木目の台座、地面（台座の上面）。
// 色は palette.ts の Palette から取る（台座の木目だけは物の色なので、ここで決める）。
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  type Material,
} from 'three'
import { hashString, seededRandom } from '../landmarks/kit'
import type { Palette } from './palette'

/** 台座の大きさ（docs/04） */
export const PEDESTAL_RADIUS = 5
export const PEDESTAL_HEIGHT = 0.4
/** 地面（台座の上面）の半径。外側のわずかな縁は木 */
export const GROUND_RADIUS = 4.93

/** 画面いっぱいの空のグラデーション。いちばん先に描き、奥行きは書かない */
export function createBackground(p: Palette): Mesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
  const material = new ShaderMaterial({
    uniforms: { uTop: { value: p.backgroundTop.clone() }, uBottom: { value: p.backgroundBottom.clone() } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
varying vec2 vUv;
void main() {
  float t = smoothstep( 0.0, 1.0, vUv.y );
  vec3 c = mix( uBottom, uTop, t * t );
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new Mesh(g, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  return mesh
}

/** 机の上の、台座のまわりの陰の強さと広がり（台座の縁から外へ） */
const DESK_HALO = 0.42
const DESK_HALO_WIDTH = 2.6
/** 台座の影のふちのぼかし（半分の幅） */
const DESK_PENUMBRA = 0.14

/**
 * 机。台座のまわりは不透明、遠くへ行くほど透けて背景に溶ける。
 * 講評r1：塔や空中の部品の影が台座の外の机に落ち、遠い空のはずの背景が床や壁に見えた
 * → 机は影を受けない（receiveShadow true→false）。影は台座の上だけに出る。
 * 台座が浮いて見えないよう、台座そのものの影（日差しの向きにずれた円）と、台座のまわりの薄い陰を頂点の色に焼き込む。
 * 陰は、砂や白い粘土の台座が明るい背景に溶けないための縁取りも兼ねる
 */
export function createDesk(p: Palette): Mesh {
  // 台座のまわりだけを机にして、その奥は背景の空のグラデーションに溶かす
  const segs = 160
  const inner = 6.6
  const outer = 13
  // 影と陰のある台座の近くは細かく、遠くは粗く輪を並べる
  const radii: number[] = []
  for (let r = 4.6; r < 7.2; r += 0.08) radii.push(r)
  for (let r = 7.2; r < outer - 0.1; r += 0.4) radii.push(r)
  radii.push(outer)
  const rings = radii.length
  // 台座（半径5・高さ0.4）の影：日差しの向きへずれた円をつないだ形
  const sun = p.sunDirection
  const ox = (-sun.x / Math.max(0.05, sun.y)) * PEDESTAL_HEIGHT
  const oz = (-sun.z / Math.max(0.05, sun.y)) * PEDESTAL_HEIGHT
  const oo = ox * ox + oz * oz
  const shadeAt = (x: number, z: number): [number, number, number] => {
    const t = oo > 0 ? Math.min(1, Math.max(0, (x * ox + z * oz) / oo)) : 0
    const d = Math.hypot(x - t * ox, z - t * oz)
    const cover = 1 - smooth(PEDESTAL_RADIUS + 0.02 - DESK_PENUMBRA, PEDESTAL_RADIUS + 0.02 + DESK_PENUMBRA, d)
    const r = Math.hypot(x, z)
    const k = 1 - smooth(PEDESTAL_RADIUS, PEDESTAL_RADIUS + DESK_HALO_WIDTH, r)
    // 陰も日陰と同じ色合い（空の光の青み）にする。暖かい砂色の台座と、色合いでも分かれる
    const shade = Math.max(cover, DESK_HALO * k * k)
    const s = p.deskShadow
    return [1 + (s.r - 1) * shade, 1 + (s.g - 1) * shade, 1 + (s.b - 1) * shade]
  }
  const pos: number[] = []
  const col: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  pos.push(0, 0, 0)
  nor.push(0, 1, 0)
  col.push(...shadeAt(0, 0), 1)
  for (let r = 1; r <= rings; r++) {
    const radius = radii[r - 1] ?? outer
    const fade = radius <= inner ? 1 : 1 - smooth(inner, outer, radius)
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2
      const x = Math.cos(a) * radius
      const z = Math.sin(a) * radius
      pos.push(x, 0, z)
      nor.push(0, 1, 0)
      col.push(...shadeAt(x, z), fade)
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s)
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs
    const a1 = 1 + r * segs
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs
      idx.push(a0 + s, a0 + s1, a1 + s1, a0 + s, a1 + s1, a1 + s)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 4))
  g.setIndex(idx)
  const material = new MeshStandardMaterial({
    color: p.desk.clone(),
    roughness: 0.78,
    metalness: 0,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new Mesh(g, material)
  mesh.receiveShadow = false
  mesh.renderOrder = -10
  return mesh
}

/** 木目の台座の側面と、上面の縁 */
export function createPedestal(): { side: Mesh; rim: Mesh } {
  const wood = createWoodTexture()
  const sideMaterial = new MeshStandardMaterial({ map: wood, roughness: 0.62, metalness: 0 })
  // 上ぶたは地面と同じ高さで重なってちらつくので付けない（上面は地面と縁で作る）
  const side = new Mesh(new CylinderGeometry(PEDESTAL_RADIUS, PEDESTAL_RADIUS + 0.04, PEDESTAL_HEIGHT, 128, 1, true), sideMaterial)
  side.position.y = PEDESTAL_HEIGHT / 2
  side.castShadow = true
  side.receiveShadow = true
  const rimGeometry = new RingGeometry(GROUND_RADIUS - 0.005, PEDESTAL_RADIUS, 128, 1)
  rimGeometry.rotateX(-Math.PI / 2)
  const rim = new Mesh(rimGeometry, new MeshStandardMaterial({ color: new Color('#A87650'), roughness: 0.5, metalness: 0 }))
  rim.position.y = PEDESTAL_HEIGHT + 0.0015
  rim.receiveShadow = true
  return { side, rim }
}

/** 地面（台座の上面）の形。本当の色は setGroundColor で入れる */
export function createGround(material: Material): Mesh {
  const rings = 14
  const segs = 96
  const pos: number[] = [0, 0, 0]
  const idx: number[] = []
  for (let r = 1; r <= rings; r++) {
    const radius = (GROUND_RADIUS * r) / rings
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2
      pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius)
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s)
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs
    const a1 = 1 + r * segs
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs
      idx.push(a0 + s, a0 + s1, a1 + s1, a0 + s, a1 + s1, a1 + s)
    }
  }
  const count = pos.length / 3
  const nor = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) nor[i * 3 + 1] = 1
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setAttribute('aTrue', new BufferAttribute(new Float32Array(count * 3), 3))
  const finish = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) finish[i * 3 + 1] = 0.92
  g.setAttribute('aFinish', new BufferAttribute(finish, 3))
  g.setIndex(idx)
  const mesh = new Mesh(g, material)
  mesh.position.y = PEDESTAL_HEIGHT
  mesh.receiveShadow = true
  return mesh
}

/** 地面の本当の色を入れる。名所 id から作った種で、明るさをなだらかな斑にばらつかせる（草や砂のむら） */
export function setGroundColor(ground: Mesh, color: Color, id: string): void {
  const attr = ground.geometry.getAttribute('aTrue') as BufferAttribute
  const pos = ground.geometry.getAttribute('position') as BufferAttribute
  const rand = seededRandom(hashString(`${id}:ground`))
  const waves = Array.from({ length: 5 }, () => {
    const a = rand() * Math.PI * 2
    return { kx: Math.cos(a) * (0.6 + rand() * 1.4), kz: Math.sin(a) * (0.6 + rand() * 1.4), ph: rand() * Math.PI * 2 }
  })
  const c = new Color()
  for (let i = 0; i < attr.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    let n = 0
    for (const w of waves) n += Math.sin(x * w.kx + z * w.kz + w.ph)
    const k = 1 + (n / waves.length) * 0.09
    c.copy(color).multiplyScalar(k)
    attr.setXYZ(i, c.r, c.g, c.b)
  }
  attr.needsUpdate = true
}

/** 台座の側面の木目。横に走る年輪の筋を、決まった種で描く */
function createWoodTexture(): CanvasTexture {
  const w = 512
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const rand = seededRandom(20261001)
    ctx.fillStyle = '#8A5A39'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y++) {
      const wave = Math.sin(y * 0.55 + Math.sin(y * 0.17) * 2.4)
      const base = 0.5 + 0.5 * wave
      for (let x = 0; x < w; x += 8) {
        const k = base * 0.6 + rand() * 0.4
        const r = Math.round(118 + 40 * k)
        const g = Math.round(76 + 28 * k)
        const b = Math.round(46 + 18 * k)
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(x, y, 8, 1)
      }
    }
    ctx.globalAlpha = 0.35
    for (let i = 0; i < 26; i++) {
      const y = rand() * h
      ctx.fillStyle = rand() < 0.5 ? '#5E3A22' : '#B07D52'
      ctx.fillRect(0, y, w, 0.6 + rand() * 1.2)
    }
    ctx.globalAlpha = 1
  }
  const tex = new CanvasTexture(canvas)
  // 上下の向きをはっきりさせる（キャンバスの上の行を側面の下に貼る。筋は横向きなので見た目は変わらない）
  tex.flipY = false
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.repeat.set(6, 1)
  tex.anisotropy = 4
  return tex
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
