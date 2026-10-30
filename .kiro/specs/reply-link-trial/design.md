# 設計

返信リンクの住所は `meta.json` の `publicUrl` が決める。規則は `AGENTS.md` に書く。コードで強制しないのは、Dayごとに戻せるようにするため。

`x:prepare` の公開URL確認は `scripts/lib/public-url.mjs` に分けた。名前を引けない失敗（ENOTFOUND・EAI_AGAIN）で、URLが中継（`HD_CANONICAL_BASE`）の下にあるときだけ、行き先（`SITE_ORIGIN`）の同じパスで取り直す。取り直したときは、警告を出し、`manifest.json` の `urlChecks` に `checkedVia` を残し、`checklist.md` に「別の回線で開いて確認」の未完了項目を足す。HTTPエラー・接続拒否・証明書の失敗は代わりにしない。中継の不具合を隠さないため。

canonical の期待値は変えない（`HD_CANONICAL_BASE/<フォルダ名>/`）。取り直した先の pages.dev のページも、同じ canonical を持つ。
