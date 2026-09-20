# サーバー側APIとDayの対応

[全Dayの一覧に戻る](../README.md#アプリ一覧)

外部APIの中継が必要なDayだけ、ここにCloudflare Pages Functionsを置いています。
ブラウザ側のコードはリポジトリ直下の各Dayフォルダーにあります。
`functions/api/day-NNN/` はCloudflareのルーティングに使う配置で、公開パスは `/api/day-NNN/…` です。

| Day | アプリ・ブラウザ側コード | サーバー側コード |
|---|---|---|
| 009 | [秋田バスライブ](../day-009-akita-bus-3d/) | [vehicles.js](api/day-009/vehicles.js) |
| 023 | [MAGTRACE](../day-023-magtrace/) | [trend.js](api/day-023/trend.js) |
| 025 | [ちかくの駐車場](../day-025-nearby-parking/) | [parking.js](api/day-025/parking.js)・[place.js](api/day-025/place.js) |
| 029 | [ちかくのWi-Fi](../day-029-nearby-wifi/) | [place.js](api/day-029/place.js) |
| 030 | [せかいのまど](../day-030-world-window/) | [windy.js](api/day-030/windy.js) |
| 035 | [きょうの一面](../day-035-front-page/) | [page.js](api/day-035/page.js) |

共通の配信設定は [scripts/build.mjs](../scripts/build.mjs)、ブラウザテストは [tests/e2e/](../tests/e2e/) にあります。
