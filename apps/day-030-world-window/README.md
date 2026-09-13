# Day 030 せかいのまど

世界の公開ライブカメラを地図から選び、その場所の映像・静止画・提供元ページを開くアプリ。
表示範囲の一覧、種別絞り込み、検索、ランダム選択、現地時刻と昼夜の推定、共有用の深いリンクを備える。

https://hundred-days.pages.dev/day-030-world-window/

## データの作り方

OpenStreetMap の `contact:webcam` を持つ地物を Overpass API からビルド時に一度取得し、URLの応答を
確認して `yt`・`img`・`hls`・`page` に分類した（2026-09-05 取得・9,631件）。到達できないURL（404・DNS失敗）
464件、メール形式の誤入力やクエリに鍵らしき値（`token=` など）を含むURL 16件、公開前チェックに掛かる1件を除いた
同梱データは **9,151地点**。内訳は映像（YouTube）141、画像2,086、HLS 84、リンクのみ6,840で、国別では米国、
フランス、ドイツが多く、日本は86件しかない。実行時に Overpass API は呼ばない。

画像が応答の実測（2,665件）より少ないのは、埋め込みを許していない提供元4ホストぶん579件を
リンクのみへ落としているから（→「提供元の条件」）。

国名は Natural Earth 1:50m Admin 0 Countries との点内多角形判定から付けた。生成手順は `tools/`、
ブラウザ用の圧縮済み結果は `data/cameras.json` と `data/countries.json` に置いている。

```sh
node apps/day-030-world-window/tools/fetch-osm.mjs    # Overpass から1回取得（キャッシュがあれば再取得しない）
node apps/day-030-world-window/tools/probe-urls.mjs   # 全URLの種別を実測（ホストごとに直列・約45分）
node apps/day-030-world-window/tools/build-data.mjs   # 同梱JSONを生成
```

直読みを止めたい提供元は `tools/exclude-hosts.txt` にホスト名を足す（種別が `page` に落ち、地点は地図に残る）。
地点ごと外すなら `tools/exclude-ids.txt` にIDを足す。どちらも `build-data.mjs` を再実行すると効く。

## 提供元の条件

`<img>` で提供元から直接読める画像は、応答を実測した時点で2,665件・230ホストあった。埋め込みに条件を付けている
提供元が実際にあるので、条件のほうに合わせて作りを変え、条件を満たせないホストは落とした（残り2,086件）。

- **画像そのものが提供元へのリンク**。押すと OSM の `website`（無ければカメラのURL）が新しいタブで開く
- **提供元のホスト名を画像のすぐ下に出す**。そのまま読めて、押せば提供元へ行く
- 再取得は60秒ごとだが、**詳細を開いていて、かつタブが見えている間だけ**

きっかけは foto-webcam.eu（215件）の Nutzungsbedingungen で、画像から元ページへのリンクがあることと、
出典がはっきり読める形でクリックできるリンクとして示されていることを、埋め込みの条件にしている。
上の2つはこの条件に合わせたもので、同じ条件を置く他の提供元にもそのまま効く。

件数の多い上位12ホスト（直読みの79%）を調べた結果は `tools/PROVIDER-TERMS.md` に、確認したURL・逐語引用・
確認日つきで残した。**条件を見つけられなかったものは「見つけられなかった」と書いてある**（読めなかったものを
「使ってよい」と書かない）。許可が見つからなかっただけのホストは、扱いを変えていない。

条件を満たせないと分かった4ホスト579件は `tools/exclude-hosts.txt` に入れ、リンクのみへ落とした。
trafficnz.info（NZTAは複製の許可を「photography and imagery」に及ぼしていない）、ctroads.org（framing 等を
書面同意なしに禁止）、hak.hr（許諾なしの複製・公表を禁止）、tirol.gv.at（個人利用を超えるなら事前申請が必要。
単なるリンクは自由と明記されているので、リンクのみなら条件を満たす）。

`http://` のURLは直読みしない。ブラウザが混在コンテンツとして止めるので、ビルド時に `page` へ落としている
（同梱データの739件はすべてリンクのみ。リンクなら http でも開ける）。

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
