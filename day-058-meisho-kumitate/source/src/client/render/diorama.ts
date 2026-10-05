// 名所のミニチュアを描く画面部品。段Bの画面担当は createDioramaView() だけを使う。
// 進み具合 p から絵を決める（時刻ではなく p）ので、同じ p なら必ず同じ絵になる。
import {
  BatchedMesh,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Matrix4,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  type WebGLRenderTarget,
} from 'three'
import { boundedPixelRatio, canStartDrag, defaultQuality, releaseVelocity } from './mobile-policy'
import { buildLandmark, preloadLandmark } from '../landmarks'
import { COLORS } from '../landmarks/kit'
import { AssemblyEvents, buildSchedule, clampProgress, paintAmount, partPose, type Appear, type Schedule } from './assembly'
import { fitFrame } from './framing'
import { createPaintMaterial, createPaintUniforms, groundUniforms, paintLevel } from './paintMaterial'
import { BRIGHT_DAY, createSkyTexture, derivePalette } from './palette'
import { MiniaturePost, type Focus, type Grade, type PostSettings } from './post'
import {
  createBackground,
  createDesk,
  createGround,
  createPedestal,
  PEDESTAL_HEIGHT,
  PEDESTAL_RADIUS,
  setGroundColor,
} from './stageSet'

export type Quality = 'high' | 'low' | 'test'

export interface PartLandedEvent {
  /** 部品の大きさ（外接球の半径の目安。台座の半径が5） */
  size: number
  /** 部品の段階（1〜4） */
  stage: number
}

/** 画面側に渡す API（段Bの画面担当がこれを呼ぶ） */
export interface DioramaView {
  mount(container: HTMLElement): void
  /** 'title' はタイトル画面用の飾りの島 */
  setLandmark(id: string): void
  /** 毎フレーム呼ばれる。0〜1（1を超えても完成のまま） */
  setProgress(p: number): void
  /** 答えあわせ：完成・色つきの状態へ */
  showComplete(): void
  /** ドラッグで回すかどうか */
  setInteractive(enabled: boolean): void
  onPartLanded(cb: (e: PartLandedEvent) => void): void
  onPaintStart(cb: () => void): void
  /** Called after the current model is successfully built, including a retry. */
  onModelReady?(cb: () => void): () => void
  setQuality(q: Quality): void
  resize(): void
  dispose(): void
}

/** 固定ショット用の指定（shots.html だけが使う） */
export interface ShotOptions {
  /** 回る台の角度（度） */
  azimuthDeg: number
  /** 見下ろし角（度）。省略は 35 */
  elevationDeg?: number
  quality?: Quality
}

/** 固定ショットと速さの計測のための追加の操作 */
export interface ShotView extends DioramaView {
  /** 時刻を進めずに、その場で1枚描く */
  renderNow(): void
  /** Await the most recently requested model before a fixed shot. */
  whenReady(): Promise<void>
  readonly renderer: WebGLRenderer | null
  info(): { parts: number; triangles: number; drawCalls: number; warnings: string[]; quality: Quality }
}

export function createDioramaView(): DioramaView {
  return new Diorama(null)
}

export function createShotView(options: ShotOptions): ShotView {
  return new Diorama(options)
}

// ---- 決めごと ----

const DEG = Math.PI / 180
/** カメラの既定の見下ろし角と、ドラッグで動かせる範囲 */
const DEFAULT_ELEVATION = 35
const MIN_ELEVATION = 20
const MAX_ELEVATION = 70
/** 回る台の速さ（度/秒） */
const TURNTABLE_SPEED = 6
/** 縦の画角（度）。狭めにして模型らしく見せる */
const V_FOV = 30
/** 模型を収める範囲（画面の中心から端までを 1 とした割合）。
 *  FIT_Y は段B1で 0.84→0.72 に下げた（横長の画面で、上の帯と早押しボタンに山頂や台座の手前が隠れていたため） */
