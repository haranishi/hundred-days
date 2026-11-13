# Implementation Plan：learning-app

担い手：1＝メインループ、2〜4＝Codex（個人用）、5＝メインループ、6〜7＝別セッションの評価者（Opus）。完了は試験・画面の証拠で判定する。

- [x] 1. 土台と公開ゲート（最初に行う）
  - Vite＋Preact＋TypeScript（strict）＋vitest＋Playwright の土台。依存は `--before` で入れ、版を固定する
  - `scripts/publish-check.mjs` の骨組み：`/` で始まる参照が無いこと・`THIRD_PARTY_NOTICES.txt`・写す物に絶対パスが無いこと
  - 完了条件：`npm run typecheck && npm test && npm run build && npm run publish:check` が通る
  - _Requirements: 10.1_

- [x] 2. 学習の計算と保存
  - 検証（2026-11-13）：`npm run typecheck` 成功、`npm test` 6ファイル・87件成功。画面・content・hand・設定・依存は変更なし。詳細は `.agent-harness/runs/impl-engine/notes.md`
- [x] 2.1 (P) 経験値・連続記録・復習の間隔・実績の純粋関数と単体試験（日付をまたぐ・月末・休んだ後・最長記録）
  - _Boundary: src/engine_
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2_
- [x] 2.2 (P) 出題の組み立て（新出3つまで・10〜14問・まちがい選択肢の選び方・やり直しの並べ方・種付き乱数）と単体試験
  - _Boundary: src/engine, src/course_
  - _Requirements: 3.1, 3.3, 3.5_
- [x] 2.3 (P) 保存・移行・壊れたデータの退避・書き出しと読み込みの検査、保存できない環境での動作と単体試験
  - _Boundary: src/store_
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 3. 画面
- [x] 3.1 外枠・画面遷移・下のタブ・上の状態表示（連続記録・今日の経験値）・保存できない時の帯
  - _Requirements: 2.3, 7.2, 9.1_
- [x] 3.2 初回の案内（3問→最初のレッスン）と道すじ（3コース・鍵・強調）
  - _Requirements: 1.1, 1.2, 2.1, 2.2_
- [x] 3.3 レッスン画面と問題の種類8つ、正誤の表示、途中でやめる確認、結果画面（経験値・正答率・連続記録・実績・シェア）
  - _Depends: hand-model 2.1_
  - _Requirements: 3.2, 3.4, 3.5, 4.1, 4.3, 8.1_
- [x] 3.4 復習・苦手を練習・図鑑（一覧・詳細・ひらがな→指文字の再生）
  - _Requirements: 5.2, 5.3, 6.1, 6.2_
- [x] 3.5 記録・設定（書き出し・読み込み・全削除）・このアプリについて（注意書き・出典・許諾・プライバシー）
  - _Requirements: 7.3, 7.4, 9.3_
- [x] 3.6 案内役「てまる」の SVG・効果音の合成・振動・動きを減らす設定の反映
  - _Requirements: 7.4, 9.2_

- [x] 4. シェア・OGP・オフラインと、100日への組み込み
  - 共通の共有部品の窓と入口、結果画面の「記録をシェア」、OGP 画像、manifest とアイコン、PWA の事前保存
  - `tools/build-day092.mjs`：組み立てた本体と `source/` を Day のフォルダへ写す。100日の `scripts/build.mjs`（wasm とカメラの許可）・`SOURCE_DIRS_BY_APP`・meta.json・README を用意する
  - 完了条件：100日の `npm run publish:check -- --day 92` が通る。オフラインにした Playwright で道すじ→レッスン完了まで動く
  - _Requirements: 8.1, 8.2, 8.3, 10.1_

- [x] 5. 通しの画面試験（メインループが実行）
  - 初回→レッスン完了→再読み込みで記録が残る、復習、図鑑、設定の書き出し/読み込み、レッスン途中でやめる
  - スマホ縦 390・360、横 844、PC 1280。指の操作（タップ・ドラッグで回す）。Chromium と WebKit。axe で重大な違反ゼロ
  - 押す間隔を 0〜500ms に振る試験と、CPU を10倍遅くした実行を含める
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 7.1, 9.1, 9.2_

- [x] 6. 体験の評価ループ（評価者が実際に遊ぶ・10項目・16点以上かつ0点なしで合格・最大3周）
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 7. 見た目の評価ループ（スクショのみで採点・10項目・16点以上かつ0点なしで合格・最大3周）
  - _Requirements: 9.1_

## 進み具合の記録（2026-11-13）
- 1・3・4：`npm run typecheck`・`npm test`・`npm run build`・`npm run publish:check` が通る。100日の `npm run publish:check -- --day 92`（静的・組み立て・ブラウザ）も合格。画面の実装の記録は `.agent-harness/runs/impl-ui-a/`・`impl-ui-b/`
- 5：ブラウザの通しの試験 206本（スマホの Chromium・WebKit、PC、偽カメラ）を2回続けて流し、2回とも全部通った（2026-11-13）。axe の重大な違反は0
- 6：体験の評価ループ。第1周 14/20 → 第2周 19/20（0点なし）で合格。記録は `.agent-harness/runs/eval-feel-r1/`・`eval-feel-r2/`
- 7：見た目の評価ループ。第1周 15/20 → 第2周 17/20（0点なし）で合格。第2周の残りの指摘（文節の折り返し・ペア・PC幅・部品のそろえ・小さな画像の袖の切れ目）は、合格のあとに直した（`fix-ui-r6/`・`hand-r3/`）。再採点はしていない
- 合格のあとの直しで見つけた不具合：起動の直後に URL が変わると、画面の切り替えの見張りが付く前で取りこぼし、URL と画面がずれた（`useLayoutEffect` で付けて直した）。「・」が行末に残った（ReadableText で「・」と次の1文字を折れない塊にした）。BudouX の入口が Node 用の DOM を読み、開発サーバーが起動しなかった（Parser と日本語モデルを直接読む形にした）
- 誤りの知らせ先は、100日チャレンジのリポジトリの Issue（このアプリについて）
