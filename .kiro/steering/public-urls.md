# 公開の住所と配信の構成

100日チャレンジは、同じ公開物を複数の住所で配る。どれが「正」か、なぜそうしたか、住所を変えるときに何を直すか。コードを読んでも分からないことを、ここに残す。2026-11-01 時点（外部Dayの転送は 11-04 に追記）。

## 住所と役割

| 住所 | 役割 | 配るもの |
|---|---|---|
| `https://rairakku.com/100days/<フォルダ名>/` | **正の住所**。canonical・サイトマップ・Xの返信リンク・READMEの一覧は、これを指す | rairakku.com の Pages Functions が、下の「元」を中継する。中継のコードは別リポジトリ（`haranishi/rairakku` の `functions/100days/` と `server/hundred-days-proxy.mjs`） |
| `https://hundred-days.pages.dev/<フォルダ名>/` | **元**。同じ公開物を直接配る。中継の取得先で、旧住所のままでも開く。`mount: false` のDay（064・076）の正の住所でもある | Cloudflare Pages。mainが更新されると、CIが自動で出す |
| `https://day<番号>.rairakku.com/` | 外部Day（Day081 PageCrate・Day083 カー360）の**アプリ本体** | Day081 は別リポジトリの別の Cloudflare Worker、Day083 は Pages（`car-360-day83`）。どちらもカスタムドメイン |
| `https://rairakku.com/day<番号>/` | 外部Dayの、**rairakku.com の中の住所**（2026-11-04〜）。アプリ本体の住所へ 302 で転送する | Cloudflare Workers `rairakku-day-redirect`（`infra/day-redirect/`）。中継ではなく転送 |
| 外部のサイト | 外部Day（019・020・051・067）の本体 | 外部 |

外部Dayのうち `intro` を書いたDay（Day081）は、正の住所の下に、紹介ページも持つ。仕様は [external-intro-pages](../specs/external-intro-pages/requirements.md)。

## 決まりと、見張っている場所

| 決まり | 見張り |
|---|---|
| 公開済みでマウントされるDayの `publicUrl` は、正の住所にする。例外は、`mount: false`（元の住所）・外部Day（外部の公開先）・下書き（対象外） | `scripts/tests/public-url-contract.test.mjs` |
| canonical・OGP・sitemap・404 の基準は `HD_CANONICAL_BASE`（既定 `https://rairakku.com/100days`）。ソースに書く値は元の住所のままでよく、ビルドが基準へそろえる | `scripts/build.mjs`（`injectAppMeta`）・[公開の契約](publish-contract.md) |
| 公開物の中のサイト内参照は文書相対。ルート直下の絶対パスは書かない（`/api/day-NNN/` だけ例外） | `npm run build`（`check-mount-safe`） |
| 外部Dayの本体は、このリポジトリで配信しない。紹介ページを持つときは `meta.json` に `intro` を書く | ビルドが前提を確かめ、足りなければ止まる |
| 紹介ページ（`intro`）が無い外部Dayは、正の住所 `rairakku.com/100days/<フォルダ名>/` が404にならないよう、アプリへ302で転送する（`EXTERNAL_DAYS` の `folder`・`wrangler.toml` の経路を、Dayごとに1本） | `scripts/tests/day-redirect.test.mjs`（`meta.json`・経路との突き合わせ。経路を広げると落ちる） |
| `day<番号>.rairakku.com` で出す外部Dayは、`rairakku.com/day<番号>/` からも見られるようにする（`infra/day-redirect/worker.mjs` の `EXTERNAL_DAYS` に番号を足す） | `scripts/tests/day-redirect.test.mjs`（`meta.json` と表の突き合わせ） |
| 名前を変えたDayの古い住所は、`static/_redirects` に301を足す。存在しない住所は本物の404 | `scripts/tests/not-found.test.mjs` |

## 判断と理由

