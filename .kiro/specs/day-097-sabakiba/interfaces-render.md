# 契約: 材質と3D表示の統合（担当 WP-B 材質・WP-I 統合）

## 材質 `lib/materials.js`（WP-B）
`createMaterials({species, quality, textureSize})` → `{ kinds:{skin, flesh, cap, bone, organ, eye, fin, kidney, board?}, setIncisions(list), setProgress(key,v), setScale(v), setScutes(v), setXray(v), setSpeed(t), update(dt), dispose() }`
`buildFishModel` の `materialFactory` へ渡す（`kinds[kind]` を部品が使う）。魚の `look`（色・模様・うろこ・身の種類）から作る。**テクスチャは Canvas に頼らず**、純JSの画素生成（`Uint8ClampedArray`）→`THREE.DataTexture`（Node で試験でき、同じ入力なら同じ画素）。外部画像・外部フォントなし。
- **皮 `skin`**（`MeshPhysicalMaterial`＋`onBeforeCompile`）：色テクスチャ（u=s・v=φ/2π）に、背の濃い色→体側の銀→腹の白のカウンターシェード・種ごとの模様（`look.patterns[]`：側線・点の列・波状の縞・斑点・ヒレの色）。うろこ＝画素幅で積分した六角のうろこの法線＋鱗の光（`setScale(0..1)`。0で消える）。ぜいご＝側線の後半の小さな硬い板（`setScutes`）。濡れた艶（クリアコート。`light` では切る）。内側の面（`!gl_FrontFacing`）は淡い銀。
- **切り込み**：`setIncisions([{points:[[x,y,z]..FLF], progress(0-1), through}])`。点列を `DataTexture`（最大12本×32点）に詰め、皮・身の外側・頭・骨の皮の帯のフラグメントで、FLF の位置から折れ線への距離を測り、`progress` の弧長まで暗い溝（幅0.05〜0.09cm・縁に薄い明るい唇・中は暗い赤）を描く。法線をわずかに傾けて凹みに見せる。部品が動いても、物体空間（FLF）で描くので線がついてくる。
- **身 `flesh`**：`look.flesh`（white 淡い桃白／pink 桃／red 深い赤）。切り口（`aSeg` 1・2）に筋節の「く」の字の縞（FLF の位置から。間隔≈体高の7%）・**血合い**（暗い赤の帯。側線の高さ・背骨のそば・S面で厚い）・薄い透け・濡れた艶。外側の身（`aSeg` 4）は滑らかな生の艶。`cap`（`aSeg` 3）は、身の輪＋中央の白い椎体の円＋脊髄の小さな点＋下の血合い。
- **骨 `bone`**：象牙色・細かい雑音・わずかな透け。**内臓 `organ`**：光沢のある桃・赤紫・銀（鰾）・頂点色で部位を分ける（`color` 属性）。**目 `eye`**：虹彩のリング・瞳・ハイライト（透明感）。**ヒレ `fin`**：膜に放射状のすじ・半透明・両面。**背わた `kidney`**：暗い赤の帯。
- **透視 `setXray(0..1)`**：皮を `alpha` で透かす（最小0.18・縁に淡い輪郭）・身を半透明・骨と内臓を明るく。順序づけは `depthWrite:false`＋`renderOrder`。
- 品質：`high`＝全部。`standard`＝うろこの法線を簡易・テクスチャ512。`light`＝クリアコートなし・うろこは色だけ・テクスチャ512・雑音を減らす。
- 試験（Node）：生成が決定的・`kinds` が揃う・uniform が存在する・`setIncisions` が上限を超える入力で落ちない・全 `quality` で作れる・画素生成のハッシュが同じ。目視は `tools/geometry-view.html` で行う。

## 3D表示の統合 `lib/scene-fish.js`・`lib/guides.js`（WP-I）
`createFishScene(opts)`（interfaces-app.md の形）。`lib/view3d.js`（描画ループ）・`lib/stage.js`（まな板・光）・`lib/pieces.js`（魚）・`lib/materials.js`・`lib/timeline.js` を束ねる。
- **状態の反映**：`stateAt` の結果を毎フレーム適用する。魚の置き方（`pose`）は魚のルートへ。各部品は、親子（`PIECE_PARENT`）を辿って「自分の動き（盤の座標系）」を合成する：`M_local = P⁻¹·A·P`（P＝置き方、A＝盤の座標系での動き。回転の中心は部品の `pivot`）。visible は親が消えれば消える。不透明度は部品ごと。
- **`slitOpen`**：左右の身（`L.dorsal`・`R.dorsal`）を、背の正中線を軸に ±(slitOpen×7°) 開く（本のように）。腹腔の中の内臓・背わたが見える。
- **包丁**：`state.knife` があれば `buildKnife(tool)` を `knifePose` の位置・向きに置く（FLF→持ち主の動き→置き方）。刃の先に朱の小さな光。
- **切り線の光 `guides.js`**：`highlight`・`cuts` のカーブを、流れる点線のリボン（朱・矢印の向き・点が進む）として描く。内側の線（`inner`）は、透視（または `through`）のとき `depthTest:false` で見せる。切り終えた線は消す（切り込みが残る）。**手の印**（`hands`）：青い輪＋手のシルエットのスプライトと短い文字。**ラベル**（`labels`）：アンカーに付く札（DOM の絶対配置か Sprite。左利きの反転で文字が裏返らない）。
- **効果**：`scales`（うろこの粒が舞って落ちる・InstancedMesh・決定的）・`water`（水の粒）。**カメラ**：`state.camera` のプリセットと focus に、`rig.applyPreset`（ユーザーが触ったあとは自動追従しない）。
- **左利き**：`setLeftHanded(b)` で `view3d.setMirror(b)`。ラベルの文字は反転させない。
- **画質**：`gfx` の段に応じて `buildFishModel({quality})` と `createMaterials({quality})` を作り直す。破棄は `dispose()` で全部（リーク試験）。
- **フック**：`?debug=1` で `window.__sabaki` に `{state(), goto(sp, step, u), model, anatomy, stats()}`。`ready` が resolve したら `body[data-ready="true"]`。
- 試験：Node で作れる範囲（部品の変換の合成・親子の visible・`slitOpen` の角度・包丁の位置が curve 上）。描画は親が撮る。
