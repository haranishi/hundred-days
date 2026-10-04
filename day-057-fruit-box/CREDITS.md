# 素材と公開時の確認

2026-10-04に確認。個別案件の法的な適否を保証する資料ではなく、出典・許諾範囲と実装上の対応を記録する。

## 同梱コード

- Matter.js 0.20.0：Liam Brummitt、MIT。[公式リリース](https://github.com/liabru/matter-js/tree/0.20.0)、[ライセンス](vendor/MATTER-LICENSE.txt)。改変せず同梱し、著作権表示・許諾文を保存した。
- 元のゲームコード：本人の個人試作リポジトリ [suika-game](https://github.com/haranishi/suika-game) の `dd45e0b` を基に、本人の移植依頼に沿って取り込んだ。第三者のゲームからのコード取得は行っていない。
- 果物・箱・UI：Canvas/CSSによる描画。外部画像・公式キャラクター・ロゴは同梱しない。
- 音：`lib/audio.mjs` の新しい8小節のフレーズと合成効果音。既存ゲームの曲、録音、音声素材は使わない。
- 書体：端末のシステムフォント。フォントファイルを再配布しない。

## 名称と表現

[Aladdin Xの公式表記](https://www.aladdinx.jp/blogs/news) で「スイカゲーム」が登録商標と確認できたため、公開名は「夜店のくだもの箱」に変更した。顔のある果物キャラクターを除き、10種類の並び・得点・夜店の意匠と音楽を自分のコードで構成した。

[文化庁の解説](https://www.bunka.go.jp/seisaku/bunka_gyosei/kibankyoka/faq/index.html) はアイデアと表現を区別しているが、ルールが似ていることだけで全体の適法性を断定してはいない。公式の [動画投稿ガイドライン](https://suikagame.jp/guideline/) は公式ゲームのプレー動画向けであり、別ゲームを作る許諾とは扱わない。

## 利用するサービス

配信は既存100daysのCloudflare Pages。新しいAPI・アカウント登録・決済・アップロードは追加しない。ゲームの得点と音設定はlocalStorageにのみ保存する。結果の共有は既存100daysと同じX・LINEの共有URLと端末の標準機能を利用し、送信は利用者が共有先で操作する。
