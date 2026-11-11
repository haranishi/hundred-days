# Day089「FROSTLINE」の作業記録（外部Day）

2026-11-11。ブラウザで滑る、オリジナルの雪山ゲーム。公開先は https://day89.rairakku.com/（Cloudflare Pages）。この記録は、公開の手順と、事実の確認の証拠。

## 公開の構成（Day083・Day088と同じ外部Day）

- アプリ本体は、専用の Pages プロジェクト（`frostline-day89`）に置き、`day89.rairakku.com` で配信する。`meta.json` は `status: external`。
- `https://rairakku.com/day89/` と、100日の正の住所 `https://rairakku.com/100days/day-089-frostline/`（フォルダ直下だけ）は、共通の転送 Workers で `day89.rairakku.com` へ 302 する（`infra/day-redirect/`）。中継にはしない。
- アプリのコードは公開していない。このフォルダにあるのは、一覧に載せるための記録（meta.json・README・スクリーンショット・デモ動画）。
- 解析・Cookie・外部通信は使わない。配信ヘッダーは CSP（`default-src 'none'`・`connect-src 'self'`）・nosniff・HSTS・Referrer-Policy・Permissions-Policy。存在しないパスは、案内つきの 404。
- はじめに山のデータを約36MB読み込む。高さの表（16MB）は、圧縮しても2割しか縮まないので、そのまま配っている。

## 名前を決めた経緯

- 本人の候補「シュプール」は、特許庁の J-PlatPat で、集英社の登録商標（第5498388号・存続）の指定に「オンラインゲームの提供」と「家庭用テレビゲーム機用プログラム」が入っていた。ゲームの名前には使わない。
- 本人が「FROSTLINE」に決めた。「FROSTLINE」「フロストライン」は、第9類・第41類に登録が無い（登録5件は、かばん・服・菓子の区分）。
- 海外のゲーム『DayZ』に、同じ名前の拡張版がある（米国で「DAYZ FROSTLINE」として出願）。本人には伝えた。

## アプリの検証（公開した版）

- 単体試験 799 件が成功。
- 別のAIが、実際に操作して採点した。スキーの滑りは 11→14/16 点で合格。スノーボードの体験は 13→15→15/20 点で、合格点（16）に届かないまま上限の3周で止めた。スキーの人の見た目は、画像で 6→10→9/16 点（不合格のまま停止）。
- 公開した版（`frostline-day89.pages.dev`）を、実際のブラウザで確かめた。共有の窓（X・LINE・リンクのコピー・Escape・焦点）、題字の収まり、押す所の大きさ、このゲームについてのページ、コンソールの誤り0を、3つの画面幅で36項目。全部成功。
- 起動は WebGPU と WebGL2 の両方で成功。指の操作（4つの画面幅）と、道具の選び方（11項目）も成功。
- 応答: `/`・`/about/`・`/og.jpg`・山のデータは200。存在しないパスは404。CSP・HSTS・nosniff が付く。

## 100日側の変更

- `day-089-frostline/`（meta.json・README.md・screenshot.webp・demo.mp4）
- `README.md` の一覧（`npm run index:sync`）
- `infra/day-redirect/`（`EXTERNAL_DAYS` と `wrangler.toml` の経路）、`scripts/tests/day-redirect.test.mjs`
- `tests/e2e/external-days.spec.mjs`（外部Dayのカードの検査に Day089 を追加）

`demo.mp4` は、公開用ビルドを手元で配り、物理を1/30秒ずつ進めて1コマずつ撮った（毎回同じ動画になる）。前半はスノーボードで台を越えて「テール 360」、後半はスキーで切るところ。16秒・960×600・無音。

## 残り

- Xへの投稿は本人。宣伝動画（縦型・BGMつき）は、別のPRで足す。
- 実機（iPhone・Android）での操作と、音は確かめていない。
