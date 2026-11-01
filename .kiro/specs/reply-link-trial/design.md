# 設計

返信リンクの住所は `meta.json` の `publicUrl` が決める。規則は `AGENTS.md` に書く。コードで強制しないのは、Dayごとに戻せるようにするため。

`x:prepare` の公開URL確認は `scripts/lib/public-url.mjs` に分けた。名前を引けない失敗（ENOTFOUND・EAI_AGAIN）で、URLが中継（`HD_CANONICAL_BASE`）の下にあるときだけ、行き先（`SITE_ORIGIN`）の同じパスで取り直す。取り直したときは、警告を出し、`manifest.json` の `urlChecks` に `checkedVia` を残し、`checklist.md` に「別の回線で開いて確認」の未完了項目を足す。HTTPエラー・接続拒否・証明書の失敗は代わりにしない。中継の不具合を隠さないため。

canonical の期待値は変えない（`HD_CANONICAL_BASE/<フォルダ名>/`）。取り直した先の pages.dev のページも、同じ canonical を持つ。

## 全Dayに広げたときの設計（2026-11-01）

規則は `AGENTS.md` に書き、見張りは `scripts/tests/public-url-contract.test.mjs` が受け持つ。例外は `meta.json` で見分ける（`mount: false`・`status: external`・`draft`）。新しいDayで違反が出ても、公開した瞬間にCIで初めて見つかることがないよう、単体テストで止める。

Dayのコードに焼き込まれた旧住所は、今回は変えない。Day058 の `SITE_URL` はビルド結果の `assets/` にも入っていて、変えるには作り直しが要る。Day060 は `app.js` と `lib/render.js` に公開先の定数を持つ。Day058 の試験は、`SITE_URL` が新住所か同じDayの旧住所のどちらかであることを見る。Day059 の試験は、固定の文字列を新住所に直した。

旧住所（pages.dev）から新住所への 301 は入れていない。理由は3つある。

1. 旧住所のページは、すでに `canonical`・`og:url`・サイトマップ（75件）で `rairakku.com/100days/` を指している（2026-11-01 実測）。301 が上乗せする効果は小さい。
2. 条件つきの 301 には、行き先の Pages で全リクエストに動く関数が要る。中継は行き先へ `x-via-rairakku: 1` を付けて要求し、リダイレクトは書き換えずに返す。除外を誤ると、中継経由の要求が自分自身へ戻り、`/100days/` 全体が開かなくなりうる。
3. 旧住所の利用者が全員、rairakku.com の関数（問い合わせAPIと共有の無料枠、1日10万回）を通るようになる。
