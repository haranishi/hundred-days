import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { blockMediapipeTelemetry } from './no-telemetry';
import { HandView } from '../hand';
import type { Vec3 } from '../hand/types';
import { cameraSupported, type CameraCheckProps } from './index';
import { features, worldToScene, type WorldPoint } from './features';
import { createTarget, match } from './match';
import './camera.css';

const EXPLAINED = 'tekotoba-camera-explained-v1';
function hasReadExplanation(): boolean {
  try { return localStorage.getItem(EXPLAINED) === 'yes'; } catch { return false; }
}
function rememberExplanation(): void {
  try { localStorage.setItem(EXPLAINED, 'yes'); } catch { /* 保存できなくても練習できる */ }
}
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
] as const;
function draw(canvas: HTMLCanvasElement, video: HTMLVideoElement, points?: readonly WorldPoint[]): void {
  // 映像の縦横比をそのまま使い、canvasとvideoを同じCSSで反転させる。
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points || points.length !== 21) return;
  const style = getComputedStyle(canvas);
  ctx.strokeStyle = style.getPropertyValue('--c-primary').trim();
  ctx.fillStyle = style.getPropertyValue('--c-surface').trim();
  ctx.lineWidth = Math.max(3, canvas.width / 180);
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    const p = points[a]!, q = points[b]!;
    ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
    ctx.lineTo(q.x * canvas.width, q.y * canvas.height);
  }
  ctx.stroke();
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, ctx.lineWidth * 1.3, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
}
function cameraReason(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'カメラの使用が許可されませんでした。手本を見て、自分で確かめましょう。';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'カメラが見つかりませんでした。手本を見て、自分で確かめましょう。';
  return 'カメラを起動できませんでした。ほかのアプリで使っていないか確かめてください。';
}
type Stage = 'idle' | 'loading' | 'running' | 'paused' | 'success' | 'unavailable' | 'done';

