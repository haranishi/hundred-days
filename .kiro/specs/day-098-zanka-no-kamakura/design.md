# 設計書：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

## 構成（Day083 / 088 / 091 / 093 / 094 と同じ外部Day方式）

- **フォルダ名**：`day-098-zanka-no-kamakura`
- **アプリ本体**：`haranishi/kamakura-no-zanka` の `npm run build:pages` 出力を専用 Cloudflare Pages（`https://day98.rairakku.com/`）へ配信（本番デプロイは本人の指示・実行で実施）。
- **転送経路**：
  - `https://rairakku.com/day98/` → 302 → `https://day98.rairakku.com/`
  - `https://rairakku.com/100days/day-098-zanka-no-kamakura/` → 302 → `https://day98.rairakku.com/`
  - `https://rairakku.com/100days/day-098-zanka-no-kamakura/screenshot.webp` は素通し（カード画像保護）
- **ライセンスとコード同梱**：初回掲載（2026-11-22）は `source/` を置かず、`day-license.test.mjs` の対象外だった。2026-11-23 の PR #239 から `source/` にコードと第一章の素材を同梱する（Day094 と同方式）ので、フォルダ直下に `LICENSE`（リポジトリ直下と同じ MIT）を置き、置き忘れを `day-license.test.mjs` が見張る。3Dモデルと物語は CC BY 4.0（`source/LICENSE-ASSETS.md`）。人物7体と小道具14点は有料プランの Meshy で生成して Blender で動きを焼いたもので、出所と SHA-256 は `source/NOTICE.md`・`source/provenance/` に記録する（概要は `README.md` と `THIRD_PARTY_NOTICES.md` の Day098 節）。`source/` と `tools/` は本番サイトに配信しない（`scripts/lib/dist-files.mjs`）。元の作業リポジトリ `https://github.com/haranishi/kamakura-no-zanka` も引き続き公開し、`README.md` と `social.x` に明記する。
- **スクリーンショット**：`kamakura-no-zanka` の公開用ビルドを実ブラウザ（1280×720）で開いた最新画面（PR #222 磨き済み）を撮影し、`cwebp` で `day-098-zanka-no-kamakura/screenshot.webp` を生成する。
- **カード用デモ**（2026-11-23 追加）：`demo.mp4`（縦540×960・16秒・無音・約2.5MB）を、一覧カードの再生ボタン（`.thumb__play` の `data-demo`）から見せる。`meta.json` の `demo` に書き、`tests/e2e/external-days.spec.mjs` が再生ボタンと動画の実体を検査する。縦1080×1920・30秒の宣伝動画の本体はこのリポジトリに置かず、生成と検査の道具だけを `tools/promo/` に置く。

## 公開ゲート（`publish:check`）

- 静的検査：`npm run precheck`・`npm run check`（`day-redirect.test.mjs`・`public-url-contract.test.mjs`・`day-license.test.mjs`・`dist-files.test.mjs`・`build`）
- ブラウザ検査：`npm run publish:check -- --day 98`（`external-days.spec.mjs` で一覧カード・リンク・`screenshot.webp` 200・進捗カウントを検証）
