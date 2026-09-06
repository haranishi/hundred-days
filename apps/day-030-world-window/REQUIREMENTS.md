# Day 030 せかいのまど 要件定義

## 1. 誰の何を解くか

**「いま、世界のあの場所はどうなっているか」を、地図の上で押して見たい人**のためのアプリ。
街角・道路・河川・山の公開ライブカメラは世界中に数千あるが、既存のまとめサイトは一覧型で、
「地図でここを押す→見える」になっていない。OpenStreetMapに登録された公開カメラ約9,600地点を
1枚の世界地図に置き、タップで詳細情報と映像（または静止画）を見せる。

**やらないこと**：非公開・無防備なカメラ（Insecam型）の収集、映像の中継・保存・再配信（映像は各提供元から
利用者のブラウザが直接読む）、個人の特定につながる機能（拡大・切り出し・保存）、アカウント、コメント、
録画、提供元の広告やロゴの除去。

## 2. ユーザーストーリー

1. 旅行を計画している人が、行き先の街の「いま」（天気・雪・人出）を映像で確かめる
2. 世界地図を眺めていた人が「どこかの窓を開く」を押して、知らない土地の今を偶然見る
3. ドライバーが、峠道や高速道路の交通カメラで今の路面を確認する
4. 見つけた1か所をURLで友人に送り、相手が同じカメラを開く

## 3. UX5階層

| 層 | 決めたこと |
|---|---|
| 戦略 | 「世界の公開カメラを、地図から1タップで」。提供元に敬意を払う（出典・リンク・再配信しない）。分からないことは分からないと出す（見られる種別・更新時刻・国は推定） |
| 要件 | 地図＋クラスタ／種別フィルタ／検索／ランダム／詳細パネル／ビューア（YouTube・静止画・HLS・リンク）／深いリンク／Windy層（鍵があるときだけ）／共有 |
| 構造 | 地図が主、パネルが従。パネルの既定は「この範囲のカメラ」一覧（最大50件）。選ぶと詳細＋ビューア。閉じると一覧に戻る |
| 骨格 | モバイル＝全画面地図＋下からのシート。デスクトップ＝左に幅400pxのパネル。上部にタイトル・検索・フィルタ、右下に現在地とランダム |
| 表層 | ダーク基調（夜の地球にカメラの灯りが点る）。種別は色＋アイコン＋語の三重化。ライト対応は `prefers-color-scheme` |

**通した結果、実装が変わった箇所**：
①「この範囲のカメラ」一覧を付けた（名前の無いカメラが56%あり、ピンだけでは選べない。キーボード操作の経路も無かった）
②「映像」「画像」「リンクのみ」の3種別を色で先に分けた（押してから「見られません」と知る空振りを避ける）
③ビューアは「選んでから読み込む」にした（自動再生は一度に1つ・利用者の操作の後だけ＝YouTubeの規約）
④全カメラに「提供元で見る」を必ず置いた（出典表示と、見られなかったときの逃げ道）
⑤深いリンク `#cam=` を持たせた（共有の実体が無いと共有ボタンが飾りになる）
⑥「どこかの窓を開く」を主ボタンにした（初見の人は地図のどこを押せばいいか分からない）
⑦現地時刻と昼夜を出す（真っ暗な映像を「壊れている」と誤解させない）

## 4. データの前提（実測 2026-09-05・Overpass一回取得）

OSMの `contact:webcam` タグを持つ地物 **9,631件**（node 9,537／way 94）。

| 項目 | 値 |
|---|---|
| 名前あり | 4,262（44%） |
| `camera:direction` あり | 4,833（50%） |
| `operator` あり | 4,487（47%） |
| `description` あり | 1,682（17%） |
| `surveillance:type=camera` | 8,087 |
| 日本国内（概略bbox） | 86件 |

URL種別（先頭URLで判定）：直画像 3,099（うち http のみ 1,492＝httpsページからは混在コンテンツで表示不可）、
YouTube 215（watch 172／live 15／youtu.be 18／channel 6／@handle 4）、m3u8 79、mp4 9、ページ等 6,149、不正 80。
上位ホストは交通局・河川局・気象観測（apps.usgs.gov 805・informo.madrid.es 358・udottraffic.utah.gov 350・trafficnz.info 335…）。
USGS（805件）はSPAページで画像URLが取れないためリンク扱い。

