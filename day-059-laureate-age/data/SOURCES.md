# データの出典

取得日：2026-10-06（日本時間 18:53、物理学賞の発表後）。

| 内容 | 出典 | ライセンス |
| --- | --- | --- |
| 受賞者の名前（英語）、賞の年・分野・発表日、受賞の状態（辞退など）、受賞理由の原文 | [Nobel Prize API 2.1](https://api.nobelprize.org/2.1/laureates)・[賞の一覧](https://api.nobelprize.org/2.1/nobelPrizes) | [CC0・利用条件](https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/) |
| 日本語の名前 | [Wikidata](https://www.wikidata.org/) の日本語ラベル。ラベルが無い項目は、同じ項目にある日本語版ウィキペディアの記事名 | [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing) |
| 2026年の発表日時 | [公式の発表日程](https://www.nobelprize.org/prizes/about/prize-announcement-dates/) | 日時という事実を日本時間に直して記載 |

## 加工したこと

`tools/build-data.mjs` が API の全件を取り、次のように変えて `laureates.json` に書き出しました。

- 生年月日と没年月日は書き出さない。代わりに、画面と同じ関数（`lib/age.js`）で数えた発表日の年齢と、注記の印（生まれた月日が不明・発表の前に死去）を持つ
- 個人は受賞1回ごとに `awards`、団体は `orgs` に分ける
- 写真・肖像・ロゴ・受賞者の経歴の文は含めない

名前・年・分野・発表日・受賞理由の値は、APIのままです。

Wikidata へは連絡先の分かる User-Agent を名乗り、50件ずつ直列に約20回だけ取得しました。
混雑の応答（429/503）には Retry-After の秒数だけ待って取り直します。

## テスト用の実応答

`tests/fixtures/` の4ファイルは、2026-10-06 の API の実応答（CC0）です。

- `prizes-2026-1006.json`・`laureates-2026-1006.json`：18:45 時点。生理学・医学賞の3人だけが入っている
- `prizes-2026-1006-physics.json`・`laureates-2026-1006-physics.json`：18:53 時点。物理学賞の1人が加わった

今年の分は画面が生年月日から年齢を数えるので、この4ファイルには API のとおり生年月日が入っています（4人分）。
テストの中で応答を加工するときは、追加する名前を Test Laureate A のようにして実在の受賞者と区別します。

このアプリはノーベル財団・Nobel Prize Outreach とは関係ありません。