const FIT_X = 0.9
const FIT_Y = 0.72
/** 答えあわせで完成形まで早回しする長さ */
const COMPLETE_MS = 900
/** ドラッグの効き（度/画素） */
const DRAG_YAW = 0.4
const DRAG_PITCH = 0.25

interface QualityPreset {
  shadows: boolean
  shadowMapSize: number
  post: PostSettings | null
  pixelRatioMax: number
  /** 毎フレーム描くか（false は要求があったときだけ） */
  continuous: boolean
  environment: boolean
}

const PRESETS: Readonly<Record<Quality, QualityPreset>> = {
  high: {
    shadows: true,
    shadowMapSize: 2048,
    post: { msaa: 4, blurScale: 1, taps: 6, maxBlur: 0.011 },
    pixelRatioMax: 2,
    continuous: true,
    environment: true,
  },
  low: {
    shadows: true,
    shadowMapSize: 1024,
    post: { msaa: 4, blurScale: 0.5, taps: 4, maxBlur: 0.009 },
    pixelRatioMax: 1.5,
    continuous: true,
    environment: true,
  },
  test: { shadows: false, shadowMapSize: 512, post: null, pixelRatioMax: 1, continuous: false, environment: false },
}

const GRADE: Grade = { exposure: 1.0, saturation: 1.12, vignette: 0.2 }

function qualityFromUrl(): Quality | null {
  if (typeof location === 'undefined') return null
  const g = new URLSearchParams(location.search).get('gfx')
  return g === 'low' || g === 'test' || g === 'high' ? g : null
}

/** 臨界減衰のばね（行き過ぎずに追いつく）を dt だけ進める */
function springStep(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const d = x - target
  const e = Math.exp(-omega * dt)
  const k = v + omega * d
  return [target + (d + k * dt) * e, (v - omega * k * dt) * e]
}

interface LoadedModel {
  id: string
  height: number
  envelope: [number, number][]
  groundColor: Color
  batch: BatchedMesh | null
  instanceIds: number[]
  schedule: Schedule
  events: AssemblyEvents
  /** 部品ごとの伸び縮みの中心（底の中心）x, y, z */
  pivots: Float32Array
  appears: Appear[]
  /** 部品ごとの前回の見え方 visible, lift, scaleY, scaleXZ */
  cache: Float32Array
  triangles: number
  warnings: string[]
}

class Diorama implements ShotView {
  renderer: WebGLRenderer | null = null
  private container: HTMLElement | null = null
  private readonly shot: ShotOptions | null
  private quality: Quality
  private readonly palette = derivePalette(BRIGHT_DAY)
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(V_FOV, 1, 0.1, 200)
  private readonly turntable = new Group()
  private readonly modelRoot = new Group()
  private readonly sun: DirectionalLight
  private readonly hemi: HemisphereLight
  private readonly paintUniforms = createPaintUniforms({ reflect: this.palette.metalReflect, floor: this.palette.metalFloor })
  private readonly partMaterial = createPaintMaterial(this.paintUniforms)
  private readonly groundMaterial = createPaintMaterial(groundUniforms(this.paintUniforms))
  private readonly ground: Mesh
  private post: MiniaturePost | null = null
  private envTarget: WebGLRenderTarget | null = null
  private model: LoadedModel | null = null
  private modelGeneration = 0
  private loading: Promise<void> = Promise.resolve()
  private loadingStatus: HTMLButtonElement | null = null

  private progress = 0
  private complete = false
  private completeFrom = 0
  private completeStart = -Infinity
  private lastDisplayP = 0

  private yaw = 0
  private yawVel = TURNTABLE_SPEED
  private elevation = DEFAULT_ELEVATION
  private elevationVel = 0
  private distance = 24
  private distanceVel = 0
  private distanceTarget = 24
  private snapCamera = true
  private shiftY = 0
  private targetY = 1.5
  private fitKey = ''
  private focus: Focus = { center: 0.5, band: 0.2, falloff: 0.3 }