→ 「見られる」と約束できるのは、実測して画像・映像だと分かった地点だけ。種別は必ずビルド時に実測する。

## 5. データパイプライン（ビルド時・一回きり。実行時にOverpassへ行かない）

`tools/cache/` は gitignore 済み（`apps/*/tools/cache/`）。取得元URLは README に書く。

### 5-1. `tools/fetch-osm.mjs`
- Overpass へ1回だけ：`[out:json][timeout:120];(node["contact:webcam"];way["contact:webcam"];);out tags center;`
- User-Agent `hundred-days-day030-fetch (+https://hundred-days.pages.dev/day-030-world-window/)`
- 結果を `tools/cache/osm-raw.json` へ保存。`--from-file <path>` で取得を省略できる。**今回は取得済みの `tools/cache/osm-raw.json` がある**ので、実装中はそれを使う（再取得しない）。

### 5-2. `tools/probe-urls.mjs`（URLの種別を実測する）
- 入力：`osm-raw.json`。各地物の `contact:webcam` の先頭URL（`;` 区切りの1つ目）。
- 判定の順：
  1. URLとして不正 → `drop`
  2. ホストが youtube.com / youtu.be：
     - `watch?v=ID`・`youtu.be/ID`・`/live/ID`・`/embed/ID` → 動画ID。YouTube oEmbed（`https://www.youtube.com/oembed?url=…&format=json`）で確認。200＝`yt`（`u` は `v:ID`）、401/403＝埋め込み不可→`page`、404＝`drop`
     - `/channel/UC…` → `yt`（`u` は `c:チャンネルID`・確認不要）
     - `@handle`・`/c/`・`/user/`・`/streams` → `page`（IDが確定できないので埋め込まない）
  3. パスが `.m3u8` → https なら `hls`、http なら `page`
  4. それ以外は HEAD（405/403/400なら GET + `Range: bytes=0-0`）で content-type を見る：
     - `image/*` → `img`（http のみのURLは先に https に置き換えて試し、通れば https のURLで `img`。通らなければ `page`）
     - `video/*`・`application/vnd.apple.mpegurl`・`application/x-mpegURL` → `hls`（httpsのみ）
     - `text/html` ほか → `page`
     - 404/410・DNS失敗（ENOTFOUND） → `drop`
     - タイムアウト・接続拒否・その他エラー → `page`（一時的な障害でデータから消さない）
- 負荷：同じホストへは直列で300ms間隔、全体で24並列、1件10秒で打ち切り。User-Agentは 5-1 と同じ形（`hundred-days-day030-probe`）。
- 結果は `tools/cache/probe.json`（URL→{kind, status, contentType, finalUrl, checkedAt}）に保存し、再実行は未確認分だけ行う（`--recheck` で全件）。`--limit N` で先頭N件だけ（動作確認用）。
- `tools/exclude-hosts.txt`（1行1ホスト・`#`コメント）に載ったホストは、種別にかかわらず `page`（インライン表示しない）。提供元から掲載を控えてほしいと言われたとき、ここに足すだけで対応できるようにする。初期は空（コメントだけ）。

### 5-3. `tools/build-data.mjs`（同梱JSONを作る）
- 入力：`osm-raw.json`＋`probe.json`＋`tools/cache/ne_50m_admin_0_countries.geojson`（Natural Earth 1:50m Admin 0 Countries・パブリックドメイン・取得済み）。
- 国判定：点内多角形（ray casting・Polygon/MultiPolygon対応）。外れた点は、bboxを0.5°広げて当たる候補の中で外周頂点への最短距離が最小の国。候補が無ければ `c: ""`。
  - `data/countries.json`：`{ "JP": { "ja": "日本", "en": "Japan", "continent": "Asia" }, … }`（NE の `ISO_A2_EH`／`NAME_JA`／`NAME`／`CONTINENT`。`ISO_A2_EH` が `-99` の国は `ADM0_A3` の先頭2字ではなく除外して `""`）
