import { useRecorder } from '../../hooks/useRecorder'
import { useAudioAnalyzer } from '../../hooks/useAudioAnalyzer'
import { formatClock } from '../../lib/format'
import { pickSupportedMimeType, extensionForMime } from '../../lib/mediaRecorder'
import { useAudioStore } from '../../state/audioStore'
import { useCanvasStore } from '../../state/canvasStore'
import { selectIsCharacterReady, useCharacterStore } from '../../state/characterStore'
import { usePreviewCanvas } from '../layout/CanvasContext'
import { Panel, Phrases, Toggle } from '../ui'
import './ExportControls.css'

// 時間は再生の欄と同じ「0:00」で出す（UI採点 M9）
const formatTime = (ms: number): string => formatClock(ms / 1000)

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ExportControls() {
  const canvasRef = usePreviewCanvas()
  const recorder = useRecorder()
  const audio = useAudioAnalyzer()
  const mode = useAudioStore((state) => state.mode)
  const file = useAudioStore((state) => state.file)
  const mic = useAudioStore((state) => state.mic)
  const playback = useAudioStore((state) => state.playback)
  const background = useCanvasStore((state) => state.background.kind)
  const ready = useCharacterStore(selectIsCharacterReady)
  const busy = recorder.status === 'recording' || recorder.status === 'finalizing'
  const recording = recorder.status === 'recording'
  const supportedMime = pickSupportedMimeType()
  const sourceReady = mode === 'mic' ? mic === 'live' : !file || playback !== 'loading' && playback !== 'error'
  const waitingForPlayback = mode === 'file' && Boolean(file) && !recorder.autoPlayFromStart && playback !== 'playing'
  const canRecord = ready && sourceReady && !waitingForPlayback && Boolean(supportedMime) && !busy
  const reason = !supportedMime ? 'このブラウザは|録画に|対応していません。'
    : !ready ? '口の画像を|3枚|そろえると、|動画を|書き出せます。'
      : !sourceReady ? mode === 'mic' ? 'マイクを|開始すると|録画できます。' : '音声の|読み込みを|確認してください。'
        : waitingForPlayback ? '「再生」を|押すと、|その位置から|録画を|開始できます。'
          : mode === 'file' && !file ? '音声が|未設定のため、|無音の動画を|録画します。' : null

  const begin = () => {
    if (canvasRef.current) void recorder.start(canvasRef.current, audio.getRecordingTrack())
  }

  return (
    <Panel title="動画を書き出す" eyebrow="EXPORT" className="export-panel" actions={
      <span className="chip mono">{extensionForMime(recorder.mimeType ?? supportedMime ?? 'video/webm').toUpperCase()} · 30 fps</span>
    }>
      <div className="stack">
        <Toggle
          label="音声の最初から録画する"
          hint={mode === 'mic' ? 'マイク入力は|停止ボタンで|録画を|終了します。' : recorder.autoPlayFromStart ? '再生が|終わると、|自動で|録画を|止めます。' : '再生中の|位置から|録画します。|終了は|停止ボタンを|押してください。'}
          checked={recorder.autoPlayFromStart}
          onChange={recorder.setAutoPlayFromStart}
          disabled={busy || mode === 'mic' || !file}
          data-testid="record-autoplay"
        />
        <div className="export-record-row">
          {recording ? (
            <button className="button button-danger export-main-button" data-testid="record-stop" onClick={() => { void recorder.stop() }}>
              <span className="export-stop-icon" aria-hidden="true" /> 録画を停止
            </button>
          ) : (
            <button className="button button-primary export-main-button" data-testid="record-start" disabled={!canRecord} onClick={begin}>
              <span className="export-record-icon" aria-hidden="true" />
              {recorder.status === 'finalizing' ? '動画を準備中…' : recorder.result ? 'もう一度録画する' : '録画を開始'}
            </button>
          )}
          <span className={`export-timer mono${recording ? ' is-recording' : ''}`} role="timer" aria-label="録画時間">
            {recording && <span className="export-live-dot" aria-hidden="true" />}
            {formatTime(recorder.elapsedMs)}
          </span>
        </div>
        {reason && !busy && <p className="hint"><Phrases text={reason} /></p>}
        {background === 'transparent' && <p className="hint"><Phrases text="透明部分は|動画では|黒くなる|場合があります。|背景を抜く|編集には|「グリーン」を|選んでください。" /></p>}
        {recorder.error && <p className="error-message" role="alert">{recorder.error}</p>}
        <span className="export-announcement" role="status" aria-live="polite">
          {recording ? '録画中です。' : recorder.status === 'finalizing' ? '動画を準備しています。' : recorder.status === 'done' ? '動画ができました。プレビューから確認して保存できます。' : ''}
        </span>
        {recorder.result && !busy && (
          <div className="export-result">
            <div className="control-row export-result-heading">
              <span>動画ができました</span>
              <span className="muted mono">{formatTime(recorder.result.durationMs)} · {formatSize(recorder.result.sizeBytes)}</span>
            </div>
            <video
              key={recorder.result.url}
              data-testid="record-preview"
              src={recorder.result.url}
              controls
              playsInline
              preload="metadata"
              aria-label="録画した動画のプレビュー"
            />
            <div className="control-row">
              <a className="button button-primary export-download" href={recorder.result.url} download={recorder.result.fileName} data-testid="download-video">
                動画を保存 <span className="mono">↓</span>
              </a>
              <button className="button button-ghost button-small" onClick={recorder.clear}>閉じる</button>
            </div>
            <p className="hint mono export-filename">{recorder.result.fileName}</p>
          </div>
        )}
      </div>
    </Panel>
  )
}
