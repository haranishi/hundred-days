# 検証記録：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

- 検証日：2026-11-22
- 対象ブランチ：`feat/day098-zanka-no-kamakura`

## 1. 実施した検証と結果

| 検証項目 | コマンド | 結果 |
|---|---|---|
| 秘密・個人情報スキャン | `npm run precheck` | 合格（漏洩パターン検出なし） |
| 構文検査 | `npm run check:syntax` | 合格 |
| 依存監査 | `npm run audit:deps` | 合格（19プロジェクト・失敗0件） |
| 一覧同期・共有検査・サイトビルド | `npm run build` | 合格（98 day(s) / 公開 98（うち外部 11） / スクショ 97 / 動画 71 / OGP付与 87） |
| 全単体テスト（転送・公開URL・ライセンス・公開契約含む） | `npm run test:unit` | 合格（6,638件中 pass 6,637 / fail 0 / skipped 1） |
| 外部Day E2E（Day 098 カード遷移・進捗 98/100） | `npx playwright test tests/e2e/external-days.spec.mjs --reporter=line` | 合格（17 passed / 2 skipped） |
| X投稿文字数チェック（`meta.json` `social.x`） | `prepare-x-post.mjs` 相当の加重文字数計算 | 合格（本文 248/280、リプライ2 272/280、リプライ3 80/280） |
| カード用スクリーンショット目視確認 | `day-098-zanka-no-kamakura/screenshot.webp`（1280×720・209 KB） | 合格（PR #222 反映済みの隠れ谷俯瞰・UI重なりやデバッグ文字なし） |

## 2. 補足・未検証（本番反映後に確認する事項）

- `npm run publish:check -- --day 98` は仕様上 `draft` / `published` かつ `index.html` を持つ Day 専用のため、外部Day（`status: "external"`）である Day 98 は上記の `npm run check`・`day-redirect.test.mjs`・`external-days.spec.mjs` により契約検証を完了した。
- 本番デプロイ（`day98.rairakku.com` の Cloudflare Pages 作成・カスタムドメイン割当・`rairakku-day-redirect` Worker の反映・PRマージ）と、デプロイ後の本番疎通確認（`https://day98.rairakku.com/`・`https://rairakku.com/day98/`・`https://rairakku.com/100days/day-098-zanka-no-kamakura/`）および X 投稿は本人作業として未実施。
- 上の本番反映（Cloudflare Pages・カスタムドメイン・転送 Worker・PR #238 のマージ）は、2026-11-22 に完了した（実績は `tasks.md` H6）。

## 3. PR #239（コード同梱・宣伝動画ツール・カード用デモ）のマージ前検証（2026-11-23）

| 検証項目 | 方法 | 結果 |
|---|---|---|
| 公開前チェック・構文・ビルド | `npm run precheck && npm run check:syntax && npm run build` | 合格（PR 本文の記録） |
| 単体・契約テスト | `node --test scripts/tests/*.test.mjs` | 全件合格（同上） |
| 外部Day E2E（カード動画の再生ボタンと実体） | `npx playwright test tests/e2e/external-days.spec.mjs -g "Day 098"` | 2件合格（同上） |
| CI（PR の先頭 `bff1228`） | GitHub Actions `CI and Deploy` | 10ジョブすべて成功（`Deploy production` は PR では skipped）。mergeStateStatus は CLEAN |
| 追加ファイルの個人情報・秘密情報 | `git grep` でメール・電話・作業用パソコンの絶対パス（ホームフォルダ・外付けディスク）・屋号・鍵の形の文字列を、Day098 フォルダ・ルート `README.md`・`THIRD_PARTY_NOTICES.md`・`.gitignore`・`scripts/lib/dist-files.mjs`・`tests/e2e/external-days.spec.mjs` から探した | 0件。`.env`・鍵ファイルの追加も0件 |
| 追加物の内訳 | 追加836ファイル。3Dモデル（glb）28点＝60.9 MB、写真の質感（jpg）22点＝15.5 MB、コード（mjs・js）708点、`demo.mp4` 1点＝2.5 MB | 素材の種類ごとに権利表記あり（`THIRD_PARTY_NOTICES.md` の Day098 節・`source/LICENSE-ASSETS.md`・`source/NOTICE.md`・`source/provenance/`） |
| `demo.mp4` の実体 | `ffprobe` | H.264・yuv420p・540×960・30fps・16.000秒・音声なし・2,612,892 B（PR の説明と一致） |
| マージ | `gh pr merge 239 --squash --match-head-commit bff1228…` | `2841aa9`（親1つのスカッシュ）。公開処理 `CI and Deploy` の実行 45168962408 が始まった |

## 4. 本番反映後の確認（2026-11-23・マージ `2841aa9`）

公開処理 `CI and Deploy`（実行 45168962408）は10ジョブすべて成功した（`Deploy production` を含む。マージ 20:51 から完了 21:37 まで約45分）。その後、本番に対して読み取りと画面表示だけの確認をした（書き込みなし）。一覧の再生ボタンは分析イベントを送る作りなので、分析系の通信は遮断して押した。

| 確認項目 | 結果 |
|---|---|
| `https://rairakku.com/day98/` と `https://rairakku.com/100days/day-098-zanka-no-kamakura/` | どちらも 302 で `https://day98.rairakku.com/` へ転送 |
| `/100days/day-098-zanka-no-kamakura/demo.mp4` | 200・`video/mp4`・2,612,892 B（リポジトリのファイルと同じ大きさ）・MP4 の先頭の印も正しい |
| 配信してはいけないパス（`source/README.md`・`source/package.json`・`source/LICENSE`・`tools/promo/README.md`・`source/dist/assets/characters/hero.glb`） | すべて 404 |
| `https://github.com/haranishi/hundred-days/tree/main/day-098-zanka-no-kamakura/source`（X の返信1の案内先） | 200 |
| 一覧 `https://rairakku.com/100days/` の Day98 カード | あり。再生ボタンの `data-demo` は `./day-098-zanka-no-kamakura/demo.mp4`。出現アニメーションが終われば不透明度1で、暗くはない |
| 再生ボタンを押す（実 Chrome 158.0.8127.36・分析通信は遮断） | モーダルで 540×960 の動画が再生された（readyState 4・停止なし・エラーなし）。閉じるとモーダルが消える |
| コンソールエラー・失敗した通信 | サイト由来は0件。出たのは、私たちが遮断した分析スクリプトの読み込み失敗1件だけ |
| 動画の中身とメタデータ | 実ゲームの画面（燃える家・戦闘・スマホ用の操作ボタン）で、ブラウザ枠・通知・ファイルパスの映り込みなし。メタデータはエンコーダ名だけ（位置・日時・個人情報なし） |
| `npm run precheck`（この記録の作成時） | 合格。`source/tools/export_scene_reference.py` のメール警告2件は、Blender のコードの行列の掛け算（`@`）の誤検知で、メールアドレスは無い |

未確認（本人作業）：スマホ実機での動画再生とタッチ操作、BGM の A案・B案の選択、X 投稿。
