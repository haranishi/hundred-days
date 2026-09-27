# 作品・解説・3D素材の出典

確認日：2026-09-27。シカゴ美術館（Art Institute of Chicago）の公式APIで作品ID、年代、作者、公開画像の権利を確認した。

## 作品と解説
収録は30点。初版9点に、ルノワール、モリゾ、ドガ、レンブラント、ボッティチェリなど21点を追加。
各作品の出典URLは `artworks.js`、追加解説は `additional-artworks.js`、全ID・画像取得先・権利は `image-manifest.json`。
- [公式API](https://api.artic.edu/docs/)：画像・基本メタデータは[CC0](https://creativecommons.org/publicdomain/zero/1.0/)。
- `description` は[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。原著者はArt Institute of Chicago。
- 本アプリは作品解説を日本語で要約・編集した。原文の全文は同梱しない。
- 「もう一度、絵を見てみよう」の鑑賞の問いかけは本アプリで追加した。
- 目的を裏付けられない作品は「表現の特徴」と区別する。
- 公式IIIFが取得制限中のため、同じ所蔵番号・作品IDを確認できたWikimedia Commonsの縮小画像を同梱。原画像とライセンスへのリンクはmanifestに記録する。
- Commons画像はCC0と一括せず、各ファイルが表示するPublic domain等の権利情報を記録した。
- 公式image_idは照合用の参照値。Commons画像が現行IIIFと画素単位で一致するという意味ではない。
- 北斎の提供PNGは左右に黒帯がある。ファイルは未改変とし、描画時だけ黒帯を除いた全図を使う。他の画像は全図を使う。

## 展示空間
- [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)：CC0 1.0。
  `benchCushionLow.glb`、`pottedPlant.glb`、`lampRoundFloor.glb` を未改変で同梱。配置・縮尺のみ実行時に調整。
  配布アーカイブの `License.txt` を `assets/models/` に同梱。
- [Three.js](https://threejs.org/) 0.186.0：MIT。既存Day047のGLTFLoader入りバンドルとMIT全文を複製。
- 額縁・展示壁・床・採光の形状は本アプリのコードで作成。実在の美術館の再現ではない。

## 保存と通信
画像・3Dモデル・コードは同一オリジンから取得する。
外部サイトへの通信は、利用者が所蔵館・クレジット・共有リンクを開いたときだけ。
鑑賞履歴と最高得点は端末内保存で、外部へ送らない。
