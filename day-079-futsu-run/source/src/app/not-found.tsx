import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <span className="big-mark">?</span>
      <h1>その結果は見つかりませんでした</h1>
      <p>
        リンクが正しいか確認してください。新しく遊んで、あなたの結果を作ることもできます。
      </p>
      <Link className="primary-button" href="/">
        トップから遊ぶ <span>↗</span>
      </Link>
    </main>
  );
}
