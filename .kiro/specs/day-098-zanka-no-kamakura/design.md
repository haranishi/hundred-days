# 設計書：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

## 構成（Day083 / 088 / 091 / 093 / 094 と同じ外部Day方式）

- **フォルダ名**：`day-098-zanka-no-kamakura`
- **アプリ本体**：`haranishi/kamakura-no-zanka` の `npm run build:pages` 出力を専用 Cloudflare Pages（`https://day98.rairakku.com/`）へ配信（本番デプロイは本人の指示・実行で実施）。
- **転送経路**：
  - `https://rairakku.com/day98/` → 302 → `https://day98.rairakku.com/`
  - `https://rairakku.com/100days/day-098-zanka-no-kamakura/` → 302 → `https://day98.rairakku.com/`
  - `https://rairakku.com/100days/day-098-zanka-no-kamakura/screenshot.webp` は素通し（カード画像保護）
- **ライセンス**：`status: "external"` かつ `source/` を置かないため `day-license.test.mjs` の対象外。コード（MIT）と3D素材/物語（CC BY 4.0）の公開リポジトリ `https://github.com/haranishi/kamakura-no-zanka` を `README.md` と `social.x` に明記する。
- **スクリーンショット**：`kamakura-no-zanka` の公開用ビルドを実ブラウザ（1280×720）で開いた最新画面（PR #222 磨き済み）を撮影し、`cwebp` で `day-098-zanka-no-kamakura/screenshot.webp` を生成する。

## 公開ゲート（`publish:check`）

- 静的検査：`npm run precheck`・`npm run check`（`day-redirect.test.mjs`・`public-url-contract.test.mjs`・`day-license.test.mjs`・`dist-files.test.mjs`・`build`）
- ブラウザ検査：`npm run publish:check -- --day 98`（`external-days.spec.mjs` で一覧カード・リンク・`screenshot.webp` 200・進捗カウントを検証）
