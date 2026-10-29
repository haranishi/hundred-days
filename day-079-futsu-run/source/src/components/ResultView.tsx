"use client";
import { useSyncExternalStore, useState } from "react";
import { encodeDemoResult } from "@/lib/api";
import {
  ArrowUpRight,
  Check,
  Copy,
  Share2,
  RotateCcw,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { CATEGORIES, QUESTIONS, type GameResult } from "@/lib/game";
import Brand from "./Brand";
import SurveyRequest from "./SurveyRequest";
export default function ResultView({ result, onReplay, onHome, onAbout }: { result: GameResult; onReplay?: (cat: any) => void; onHome?: () => void; onAbout?: () => void }) {
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const nativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false,
  );
  const survived = result.completed && !result.answers.at(-1)?.eliminated;
  const category = CATEGORIES.find((c) => c.id === result.category)!;
  const minorityQuestion = result.minority
    ? QUESTIONS[result.category].find(
        (q) => q.id === result.minority?.questionId,
      )
    : undefined;
  const shareText = `【お試しデータの結果】私の普通度は${result.score}％。「${result.typeName}」でした！ ${category.name}コース ${result.answers.length}/7問。あなたの普通は？ #あなたの普通何パーセント`;
  function getUrl() {
    const url = new URL(window.location.href);
    url.search = '?data=' + encodeDemoResult(result);
    url.hash = '';
    return url.href;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(getUrl());
      setCopied(true);
      setNotice("結果のリンクをコピーしました");
    } catch {
      setNotice(
        "コピーできませんでした。アドレスバーからURLをコピーしてください。",
      );
    }
  }
  async function share() {
    try {
      await navigator.share({
        title: "あなたの普通、何％？",
        text: shareText,
        url: getUrl(),
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setNotice("共有できませんでした。リンクのコピーも利用できます。");
    }
  }
  function social(which: "x" | "line") {
    const url =
      which === "x"
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(getUrl())}`
        : `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(getUrl())}&text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return (
    <div className="product-page product-result-page">
      <header className="product-header">
        <Brand />
        <button className="product-header-link" onClick={onHome} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          トップへ戻る <RotateCcw size={15} />
        </button>
      </header>
      <main className="product-result-main">
        <div className="product-result-intro">
          <div className="product-result-topline">
            <span className="product-kicker">
              <span />
              {survived ? "NICE RUN!" : "YOUR CHOICE, YOUR CHARM."}
            </span>
            <a className="product-result-quickshare" href="#result-share">
              <Share2 size={14} />
              結果をシェア <ArrowRight size={14} />
            </a>
          </div>
          <h1>
            {survived
              ? "完走！あなたの「普通」は…"
              : "その違いが、あなたらしさ。"}
          </h1>
          <p>
            {category.name}コース <span>·</span>{" "}
            {result.mode === "survival" ? "サバイバル" : "7問完走"}{" "}
            <span>·</span> {result.answers.length} / 7問
            {!survived && "でラン終了"}
          </p>
        </div>
        <section
          className="result-card product-result-card"
          aria-label="あなたの普通度"
        >
          <div className="product-ticket-top">
            <span>あなたの普通、何％？</span>
            <span>MY NORMAL PASS</span>
          </div>
          <div className="product-ticket-main">
            <span className="product-ticket-practice">お試しデータの結果</span>
            <div className="product-ticket-score">
              <svg
                className="product-score-ring"
                viewBox="0 0 220 220"
                aria-hidden="true"
              >
                <circle
                  cx="110"
                  cy="110"
                  r="99"
                  fill="none"
                  stroke="#c7ddae"
                  strokeWidth="1"
                  strokeDasharray="2 5"
                />
                <circle
                  cx="110"
                  cy="110"
                  r="89"
                  fill="none"
                  stroke="#deedc9"
                  strokeWidth="8"
                />
                <circle
                  cx="110"
                  cy="110"
                  r="89"
                  fill="none"
                  stroke="#78a953"
                  strokeWidth="8"
                  pathLength="100"
                  strokeDasharray={`${result.score} ${100 - result.score}`}
                  strokeLinecap="round"
                  transform="rotate(-90 110 110)"
                />
              </svg>
              <span className="product-score-label">あなたの普通度</span>
              <div className="result-score product-result-score">
                <span>{result.score}</span>
                <span>％</span>
              </div>
              <Sparkles
                className="product-score-spark"
                size={26}
                strokeWidth={1.3}
                aria-hidden="true"
              />
            </div>
            <h2 className="product-result-type">{result.typeName}</h2>
            <p className="product-result-comment">{result.comment}</p>
          </div>
          <div className="product-ticket-perforation" aria-hidden="true" />
          {result.minority && minorityQuestion && (
            <div className="product-result-minority">
              <span>いちばん、あなたらしかった選択</span>
              <p>{minorityQuestion.text}</p>
              <div className="product-minority-row">
                <b>「{minorityQuestion.options[result.minority.choice]}」</b>
                <span>
                  <strong>
                    {Math.round(result.minority.percentage)}
                    <small>%</small>
                  </strong>
                  <span>練習用の割合</span>
                </span>
              </div>
            </div>
          )}
          <div className="product-ticket-bottom">
            <span>
              {result.completed
                ? "7つの選択、7つのあなたらしさ。"
                : `${result.answers.length}問の回答から計算した途中結果です。`}
            </span>
            <span aria-hidden="true">YOUR CHOICE →</span>
          </div>
        </section>
        <p className="product-result-note">
          表示の割合は練習用のお試しデータです。回答は収集・集計されません。
          <br />
          普通度は{result.answers.length}
          問で選んだ側の割合の平均で、科学的な性格診断ではありません。
        </p>
        <section
          className="product-result-share"
          id="result-share"
          aria-label="結果を共有"
        >
          <div className="product-share-heading">
            <h2>友達の「普通」も、気にならない？</h2>
            <p>この結果を送って、同じ7問に挑戦してもらおう。</p>
          </div>
          <div className="product-share-grid">
            <button
              className="product-share-button product-share-x"
              onClick={() => social("x")}
            >
              <span className="product-x-icon" aria-hidden="true">
                𝕏
              </span>
              Xでシェア
              <ArrowUpRight size={16} />
            </button>
            <button
              className="product-share-button product-share-line"
              onClick={() => social("line")}
            >
              <span className="product-line-icon" aria-hidden="true">
                LINE
              </span>
              LINEで送る
              <ArrowUpRight size={16} />
            </button>
            <button
              className="product-share-button product-share-copy"
              onClick={copy}
            >
              {copied ? <Check size={19} /> : <Copy size={18} />}リンクをコピー
            </button>
            {nativeShare && (
              <button className="product-share-button" onClick={share}>
                <Share2 size={18} />
                ほかのアプリで共有
              </button>
            )}
          </div>
          <p className="product-share-notice" role="status">
            {notice || "リンク先では、この結果をそのまま表示します。"}
          </p>
          <button
            onClick={() => onReplay?.(result.category)}
            className="product-replay-button"
            style={{ cursor: 'pointer' }}
          >
            <RotateCcw size={18} />
            同じ7問にチャレンジ <ArrowRight size={20} />
          </button>
          <p className="product-replay-note">次は、違う道を選んでもOK。</p>
        </section>
        <details className="product-answer-details">
          <summary>
            選んだ分かれ道を振り返る <span aria-hidden="true">＋</span>
          </summary>
          <ol>
            {result.answers.map((a, i) => {
              const q = QUESTIONS[result.category][i];
              return (
                <li key={a.questionId}>
                  <span className="product-answer-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p>{q.text}</p>
                    <b>{q.options[a.choice]}</b>
                    <small>練習用の割合</small>
                  </div>
                  <strong>
                    {Math.round(a.percentage)}
                    <small>%</small>
                  </strong>
                </li>
              );
            })}
          </ol>
        </details>
        <SurveyRequest />
        <footer className="product-result-footer">
          <span>多数派も、少数派も、どっちもいい。</span>
          <button onClick={onAbout} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            データとプライバシー <ArrowUpRight size={13} />
          </button>
        </footer>
      </main>
    </div>
  );
}
