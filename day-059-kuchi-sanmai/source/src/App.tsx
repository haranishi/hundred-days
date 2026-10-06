import { useEffect, useRef, useState } from 'react'
import { CharacterUploader } from './components/CharacterUploader'
import { AudioControls } from './components/AudioControls'
import { CanvasPreview } from './components/CanvasPreview'
import { AnimationControls } from './components/AnimationControls'
import { ExportControls } from './components/ExportControls'
import { PreviewCanvasContext } from './components/layout/CanvasContext'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'
import { loadSampleAudioFile, loadSampleCharacter } from './lib/sample'
import { useAudioStore } from './state/audioStore'
import { useCharacterStore, selectIsCharacterReady } from './state/characterStore'
import { useRecordingStore } from './state/recordingStore'
import { LegalFooter } from './components/Legal/LegalFooter'
import { Phrases } from './components/ui'
import { APP_NAME, APP_READING } from './appName'

// 見本を読み込んだあとの案内。「|」は文節の区切り（画面では <wbr>）
const SAMPLE_LOADED = 'サンプルを|読み込みました。|音声を|再生して|みましょう。'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const guideRef = useRef<HTMLDialogElement>(null)
  const loadingRef = useRef(false)
  const mounted = useRef(true)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [sampleMessage, setSampleMessage] = useState('')
  const [sampleError, setSampleError] = useState('')
  const characterReady = useCharacterStore(selectIsCharacterReady)
  const recordingStatus = useRecordingStore((s) => s.status)
  const busy = recordingStatus === 'recording' || recordingStatus === 'finalizing'
  const audio = useAudioAnalyzer()
  const audioMode = useAudioStore((s) => s.mode)
  const audioFile = useAudioStore((s) => s.file)
  const audioPlayback = useAudioStore((s) => s.playback)
  const canTrySample = Boolean(sampleMessage) && audioMode === 'file' && Boolean(audioFile) && audioPlayback !== 'loading' && audioPlayback !== 'error'

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function loadSample() {
    if (loadingRef.current || busy) return
    loadingRef.current = true
    setSampleLoading(true)
    setSampleError('')
    setSampleMessage('')
    const [characters, voice] = await Promise.allSettled([loadSampleCharacter(), loadSampleAudioFile()])
    try {
      if (!mounted.current) {
        if (characters.status === 'fulfilled') for (const asset of characters.value) URL.revokeObjectURL(asset.objectUrl)
        return
      }
      if (characters.status === 'rejected' || voice.status === 'rejected') {
        throw new Error('サンプルを読み込めませんでした。もう一度お試しください。')
      }
      const status = useRecordingStore.getState().status
      if (status === 'recording' || status === 'finalizing') {
        throw new Error('録画が終わってからサンプルを読み込んでください。')
      }
      await audio.loadFile(voice.value)
      if (!mounted.current) {
        for (const asset of characters.value) URL.revokeObjectURL(asset.objectUrl)
        return
      }
      if (useAudioStore.getState().playback === 'error') {
        throw new Error('サンプル音声を読み込めませんでした。ブラウザの対応形式を確認してください。')
      }
      for (const asset of characters.value) useCharacterStore.getState().setAsset(asset)
      setSampleMessage(SAMPLE_LOADED)
    } catch (error) {
      if (characters.status === 'fulfilled') {
        for (const asset of characters.value) URL.revokeObjectURL(asset.objectUrl)
      }
      if (mounted.current) setSampleError(error instanceof Error ? error.message : 'サンプルの読み込みに失敗しました。')
    } finally {
      loadingRef.current = false
      if (mounted.current) setSampleLoading(false)
    }
  }

  // 案内の「▶ 再生してみる」：口の動きが見えるところまで移動してから、見本を最初から鳴らす（UI採点 H2）。
  // スマホの Safari は、押した操作の中で再生を始めないと音を出さないので、移動は待たずに一瞬で済ませる
  function playSample() {
    if (busy) return
    const canvas = canvasRef.current
    if (canvas) {
      const box = canvas.getBoundingClientRect()
      if (box.top < 0 || box.bottom > window.innerHeight) canvas.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
    void audio.restart()
  }

  return (
    <PreviewCanvasContext.Provider value={canvasRef}>
      <div className="studio">
        <header className="studio-header">
          <a className="brand" href="#main" aria-label={`${APP_NAME}（${APP_READING}） スタジオへ`}>
            <span className="brand-symbol" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none"><rect x="5" y="8" width="30" height="25" rx="10" stroke="currentColor" strokeWidth="2.5" /><path d="M20 8V4M14 17v3M26 17v3M16 26h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><circle cx="20" cy="3" r="2" fill="currentColor" /></svg>
            </span>
            <span><span className="brand-name">{APP_NAME}<span className="brand-label">STUDIO</span></span><span className="brand-caption">{APP_READING}</span></span>
          </a>
          <div className="header-actions">
            <span className="privacy-badge"><span className="status-dot" />ブラウザ内で完結</span>
            <button className="button button-ghost button-small" onClick={() => guideRef.current?.showModal()} aria-label="使い方を開く">使い方 <span aria-hidden="true">↗</span></button>
          </div>
        </header>
        <main id="main">
          <section className="studio-intro" aria-labelledby="studio-title">
            <p className="eyebrow">SPRITE ANIMATION WORKSPACE</p>
            <h1 id="studio-title"><Phrases text="声に|あわせて、|動きだす。" /></h1>
            <p className="muted intro-description"><Phrases text="画像と|音声から、|口パク動画を|つくろう。" /></p>
            {/* 最初の一手は説明のすぐ下に置き、素材がそろうまでは塗りのボタンにする。そろったら枠線に戻し、塗りは「再生」に譲る（UI採点 M1） */}
            <div className="sample-action">
              <button className={`button sample-button${characterReady ? '' : ' is-primary'}`} data-testid="load-sample" onClick={() => void loadSample()} disabled={sampleLoading || busy}>
                <span aria-hidden="true">✦</span>{sampleLoading ? 'サンプルを読み込み中…' : 'サンプルで試す'}<span aria-hidden="true">→</span>
              </button>
              <span className="hint"><Phrases text="キャラクターと|動作確認用|テスト音を|読み込み" /></span>
              {/* スマホでは見出しの「ブラウザ内で完結」が隠れるので、ここで同じことを伝える（UI採点 M2） */}
              <span className="sample-privacy"><span className="status-dot" /><Phrases text="素材は|端末の外に|送られません" /></span>
            </div>
          </section>
          {sampleMessage && (
            <div className="sample-next">
              <p role="status" className="sample-notice"><Phrases text={sampleMessage} /></p>
              {canTrySample && <button type="button" className="button button-primary sample-play" data-testid="sample-play" onClick={playSample} disabled={busy}><span aria-hidden="true">▶</span> 再生してみる</button>}
            </div>
          )}
          {sampleError && <p role="alert" className="error-message sample-notice">{sampleError}</p>}
          <div className="workflow-strip" aria-label="作成の流れ">
            <span><b>01</b> 素材を入れる</span><span className="workflow-line" /><span><b>02</b> 動きを整える</span><span className="workflow-line" /><span><b>03</b> 動画にする</span>
          </div>
          <fieldset className="studio-workspace" disabled={sampleLoading} aria-busy={sampleLoading} onDropCapture={(event) => {
            if (loadingRef.current) { event.preventDefault(); event.stopPropagation() }
          }}>
            <legend className="sr-only">キャラクター動画の編集</legend>
            <div className="studio-grid">
              <aside className="studio-inputs" aria-label="素材と音声"><CharacterUploader /><AudioControls /></aside>
              <div className="studio-preview"><CanvasPreview /><ExportControls /></div>
              <aside className="studio-settings" aria-label="動きとキャンバスの設定"><AnimationControls /></aside>
            </div>
          </fieldset>
        </main>
        <footer className="studio-footer"><span><span className={`status-dot${characterReady ? '' : ' status-dot-muted'}`} /><Phrases text={characterReady ? 'キャラクターの|準備が|できています' : '口の画像を|3枚|そろえて|スタート'} /></span><span><Phrases text="素材は|端末の外に|送られません · |再読み込みで|リセット" /></span></footer>
        <LegalFooter />
        <dialog className="guide-dialog" ref={guideRef}>
          <form method="dialog" className="guide-heading"><h2>{APP_NAME}の使い方</h2><button className="button button-ghost button-small" aria-label="使い方を閉じる">閉じる ×</button></form>
          <ol className="guide-steps">
            <li><strong><Phrases text="口の画像を|3枚|入れる" /></strong><p><Phrases text="閉じた口・|少し開いた口・|大きく開いた口の|画像を|用意。|まばたきの|画像は|任意です。|同じサイズ・|位置で|描いた|透過PNGが|おすすめです。" /></p></li>
            <li><strong><Phrases text="音声を|入れて、|再生する" /></strong><p><Phrases text="録音済みの|音声か|マイクを|選びます。|口が|動きにくいときは、|メーターを|見ながら|感度と|しきい値を|調整してください。" /></p></li>
            <li><strong><Phrases text="画角と|動きを|整える" /></strong><p><Phrases text="縦・横・正方形の|画角を|選び、|背景・|位置・|サイズを|調整します。|ドット絵は|「ドット絵モード」を|有効に。" /></p></li>
            <li><strong><Phrases text="録画して、|動画を|保存する" /></strong><p><Phrases text="「音声の最初から録画する」を|有効にすると、|音声の|最後まで|自動で|録画します。|完成後、|プレビューを|確認して|動画を|ダウンロードしてください。" /></p></li>
          </ol>
          <p className="hint"><Phrases text="動画の|透明背景は|ブラウザによって|黒に|なります。|編集ソフトで|背景を|抜く場合は|グリーンバックを|選んでください。|録画中は|このタブを|表示したままに|してください。" /></p>
        </dialog>
      </div>
    </PreviewCanvasContext.Provider>
  )
}
