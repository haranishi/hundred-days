import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createAnimationEngine } from '../../engine'
import { useAudioAnalyzer } from '../../hooks/useAudioAnalyzer'
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer'
import { useCharacterAnimation } from '../../hooks/useCharacterAnimation'
import { formatDimensions, formatLevel, MOUTH_TEXT } from '../../lib/format'
import { useAudioStore } from '../../state/audioStore'
import { useCanvasStore } from '../../state/canvasStore'
import { selectIsCharacterReady, useCharacterStore } from '../../state/characterStore'
import { useLiveStore } from '../../state/liveStore'
import { useRecordingStore } from '../../state/recordingStore'
import type { EngineFrame } from '../../types/animation'
import { usePreviewCanvas } from '../layout/CanvasContext'
import { Panel, Phrases } from '../ui'
import { Transport } from '../AudioControls/Transport'
import './preview.css'

type DebugFrame = Omit<EngineFrame, 'image'>

declare global {
  interface Window {
    __lipSyncDebug?: { getFrame(): DebugFrame | null }
  }
}

const MOUTH_LABEL = { closed: '口を閉じる', small: '少し開く', open: '大きく開く' } as const

export function CanvasPreview() {
  const canvasRef = usePreviewCanvas()
  const [engine] = useState(() => createAnimationEngine())
  const analyzer = useAudioAnalyzer()
  const { draw } = useCanvasRenderer(canvasRef)
  const { frameRef } = useCharacterAnimation({ engine, getLevel: analyzer.getLevel, draw, enabled: true })
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const pixelArt = useCanvasStore((s) => s.pixelArt)
  const hasClosed = useCharacterStore((s) => Boolean(s.assets.mouthClosed))
  const ready = useCharacterStore(selectIsCharacterReady)
  const hasBlink = useCharacterStore((s) => Boolean(s.assets.blink))
  const mouth = useLiveStore((s) => s.mouth)
  const level = useLiveStore((s) => s.level)
  const blinking = useLiveStore((s) => s.blinking)
  const speaking = useLiveStore((s) => s.speaking)
  const recording = useRecordingStore((s) => s.status === 'recording')
  const fileMode = useAudioStore((s) => s.mode === 'file')

  useEffect(() => {
    const api = {
      getFrame(): DebugFrame | null {
        const frame = frameRef.current
        if (!frame) return null
        return {
          mouth: frame.mouth,
          blinking: frame.blinking,
          level: frame.level,
          speaking: frame.speaking,
          transform: { ...frame.transform },
        }
      },
    }
    window.__lipSyncDebug = api
    const unsubscribe = useAudioStore.subscribe((state, previous) => {
      if (state.file?.objectUrl !== previous.file?.objectUrl || state.currentTime < previous.currentTime - 0.05) {
        engine.reset()
      }
    })
    return () => {
      unsubscribe()
      if (window.__lipSyncDebug === api) delete window.__lipSyncDebug
      engine.dispose()
    }
  }, [engine, frameRef])

  return (
    <Panel
      title="プレビュー"
      eyebrow="LIVE PREVIEW"
      className="preview-panel"
      actions={<span className={`preview-live ${recording ? 'is-recording' : ''}`}><i />{recording ? '録画中' : 'リアルタイム'}</span>}
    >
      <div className="preview-stage">
        <div className="preview-frame" style={{ '--canvas-ratio': width / height } as CSSProperties}>
          <canvas
            ref={canvasRef}
            data-testid="preview-canvas"
            aria-label={`キャラクターのプレビュー、${width}×${height}ピクセル`}
            style={{ imageRendering: pixelArt ? 'pixelated' : 'auto' }}
          />
          {!hasClosed && (
            <div className="preview-empty">
              <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <rect x="10" y="12" width="44" height="42" rx="18" stroke="currentColor" strokeWidth="1.5" />
                <path d="M22 27v4m20-4v4M25 41c4 4 10 4 14 0M22 12l-4-6m24 6 4-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <strong>まだ画像がありません</strong>
              <p><Phrases text="サンプルを|試すか、|「口を閉じた画像」を|追加すると、|ここに|プレビューが|出ます。" /></p>
            </div>
          )}
        </div>
      </div>
      <div className="preview-caption">
        <span className="mono">{formatDimensions(width, height)} px</span>
        <span><Phrases text={!hasClosed ? '素材を|追加して|スタート' : !ready ? '口の画像を|あと少し|追加' : recording ? '音声と|動きを|収録しています' : '設定は|すぐに|反映されます'} /></span>
      </div>
      {/* 口の動きを見ながら再生できるよう、プレビューにも再生の操作を置く（音声の欄と同じ状態。UI採点 H1） */}
      {fileMode && <Transport place="preview" />}
      <div className="preview-status" aria-label="現在のキャラクターの状態">
        <div data-testid="status-mouth" data-mouth={mouth}>
          <span className="muted">口の状態</span>
          <strong title={MOUTH_LABEL[mouth]} className={speaking ? 'is-active' : undefined}>{MOUTH_TEXT[mouth]}</strong>
        </div>
        <div data-testid="status-level" data-level={level.toFixed(4)}>
          <span className="muted">入力レベル</span>
          <strong className="mono">{formatLevel(level)}</strong>
        </div>
        <div data-testid="status-blink" data-blinking={blinking}>
          <span className="muted">まばたき</span>
          <strong className={blinking ? 'is-active' : ''}>{!hasBlink ? '素材なし' : blinking ? 'とじている' : 'ひらいている'}</strong>
        </div>
      </div>
    </Panel>
  )
}
