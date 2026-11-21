# 契約: 解剖と形（担当 WP-1）

## 座標系（魚の座標 FLF・単位 cm）
- 原点＝吻の先。**+x＝尾の向き**（頭は x=0 側）。+y＝背。+z＝魚の**左側**の体側。標準体長 SL＝吻の先〜尾びれの付け根（尾柄の終わり）。尾びれは x>SL に出る。
- 駅（station）`s∈[0,1]`＝`x=s·SL`。体軸（背骨の通る線）＝`y=axisY(s)`（既定0）。
- 部品は**すべてFLFのまま**作る。動きは部品のObject3Dの変換で行う。

## 魚のデータ（`lib/species/<id>.js` の `export default`）
`id name nameFull kana method family('round'|'flat') sizeCm{typical,min,max} season difficulty(1-5) minutes{novice,skilled} similar[]` と、
`shape`（単位は %SL。調査 R2 の主要寸法に対応）: `TL_over_SL maxDepth maxDepthPos maxWidth peduncleDepth headLength snout eyeDia(%HL) eyePos opercleEdge belly(腹と背の張りの比)`、
`fins`（pectoral/pelvic/dorsal[]/anal/caudal・finlets）、`vent`（%SL）、`scutes`（ぜいご：count・from）、`vertebrae{pre,caudal}`、`cavityEnd`（%SL）、
`look`（colors: dorsal flank belly fin iris＋patterns[]＋scale{size,gloss}＋flesh:'white'|'red'|'pink'）。足りない値はテンプレートの既定で補う（`profileFromKeyMeasures`）。

## 解剖 `createAnatomy(species,{segments})`（純JS・three を import しない）
```
{ SL, TL, bounds{min,max},
  profile(s) -> {axisY, top, bottom, half, nTop, nBottom},        // 断面の外形（超楕円。下記）
  surface(s, phi) -> {p:[x,y,z], n:[x,y,z]},                      // phi=0: +z(左体側) → π/2: 背 → π: 右体側 → 3π/2: 腹
  inside(p) -> bool,
  point(name) -> [x,y,z],                                         // ANCHOR_NAMES
  curve(name, side) -> {points:[[x,y,z]..], onSurface:bool},      // CURVE_NAMES・side='L'|'R'|null
  cutPlane(name) -> {point,normal}                                // 頭を落とす面などの斜めの平面
}
```
- 外形: `y=axisY+(sinφ≥0?top:bottom)·sgn(sinφ)|sinφ|^(2/n)`・`z=half·sgn(cosφ)|cosφ|^(2/n)`。吻は丸く始める（√状）。`profile` は単調で滑らか（PCHIP）。
- **頭を落とす面**は斜め（背側は後ろ・腹側は前）。`headCutTop`・`headCutBottom` の2点（%SLで種ごと）で決まる平面。

## 形 `buildFishModel(species,{quality:'high'|'standard'|'light', rng})`（three）
```
{ group, anatomy, pieces:{[id]:{id, object, pivot:[x,y,z], kind, group, triangles}}, materials, dispose() }
```
**部品ID（PIECE_IDS）**: `head` `bone`（背骨・棘・ヒレ・尾びれ・背ビレと尻ビレの付け根の皮の帯）`viscera` `kidney`（背わた）
`L.dorsal` `L.ventral` `L.strip`（腹骨をすき取る薄い層）`R.dorsal` `R.ventral` `R.strip` `skin.L` `skin.R`（身を覆う皮の殻）`pinbones.L` `pinbones.R`（小骨・InstancedMesh）。
ヒラメ（flat）は L＝有眼側（目のある側）。追加: `engawa.*`（P1）。
- **身（quarter）**: 断面のループ（外弧＋切り口の辺）を駅ごとに作り、同じ頂点数でつないで閉じた塊にする。切り口の辺＝背骨側の面（S面）・体側の水平面（H面）。
  S面の高さ z_S(s,y)＝背骨の側面にそった溝（背骨の半径 r の半円）＋背側・腹側では 0.35r の平ら。**腹腔（頭の切り口〜肛門）の腹側は、皮の内側に壁（厚み wallT）を残して空洞**。
  L.strip＝腹壁の内側の薄い層（腹骨を含む）。L.ventral＝その外側。両者は境界面を共有し、合わせると元の腹側の身になる。
- **皮の殻** `skin.*`: 身の外弧のわずかに外側（皮の厚み 0.03〜0.08cm）。両面描画。内側の面は別の色（剥いだ皮の裏）。
- **斜めの切り口**（頭・尾柄）: 端の駅の輪を平面にそって前後にずらし、キャップ（蓋の面）を貼る。頭の後ろの蓋と身の前の蓋は同じ面で向きが逆。
- **骨** `bone`: 椎体（糸巻き形）＋神経棘・血管棘（細い楔）＋ヒレの支え。背骨の溝にぴったり収まる。**腹椎に肋骨（腹骨）**は `L.strip`・`R.strip` の中。
- 身どうし・身と骨の継ぎ目に隙間が出ない（ΔX<0.02cm）。法線は解析的に出し、継ぎ目で連続。

## 頂点属性（材質との約束）
`position normal uv`（皮: u=s・v=φ/2π）`aSeg`（float: 0=皮・1=S面・2=H面・3=キャップ・4=外側の身）。身の切り口の模様は FLF の位置から材質が出す。

## 受け入れ試験（Nodeで実行・`tests/geometry/`）
- 固体の部品（身・strip・頭・骨の塊）は閉じている（辺がちょうど2つの三角形に共有される。重複頂点は統合して判定）・体積が正・NaNなし。
- 左右の体積が等しい（対称な魚で±1%）・`L.dorsal+L.ventral+L.strip+R.*+bone領域` が胴の体積に一致（±5%）。
- 三角形の総数が画質の予算以下。`quality` で形の頂点数だけが変わり、部品IDは同じ。
- 全アンカー・全カーブが体の表面か内部にあり、`inside` と矛盾しない。カーブの長さが正で、始点→終点の向きが約束どおり（頭→尾）。
- `tools/geometry-report.mjs`：部品ごとの三角形・体積・閉じているか・外接箱を表で出す。
