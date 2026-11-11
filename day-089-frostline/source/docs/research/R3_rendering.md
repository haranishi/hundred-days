# R3：ブラウザ雪山の描画技術選定

## 1. 結論

〔提案〕土台は **three.js r187のWebGPURenderer＋TSL** とし、WebGL2 fallbackを最低動作条件にする。
〔事実〕公式は依然experimentalと明記しており、WebGPUだから速い・全機能がfallbackするとは言えない。[公式手引き](https://threejs.org/manual/pages/webgpurenderer)
〔提案〕四分木タイル＋CDLOD型morph、共通高さデータ、局所シュプール、近距離CSMを組み合わせる。
〔解釈〕実写感には、山の形・空光・大気遠近・雪の法線が、豪華なポスト処理より先に必要。
〔提案〕PCは1080p/60fps、スマートフォンは内部解像度を抑え30〜60fps。数値は未実測の設計目標。
〔事実〕r187の後処理は`RenderPipeline`が正式名。`PostProcessing`はr183以来の非推奨互換クラス。[r187ソース](https://raw.githubusercontent.com/mrdoob/three.js/r187/src/renderers/common/PostProcessing.js)
〔提案〕最初の採否判定はChrome Mac・Safari iPhone・Chrome Androidと`forceWebGL: true`で同一の小景を比べる。
〔提案〕この判定で必要な雪材質・RT・影が成立しなければ、WebGLRendererを採用する。別レンダラー二重実装は初期目標にしない。

対象：4〜8km四方、約100km/h、三人称主体・一人称切替。〔事実〕＝資料本文で確認、〔解釈〕＝資料からの判断、〔提案〕＝本ゲーム向け設計。以下の推奨表・予算・実装順はすべて〔提案〕。

## 2. 推奨構成

|項目|採用する手法|理由|捨てた案と理由|three.jsのAPI・確認した例|
|---|---|---|---|---|
|レンダラー|WebGPURenderer＋TSL、WebGL2最低画質|新規雪材質と将来のGPU処理を共通化|WebGLRenderer固定：新機能の中心がWebGPU側。GPU専用：旧iOS・非対応Androidを落とす|`forceWebGL`／[手引き](https://threejs.org/manual/pages/webgpurenderer)|
|広域地形|四分木＋共通格子＋CDLOD型morph|視錐台・高さ・配信単位を管理しやすい|全山等密度：頂点と配信が過大。clipmap：移動窓とデータ配信の実装負担|`MeshStandardNodeMaterial.positionNode/normalNode`／[r187地形例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_tsl_procedural_terrain.html)|
|高さ・衝突|CPU正本のタイル高さをGPUへ配信|接地と見た目の基準を共有|GPU地形の毎frame readback：同期負荷|[RenderTarget](https://threejs.org/docs/pages/RenderTarget.html)、地形例の高さ差分法線|
|雪|非金属PBR＋多尺度法線＋粗さ＋小さな逆光項|陰影を安定させ雪と岩を区別|全面glint・白一色・全面SSS：ちらつき、形状消失、費用|`MeshStandardNodeMaterial`／[地形例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_tsl_procedural_terrain.html)|
|シュプール|局所高さRT＋法線、CPU軌跡の再描画|限られた容量で跡を保持|全山cm高さ：巨大。デカールのみ：接近時の溝感不足|`RenderTarget`／[ping-pongの基礎](https://threejs.org/docs/pages/GPUComputationRenderer.html)|
|太陽・影|近距離2〜3cascade＋遠山の別の遮蔽表現|人物・木の接地感と山全体の陰影を両立|8km全体に高精細CSM：shadow passと解像度が過大|`CSMShadowNode`／[r187例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_shadowmap_csm.html)、WebGLは[CSM](https://threejs.org/docs/pages/CSM.html)|
|空・霧・環境|SkyMesh＋距離/高度霧＋同じ空のPMREM|低コストで照明の整合を取る|初期から全面volume cloud：mobileの帯域・pixel負荷|[SkyMesh](https://threejs.org/docs/pages/SkyMesh.html)、[r187本体](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/jsm/objects/SkyMesh.js)、[PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html)|
|後処理|露出・tone map・AA、弱いbloom。上位のみTRAA/AO|白い雪面の階調と輪郭を守る|滑走中のDOF・強いblur/色収差：視認性と費用|[RenderPipeline](https://threejs.org/docs/pages/RenderPipeline.html)、[TRAA](https://threejs.org/docs/pages/TRAANode.html)|
|木・岩|cell別InstancedMesh、異形岩はBatchedMesh、遠景impostor|draw削減と空間cullingを両立|全山1batch：不可視領域まで描く。全木個別Mesh：CPU負荷|[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)、[BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html)|
|雪煙・降雪|軽量版は時刻で動くinstance billboard、上位版compute|fallbackを維持し画質を段階化|全面大量透明sprite：overdraw。compute専用：互換性不足|[Compute Snow](https://threejs.org/examples/webgpu_compute_particles_snow.html)、[Soft Particles](https://threejs.org/examples/webgpu_particles_soft.html)|

## 3. 実装するならこの順番

1. 高さ正本・メートル単位・タイル境界・LOD・衝突補間を決める。急斜面と高速通過で継ぎ目を点検する。
2. 同じ地形小景を両backendに通す。端末ごとの初期化、float RT、CSM、instancing、画面回転を採否条件にする。
3. 山稜と谷の造形、太陽・空光・露出・大気遠近を仕上げる。雪の材質調整に入る前に白飛びを除く。
4. 雪/岩の混合、多尺度法線・粗さ、木のLODと影を入れる。雪の地域差と風紋で繰返しを崩す。
5. シュプールの座標・保持・窓移動を決め、法線から実装。近接時だけ細密メッシュの必要性を判定する。
6. 雪煙・地吹雪、AA、限定glintを追加。最後にTRAA/AO/bloomと画質自動調整を選ぶ。

## 4. 危険な点

- 〔事実〕WebGPURendererは一部の処理をWebGL2へ変換できるが、atomicsやindirect draw等には互換性がない。[maintainer回答・2025年](https://discourse.threejs.org/t/tsl-and-webgl2-vs-webgpu/87974)
- 〔事実〕従来のGLSL材質改変やEffectComposerはそのまま持ち込めない。公式手引きはTSLへの移行を要求する。r187には限定的なWebGL側TSL例もあるが、全機能共有の根拠にはならない。[手引き](https://threejs.org/manual/pages/webgpurenderer)、[r187例一覧](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/files.json)
- 〔事実〕大量非instance MeshのUBO問題#30560はOpen。元のfps比較はr173・2025年の報告で、r187の性能値として使えない。[issue](https://github.com/mrdoob/three.js/issues/30560)
- 〔事実〕透明Line2のresize障害#34600はr187向け#34612で完了。r186の記事から未修正と判断しない。[issue](https://github.com/mrdoob/three.js/issues/34600)
- 〔事実〕r187はRT破棄・影更新・BatchedMeshのsort/影等を修正。PMREMのcube target化もある。固定版の例を基準としr188devのAPIを混ぜない。[release](https://github.com/mrdoob/three.js/releases/tag/r187)、[移行](https://github.com/mrdoob/three.js/wiki/Migration-Guide#186--187)
- 〔事実〕WebGL2でもfloat textureの参照・render・filter・blendは別の条件。float RTは拡張確認が必要。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- 〔提案〕窓のping-pongは同一textureへの読書きを避け、resize時に履歴とRTを作り直す。float blendに依存せず前frameとの合成をfragment passで行う。最低版は符号化したRGBA8も比較する。
- 〔提案〕高DPRを無条件に使わず、内部pixel数を上限化。透明な葉・雪煙、CSM、全画面RTの枚数を先に抑える。発熱後の持続fpsも測る。
- 〔提案〕変形・LOD morph・風揺れをshadow/depth/velocityにも反映し、culling boundsを広げる。カメラ切替・復帰・teleportでは時間蓄積を破棄する。

## 5. 根拠の詳細

### 5.1 ブラウザ出荷とレンダラーの判断

〔事実〕r187は2026-10-30公開、タグのpackage.jsonは0.187.0。npmの最新dist-tagは直接照会していない。[release](https://github.com/mrdoob/three.js/releases/tag/r187)、[package](https://raw.githubusercontent.com/mrdoob/three.js/r187/package.json)

|環境|確認できた標準出荷の条件|注意|
|---|---|---|
|Chrome・Edge、macOS/Windows/ChromeOS|Chromium113以降|GPU/driverの除外、adapter取得失敗は別問題|
|Chrome Android|121、Android12+のARM/Qualcomm/Intel。Imaginationは139・Android16+|Samsung Xclipse等まで一律に対応とは書けない|
|Safari macOS|Safari26、実装表はmacOS Tahoe26を明記|Safari26という番号だけで旧macOSまで対応と判断しない|
|Safari iPhone/iPad|iOS/iPadOS26、Safari26|iOS18以前を対象にするならfallbackが必要|
|Firefox Windows|141以降|OSごとに段階出荷|
|Firefox Apple Silicon Mac|145はmacOS26+、147は全対応macOS|Intel Mac/Linux/Androidは実装表で一般提供未確認|

出典は[GPUWeb実装表・2026-10-02更新](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)、[WebKit出荷告知・2025-09-15](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)、[Firefox147・2026-01-13](https://www.firefox.com/en-US/firefox/147.0/releasenotes/)。検索結果にはFirefoxを一律「未対応」とする表もあったため、一次資料のOS別条件を優先した。
〔解釈〕本件は既存GLSL資産を移植する案件ではないためTSLを選びやすい。一方、純WebGL2アプリには公式もWebGLRendererを推奨している。WebGPUの速度向上を採用理由の確定事実にしない。[公式](https://threejs.org/manual/pages/webgpurenderer)
〔提案〕WebGPU adapter取得とrenderer初期化の成功を検査し、WebGL2でも開始できる構成にする。device loss後の自動救済まで「自動fallback」に含めない。

### 5.2 地形LOD・高さ共有

〔事実〕CDLOD（Strugar、2010）は四分木選択と距離依存morph。geometry clipmaps（Losasso/Hoppe、2004、GPU版2005）は移動する入れ子の格子と頂点texture参照。[CDLOD著者](https://raw.githubusercontent.com/fstrugar/CDLOD/master/README.md)、[GPU Gems 2](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)

|方式|本件での利点〔解釈〕|負担・不採用条件〔解釈〕|
|---|---|---|
|単純四分木タイルLOD|配信・culling・衝突の単位が明瞭|stitch index、morph等を追加しないとcrack/popが出る|
|CDLOD型四分木|共通格子をinstance化し連続morph、山の高さを含む選択ができる|隣接LOD・高さ補間・boundsを統一する必要|
|geometry clipmaps|頂点数が安定、GPU高さ更新と局所窓に相性がよい|ringの縫合、scroll、データ欠落、空中での密度管理が必要|

〔提案〕128〜256m級タイル、近景1〜2m格子を出発点とする。隣接LOD差を1以内にし、境界頂点を親格子へ揃え、morph中も同じ高さを読む。端に共通sample/haloを持ち、法線とtexture mipの境界も一致させる。skirtは欠落タイルの応急処理に限る。
〔提案〕CPU配列から高さtextureと衝突を作る。原点・scale/bias・texel中心・軸向き・三角形対角線を固定し、衝突は描画と同じ三角形内補間を使う。GPUのbilinear値とCPUの三角形補間を同じものと見なさない。遠景LODと物理面の誤差は許容値を別に定める。
〔計算〕8km四方を1mで持つと約6400万sample。16bitで約128MB（122MiB）、mip込み約171MB。頂点・normal・CPU複製を含めない値なので、全山の高密度mesh常駐は避ける。
〔提案〕形状法線は高さの中央差分、静的遠景は焼いた法線も使う。細雪のnormal mapは別尺度で合成する。更新箇所のみ差分法線を再生成し、遠方ではnormalの平均と粗さの増加でちらつきを抑える。
〔計算・提案〕100km/hは27.8m/s、60fpsで0.463m/frame。移動方向・速度と読み込み遅延から数秒先をprefetchし、未着時は親LODを残す。CPU/GPUの別々のnoise計算を高さ正本にしない。

### 5.3 雪の材質と距離による整理

〔事実〕SIGGRAPH2015「Sparkly but not too Sparkly」はjittered 3D gridと距離全域のalias対策を説明。Batman講演は空色によるSSS近似とreoriented normal blendingを説明する。[2015講演](https://www.advances.realtimerendering.com/s2015/index.html)、[2014スライドpp.21–22](https://colinbarrebrisebois.com/wp-content/uploads/2022/06/gdc2014-deformable_snow_rendering.pdf)
〔解釈〕日陰の青さを内部散乱だけの結果とみなすと照明が崩れる。まず青い天空光と太陽遮蔽を作り、薄い雪や縁の逆光を散乱近似で補う。

|要素|実装案〔提案〕|
|---|---|
|粒状の凹凸・粗さ|大きな起伏/風紋/微細粒の3尺度。非金属、roughnessは0.65〜0.95から写真と比較。圧雪・氷は別maskで下げる。測定値としての指定ではない|
|glint|world固定seedと光・視線方向で少数の反射を出し、pixel footprintでfilter。距離と日陰で減らす。frameごとのrandom発光は避ける|
|散乱・環境|裏からの光×薄さ/雪厚maskで低強度の透過を近似。PMREMによる広い空の反射とglintを二重加算しすぎない|
|サスツルギ|風向に沿う中尺度height/normal。輪郭に影響する大きな筋だけgeometry。風紋textureを単一周期で敷かない|
|岩境界|勾配・高度・風下・遮蔽＋noise、材質の高さで混合。上向きnormalだけで雪を置くと岩壁に不自然な白縞が出る|
|遠景|粒・glintを減らし平均粗さへ統合。稜線、岩の露出、雪庇の大形状、谷の青い陰影を残す|

### 5.4 シュプールは局所解像度と長期保持を分ける

〔事実〕Batman（GDC2014）は下からorthographic capture→filter→高さのping-pong蓄積。consoleはrelief mapping、PCはDX11 tessellation。Rise of the Tomb Raider（SIGGRAPH2015）の講演概要も高さmap＋tessellationを述べる。[Batman](https://colinbarrebrisebois.com/wp-content/uploads/2022/06/gdc2014-deformable_snow_rendering.pdf)、[Rise概要](https://history.siggraph.org/wp-content/uploads/2022/10/2015-Talks-Michels_Labs-R_D-Rendering-Techniques-in-Rise-of-the-Tomb-Raider.pdf)
〔事実〕God of War Ragnarök（GDC2023）の雪再設計講演を確認。担当者本人のインタビューは対象部分のchunk選択とhardware tessellationを説明する。Webでこのtessellation工程をそのまま使える根拠にはならない。[講演](https://www.gdcvault.com/play/1028917)、[本人の説明](https://80.lv/articles/santa-monica-s-senior-programmer-on-how-god-of-war-ragnar-k-s-snow-system-was-made)
〔事実〕Daniel Hanákの別実装はFrozen Wildsを参考に、移動窓・蓄積・差分normalを説明。これはGuerrilla原典の代用ではない。[本人サイト](https://danielhanak.com/)
〔提案〕PCは64m/2048²、mobileは32m/1024²で3.125cm/texel。単一R16F相当のraw容量は8MiB/2MiB、ping-pongは16MiB/4MiB。法線・mip・追加channelは別費用であり、R16Fのrender可否はbackend別に確認する。
〔提案〕skiは2本の細溝、snowboardは接雪幅と横滑りで幅が変わる帯を、前後の接地点を結ぶbrushで描く。60fpsの点stampだけでは46cmの隙間ができる。急斜面ではXZ投影と雪面上の実幅の差を補正する。
〔提案〕窓原点を整数texelへsnapし、移動分だけ再配置、新規帯をclear。毎frameの微小bilinear移動で古い跡をぼかさない。圧縮と盛上がりを分け、重ね描きで無限に掘れないよう深さを制限する。
〔提案〕1〜2m格子ではski幅の溝を頂点変位で表せない。基本は細溝の法線＋粗さ/圧雪色、近接一人称のみ0.1〜0.25m等の局所格子と比較する。真の断面が必要ならさらに細密化が要る。
〔提案〕三人称の遠い跡は薄い帯のnormal/roughnessで残す。低解像度外側map＋CPUの圧縮軌跡点列をtile別に保持し、再進入時に再stamp。局所窓だけでは通過後の跡は消える。
〔提案〕経時減衰は降雪・風の条件と結びつけ、晴天で勝手に即消去しない。GPU変形をphysicsへ毎frame読み戻さず、必要な圧雪量は同じstamp入力からCPU側で近似する。
〔未確認〕three.js/WebGLの移動窓・雪変形・長期保持が一式そろう完成例は確保できなかった。`GPUComputationRenderer`はWebGLのfloat texture ping-pong部品で、雪実装でもWebGPURenderer対応アドオンでもない。[公式](https://threejs.org/docs/pages/GPUComputationRenderer.html)

### 5.5 光・空・環境を一致させる

〔事実〕CSMとCSMShadowNodeはそれぞれWebGLRenderer/WebGPURenderer用。Sky/SkyMeshはPreetham系の空背景。r187のSkyMeshには雲のscale/speed/coverage/density等もある。[CSM](https://threejs.org/docs/pages/CSM.html)、[CSMShadowNode](https://threejs.org/docs/pages/CSMShadowNode.html)、[Sky](https://threejs.org/docs/pages/Sky.html)、[r187 SkyMesh](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/jsm/objects/SkyMesh.js)
〔提案〕動的CSMは手前100〜300mから調整し、fadeとtexel安定化を点検。遠山が谷へ落とす影は事前計算の太陽可視mask等で補い、時間帯の変化に合わせて補間する。低い太陽ではshadow boundsとbiasに注意する。
〔提案〕夕方は直射を暖かくし、影の天空光を残す。同じ太陽方向・空パラメータからPMREMを生成し、太陽変更時だけ低頻度更新。太陽円盤と直射の二重計上を点検する。
〔事実〕Hillaire（EGSR2020）は多重散乱近似と低次元LUTで空と大気遠近を扱う。確認範囲は出版社抄録。[論文](https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.14050)
〔提案〕初期はSkyMesh＋空色へ収束する距離/高度霧。将来のLUT大気に交換できるよう空・霧・環境の入力を共通化。雲は既存skydomeの雲から始め、地形への雲影は低解像度mask。mobileの立体雲raymarchは後回し。

### 5.6 後処理：提供状況と採否

〔事実〕r187の公式例一覧と以下の例を確認。WebGL側のTAA例は「動きがない時」の蓄積を説明し、速度vector再投影を行うTRAAと同等ではない。[例一覧](https://threejs.org/examples/)、[WebGL TAA](https://threejs.org/examples/webgl_postprocessing_taa.html)、[r187 TRAA](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_postprocessing_traa.html)

|効果|WebGLRenderer側で確認した公式提供|WebGPURenderer側で確認した公式提供|本件の提案|
|---|---|---|---|
|tone map/bloom|tone mapping、Unreal Bloomの例|tone mapping、bloomの例|`ACESFilmicToneMapping`から比較、bloomは弱く。r187地形例で定数を確認|
|AA|FXAA/SMAA/SSAA/TAAの例|FXAA/SMAA/SSAA/TRAAの例|低画質はFXAA等、上位はTRAA。TRAA時MSAAはOFF|
|motion blur|同等の汎用速度vector blur公式例は未確認。Afterimageとは区別|[速度vector blur](https://threejs.org/examples/webgpu_postprocessing_motion_blur.html)|通常OFF、希望時に短いshutter|
|被写界深度|DOF/DOF2の例|DOF/basicの例|写真モード優先|
|AO|SSAO/SAO/GTAOの例|[r187 GTAO/SSAO切替](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_postprocessing_ao.html)|人物・岩周囲に限定し半解像度、低画質OFF|
|レンズ効果|Lensflares、glitch等の例|lensflare/CA/anamorphic等の例|雪の白飛び・色のにじみを増やすため既定OFF|

〔事実〕TRAAはcolor/depth/velocityが必要、MSAA併用不可。r187例は`mrt`/`velocity`と`RenderPipeline`を使用。[API](https://threejs.org/docs/pages/TRAANode.html)、[ソース](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_postprocessing_traa.html)
〔事実〕pmndrs/postprocessingは第三者ライブラリ。効果を`EffectPass`へ融合する仕組みがあり、Bloom/DOF/SSAO/SMAA系・色調整等を提供。確認時mainのpackageは6.39.6/Zlib、threeのpeer範囲は`>=0.168.0 <0.188.0`。WebGPUのRenderPipelineへの直接接続を意味しない。[README](https://raw.githubusercontent.com/pmndrs/postprocessing/main/README.md)、[package](https://raw.githubusercontent.com/pmndrs/postprocessing/main/package.json)
〔提案〕TSL後処理のWebGL2 backendでの可否は効果ごとに確認。velocity/normal用MRTが増えるTRAA＋AOをmobile既定にしない。表示変換は最後に一度だけ行う。

### 5.7 木・岩と雪粒子

〔事実〕同geometry/materialはInstancedMesh、同material・異geometryはBatchedMesh。後者はindex有無と属性layoutの互換が必要。[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)、[BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html)
〔提案〕木は種×LOD×cell、岩はatlasと形状群で分割。中距離は簡略樹冠、遠距離は複数視点impostor。LOD切替はhysteresisと短いdither、mobileは重複描画を短くする。
〔提案〕風は幹を固定し枝先weightとinstance seedで頂点変位。雪付き樹冠は上面normal・遮蔽maskと別の雪塊形状を組み合わせ、impostorも同じ積雪状態から作る。細かな葉のalpha overdrawは三角形数と別に測る。
〔事実〕公式Compute Snowは100k粒子の例、soft particlesは深度交差を薄める例。雪山全体での60fps保証ではない。[降雪](https://threejs.org/examples/webgpu_compute_particles_snow.html)、[soft particles](https://threejs.org/examples/webgpu_particles_soft.html)、[r187 compute粒子](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_compute_particles.html)
〔提案〕雪煙のspawn量＝接地×速度×edge/slip強度×粉雪係数。切り返し・着地だけburst。速度は人物速度に横方向の放出、重力、風、dragを足す。カメラ近くの巨大spriteは避ける。
〔提案〕降雪はcamera追従boxにwrap、地吹雪は雪面近くの帯。基本版はspawn時刻/初期位置からGPU頂点計算、上位はstorage buffer＋compute。WebGLのGPGPU float RT方式をTSL computeの完全互換と見なさない。

### 5.8 性能予算は実測の出発点

すべて〔提案・未実測〕。draw/三角形は主camera pass分で、影・depth・後処理を含む総量も別集計する。「Apple Silicon」「近年のスマホ」は幅が大きく、一律保証できない。

|画質|対象・目標|内部解像度|主pass draw / 三角形|影|RT・後処理|
|---|---|---|---|---|---|
|高|Apple Silicon Macを含むPC、60fps|最大1920×1080から|100〜250 / 100〜250万|3cascade×2048²から|HDR色、TRAAは任意、AO/bloomは縦横1/2|
|中|高性能iPhone/Android、30〜60fps|長辺1600以下・概ね900p以下|60〜120 / 40〜90万|2×1024²から|AA、bloom縦横1/2〜1/4、AO原則OFF|
|低|旧iOS/WebGL2・低性能/発熱端末、30fps|長辺960〜1280・概ね540〜720p|30〜80 / 15〜40万|1×1024²又は接地近傍のみ|LDR許容、時間蓄積OFF、glint/雲影削減|

〔計算〕1080p RGBA16F 1枚は約15.8MiB。色2枚＋depth32＋velocity RG16Fだけで約47.5MiB、normal/履歴/MSAA/mipを加えるとさらに増える。縦横1/2のRTはpixel数1/4。
〔提案〕60fpsの16.67msに対しGPU p95を12〜14ms以下、CPUも余裕を持って収める。mobile30fpsは33.33msから同様に余白を取る。解像度→透明pixel→shadow→AO等の順で削り、稜線や接地に必要な近景密度を守る。
〔提案〕Mac M1/M2級、iPhoneの旧/現行OS、AdrenoとMaliの少なくとも各1系統で、樹林・白い開斜面・夕方・吹雪を各10分以上比較。p50/p95/p99、shader初回停止、RT容量、総drawを記録する。[一般原則](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

### 5.9 先行例・ライブラリの使い道

画質欄はREADME/公開説明からの〔解釈〕で、今回ブラウザ実行・画像比較はしていない。日付は明示した種類の更新で、検索crawl日を最終commit日にしない。参照して学ぶ範囲に限り、コード・素材は導入しない。

|名称・URL|ライセンス〔事実〕|最終更新の確認状況|見た目の水準・学べる点〔解釈〕|
|---|---|---|---|
|[nickyvanurk/cdlod](https://github.com/nickyvanurk/cdlod)|MIT|最終commit未確認、[package](https://raw.githubusercontent.com/nickyvanurk/cdlod/main/package.json)のthreeはr155系|16km手続き地形・morph/instance。実写雪材質やr187対応の証拠にはしない|
|[tschie/terrain-cdlod](https://github.com/tschie/terrain-cdlod)|MIT|最終commit未確認|最小CDLOD学習例。README自ら高さを無視したcullingによる穴を記載|
|[THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain)|MIT|GitHub topicのUpdatedは2026-09-17、最新commitは未確認|生成・混合・散布の参考。広域streamingを完成済みとは扱わない|
|[iTowns](https://github.com/iTowns/itowns)|MIT/CeCILL-B、third party別|organizationのUpdatedは2026-10-28、最新commitは未確認|実地形・GIS可視化。タイル・標高配信を学べるがゲーム物理/TSL雪は別|
|[SnowRush](https://github.com/xingyezn/SnowRush)|READMEはMIT、モデル別|最終commit未確認|low-poly三人称snowboard。視点切替・雪痕・画質切替の構成参考。公開ゲームURLへは到達したが本文抽出不可|
|[SNOWFLOW](https://github.com/Ditto190/snowflow_demo_webGPU_unreal5)|LICENSEの存在のみ確認、本文取得不可。別の[配信ページ](https://genex.games/snowflow)はMIT表記|最終commit未確認|Babylon.js/WGSLの雪変形デモ。説明上は溝/盛上がり/大気を統合。three.js・mobile実証ではない|
|[SnowSystemThreeJS](https://github.com/achrefelouafi/SnowSystemThreeJS)|MIT|最終commit未確認|小景の積雪shader・instance降雪・sparkle。長距離地形や履歴変形の例ではない|
|[three.js公式地形](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_tsl_procedural_terrain.html)|three.js MIT、付属assetの条件は別確認|r187固定、2026-10-30 release|小景のTSL高さ/法線/雪岩色分け。完成した実写地形エンジンではない|

## 6. 未確認・限界

- 調査のみ。ブラウザ・ローカルサーバーを起動せず、Git操作・ゲーム実装・端末benchmarkは行っていない。60fps・画質・fallbackの完成保証はできない。
- Web検索34クエリと直接取得で調査。本文を取得できたページだけを根拠に使用。移動する公式docsはr187タグのrelease・例・sourceと照合し、未取得箇所は区別した。
- Hillaire著者PDFとDisneyのsnow/path tracing PDFは容量制限、God of Warのスライドは403。未読本文の技術詳細を根拠にしていない。Horizon原典・RDR2雪講演、全OSSの最終commit日は未確認。
- スマートフォンごとのfloat RT/blend/filter、CSMShadowNode＋変形影、各TSL後処理のWebGL2動作は実機確認が残る。Firefox等の実装表には更新間隔があり全最新buildを検査していない。
- 次の設計判断は「TSL地形＋局所RT＋CSM＋少量の木」を両backendの実機で比較してから確定する。glintやTRAA追加を待たずrendererの採否を決める。

## 7. 出典一覧

全URLの確認日：**2026-11-10**。章中リンクも出典。以下は主要資料と版の確認先。

- three.js [r187 release](https://github.com/mrdoob/three.js/releases/tag/r187)、[package](https://raw.githubusercontent.com/mrdoob/three.js/r187/package.json)、[Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#186--187)、[r187例一覧](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/files.json)。
- renderer：[手引き](https://threejs.org/manual/pages/webgpurenderer)、[compute互換性・maintainer](https://discourse.threejs.org/t/tsl-and-webgl2-vs-webgpu/87974)、[#30560](https://github.com/mrdoob/three.js/issues/30560)、[#34600](https://github.com/mrdoob/three.js/issues/34600)。
- ブラウザ：[GPUWeb実装表](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)、[Safari26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)、[Firefox147](https://www.firefox.com/en-US/firefox/147.0/releasenotes/)。
- 地形：[CDLOD著者README・2010](https://raw.githubusercontent.com/fstrugar/CDLOD/master/README.md)、[GPU Gems 2・2005](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)、[r187 TSL例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_tsl_procedural_terrain.html)。
- 雪：[SIGGRAPH2015 sparkle講演ページ](https://www.advances.realtimerendering.com/s2015/index.html)、[Batman GDC2014 PDF](https://colinbarrebrisebois.com/wp-content/uploads/2022/06/gdc2014-deformable_snow_rendering.pdf)、[Rise SIGGRAPH2015概要](https://history.siggraph.org/wp-content/uploads/2022/10/2015-Talks-Michels_Labs-R_D-Rendering-Techniques-in-Rise-of-the-Tomb-Raider.pdf)。
- 変形：[God of War GDC2023](https://www.gdcvault.com/play/1028917)、[担当者インタビュー・2023](https://80.lv/articles/santa-monica-s-senior-programmer-on-how-god-of-war-ragnar-k-s-snow-system-was-made)、[Hanák本人](https://danielhanak.com/)、[GPUComputationRenderer](https://threejs.org/docs/pages/GPUComputationRenderer.html)。
- 光：[CSM](https://threejs.org/docs/pages/CSM.html)、[CSMShadowNode](https://threejs.org/docs/pages/CSMShadowNode.html)、[r187 CSM例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_shadowmap_csm.html)、[Sky](https://threejs.org/docs/pages/Sky.html)、[SkyMesh](https://threejs.org/docs/pages/SkyMesh.html)、[r187 SkyMesh](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/jsm/objects/SkyMesh.js)、[PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html)、[Hillaire2020抄録](https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.14050)。
- 後処理：[RenderPipeline](https://threejs.org/docs/pages/RenderPipeline.html)、[r187互換wrapper](https://raw.githubusercontent.com/mrdoob/three.js/r187/src/renderers/common/PostProcessing.js)、[TRAA API](https://threejs.org/docs/pages/TRAANode.html)、[r187 TRAA例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_postprocessing_traa.html)、[r187 AO例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_postprocessing_ao.html)、[公式例目次](https://threejs.org/examples/)。
- 第三者後処理：[pmndrs README](https://raw.githubusercontent.com/pmndrs/postprocessing/main/README.md)、[package/ライセンス/peer範囲](https://raw.githubusercontent.com/pmndrs/postprocessing/main/package.json)。
- 木・粒子：[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)、[BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html)、[Compute Snow](https://threejs.org/examples/webgpu_compute_particles_snow.html)、[Soft Particles](https://threejs.org/examples/webgpu_particles_soft.html)、[r187 compute例](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgpu_compute_particles.html)。
- 性能・更新確認：[MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)、[iTowns organization](https://github.com/itowns)、[THREE.TerrainのGitHub topic](https://github.com/topics/terrain?l=javascript)、[iTownsライセンス本文](https://raw.githubusercontent.com/iTowns/itowns/master/LICENSE.md)。OSS/ゲームのURLは5.9表に併記。
