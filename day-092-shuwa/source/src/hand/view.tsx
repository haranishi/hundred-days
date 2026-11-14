/**
 * HandView（Preact 部品）。three.js の描画部分は動的 import で遅れて読み込み、それまでは軽い仮表示を出す。
 * 形の説明文（label）は、読み上げ用の代替テキストとして常に持つ。3D が描けない環境では label を文字で見せる。
 *
 * hand-r2 で直したこと（使い心地の評価の指摘）:
 *  - 作り直した瞬間のちらつき: 画面の側は再生のやり直しで key を変えて作り直す。描画の部分を読み込み済みなら、画面に出す前（レイアウトの直後）に
 *    1コマ目を描く。以前は作り直した直後の2コマが空で、1コマ目に読み込み中の仮表示が出ていた
 *  - 縦の払いはページのスクロールに渡し、横の払いだけで回す（core/gesture.ts）
 *  - 「向きを戻す」は見えない時も場所を取っておく（出る・消えるたびに、ほかのボタンが横へずれないように）
 *  - controls で、出すボタンを選べる（親の画面が自分で再生を操る時は 'view'）
 */
import { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { HandViewHandle, HandViewProps, Perspective } from './types';
import { stableStringify } from './core/stable';
import { dragIntent, dragRotation, type DragIntent } from './core/gesture';
import './hand-view.css';

type Runtime = typeof import('./render/runtime');
type Controller = import('./render/runtime').HandViewController;

let runtimePromise: Promise<Runtime> | null = null;
/** 読み込み済みの描画の部分（作り直す時に、待たずに1コマ目を描くため） */
let runtimeLoaded: Runtime | null = null;
/** three.js の部分を読み込む（1回だけ。失敗したら次に呼んだ時に読み直す） */
export function loadRuntime(): Promise<Runtime> {
  runtimePromise ??= import('./render/runtime').then(
    (rt) => (runtimeLoaded = rt),
    (e: unknown) => {
      runtimePromise = null;
      throw e;
    },
  );
  return runtimePromise;
}

type Status = 'loading' | 'ready' | 'fallback';

export const HandView = forwardRef<HandViewHandle, HandViewProps>(function HandView(props, ref) {
  const {
    spec,
    label,
    dominant = 'right',
    autoplay = true,
    loop = false,
    size = 'md',
    interactive = false,
    controls = 'full',
    reducedMotion = false,
  } = props;
  const [perspective, setPerspective] = useState<Perspective>(props.perspective ?? 'viewer');
  useEffect(() => {
    if (props.perspective) setPerspective(props.perspective);
  }, [props.perspective]);
  // 描画の部分を読み込み済みで 3D が描けるなら、仮表示を出さずに始める（1コマ目はレイアウトの直後に描く）
  const [status, setStatus] = useState<Status>(() => (runtimeLoaded?.webglSupported() ? 'ready' : 'loading'));
  const [rotated, setRotated] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<Controller | null>(null);
  const pendingReplay = useRef<1 | 0.5 | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; yaw: number; pitch: number; intent: DragIntent; type: string } | null>(null);
  const specKey = useMemo(() => stableStringify(spec), [spec]);
  const latest = useRef({ spec, perspective, dominant, autoplay, loop, reducedMotion, label });
  latest.current = { spec, perspective, dominant, autoplay, loop, reducedMotion, label };

  useLayoutEffect(() => {
    let alive = true;
    const start = (rt: Runtime) => {
      if (!alive || !canvasRef.current) return;
      const L = latest.current;
      const c = rt.HandViewController.create(canvasRef.current, L.spec, {
        perspective: L.perspective,
        dominant: L.dominant,
        autoplay: L.autoplay,
        loop: L.loop,
        reducedMotion: L.reducedMotion,
      });
      if (!c) {
        setStatus('fallback');
        return;
      }
      ctrl.current = c;
      const el = stageRef.current;
      if (el) c.setSize(el.clientWidth, el.clientHeight, window.devicePixelRatio || 1);
      if (pendingReplay.current) {
        c.play(pendingReplay.current);
        pendingReplay.current = null;
      }
      // 次のコマを待たずに、いま描く（作り直した直後に空の表示を見せない）
      c.renderNow();
      if (import.meta.env.DEV && c.warnings.length > 0) console.warn(`[hand-model] ${L.label}:`, c.warnings);
      setStatus('ready');
    };
    if (runtimeLoaded) start(runtimeLoaded);
    else
      loadRuntime().then(start, () => {
        if (alive) setStatus('fallback');
      });
    return () => {
      alive = false;
      ctrl.current?.dispose();
      ctrl.current = null;
    };
  }, []);

  useEffect(() => {
    ctrl.current?.setSpec(latest.current.spec);
    setRotated(false);
  }, [specKey]);

  useEffect(() => {
    ctrl.current?.update({ perspective, dominant, autoplay, loop, reducedMotion });
  }, [perspective, dominant, autoplay, loop, reducedMotion, status]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || status !== 'ready') return;
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => ctrl.current?.setSize(el.clientWidth, el.clientHeight, window.devicePixelRatio || 1))
        : null;
    ro?.observe(el);
    // 画面の外では止める
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            for (const e of entries) ctrl.current?.setVisible(e.isIntersecting);
          })
        : null;
    io?.observe(el);
    return () => {
      ro?.disconnect();
      io?.disconnect();
    };
  }, [status]);

  const replay = (speed: 1 | 0.5) => {
    if (ctrl.current) ctrl.current.play(speed);
    else pendingReplay.current = speed;
  };
  useImperativeHandle(ref, () => ({ replay: (speed: 1 | 0.5 = 1) => replay(speed) }), []);

  const choose = (p: Perspective) => {
    setPerspective(p);
    setRotated(false);
    props.onPerspectiveChange?.(p);
  };
  const resetRotation = () => {
    ctrl.current?.resetRotation(!reducedMotion);
    setRotated(false);
  };

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!interactive || !ctrl.current) return;
    const r = ctrl.current.getRotation();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: r.yaw, pitch: r.pitch, intent: 'pending', type: e.pointerType };
  };
  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !ctrl.current) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.intent === 'pending') {
      d.intent = dragIntent(dx, dy, d.type);
      if (d.intent === 'pending') return;
      if (d.intent === 'scroll') {
        // 縦の払い: ページのスクロールに任せる（touch-action: pan-y。ブラウザが pointercancel を送ってくる）
        drag.current = null;
        return;
      }
      // 回すと決めてから捕まえる（縦の払いの時はスクロールを邪魔しないように、押した時には捕まえない）
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const r = dragRotation(dx, dy, e.currentTarget.clientWidth, d.type);
    ctrl.current.setRotation(d.yaw + r.yaw, d.pitch + r.pitch);
    if (!rotated) setRotated(true);
  };
  const endDrag = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const showControls = interactive && controls !== 'none' && status !== 'fallback';
  const cls = ['hand-view', `hand-view--${size}`, interactive ? 'hand-view--interactive' : '', props.class ?? ''].filter(Boolean).join(' ');
  return (
    <div class={cls} data-status={status} data-perspective={perspective}>
      <div
        class="hand-view__stage"
        ref={stageRef}
        role={status === 'fallback' ? undefined : 'img'}
        aria-label={status === 'fallback' ? undefined : label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas class="hand-view__canvas" ref={canvasRef} aria-hidden="true" />
        {status === 'loading' && <span class="hand-view__placeholder" aria-hidden="true" />}
        {status === 'fallback' && <p class="hand-view__fallback">{label}</p>}
      </div>
      {showControls && (
        <div class="hand-view__controls">
          <div class="hand-view__switch" role="group" aria-label="見る向き">
            <button type="button" class="hand-view__btn" aria-pressed={perspective === 'viewer'} onClick={() => choose('viewer')}>
              相手から見る
            </button>
            <button type="button" class="hand-view__btn" aria-pressed={perspective === 'self'} onClick={() => choose('self')}>
              自分から見る
            </button>
          </div>
          <div class="hand-view__actions">
            {controls === 'full' && (
              <>
                <button type="button" class="hand-view__btn" onClick={() => replay(1)}>
                  もう一度
                </button>
                <button type="button" class="hand-view__btn" onClick={() => replay(0.5)}>
                  ゆっくり
                </button>
              </>
            )}
            {/* 回していない時も場所を取っておく（見えない・押せない・読み上げない） */}
            <button
              type="button"
              class={rotated ? 'hand-view__btn' : 'hand-view__btn hand-view__btn--reserved'}
              onClick={resetRotation}
              disabled={!rotated}
              aria-hidden={rotated ? undefined : 'true'}
              tabIndex={rotated ? undefined : -1}
            >
              向きを戻す
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
