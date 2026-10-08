import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { CATEGORY_LABELS, type Category, type ResolvedBuild } from '../domain/types'
import { createDiagramScene, diagramCameraFit } from './diagramScene'
import './diagram.css'

export interface DiagramProps {
  resolved: ResolvedBuild | null
  selected: Category
  color: 'white' | 'black'
  exploded: boolean
}

export function Diagram({ resolved, selected, color, exploded }: DiagramProps) {
  const [webgl] = useState(canRenderWebGL)
  const [reset, setReset] = useState(0)
  const [ready, setReady] = useState(false)
  const reduced = useReducedMotion()
  return <section className="manual-diagram" data-testid="manual-diagram" data-ready={resolved && webgl && ready ? 'true' : 'false'} aria-label="入力したPC構成の寸法模式図">
    <div className="manual-diagram__heading">
      <p>選択中：<strong>{CATEGORY_LABELS[selected]}</strong></p>
      <button type="button" className="manual-diagram__reset" onClick={() => setReset((n) => n + 1)} disabled={!resolved || !webgl}>視点を戻す</button>
    </div>
    <div className="manual-diagram__viewport">
      {!resolved ? <p className="manual-diagram__fallback">ケースや部品の寸法を入力すると、配置の目安を表示します。</p>
        : !webgl ? <p className="manual-diagram__fallback" role="status">この端末では3Dを表示できません。寸法の入力と仕様の確認はそのまま使えます。</p>
          : <DiagramBoundary reset={reset} onError={() => setReady(false)}>
            <Canvas camera={{ position: [1, 0.8, 1], fov: 42, near: 0.001, far: 50 }} dpr={[1, 1.75]} frameloop="demand"
              gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
              onCreated={({ gl }) => { gl.domElement.setAttribute('data-testid', 'manual-canvas'); gl.domElement.setAttribute('aria-label', '入力したPC部品の寸法模式図。ドラッグで回転し、ピンチやホイールで拡大できます'); }}>
              <color attach="background" args={['#10131a']} />
              <ambientLight intensity={0.9} />
              <hemisphereLight args={['#e7ecf6', '#313342', 1.3]} />
              <directionalLight position={[2, 3, 2]} intensity={2.3} />
              <directionalLight position={[-1, 1, -1]} intensity={0.8} />
              <DiagramContent resolved={resolved} selected={selected} color={color} exploded={exploded} reset={reset} reduced={reduced} onReady={setReady} />
            </Canvas>
          </DiagramBoundary>}
    </div>
    <p className="manual-diagram__hint">ドラッグで回転・ピンチやホイールで拡大</p>
  </section>
}

function DiagramContent({ resolved, selected, color, exploded, reset, reduced, onReady }: Omit<DiagramProps, 'resolved'> & { resolved: ResolvedBuild; reset: number; reduced: boolean; onReady: (ready: boolean) => void }) {
  const [content, setContent] = useState<ReturnType<typeof createDiagramScene> | null>(null)
  const controls = useRef<OrbitControlsImpl>(null)
  const notified = useRef(false)
  const { camera, size, invalidate } = useThree()
  // effectで生成するため、StrictModeの再マウントでも未使用の材質・形状を残さない。
  useLayoutEffect(() => {
    onReady(false)
    notified.current = false
    const next = createDiagramScene(resolved, color)
    setContent(next)
    return () => next.dispose()
  }, [resolved, color, onReady])
  useLayoutEffect(() => {
    content?.select(selected)
    invalidate()
  }, [content, selected, invalidate])
  useLayoutEffect(() => {
    if (!content || size.width <= 0 || size.height <= 0) return
    content.explode(exploded)
    const fit = diagramCameraFit(content.bounds(), size.width / size.height)
    const direction = new THREE.Vector3(1, 0.55, 1.05).normalize()
    camera.position.copy(fit.center).addScaledVector(direction, fit.distance)
    camera.lookAt(fit.center)
    camera.updateProjectionMatrix()
    if (controls.current) {
      controls.current.target.copy(fit.center)
      controls.current.minDistance = Math.max(0.05, fit.radius * 0.7)
      controls.current.maxDistance = fit.distance * 4
      controls.current.update()
    }
    invalidate()
  }, [content, exploded, reset, size.width, size.height, camera, invalidate])
  useFrame(() => {
    if (content && !notified.current) { notified.current = true; onReady(true) }
  })
  return <>
    {content && <primitive object={content.root} dispose={null} />}
    <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={!reduced} dampingFactor={0.1} />
  </>
}

function canRenderWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch { return false }
}

function useReducedMotion(): boolean {
  const [value, setValue] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setValue(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return value
}

class DiagramBoundary extends Component<{ children: ReactNode; reset: number; onError: () => void }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidCatch() { this.props.onError() }
  override componentDidUpdate(previous: Readonly<{ children: ReactNode; reset: number; onError: () => void }>) {
    if (this.state.failed && previous.reset !== this.props.reset) this.setState({ failed: false })
  }
  override render() {
    return this.state.failed ? <p className="manual-diagram__fallback" role="status">3Dを表示できませんでした。寸法の入力と仕様の確認はそのまま使えます。</p> : this.props.children
  }
}

export default Diagram