- **正の住所を rairakku.com にする**：検索の評価を、1つのドメインに集めるため。2026-10-30 に Day080 から試し、2026-11-01 に全Dayへ広げた。効いたかは、数週間後に Search Console で見る。
- **旧住所（pages.dev）から正の住所への転送（301）は入れていない**。理由は3つ。
  1. 旧住所のページは、すでに canonical・og:url・サイトマップで正の住所を指している（2026-11-01 の実測）。転送が上乗せする効果は小さい。
  2. 転送すると、中継が元へ取りに行く要求まで転送される。除外を誤ると、`/100days/` 全体が自分自身へ戻って開かなくなる。中継は元への要求に `x-via-rairakku: 1` を付けるので除外はできるが、元の Pages に、全リクエストで動く関数が要る。
  3. 旧住所の訪問者が全員、rairakku.com の Pages Functions を通る。無料枠（1日10万回。問い合わせAPIと共有）を食い、尽きると問い合わせが止まる。
- **外部Dayのアプリは、`rairakku.com` の中の住所（`rairakku.com/day<番号>/`）でも見られるようにする（2026-11-04 本人指示・Day083から）**：指示は「rairakku.com の中に入れたい。新しくビルドはしたくない」。アプリのビルドも公開先も増やさず、共通の転送1本で足す。**中継にしない**のは、アプリが1訪問で約30リクエスト（HTML・JS・音・モデル）あり、rairakku.com の Workers／Pages Functions の無料枠（1日10万回・問い合わせAPIと共有）を食うため。尽きると問い合わせが止まる（上の301を入れなかった理由と同じ）。代わりに、転送のあとのアドレスバーは `day<番号>.rairakku.com` になる。`rairakku.com` のままにしたいなら、Workers を有料プランにしてから中継に変える。
- **外部Dayのアプリは `day<番号>.rairakku.com`、紹介ページは正の住所の下**：アプリは別リポジトリ・別の配信先で動かし、このサイトには、検索で見つけてもらうための紹介を置く。ドメインの評価は rairakku.com に集まる。

## 落とし穴

- 中継は GET と HEAD だけ。元へ渡す見出しは限り、Cookie は渡さない。元の転送（Location）は書き換える。API（`/api/day-NNN/`）は署名つきで中継する。
- Pages Functions の無料枠は、rairakku.com の問い合わせAPIと共有。使用回数は、切り替えのあとに見る（`reply-link-trial` のタスク）。
- 新しいドメインの名前は、本人の Mac の回線で、最大2日引けないことがある。`x:prepare` は、正の住所の下のURLに限り、元の住所で代わりに確認し、「別の回線で確認」の項目を足す。
- Day のコードに焼き込まれた旧住所（Day058 のビルド済みの束、Day060 の共有URLなど）は、作り直すまで残る。旧住所でも同じページが開くので、壊れない。
- 画面の撮影に、検査用のブラウザを使わない。動画の枠の表示などが、本物の Chrome と違う。`channel: 'chrome'` の Chrome で撮り、開いて2秒待つ。

## 住所やドメインを変えるとき

1. この文書の表と、`AGENTS.md` の `publicUrl` の規則を直す
2. `public-url-contract.test.mjs`・`HD_CANONICAL_BASE`・`SITE`（`scripts/build.mjs`）を直し、`npm run index:sync` でREADMEの一覧を作り直す
3. 本番へ出たあと、一覧・見本のDay数本・サイトマップを実際に開き、HTTP 200 と canonical の一致を確かめる（2026-11-01 は73件すべてが200で一致）
4. 外部DayのXの返信リンクは、`npm run x:prepare` が `publicUrl` から作る。住所を変えたDayの返信文は、作り直す

関連：[mount-safe](../specs/mount-safe/requirements.md)・[reply-link-trial](../specs/reply-link-trial/requirements.md)・[external-intro-pages](../specs/external-intro-pages/requirements.md)・README「rairakku.com/100days/ へ中継される」。
