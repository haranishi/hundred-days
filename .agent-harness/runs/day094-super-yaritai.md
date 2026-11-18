# Day094「スーパーやりたい放題」の作業記録（外部Day）

2026-11-18。スーパーで「やっちゃダメ」なことを2分間やりまくり、荒らし度（点数）を競う3Dブラウザゲーム。公開先は https://day94.rairakku.com/（Cloudflare Pages）と、ネット対戦の Worker 1本。この記録は、公開の構成と、事実の確認の証拠。

## 公開の構成（Day091・Day093と同じ外部Day）

- 画面（静的ファイル）は専用の Pages プロジェクトに置き、`day94.rairakku.com` で配信する。`meta.json` は `status: external`。
- ネット対戦の部屋と相手探しは、Durable Objects を使う Worker が受け持つ。rairakku.com の問い合わせ窓口と無料枠を分けるため、別のアカウントに置いた。許可した画面の住所（`day94.rairakku.com` と `super-yaritai-day94.pages.dev`）の Origin だけを受け、許可した住所にだけ CORS（`Access-Control-Allow-Origin`・`Vary: Origin`）を返す。ワイルドカードと Cookie の許可はしない。1日の使用量の上限と、部屋づくり・接続の流量制限（IPごと）は従来どおり。
- 画面は、開いた住所が許可リストにあれば接続先を Worker にし、それ以外（Worker の画面）は同じ origin を使う。ビルドは1種類。
- 配信ヘッダー：CSP（接続先は `'self'` と Worker の https・wss だけ。Pages と Worker の2か所は1字も違わない）・`X-Frame-Options: DENY`・nosniff・`Referrer-Policy`・`Permissions-Policy`・`Cross-Origin-Opener-Policy`。
- `https://rairakku.com/day94/` と、100日の正の住所 `https://rairakku.com/100days/day-094-super-yaritai/`（フォルダ直下だけ）は、共通の転送 Workers で `day94.rairakku.com` へ 302 する。中継にはしない。
- コードは公開していない。このフォルダにあるのは、一覧に載せるための記録（meta.json・README・スクリーンショット）。紹介動画はまだ無い。

## アプリの検証（公開した版）

- 単体試験460件（Node で物理エンジンを回す試験を含む）、E2E（ひとり13件・ネット対戦15件・画面を分けた構成4件）、画面と音の点検114件が成功。固定ショット6枚で描画 119〜130 回（上限150）・毎秒60コマ。
- 新しい試験を壊して確かめた（許可リストの緩め・CORS の欠落・CSP の欠落・接続先の取り違え・ライセンスの改変など23種類をすべて検出）。別のモデルによる読み取り専用の守りのレビューは、重大0・中2・軽微3で、すべて対応した。
- 公開後の確認（11/18）：
  - Worker：新しい CSP・`licenses.txt`・新しい OGP 画像が配信される。許可した2つの画面の住所の preflight は 204 で CORS を返し、`evil.example` と `localhost` の Origin は 403。
  - Pages（`super-yaritai-day94.pages.dev`）：ヘッダー6種、存在しない住所は404、CSP が Worker 側と同一。本番の画面と本番の Worker で、実ブラウザ2つによる部屋づくり→入室→互いの動き→点→結果が通った。CSP の違反・コンソールのエラー・許可した2つ以外への通信は0件。
  - 独自ドメイン（`day94.rairakku.com`）：同じ確認が通った（canonical・OGP・ヘッダー・404・対戦）。
- 転送（11/18）：`/day94/`・`/day94`・`/day094/`・`/100days/day-094-super-yaritai/`（末尾の `/` はあってもなくても）は `302 https://day94.rairakku.com/`。問い合わせ（`?room=…`）は引き継ぐ。カードの画像 `/100days/day-094-super-yaritai/screenshot.webp` は転送しない。トップ・`/100days/`・Day83・91・93 の応答は変わらない。転送の Workers は出し直し済み。
- 本番の試験は、部屋づくり1回（友だちと）に限った。相手探しは、知らない人と当たるので本番では流していない。

## 公開前の調査（商標・実在の店・題材・権利）

- 商標（J-PlatPat・2026-11-17）：「スーパーやりたい放題」の登録・出願は0件。「やりたい放題」は別の事業者が第28類（おもちゃ）で登録しているが（登録第2161743号ほか）、第9類・第41類（ゲームソフト・オンラインゲーム）には無い。ブラウザゲームは第28類の商品ではないので、直接は重ならないとみる（弁理士の判断ではない）。
- 同じ題名のゲーム・アプリ・番組・店は見つからなかった。
- 店名：ゲーム内の架空の店名が、実在のスーパーとほぼ同じだった。荒らされる店として描くので、代わりの候補5つを、実在の店・商標（第35類ほか）で調べ、同名のものが見つからなかった「スーパーきちんと堂」に変えた（看板・タイトル・OGP 画像・店内放送の小ネタ）。
- 題材：「バイトテロ」と受け取られうるので、タイトルに「架空のお店でのゲームです。現実のお店では、まねしないでね。」を入れ、説明文にも同じ一言を入れた。現実で問題になった行為（商品を舐める・万引き・人を傷つける）は、最初からゲームに入れていない。
- 権利：3D素材は Kenney（CC0）。物理エンジン Rapier（Apache-2.0）と three.js（MIT）の許諾の文は、縮めたコードに残らないので `licenses.txt` で配り、タイトルからリンクした。効果音とBGMはブラウザの中で合成していて、外部の音源・フォント・解析は使わない。
- 確かめられなかったこと：ここ数週間の新しい出願、外国の商標、各ストアの検索結果の直接の確認。

## 失敗と対処

- Pages のプロジェクトを作るコマンド（`wrangler pages project create`）が、作業フォルダの設定ファイルを見つけて、ゲームの Worker そのものを事業用のアカウントへ出してしまった。2分後に気づき、その Worker を削除して元に戻した（使われていない）。設定ファイルのない空のフォルダから、強制の指定をつけて作り直した。
- 手元の公開ゲートに `wrangler pages dev` が使えなかった（wrangler がプロジェクトの根の設定を読んで落ちる）。画面は Worker の静的配信で代用し、実物の Pages には、公開後に同じ試験を向けて確かめた。

## 100日側の変更

- `day-094-super-yaritai/`（meta.json・README.md・screenshot.webp）
- `README.md` の一覧（`npm run index:sync`）
- `infra/day-redirect/`（`EXTERNAL_DAYS` と `wrangler.toml` の経路）、`scripts/tests/day-redirect.test.mjs`
- `tests/e2e/external-days.spec.mjs`（外部Dayのカードの検査に Day094 を追加。動画が無いのでデモ再生の検査は省く）
- `npm run publish:check -- --day 94` は、アプリ本体を持たない外部Dayのため対象外。
