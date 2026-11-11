# Prop v1：I16c 建物 / I16b 自然物

`npm run propgen` でモデル・全形の確認PNG・建物と橋の3方向・集落・40本の森の画像を約3秒で再生成する。
Node標準機能のみ。自然物の `--revision 1/2/3/4` と建物の比較周は独立。納品は自然物4・建物5。
建物の参考比較は `node tools/propgen/inspect-buildings.mjs 5`。refsはゲームデータに混ぜない。

## I16c 建物の受け渡し

- 新しい生成画像は `round-i16c-5-architecture.png`（山荘/a/b/c/橋 × 前/後/側/斜め上）と同接頭辞の `village.png`、`lodge-distant.png`（高さ60px、750px画面の8%）。保存先は `.agent-harness/runs/propgen/`。
- 比較は `i16c-round-5-comparison.png`。各周の判定は `.agent-harness/runs/impl/I16c_progress.md`。
- 接地する本体とcollision.sizeは46×19 / 10.7×8.5 / 12.2×9.85 / 13.7×10.15m。boundsは装飾込み。
- 山荘の主棟はX方向、中央妻と屋根窓はZ方向。小屋a/cはZ棟、bはX棟、cは小妻つき。
- 木・岩・橋・リフト・柵の頂点・法線・色・当たり・屋根面は従来のrevision4と一致。
- 山荘11,445、小屋2,086 / 2,566 / 2,347、全体27,060三角形。bin+JSONは2,220,830bytes。
- 灯りの窓は材質4の明るい頂点色。発光はデータ形式に無く、本番の照明に影響される。
- 屋根の交差部は閉じた屋根同士を内部で交差させる。roofPlanesは個別の近似平面で、交差部を切り抜いていない。滑走側は重なった面の上側を選ぶ必要がある。
- 以下のround-4画像・寸法の記述はI16b時点の記録。建物はこの節を優先する。

## 配置と材質

- m、+Y上、正面-Z、地面中心が原点。橋・柵の長軸X。屋根の棟は上記参照。
- `bounds.size` はX/Y/Zの描画外形。軒・雪・煙突・バルコニーを含み、依頼の本体寸法より大きい。
- `collision` は本体の目安。木は幹の円だけ。屋根や枝先全体を障害物にする数値ではない。
- `lift-tower.stretchAxes` のYだけを伸ばせる。Yスケール=目標高さ/9.975。法線には逆転置行列を使い、当たり判定の高さも変換する。横木・滑車も縦に変形するため、大きな伸縮では描画側の再調整を勧める。
- 他の形の非一様スケールは前提にしない。木のLODは高さと幹の原点を維持するが、枝の輪郭は変わる。切替距離やフェードは配置・描画側で決める。
- 色はsRGB。読込後は0〜1なので、照明前にlinearへ変換する。AOは0=開放、1=くぼみの遮蔽。法線は物体座標。
- 質感番号：0木、1石、2雪、3鋼、4硝子、5葉、6幹。硝子は不透明の面で、建物には青と暖色を混ぜる。
- 近景の雪は独立した閉じた小塊。中景・遠景の木は両面板。同じ面にもう1枚雪の絵を重ねる必要はない。
- 屋根面は雪の軒と棟の4隅を結ぶ平面を上向きの順に記録。中央の装飾雪は平面から最大約0.32m膨らむため、滑走面は近似。山荘10枚（主棟/中央妻/屋根窓2/玄関）、小屋a/bは4枚・cは6枚、駅2枚。座標変換後の四隅を滑走面へ渡す。
- 橋は16区間の折れ線。床上面は `1.0 + 2.2*(1-(x/11)^2)`、雪上面は `1.11 + 2.2*(1-(x/11)^2)` を各節点で結ぶ。
  地形へ重ねる床も、この節点から線形補間する。解析放物線との最大差は約0.009m。原点Yは石台の底。
- 椅子は足置き側が-Z。ロープ側へ置くには、上端の掛け棒（約Y=3.25）をロープへ合わせる。

## 読込例

```js
const data = readPropData(exactArrayBuffer, jsonObjectOrString);
const lodge = data.byName.lodge.near;
const treeMid = data.byName['fir-b'].mid;
// lodge.position / normal / color / material / ao / index
// indexは形ごとの0始まり。全形を単一Geometryへ再結合するなら頂点開始値を足す。
```

`prop-data.js` の公開関数は `readPropData` だけ。返却は `meshes, byName, materials, metadata`。
位置・index・materialは入力bufferのview。変更すると元bufferも変わる。normal/color/aoは復号したFloat32Array。
Node Bufferはそのまま渡さず `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)` とする。

## 形式

JSONの全体：format/version/byteOrder/units/axes/indexSpace/vertexCount/triangleCount/byteLength/materials/fields/attributes/meshes。
各mesh：name/lod/vertexStart/vertexCount/triangleStart/triangleCount/triangleLimit/bounds/collision/roofPlanes/stretchAxes、橋だけdeck。
.binはlittle-endianの属性別配列。全メッシュのposition(Float32×3) → normal(Int16×3) → color(Uint8×3) → material(Uint8) → ao(Uint8) → index(Uint32)。
各属性の開始は4byte境界、隙間は0。範囲の単位は頂点・三角形、offsetだけbyte。indexはmesh-local。
normalは32767、color/AOは255で割る。骨なし。JSONに時刻・絶対パスは含めない。

## 確認画像と限界

`.agent-harness/runs/propgen/round-4-architecture.png` は上から山荘/a/b/c/橋、列は前/後/横。
`round-4-all.png` はJSONのmesh順、左上から横に4枚ずつ。`round-4-village.png` は山荘1・小屋4・橋1・柵。
`round-4-<name>-<lod>-front.png` が単体。建物と橋はback/sideもある。
4回の観察・試験は `.agent-harness/runs/impl/I16b_progress.md`。

屋根雪の断面は7点。縁の丸みは多面体で、参考の細かい吹きだまりほど柔らかくない。木は分離した下垂扇と雪の塊。nearは角張り、mid/farの切替では輪郭差が残る。
石は粗い規則的な列。これは形の検査用Nodeラスタ画像で、ブラウザの材質・光・LOD切替は未確認。

## I16bの配置差分

- 高さはa=9m、b=15.5m（旧12.5m）、c=13m（旧16m）。高さから倍率を決めていた配置は再計算する。
- 近景外形X/Zはa約2.82/2.55m、b約3.60/3.32m、c約5.69/5.99m。枝先は障害物の幹半径へ含めない。
- 各LODとも下端と梢高は共通。近景・中景は8/10/9段。遠景は40三角形の交差板なので、近くへ切り替えない。
- 南東側の少雪はモデル座標の+X/+Z。ランダムなyawでは少雪側も回る。世界の太陽と常に一致する保証は無い。
- 屋根は雪の軒が左右へ最大25cm張り出す。建物本体・屋根面の項目名・collision契約は維持。
- `i16b-round-4-trees.png` は列a/b/c、行near/mid/far（各枠は個別に拡大）。高さの比較は森の絵で行う。
- `i16b-round-4-forest-eye.png` は地面+1.7mの透視、`forest-high.png`は遠方の俯瞰。`forest-comparison.png`は参考との比較。
- 再描画だけなら `node tools/propgen/forest-preview.mjs 4`。林の40本の配置・倍率・yawも種固定。ゲーム地形や本番の光は再現していない。
