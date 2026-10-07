# データの出典

取得日：2026-10-07（日本時間 19:27、化学賞の発表後）。

| 内容 | 出典 | ライセンス |
| --- | --- | --- |
| 受賞者の名前（英語）、賞の年・分野・発表日、受賞の状態（辞退など）、受賞理由の原文 | [Nobel Prize API 2.1](https://api.nobelprize.org/2.1/laureates)・[賞の一覧](https://api.nobelprize.org/2.1/nobelPrizes) | [CC0・利用条件](https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/) |
| 日本語の名前 | [Wikidata](https://www.wikidata.org/) の日本語ラベル。ラベルが無い項目は、同じ項目にある日本語版ウィキペディアの記事名 | [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing) |
| 2026年の発表日時 | [公式の発表日程](https://www.nobelprize.org/prizes/about/prize-announcement-dates/) | 日時という事実を日本時間に直して記載 |
| 解説（`commentary.json`） | 作者が、論文・研究機関のページ・会社の発表などの事実から、自分の言葉で書いた。出典はリンクで示し、本文は転載しない | 第三者の文章を含まない。ライセンスはコードと同じMIT |

## 解説の出典の確かめ方（2026-10-07）

- 論文は、DOI から Crossref で題名・発行日・著者を確かめ、要旨は PubMed・arXiv で読んだ。出版社のページは機械からのアクセスに403を返すものがある
- 研究機関・会社のページは本文を取得して、文ごとに照合した。照合は、作者とは別の担当（Codex）が、出典の本文だけを根拠に3回行った
- 公式サイトの文章は、事実を確かめるために読んだだけで、転載・翻訳・言い換えをしていない。公式の文章との近さも、別の担当が点検した
- 日本語の名前（6人）は Wikidata の API で日本語ラベルを取得して確かめた。受賞者番号は公式APIの応答と全件一致した（`tools/check-commentary.mjs --online`）

## 加工したこと

`tools/build-data.mjs` が API の全件を取り、次のように変えて `laureates.json` に書き出しました。

- 生年月日と没年月日は書き出さない。代わりに、画面と同じ関数（`lib/age.js`）で数えた発表日の年齢と、注記の印（生まれた月日が不明・発表の前に死去）を持つ
- 個人は受賞1回ごとに `awards`、団体は `orgs` に分ける
- 写真・肖像・ロゴ・受賞者の経歴の文は含めない

名前・年・分野・発表日・受賞理由の値は、APIのままです。

Wikidata へは連絡先の分かる User-Agent を名乗り、50件ずつ直列に約20回だけ取得しました。
混雑の応答（429/503）には Retry-After の秒数だけ待って取り直します。

## テスト用の実応答

`tests/fixtures/` の6ファイルは、2026-10-06〜07 の API の実応答（CC0）です。

- `prizes-2026-1006.json`・`laureates-2026-1006.json`：10/6 18:45 時点。生理学・医学賞の3人だけが入っている
- `prizes-2026-1006-physics.json`・`laureates-2026-1006-physics.json`：10/6 18:53 時点。物理学賞の1人が加わった
- `prizes-2026-1007-chemistry.json`・`laureates-2026-1007-chemistry.json`：10/7 18:57 時点。化学賞の2人が加わった

今年の分は画面が生年月日から年齢を数えるので、この6ファイルには API のとおり生年月日が入っています（6人分）。
テストの中で応答を加工するときは、追加する名前を Test Laureate A のようにして実在の受賞者と区別します。
`commentary-test.json` は、画面の確認のための作り話の解説で、実在の人・出来事は含みません。

このアプリはノーベル財団・Nobel Prize Outreach とは関係ありません。
