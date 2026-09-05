# Day 029 候補「ちかくのWi-Fi」要件定義（試作・公開と Day 番号は本人が判断）

現在地か地名から、**近くにある「Wi-Fiが使えそうな場所」**を地図と距離順のリストで出す。自治体公式・OpenStreetMap（OSM）登録・推定の3層を文字と色で分け、**行き先を押すと Google マップが開く**。同梱した公開データに載っていない場所は出ないことを画面に書く。

## 背景と狙い

- 本人の要望「街・市・国の単位で、Wi-Fiが繋がる場所を地図にしたい。タップしたらGoogleマップに飛ぶ」から。
- OSM登録、自治体11件の公式オープンデータ、公式サイトで提供状況を確認した推定を別々のJSONで同梱する。未登録・未収録の場所は出ない。
- MapLibre（同梱）＋ OpenFreeMap のタイルを使う。検索時のOverpass通信は行わず、Nominatimだけを **Cloudflare Pages Functions の地名検索中継**（`functions/api/day-029/place.js`）から呼ぶ。
- 主要アクションは「近くを探す」1つ。行き先の案内は Google マップに任せ、自前で経路を出さない。

## ユーザーストーリー

| ユーザー | 欲しいことと理由 | 受け入れ条件 |
|---|---|---|
| 出先でギガを節約したい私（本命） | いまいる場所の近くで、無料Wi-Fiがある店や施設を知りたい | 「現在地から探す」1回で、距離順のリストと地図が出て、いちばん近い無料の場所が分かる |
| 行き先を決めた私 | その場所までの行き方はGoogleマップで見たい | 各項目の「Googleマップで開く」を押すと、その座標にピンが立ったGoogleマップが新しいタブ（スマホならアプリ）で開く |
| 旅行の前に調べたい私 | 現在地でなく、地名で探したい | 地名を入れて探すと、その場所を中心に同じ結果が出る |
| 無料だけ見たい私 | 有料や不明は要らない | 「無料と来店客向けだけ」の絞り込みが1タップで効き、件数が変わる |
| 田舎にいる私（このアプリが救う相手） | 近くに無くても、どこまで広げれば見つかるか知りたい | 0件のとき「半径を広げる」で 800m→3.2km に広がり、それでも無ければ「登録が無い」と正直に言う |
| データを疑う私 | 無料と書いてあっても本当か分からない | 各項目に「OSM登録の内容どおり。店で確認を」と分かる表示があり、出典と更新の仕組みが説明にある |

## UX5階層

- **戦略**: 「Wi-Fi地図」ではなく**「いま近くで使えそうな場所へ、最短で送る」道具**。成功＝開いて10秒で最寄りの無料スポットが分かり、1タップで Google マップに渡る。失敗＝地図をなぞる作業を要求すること、登録が無い地域で「無い」と言い切って不安にさせること（「OSMに登録が無いだけ」と言う）。差別化の源泉は、アプリ不要・登録不要で、無料／来店客向け／有料を分けて見せること。
- **要件**: 載せるもの＝現在地／地名で探す・掴んだ地名と候補・地図（ピン）・方角つき距離順リスト・絞り込み（無料と来店客向けだけ）・半径切替（800m／3.2km）・前回の場所の記憶・出典と注意。対象外＝経路案内、接続の自動化、口コミ、営業時間の判定、全国の密度地図、お気に入り、サーバー保存。
- **構造**: 単一画面。上から「探す（現在地ボタン・地名入力）」→「結果の要約（件数・半径・絞り込み）」→「地図」→「リスト」→「出典と注意」→シェア。900px以上は地図を左、探す・要約・リストを右。迷う分岐は「位置情報を拒否」「通信失敗」「0件」で、どれも検索カード内に一言と次の手（地名で探す・広げる・もう一度）を出す。
- **骨格**: いちばん大きい要素は**地図**（スマホでは高さ 44vh 程度、下にリスト）。主要ボタンは「現在地から探す」1つを塗り。リストの各項目は1行目が名前と無料区分のバッジ、2行目が種類・距離・SSID、右端に「Googleマップで開く」。ピンを押すと同じ項目がリストで強調される。
- **表層**: 地は生成り、文字は墨、主要ボタンと現在地は深い青。自治体は青緑の角丸四角、OSM登録は料金別の雫形、推定は白地の雫形で区別し、色に加えて必ず文字を出す。凡例は検索前に隠し、検索後は地図に出ているピンの区分だけを表示する。演出は1つ、**結果が出た瞬間にリストが上から順に0.4秒でそろう**。`prefers-reduced-motion` では自動スクロールと地図移動も即時にする。

