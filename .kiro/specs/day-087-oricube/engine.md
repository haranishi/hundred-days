# 折りエンジンの契約

`lib/` に置く純粋なES module（DOM・three.jsに依存しない。Nodeの単体試験とブラウザの両方で動く）。描画側はここだけを呼ぶ。

## 座標と紙
- 紙の座標 (u,v): `0≤u≤width, 0≤v≤height`。vが上。世界座標は右手系でyが上、机は y=0 の面。
- 初期配置: 世界x=u−width/2, z=height/2−v（vが大きいほど奥＝−z）。`rotationDeg` だけ紙をy軸まわりに回して置く（白鳥は45°）。表が上向き。
- 紙の幅を約1とする。層の見分け用の間隔 `layerGap`（既定0.004）は表示専用で、寸法には効かせない。

## 状態（内部）
- 共有頂点の三角形メッシュ。頂点は紙座標と世界座標を持つ。折っても頂点は共有したまま（折り目の辺は両側が同じ頂点）。
- 三角形ごとに: 頂点3つ、`rank`（平らな姿勢での前後。大きいほど上）、`tags`（文字列の集合）、表示用の `offset`（世界ベクトル）。平らな姿勢では offset = rank×layerGap×(0,1,0)。剛体の回転（hinge）では offset も同じ回転を受ける。
- 折り目の辺の印（`crease`）と、手順で作る折り線。折り目の線は、描画側が細い線で描く。
- 表示位置は「頂点の世界座標 + その三角形のoffset」。頂点座標そのものは offset を含まない（辺の長さの不変条件を厳密に保つため）。

## 作品データ（宣言）
`paper:{width,height,rotationDeg?,front,back,frontName,backName}`, `marks:{名前:[u,v]}`（紙座標。組み込み: TL TR BL BR T B L R C）, `steps:[{id,title,text,tip?,view?,ops:[...]}]`。
点の指定は、マーク名か世界座標 `[x,z]`。マークは紙上の点で、折られるたびに今の世界位置へ追従する。
線の指定: `{through:[点,点]}` / `{perpBisector:[点,点]}`（点Aを点Bへ合わせる折り線）/ `{point:[x,z],dir:[dx,dz]}` / `{angleBisector:[線,線],containing:点}`。
動く側の指定: `moving:点`（その点がある側が動く）。対象の層: `select:{tags:[..],notTags:[..]}`（省略は動く側の全層）。

## 操作（ops）
- `fold`: `{line,moving,mode:'valley'|'mountain',select?,stack?,tagMoved?,tagStationary?,together?}`。選んだ層の三角形を折り線で切り、動く側を180°回して平らにたたむ。valleyは手前（上）へ、mountainは奥（下）へ越える。
- `crease`: 折ってから開く。形は変わらず、折り目の線だけが残る。
- `scribe`: 動かさず、折り目の線だけを引く（`segments:[[点,点]]`）。
- `turn`: 全体を裏返す（`axis:'vertical'|'horizontal'`、軸は全体の中心）。
- `hinge`: 平らでない回転。`{axis:{through:[点,点]},select:{tags},degrees}`。全体を立ち上げる（selectなし）、羽を開くなどに使う。以後は平らでない姿勢になり、`fold`は使えない。
- 同じ手順の中の複数のopは順に動く。`together:true`を付けたopは同時に動く（動く頂点が重ならないこと）。

## 層の順序（stack）
- `auto`（既定）: valleyは重なる相手の最上層より上、mountainは最下層より下に置く。動く側の層は前後が反転する。「重なる」は動いた後の2D領域の交わりで判定する。
- `{mode:'between',upper:タグ,lower:タグ}`: 動く層を、lowerの最上層とupperの最下層の間（重なる範囲）に入れる。中割り折りに使う。間に入る層は反転して等間隔に並べる。
- 平らに戻る動き（開く）は、つながった隣の層のrankに合わせる。

## 検査（作品データの構築時に必ず実行し、失敗は `FoldError` で止める）
- ヒンジ検査: 動く三角形と動かない三角形が共有する頂点は、すべて回転軸の上にあること。違えば「引きちぎる折り」。
- 平らな姿勢ごとに、重なる三角形（重なりの面積>1e-6）のrankがすべて異なること。
- 折り目の貫通: 180°折った辺をまたいで、その辺と重なる範囲に、別のつながりの層が挟まらないこと。
- 構築後に全手順の始点と終点で、面積の保存・辺の長さの保存・向きの保存（表裏の反転で鏡像にならない）を確かめる。