- 出力 `data/cameras.json`（キーは短くする。座標は小数5桁。文字列は名前80字・説明120字・運営者60字・refは20字に切る）：
  ```json
  {
    "generatedAt": "2026-09-05",
    "osmTimestamp": "2026-09-05T02:14:01Z",
    "count": 9500,
    "kinds": { "yt": 200, "img": 1500, "hls": 60, "page": 7700 },
    "cameras": [
      { "i": "n34972298", "a": 49.1296, "o": 13.0523, "k": "img", "n": "Schareben", "u": "https://…/current/1920.jpg",
        "c": "DE", "p": "運営者", "d": 225, "z": "traffic", "s": "説明", "r": "ref", "w": "https://…（website があれば）", "t": "2025-04-01（check_date があれば）" }
    ]
  }
  ```
  - `i` は `n`+node id／`w`+way id。`k` は `yt|img|hls|page`。`u` は種別ごとの実体（`yt` は `v:ID` か `c:ID`、他はURL）。`d` は `camera:direction` を 0〜359 の整数にしたもの（`N`/`NE` 等の方位語も度に直す。範囲指定 `90-180` は先頭値。読めなければ省略）。`z` は `surveillance:zone`。無い項目はキー自体を省く。
  - `drop` の地物は含めない。`kinds` に種別ごとの件数を入れる。
- 標準出力に集計（総数・種別・国別上位10・除外数）を出す。README の数字はこの出力から書く。

## 6. 画面と機能

### 6-1. 地図
- MapLibre GL JS（`vendor/` に同梱済み・Day 025 と同じ 5.24.0）。スタイルは OpenFreeMap：ダーク時 `https://tiles.openfreemap.org/styles/dark`、ライト時 `https://tiles.openfreemap.org/styles/liberty`（`prefers-color-scheme` と画面上の切替に追従）。
- 初期表示は世界全体（center `[15, 25]`・zoom 1.4 程度）。前回の表示位置（中心・ズーム）を localStorage に保存し、次回はそこから始める（保存はこれだけ。カメラの閲覧履歴は保存しない）。
- `data/cameras.json` を GeoJSON source（`cluster: true, clusterRadius: 44, clusterMaxZoom: 11`）に載せる。層：クラスタ円＋件数、単独点（種別で色分け・選択中は大きく縁取り）。クラスタを押すと `getClusterExpansionZoom` で寄る。点を押すと選択。ホバーでカーソル変更。
- `prefers-reduced-motion: reduce` のときは `flyTo/easeTo` を `jumpTo` にする。
- 属性表示（attribution）は常時表示：`© OpenStreetMap contributors (ODbL)` と `OpenFreeMap`。フッターにも同じ出典を書く。
- E2E用：`globalThis.__E2E__` があるときだけ `globalThis.__cameraMap = map` を出す（Day 025 と同じ）。

### 6-2. 上部バー
- タイトル「せかいのまど」、副題「世界の公開ライブカメラを地図で」。
- 検索欄：名前・運営者・国名（日本語／英語）・ref を部分一致（大文字小文字・全角半角を正規化）。候補は最大20件、選ぶと zoom 13 で寄って選択。
- 種別チップ（`aria-pressed`・ONは塗り・先頭に凡例と同じ色丸）：「映像」（`yt`+`hls`）「画像」（`img`）「リンク」（`page`）。既定は全部ON。Windy が使えるときだけ「Windy」チップも出す。件数表示「表示 8,123／9,551 か所」は**チップで絞っているときだけ**出し `aria-live="polite"` で更新（全部ONのときは一覧のメタ行「世界全体 9,164件・近い順に50件」だけ）。

### 6-3. 右下のボタン
- 「どこかの窓を開く」（主ボタン）：ONになっている種別のうち `yt`/`img`/`hls` から一様乱数で1件選び、zoom 12 で寄って選択・パネルを開く。映像も画像も無い設定なら `page` から選ぶ。
- 「現在地」：`navigator.geolocation` で zoom 9 に寄るだけ。座標は保存も送信もしない。失敗時は短いトースト。

