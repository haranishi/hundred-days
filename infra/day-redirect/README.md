# 外部Dayの共通の転送（rairakku.com/day<番号>/ → day<番号>.rairakku.com）

外部Day（`meta.json` が `status: external`）のアプリは、専用の公開先に置く。`rairakku.com` の中の住所からも開けるように、`https://rairakku.com/day<番号>/`（と、紹介ページを持たないDayは、100日の正の住所 `https://rairakku.com/100days/<フォルダ名>/`）を、アプリの住所 `https://day<番号>.rairakku.com/` へ転送する Workers 1本（`rairakku-day-redirect`）。
2026-11-04 の本人指示（Day83）。以後の外部Dayも同じ決まりで出す。決まりの全体は [公開の住所と配信の構成](../../.kiro/steering/public-urls.md) と `AGENTS.md`。

## なぜ中継でなく転送か

- 中継（アドレスを `rairakku.com` のままアプリを配る）にしない。アプリは1訪問で約30リクエスト（HTML・JS・音・モデル）。
  Workers／Pages Functions の無料枠（1日10万回）は、`rairakku.com` の問い合わせAPIと共有している。尽きると問い合わせが止まる。
- 転送なら、1訪問で1回。アプリ自体は、Pages の静的配信（枠に数えない）で動く。
- 代わりに、転送のあとのアドレスバーは `day<番号>.rairakku.com` になる。`rairakku.com` のままにしたいなら、Workers を有料プランにしてから中継へ変える。

## 新しい外部Dayを足すとき

1. アプリを Pages に出し、`day<番号>.rairakku.com` を割り当てる（`meta.json` の `externalUrl` はこの住所）。
2. `worker.mjs` の `EXTERNAL_DAYS` に番号を足す。**紹介ページ（`meta.json` の `intro`）が無いDayは `folder`（Day のフォルダ名）も足し、`wrangler.toml` に経路 `rairakku.com/100days/<フォルダ名>*` を1本足す**（正の住所 `rairakku.com/100days/<フォルダ名>/` もアプリへ転送する。Day83）。足し忘れると、`scripts/tests/day-redirect.test.mjs` が落ちる（`meta.json`・経路との突き合わせ）。
3. 出し直す（アプリのビルドではない。ファイルは1つ）。

```sh
export CLOUDFLARE_ACCOUNT_ID=$(cat ~/.config/pagecrate/account-id)   # 事業用のアカウント。ここには書かない
npx wrangler deploy --config infra/day-redirect/wrangler.toml          # 別ディレクトリから実行する（Pages 用の wrangler.toml を読ませない）
```

4. 確かめる：`curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://rairakku.com/day<番号>/` が `302 https://day<番号>.rairakku.com/`。`rairakku.com/` と `/100days/` が 200 のままであること。

## 戻すとき

`npx wrangler delete --name rairakku-day-redirect`（経路ごと消える）。`rairakku.com/day*` は元のサイトの 404 に戻る。

## 落とし穴

- 経路は `rairakku.com/day*` と、紹介ページを持たない外部Dayの `rairakku.com/100days/<フォルダ名>*`（1本ずつ）。**`/100days/*` のように広げない**（全Dayの訪問が Workers の無料枠を通ってしまう。試験が見張る）。表に無い番号や `/daytime` のような別のパスは、`fetch(request)` で元のサイトへそのまま渡す（Workers を1回通るだけで、応答は変わらない）。
- `www.rairakku.com` は、元から `rairakku.com` へ301で転送されるので、経路を足さない。
- 公開の `*.workers.dev` の住所は作らない（`workers_dev = false`）。
