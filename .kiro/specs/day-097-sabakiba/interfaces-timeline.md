# 契約: 手順と時間（担当 WP-2。内容は WP-5）

## 手順データ `lib/procedures/<id>.js`（`export default { steps:[...] }`）
```js
{ id:'head-cut',                         // [a-z0-9-]+・種の中で一意
  title:'頭を落とす',                      // ≤14字
  summary:'胸ビレの後ろから、背骨まで斜めに切ります。',  // ≤60字・何をするか1文
  how:['…','…'],                          // 1〜3行・各≤70字・どこにどう刃を入れるか（刃のどの部分・向き・角度・押す/引く）
  tip:'…', mistake:'…', done:'…',        // 各≤70字（done≤50）・コツ／やりがちな失敗／できた目印
  place:'頭は{L}、腹を手前に',             // ≤40字・魚の置き方。左右の語は {L} {R} で書く（右利き前提）
  tools:['deba'],                         // TOOL_IDS
  hands:[{ anchor:'opercleTop', who:'off', text:'{L}手で頭を押さえる' }],   // もう一方の手の印（piece:'L.dorsal' で動いた部品に付けられる）
  pose:{ head:'L', dorsal:'B' },         // 盤（まな板）の上の置き方。L R F(手前) B(奥) U D。頭の向きと背の向き（直交）
  camera:{ preset:'cook', focus:'opercleTop', zoom:1 },   // preset: cook side top front closeup・focus: アンカー名|{curve,side}|[x,y,z]
  durationMs:6000,                        // 2500〜9000
  cuts:[{ id:'c1', curve:'headCut', side:'L', tool:'deba', motion:'pull', lead:'heel', angleDeg:25, window:[0.05,0.55], through:false }],
  moves:[{ piece:'head', window:[0.6,0.95], move:[-6,0,2], rot:{axis:'y',deg:-10,about:'pivot'}, opacity:1, visible:true }],  // 盤の座標系（+x右 +y上 +z手前）・cm
  uniforms:{ scale:{to:0,window:[0.1,0.9]}, slitOpen:{to:0}, xray:{to:0}, scutes:{to:0} },
  effects:[{ kind:'scales', curve:'scaleSweep', side:'L', window:[0.1,0.9] }],     // scales | water
  highlight:[{ curve:'headCut', side:'L' }], labels:[{ anchor:'opercleTop', text:'鰓蓋(えらぶた)' }],
  safety:'…',                              // 任意・≤60字
  practice:{ cut:'c1', tolerance:0.5 } }   // 任意・なぞれる切り（許容 cm）
```
- **`moves` は終わりの姿勢（休めの姿勢からの変位）**。後の手順で上書きするまで残る。`visible:false` は窓の終わりで効く（消したいときは `opacity:0` と併用）。
- 切り込みは累積する（`cuts[].through:false`＝表面の線・`true`＝内側まで通す＝透視で見える）。

## 時間 `lib/timeline.js`（純JS・three不要）
```
createProcedure(raw, anatomy) -> proc           // 契約の検証つき。誤りは例外で理由を出す
stepCount(proc)
stateAt(proc, stepIndex, u, {leftHanded}) -> state   // u∈[0,1]。同じ引数なら同じ結果（飛ばす・戻す・撮影が一致）
resolveText(str, leftHanded) -> str             // {L}→左/右 {R}→右/左
poseTransform(pose) -> {q:[x,y,z,w], p:[x,y,z]} // 魚(FLF)→盤。頭の向きの逆が+x、背の向きが+y、z＝x×y
```
`state` = `{ pose, pieces:{[id]:{visible,opacity,move:[x,y,z],rot:{axis:[x,y,z],deg,pivot}}}, uniforms:{scale,slitOpen,xray},
incisions:[{curve,side,progress,through}], knife:null|{tool,curve,side,t,motion,lead,angleDeg,pos,quat}, highlights, hands, labels, effects:[{kind,t,curve,side}], camera }`。
- 魚に付く点（`knife.pos`・手・ラベル・focus）は **FLF**。部品の動きは盤の座標系。ビュー側は `toWorld` で合成する（部品に付けたものは、その部品の動きを含める）。
- ポーズ変更は手順の最初の25%で補間。切り替え前後の姿勢は直前の手順の終わりが起点。

## 包丁 `lib/knife.js`（three）
`buildKnife(tool)` → `Group`（局所座標＝原点は刃先の接触点・+x＝刃元→切っ先・+y＝峰・刃は±zの面）。実寸（出刃の刃渡り16cm・柳刃24cm・ペティ13cm）。
`tool` は `deba yanagi petty shears tweezers scaler`。ステンレスの刃＋木の柄（リベット）。`knifePose(anatomy, cut, t)` は純JSで `{pos, quat}`（刃の面が切り面にそう・動く向きは motion で決まる）。

## 受け入れ試験
- 全種の手順が検証を通る（存在しない部品・カーブ・アンカー・道具・字数超過は落ちる）。`stateAt(i,1)` が `stateAt(i+1,0)` と一致。順に進めても飛んでも同じ。
- 部品は消える前に必ず現れている（出る前に動かさない）。最後の手順で、残る部品が「できた」の状態（身・骨・頭など）になる。
- 左利きで `resolveText` が全文を反転し、記号の取りこぼしがない。`pose` の頭と背が直交している。

## 部品の親子と持ち主（`lib/contract.js` が正本）
- `PIECE_PARENT`: 子は親の動きを引き継ぎ、自分の動きを足す。visible も親が消えれば消える（不透明度は引き継がない）。例: `L.dorsal` を動かすと左の身ぜんぶ（腹側・腹骨の層・皮・小骨）が動く。
- `ANCHOR_OWNER`・`curveOwner(name, side)`: 点・線が付く部品。持ち主が動いたあとは、その動きに従う（`timeline` は FLF の点と持ち主を返し、ビューが合成する）。側のある線は `L.dorsal`/`R.dorsal`、背骨の線は `bone`。
