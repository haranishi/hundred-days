"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="not-found">
      <h1>読み込みを再開しましょう</h1>
      <p>通信が落ち着いてから、もう一度お試しください。</p>
      <button className="primary-button" onClick={reset}>
        もう一度読み込む
      </button>
      <Link href="/">トップへ戻る</Link>
    </main>
  );
}
