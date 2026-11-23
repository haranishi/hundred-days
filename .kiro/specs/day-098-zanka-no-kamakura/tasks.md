# タスク一覧：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

- [x] **H1（カード用スクショ生成）**：`kamakura-no-zanka` 公開ビルドの実ブラウザ画面（PR #222 反映済み）から `day-098-zanka-no-kamakura/screenshot.webp`（1280×720・209 KB）を生成し目視確認済み。
- [x] **H2（Dayフォルダ作成）**：`day-098-zanka-no-kamakura/meta.json` と `README.md` を作成し、事実・数値（78.4 MiB / 約78MB）・URL・ライセンス表記・X加重文字数（本文 248/280、リプライ 272/280・80/280）を照合済み。
- [x] **H3（共通転送とテスト）**：`infra/day-redirect/worker.mjs`、`infra/day-redirect/wrangler.toml`、`scripts/tests/day-redirect.test.mjs`、`tests/e2e/external-days.spec.mjs` を更新済み。
- [x] **H4（一覧同期）**：`npm run index:sync` で `README.md` の Day 一覧を 98 件に更新し、`npm run build` の `--check` 通過を確認済み。
- [x] **H5（公開前ゲート検証）**：`npm run precheck`・`npm run check:syntax`・`npm run audit:deps`（19プロジェクト失敗0）・`npm run build`・`npm run test:unit`（6,637 pass / 0 fail）・`external-days.spec.mjs`（17 passed）を通過し、`verification.md` に記録済み。
- [x] **H6（PR作成）**：`feat/day098-zanka-no-kamakura` から PR #238 を作成し、2026-11-22 にマージ・本番反映済み。
- [x] **H7（コード同梱・HR6）**：ゲーム本体のソース・第一章の3Dモデルと質感画像・テスト・設計書を `source/` に同梱し、`LICENSE`・`README.md`・`THIRD_PARTY_NOTICES.md`・ルート `README.md` のコード公開リンクを更新した。本番へは配信しない（`scripts/lib/dist-files.mjs`）。PR #239。
- [x] **H8（宣伝動画ツールとカード用デモ・HR7）**：`tools/promo/` に生成・検査の道具を置き、`demo.mp4`（16秒・縦540×960・30fps・無音・2,612,892 B）を作った。`meta.json` に `"demo": "demo.mp4"` と X 投稿設定（`codePublished: true`・`source/` の案内）を足し、`external-days.spec.mjs` にカード動画の再生検査を足した。PR #239。
- [x] **H9（マージ）**：PR #239 を 2026-11-23 にスカッシュでマージした（`2841aa9`）。マージ前に、CI全10ジョブ成功（`Deploy production` は PR では skipped）・競合なし・追加ファイルへの個人情報と秘密情報の混入が0件・素材の権利表記（`THIRD_PARTY_NOTICES.md` の Day098 節・`source/LICENSE-ASSETS.md`・`source/NOTICE.md`）を確認した。
- [x] **H10（本番反映の確認）**：main の `CI and Deploy`（実行 45168962408・先頭 `2841aa9`）が10ジョブすべて成功した（`Deploy production` を含む）。本番 `https://rairakku.com/100days/` の Day98 カードの再生ボタンから、`demo.mp4` がモーダルで再生されることを実ブラウザで確認した。結果は `verification.md` §4。
- [ ] **H11（本人作業）**：BGM の A案・B案の選択、スマホ実機での動画再生とタッチ操作の確認、X投稿（マージ後に行う。返信1が GitHub の `source/` を指す）。投稿したら URL を `meta.json` の `xPostUrl` に記録する。
