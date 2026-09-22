# Day047「泣ぐ子は、いねがぁ」実装契約
目的：ドット絵の横スクロールアクション本体（20面・進化3段階・移動とジャンプだけ）を作る。
設計：day-047-namahage-night/REQUIREMENTS.md が唯一の正本。数値と面データ形式はそこから動かさない。
範囲：day-047-namahage-night/ の index.html・app.css・app.js・lib/**・tests/**、および tests/e2e/day-047.spec.mjs。
対象外：git操作、公開、ブラウザ起動、E2E実行、スプライトの見た目の最終決定（原画のドット化はメインループが行う）。
検証：REQUIREMENTS.md「テスト」節の全項目を単体テストで満たす。tests/index.mjs に全ファイルを登録し、
      `node --test day-047-namahage-night/tests/` が緑であることを自分で実行して確かめる。
成功条件：依存ゼロ・外部通信ゼロ・固定1/120刻みの決定性・20面が到達可能・16色以内のドット絵データ。
