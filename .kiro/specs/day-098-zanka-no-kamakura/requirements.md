# 要件定義：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

## 目的

別リポジトリ（`haranishi/kamakura-no-zanka`）の三人称3D時代劇アクション「残火の鎌倉 — 隠れ谷の灯」を、100日チャレンジ Day 098 の外部Day（`https://day98.rairakku.com/`）として一覧へ掲載し、`rairakku.com/day98/` および `rairakku.com/100days/day-098-zanka-no-kamakura/` からの 302 転送設定と公開ゲート検査を整備する。

## 要件（HR1〜HR5）

- **HR1（Dayフォルダとメタデータ）**：`day-098-zanka-no-kamakura/` に `meta.json`・`README.md`・`screenshot.webp` を置く。`status: "external"`、`externalUrl`・`publicUrl` ともに `https://day98.rairakku.com/` とする。`demo` はプロモ動画未作成のため省略し、カードにデモ再生ボタンを出さない（Day083 と同方式）。
- **HR2（事実に基づく制作記録）**：`meta.json` の `description`・`aiHandled`・`humanHandled`・`failuresAndFixes`・`social.x` は、コードと作業記録に照合した事実だけを書く。初回約77MB読み込み（Wi-Fi推奨）・ライセンス（コードMIT、素材/物語 CC BY 4.0、GitHubリンク）・架空の谷の創作である旨を明記する。
- **HR3（共通転送 Worker）**：`infra/day-redirect/worker.mjs` の `EXTERNAL_DAYS` に `{ number: 98, folder: 'day-098-zanka-no-kamakura' }` を追加し、`infra/day-redirect/wrangler.toml` に `rairakku.com/100days/day-098-zanka-no-kamakura*` を1本追加する（`/100days/*` に広げない）。
- **HR4（一覧・テスト同期）**：`npm run index:sync` で `README.md` を更新し、`scripts/tests/day-redirect.test.mjs` と `tests/e2e/external-days.spec.mjs` に Day 098 の検査を追加する。
- **HR5（公開前ゲート全通過）**：`npm run precheck`、`npm run check`、`npm run publish:check -- --day 98` がすべて成功すること。
