import { useEffect, useId, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { formatDimensions } from '../../lib/format'
import { toCharacterAsset } from '../../lib/imageLoader'
import { useCharacterStore } from '../../state/characterStore'
import { useRecordingStore } from '../../state/recordingStore'
import { CHARACTER_SLOTS, REQUIRED_SLOTS, SLOT_LABEL } from '../../types/character'
import type { CharacterSlot } from '../../types/character'
import { Panel, Phrases } from '../ui'
import { RightsNotice } from '../Legal/RightsNotice'
import './CharacterUploader.css'

const SHORT_LABELS: Record<CharacterSlot, string> = {
  mouthClosed: '口とじ',
  mouthSmall: '口・小',
  mouthOpen: '口・大',
  blink: 'まばたき',
}

function recordingLocked(): boolean {
  const status = useRecordingStore.getState().status
  return status === 'recording' || status === 'finalizing'
}

function UploadSlot({ slot, locked }: { slot: CharacterSlot; locked: boolean }) {
  const asset = useCharacterStore((state) => state.assets[slot])
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const mounted = useRef(true)
  const inputId = useId()
  const descriptionId = useId()
  const labels = SLOT_LABEL[slot]

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current += 1
    }
  }, [])

  async function load(file: File): Promise<void> {
    if (recordingLocked()) return
    const token = ++request.current
    const previous = useCharacterStore.getState().assets[slot]
    setLoading(true)
    setError(null)
    try {
      const next = await toCharacterAsset(slot, file)
      if (!mounted.current || token !== request.current || recordingLocked() || useCharacterStore.getState().assets[slot] !== previous) {
        URL.revokeObjectURL(next.objectUrl)
        return
      }
      useCharacterStore.getState().setAsset(next)
    } catch (reason) {
      if (mounted.current && token === request.current) {
        setError(reason instanceof Error ? reason.message : '画像を読み込めませんでした。別の画像を選んでください。')
      }
    } finally {
      if (mounted.current && token === request.current) setLoading(false)
    }
  }

  function drop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragging(false)
    if (locked) return
    const files = event.dataTransfer.files
    if (files.length > 1) {
      setError('1つの枠には画像を1枚ずつ入れてください。')
      return
    }
    if (files[0]) void load(files[0])
  }

  function remove(): void {
    if (recordingLocked()) return
    request.current += 1
    setLoading(false)
    setError(null)
    useCharacterStore.getState().removeAsset(slot)
  }

  return (
    <div
      className={`asset-slot${dragging && !locked ? ' asset-slot-dragging' : ''}`}
      data-testid={`slot-${slot}`}
      data-loaded={Boolean(asset)}
      aria-busy={loading}
      onDragOver={(event) => {
        event.preventDefault()
        if (!locked) setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={drop}
    >
      <div className="asset-slot-heading">
        <span className="field-label">{SHORT_LABELS[slot]}</span>
        <span className={`asset-requirement${labels.required ? '' : ' asset-optional'}`}>{labels.required ? '必須' : '任意'}</span>
      </div>
      <input
        id={inputId}
        className="asset-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
        aria-label={labels.ja}
        aria-describedby={descriptionId}
        disabled={locked}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void load(file)
        }}
      />
      <label className={`asset-dropzone${locked ? ' asset-dropzone-disabled' : ''}`} htmlFor={inputId}>
        {asset ? (
          <>
            <img className="asset-thumbnail" src={asset.objectUrl} alt={labels.ja} />
            <span className="asset-replace">{loading ? '読込中…' : '画像を差し替え'}</span>
          </>
        ) : (
          <span className="asset-empty">
            <span className="asset-mouth-icon" aria-hidden="true">{slot === 'blink' ? '− −' : slot === 'mouthClosed' ? '—' : slot === 'mouthSmall' ? 'ο' : 'Ｏ'}</span>
            <span>{loading ? '読み込み中…' : '＋ 画像を選ぶ'}</span>
            <span className="asset-drop-hint">またはドロップ</span>
          </span>
        )}
      </label>
      <div className="asset-file-details" id={descriptionId}>
        {asset ? (
          <>
            <span className="asset-file-name" title={asset.fileName}>{asset.fileName}</span>
            <div className="asset-meta-row">
              <span className="mono muted">{formatDimensions(asset.width, asset.height)}</span>
              <button type="button" className="button-ghost asset-remove" onClick={remove} disabled={locked} aria-label={`${labels.ja}を削除`}>削除</button>
            </div>
          </>
        ) : <span className="hint"><Phrases text={slot === 'blink' ? 'なくても|使えます' : labels.ja} /></span>}
      </div>
      {error && <p className="error-message asset-error" role="alert">{error}</p>}
    </div>
  )
}

export function CharacterUploader() {
  const assets = useCharacterStore((state) => state.assets)
  const status = useRecordingStore((state) => state.status)
  const locked = status === 'recording' || status === 'finalizing'
  const count = REQUIRED_SLOTS.filter((slot) => Boolean(assets[slot])).length
  const loaded = Object.values(assets)
  const reference = assets.mouthClosed ?? loaded[0]
  const mismatched = reference && loaded.some((asset) => asset.width !== reference.width || asset.height !== reference.height)

  return (
    <Panel title="キャラクター素材" eyebrow="CHARACTER" actions={<span className={`chip${count === 3 ? ' asset-ready' : ''}`}>{count} / 3</span>}>
      <p className="hint asset-intro"><Phrases text="口の形が|違う|3枚を|セット。|同じサイズ・|同じ位置の|画像が|きれいに|動きます。" /></p>
      <div className="asset-grid">
        {CHARACTER_SLOTS.map((slot) => <UploadSlot key={slot} slot={slot} locked={locked} />)}
      </div>
      {mismatched && <p className="asset-warning" role="status"><Phrases text="画像サイズが|揃っていません。|同じサイズ・|同じ位置に|揃えると、|口の切り替えで|ずれにくく|なります。" /></p>}
      {locked && <p className="hint"><Phrases text="書き出しが|終わると|素材を|変更できます。" /></p>}
      <p className="hint asset-format-hint"><Phrases text="PNG / JPEG / WebP / GIF / SVG · |透過PNG|推奨" /></p>
      <RightsNotice kind="image" testId="rights-notice-image" />
    </Panel>
  )
}
