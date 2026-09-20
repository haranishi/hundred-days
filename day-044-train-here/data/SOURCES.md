# データとモデルの出典

## 駅の代表位置（Wikidata / CC0）

59駅の座標はWikidataの構造化データP625を2026-09-20に取得しました。
[ライセンス方針](https://www.wikidata.org/wiki/Wikidata:Licensing)に従いCC0で利用しています。
小数点以下4桁に丸めた代表位置で、ホームや線路の実測位置ではありません。
記事本文、画像、地図タイルは取得していません。

各駅の項目ID・取得した版番号・経緯度は [station-coordinates.js](../lib/station-coordinates.js)。
版の参照URLは `https://www.wikidata.org/w/index.php?title=項目ID&oldid=版番号` です。
取得手順はリポジトリ内の `tools/station-source.mjs` に残しています。
利用時の外部問い合わせはなく、同梱座標から描画します。

## 路線・街並み・デモ

駅名・路線順序の事実関係は [JR東日本の路線案内](https://www.jreast.co.jp/multi/route_maps/) を参照。
路線図画像や公式ロゴの転載はしていません。
山手線以外の4路線は都心側の一部区間を扱います。
線路形状・川・公園・建物・車両・駅の屋根は独自の簡略モデルです。
実測の線形・高さ・実在建築物の精密モデルではありません。
外部の地図タイル、PLATEAU、Blenderファイル、第三者の車両モデルは同梱していません。
未確認の東京タワー・東京スカイツリーのモデルと名称は公開版から外しました。

48編成は独自の架空サンプルです。実ダイヤ・実際の運行ではありません。
ODPTデータは取得・再配布していません。公開APIは常に無効です。
将来用の中継処理のテスト応答もすべて合成データです。

## 描画ライブラリ

[Three.js](https://threejs.org/) 0.186.0（MIT License）を固定して自己配信しています。
OrbitControlsとRoundedBoxGeometryを含むコードは `vendor/three.js` にまとめています。
ライセンス全文は [LICENSE-three.txt](../vendor/LICENSE-three.txt)。
動画・音源は同梱していません。画面写真はこのアプリのデモ画面です。