### 6-4. パネル（モバイル＝下からのシート／720px以上＝左パネル）
- 既定：「この範囲のカメラ」＝現在の表示範囲内で、ONの種別のカメラを近い順（画面中心からの距離）に最大50件。各行はボタン（高さ44px以上）で、名前（無ければ「名前のないカメラ」＋ref）・種別バッジ・国名。50件で切ったときは「◯件中50件」。
- 選択時：
  - 見出し＝名前（無ければ「名前のないカメラ」）。種別バッジ（映像／画像／リンク／Windy）。
  - ビューア（6-5）。
  - 詳細：国（日本語名＋大陸）、運営者、向き（16方位＋度・回転した矢印）、区分（`z`：traffic→交通、town→街、outdoor→屋外、…対応表を lib に持つ。未知はそのまま）、説明、確認日（`t`）、現地時刻の推定（経度÷15で丸めたUTCオフセット。「経度からの推定」と明記）と昼夜（太陽高度。`+6°以上=昼`、`-6°〜+6°=薄明`、`未満=夜`）、座標、「Googleマップで開く」（`https://www.google.com/maps/search/?api=1&query=lat,lon`）、「OpenStreetMapで見る」（`https://www.openstreetmap.org/node/ID` または `/way/ID`）。
  - 出典行：「カメラの位置とURL: © OpenStreetMap contributors（ODbL）。映像・画像は各提供元のもの」。
  - 「提供元で見る」リンク（`target="_blank" rel="noopener noreferrer"`）。`page` だけでなく全種別に置く。
  - 閉じるボタン（×）と Esc で閉じる。開いたら見出しにフォーカスを移し、閉じたら元のボタンへ戻す。
- 選択は URL の `#cam=<i>` に `history.replaceState` で反映。読み込み時に `#cam=` があれば、その地点へ zoom 12 で寄って開く（データ読込後）。

### 6-5. ビューア（種別ごと）
- **`yt`**：`<iframe>` を選択後に生成。`v:ID` → `https://www.youtube-nocookie.com/embed/ID?autoplay=1&rel=0&playsinline=1`、`c:ID` → `https://www.youtube-nocookie.com/embed/live_stream?channel=ID&autoplay=1`。`title` 属性・`allow="autoplay; encrypted-media; picture-in-picture; fullscreen"`・`referrerpolicy="strict-origin-when-cross-origin"`・`loading="lazy"` は付けない（選択後に作るため）。表示は幅いっぱい・16:9・**最小でも 480×270 に見える大きさ**（規約の推奨。200×200未満は禁止）。**プレーヤーの上に何も重ねない**（バッジや矢印はプレーヤーの外）。一度に開くプレーヤーは1つ（選択が変わったら前のiframeを消す）。「配信が終わっている場合があります」の1行を添える。
- **`img`**：`<img>` を選択後に生成。`src` は URL に `_=<時刻>` を付けたもの（`?` があれば `&`）。60秒ごとに更新（パネルが開いていて、かつ `document.visibilityState === 'visible'` のときだけ）。「更新」ボタンと「取得 HH:MM:SS」。`onerror` で「画像を読み込めませんでした。提供元で見てください」に切り替え。`alt` は名前。
- **`hls`**：`document.createElement('video').canPlayType('application/vnd.apple.mpegurl')` が空でなければ `<video controls autoplay playsinline muted>` で再生。空なら「この配信形式（HLS）はこのブラウザでは直接再生できません。Safari か提供元のページで見られます」。
- **`page`**：ビューアは出さず、「このカメラは提供元のページで見られます」と大きめの「提供元で見る」ボタン。
- **Windy**（6-6）：`images.current.preview` を `<img>`（更新は開き直したとき）。`player.day` を `<iframe>`（タイムラプス。大きさ制限なし）。**Windy の帰属表示を必ず映像の直下に出す**：「Webcams provided by windy.com - add new webcam」（`windy.com` は `https://www.windy.com/webcams` へ、`add new webcam` は `https://www.windy.com/webcams/add` へのリンク。周囲の文字と同じ大きさ・色）。「Windyで見る」（`urls.detail`）。
- 共通：ビューアの上に「見ているのは提供元が公開している映像です。個人の特定には使わないでください」を小さく1行。

### 6-6. Windy 層（鍵があるときだけ）
- 起動時に `GET /api/day-030/windy?status=1` → `{ configured: true|false }`。false のときは Windy に関するUIを一切出さない（チップ・凡例・件数）。
- true のとき、地図が止まった（`idle`）後 600ms デバウンスで、zoom ≥ 5 なら `GET /api/day-030/windy?bbox=北,東,南,西&zoom=z` を呼び、返った地点を別 source（クラスタ無し・Windy色）に載せる。zoom < 5 では呼ばず、チップに「拡大すると出ます」の補足。
- 選択時に `GET /api/day-030/windy?id=<webcamId>` で画像URLとプレーヤーURLを取り直す（無料枠のURLは10分で失効するため保存しない）。
- 中継の仕様は §7。

