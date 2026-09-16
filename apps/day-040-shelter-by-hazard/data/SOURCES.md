# データの出どころ

このアプリは同梱データを持たない。避難場所は実行時に国土地理院から取る。
ここに書くのは、テストが読む `tests/fixtures/` の実応答の出どころ。

## `tests/fixtures/skhb/` — 指定緊急避難場所のタイル

- 取得元: 国土地理院「[指定緊急避難場所データ](https://www.gsi.go.jp/bousaichiri/hinanbasho.html)」
  （`https://cyberjapandata.gsi.go.jp/xyz/skhb0{N}/10/{x}/{y}.geojson`・N は災害の種類1〜8）
- 取得日: 2026-09-16。**未改変**
- ライセンス: [国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)
  （[公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0)。出典の記載で利用可）
- `akita/` は秋田駅の区画 `10/910/388`、`kochi/` は高知駅の区画 `10/891/410`
- **揃っていない番号は、その区画に該当が無くタイルごと404だったもの**
  （秋田は07・08、高知は03・08）。テストはこれを0件として扱う

## `tests/fixtures/address-*.json` — 住所検索の応答

- 取得元: 国土地理院 住所検索API（`https://msearch.gsi.go.jp/address-search/AddressSearch?q=`）
- 取得日: 2026-09-16。**未改変**。ライセンスは上と同じ
- `address-akita-sanno.json`（「秋田市山王」＝1件）／`address-akita-eki.json`（「秋田駅」＝11件・
  先頭は北海道中頓別町秋田）／`address-none.json`（0件）／`address-kochi-eki.json`（「高知駅」＝3件。プロモ動画が使う）

## `tests/fixtures/blank-tile.png`

- E2Eで地図タイルの代わりに返す1×1の透明PNG。このリポジトリで作ったもので、第三者データではない
