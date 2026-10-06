import { useAudioAnalyzer } from '../../hooks/useAudioAnalyzer'
import { formatClock } from '../../lib/format'
import { useAudioStore } from '../../state/audioStore'
import { useRecordingStore } from '../../state/recordingStore'

// 再生の操作（最初から・再生／一時停止・いまの位置）。音声の欄とプレビューの両方に置き、同じ音声の状態を共有する。
// プレビューにも置くのは、スマホで口の動きを見ながら再生できるようにするため（UI採点 H1）。
// data-testid は置き場所ごとに分ける（audio-play と preview-play）。

export function Transport({ place }: { place: 'audio' | 'preview' }) {
  const api = useAudioAnalyzer()
  const file = useAudioStore((state) => state.file)
  const playback = useAudioStore((state) => state.playback)
  const currentTime = useAudioStore((state) => state.currentTime)
  const recordingStatus = useRecordingStore((state) => state.status)
  const locked = recordingStatus === 'recording' || recordingStatus === 'finalizing'
  const ready = Boolean(file) && playback !== 'loading' && playback !== 'error'
  const playing = playback === 'playing'
  const duration = file?.duration ?? 0

  return (
    <div className={`audio-transport audio-transport-${place}`}>
      <button type="button" className="button button-ghost audio-restart" data-testid={`${place}-restart`} aria-label="最初から再生" title="最初から再生" disabled={!ready || locked} onClick={() => void api.restart()}>↺</button>
      {playing
        ? <button type="button" className="button button-primary audio-play" data-testid={`${place}-pause`} disabled={locked} onClick={api.pause}><span aria-hidden="true">Ⅱ</span> 一時停止</button>
        : <button type="button" className="button button-primary audio-play" data-testid={`${place}-play`} disabled={!ready || locked} onClick={() => void api.play()}><span aria-hidden="true">▶</span> 再生</button>}
      <span className="mono audio-time">{formatClock(currentTime)} <span className="muted">/ {formatClock(duration)}</span></span>
    </div>
  )
}