### UX5階層を通したことで決まった実装（8件）

1. **行き先は Google マップに渡す**（戦略層）。自前の経路や詳細画面は作らない。URL は `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`（座標で開く。名前で検索すると別の店に飛ぶことがある）
2. **無料区分は4値で、色と文字の両方**（表層）。`internet_access:fee=no` または `wifi=free` → 無料／`customers` → 来店客向け／`yes` → 有料／無し → 不明
3. **「OSMと自治体の公開データに載っている場所だけ」を結果の要約に常時表示**（戦略層）
4. **半径は 800m と 3.2km の2段だけ**。同梱データから端末内で抽出する
5. **現在地は上流へ送らない**。小数3桁に丸めた前回地点だけを端末へ保存する
6. **前回の場所と絞り込みを端末に記憶**（要件層・localStorage）。次に開いたとき「前回: 秋田駅周辺」からすぐ再検索できる。位置そのものは丸めた値で保存
7. **リストは方角つき距離順で最大100件**（骨格層）。地図ピンは近い60件まで描く
8. **地名検索は Nominatim の中継**（要件層・Day 025 の `place.js` と同じ）。1文字だけの入力は送らない

## 機能要件

**状態**: `<main id="app" data-state="empty|loading|results|none|error">`
- `empty`: `#empty`「現在地から探すか、地名を入れてください」
- `loading`: `#loading`「探しています…」（`aria-live`）
- `results`: `#summary`＋半径切替＋地図＋リスト。100件超と60ピン超は表示上限を追記する
- `none`: 層の全OFF、無料絞り込み、800mの0件、3.2kmの0件を分け、それぞれ次の操作を出す
- `error`: 位置情報・同梱データの失敗理由を検索カード内の`#error-body`へ出す。地名検索の入力・通信失敗は`#message`へ出し、直前の結果状態を残す

**探す**
- `#locate`「現在地から探す」（主要ボタン）: `navigator.geolocation.getCurrentPosition`（`enableHighAccuracy: false`・timeout 10秒）。取れたら `search(lat, lng, 800)`
- `#place`（地名）＋`#search`: 2文字以上で `/api/day-029/place?q=` → 先頭候補の座標で検索。掴んだ短い名前と最大5候補を表示し、候補切替は再通信しない。失敗時も直前の結果を残す
- 最初の検索で3つの同梱JSONを並列取得してメモリに保持し、半径抽出と距離順計算は端末内で行う。半径は 800 か 3200 のみ
- `#widen`: 同じ中心で 3200 に広げる（1回だけ）
- `#only-free`（チェック・既定オフ）: 無料と来店客向けだけをリストと地図に出す。ラベルに切替後の件数を示す

**同梱データと中継**
- `data/osm-wifi.json`、`data/osm-chains.json`、`data/municipal.json`は統合も重複排除もせず別々に保持する
- Overpassは`tools/fetch-osm.mjs`の生成時だけ使い、座標を小数5桁に丸めて項目を削減する
- `functions/api/day-029/place.js`だけを残し、地名検索結果を7日キャッシュする

**正規化（`lib/normalize.js`・純関数）**
- `feeClass(tags)` → `free|customers|paid|unknown`（上の規則。`internet_access=no` は除外）
- `categoryOf(tags)` → 日本語ラベル: `amenity=cafe`→カフェ／`shop=convenience`→コンビニ／`railway=station` or `public_transport=station`→駅／`amenity=library`→図書館／`tourism=hotel|hostel|guest_house`→宿／`amenity=restaurant`→飲食店／`amenity=fast_food`→ファストフード／`amenity=townhall|community_centre|public_building`→公共施設／`amenity=bank`→銀行／`shop=*`→店／`office=*`→オフィス／それ以外→その他
- `displayName(tags)` → `name:ja` → `name` → `brand` → 種類名（無ければ「名前なし」）
- `toSpot(element)` → `{ id, name, category, fee, ssid, lat, lng, hours }`。座標は node の `lat/lon` か `center`
- `sortByDistance(spots, origin)`（Haversine・`lib/geo.js` は Day 025 から複製）
- `mapsUrl(lat, lng)` → `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`（小数5桁に丸める）
- `summarize(spots)` → `{ total, municipal, osm, chain }`

