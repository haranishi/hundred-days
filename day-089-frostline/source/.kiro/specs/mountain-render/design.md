# Design: mountain-render

## Overview
山のデータを読み、地形・空と光・影・木と岩を three.js（WebGPURenderer と TSL）で描く。器（game-shell）の `view` として差し込まれ、
滑走者や雪煙（ride-feedback）が後から系を足せる口を持つ。

- **Goals**: 6km四方を継ぎ目なく毎秒60コマ。描いた雪面と問い合わせの高さが一致。夕方の光で起伏が読める。3つの画質の段。
- **Non-Goals**: 滑走者、滑走中のカメラ、雪煙、跡、音。雪の質感の作り込みと遠景は snow-look で扱う。

## Boundary Commitments
- **This Spec Owns**: `src/render/`（`ride/` を除く）、`tests/render/`、`src/view-entry.js`
- **Out of Boundary**: `src/render/ride/`（ride-feedback）、`src/world`・`src/sim`・`src/core`・`src/ui`
- **Allowed Dependencies**: `three`（`three/webgpu`・`three/tsl`・`three/addons`）、`src/world`、`src/core` の画質の段
- **Revalidation Triggers**: 差し込み口の形、地形の高さを読む TSL 関数、画質の段の項目、山のデータの形式が変わったとき

## 全体の組み立て
```
src/render/index.js            createMountainView()：器の view の形を満たす入口。系の登録と毎コマの順番を持つ
src/render/renderer.js         WebGPURenderer の作成・方式の判定・誤りの捕捉・大きさと画素比・後処理の組み立て
src/render/tiers.js            画質の段ごとの値（1か所に集める）
src/render/terrain/cdlod.js    区画の選び方（純粋な計算。Node で試験する）
src/render/terrain/texture-data.js  山の配列から、傾き・細かな法線などの配列を作る（純粋な計算）
src/render/terrain/textures.js 配列を GPU のテクスチャにする
src/render/terrain/height-node.js   高さを読む TSL 関数（頂点用の16点Bスプライン）。ほかの系も使う
src/render/terrain/terrain.js  区画の描画と、雪と岩の材質の土台
src/render/sky.js              空・太陽・環境光・霞
src/render/shadows.js          カスケード影と、焼いた日当たりの地図の合成
src/render/objects/shapes.js   木・樹氷・岩の形（手続きで作る。素材ファイルを使わない）
src/render/objects/scatter.js  移動に合わせた木と岩の出し入れ
src/render/debug-camera.js     確認用のカメラ（ドラッグで見回す）
```

## 差し込み口
```js
const view = createMountainView();
await view.init({ canvasHost, world, tier });       // 器が呼ぶ
view.context = { renderer, scene, camera, world, tier, sun: { dir, color }, heightNode, pipeline };
view.addSystem({ name, init(context), update(frame), setTier(tier), dispose() });   // ride-feedback が足す
view.setCameraController(controller);                // { update(frame, camera) }。無ければ確認用のカメラ
view.setTrailSource(source);                         // 雪面の跡のテクスチャ（ride-feedback が渡す。無ければ跡なし）
```
毎コマの順番は「系の update（滑走者・カメラ）→ 区画の選び直し → 影の更新 → 描画」。`frame.jumped` が真なら、時間方向の履歴を捨てる。

## 地形（CDLOD）
- 葉の区画は 24 m、段 L の区画は `24·2^L` m、根は段 8（6144 m）。1区画は 32×32 の格子1種類を、インスタンスで何枚も描く。
- 段 L を使う範囲は `range[L] = base·2^L`（`base` は段の値。高 70 m）。区画は、カメラとの距離が `range[L−1]` より近い部分を持つとき子へ分ける。
- 境目は頂点のモーフでつなぐ。距離が `0.7·range[L]`〜`range[L]` のあいだに、奇数番の頂点を親の格子の位置へ寄せ切る。
  高さは寄せたあとの XZ で読むので、寄せ切った頂点は親の区画の頂点と同じ位置になり、すき間ができない。
