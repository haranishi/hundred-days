# Day 029 ちかくのWi-Fi

現在地か地名を中心に、近くのWi-Fi候補を地図と距離順のリストで探す。地名検索では掴んだ場所と最大5候補を表示し、半径800m／3.2kmを結果から切り替えられる。行き先は座標指定のGoogleマップで開く。

https://hundred-days.pages.dev/day-029-nearby-wifi/

## データの3層と限界

- 自治体: 11自治体の公式オープンデータ。無料スポットとして表示する
- OSM登録: OpenStreetMapでWi-Fiタグが付いた地点。無料・来店客向け・有料・不明は登録値のまま表示する
- 推定: OSMのブランド登録地点と、各社が公式サイトで案内する提供状況を照合した推定。店舗ごとの利用可否は確認していない

3層は別々のJSON・別々の配列のまま扱う。表示時だけ半径内を取り出し、方角つきの距離順で並べる。リストは近い100件、地図ピンは近い60件までで、重複排除はしない。自治体ピンは青緑の角丸四角、OSM登録と推定は雫形で区別する。重なるピンは近いものを前面に描く。未収録の店や施設も多く、「表示されない」ことはWi-Fiがないことを意味しない。条件は現地で確認する必要がある。

## 同梱データの作り方

自治体データは、配布元から取得できるものを直接取得して変換する。

```sh
node apps/day-029-nearby-wifi/tools/fetch-municipal.mjs
```

直リンクで取得できない配布物は、`municipal-sources.json`の`localName`どおりに作業用ディレクトリへ置いて変換する。

```sh
node apps/day-029-nearby-wifi/tools/fetch-municipal.mjs --from-dir <自治体ファイルのディレクトリ>
```

OSMのWi-Fi登録とチェーン地点は、公開用の項目へ削減して別JSONに出力する。

```sh
node apps/day-029-nearby-wifi/tools/fetch-osm.mjs \
  --brands apps/day-029-nearby-wifi/tools/chains.json
```

取得済みのOverpass生JSONだけから再変換する場合は次の形にする。ブランド生JSONは`brand-Q番号.json`という名前で置く。

```sh
node apps/day-029-nearby-wifi/tools/fetch-osm.mjs \
  --from-file <wifi生JSON> \
  --brands apps/day-029-nearby-wifi/tools/chains.json \
  --from-dir <ブランド生JSONのディレクトリ>
```

生成物は`data/osm-wifi.json`、`data/osm-chains.json`、`data/municipal.json`。OSM抽出は座標を小数5桁にし、表示に必要な項目だけ残す。詳しい自治体の出典と加工は`data/SOURCES.md`を参照。

## 通信と端末保存

3つのデータJSONは最初の検索時に同一オリジンから並列に読み、以後の半径検索・絞り込み・距離順計算は端末内で完結する。0件・位置情報・読込エラーの案内と復帰操作は検索カード内に示す。凡例は検索前には隠し、検索後は地図に出ているピンの区分だけを表示する。地名検索だけ`functions/api/day-029/place.js`を通じてNominatimへ問い合わせ、結果を7日キャッシュする。地名検索が失敗しても直前の結果は残す。現在地検索では座標を外部APIへ送らない。地図の初期表示は日本全体で、ブラウザが外部へ接続するのはOpenFreeMapの地図タイルである。

localStorageに保存するのは、小数3桁に丸めた前回地点、半径、3層のチェック、無料絞り込みだけ。検索結果は保存しない。

データ © OpenStreetMap contributors（ODbL 1.0）。地図タイルはOpenFreeMap、表示は同梱したMapLibre GL JSを使う。ライセンスの詳細はリポジトリ直下の`THIRD_PARTY_NOTICES.md`を参照。

## やらないこと

経路案内、Wi-Fiへの自動接続、店舗ごとの利用可否の断定、口コミ、営業時間判定、重複排除、アカウント、検索結果の保存は行わない。
