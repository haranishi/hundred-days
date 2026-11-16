# Day093「find」の作業記録（外部Day）

2026-11-16。登録なしで、スワイプするほど好みの服が見つかるファッション探索Webアプリ。公開先は https://day93.rairakku.com/（Cloudflare Pages）と、API の Worker 1本。この記録は、公開の構成と、事実の確認の証拠。

## 公開の構成（Day091と同じ外部Day）

- もとは2026年夏から作っていた、ログインが必要なアプリ（Vercel で稼働中）。その本番は変えずに、同じデータベースを使うログインなしの版を別に立てた。ログインの要否は Worker の設定の旗で分け、旗の無い既定ではこれまでどおりログインが要る。
- 画面は専用の Pages プロジェクトに置き、`day93.rairakku.com` で配信する。`meta.json` は `status: external`。
- API は5つのサービスを1本の Worker にまとめた。rairakku.com の問い合わせ窓口と無料枠を分けるため、別のアカウントに置いている。許可した住所（day93.rairakku.com と pages.dev）からの呼び出しだけを受け、応答にはすべて `X-Robots-Tag: noindex, nofollow` を付ける。ログイン・登録の入口は 403 で閉じた。
- 端末のIDはブラウザ（`localStorage`）に保存し、API への要求に見出し（`X-Find-Device-Id`）で付けて送る。別の住所の API へ cookie が届かないブラウザ（Safari の追跡防止）でも、続きから使えるようにするため。
- 商品は楽天市場と Yahoo!ショッピングの商品データ。詳細とお気に入りから各ショップの商品ページへ移れる（広告。画面に「PR（広告）」と表示している）。
- `https://rairakku.com/day93/` と、100日の正の住所 `https://rairakku.com/100days/day-093-find/`（フォルダ直下だけ）は、共通の転送 Workers で `day93.rairakku.com` へ 302 する。中継にはしない。
- コードは公開していない。このフォルダにあるのは、一覧に載せるための記録（meta.json・README・スクリーンショット）。紹介動画はまだ無い（`demo: false`）。スクリーンショットは診断の写真選びの画面で、写真はアプリ自前のAI画像（ショップの商品写真は写っていない）。
- 配信ヘッダー：CSP（`script-src 'self'`、接続先は API の Worker だけ）・`X-Frame-Options: DENY`・nosniff・`Referrer-Policy: strict-origin-when-cross-origin`・`Permissions-Policy`（カメラ・マイク・位置情報を止める）。

## アプリの検証（公開した版）

- 単体・統合の試験314件、5サービスの型の検査、2種類のビルド（Vercel 版と Day93 版）が成功。
- 手元の Worker と配信サーバーで、診断→13回のスワイプ→お気に入り→ショップへの移動の記録→再読み込み→やり直し→404 までをブラウザで通した。390・768・1440px で横のはみ出しは0、CSP の違反とコンソールのエラーも0。
- 公開後の確認（11/16、day93.rairakku.com）：
  - ヘッダー5種と、存在しない住所での独自の404（トップへ戻るリンクあり）。
  - API：ログイン・登録の入口と demo の集計は 403。許可していない住所からの呼び出しには CORS の許可を返さない。`/health` は5サービスとも true。
  - ブラウザ：診断（16枚の写真がすべて読み込まれる）→お試し8枚→本画面で2回。再読み込みしても本画面へ直行し、お気に入り5件と累計10回が残る。3つの画面幅で横のはみ出しは0。コンソールのエラー・ページのエラー・CSP の違反は0件。
  - 本番での試験は、目印を付けた端末IDを2つ使い、スワイプをそれぞれ10回に限った。ショップへの移動（送客のリンク）は本番では押していない。
- 診断の8枚が終わると、診断用の読み込み（`/api/feed?onboarding=1`）は 403（`onboarding_complete`）を返す。「残りはゼロ」というサーバーの申告で、画面はこれを合図に結果へ進む（ログイン版と同じ取り決め）。ブラウザは通信の記録として赤字を1行出すが、エラーではない。
- 転送：`/day93/`・`/day93`・`/day093/`・`/100days/day-093-find/` は `302 https://day93.rairakku.com/`。カードの画像 `/100days/day-093-find/screenshot.webp` は転送しない。トップ・`/100days/`・他の外部Day（83・88・91）の応答は変わらない。

## 100日側の変更

- `day-093-find/`（meta.json・README.md・screenshot.webp）
- `README.md` の一覧（`npm run index:sync`）
- `infra/day-redirect/`（`EXTERNAL_DAYS` と `wrangler.toml` の経路）、`scripts/tests/day-redirect.test.mjs`
- `tests/e2e/external-days.spec.mjs`（外部Dayのカードの検査に Day093 を追加。動画が無いのでデモ再生の検査は省く）
- `npm run publish:check -- --day 93` は、アプリ本体を持たない外部Dayのため対象外。