export function CameraCheck(props: CameraCheckProps) {
  const [explained] = useState(hasReadExplanation);
  const [request, setRequest] = useState(0);
  const [stage, setStage] = useState<Stage>('idle');
  const [message, setMessage] = useState('手をカメラに写してください');
  const [canLeave, setCanLeave] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const endSession = useRef<(() => boolean) | null>(null);
  const target = useMemo(() => createTarget(props.item), [props.item]);

  useEffect(() => {
    if (target.status === 'unsupported') {
      setStage('unavailable'); setMessage(target.reason);
      latest.current.onUnavailable(target.reason);
      return;
    }
    if (request === 0) return;
    let disposed = false, finished = false;
    let stream: MediaStream | null = null;
    let detector: HandLandmarker | null = null;
    let frameId = 0, successTimer: ReturnType<typeof setTimeout> | undefined;
    let lastVideoTime = -1, lastDetection = -Infinity, matchingSince: number | null = null;
    // 21点の変換バッファはセッション中再利用。推論は最大20回/秒、新しい映像だけ。
    const scene: Vec3[] = Array.from({ length: 21 }, () => [0, 0, 0]);
    const video = videoRef.current!;
    setCanLeave(false); setStage('loading'); setMessage('カメラを準備しています');
    const leaveTimer = setTimeout(() => { if (!disposed && !finished) setCanLeave(true); }, 15_000);
    const release = () => {
      cancelAnimationFrame(frameId);
      clearTimeout(leaveTimer);
      stream?.getTracks().forEach(track => track.stop()); stream = null;
      video.srcObject = null;
      const closing = detector; detector = null;
      // wasm側の解放に失敗しても、代替練習への通知と後片付けは続ける。
      try { closing?.close(); } catch { /* カメラのトラックは停止済み */ }
    };
    const unavailable = (reason: string) => {
      if (disposed || finished) return;
      finished = true; release(); setMessage(reason); setStage('unavailable');
      latest.current.onUnavailable(reason);
    };
    endSession.current = () => {
      if (disposed || finished) return false;
      finished = true; release(); setStage('done'); return true;
    };
    const onVisibility = () => {
      if (document.hidden && !finished) {
        disposed = true; release(); matchingSince = null;
        setStage('paused'); setMessage('カメラを止めました。再開して続けられます');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const tick = (now: number) => {
      if (disposed || finished) return;
      try {
        if (detector && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetection >= 50) {
          if (now - lastDetection > 250) matchingSince = null; // 映像が止まっていた時間を一致時間に含めない
          lastDetection = now; lastVideoTime = video.currentTime;
          const result = detector.detectForVideo(video, now);
          const points = result.worldLandmarks[0];
          const actual = points ? features(worldToScene(points, scene), props.dominant) : null;
          const verdict = match(target, actual);
          if (canvasRef.current) draw(canvasRef.current, video, result.landmarks[0]);
          if (verdict.status === 'matched') {
            matchingSince ??= now;
            setMessage('その形を少し保ちましょう');
            if (now - matchingSince >= 500) {
              finished = true; release(); setStage('success'); setMessage('形を確かめられました');
              // 成功の表示を見せてから通知。外れたら通知も取り消す。
              successTimer = setTimeout(() => {
                if (!disposed && latest.current.item === props.item && latest.current.dominant === props.dominant) latest.current.onSuccess();
              }, 600);
              return;
            }
          } else {
            matchingSince = null;
            if (verdict.status === 'hint' || verdict.status === 'no-hand') setMessage(verdict.hint);
          }
        }
        frameId = requestAnimationFrame(tick);
      } catch {
        unavailable('手の読み取りを続けられませんでした。手本を見て、自分で確かめましょう。');
      }
    };
    void (async () => {
      if (document.hidden) { onVisibility(); return; }
      if (!cameraSupported()) {
        unavailable('この端末ではカメラを使えません。安全な接続で開いているか確かめてください。'); return;
      }
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (disposed || finished) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
      } catch (error) { unavailable(cameraReason(error)); return; }
      try {
        blockMediapipeTelemetry();
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
        if (disposed || finished) return;
        const files = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
        if (disposed || finished) return;
        const loaded = await HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: './mediapipe/hand_landmarker.task' },
          runningMode: 'VIDEO', numHands: 1,
        });
        if (disposed || finished) { loaded.close(); return; }
        detector = loaded;
      } catch {
        unavailable('手を読み取るためのデータを読み込めませんでした。接続を確かめて、自分で練習を続けましょう。'); return;
      }
      try {
        video.srcObject = stream;
        await video.play();
        if (disposed || finished) return;
        setStage('running'); setMessage('手をカメラに写してください');
        frameId = requestAnimationFrame(tick);
      } catch (error) { unavailable(cameraReason(error)); }
    })();
    return () => {
      disposed = true; release(); clearTimeout(successTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      endSession.current = null;
    };
  }, [request, target, props.dominant]);

  const start = () => { rememberExplanation(); setRequest(n => n + 1); };
  const finish = (callback: () => void) => { if (endSession.current?.()) callback(); };
  const idle = stage === 'idle', paused = stage === 'paused';
  return <section class="camera-check" aria-label="カメラで形を確かめる">
    {idle && !explained && <div class="camera-check__explanation">
      <p>映像はこの端末の中で処理し、保存しません</p>
      <p>はじめに約10MBを読み込みます（2回目からは速くなります）</p>
    </div>}
    {(idle || paused) && <button class="camera-check__button camera-check__button--primary" type="button" onClick={start}>
      {paused ? 'カメラを再開する' : 'カメラを使う'}
    </button>}
    <div class="camera-check__practice">
      <div class="camera-check__capture" hidden={stage !== 'running' && stage !== 'loading'} aria-busy={stage === 'loading'}>
        <video class="camera-check__video" ref={videoRef} autoPlay muted playsInline aria-label="鏡のように映したカメラの映像" />
        <canvas class="camera-check__skeleton" ref={canvasRef} aria-hidden="true" />
      </div>
      <figure class="camera-check__target">
        <HandView spec={props.item.sign} dominant={props.dominant} perspective="self" label={`${props.item.label}の手本。${props.item.describe.self}`} size="sm" autoplay={false} />
        <figcaption>「{props.item.label}」の手本（自分から）</figcaption>
      </figure>
    </div>
    {!idle && <p class={`camera-check__hint${stage === 'success' ? ' camera-check__hint--success' : ''}`} role="status" aria-live="polite" aria-atomic="true">{message}</p>}
    {canLeave && (stage === 'running' || stage === 'loading') && <div class="camera-check__actions">
      <button class="camera-check__button camera-check__button--primary" type="button" onClick={() => finish(() => latest.current.onSelfJudge())}>できた（自分で判断）</button>
      <button class="camera-check__button" type="button" onClick={() => finish(() => latest.current.onSkip())}>スキップ</button>
    </div>}
  </section>;
}
