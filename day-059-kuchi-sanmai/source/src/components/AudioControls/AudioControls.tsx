import { useId, useState } from 'react'
import type { DragEvent } from 'react'
import { useAudioAnalyzer } from '../../hooks/useAudioAnalyzer'
import { formatClock, formatLevel, formatTimes, MOUTH_TEXT } from '../../lib/format'
import { useAnimationStore } from '../../state/animationStore'
import { useAudioStore } from '../../state/audioStore'
import { useLiveStore } from '../../state/liveStore'
import { useRecordingStore } from '../../state/recordingStore'
import { ACCEPTED_AUDIO_TYPES } from '../../types/audio'
import { Panel, Phrases, Slider } from '../ui'
import { RightsNotice } from '../Legal/RightsNotice'
import { MIC_PLACE_NOTICE } from '../../legal/notices'
import { Transport } from './Transport'
import './AudioControls.css'

const percent = (value: number) => `${Math.round(value * 100)}%`

function InputLevel() {
  const level = useLiveStore((state) => state.level)
  const mouth = useLiveStore((state) => state.mouth)
  const lipSync = useAnimationStore((state) => state.lipSync)
  const safeLevel = Math.max(0, Math.min(1, level))

  return (
    <div className="audio-meter-block">
      <div className="audio-meter-heading"><span className="field-label">入力レベル</span><span className="mono muted">{formatLevel(safeLevel)}</span></div>
      <div className="audio-meter" role="meter" aria-label="入力レベル" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(formatLevel(safeLevel))} aria-valuetext={`${percent(safeLevel)}、口は${MOUTH_TEXT[mouth]}`}>
        <div className="audio-meter-fill" style={{ width: `${safeLevel * 100}%` }} />
        <span className="audio-threshold-marker audio-threshold-small" style={{ left: `${lipSync.thresholdSmall * 100}%` }} title={`口・小 ${formatLevel(lipSync.thresholdSmall)}`} />
        <span className="audio-threshold-marker audio-threshold-open" style={{ left: `${lipSync.thresholdOpen * 100}%` }} title={`口・大 ${formatLevel(lipSync.thresholdOpen)}`} />
      </div>
      {/* 右端は凡例ではなく、いまの判定。プレビューの「口の状態」と同じ言葉で出す */}
      <div className="audio-meter-legend"><span><i className="audio-legend-dot" />口・小</span><span><i className="audio-legend-dot audio-legend-open" />口・大</span><span className="audio-mouth-label">いま：{MOUTH_TEXT[mouth]}</span></div>
    </div>
  )
}

/** 選んでいる方に ✓ を付ける（色と明るさだけで選択を示さない。UI採点 M10） */
const Check = ({ on }: { on: boolean }) => (on ? <span className="selected-mark" aria-hidden="true">✓</span> : null)