- 区画ごとの高さの最小・最大を、起動時に高さ配列から段ごとに作る（視錐台の判定と、距離の計算に使う）。
- インスタンスの属性は `(原点X, 原点Z, 一辺, 中央の高さ)`。数は毎コマ変わる（上限 1024）。
- 頂点の高さは `height-node.js` の TSL 関数で読む：大きな形・タイル・強さを、それぞれ `textureLoad` の16点で3次Bスプライン。
  CPU の `world.heightAt` と同じ式・同じ配列なので、差は浮動小数の誤差だけになる。
- 法線は頂点で作らない。画素ごとに、傾きのテクスチャ（大きな形 RG16F・2048²、タイル RG16F・256²、どちらも線形補間とミップ）から作る。
  区画の細かさが変わっても陰影が変わらない。近くだけ、細かな法線（手続きで作るタイル）を2つの尺度で足し、距離で弱める。

## 雪と岩の材質の土台
`MeshStandardNodeMaterial` の色・粗さ・法線を TSL で差し替える。岩の露出が高い所は岩の色と粗さ、境目は雑音で不規則にする。
雪質の違いは、新雪を明るく粗く、圧雪を中間、氷を暗めで滑らか（青み）にする。作り込み（きらめき・逆光の透け・風紋）は snow-look で足す。

## 空・光・影・霞
- 空は `SkyMesh`。太陽の向きは `world.meta.sun.evening`。空を小さな立方体のテクスチャへ描き、`PMREMGenerator` で環境光にする。
  霞の色も同じ立方体から、視線の向き（水平寄り）で取る。空・霞・環境光の色の出どころを1つにして、地平線の継ぎ目を作らない。
- 霞は `scene.fogNode`。高さとともに薄くなる霧を、カメラから画素までの区間で解析的に積分する。
- 太陽は平行光源1つ。影は `CSMShadowNode`（高 3段×2048・中 2段×1024・低 1段×1024）。`camera` を自分で代入しない（初期化が飛ぶ）。
- 山が落とす大きな影は、山のデータの日当たりの地図を `receivedShadowNode` で掛ける。カスケード影の届かない遠くも暗くなる。
- 後処理は `RenderPipeline`。高：速度つきの `pass` → TRAA → 弱いブルーム。中・低：FXAA のみ。色の変換は最後に1回。

## 木・樹氷・岩
形は起動時に手続きで作る（樹氷は雪の塊の重なり、木は幹と雪をのせた枝の段、岩は歪ませた多面体）。種類ごとに `InstancedMesh`。
カメラの周り（高 1200 m・中 800 m・低 500 m）の升（48 m）を対象に、`world.obstaclesNear` の結果を並べる。
升の出し入れは1コマあたりの時間の上限（2 ms）を守り、近い升から処理する。遠い木は簡単な形へ切り替え、切り替えは距離に幅を持たせる。

## 画質の段（`tiers.js`）
| 項目 | 高 | 中 | 低 |
|---|---|---|---|
| 画素の上限 | 1920×1200 相当 | 1600×900 相当 | 1280×720 相当 |
| 区画の格子・`base` | 32・70 m | 32・50 m | 16・40 m |
| 影 | 3段×2048・地形も落とす | 2段×1024・地形は焼いた地図だけ | 1段×1024・近くの物だけ |
| アンチエイリアス | TRAA | FXAA | FXAA |
| 木の範囲 | 1200 m | 800 m | 500 m |

## Error Handling
方式がどちらも使えない・山のデータの版が違う・装置を失った（device lost）ときは、`init` か `render` が理由つきの誤りを投げ、器が日本語で表示する。
WebGPU の未捕捉の誤りは `renderer.js` が集め、試験用の窓口の `errors` へ出す。

## Testing Strategy
- **Node**：区画の選び方（全域を過不足なく覆う・隣どうしの段の差が1以内・モーフ後の共有辺の頂点が一致・視錐台の外を選ばない）、
  傾きの配列（Bスプラインの解析微分と一致）、画質の段の値。
- **実ブラウザ**：起動の検査（WebGPU・WebGL2・WebKit で誤りと警告が 0）、高さの一致（GPU で読んだ高さと `world.heightAt` の差 2 cm 以内）、
  速さ（1440×900・高で 95% のコマが 16.7 ms 以内）、走り続けたときの木の出し入れ（CPU を6倍遅くして 33 ms を超えない）、固定の場面の撮影。
