"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Heart,
  Sun,
  Coins,
  Footprints,
  Check,
  Flag,
} from "lucide-react";
import {
  CATEGORIES,
  QUESTIONS,
  getQuestionPresentation,
  type CategoryId,
  type GameMode,
  type GameResult,
} from "@/lib/game";
import { api, decodeDemoResult, encodeDemoResult } from "@/lib/api";
import {
  prepareAudioSession,
  type PreparedGameAudioSession,
} from "@/lib/audio/session";
import Brand from "./Brand";
import SurveyRequest from "./SurveyRequest";
import RaceGame from "./RaceGame";
import ResultView from "./ResultView";
import AboutView from "./AboutView";
import RunnerScene from "./RunnerScene";

const icons = { daily: Sun, love: Heart, money: Coins };

export default function GameApp() {
  const [category, setCategory] = useState<CategoryId>(() => {
    if (typeof window === "undefined") return "daily";
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    return cat === "love" || cat === "money" ? cat : "daily";
  });
  const [mode, setMode] = useState<GameMode>("survival");
  const [runId, setRunId] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<GameResult | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("data");
    if (token) {
      return decodeDemoResult(token);
    }
    return null;
  });
  const [showAbout, setShowAbout] = useState(false);
  const [audioSession, setAudioSession] = useState<PreparedGameAudioSession | null>(null);
  const audioOwner = useRef<PreparedGameAudioSession | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("data");
      if (token) {
        const decoded = decodeDemoResult(token);
        if (decoded) {
          setActiveResult(decoded);
          setRunId(null);
          return;
        }
      }
      setActiveResult(null);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      mounted.current = false;
      window.removeEventListener("popstate", onPop);
      audioOwner.current?.disposeIfUnclaimed();
    };
  }, []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const starting = useRef(false);

  const preview = QUESTIONS[category][0];
  const previewPresentation = getQuestionPresentation(preview);

  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError("");
    const prepared = prepareAudioSession();
    audioOwner.current = prepared;
    try {
      const run = await api.startRun(category, mode);
      if (!mounted.current) {
        prepared.dispose();
        return;
      }
      setAudioSession(prepared);
      setRunId(run.id);
    } catch {
      prepared.dispose();
      setError("準備ができませんでした。もう一度お試しください。");
    } finally {
      starting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (showAbout) {
    return <AboutView onBack={() => setShowAbout(false)} />;
  }

  if (activeResult) {
    return (
      <ResultView
        result={activeResult}
        onReplay={(cat) => {
          setActiveResult(null);
          setCategory(cat);
          setRunId(null);
          window.history.pushState(null, "", window.location.pathname + "?category=" + cat);
        }}
        onHome={() => {
          setActiveResult(null);
          setRunId(null);
          window.history.pushState(null, "", window.location.pathname);
        }}
        onAbout={() => setShowAbout(true)}
      />
    );
  }

  if (runId) {
    return (
      <RaceGame
        key={runId}
        runId={runId}
        category={category}
        mode={mode}
        audioSession={audioSession}
        onExit={() => {
          setRunId(null);
          setAudioSession(null);
        }}
        onFinish={(result) => {
          setRunId(null);
          setAudioSession(null);
          setActiveResult(result);
          window.history.pushState(null, "", "?data=" + encodeDemoResult(result));
        }}
      />
    );
  }

  return (
    <div className="product-page">
      <header className="product-header">
        <Brand onReset={() => {
          setActiveResult(null);
          setRunId(null);
          window.history.pushState(null, "", window.location.pathname);
        }} />
        <a className="product-header-link" href="#how">
          あそびかた <ArrowUpRight size={16} />
        </a>
      </header>
      <main className="product-home">
        <section className="product-intro">
          <div className="product-kicker">
            <span />
            7つの選択で、じぶんを発見。
          </div>
          <h1 className="product-title" aria-label="あなたの普通、何％？">
            <span className="product-title-over">あなたの</span>
            <span className="product-title-main">
              普通<span>、</span>
            </span>
            <span className="product-title-end">
              何<span>％</span>
              <i>？</i>
            </span>
          </h1>
          <p className="product-lead">
            迫る、7つの二択。
            <br />
            直感で、道を選ぼう。
          </p>
          <div className="product-facts">
            <span>
              <Flag size={14} />
              7問
            </span>
            <span>約1分</span>
            <span>無料・登録不要</span>
          </div>
        </section>
        <section
          className="product-preview"
          aria-label="背面のランナーと二択ゲートが見えるゲームプレビュー"
        >
          <div className="product-preview-top">
            <span>
              <span className="product-preview-dot" /> YOUR NORMAL RUN
            </span>
            <span>01 / 07</span>
          </div>
          <div className="product-preview-world">
            <RunnerScene
              phase="idle"
              question={preview}
              lane={0}
              progress={0.15}
              category={category}
            />
          </div>
          <div className="product-preview-bottom">
            <span>
              QUESTION 01 : {preview.text}
            </span>
            <span>
              LEFT : {previewPresentation.left.name} / RIGHT : {previewPresentation.right.name}
            </span>
          </div>
        </section>
        <section className="product-play-setup" id="play-setup">
          <div className="product-setup-heading">
            <span>CHOOSE COURSE & MODE</span>
            <h2>どのテーマを走る？</h2>
          </div>
          <div className="product-courses" role="group" aria-label="コース選択">
            {CATEGORIES.map((cat) => {
              const Icon = icons[cat.id];
              const selected = category === cat.id;
              return (
                <button
                  key={cat.id}
                  disabled={busy}
                  onClick={() => setCategory(cat.id)}
                  aria-pressed={selected}
                  className={`product-course category-${cat.id} ${selected ? "is-current" : ""}`}
                >
                  <span className="product-course-icon">
                    <Icon size={21} strokeWidth={1.8} />
                  </span>
                  <span className="product-course-name">
                    {cat.name}
                    <small>
                      {cat.id === "daily"
                        ? "いつもの感覚"
                        : cat.id === "love"
                          ? "恋の価値観"
                          : "お金の使い方"}
                    </small>
                  </span>
                  <span className="product-course-check">
                    {selected && <Check size={12} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="product-mode" role="group" aria-label="ゲームモード">
            <button
              disabled={busy}
              onClick={() => setMode("survival")}
              aria-pressed={mode === "survival"}
              className={mode === "survival" ? "is-active" : ""}
            >
              <span>サバイバル</span>
              <span className="product-mode-indicator" />
            </button>
            <button
              disabled={busy}
              onClick={() => setMode("complete")}
              aria-pressed={mode === "complete"}
              className={mode === "complete" ? "is-active" : ""}
            >
              <span>7問完走</span>
              <span className="product-mode-indicator" />
            </button>
          </div>
          <p className="product-mode-description">
            {mode === "survival"
              ? "多数派で前進。少数派でコースアウト！"
              : "どちらの道でも、最後まで走れるモード。"}
          </p>
          <button
            className="product-play-button"
            onClick={start}
            disabled={busy}
          >
            <span className="product-play-icon">
              <Footprints size={21} />
            </span>
            <span>{busy ? "コースを準備中…" : "みんなと走る"}</span>
            <ArrowRight size={23} />
          </button>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <p className="product-practice-note">
            <span>お試しデータ</span>
            練習用の割合で遊べます。回答は集計されません。
          </p>
        </section>
      </main>
      <section
        className="product-how"
        id="how"
        aria-labelledby="product-how-title"
      >
        <div className="product-how-heading">
          <span>JUST CHOOSE YOUR WAY.</span>
          <h2 id="product-how-title">かんたん。でも、ちょっとドキドキ。</h2>
        </div>
        <div className="product-how-steps">
          <article>
            <span className="product-how-number">01</span>
            <div>
              <h3>自分の回答のゲートへ。</h3>
              <p>
                スワイプ・タップ・矢印キーで移動。回答の言葉を見て、通る直前まで選び直せます。
              </p>
            </div>
          </article>
          <article>
            <span className="product-how-number">02</span>
            <div>
              <h3>通ると、割合が見える。</h3>
              <p>同じ選択は何％？ 表示のあとは、そのまま次のゲートへ。</p>
            </div>
          </article>
          <article>
            <span className="product-how-number">03</span>
            <div>
              <h3>その結果を、友達にも。</h3>
              <p>
                普通度とタイプをシェア。「あなたはどっち？」で盛り上がろう。
              </p>
            </div>
          </article>
        </div>
      </section>
      <SurveyRequest />
      <section id="share" aria-label="このアプリを共有する"></section>
      <footer className="product-footer">
        <span>「ふつう」って、ひとそれぞれ。</span>
        <p>
          正解・不正解や科学的な性格診断ではありません。
          <br className="product-mobile-break" />
          周りのランナーは割合を表す演出です。
        </p>
        <button
          onClick={() => setShowAbout(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            font: 'inherit',
            color: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '8px'
          }}
        >
          データとプライバシー <ArrowUpRight size={14} />
        </button>
      </footer>
    </div>
  );
}