## 描画側へ出すもの
- `buildModel(def)` → `model`: `{id,name,level,minutes,paper,steps:[{index,id,title,text,tip,view,durationMs,guides}],frame(i,t,opts),finalFrame(opts),bounds}`
- `model.frame(i,t,{explode=1})` → `{positions:Float32Array,normals:Float32Array,triCount,topologyKey,creaseSegments:Float32Array,bounds}`。t∈[0,1]は手順iの動きの進み具合（イージングは描画側）。tが0の姿勢は直前の手順の終点と同じ形。positionsは三角形ごとに3頂点を並べた非インデックス配列。法線は面ごとの平面法線で、巻き順は紙の表側が前面。`explode`はlayerGapの倍率（重なりを広げる表示）。さらに `outlineSegments`（紙そのものの縁の線分。折り目と同じ形で、紙の縁が折られた先でも縁として残る）と `shade`（頂点ごとのRGB乗数。下の層ほど最大10%暗く、見分け用。幾何には使わない）を返す。
- 手順の `guides`: `[{kind:'valley'|'mountain'|'turn'|'hinge',line:[[x,y,z],[x,y,z]],arrow:{points:[[x,y,z]...],head:{position,direction}}}]`。動き出す前の姿勢（t=0）の世界座標。
- `topologyKey` は手順ごとに変わる値。描画側は変わったときだけバッファを作り直す。
- 同じ入力から常に同じ数値が出ること（乱数・時刻を使わない）。

## 連動折り（mechanism・第2弾）
一本の軸の回転では引きちぎれる、複数の折り線が同時に動く手順（正方基本形へのつぶし・花弁折り・袋を開く・つぶし折り）を表す。
- 宣言: `{type:'mechanism', hinges:[{line, degrees（符号つき・谷が正）, select?}…], pin:（固定する面の指定）, together?}`。`hinges` に無い折り目は動かさない（面のまとまり＝クラスタとして剛体）。
- 計算: クラスタと蝶番を、固定のクラスタから木としてたどって位置を決める。木に入らない蝶番で隣り合うクラスタの接合辺が一致すること（ループの閉じ）を満たす角度を、目標角度への射影と連続法で数値に解く。辺の長さと面の形は厳密に保つ。
- 経路: 始点から終点まで進み具合 t で連続に解く。ビルド時に細かい表（200点以上）を作り、`frame(i,t)` では任意の t を、表の近傍から数回の反復で厳密に解き直す（閉じの残差は1e-9以下）。始点と終点は特異点なので、微小な摂動と、終点の解析的な姿勢で扱う。
- 層: 平らな終点の `rank` は、終点の直前（折り角が180°−ε）の3次元の姿勢で、重なる三角形の高さの順から決める。既存の層の検査（同rankの重なり・折り目の貫通）で照合する。
- 案内: 動く折り目を谷・山の線で、主な動きを矢印で `guides` に出す（既存の `valley`/`mountain`）。
- 失敗: 解が無い・分岐が曖昧・経路での貫通は、作品名と手順つきの `FoldError`（`MECHANISM_INFEASIBLE` など）で止める。
- 近似（最後の手段）: 剛体で表せないと実測で分かった手順だけ、`relaxed:{maxStrain}` で辺の伸びを制限した緩和解を許す。engine-notes.md に手順と最大誤差を記録する。

