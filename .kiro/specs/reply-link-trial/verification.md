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