  private interactive = true
  private dragging = false
  private pointerId = -1
  private lastX = 0
  private lastY = 0
  private lastT = 0
  private dragVel = 0

  private raf = 0
  private lastTime = 0
  private disposed = false
  private reducedMotion = false
  private media: MediaQueryList | null = null
  private resizeObserver: ResizeObserver | null = null
  private readonly landedListeners: ((e: PartLandedEvent) => void)[] = []
  private readonly paintListeners: (() => void)[] = []
  private readonly readyListeners: (() => void)[] = []
  private readonly tmpMatrix = new Matrix4()

  constructor(shot: ShotOptions | null) {
    this.shot = shot
    this.quality = shot?.quality ?? qualityFromUrl() ?? defaultQuality(
      typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    )
    if (shot) {
      this.yaw = shot.azimuthDeg
      this.elevation = shot.elevationDeg ?? DEFAULT_ELEVATION
      this.yawVel = 0
      this.interactive = false
    }
    const p = this.palette
    this.scene.add(createBackground(p))
    this.scene.add(createDesk(p))
    this.scene.fog = new Fog(p.fog.clone(), 40, 90)
    const pedestal = createPedestal()
    this.ground = createGround(this.groundMaterial)
    this.modelRoot.position.y = PEDESTAL_HEIGHT
    this.turntable.add(pedestal.side, pedestal.rim, this.ground, this.modelRoot)
    this.scene.add(this.turntable)

    this.sun = new DirectionalLight(p.sunColor.clone(), p.sunIntensity)
    this.sun.shadow.radius = 1
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    this.scene.add(this.sun, this.sun.target)
    this.hemi = new HemisphereLight(p.hemiSky.clone(), p.hemiGround.clone(), p.hemiIntensity)
    this.scene.add(this.hemi)
    setGroundColor(this.ground, new Color(COLORS.lawn), 'none')
    this.fitShadow(1)
  }

  // ---- 公開の操作 ----

