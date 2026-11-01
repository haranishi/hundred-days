# 検証

2026-10-30。

- 単体: `scripts/tests/public-url.test.mjs` 10件が通る。実装をわざと4通りに壊して（接続拒否も代わりにする／中継の下かを見ない／名前の失敗でも取り直さない／HTTPエラーも取り直す）、どれもテストが落ちることを確かめた。
- 通しの実行（`x:prepare`・Day080・ダミーの縦動画。公開URLだけ一時的に書き換え、終わりに戻した）:
  - 通常（pages.dev の住所）: 成功。`urlChecks` は200で canonical が `rairakku.com/100days/…`。チェックリストに追加項目なし。
  - 新住所（本人のMacは rairakku.com の名前を引けない）: 成功。警告を出し、`urlChecks[0].checkedVia` に行き先を残し、`checklist.md` に未完了の「別の回線で確認」を足した。`reply.txt` のリンクは新住所のまま。
- precheck は通る（漏洩パターンなし。メールアドレスの要確認の警告は元からのもの）。

範囲を超えて言わないこと: 新住所そのものを、別の回線（スマホ回線）で開いた確認はしていない。実際の使用回数（問い合わせAPIと共有の無料枠）は、切り替え後に見る。

## Day080への前倒し（2026-10-30 夜）

本人の指示で、開始をDay081からDay080へ前倒しした。

- 新しい住所 `https://rairakku.com/100days/day-080-fifth-prince/` を開いた。この回線は名前を引けないため、DNSの答えを別経路で取って指定した。結果は200。旧住所（pages.dev）と同じHTMLで、canonical はどちらも `https://rairakku.com/100days/day-080-fifth-prince/`。
- `npm run index:sync` で作り直した README の差分は1行（Day080の「アプリを開く」リンク）。
- `npm run check` が通る。precheck は漏洩パターンなし。JavaScript構文は1,584ファイルでエラー0件。単体テストは5,005件中5,004件が成功し、1件はスキップ（この枝の土台のmain時点）。依存監査は12プロジェクトで失敗0件。ビルドは80 dayで、README一覧の対応も確認した。
- 言わないこと: ブラウザテストはCIで見る。Day080のXの返信文（`reply.txt`）は、このPRのマージ後に作り直す。

## 全Dayへの拡大（2026-11-01）

- 変更は78ファイル。`meta.json` 73件、`AGENTS.md`、`README.md`（一覧のリンク73行）、新しい試験1件、Day058・059 の試験2件。
- 見張り `scripts/tests/public-url-contract.test.mjs`（集計1件・判定の例1件）が通る。Day001 の `publicUrl` を旧住所に戻すと集計の試験が落ち、元に戻すと通ることを確かめた。
- Day058 の試験は、`SITE_URL` を `https://example.com/x/` に変えると落ちる。元に戻して通ることも確かめた。
- 73件の新しい `publicUrl` を、実際に1回ずつ開いた。結果はすべて HTTP 200 で、返ってきた HTML の `canonical` も `publicUrl` と同じだった。
- 旧住所の実測。`hundred-days.pages.dev` の Day058・Day080 のページは、`canonical` と `og:url` が `https://rairakku.com/100days/<フォルダ名>/`。`sitemap.xml` は75件で、先頭は `https://rairakku.com/100days/`。
- `npm run check` が通る（終了コード0）。precheck は漏洩パターンなし。JavaScript構文は1,588ファイルでエラー0件。単体テストは5,047件中5,046件が成功し、1件はスキップ。ビルドは80 day（公開80・うち外部4）で、下書きの Day081 は一覧から除く。
- 言わないこと: ブラウザテストはCIで見る。実際の使用回数（問い合わせAPIと共有の無料枠）は、切り替え後に見る。Dayのコードに焼き込まれた旧住所（Day058・Day060 ほか）は直していない。