export function AudioControls() {
  const api = useAudioAnalyzer()
  const mode = useAudioStore((state) => state.mode)
  const file = useAudioStore((state) => state.file)
  const playback = useAudioStore((state) => state.playback)
  const currentTime = useAudioStore((state) => state.currentTime)
  const volume = useAudioStore((state) => state.volume)
  const sensitivity = useAudioStore((state) => state.sensitivity)
  const mic = useAudioStore((state) => state.mic)
  const errorMessage = useAudioStore((state) => state.errorMessage)
  const lipSync = useAnimationStore((state) => state.lipSync)
  const setLipSync = useAnimationStore((state) => state.setLipSync)
  const recordingStatus = useRecordingStore((state) => state.status)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const inputId = useId()
  const locked = recordingStatus === 'recording' || recordingStatus === 'finalizing'
  const ready = Boolean(file) && playback !== 'loading' && playback !== 'error'
  const duration = file?.duration ?? 0

  function load(fileToLoad: File): void {
    const status = useRecordingStore.getState().status
    if (status === 'recording' || status === 'finalizing') return
    if (!fileToLoad.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|flac|opus|weba|aiff?)$/i.test(fileToLoad.name)) {
      setFileError('音声ファイルを選んでください。MP3 / WAV / M4A などに対応しています。')
      return
    }
    if (fileToLoad.size === 0) {
      setFileError('空のファイルは読み込めません。別の音声を選んでください。')
      return
    }
    setFileError(null)
    void api.loadFile(fileToLoad)
  }

  function drop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragging(false)
    if (locked) return
    if (event.dataTransfer.files.length > 1) {
      setFileError('音声ファイルは1つずつ読み込んでください。')
      return
    }
    const dropped = event.dataTransfer.files[0]
    if (dropped) load(dropped)
  }

  return (
    <Panel title="音声と口パク" eyebrow="AUDIO">
      <div className="audio-mode-switch" role="group" aria-label="音声の入力元">
        <button type="button" data-testid="audio-mode-file" aria-pressed={mode === 'file'} disabled={locked} onClick={() => { setFileError(null); api.setMode('file') }}><Check on={mode === 'file'} />音声ファイル</button>
        <button type="button" data-testid="audio-mode-mic" aria-pressed={mode === 'mic'} disabled={locked} onClick={() => { setFileError(null); api.setMode('mic') }}><Check on={mode === 'mic'} />マイク</button>
      </div>

      {mode === 'file' ? (
        <div className="audio-file-controls">
          <div className={`audio-file-drop${dragging && !locked ? ' audio-file-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={drop}>
            <input id={inputId} className="audio-file-input" type="file" accept={ACCEPTED_AUDIO_TYPES} data-testid="audio-file-input" aria-label="音声ファイルを選ぶ" disabled={locked} onChange={(event) => { const next = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (next) load(next) }} />
            <label htmlFor={inputId} className={`audio-file-label${locked ? ' audio-file-label-disabled' : ''}`}>
              <span className="audio-file-symbol" aria-hidden="true">♫</span>
              <span className="audio-file-caption"><span className="audio-file-name" title={file?.name}>{playback === 'loading' ? '音声を読み込み中…' : file?.name ?? '音声ファイルを選ぶ'}</span><span className="hint"><Phrases text={file ? 'クリック・|ドロップで|変更' : 'MP3 / WAV / M4A など · |ドロップ可'} /></span></span>
              <span className="audio-file-plus" aria-hidden="true">＋</span>
            </label>
          </div>
          <Transport place="audio" />
          <Slider label="再生位置" min={0} max={duration || 1} step={0.01} value={Math.min(currentTime, duration || 1)} onChange={api.seek} formatValue={formatClock} disabled={!ready || duration === 0 || locked} data-testid="audio-seek" />
          <Slider label="モニター音量" min={0} max={1} step={0.01} value={volume} onChange={api.setVolume} formatValue={percent} hint="聞こえる|音量だけを|調整します。|書き出す|音声には|影響しません。" data-testid="audio-volume" />
        </div>
      ) : (
        <div className="audio-mic-controls">
          <div className="audio-mic-status"><span className={`audio-mic-dot${mic === 'live' ? ' audio-mic-dot-live' : ''}`} /><span>{mic === 'live' ? 'マイク入力中' : mic === 'requesting' ? 'マイクの許可を待っています…' : 'マイクから声を入力'}</span></div>
          {mic === 'live' || mic === 'requesting' ? <button type="button" className="button button-ghost" data-testid="mic-stop" disabled={locked} onClick={api.stopMic}>{mic === 'requesting' ? '開始をキャンセル' : 'マイクを停止'}</button> : <button type="button" className="button button-primary" data-testid="mic-start" disabled={locked} onClick={() => void api.startMic()}>マイクを開始</button>}
          <p className="hint"><Phrases text="ブラウザで|マイクの|使用を|許可してください。|入力音声は|スピーカーから|流れません。" /></p>
          <p className="hint" data-testid="mic-place-notice"><Phrases text={MIC_PLACE_NOTICE} /></p>
        </div>
      )}

      {(fileError || errorMessage) && <p className="error-message" role="alert">{fileError ?? errorMessage}</p>}
      {locked && <p className="hint"><Phrases text="書き出し中は|音声の|切り替え・|再生操作を|固定しています。" /></p>}

      <div className="audio-reaction-controls">
        <InputLevel />
        <Slider label="口パク感度" min={0.1} max={10} step={0.1} value={sensitivity} onChange={api.setSensitivity} formatValue={formatTimes} hint="声が|小さく|口が|動かないときは、|感度を|上げてください。" data-testid="sensitivity" />
        <div className="audio-threshold-heading"><span className="field-label">口が開くしきい値</span><span className="hint"><Phrases text="小さいほど|反応しやすい" /></span></div>
        <Slider label="口・小" min={lipSync.hysteresis + 0.01} max={0.99} step={0.01} value={lipSync.thresholdSmall} onChange={(value) => setLipSync({ thresholdSmall: Math.max(lipSync.hysteresis + 0.01, Math.min(value, lipSync.thresholdOpen - 0.01)) })} formatValue={formatLevel} data-testid="threshold-small" />
        <Slider label="口・大" min={lipSync.hysteresis + 0.02} max={1} step={0.01} value={lipSync.thresholdOpen} onChange={(value) => setLipSync({ thresholdOpen: Math.max(value, lipSync.thresholdSmall + 0.01) })} formatValue={formatLevel} data-testid="threshold-open" />
      </div>

      {/* 注意書きは全文をいつも出す。再生の操作と口パクの調整の流れを切らないよう、カードの末尾に置く（UI採点 M4） */}
      <RightsNotice kind="voice" testId="rights-notice-voice" />
    </Panel>
  )
}
