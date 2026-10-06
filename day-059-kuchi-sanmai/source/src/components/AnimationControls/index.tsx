import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useBlink } from '../../hooks/useBlink'
import { formatDimensions, formatTimes } from '../../lib/format'
import { toBackgroundImage } from '../../lib/imageLoader'
import { useAnimationStore } from '../../state/animationStore'
import { useCanvasStore } from '../../state/canvasStore'
import { useRecordingStore } from '../../state/recordingStore'
import { CANVAS_PRESETS, type BackgroundKind } from '../../types/canvas'
import { Panel, Phrases, Slider, Toggle } from '../ui'
import { RightsNotice } from '../Legal/RightsNotice'
import './controls.css'

const BACKGROUNDS: { kind: BackgroundKind; label: string; swatch: string }[] = [
  { kind: 'transparent', label: '透明', swatch: 'transparent' },
  { kind: 'white', label: '白', swatch: '#ffffff' },
  { kind: 'black', label: '黒', swatch: '#070b0c' },
  { kind: 'green', label: 'グリーン', swatch: '#00ff00' },
  { kind: 'color', label: 'カスタム', swatch: 'conic-gradient(#d993e7,#88b7f3,#9de6b0,#edd27f,#d993e7)' },
  { kind: 'image', label: '画像', swatch: '#344541' },
]

function isRecordingBusy() {
  const status = useRecordingStore.getState().status
  return status === 'recording' || status === 'finalizing'
}

const percent = (value: number) => `${Math.round(value * 100)}%`

