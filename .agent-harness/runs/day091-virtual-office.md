# Day091「バーチャルオフィス」の作業記録（外部Day）

2026-11-13。リンクを送るだけで、同じドット絵のオフィスに集まれるWebアプリ。公開先は https://day91.rairakku.com/（Cloudflare Pages）と、同期のための Worker（Durable Objects）。この記録は、公開の構成と、事実の確認の証拠。

## 公開の構成（Day083・Day088と同じ外部Day）

- アプリの画面は専用の Pages プロジェクトに置き、`day91.rairakku.com` で配信する。`meta.json` は `status: external`。
- `https://rairakku.com/day91/…`（オフィスのリンク `/o/<ID>` を含む）と、100日の正の住所 `https://rairakku.com/100days/day-091-virtual-office/`（フォルダ直下だけ）は、共通の転送 Workers で `day91.rairakku.com` へ 302 する。中継にはしない。
- 同期の Worker は、rairakku.com の問い合わせ窓口と無料枠を分けるため、別のアカウントに置いた。ログインなしの入口だけを持ち、許可した住所（day91.rairakku.com と pages.dev）からの接続だけを受ける。接続の回数制限（IPごとに1分30回）を、Workers の Rate Limiting で掛けている。
- コードは公開していない。このフォルダにあるのは、一覧に載せるための記録（meta.json・README・スクリーンショット）。紹介動画は次のPRで足す。
- 配信ヘッダー: CSP（`default-src 'none'`、接続先は同期の Worker だけ）・HSTS・nosniff・`Referrer-Policy: no-referrer`・`Permissions-Policy`（カメラ・マイクなどを止める）。オフィスのページ（`/o/*`）は `X-Robots-Tag: noindex`。描画に使う Phaser（MIT）の許諾の文は `licenses.txt` で配る。

## アプリの検証（公開した版）

- 単体344件、画面試験（ログインなしの版29本・仲間内の版52本）が成功。ログインなしの版の画面試験は、公開と同じヘッダーの下で流し、CSP の違反が出たら落ちる。
- 別のAIが実際に操作して採点した（合格は16点以上かつ0点なし）: 体験 15→15→18/20、見た目は 390px 12→15→19、768px 13→17→19、1440px 12→17→19。
- 別のモデルによる読み取り専用の守りのレビューを3回行い、指摘（連投で無料枠を削れる、参加しない接続で部屋を満員にできる、禁止語や連絡先のすり抜けなど）を直した。
- 開発に使う部品の既知の脆弱性42件を解消した（OSV の照会で37件→0件）。
- 公開後の確認: day91.rairakku.com と pages.dev の両方で、公開ゲート（ヘッダー・経路・接続を許す住所・ログイン用の入口が404・許諾の文）が成功。本番で3人が同じオフィスに入り、人数と会話がそろい、コンソールのエラーは0件。

## 100日側の変更

- `day-091-virtual-office/`（meta.json・README.md・screenshot.webp）
- `README.md` の一覧（`npm run index:sync`）
- `infra/day-redirect/`（`EXTERNAL_DAYS` と `wrangler.toml` の経路）、`scripts/tests/day-redirect.test.mjs`（Day091 のオフィスのリンクの転送）
- `tests/e2e/external-days.spec.mjs`（外部Dayのカードの検査に Day091 を追加。紹介動画はまだ無いので `demo: false`）
