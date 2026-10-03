# 配信に含める第三者コード・検索画像

ライブラリの実配布LICENSEと原典を確認し、本文を改変せずに同梱する。

|対象|著作者・出典|許諾全文|
|---|---|---|
|three.js 0.186.1（BoxGeometry・GLTFLoader・CSM・Reflectorの手順を含む）|three.js authors|[MIT](three.txt)|
|postprocessing 6.39.5|Raoul van Rüschen|[Zlib](postprocessing.txt)|
|n8ao 2.0.1|N8python|[CC0](n8ao.txt)|
|SMAAのGLSL・検索画像|Jorge Jimenezら（詳細は同梱声明）|[MITと補足](SMAA.txt)|
|ブルーノイズ|Christoph Peters、Calinou/free-blue-noise-textures経由|[CC0声明](BlueNoise.txt)|
|ACES fittedのGLSL移植|Stephen Hill、BakingLab（MJP / David Neubelt）|[MIT](BakingLab.txt)|

n8aoのpackage.jsonはISCと記すが、同梱LICENSEとREADMEはCC0である。
この配信には、その実配布LICENSE全文をそのまま含める。

## 公開手法をもとに書いた処理

- GLSLハッシュと音生成の文字列ハッシュ：FNV-1aの数学的定義。
  [Fowler/Noll/VoほかのIETF文書](https://www.ietf.org/archive/id/draft-eastlake-fnv-34.html)（work in progress）。参考ソースコードの転載ではない。
- 擬似乱数：SFC32。公開者brycの[手法とpublic-domain声明](https://github.com/bryc/code/blob/master/jshash/PRNGs.md)。
- 種の混合：MurmurHash3の定数と手順。Austin Applebyの[public-domain声明](https://github.com/aappleby/smhasher/blob/master/src/MurmurHash3.cpp)。
- カメラの平滑化：臨界減衰ODEの解析解。参照実装の転載ではない。

## 合成音とモデル

怪獣のGLB・骨格・動きはBlenderスクリプト、ゲーム用の影絵はそのモデルから撮影した。
音は公開された音響式・係数と独自の旋律・数値計算から合成した波形で、第三者の録音サンプルは使っていない。
既存の合成済OGGは従前の雑音フィルターで生成した出力を維持する。
公開ソースのピンク雑音は独立した多段保持方式へ変更したため、再生成時は波形が変わる。
音の生成に使う双二次EQはRobert Bristow-Johnsonの公開係数、弦はKarplus–Strong、雑音の補正はPolyBLEP、太鼓は円形膜の振動の数学を参考にした。

仮題と旧表示名の変更は混同回避であり、法的な権利調査の完了・非侵害保証ではない。
