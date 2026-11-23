# 要件定義：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

## 目的

別リポジトリ（`haranishi/kamakura-no-zanka`）の三人称3D時代劇アクション「残火の鎌倉 — 隠れ谷の灯」を、100日チャレンジ Day 098 の外部Day（`https://day98.rairakku.com/`）として一覧へ掲載し、`rairakku.com/day98/` および `rairakku.com/100days/day-098-zanka-no-kamakura/` からの 302 転送設定と公開ゲート検査を整備する。

## 要件（HR1〜HR7）

- **HR1（Dayフォルダとメタデータ）**：`day-098-zanka-no-kamakura/` に `meta.json`・`README.md`・`screenshot.webp` を置く。`status: "external"`、`externalUrl`・`publicUrl` ともに `https://day98.rairakku.com/` とする。`demo` は、初回掲載（2026-11-22）では動画が未作成のため省略し、カードにデモ再生ボタンを出さなかった（Day083 と同方式）。2026-11-23 の PR #239 で `demo.mp4`（HR7）を作り、`"demo": "demo.mp4"` を足してカードに再生ボタンを出す。
- **HR2（事実に基づく制作記録）**：`meta.json` の `description`・`aiHandled`・`humanHandled`・`failuresAndFixes`・`social.x` は、コードと作業記録に照合した事実だけを書く。初回約77MB読み込み（Wi-Fi推奨）・ライセンス（コードMIT、素材/物語 CC BY 4.0、GitHubリンク）・架空の谷の創作である旨を明記する。
- **HR3（共通転送 Worker）**：`infra/day-redirect/worker.mjs` の `EXTERNAL_DAYS` に `{ number: 98, folder: 'day-098-zanka-no-kamakura' }` を追加し、`infra/day-redirect/wrangler.toml` に `rairakku.com/100days/day-098-zanka-no-kamakura*` を1本追加する（`/100days/*` に広げない）。
- **HR4（一覧・テスト同期）**：`npm run index:sync` で `README.md` を更新し、`scripts/tests/day-redirect.test.mjs` と `tests/e2e/external-days.spec.mjs` に Day 098 の検査を追加する。
- **HR5（公開前ゲート全通過）**：`npm run precheck`、`npm run check`、`npm run publish:check -- --day 98` がすべて成功すること。
- **HR6（コード同梱・2026-11-23 追加）**：ゲーム本体のソースコード（MIT）と、第一章の3Dモデル・物語（CC BY 4.0）・質感画像（Poly Haven・CC0 1.0）・動きの一部（CMU Motion Capture Database）を `day-098-zanka-no-kamakura/source/` に同梱する（Day094 と同方式）。出所と条件は `source/LICENSE-ASSETS.md`・`source/NOTICE.md`・`THIRD_PARTY_NOTICES.md` に記録し、本番サイトには配信しない（`scripts/lib/dist-files.mjs`）。同梱で混ざりうる個人情報・ローカルパス・秘密情報は、`npm run precheck` で0件にする。
- **HR7（宣伝動画とカード用デモ・2026-11-23 追加）**：縦型30秒の宣伝動画（BGM A案・B案・無音）と、一覧カード用の16秒 `demo.mp4`（縦540×960・30fps・無音）を、実ゲームの3D描画から決定的に作る道具 `tools/promo/` を置く。X投稿の返信1は、公開済みの `source/` を案内する。`source/` はマージするまで GitHub 上に無く、リンクが404になるため、X投稿はマージ後に行う。