### 6-7. 共有・OGP
- `index.html` の `</head>` 前に `shared/share.css` と `shared/share.js` を1行ずつ（正本は `shared/`、`npm run shared:sync` が複製）。フッターに `<div id="share"></div>`。OGP・canonical は build が入れるので書かない。

### 6-8. アクセシビリティ・レスポンシブ
- 操作要素は 44×44px 以上。チップは `aria-pressed`。パネルは `role="dialog"` ではなく `<section aria-labelledby>`（地図と同時に使うため）。検索候補は `role="listbox"`／`option`。
- 3幅（375／768／1280）で横スクロール無し。モバイルのシートは高さ 45vh、つまみで 85vh に拡大。地図の操作を妨げない。
- 色は種別ごとに 4色以内（映像＝赤系、画像＝黄系、リンク＝灰、Windy＝青）。文字と背景のコントラスト 4.5:1 以上。

## 7. 中継API `functions/api/day-030/windy.js`

Windy Webcams API v3（`https://api.windy.com/webcams/api/v3/`・ヘッダ `x-windy-api-key`）。鍵は Cloudflare Pages の環境変数 `WINDY_API_KEY`（ローカルは `.dev.vars`・gitignore済み）。

- `GET ?status=1` → `{ configured: boolean }`（鍵の有無だけ。鍵の値は返さない）。`Cache-Control: no-store`。
- `GET ?bbox=n,e,s,w&zoom=z`：
  - 鍵が無ければ 503 `{ error: "not_configured" }`。
  - 検証：4つとも有限の数、`n>s`、`-90..90`／`-180..180`、`zoom` は 5〜18 の整数。範囲外は 400 `{ error: "invalid_bbox" }`。
  - bbox を格子に丸めてからキャッシュキーにする（zoom 5〜7 は 0.5°、8 以上は 0.1°。外側に丸める）。エッジキャッシュ `s-maxage=600`。
  - 上流：`/webcams?bbox=<n>,<e>,<s>,<w>&limit=50&sortKey=popularity&sortDirection=desc&include=location,categories`。
  - 返す形：`{ webcams: [{ id, title, lat, lon, status, city, country, categories: [id…] }], total, attribution: "Webcams provided by windy.com" }`。
- `GET ?id=<数字>`：
  - 上流：`/webcams/{id}?include=images,player,location,urls,categories`。
  - 返す形：`{ id, title, status, lastUpdatedOn, city, country, lat, lon, image: images.current.preview, imageDaylight: images.daylight.preview, player: { day, month, year, lifetime }, detailUrl: urls.detail, categories }`。`Cache-Control: private, max-age=300`（URLの寿命10分より短く）。
- 上流の 429 → 429 `{ error: "rate_limited" }` + `Retry-After: 30`（叩き直さない）。401/403 → 502 `{ error: "upstream_unavailable" }`（鍵の問題は利用者に見せない）。それ以外の非2xx・タイムアウト（15秒）→ 502。
- `onRequestGet(context, { fetchImpl = fetch } = {})` の形にして、ユニットテストで `fetchImpl` を差し替える（Day 025 の `functions/api/day-025/place.js` と同じ流儀）。
- 中継が返すJSONに Windy の画像URLを含めるのは、その場で表示するためだけ。同梱データや localStorage には入れない。

## 8. CSP（`scripts/build.mjs` に足す）

- `CONNECT_BY_APP['day-030-world-window'] = 'https://tiles.openfreemap.org'`（中継は同一オリジン）
- `IMG_BY_APP` に ` https:`（カメラの静止画は提供元の任意の https ホストから読む。http は許さない）
- `MEDIA_BY_APP` に ` https:`（HLS）
- **新設** `FRAME_BY_APP['day-030-world-window'] = "frame-src https://www.youtube-nocookie.com https://webcams.windy.com https://www.windy.com"`（`default-src 'self'` のままだと iframe が黙って出ない）
- `WORKER_BY_APP` に `worker-src blob:`（MapLibre）
- ⚠️ `tests/e2e/security-headers.spec.mjs` は「`const X = 'https://host…'` と `fetch('https://host…')`」を接続先とみなして connect-src と突き合わせる。**iframe や img に使うURLは `const YT_HOST = 'www.youtube-nocookie.com'` のようにホストだけを定数にし、`https://${YT_HOST}/…` で組み立てる**（接続ではないものを connect-src に足さない）。