### 第2回の実装範囲とAPI
- 独立部品 `mechanism.js`: `prepareMechanism({clusters:[{points:[[x,y,z],…]}],hinges:[{a,b,edge:[[x,y,z],[x,y,z]],degrees}],pin,driver?})`。points/edgeは共通の始点世界座標。coreのdegreesは始点からの右手系回転増分（±180°以内）。`mechanismPose(core,angles)` のanglesはラジアン。
- `projectMechanism(core,t,seed?)` は局所射影。`buildMechanism(input,{samples=256})` は257点の角度表と `at(t)`（倍精度のposes/points/angles/closure/residual）を返す。外部依存・乱数・履歴なし。
- 既定driverは `'projection'`。目標方向への射影量 `dot(angles,goals)/dot(goals,goals)=t` を拘束する。整数driverはその蝶番1本を線形に駆動する。非木辺は接合辺両端と相対回転を照合し、角度だけが未拘束になるのを防ぐ。
- 公開opの `line` は今回は **有限の紙座標線分** `{through:[マーク名または[u,v],…]}`。先に `scribe split:true` で切る。`select` は共有辺の両面に適用。未宣言の辺は剛体クラスタへ統合する。`pin:{tags?,notTags?}` はちょうど1クラスタを選ぶ。
- 公開opのdegreesは **符号付き終点二面角**。始点の面法線とrankから初期角を求め、coreへ回転増分を渡す。180°から90°へ開く場合も扱う。
- 構築時に257点の逆行・異クラスタ間の三角形内部の交差・平面時の既存層検査を実行。辺共有の隣接面と同一クラスタは交差検査から除く。共面の接触と内部を横断する交差を区別する（層offsetは材料座標に入れない）。
- 平面終点は `t=1−1e-4` の重なり領域で高さを比較し、順位の非循環な順序を求める。固定クラスタの元rankを基準にそろえ、境界でoffsetが飛ぶのを防ぐ。高さ同値・層の循環・クラスタ内の既存重なりは現実装では拒否する。
- `frame` は表の線形補間を種に最大12回の射影。補正中は終点へ誘導せず、補間した分岐を保つ。guidesは終点角の谷/山を保ち、手順t=0へ座標を戻す。`topologyKey`・配列再利用・boundsは既存APIを維持する。
- `MECHANISM_INFEASIBLE` は宣言終点の不整合、`MECHANISM_NO_CONVERGENCE` は局所解法の未収束。後者は剛体経路が存在しない証明ではない。`MECHANISM_BRANCH` / `MECHANISM_PENETRATION` / `MECHANISM_LAYER_AMBIGUOUS` も作品・手順つきのFoldError。
- A・C1は既存仕様を維持。第3回でC2とC3(b)を作品と同形の固定データへ統合。C3(a)・C4は未採用（engine-notes.md）。`relaxed` は現在も `MECHANISM_RELAXED` で拒否する。

### 第3回の追加契約
- 連続表の予測は直前2姿勢の割線を使う。種と表の時刻が一致した場合は直前の割線を保持し、ゼロ除算を防ぐ。多自由度の経路を毎回終点方向へ引くと、特異点付近で別の自由度が混ざって未収束になるため。
- 終点の層順は「クラスタ＋始点rank」を節点にする。未宣言の180°折りで束ねた既存層を、同じ剛体クラスタの中でも区別する。異クラスタ間は終点直前の材料高さ、同一クラスタ内は回転した元の層順で比較する。
- 固定クラスタの各rankをすべて保持し、その間には分数rankで新しい層を入れる。表示gap=0でも層順を保つ。高さが同じ異クラスタを元rankだけで順位づけず、曖昧として拒否する。
- 紙座標の直線が既存の折り返しで世界座標の向きを反転する場合、蝶番を分けて各区間の角度を検査する。作者も折り返しの交点で線分を分け、胴とつばの谷山を逆に指定する。同じ角度で束ねた不整合な宣言は拒否する。
- C2の固定データは `tests/mechanism-crane-fixtures.mjs`。全4象限の凧線と横線を先置きし、既存C1→両面花弁と進む。1辺1の紙で鳥の基本形は長さ1・幅√2−1、対応する翼2枚・脚2本の先がそれぞれ一致する。
- C3(b)は `tests/mechanism-pocket-fixtures.mjs`。胴の中央2区間+90°、つばの中央2区間−90°、旧半折りの左右2区間+90°。正方形の口は面積0.5・深さ0.5。任意のtで閉じ≤1e-9、frame・guide・rank・topologyKeyは既存APIで扱う。
- 調査データは `tests/mechanism-investigation.json`、再構築は同名の `.mjs`。紙コップの4案と舟の4案を保存し、終点だけの閉じを経路の成功と混同しない。論文§5.2の原則を採用したが、図の番号・位置との対応は未照合。
