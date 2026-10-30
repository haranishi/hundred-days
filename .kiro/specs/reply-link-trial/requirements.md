# 新しいDayの返信リンクの試験運用

本人が2026-10-30に「数日だけ試す」を選んだ。Day080から、`meta.json` の `publicUrl` を `https://rairakku.com/100days/<フォルダ名>/` にする。Xの返信リンク（`x:prepare` が `reply.txt` に書く）の住所が変わる。Day079以前のDayは変えない。`mount: false` のDayは元のホストのまま。

当初はDay081からの予定だった。同日の夜に、本人が「Day80から、今日から」を選んだ。Day080は公開済みなので、そのDayの `meta.json` も切り替える。README の一覧（`sync-day-index.mjs` が `publicUrl` から作る）のDay080の行のリンクも、新しい住所になる。Day080のページの中身（canonical・og:image・共有文）は変えない。canonical はもともと `HD_CANONICAL_BASE/<フォルダ名>/` で、新しい住所と同じ。

数日後に、rairakku.com 側の Pages Functions の使用回数（問い合わせAPIと共有の無料枠、1日10万回）を見て、続けるか戻すかを本人と決める。戻すのは `publicUrl` を元に戻すだけ。すでに出したリンクは、どちらの住所も開く。

本人のMacが rairakku.com の名前を引けない間（DNSの反映待ち）も、投稿の準備が止まらないこと。ただし、代わりに確認した事実は隠さない。