## 9. 規約・ライセンス上の制約（実装に落とすもの）

| 対象 | 守ること | 実装箇所 |
|---|---|---|
| OpenStreetMap（ODbL） | 「© OpenStreetMap contributors」表示とライセンスへのリンク | 地図の属性表示・フッター・パネルの出典行・README・THIRD_PARTY_NOTICES |
| Overpass API | 一般向けアプリの裏で常時叩かない | ビルド時に一回だけ取得し同梱（5-1） |
| OpenFreeMap | 帰属表示（データ OpenStreetMap／OpenFreeMap） | 属性表示・フッター |
| Natural Earth | パブリックドメイン（表示義務なし）。出典は書く | README・THIRD_PARTY_NOTICES |
| YouTube 埋め込み（Developer Policies／RMF） | プレーヤーを改変・遮蔽しない／上に何も重ねない／200×200未満にしない（16:9は480×270以上推奨）／自動再生は利用者の操作後・同時に1つ／広告を遮らない／音声と映像を分離しない | 6-5 |
| Windy Webcams API（無料枠） | 帰属表示「Webcams provided by windy.com - add new webcam」を同じ大きさで／画像URLを保存・再配布しない（10分で失効）／プレーヤーの広告を遮らない／画像を原寸より拡大しない／有料部分だけに使わない／個人の特定に使わない | 6-5・6-6・7 |
| 各カメラの静止画（提供元の任意サイト） | OSMで「公開カメラのURL」として登録された、画像そのものを指すURLだけをそのまま表示する。加工しない。運営者名と提供元リンクを常に添える。掲載を控えてほしい提供元は `tools/exclude-hosts.txt` で即日外せる | 5-2・6-4・6-5 |
| 個人情報 | 映像は提供元が公開しているもの。アプリ側で拡大・切り出し・保存はしない。パネルに注意書き | 6-5 |

## 10. 受け入れ条件

- **ユニット（`node --test apps/day-030-world-window/tests/`）**：URL種別の判定（YouTubeの各形・m3u8・画像拡張子・http→https 置換・除外ホスト）／YouTube ID 抽出／方位（語→度・度→16方位）／太陽高度と昼夜判定（東京の正午は昼・深夜は夜、極域の白夜）／現地時刻の推定／国判定（点内多角形と MultiPolygon・穴・日付変更線付近）／同梱JSONの圧縮形式と復元／検索の正規化／ランダム選択が種別を守る／中継：検証・格子丸め・上流の切り詰め・429の非再試行・鍵無しの503・status
- **E2E（`tests/e2e/day-030-world-window.spec.mjs`・タイルと同梱JSONとWindyは差し替え）**：初期表示と件数／一覧→選択でパネルが開く／`yt` で iframe が youtube-nocookie を指し自動再生は選択後だけ・大きさ 480×270 以上／`img` で src に時刻が付き「更新」で変わる・エラーで案内に切替／`hls` で Chromium は案内文／`page` はビューア無しでリンク／「どこかの窓を開く」が映像か画像を選ぶ／チップで件数が変わる／検索→候補→選択／`#cam=` で直接開く・選択でhashが変わる／Esc と × で閉じフォーカスが戻る／Windy 未設定でチップが無い・設定済み（差し替え）で zoom≥5 のとき bbox 付きで呼ばれ帰属表示が出る／初期読み込みでブラウザが外へ出るのはタイル配信元だけ／3幅で横スクロール無し／44px／reduced motion
- **実ネットワーク**：`wrangler pages dev` で中継ごと通し（鍵無しで status=false、`.dev.vars` に鍵があれば bbox・id が返る）、コンソールエラー0。
- 公開前チェック5点（機械スキャン・目視・権利・ファクト・本番動作）。

## 11. 解禁表との関係

外部APIの正式解禁は Day 31 だが、Day 013・014・021・025・029 と同じく「同梱データ＋地図タイル＋中継」の形。
映像は提供元とブラウザの直接通信で、このサイトは中継しない。Windy 層だけが鍵を要し、鍵が無ければ無い状態で完結する。
