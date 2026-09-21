# Day 045 実装記録

## 目的・範囲

- 仕様の正本は `day-045-read-your-shots/REQUIREMENTS.md`。内容は変更していない。
- 撃つ→艦隊が学ぶ→場所を変えて得点、の操作ループを実装する。
- UX5階層は正本の設計に従い、HUD・縦長Canvas・下部操作説明の順に置く。
- 依存追加、gitの変更操作、公開、外部送信は行わない。
- ゲーム本体・テスト・説明・一覧同期・素材表・保存説明が対象。
- 成功条件は学習・被弾・得点・遷移の単体テスト、モジュール読み込み、ビルド。
  ブラウザ実操作の条件は環境制約により未確認として残す。

## 実装

- 5行8列の段階移動、残数と波に応じた速度、列最下段からの予測射撃。
- 12レーン、40発の減衰履歴、200msごと50標本の居場所、予測重心。
- ひるみ16px・150ms・700ms間隔、熱の低い発射は得点2倍。
- 3ライフ、被弾後1.2秒の保護と艦隊停止、侵入とライフ0で終了。
- キー・ポインタ入力、音の合成、端末保存、図形fallback、検証用窓口。
- 画像5点は別担当によって配置されたものを使用。この作業では画像を生成・変更していない。
- 画像を目視し、通知・タブ・パス等の映り込みなし。PNG4点はメタデータ項目なし。
  WebPはloop・background項目だけ。画像の外観確認は実画面のUI評価とは別。

## 検証結果

- `node --test day-045-read-your-shots/tests/`：47件成功。
- 既存のDay 012・031の単体テスト：計129件成功。
- `node scripts/sync-shared.mjs`：Day 045へ2ファイル複製。
- `node scripts/sync-day-index.mjs`：45件の一覧に更新。
- `npm run build`：成功、dist生成。
- HTMLから読む2本とlib8本をNodeのimportで確認。
  共通share.jsはDOM ready待ちの最小スタブを使用。ブラウザ描画の検証ではない。
- Nodeが既存リポジトリのpackage設定に由来するES module自動判定警告を表示。importは成功。
- `npm run precheck`：終了コード0、漏洩パターン検出なし。
  リポジトリ全体で既存メール表記と画像等の目視要求を含む500件の警告あり。
- X本文は日本語2換算で185/280。投稿・動画付き公開準備は未実施。
- 固定seedの18秒自動操縦を単体で確認。実プレイ録画の成功を意味しない。

## レビューと修正

- 読み取り専用の別エージェントでロジック・入力・画面の独立コードレビューを実施。
- 波の開始行の不要な上限を削除し、毎波24px下げる。
- Canvas文字を表示倍率で補正し、共有欄も14px以上にする。
- 居場所の標本時刻に浮動小数誤差の許容を加え、1秒で5標本を検証。
- 重心のテスト比較に浮動小数の許容を使用。

## 未確認・引き継ぎ

- Playwrightは指示どおり未実行。E2Eは11件作成。
- 390/768/1440pxの実画面、音、ポインタ、キーボード、保存拒否環境の実操作は未確認。
- 体験10項目・UI10項目は実操作・撮影がないため未採点。16点以上の受け入れは未判定。
- 画像404はブラウザ自身が通信エラーを出す。既存Dayの方法に合わせ、E2Eは画像URLの
  404リソース診断だけ除外し、アプリのconsole error・pageerrorは0を要求する。
  「故意の404も含むコンソール0件」という文字どおりの条件とは両立しない。
- `screenshot.webp`・`demo.mp4` は未作成。シナリオのみ実装。
  動画撮影後は開始前部分を除いて1コマ目が実プレイであることを確認する。
- 既存全Dayの全テスト、本番URL、素材の生成元の独立確認は未実施。
- 公開前チェックの未確認事項が残るため公開可能とは判定していない。

## 作成・変更ファイル

- `day-045-read-your-shots/index.html`, `app.css`, `app.js`
- 同 `lib/rng.js`, `lanes.js`, `fleet.js`, `collision.js`, `game.js`, `store.js`, `audio.js`, `sprites.js`
- 同 `tests/index.mjs`, `package.json`, `lanes.test.mjs`, `fleet.test.mjs`, `collision.test.mjs`, `game.test.mjs`, `store.test.mjs`
- 同 `demo-scenario.mjs`, `README.md`, `meta.json`, `shared/share.css`, `shared/share.js`
- `tests/e2e/day-045.spec.mjs`
- `README.md`, `THIRD_PARTY_NOTICES.md`, `static/privacy.html`
- `.agent-harness/runs/day045-implement.md`
- `dist/` はビルドによる生成物。
- 既存の要件・契約・素材は今回の作成変更一覧に含めない。
