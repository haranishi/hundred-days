# R3 調査途中メモ

確認日：2026-11-10。調査のみ。ブラウザ・サーバーの起動、Git操作、実装は行わない。
表記：〔事実〕公開資料で確認、〔解釈〕資料からの判断、〔提案〕本ゲームの設計案。
過去のALPINE FLOW関連ノートを参照したが、本依頼の4〜8km・三人称・実写志向を優先する。

## 1. レンダラーとブラウザ

- 〔事実〕r187は10月30日公開。タグ内package.jsonは0.187.0。npmのdist-tagは未照会。
  https://github.com/mrdoob/three.js/releases/tag/r187
  https://raw.githubusercontent.com/mrdoob/three.js/r187/package.json
- 〔事実〕公式手引きはWebGPURendererを依然experimentalと説明。WebGL2自動fallback、`forceWebGL`、TSLのWGSL/GLSL変換を確認。ShaderMaterial/onBeforeCompile/EffectComposerの直接移植は不可。
  https://threejs.org/manual/pages/webgpurenderer
- 〔事実〕r187でrender target破棄、depth-only target、shadow更新、BatchedMeshの影・sortなど修正。移行ではPMREMのcube target化、TSL型変換変更がある。r188の変更を混ぜない。
  https://github.com/mrdoob/three.js/wiki/Migration-Guide#186--187
- 〔事実〕Chrome/Edge Mac・Windows等は113以降。AndroidはChrome121・Android12以上のARM/Qualcomm/Intel、Imaginationは139・Android16以上。全GPU対応ではない。
- 〔事実〕Firefox Windows141、Apple Silicon Macは145（macOS26+）/147（対応macOS全体）。Intel Mac/Linux/Androidは同資料では一般提供でない。
  https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
  https://www.firefox.com/en-US/firefox/147.0/releasenotes/
- 〔事実〕Safari26はmacOS/iOS/iPadOS等にWebGPU出荷。実装表はmacOS Tahoe26等を明記するため、Safariの番号だけで古いOS対応を判断しない。
  https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- 〔提案〕新規開発はWebGPURenderer+TSLを第一候補。WebGL2で成立する描画を最低条件としcompute等は上位画質専用。両backendの実機確認が採用条件。

## 2. 広域地形

- 〔事実〕CDLOD（2010）は四分木と距離依存の連続LODを組み合わせる。四分木タイルとCDLODは排他的な分類ではない。
  https://raw.githubusercontent.com/fstrugar/CDLOD/master/README.md
- 〔事実〕geometry clipmaps（2004/2005）は移動する入れ子の格子と頂点テクスチャ参照。高さ・法線のlevel間補間を行う。
  https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry
- 〔事実〕three.jsのCDLOD例：nickyvanurk/cdlodは16km、共通格子の頂点morph、GPU手続き地形をREADMEで説明。tschie/terrain-cdlodはMIT。最終commit日は追加確認中。
  https://raw.githubusercontent.com/nickyvanurk/cdlod/main/README.md
  https://github.com/tschie/terrain-cdlod
- 〔提案〕四分木タイル＋CDLOD型morph、近景1〜2m、タイル間高さ共有と1段以内のLOD差。skirtだけで雪の稜線を隠さない。physicsは同一高さ配列・同一三角形分割を使いGPU readbackを避ける。地形法線は高さ差分、微細雪法線は別レイヤー。

## 3. 雪材質

- 〔事実〕SIGGRAPH2015のSparkly but not too Sparklyはjittered 3D gridと距離全域のalias対策が中心。点を無作為に白くするだけでは安定しない。
  https://www.advances.realtimerendering.com/s2015/index.html
- 〔事実〕Batman資料は空色によるSSSの近似、法線のreoriented blendingを説明する。
  https://colinbarrebrisebois.com/wp-content/uploads/2022/06/gdc2014-deformable_snow_rendering.pdf
- 〔提案〕空光と露出→大中小の法線→粗さ→岩境界→限定的な逆光透過→最後にglintの順。青い日陰は空光と直射の遮蔽から作る。距離で微細法線とglintを粗さへ統合する。

## 4. シュプール・変形

- 〔事実〕Batman（GDC2014）は下面からのorthographic capture→filter→ping-pong accumulation。consoleはrelief mapping、PCはDX11 tessellation。PC手法をWebに直結させない。
  https://colinbarrebrisebois.com/wp-content/uploads/2022/06/gdc2014-deformable_snow_rendering.pdf