**地図（`lib/map.js`・Day 025 から複製して差し替え）**: MapLibre＋OpenFreeMap。初期表示は日本全体。検索後は中心と一致地点を画面内へ収め、近い60地点までピンを描き、重なる場合は近いピンを前面にする。自治体は青緑の角丸四角、OSM登録と推定は雫形、現在地は最前面の青い点。タイル読込中と失敗時は地図上に状態を示す。ピンを押すと `#list` の該当項目へスクロールして強調する

**リスト（`#list`）**: `<li>` ごとに `.spot-name`・`.badge[data-fee]`（無料／来店客向け／有料／不明）・`.spot-meta`（種類・8方位と距離・SSID）・`<a class="maps" href="<mapsUrl>" target="_blank" rel="noopener noreferrer">Googleマップで開く</a>`。最大100件。項目自体を押すと地図がそこへ寄る

**記憶（`lib/storage.js`）**: キー `day029.wifi.v1`＝`{ v:1, last: { lat, lng, label, radius } | null, onlyFree: boolean, layers: { municipal, osm, chain }, updatedAt }`。`lat/lng` は小数3桁に丸めて保存。3層のチェック状態も記憶する。開いたとき `last` があれば `#last`「前回: 秋田駅周辺（3.2km）」＋「もう一度探す」を出す

**画面の文言**
- ラベル「DAY 029 · NEARBY WIFI」、`<h1>`「ちかくのWi-Fi」、説明「いまいる場所から、Wi-Fiが使える場所へ。」
- 出典と注意（`.about-card`）にOSM・ODbL・OpenFreeMap・Nominatim、自治体11件のクレジット、チェーン15社の提供状況・条件・公式出典を表示する
- `<meta name="share:text">`「ちかくのWi-Fi — いまいる場所から、Wi-Fiが使える場所へ。行き先はGoogleマップで」

## 非機能・技術

- Day 025 と同じ構成: `index.html`＋`app.css`＋`app.js`＋`lib/`（`api.js`／`geo.js`／`map.js`／`nominatim.js`／`normalize.js`／`state.js`／`storage.js`／`ui.js`）＋`vendor/maplibre-gl.js`・`vendor/maplibre-gl.css`（Day 025 の `vendor/` をそのまま複製）＋`functions/api/day-029/`
- **`scripts/build.mjs` に day-029 のCSPを足す**: `CONNECT_BY_APP` に `https://tiles.openfreemap.org`、`WORKER_BY_APP` に `worker-src blob:`、img-src 側（Day 025 と同じ場所）にタイルのホスト。Day 025 の3か所と同じ書き方で
- インライン `<script>`・`style` 属性・`on*` 属性なし。ユーザー入力（地名）と上流の文字列（名前・SSID）は `textContent` で描く
- アクセシビリティ: ボタン・リンク 44px 以上、バッジは色＋文字、地図は `aria-label`、リストは `<ol>`。フォーカスリング可視
- レスポンシブ: 320/390/1280 で横スクロール無し。1200×750 で「現在地から探す」・地図・リスト先頭が同じ画面
- `alert/confirm/prompt` 不使用。定数名を `KEY` で終わらせない。ローカルの絶対パス（ホーム配下など）を書かない

## テスト

- ユニット（`tests/*.test.mjs`）: 3層の絞り込み、層別集計、距離順、チェーン文言、保存設定、生成ツールを確認する
- E2Eは3つの同梱JSONを固定12件へ差し替え、現在地・地名・絞り込み・半径拡大・Googleマップ・オフライン・再読込・ピン選択・3幅・44px・通信先・出典を確認する。上流429は地名検索で確認する

## やらないこと

- 経路案内・接続の自動化・SSIDへの接続
- 全国の密度地図（別案）、口コミ、営業中判定、お気に入り、サーバー保存、アカウント