export function AnimationControls() {
  const motion = useAnimationStore((s) => s.motion)
  const setMotion = useAnimationStore((s) => s.setMotion)
  const blink = useBlink()
  const canvas = useCanvasStore()
  const recordingStatus = useRecordingStore((s) => s.status)
  const locked = recordingStatus === 'recording' || recordingStatus === 'finalizing'
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const imageToken = useRef(0)

  useEffect(() => () => { imageToken.current += 1 }, [])

  async function loadBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || isRecordingBusy()) return
    const token = ++imageToken.current
    setImageLoading(true)
    setImageError(null)
    try {
      const image = await toBackgroundImage(file)
      if (token !== imageToken.current || isRecordingBusy()) {
        URL.revokeObjectURL(image.objectUrl)
        return
      }
      useCanvasStore.getState().setBackgroundImage(image)
    } catch (error) {
      if (token === imageToken.current) {
        setImageError(error instanceof Error ? error.message : '背景画像を読み込めませんでした。別の画像をお試しください。')
      }
    } finally {
      if (token === imageToken.current) setImageLoading(false)
    }
  }

  return (
    <div className="animation-controls stack">
      <Panel title="動きをつける" eyebrow="MOTION">
        <div className="stack">
          <Toggle label="待機中のゆらぎ" hint="呼吸のように、|ゆっくり|上下に|動きます" checked={motion.idleEnabled} onChange={(idleEnabled) => setMotion({ idleEnabled })} data-testid="motion-idle" />
          <Toggle label="話すときの動き" hint="声の|大きさに|合わせて、|ふわっと|反応" checked={motion.talkingEnabled} onChange={(talkingEnabled) => setMotion({ talkingEnabled })} data-testid="motion-talking" />
          <Toggle label="まばたき" hint={blink.available ? '3〜7秒ごとに|自然に|まばたきします' : '「目を閉じた画像」を|追加すると|使えます'} checked={blink.enabled && blink.available} onChange={blink.setEnabled} disabled={!blink.available} data-testid="motion-blink" />
          <div className="animation-control-divider" />
          <Slider label="動きの強さ" value={motion.strength} min={0} max={2} step={0.05} onChange={(strength) => setMotion({ strength })} formatValue={formatTimes} data-testid="motion-strength" />
        </div>
      </Panel>

      <Panel title="キャンバス" eyebrow="CANVAS">
        {locked && <p className="hint canvas-locked" role="status"><Phrases text={`${recordingStatus === 'recording' ? '録画中' : '動画の処理中'}は、|キャンバス設定を|固定しています。`} /></p>}
        <fieldset className="canvas-fieldset stack" disabled={locked}>
          <legend className="canvas-screen-reader">キャンバス設定</legend>
          <div>
            <p className="field-label">動画のサイズ</p>
            <div className="canvas-presets">
              {CANVAS_PRESETS.map((preset) => (
                <button key={preset.id} type="button" className={`canvas-preset ${canvas.preset === preset.id ? 'is-selected' : ''}`} aria-pressed={canvas.preset === preset.id} data-testid={`preset-${preset.id}`} onClick={() => canvas.setPreset(preset.id)} title={`${preset.hint} · ${formatDimensions(preset.width, preset.height)}`}>
                  <span className={`canvas-ratio-icon ratio-${preset.id}`} aria-hidden="true" />
                  {/* 選んでいる大きさには ✓ を付ける（色だけで示さない。UI採点 M10） */}
                  <span>{canvas.preset === preset.id && <span className="selected-mark" aria-hidden="true">✓</span>}{preset.label}</span>
                </button>
              ))}
            </div>
            <p className="hint canvas-size-hint"><span className="mono">{formatDimensions(canvas.width, canvas.height)}</span> px</p>
          </div>

          <div>
            <p className="field-label">背景</p>
            <div className="canvas-backgrounds">
              {BACKGROUNDS.map(({ kind, label, swatch }) => (
                <button key={kind} type="button" className={`canvas-background ${canvas.background.kind === kind ? 'is-selected' : ''}`} data-testid={`bg-${kind}`} aria-pressed={canvas.background.kind === kind} onClick={() => { imageToken.current += 1; setImageLoading(false); canvas.setBackground({ kind }); setImageError(null) }}>
                  <span className={`canvas-swatch ${kind === 'transparent' ? 'swatch-transparent' : ''}`} style={kind === 'transparent' ? undefined : { background: swatch }} aria-hidden="true">
                    {kind === 'image' && <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="m4 16 5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.3" /><circle cx="15" cy="9" r="1.5" fill="currentColor" /></svg>}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {canvas.background.kind === 'color' && (
              <label className="canvas-color-picker">
                <span>背景の色</span>
                <input type="color" value={canvas.background.color} aria-label="背景のカスタムカラー" data-testid="bg-color-input" onChange={(event) => canvas.setBackground({ color: event.currentTarget.value })} />
                <span className="mono">{canvas.background.color.toUpperCase()}</span>
              </label>
            )}
            {canvas.background.kind === 'transparent' && <p className="hint canvas-background-hint"><Phrases text="透明部分は|動画では|黒に|なることが|あります。|透過合成には|グリーン背景が|おすすめです。" /></p>}
            {canvas.background.kind === 'green' && <p className="hint canvas-background-hint"><Phrases text="動画編集ソフトの|クロマキーで、|緑色の部分を|透過できます。" /></p>}
            {canvas.background.kind === 'image' && (
              <div className="canvas-background-upload">
                <label className={`button button-ghost button-small ${imageLoading || locked ? 'is-disabled' : ''}`}>
                  {imageLoading ? '読み込み中…' : canvas.background.image ? '背景画像を変更' : '背景画像を選ぶ'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" aria-label="背景画像を選ぶ" data-testid="bg-image-input" onChange={loadBackground} disabled={locked || imageLoading} />
                </label>
                {canvas.background.image && <div className="canvas-image-detail"><span className="hint" title={canvas.background.image.fileName}>{canvas.background.image.fileName}</span><button className="button button-ghost button-small" type="button" onClick={() => canvas.setBackgroundImage(null)} aria-label="背景画像を削除">削除</button></div>}
                <p className="hint"><Phrases text="画像は|キャンバス全体を|覆うように|配置されます。" /></p>
                <RightsNotice kind="image" testId="rights-notice-background" />
              </div>
            )}
            {imageError && <p className="error-message" role="alert">{imageError}</p>}
          </div>

          <div className="animation-control-divider" />
          <Slider label="キャラクターの大きさ" value={canvas.placement.size} min={0.1} max={1.5} step={0.01} onChange={(size) => canvas.setPlacement({ size })} formatValue={percent} disabled={locked} data-testid="char-size" />
          <Slider label="左右の位置" value={canvas.placement.x} min={0} max={1} step={0.01} onChange={(x) => canvas.setPlacement({ x })} formatValue={percent} disabled={locked} data-testid="char-x" />
          <Slider label="上下の位置" value={canvas.placement.y} min={0} max={1} step={0.01} onChange={(y) => canvas.setPlacement({ y })} formatValue={percent} disabled={locked} data-testid="char-y" />
          <Toggle label="ドット絵モード" hint="画像を|ぼかさず、|くっきりと|拡大します" checked={canvas.pixelArt} onChange={canvas.setPixelArt} disabled={locked} data-testid="pixel-art-toggle" />
        </fieldset>
      </Panel>
    </div>
  )
}
