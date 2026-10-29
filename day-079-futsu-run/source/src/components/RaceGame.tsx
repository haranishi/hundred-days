"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  X,
  Footprints,
  Volume2,
  VolumeX,
  MoveHorizontal,
  Sparkles,
  Flag,
} from "lucide-react";
import {
  CATEGORIES,
  QUESTIONS,
  getQuestionPresentation,
  type CategoryId,
  type GameMode,
  type Choice,
} from "@/lib/game";
import { api, encodeDemoResult } from "@/lib/api";
import {
  raceReducer,
  initialRace,
  HOLD_PROGRESS,
  REVEAL_SECONDS,
} from "@/lib/race";
import { useGameAudio, type PreparedGameAudioSession } from "@/lib/useGameAudio";
const RunnerScene = dynamic(() => import("./RunnerScene"), {
  ssr: false,
  loading: () => (
    <div className="race-loading">
      <span className="race-loading-orbit">
        <Footprints size={32} />
      </span>
      <b>コースを準備しています</b>
      <span>もうすぐ、あなたの番。</span>
    </div>
  ),
});
const subscribeVisibility = (callback: () => void) => {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
};
const getHidden = () => document.hidden;
export default function RaceGame({
  runId,
  category,
  mode,
  onExit,
  audioSession,
}: {
  runId: string;
  category: CategoryId;
  mode: GameMode;
  onExit: () => void;
  audioSession?: PreparedGameAudioSession | null;
}) {
  const [state, dispatch] = useReducer(raceReducer, initialRace);
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    getHidden,
    () => false,
  );
  const drag = useRef<{ pointerId: number; anchorX: number } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const pauseButton = useRef<HTMLButtonElement>(null);
  const lastCue = useRef("");
  const {
    enabled,
    notice,
    toggle,
    play,
    footstep,
    setScene,
    musicVolume,
    effectsVolume,
    setMusicVolume,
    setEffectsVolume,
  } = useGameAudio(audioSession);
  const question = QUESTIONS[category][state.index];
  const course = CATEGORIES.find((c) => c.id === category)!;
  const presentation = getQuestionPresentation(question);
  const ready = useCallback(() => dispatch({ type: "ready" }), []);
  const choose = useCallback(
    (choice: Choice) => {
      if (
        state.stage !== "approach" ||
        state.paused ||
        !state.ready ||
        document.hidden ||
        state.lane === (choice === 0 ? -1 : 1)
      )
        return;
      play("select");
      dispatch({ type: "select", choice });
    },
    [state.stage, state.paused, state.ready, state.lane, play],
  );
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const animate = (now: number) => {
      const delta = last ? (now - last) / 1000 : 0;
      last = now;
      if (!document.hidden && delta > 0)
        dispatch({ type: "frame", seconds: delta });
      frame = requestAnimationFrame(animate);
    };
    const resetClock = () => {
      last = 0;
    };
    document.addEventListener("visibilitychange", resetClock);
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resetClock);
    };
  }, []);
  useEffect(() => {
    if (state.stage !== "crossing") return;
    let active = true;
    const index = state.index;
    void api
      .vote(runId, question.id, state.lane === -1 ? 0 : 1)
      .then((answer) => {
        if (active) dispatch({ type: "answer", index, answer });
      })
      .catch(() => {
        if (active)
          dispatch({
            type: "error",
            message: "この分かれ道を記録できませんでした。もう一度試せます。",
          });
      });
    return () => {
      active = false;
    };
  }, [state.stage, state.index, state.lane, runId, question.id]);
  useEffect(() => {
    if (state.stage !== "finish") return;
    let active = true;
    void api
      .finish(runId)
      .then((result) => {
        if (active && onFinish)
          onFinish(result);
      })
      .catch(() => {
        if (active)
          dispatch({
            type: "error",
            message: "結果を表示できませんでした。もう一度試せます。",
          });
      });
    return () => {
      active = false;
    };
  }, [state.stage, runId, onFinish]);
  useEffect(() => {
    const event = `${state.index}:${state.stage}`;
    if (lastCue.current === event) return;
    lastCue.current = event;
    if (hidden || state.paused) return;
    if (state.stage === "reveal") play("pass");
    else if (state.stage === "fall") play("fall");
    else if (state.stage === "approach" && state.index === 0) play("start");
  }, [state.stage, state.index, state.paused, hidden, play]);
  useEffect(() => {
    if (state.stage !== "approach" || state.paused || hidden) drag.current = null;
  }, [state.stage, state.index, state.paused, hidden]);
  const modalOpen = state.paused || state.stage === "error";
  useLayoutEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement;
    const fallback = pauseButton.current;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        previous !== document.body &&
        !previous.matches(":disabled")
      )
        previous.focus({ preventScroll: true });
      else fallback?.focus({ preventScroll: true });
    };
  }, [modalOpen]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        document.hidden ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "pause" });
        return;
      }
      if (modalOpen) return;
      if (["ArrowLeft", "1", "a", "A"].includes(event.key)) {
        event.preventDefault();
        choose(0);
      }
      if (["ArrowRight", "2", "d", "D"].includes(event.key)) {
        event.preventDefault();
        choose(1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [choose, modalOpen]);
  const revealing = ["reveal", "fall", "finish"].includes(state.stage);
  const countdown = state.stage === "countdown";
  const scenePhase =
    state.stage === "fall" || state.answer?.eliminated
      ? "fall"
      : state.stage === "finish"
        ? "finish"
        : revealing
          ? "reveal"
          : state.stage === "crossing"
            ? "choosing"
            : countdown
              ? "idle"
              : "running";
  const answer = state.answer;
  const split: [number, number] | null = answer
    ? [
        (answer.counts[0] / answer.total) * 100,
        (answer.counts[1] / answer.total) * 100,
      ]
    : null;
  const paused = state.paused || hidden;
  const holding =
    state.stage === "approach" &&
    state.lane === 0 &&
    state.progress >= HOLD_PROGRESS;
  const selected = state.lane === 0 ? null : state.lane === -1 ? 0 : 1;
  useEffect(() => {
    setScene({
      phase: state.stage,
      paused: state.paused,
      hidden,
      holding,
      category,
    });
  }, [setScene, state.stage, state.paused, hidden, holding, category]);
  const cueText = answer?.eliminated
    ? "その個性、いいね！"
    : answer?.percentage === 50
      ? "みんなの感覚、半分ずつ。"
      : (answer?.percentage ?? 0) > 50
        ? "あなたは多数派！"
        : "意外と少数派！";
  const liveMessage =
    state.stage === "countdown"
      ? "まもなくスタート。左右のボタンかスワイプで進む道を選びます。"
      : state.stage === "approach"
        ? `第${state.index + 1}問。${question.text} 左は${question.options[0]}、右は${question.options[1]}。`
        : (state.stage === "reveal" || state.stage === "fall") && answer
          ? `${cueText} ${question.options[answer.choice]}を選んだ割合は${Math.round(answer.percentage)}%。${answer.eliminated ? "ここでラン終了です。" : "次の問いへ進みます。"}`
          : "";
  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const buttons = dialog.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled)",
    );
    if (!buttons?.length) return;
    const first = buttons[0],
      last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      className={`race-screen quality-race ${revealing ? "is-revealing" : ""}`}
    >
      <div
        className="race-live-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveMessage}
      </div>
      <aside className="race-side-copy" aria-hidden="true">
        <span className="race-brand-percent">%</span>
        <span>
          YOUR CHOICE,
          <br />
          YOUR WAY.
        </span>
        <b>
          「ふつう」って、
          <br />
          ひとそれぞれ。
        </b>
        <p>
          同じでも、違っても。
          <br />
          その感覚が、あなたらしさ。
        </p>
        <span className="race-side-rule">07 QUESTIONS / 01 MINUTE</span>
      </aside>
      <main
        className="race-viewport"
        data-stage={state.stage}
        data-question={state.index + 1}
        data-progress={state.progress.toFixed(3)}
      >
        <div
          className="race-world"
          aria-hidden="true"
          onPointerDown={(event) => {
            if (!event.isPrimary || drag.current) return;
            drag.current = { pointerId: event.pointerId, anchorX: event.clientX };
            event.currentTarget.setPointerCapture(event.pointerId);
            const rect = event.currentTarget.getBoundingClientRect();
            choose(event.clientX < rect.left + rect.width / 2 ? 0 : 1);
          }}
          onPointerMove={(event) => {
            const gesture = drag.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            const dx = event.clientX - gesture.anchorX;
            if (Math.abs(dx) >= 18) {
              choose(dx < 0 ? 0 : 1);
              drag.current = { pointerId: event.pointerId, anchorX: event.clientX };
            }
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId === event.pointerId) drag.current = null;
          }}
          onPointerCancel={(event) => {
            if (drag.current?.pointerId === event.pointerId) drag.current = null;
          }}
          onLostPointerCapture={(event) => {
            if (drag.current?.pointerId === event.pointerId) drag.current = null;
          }}
        >
          <RunnerScene
            lane={state.lane}
            phase={scenePhase}
            progress={state.progress}
            questionKey={question.id}
            split={split}
            paused={
              paused || (countdown && state.ready) || state.stage === "error"
            }
            category={category}
            gateLabels={presentation.gateLabels}
            gateBadges={presentation.badges}
            holding={holding}
            onFootstep={footstep}
            onReady={ready}
          />
        </div>
        <header className="race-topbar">
          <button
            className="race-icon-button"
            onClick={onExit}
            aria-label="トップへ戻る"
            tabIndex={modalOpen ? -1 : 0}
          >
            <X size={19} />
          </button>
          <div className="race-course">
            <span>
              {course.name}
              <small>{mode === "survival" ? "SURVIVAL" : "COMPLETE"}</small>
            </span>
            <b>
              {String(state.index + 1).padStart(2, "0")}
              <small> / 07</small>
            </b>
          </div>
          <div className="race-top-actions">
            <button
              className="race-icon-button race-audio-button"
              onClick={() => void toggle()}
              aria-label={enabled ? "音をオフにする" : "音をオンにする"}
              aria-pressed={enabled}
              title="BGM・足音・効果音"
              tabIndex={modalOpen ? -1 : 0}
            >
              {enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <button
              ref={pauseButton}
              className="race-icon-button"
              onClick={() => dispatch({ type: "pause" })}
              aria-label={state.paused ? "ゲームを再開" : "ゲームを一時停止"}
              disabled={state.stage === "finish"}
              tabIndex={modalOpen ? -1 : 0}
            >
              {state.paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
          </div>
        </header>
        <section
          className="race-question"
          aria-labelledby="race-question-title"
        >
          <div className="race-question-number">
            <span>YOUR CHOICE {String(state.index + 1).padStart(2, "0")}</span>
            <span>お試しデータ</span>
          </div>
          <h1 key={question.id} id="race-question-title">
            {question.text}
          </h1>
          <div
            className="race-progress"
            role="progressbar"
            aria-label="通過したゲート"
            aria-valuenow={state.answers.length}
            aria-valuemin={0}
            aria-valuemax={7}
          >
            {QUESTIONS[category].map((q, i) => (
              <span
                key={q.id}
                className={
                  i < state.answers.length
                    ? "done"
                    : i === state.index
                      ? "current"
                      : ""
                }
              />
            ))}
          </div>
        </section>
        {countdown && state.ready && !state.paused && (
          <div className="race-countdown" aria-hidden="true">
            <div
              className="race-countdown-number"
              key={Math.ceil((1.8 - state.clock) / 0.6)}
            >
              {Math.max(1, Math.ceil((1.8 - state.clock) / 0.6))}
            </div>
            <span>自分の回答が書かれた道へ。</span>
            {!enabled && (
              <small className="race-countdown-sound">
                音をオンにすると、BGMと足音も。
              </small>
            )}
            <div className="race-gesture">
              <ArrowLeft size={18} />
              <MoveHorizontal size={26} />
              <ArrowRight size={18} />
            </div>
          </div>
        )}
        {revealing && answer && (
          <section
            className={`race-reveal ${answer.eliminated ? "race-reveal-fall" : ""}`}
            key={question.id}
            aria-label="ゲートの通過結果"
          >
            <span className="race-reveal-icon" aria-hidden="true">
              {answer.eliminated ? <Sparkles size={20} /> : <Flag size={20} />}
            </span>
            <span className="race-reveal-kicker">{cueText}</span>
            <div className="race-percentages">
              {question.options.map((option, i) => (
                <div
                  key={option}
                  className={answer.choice === i ? "was-your-choice" : ""}
                >
                  <span>{presentation.badges[i]}</span>
                  <strong>
                    {Math.round(split![i])}
                    <small>%</small>
                  </strong>
                  <small className="race-reveal-option">{option}</small>
                </div>
              ))}
            </div>
            <p>
              同じ選択は <b>{Math.round(answer.percentage)}%</b>
            </p>
            <div className="race-next-countdown">
              <span
                style={{
                  transform: `scaleX(${Math.max(0, 1 - state.clock / REVEAL_SECONDS)})`,
                }}
              />
            </div>
            <small>
              {answer.eliminated
                ? "ここでコースアウト。結果へ！"
                : state.index === 6
                  ? "走りきった！ 結果を発表します"
                  : "そのまま、次のゲートへ！"}
            </small>
          </section>
        )}
        <div className="race-controls">
          <div
            className={`race-lane-message ${holding ? "needs-choice" : ""}`}
            aria-live="off"
          >
            {!state.ready ? (
              "コースを準備しています…"
            ) : countdown ? (
              "まもなく、スタート！"
            ) : holding ? (
              <>
                <MoveHorizontal size={17} />
                どちらか選んだら、走り出すよ
              </>
            ) : state.stage === "crossing" ? (
              "ゲートを通過！"
            ) : revealing ? (
              answer?.eliminated ? (
                "その違いが、あなたらしさ。"
              ) : (
                "NICE CHOICE!"
              )
            ) : selected !== null ? (
              <>
                <span className="race-selected-dot" />
                今の進路：{question.options[selected]}
              </>
            ) : (
              <>
                <MoveHorizontal size={17} />
                スワイプでも、ボタンでも。
              </>
            )}
          </div>
          <div className="race-choices" role="group" aria-label="進む道を選択">
            {question.options.map((option, choice) => (
              <button
                key={option}
                aria-label={`${choice === 0 ? "左" : "右"}のゲート：${option}`}
                aria-pressed={selected === choice}
                disabled={state.stage !== "approach" || paused || !state.ready}
                onClick={() => choose(choice as Choice)}
                className={`race-choice race-choice-${choice} ${selected === choice ? "is-selected" : ""}`}
              >
                <span
                  className={`race-choice-symbol ${presentation.kind === "yes-no" ? "is-word" : ""}`}
                >
                  {presentation.badges[choice]}
                </span>
                <span className="race-choice-copy">
                  <small>
                    {selected === choice
                      ? "選択中"
                      : choice === 0
                        ? "LEFT"
                        : "RIGHT"}
                  </small>
                  <b>{option}</b>
                </span>
                {choice === 0 ? (
                  <ArrowLeft size={18} />
                ) : (
                  <ArrowRight size={18} />
                )}
              </button>
            ))}
          </div>
          <p className="race-controls-hint">
            <span>タップ・スワイプ・← →で移動</span>
            <span>練習用の割合・回答は集計されません</span>
          </p>
        </div>
        <div className="race-audio-notice" role="status" aria-live="polite">
          {notice}
        </div>
        {modalOpen && (
          <div
            ref={dialog}
            className="race-pause-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="race-dialog-title"
            aria-describedby="race-dialog-description"
            onKeyDown={trapFocus}
          >
            <div className="race-pause-card">
              <span className="race-pause-symbol">
                {state.stage === "error" ? (
                  <Footprints size={25} />
                ) : (
                  <Pause size={25} />
                )}
              </span>
              <span className="eyebrow">
                {state.stage === "error"
                  ? "LET’S TRY AGAIN."
                  : "TAKE YOUR TIME."}
              </span>
              <h2 id="race-dialog-title">
                {state.stage === "error"
                  ? "もう一度、走り出そう。"
                  : "ちょっと、ひと休み。"}
              </h2>
              <p id="race-dialog-description">
                {state.stage === "error" ? (
                  state.error
                ) : (
                  <>
                    進路と進み具合は、そのまま。
                    <br />
                    ひと息ついたら、続きを走ろう。
                  </>
                )}
              </p>
              <button
                className="primary-button"
                onClick={() =>
                  dispatch({
                    type: state.stage === "error" ? "retry" : "pause",
                  })
                }
              >
                {state.stage === "error" ? "もう一度試す" : "走るのを再開"}{" "}
                <Play size={18} />
              </button>
              {state.stage !== "error" && (
                <section className="race-sound-settings" aria-label="音の設定">
                  <div className="race-sound-heading">
                    <span>
                      <Volume2 size={16} /> 音の設定
                    </span>
                    <button
                      className="race-sound-toggle"
                      onClick={() => void toggle()}
                      aria-pressed={enabled}
                      aria-label={
                        enabled
                          ? "サウンドをオフにする"
                          : "サウンドをオンにする"
                      }
                    >
                      {enabled ? "オン" : "オフ"}
                      <span />
                    </button>
                  </div>
                  <label
                    className="race-volume-row"
                    htmlFor="race-music-volume"
                  >
                    <span>BGM</span>
                    <input
                      id="race-music-volume"
                      aria-label="BGMの音量"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(musicVolume * 100)}
                      aria-valuetext={`${Math.round(musicVolume * 100)}%`}
                      onChange={(event) =>
                        setMusicVolume(Number(event.target.value) / 100)
                      }
                    />
                    <output>{Math.round(musicVolume * 100)}%</output>
                  </label>
                  <label
                    className="race-volume-row"
                    htmlFor="race-effects-volume"
                  >
                    <span>足音・効果音</span>
                    <input
                      id="race-effects-volume"
                      aria-label="足音・効果音の音量"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(effectsVolume * 100)}
                      aria-valuetext={`${Math.round(effectsVolume * 100)}%`}
                      onChange={(event) =>
                        setEffectsVolume(Number(event.target.value) / 100)
                      }
                    />
                    <output>{Math.round(effectsVolume * 100)}%</output>
                  </label>
                  <small>
                    {enabled
                      ? "再開すると、BGMと足音が流れます。"
                      : "音はオフです。オンにして楽しめます。"}
                  </small>
                </section>
              )}
              <button className="race-text-button" onClick={onExit}>
                トップへ戻る
              </button>
              {state.stage !== "error" && (
                <small>キーボードなら Esc で停止・再開</small>
              )}
            </div>
          </div>
        )}
      </main>
      <aside className="race-side-note" aria-hidden="true">
        <span>A ← YOUR CHOICE → B</span>
        <p>
          周りのランナーは、
          <br />
          割合を見せる演出です。
        </p>
        <span className="race-key-hint">
          ← →<small>MOVE</small>ESC<small>PAUSE</small>
        </span>
      </aside>
    </div>
  );
}