- 〔事実〕Rise of the Tomb Raider（SIGGRAPH2015）の概要は、動的高さマップ＋tessellationを説明する。1ページの講演概要でありフルスライドではない。
  https://history.siggraph.org/wp-content/uploads/2022/10/2015-Talks-Michels_Labs-R_D-Rendering-Techniques-in-Rise-of-the-Tomb-Raider.pdf
- 〔事実〕God of War Ragnarökの雪再設計講演（GDC2023）を確認。スライドPDFは403で未読。Horizon/RDR2の雪変形の一次資料本文はまだ未確認。
  https://www.gdcvault.com/play/1028917
- 〔事実〕Daniel Hanák本人の技術説明はFrozen Wildsを基にした別実装で、移動窓・persistent heightmap・差分法線を説明する。Guerrilla本人の資料ではない。
  https://danielhanak.com/
- 〔提案〕64m/2048²=3.125cm、mobile32m/1024²=3.125cm。整数texelで窓を移動し新露出帯をclear。軌跡点列をCPUで保持して再進入時に再描画。1〜2m格子では細溝を頂点で出せないので法線主体、必要なら足元のみ細密化。
- 〔事実〕three.jsのGPUComputationRendererはfloat texture ping-pongの汎用部品で、雪専用ではない。three.jsで移動窓・長期保持までそろった雪変形完成例は未確認。
  https://threejs.org/docs/pages/GPUComputationRenderer.html

## 5. 光・空

- 〔事実〕WebGLRendererはCSM、WebGPURendererはCSMShadowNode。r187公式例のimportも確認。
  https://threejs.org/docs/pages/CSMShadowNode.html
  https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_shadowmap_csm.html
- 〔事実〕Sky/SkyMeshはPreetham系の空背景。地形全体の大気遠近を自動的に解くものではない。
  https://threejs.org/docs/pages/Sky.html
  https://threejs.org/docs/pages/SkyMesh.html
- 〔事実〕Hillaire（2020）は低次元LUTと多重散乱近似による空・大気遠近。出版社の抄録を確認、著者PDFは容量制限で未読。
  https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.14050
- 〔提案〕まずSkyMesh＋高度/距離霧＋同じ空を焼くPMREM。太陽・空・露出を一元化。低い太陽は暖色の直射と青い空光、影は近距離だけ2〜3cascade。雲は遠いdomeと影maskから始める。

## 6. ポストエフェクト

- 〔事実〕`PostProcessing`はr183以来deprecatedで、r187でも`RenderPipeline`への互換wrapper。依頼文の名称を補正する。
  https://raw.githubusercontent.com/mrdoob/three.js/r187/src/renderers/common/PostProcessing.js
- 〔事実〕TRAAはcolor/depth/velocityを受けMSAAを無効化する。r187例はmrt/output/velocity/traaとRenderPipelineを使用。
  https://threejs.org/docs/pages/TRAANode.html
  https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_postprocessing_traa.html
- 〔事実〕WebGL公式例にTAA/SSAO/GTAO/DOF/bloom、WebGPU公式例にAO/DoF/bloom/motion blur/TRAA/lensflare等を確認。pmndrs/postprocessingは別ライブラリ。
  https://threejs.org/examples/
  https://github.com/pmndrs/postprocessing
- 〔提案〕露出とtone mapping→AA→弱いbloomを基本。滑走中のDOF・過剰なmotion blur・色収差は既定OFF。TRAAは変形・風揺れ・カメラ切替の履歴処理まで検証して採用。
- 〔事実〕r186の透明Line2 resize障害#34600は#34612で完了、r187 milestone。未修正と記述しない。
  https://github.com/mrdoob/three.js/issues/34600

## 7. 木・岩

- 〔事実〕InstancedMeshは同geometry/material、BatchedMeshは共通materialと異なるgeometry。BatchedMeshの属性layout/indexの互換条件も確認。
  https://threejs.org/docs/pages/InstancedMesh.html
  https://threejs.org/docs/pages/BatchedMesh.html
- 〔提案〕樹種×LOD×空間cellでinstancingし遠方はmulti-view impostor。岩は共通atlasのbatch。LOD hysteresis、風の変位を影にも適用、雪maskは上向き法線＋風下・遮蔽＋高さblend。全山を1つのinstance群にしてcullingを失わない。

## 8. 粒子

