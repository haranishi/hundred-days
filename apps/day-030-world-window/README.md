# Day 030 せかいのまど

世界の公開ライブカメラを地図から選び、その場所の映像・静止画・提供元ページを開くアプリ。
表示範囲の一覧、種別絞り込み、検索、ランダム選択、現地時刻と昼夜の推定、共有用の深いリンクを備える。

https://hundred-days.pages.dev/day-030-world-window/

## データの作り方

OpenStreetMap の `contact:webcam` を持つ地物を Overpass API からビルド時に一度取得し、URLの応答を
確認して `yt`・`img`・`hls`・`page` に分類した（2026-09-05 取得・9,631件）。到達できないURL（404・DNS失敗）
464件、メール形式の誤入力やクエリに鍵らしき値（`token=` など）を含むURL 16件、公開前チェックに掛かる1件を除いた
同梱データは **9,151地点**で、内訳は映像（YouTube）141、画像2,665、HLS 84、リンクのみ6,261。国別では米国、
フランス、ドイツが多く、日本は86件しかない。実行時に Overpass API は呼ばない。

国名は Natural Earth 1:50m Admin 0 Countries との点内多角形判定から付けた。生成手順は `tools/`、
ブラウザ用の圧縮済み結果は `data/cameras.json` と `data/countries.json` に置いている。

```sh
node apps/day-030-world-window/tools/fetch-osm.mjs    # Overpass から1回取得（キャッシュがあれば再取得しない）
node apps/day-030-world-window/tools/probe-urls.mjs   # 全URLの種別を実測（ホストごとに直列・約45分）
node apps/day-030-world-window/tools/build-data.mjs   # 同梱JSONを生成
```

掲載を控えてほしい提供元は `tools/exclude-hosts.txt` にホスト名を、個別の地点は `tools/exclude-ids.txt` に
IDを1行足して `build-data.mjs` を再実行すれば外れる。

## 通信と端末保存

起動時は同梱JSONと OpenFreeMap の地図スタイル・タイルを読む。カメラを選んだ後だけ、映像や画像を
各提供元からブラウザが直接読む。Windy は中継APIの設定有無だけを起動時に確認し、設定済みの場合は
地図を拡大した範囲と、選んだ1地点の表示情報だけを中継APIから取得する。

端末には地図の前回の中心・ズームだけを保存する。閲覧履歴、現在地、Windy の期限付きURL、
映像・画像は保存しない。現在地は地図を移動するために端末内だけで使い、送信しない。

## 出典

- カメラの位置とURL: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)（[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)）
- 取得: [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- 地図: [OpenFreeMap](https://openfreemap.org/)
- 国境・国名: [Natural Earth](https://www.naturalearthdata.com/)（Public Domain）
- Windy レイヤー: [Windy Webcams](https://www.windy.com/webcams)（設定時のみ）

個々の映像・画像の権利は各提供元に帰属する。アプリは内容を加工せず、提供元リンクを常に表示する。
ライセンスと改変内容の一覧はリポジトリ直下の `THIRD_PARTY_NOTICES.md` にまとめている。

## やらないこと

- 非公開または無防備なカメラの収集
- 映像・画像の中継、保存、録画、再配信、切り出し、拡大
- 提供元の広告、ロゴ、プレーヤー表示の除去や遮蔽
- 閲覧履歴の保存、アカウント、コメント、個人の特定につながる機能
- 実行時の Overpass API への問い合わせ
