# セキュリティ＆ハーネスレビュー記録：Day 077 保安検査スワイパー

- レビュー日: 2026-10-26
- 対象: `day-077-hoan-swiper/`

---

## 1. 信頼境界と入力面（Trust Boundaries）

1. **検索クエリ入力（`#catalog-search`）**
   - ユーザーが入力した検索文字列は `lib/items.js` の `filterItems()` で正規化・小文字比較にのみ使用。
   - DOM への描画（`app.js` の `renderCatalogItems()`）はすべて `document.createElement` と `textContent` のみで構築しており、`innerHTML` や `insertAdjacentHTML` へのユーザー入力流し込みは一切存在しない（DOM XSS リスクなし）。
2. **`localStorage` 保存データ（`hoan_swiper_record`）**
   - `lib/storage.js` の `normalizeRecord()` にて `JSON.parse` を `try/catch` で保護し、各フィールドを `Math.max(0, Math.min(999999, Math.floor(Number(...))))` で厳格に数値クランプ・型検証している。
   - 破損データや改ざんされた JSON が入っていても例外を投げず安全に初期値へフォールバックすることを単体テスト（`tests/storage.test.mjs`）で検証済み。
3. **外部リンク（国土交通省・各航空会社の公式案内ページ）**
   - すべての外部 `<a>` リンクに `target="_blank" rel="noopener noreferrer"` を付与し、`window.opener` 経由の Tabnabbing を防止。
   - E2E テスト（`tests/e2e/day-077.spec.mjs`）で全6件の公式リンクの `rel="noopener noreferrer"` 属性を自動検証済み。

---

## 2. CSP・ネットワーク通信・権限ポリシー

- **外部通信ゼロ**: ゲームプレイ・図鑑検索・効果音合成（Web Audio API）すべてクライアント内のローカルデータと標準 Web API のみで完結。
- **`security-headers.spec.mjs` 適合**:
  - `default-src 'self'` 下で動作し、外部スクリプト・外部フォント・外部 API 通信を一切行わない。
  - JavaScript コード内に外部 URL 定数を持たず、HTML の安全なアンカーリンクのみで公式情報への導線を提供。
- **機密情報・個人情報検査**: `npm run precheck` により、ローカル絶対パス・メールアドレス・トークン等の混入が 0 件であることを確認済み。