- 〔事実〕公式Compute Snowは100k粒子例。Soft Particlesは深度との交差でspriteを薄くする例。雪山ゲームで100kを維持できる証拠ではない。
  https://threejs.org/examples/webgpu_compute_particles_snow.html
  https://threejs.org/examples/webgpu_particles_soft.html
- 〔事実〕2025年のmaintainer回答は、computeのindirect draw/atomics等がWebGL2と非互換と説明。「computeが全部自動移植される」「全く使えない」のどちらとも言わない。
  https://discourse.threejs.org/t/tsl-and-webgl2-vs-webgpu/87974
- 〔提案〕雪煙量は速度×edge/slip×粉雪係数、接地時のみ。軽量版はspawn属性＋時間による頂点計算、上位版はstorage buffer compute。降雪はカメラ追従箱、地吹雪は地面付近の帯。mobileは粒子数より透明pixelの重なりを抑える。

## 9. 性能

- 〔事実〕WebGLではfloat textureのsample可能とrender可能は別。MDNはfloat RT拡張、back buffer縮小、VRAM予算、batch、同期回避を推奨。
  https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- 〔事実〕#30560は2025年r173の大量非instance mesh/UBO問題で現在Open。r187の同じfpsを示す再測定はない。
  https://github.com/mrdoob/three.js/issues/30560
- 〔提案・未実測〕PC 1080p/100〜250主pass draw/100〜250万tri、mobile高900p以下/60〜120draw/40〜90万tri、低540〜720p/30〜80draw/15〜40万triを初期予算。shadow追加負荷を別集計。16.67ms/33.33msに収まるか実機p95で判断。
- 〔計算〕8km²ではなく8km四方：8000² samplesのR16高さだけで約128MB、mip付き約171MB。全山常駐よりtile streaming。100km/h=27.8m/s=60fpsで0.463m/frame。

## 10. 先行例・OSS

- 〔事実〕SnowRushはthree.js/Rapierの三人称low-poly snowboard、READMEはMIT（モデルは別license）。実写の到達例として扱わない。
  https://github.com/xingyezn/SnowRush
- 〔事実〕SNOWFLOWはBabylon.js/WGSL/WebGPUの別renderer系。局所変形の参照候補で、mobile/WebGL fallbackの実証にはならない。
  https://github.com/Ditto190/snowflow_demo_webGPU_unreal5
- 〔事実〕THREE.TerrainはMIT、地形生成・blend・散布が中心。iTownsはMIT OR CeCILL-BのGIS framework。r187/TSL対応を一括で保証しない。
  https://github.com/IceCreamYou/THREE.Terrain
  https://github.com/iTowns/itowns
- 〔未確認〕CDLOD2件の最終commit日はGitHub本文・履歴で取得できず。更新日をcrawl日から捏造しない。iTownsのorganization表示は2026-10-28、THREE.Terrainのtopic表示は2026-09-17（commit日とは区別）。
  https://github.com/itowns
  https://github.com/topics/terrain?l=javascript

## 最終照合

- 〔事実〕SnowSystemThreeJSのMIT・降雪instance・積雪材質を本文確認。持続する雪面変形の実装とは扱わない。
  https://github.com/achrefelouafi/SnowSystemThreeJS
- 〔事実〕pmndrs/postprocessingの確認時mainは6.39.6、Zlib、peerのthree範囲は>=0.168.0 <0.188.0。npm latestとは区別。
  https://raw.githubusercontent.com/pmndrs/postprocessing/main/package.json
- 〔事実〕nickyvanurk/cdlodのpackageはthree ^0.155.0。r187/TSL互換は未確認。
  https://raw.githubusercontent.com/nickyvanurk/cdlod/main/package.json
- 検索は34クエリ。取得失敗したPDF/ソースを根拠にせず、講演概要・本人インタビュー・公式タグを使った。未確認箇所は最終報告6章へ明示。
- 日本語lintを実行したがSudachiPy未導入で起動不可。環境に依存を追加せず、スキルの手動チェックリストで常套句・主述・数字・事実/提案の境界・見出しを点検した。
- 判断：事実/提案ラベルと技術用語の反復は追跡可能性のため残す。表の短文は比較のため残す。描画予算・解像度・roughnessは実測値に見えないよう提案と明記した。
- 最終報告は199行（上限250行）。コード実装、ブラウザ/サーバー起動、Git操作は実施していない。