  mount(container: HTMLElement): void {
    if (this.disposed) throw new Error('dispose 済みの DioramaView は使えない')
    if (this.renderer) throw new Error('mount は1回だけ呼ぶ')
    this.container = container
    const renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.shot !== null,
    })
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = NeutralToneMapping
    renderer.shadowMap.type = PCFShadowMap
    // 1フレームに描いた数（影・場面・後処理の合計）を数えるため、自動のリセットを切って draw() の頭で戻す
    renderer.info.autoReset = false
    this.renderer = renderer
    const canvas = renderer.domElement
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.outline = 'none'
    this.updateTouchAction()
    container.appendChild(canvas)

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.media = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.reducedMotion = this.media.matches
      if (this.reducedMotion) this.yawVel = 0
      this.media.addEventListener('change', this.onMotionPreference)
    }
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('lostpointercapture', this.onPointerCancel)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('blur', this.onWindowBlur)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(container)
    }
    this.applyQuality()
    this.resize()
    this.requestRender()
  }

  setLandmark(id: string): void {
    if (this.disposed) return
    const generation = ++this.modelGeneration
    this.unloadModel()
    this.progress = 0
    this.complete = false
    this.completeStart = -Infinity
    this.lastDisplayP = 0
    this.fitKey = ''
    this.requestRender()
    this.showLoadingStatus('模型を読み込み中…')
    this.loading = preloadLandmark(id).then(() => {
      if (this.disposed || generation !== this.modelGeneration) return
      this.installLandmark(id)
      this.loadingStatus?.remove()
      this.loadingStatus = null
      this.container?.setAttribute('aria-hidden', 'true')
      for (const cb of this.readyListeners) {
        try { cb() } catch (error) { console.error(error) }
      }
    })
    // Handle UI failures while preserving a rejection for whenReady() shot callers.
    void this.loading.catch((error: unknown) => {
      if (this.disposed || generation !== this.modelGeneration) return
      console.warn('[diorama] 模型を読み込めませんでした', error)
      this.showLoadingStatus('模型を読み込めません。通信を確認して再試行', () => this.setLandmark(id))
    })
  }

  whenReady(): Promise<void> {
    return this.loading
  }

  private showLoadingStatus(text: string, retry?: () => void): void {
    this.loadingStatus?.remove()
    const status = document.createElement('button')
    status.type = 'button'
    status.className = 'model-loading-status'
    status.textContent = text
    status.setAttribute('aria-live', 'polite')
    this.container?.setAttribute('aria-hidden', 'false')
    status.disabled = !retry
    if (retry) status.addEventListener('click', retry, { once: true })
    this.container?.append(status)
    this.loadingStatus = status
  }

  private installLandmark(id: string): void {
    const built = buildLandmark(id)
    if (!built) console.warn(`[diorama] 模型のない名所: ${id}（台座だけを見せる）`)
    for (const w of built?.warnings ?? []) console.warn(`[diorama] ${id}: ${w}`)
    const parts = built?.parts ?? []
    let batch: BatchedMesh | null = null
    const instanceIds: number[] = []
    if (parts.length > 0) {
      let vertices = 0
      let indices = 0
      for (const part of parts) {
        vertices += part.geometry.getAttribute('position').count
        indices += part.geometry.getIndex()?.count ?? 0
      }
      batch = new BatchedMesh(parts.length, vertices, indices, this.partMaterial)
      batch.perObjectFrustumCulled = false
      batch.sortObjects = false
      batch.frustumCulled = false
      batch.castShadow = true
      batch.receiveShadow = true
      for (const part of parts) {
        const geometryId = batch.addGeometry(part.geometry)
        const instanceId = batch.addInstance(geometryId)
        batch.setVisibleAt(instanceId, false)
        instanceIds.push(instanceId)
        part.geometry.dispose()
      }
      this.modelRoot.add(batch)
    }
    const schedule = buildSchedule(parts.map((p) => ({ stage: p.stage, order: p.order, minY: p.minY, radial: p.radial, size: p.size })))
    const pivots = new Float32Array(parts.length * 3)
    parts.forEach((p, i) => {
      pivots[i * 3] = p.center.x
      pivots[i * 3 + 1] = p.minY
      pivots[i * 3 + 2] = p.center.z
    })
    const groundColor = built?.groundColor ?? new Color(COLORS.lawn)
    this.model = {
      id,
      height: Math.max(0.6, built?.height ?? 0.6),
      envelope: built?.envelope ?? [],
      groundColor,
      batch,
      instanceIds,
      schedule,
      events: new AssemblyEvents(schedule.byLand),
      pivots,
      appears: parts.map((p) => p.appear),
      cache: new Float32Array(parts.length * 4).fill(-1),
      triangles: built?.triangles ?? 0,
      warnings: built?.warnings ?? [],
    }
    setGroundColor(this.ground, groundColor, id)
    this.fitKey = ''
    this.fitShadow(this.model.height)
    this.applyAssembly(this.complete ? 1 : clampProgress(this.progress))
    this.requestRender()
  }

  setProgress(p: number): void {
    if (this.disposed || Number.isNaN(p)) return
    this.progress = p
    if (!this.complete && this.model) {
      const notice = this.model.events.advance(p)
      for (const sp of notice.landed) this.emitLanded({ size: sp.size, stage: sp.stage })
      if (notice.paintStarted) this.emitPaint()
    }
    this.requestRender()
  }

  showComplete(): void {
    if (this.disposed || this.complete) return
    this.complete = true
    this.model?.events.skipTo(1)
    const instant = this.shot !== null || !PRESETS[this.quality].continuous || this.reducedMotion || !this.renderer
    this.completeFrom = this.lastDisplayP
    this.completeStart = instant ? -Infinity : performance.now()
    this.requestRender()
  }

  setInteractive(enabled: boolean): void {
    this.interactive = enabled && this.shot === null
    if (!this.interactive && this.dragging) this.endDrag(true)
    this.updateTouchAction()
  }

  onPartLanded(cb: (e: PartLandedEvent) => void): void {
    this.landedListeners.push(cb)
  }

  onPaintStart(cb: () => void): void {
    this.paintListeners.push(cb)
  }

  onModelReady(cb: () => void): () => void {
    this.readyListeners.push(cb)
    return () => {
      const index = this.readyListeners.indexOf(cb)
      if (index >= 0) this.readyListeners.splice(index, 1)
    }
  }

  setQuality(q: Quality): void {
    if (this.quality === q) return
    this.quality = q
    if (this.renderer) {
      this.applyQuality()
      this.resize()
    }
  }

  resize(): void {
    const renderer = this.renderer
    const container = this.container
    if (!renderer || !container || this.disposed) return
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    const ratio = boundedPixelRatio(w, h, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, PRESETS[this.quality].pixelRatioMax)
    renderer.setPixelRatio(ratio)
    renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    const size = renderer.getDrawingBufferSize(new Vector2())
    this.post?.setSize(size.x, size.y)
    this.fitKey = ''
    this.requestRender()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.modelGeneration++
    this.loadingStatus?.remove()
    this.loadingStatus = null
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.endDrag(true)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('blur', this.onWindowBlur)
    this.resizeObserver?.disconnect()
    this.media?.removeEventListener('change', this.onMotionPreference)
    const canvas = this.renderer?.domElement
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.onPointerDown)
      canvas.removeEventListener('pointermove', this.onPointerMove)
      canvas.removeEventListener('pointerup', this.onPointerUp)
      canvas.removeEventListener('pointercancel', this.onPointerCancel)
      canvas.removeEventListener('lostpointercapture', this.onPointerCancel)
      canvas.remove()
    }
    this.unloadModel()
    this.post?.dispose()
    this.envTarget?.dispose()
    this.scene.traverse((obj: Object3D) => {
      const mesh = obj as Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
      for (const m of mats as Material[]) {
        const map = (m as Material & { map?: Texture | null }).map
        map?.dispose()
        m.dispose()
      }
    })
    this.partMaterial.dispose()
    this.sun.shadow.map?.dispose()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
    this.container = null
    this.renderer = null
    this.landedListeners.length = 0
    this.paintListeners.length = 0
    this.readyListeners.length = 0
  }

  renderNow(): void {
    if (!this.renderer || this.disposed) return
    this.update(0, performance.now())
    this.draw()
  }

  info() {
    return {
      parts: this.model?.instanceIds.length ?? 0,
      triangles: this.model?.triangles ?? 0,
      /** 直前の1フレームの描画命令の数（影・場面・後処理の合計） */
      drawCalls: this.renderer?.info.render.calls ?? 0,
      warnings: this.model?.warnings ?? [],
      quality: this.quality,
    }
  }

  // ---- 中身 ----

  private emitLanded(e: PartLandedEvent): void {
    for (const cb of this.landedListeners) {
      try {
        cb(e)
      } catch (err) {
        console.error(err)
      }
    }
  }

  private emitPaint(): void {
    for (const cb of this.paintListeners) {
      try {
        cb()
      } catch (err) {
        console.error(err)
      }
    }
  }

  private unloadModel(): void {
    const batch = this.model?.batch
    if (batch) {
      this.modelRoot.remove(batch)
      batch.dispose()
    }
    this.model = null
  }

  private applyQuality(): void {
    const renderer = this.renderer
    if (!renderer) return
    const preset = PRESETS[this.quality]
    renderer.shadowMap.enabled = preset.shadows
    this.sun.castShadow = preset.shadows
    if (this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize)
    }
    if (preset.environment) {
      if (!this.envTarget) {
        const pmrem = new PMREMGenerator(renderer)
        const sky = createSkyTexture(this.palette)
        this.envTarget = pmrem.fromEquirectangular(sky)
        sky.dispose()
        pmrem.dispose()
      }
      this.scene.environment = this.envTarget.texture
      this.scene.environmentIntensity = this.palette.envIntensity
      this.hemi.visible = false
    } else {
      this.scene.environment = null
      this.hemi.visible = true
    }
    if (preset.post) {
      if (this.post) this.post.setSettings(preset.post)
      else this.post = new MiniaturePost(preset.post)
    } else if (this.post) {
      this.post.dispose()
      this.post = null
    }
    this.scene.traverse((obj: Object3D) => {
      const mat = (obj as Mesh).material
      if (!mat) return
      for (const m of Array.isArray(mat) ? mat : [mat]) m.needsUpdate = true
    })
    this.partMaterial.needsUpdate = true
    this.groundMaterial.needsUpdate = true
    this.snapCamera = true
    this.requestRender()
  }

  private requestRender(): void {
    if (!this.renderer || this.disposed || this.raf || document.hidden) return
    this.raf = requestAnimationFrame(this.loop)
  }

  private readonly loop = (now: number): void => {
    this.raf = 0
    if (this.disposed || !this.renderer || document.hidden) return
    const dt = this.lastTime > 0 ? Math.min(0.1, (now - this.lastTime) / 1000) : 0
    this.lastTime = now
    this.update(dt, now)
    this.draw()
    const animating = this.complete && Number.isFinite(this.completeStart) && now - this.completeStart < COMPLETE_MS + 50
    if (PRESETS[this.quality].continuous || animating) this.raf = requestAnimationFrame(this.loop)
    else this.lastTime = 0
  }

  private update(dt: number, now: number): void {
    const animate = this.shot === null && PRESETS[this.quality].continuous && !this.reducedMotion
    if (this.shot) {
      this.yaw = this.shot.azimuthDeg
      this.elevation = this.shot.elevationDeg ?? DEFAULT_ELEVATION
    } else if (!this.dragging) {
      const spin = animate && !this.reducedMotion ? TURNTABLE_SPEED : 0
      this.yawVel += (spin - this.yawVel) * (1 - Math.exp(-dt * 1.6))
      this.yaw += this.yawVel * dt
      if (animate) {
        ;[this.elevation, this.elevationVel] = springStep(this.elevation, this.elevationVel, DEFAULT_ELEVATION, 6, dt)
      } else {
        this.elevation = DEFAULT_ELEVATION
        this.elevationVel = 0
      }
    }
    this.yaw %= 360
    this.turntable.rotation.y = this.yaw * DEG
    const p = this.displayProgress(now)
    this.lastDisplayP = p
    this.applyAssembly(p)
    this.updateCamera(dt, animate)
  }

  private displayProgress(now: number): number {
    if (!this.complete) return clampProgress(this.progress)
    if (!Number.isFinite(this.completeStart)) return 1
    const k = Math.min(1, Math.max(0, (now - this.completeStart) / COMPLETE_MS))
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
    return this.completeFrom + (1 - this.completeFrom) * e
  }

  /** p の時点の部品の位置・見え方と、色塗りの高さを入れる */
  private applyAssembly(p: number): void {
    const model = this.model
    if (!model) {
      this.paintUniforms.uPaintLevel.value = -100
      return
    }
    const batch = model.batch
    if (batch) {
      const reduced = this.reducedMotion
      const cache = model.cache
      for (let i = 0; i < model.instanceIds.length; i++) {
        const sp = model.schedule.parts[i]
        const id = model.instanceIds[i]
        if (!sp || id === undefined) continue
        const pose = partPose(sp, p, model.appears[i], reduced)
        const c = i * 4
        const vis = pose.visible ? 1 : 0
        if (cache[c] === vis && cache[c + 1] === pose.lift && cache[c + 2] === pose.scaleY && cache[c + 3] === pose.scaleXZ) continue
        cache[c] = vis
        cache[c + 1] = pose.lift
        cache[c + 2] = pose.scaleY
        cache[c + 3] = pose.scaleXZ
        batch.setVisibleAt(id, pose.visible)
        if (!pose.visible) continue
        const px = model.pivots[i * 3] ?? 0
        const py = model.pivots[i * 3 + 1] ?? 0
        const pz = model.pivots[i * 3 + 2] ?? 0
        const sxz = pose.scaleXZ
        const sy = pose.scaleY
        this.tmpMatrix.set(sxz, 0, 0, px * (1 - sxz), 0, sy, 0, py * (1 - sy) + pose.lift, 0, 0, sxz, pz * (1 - sxz), 0, 0, 0, 1)
        batch.setMatrixAt(id, this.tmpMatrix)
      }
    }
    const band = Math.min(1.4, Math.max(0.5, model.height * 0.25))
    this.paintUniforms.uPaintBand.value = band
    this.paintUniforms.uPaintLevel.value = paintLevel(paintAmount(p), PEDESTAL_HEIGHT, model.height, band)
  }

  private updateCamera(dt: number, animate: boolean): void {
    const height = this.model?.height ?? 1
    const key = `${this.model?.id ?? ''}|${this.elevation.toFixed(2)}|${this.camera.aspect.toFixed(4)}`
    if (key !== this.fitKey) {
      this.fitKey = key
      this.targetY = PEDESTAL_HEIGHT + height * 0.36
      const rings: [number, number][] = [
        [PEDESTAL_RADIUS + 0.04, 0],
        [PEDESTAL_RADIUS, PEDESTAL_HEIGHT],
        ...(this.model?.envelope ?? []).map(([r, y]): [number, number] => [r, y + PEDESTAL_HEIGHT]),
      ]
      const fit = fitFrame({
        rings,
        elevationDeg: this.elevation,
        vFovDeg: V_FOV,
        aspect: this.camera.aspect,
        targetY: this.targetY,
        fitX: FIT_X,
        fitY: FIT_Y,
      })
      this.distanceTarget = fit.distance
      this.shiftY = fit.shiftY
    }
    if (this.snapCamera || !animate) {
      this.distance = this.distanceTarget
      this.distanceVel = 0
      this.snapCamera = false
    } else {
      ;[this.distance, this.distanceVel] = springStep(this.distance, this.distanceVel, this.distanceTarget, 5, dt)
    }
    const el = this.elevation * DEG
    const d = this.distance
    this.camera.position.set(0, this.targetY + Math.sin(el) * d, Math.cos(el) * d)
    this.camera.lookAt(0, this.targetY, 0)
    this.camera.near = Math.max(0.1, d - 14)
    this.camera.far = d + 70
    // setViewOffset は camera.aspect を fullWidth ÷ fullHeight に書き換えるので、画面の縦横比をそのまま渡す
    // （1, 1 を渡すと縦横比が1になり、横長の画面では横に、縦長の画面では縦に模型が伸びていた。段B1で修正）
    const aspect = this.camera.aspect
    this.camera.setViewOffset(aspect, 1, 0, -this.shiftY / 2, aspect, 1)
    this.camera.updateMatrixWorld()
    const fog = this.scene.fog as Fog
    fog.near = d + 6
    fog.far = d + 34
    // ピントの帯：台座の中心から模型の上までの、画面での位置
    const yGround = this.projectY(PEDESTAL_HEIGHT)
    const yTop = this.projectY(PEDESTAL_HEIGHT + height)
    const yMid = this.projectY(PEDESTAL_HEIGHT + height * 0.4)
    this.focus = { center: yMid, band: Math.max(0.12, Math.abs(yTop - yGround) * 0.55), falloff: 0.3 }
  }

  private readonly tmpVec = new Vector3()

  /** 中心軸の高さ y の点が、画面のどの高さ（下 0・上 1）に写るか */
  private projectY(y: number): number {
    this.tmpVec.set(0, y, 0).project(this.camera)
    return this.tmpVec.y * 0.5 + 0.5
  }

  private draw(): void {
    const renderer = this.renderer
    if (!renderer) return
    renderer.info.reset()
    if (this.post) {
      this.post.render(renderer, this.scene, this.camera, this.focus, GRADE)
    } else {
      renderer.setRenderTarget(null)
      renderer.render(this.scene, this.camera)
    }
  }

  /** 日差しの影のカメラを、台座（と模型の高さ）にぴったり合わせる */
  private fitShadow(height: number): void {
    const top = PEDESTAL_HEIGHT + height + 1.0
    const target = new Vector3(0, top / 2, 0)
    const eye = target.clone().addScaledVector(this.palette.sunDirection, 40)
    this.sun.position.copy(eye)
    this.sun.target.position.copy(target)
    this.sun.updateMatrixWorld()
    this.sun.target.updateMatrixWorld()
    const forward = target.clone().sub(eye).normalize()
    const right = forward.clone().cross(new Vector3(0, 1, 0)).normalize()
    const up = right.clone().cross(forward)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    const r = PEDESTAL_RADIUS + 0.06
    const v = new Vector3()
    for (const y of [0, top]) {
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2
        v.set(Math.cos(a) * r, y, Math.sin(a) * r).sub(eye)
        const x = v.dot(right)
        const yy = v.dot(up)
        const z = v.dot(forward)
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, yy)
        maxY = Math.max(maxY, yy)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
    }
    const cam = this.sun.shadow.camera
    cam.left = minX
    cam.right = maxX
    cam.bottom = minY
    cam.top = maxY
    cam.near = Math.max(0.5, minZ - 1)
    cam.far = maxZ + 12
    cam.updateProjectionMatrix()
  }

  // ---- 操作 ----

  private readonly onMotionPreference = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches
    if (e.matches) {
      this.yawVel = 0
      this.elevationVel = 0
      this.completeStart = -Infinity
      this.snapCamera = true
    }
    if (this.model) this.model.cache.fill(-1)
    this.requestRender()
  }

  private updateTouchAction(): void {
    const canvas = this.renderer?.domElement
    if (canvas) canvas.style.touchAction = this.interactive ? 'none' : 'auto'
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.interactive || !canStartDrag(e.button, this.dragging)) return
    this.dragging = true
    this.pointerId = e.pointerId
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.lastT = performance.now()
    this.dragVel = 0
    this.yawVel = 0
    try {
      this.renderer?.domElement.setPointerCapture(e.pointerId)
    } catch {
      // つかめなくても回すことはできる
    }
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return
    const now = performance.now()
    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    this.yaw += dx * DRAG_YAW
    this.elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, this.elevation + dy * DRAG_PITCH))
    this.elevationVel = 0
    const dtMs = Math.max(8, now - this.lastT)
    const instant = ((dx * DRAG_YAW) / dtMs) * 1000
    this.dragVel = this.dragVel * 0.5 + instant * 0.5
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.lastT = now
    this.requestRender()
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return
    this.endDrag()
  }

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.dragging && e.pointerId === this.pointerId) this.endDrag(true)
  }

  private readonly onWindowBlur = (): void => {
    if (this.dragging) this.endDrag(true)
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.onWindowBlur()
      if (this.raf) cancelAnimationFrame(this.raf)
      this.raf = 0
      this.lastTime = 0
    } else {
      this.resize()
      this.requestRender()
    }
  }

  private endDrag(cancelled = false): void {
    this.dragging = false
    // 離した勢いで少し回り、ばねのように回る台の速さへ戻る。止めてから時間がたっていれば勢いは無し
    const idle = performance.now() - this.lastT
    this.yawVel = releaseVelocity(this.dragVel, idle, this.reducedMotion, cancelled)
    const releasedPointer = this.pointerId
    this.pointerId = -1
    try {
      if (releasedPointer >= 0) this.renderer?.domElement.releasePointerCapture(releasedPointer)
    } catch {
      // すでに離れている
    }
    this.pointerId = -1
    this.requestRender()
  }
}
