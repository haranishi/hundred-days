# 契約2: 3D描画（担当B・Grok／担当C・Antigravity）

見た目の方針は visual-direction.md。木の骨格（Skeleton）の形は `lib/contract.js` と interfaces-core.md。
three.js は `../vendor/three.js`（r186）を `import * as THREE`。**r186 では PCFSoftShadowMap が廃止**（PCFShadowMap に読み替えられる）。影は `PCFShadowMap` か `VSMShadowMap`。
外部の画像・書体・音・3Dモデルは使わない。質感は canvas 2D で描いて CanvasTexture にする（flipY と colorSpace=SRGBColorSpace に注意）。`lib/noise.js`・`lib/rng.js` を使う。
形（ジオメトリ）を作る関数は DOM を使わず、Node で試験できる。質感だけが canvas を使い、`createCanvas(w,h)` を引数で差し替えられる（既定は document.createElement）。

## 担当B: lib/view3d.js ほか
```js
createView3D(THREE, canvas, { gfx, reducedMotion, seed, createCanvas }) → View        // async 不要。gfx: 'high'|'low'|'test'
View.setSpecies(id)                       // 葉の質感・樹皮・葉の大きさを切り替える
View.setSkeleton(skel, { animate })       // 幹・枝・針金・葉を作り直す。animate=true なら fresh>0 の節を 0.9 秒で生やす（動きの軽減では即時）
View.setLook(look, { animate })           // 葉の量・色・花・芽・落ち葉の量。連続して変わる。animate は 0.6 秒の補間
View.setHighlight({ nodes, tone } | null) // nodes は skel の節の添字。tone: 'cut'|'bend'|'pinch'|'select'。色だけに頼らず、太さ・明るさ・脈動も変える
View.setPot(id) / setLight(id) / setMoisture(m)   // pot・light は contract の ID。光の切り替えは 0.6 秒
View.dropBranch(oldSkel, removedIndices)  // 切った枝が落ちて消える動き（約0.9秒）。動きの軽減では出さない
View.burst(kind, [x,y,z])                 // 'snip'|'pinch'|'water'|'sparkle' の小さな粒の演出
View.camera = { get(), set(partial, { animate, ms }), reset({ animate }), pickRay(clientX, clientY) → { origin, dir }, pxToWorld(distance) → 世界の長さ/CSSピクセル, project([x,y,z]) → { x, y, visible }, fit(bounds, { animate }) }
//   get/set の形は { az, pol, dist, target:[x,y,z] }（度）。CAMERA_DEFAULT・CAMERA_LIMITS の範囲に収める
View.requestRender() · resize(cssW, cssH, dpr) · dispose()
View.capturePhoto({ width = 1080, height = 1350, caption: { title, subtitle } }) → Promise<Blob>   // 操作部なしの1枚。木が画面にちょうど収まる。下に和紙の帯と題字・日付・朱の落款
View.stats() → { triangles, drawCalls, cards, fps }
```
- 描画は、必要なときだけ（要求がある・動きが続いている間だけ requestAnimationFrame を回す）。止まっている間は何も描かない。
- 品質：`high`＝dpr≤2・影2048・葉は1パッド22枚／`low`＝dpr≤1.25・影1024・12枚／`test`＝dpr=1・影なし・粒なし・4枚・自動の動きなし（CIのソフトウェア描画用）。
- **木の幹**：チェーンごとに、節の終点を通る滑らかな曲線（centripetal Catmull-Rom）に沿って管を作る。向きの枠は平行移動（ねじれない）。断面は幹・主枝8角、副枝6角、小枝5角。r0→r1 の先細り。頂点色で、根元・枝の付け根・下側を暗く、上側・先を明るくして、擬似の影を付ける。UV は周方向 u・長さ方向 v（v は長さ/(2πr) で伸びない）。樹皮は canvas で描く。根の張り（根張り）を根元に5〜7本、種から決まった形で足す（土から出た部分だけ）。CUT の節は、先に淡い木色の切り口を付け、scarAge が増えると樹皮の色へなじむ。針金は skel.wires に沿った銅色のらせん（細く・金属感）。
- **葉**：pads ごとに、扁平な楕円体（高さは幅の0.55）の中に葉の板（カード）を `density×半径` に応じて置く。カードは外向きで、法線は「パッドの中心から外向き」に寄せて、塊としてやわらかく陰影が付く。InstancedMesh、alphaTest、両面。look.coverage に応じて、カードごとの固定のしきい値で出し入れし（なめらかに縮む）、look.color↔color2 を乱数で混ぜる。中心ほど暗く（擬似の陰）。紅葉＝掌状の葉の房／黒松＝針の束の扇／梅＝葉＋五弁の花（look.flower）。look.bud は芽の淡い色と小ささ。上限は高画質で6000枚、全体の三角形は20万以下。
- 骨格が変わるたびの作り直しは、節2000で25ms以内（開発機）を目標に、バッファを使い回す。
- 試験：`tests/render/*.test.mjs`（置くだけで走る）。Node で、見本の骨格（`tests/fixtures/sample-skeleton.mjs`）から作ったジオメトリの頂点数・添字・NaNなし・範囲、葉の枚数と上限、しきい値の単調性、動きの軽減での即時反映を確かめる。

## 担当C: lib/diorama.js ほか（卓・鉢・土・苔・石・壁）
```js
createDiorama(THREE, { gfx, seed, createCanvas }) → Diorama
Diorama.group            // 卓・鉢・土・苔・石・壁。view3d が scene に足す。影は受ける・落とす
Diorama.treeAnchor       // 木を据える所。ここが土の面（y=0）。鉢の中心は anchor から -info.treeOffset
Diorama.setPot(id) · setMoisture(m 0..1) · setLook(look)   // 土の色の濃さ／壁・卓の色味を季節でわずかに（苔は常に緑）
Diorama.update(dt) · dispose()
Diorama.info = { soilRadius, potTopY, tableY, wallZ, treeOffset:[x,0,z] }
```
- 鉢：`oval-brown`＝楕円・無釉の茶・外形 2.9×2.1・高さ0.55／`round-blue`＝丸・藍の釉薬・直径2.3・高さ0.8・やや反った口縁／`rect-grey`＝長方・灰の釉薬・2.8×1.9・高さ0.45。足つき・縁・内側の土の段差を作る。釉薬は PBR（光沢・わずかな環境の映り込み）。
- 土は暗い粒状の質感、その上に苔（細かい塊の起伏と色むら・常に緑）、小さな石を2〜3個。木の根元は土の面（y=0）。
- 卓：木の低い台（6×3.6・上面は鉢の底）。木目は canvas のノイズで描く。壁：卓の後ろ（z=info.wallZ）に和紙（繊維のノイズ・わずかな色むら）。幅14・高さ10。
- 視点（既定）からの見映え：鉢が木に対して小さすぎず（鉢の長さ ≒ 木の高さの0.7〜0.9）、木の根元が鉢の中に収まること。
- 試験：`tests/render/diorama.test.mjs`（置くだけで走る）。Node で、各鉢のジオメトリの頂点数・範囲・NaNなし、info の整合、3種の鉢の差、setPot の往復でリソースが増えないこと。
