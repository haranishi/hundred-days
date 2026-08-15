# Day 008: じはんきレーダー

現在地の近くにある自動販売機を、地図を使わず「方角・距離・種類」で示すレーダーです。

公開予定URL: `https://hundred-days.pages.dev/day-008-vending-radar/`

## 使い方

「現在地からさがす」を押して位置情報を許可するか、「場所をえらんでさがす」から主要駅を選びます。レーダーの光点または近い順リストを選ぶと、対応する自販機が強調されます。

## データの出どころと限界

収録データは、OpenStreetMapに2026-08-15時点で登録されていた日本国内の自販機50,397台です。日本の自販機約388万台（出典: 日本自動販売システム機械工業会「自動販売機普及台数」2025年末）の約1.3%に相当します。

このアプリで「見つからない」ことは、自販機が存在しないという意味ではありません。まだ誰もOpenStreetMapへ登録していない可能性があります。

データ: © OpenStreetMap contributors（ODbL 1.0）

## プライバシー

位置情報は端末内で距離と方角を計算するためだけに使い、送信・保存しません。「地図で開く」リンクに含まれるのも自販機の座標だけで、現在地は含まれません。

## データ更新

Node.js 18以降で次を実行します。引数なしではOverpass APIのメインサーバーを使い、失敗時はミラーへ切り替えます。

```bash
node apps/day-008-vending-radar/tools/fetch-data.mjs
```

保存済みのOverpass生JSONから変換する場合:

```bash
node apps/day-008-vending-radar/tools/fetch-data.mjs --from-file path/to/overpass.json
```
