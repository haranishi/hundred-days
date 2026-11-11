# Design: mountain-world

## Overview
生成スクリプト（Node）が山の配列を作り、実行時の問い合わせ（`src/world`）がそれを読む。補間の式は両者で同じファイルを使う。

- **Goals**: 物理と描画が同じ雪面を読む。山を種から作り直せる。形を画像と統計で確かめられる。
- **Non-Goals**: GPU への転送、摩擦などの係数、地図の画面。

## Boundary Commitments
- **This Spec Owns**: `tools/worldgen/`、`src/world/`、`tests/world/`、`public/world/` の形式
- **Out of Boundary**: `src/render`・`src/sim`・`src/ui`。`package.json` と `vitest.config.js`（変更が要るときは報告に書く）
- **Allowed Dependencies**: Node 標準（fs・zlib・crypto）だけ。npm の追加なし
- **Revalidation Triggers**: 公開関数の形、配列の並びや単位、版番号を変えたとき（ride-sim と mountain-render を見直す）

## 世界の定数と座標
- 一辺 `SIZE=6144` m、格子 `GRID=2048`、1目 `CELL=3` m。原点は中心、X が東、Z が南、Y が上。
- 格子 (i,j) の中心は `x=(i+0.5)*CELL-SIZE/2`、`z=(j+0.5)*CELL-SIZE/2`。配列は `j*GRID+i` の行優先。
- 確認用の小さな山は `GRID=512`・`CELL=12`（同じ SIZE）。式は GRID と CELL を引数で受ける。

- `heading` は 0 が北（−Z）、+π/2 が東（+X）。方向ベクトルは `(sin h, 0, −cos h)`（物理と共通）。

## 高さの式（生成と実行時で共有）
`H(x,z) = B(x,z) + amp(x,z) * A(x,z)`
- `B`：大きな形。高さ配列を制御点にした一様3次Bスプライン（16点・端は端の値で埋める）。2階微分まで連続。
- `A`：中くらいの凹凸。256²・値域 −1〜1・周期 96 m のタイルを、同じ3次Bスプライン（周期つき）で読む。
- `amp`：凹凸の強さ（0〜0.75 m）。雪質の地図（半分の解像度）を、同じ3次Bスプライン（端は端の値）で読む。
  3つとも同じ補間にするのは、合成した `H` の傾きを格子の境目でも連続にするため（双線形だと 0.375 m ごとに傾きが折れ、物理の法線が震える）。
- 法線は `H` の中心差分（幅 0.25 m）。
- 曲がり具合は、雪面の**法曲率**で返す（上に凹が正）。水平の単位方向 d に沿った傾き `hd` と2階差分 `hdd`（幅 1.5 m）、勾配 `(hx,hz)` から
  `κ = hdd / ((1 + hd²) · sqrt(1 + hx² + hz²))`。鉛直な断面の曲率（`hdd/(1+hd²)^1.5`）とは、横にも傾いた面で値が違う。
- 細かい風紋（1 m 未満）は高さに入れない。描画の法線と、物理へ渡す「荒さ」の値だけで表す。

## 公開関数（`src/world/index.js`）
```js
export const WORLD_FORMAT_VERSION = 1;
export async function loadWorld(baseUrl = '/world/')            // fetch で読む。版が違えば Error（作り直す命令を文に含める）
export function createWorld(meta, buffers)                       // Node と試験用。buffers は下の配列
// world.meta / world.buffers = { height, tileA, masksA, masksB, sunVis }
world.heightAt(x, z)                         // number（m）
world.sampleSurface(x, z, out)               // out.h, out.nx, out.ny, out.nz（単位法線）, out.inBounds
world.curvatureAlong(x, z, dx, dz)           // 雪面の法曲率（1/m・上に凹が正）。(dx,dz) は水平の単位ベクトル
world.half                                   // 地図の半幅（SIZE/2 = 3072 m）。world.size も持つ
world.snowAt(x, z, out)                      // out.depth(m), powder, packed, ice（和は1）, rock(0〜1), wind(0〜1), rough(0〜1)
world.treeDensityAt(x, z)                    // 0〜1
world.zoneAt(x, z)                           // { id, name }
world.sunVisibilityAt(x, z)                  // 0〜1（夕方）
world.obstaclesNear(x, z, radius, out)       // out は配列。要素 { id, type:'tree'|'monster'|'rock', x, y, z, radius, height }
world.drops                                  // [{ id, name, x, y, z, heading, zone, level:1〜3 }]
```
`out` を渡す形にして、毎刻みの呼び出しで物を作らない。`sampleSurface` は1回あたり 1µs 台を目安にする。

## データの形式（`public/world/`）
公開形式は版2のまま。I15の配置の正本は `valley-map/requirements.md` と `design.md`。以下はデータの受け渡しの追加分であり、未達の受入条件を変更しない。
- `layout: "valley-1"`。2048²・3m、高さのBスプライン＋周期タイルの式を維持する。
- `sun: {x,y,z}` は南東135°・高度28°。`sun-evening.u8` の名前を維持し、中身だけこの方向で再生成。
- `lake: {level:1180,x0,z0,size,grid:512}`。`lake.u8` はR8・512²、行優先、0=陸・1〜199=氷・200〜255=水。セル中心は `(x0+(i+.5)*size/grid,z0+(j+.5)*size/grid)`。範囲外は陸。カテゴリは補間せず該当セルを読む。
- `structures.lodge` は `{x,y,z,yaw,length:44,width:16}`。`chalets` は8棟、同じ形に `variant:0〜2` を追加。
- `structures.bridge` は `{x,y,z,yaw,length:22,width:4,rise:2.2}`。yaw=0で長手が北、+π/2で東。Yは両端の床高。長手座標uの床は `y+rise*(1-(2*u/length)^2)`。
- 橋の矩形内では `heightAt/sampleSurface/curvatureAlong` が地形と橋床の高い方を使う。格子に橋を盛らない。矩形端には床の縁があるため、縁をまたぐ高さ/法線は不連続になり得る。
- `structures.lift` は `{base,top,towers}`。上下駅は位置/yaw/length/width、柱8本は位置/yaw/height。Yは地面の標高。
- `structures.roads` は `[[[x,z],...],...]`。道路の中心線。
- `views` は9件の `{id,name,ref,pos:[x,y,z],target:[x,y,z],fov}`。位置/注視点はワールドm、fovは度。
- `reserved` は `[{id,x,z,heading,length:400,width:60,angle:22}]`。起点からheadingへ延びる予約帯。angleは設計目標。実測範囲は `verify-valley.md`（目標より緩い区間がある）。
- `features` は空配列。出発地点は通常12/隠れ4、`id/name/x/y/z/heading/zone/level/kind/finish/hidden/about`。aboutは1行40字以内。`finish:"village"` は目的駅であり、到達を保証するフラグではない。
- `stations` は `{id,name,x,y,z,radius,base}`、village/lift-top/valley-midの3駅。
- `map:{file:"map.png",size:1024}`。北上、陰影・100m等高線・森・岩・氷河・湖・道・建物。出発点と駅の記号は焼かない。PNGはバイナリのFILES/ハッシュ照合に含めない。
- 問い合わせは従来の形を保ち、`waterAt(x,z):boolean` を追加。障害物のtypeに `building/tower` を追加し、建物と橋欄干は円の集合。valley-1の森はtreeのみ、monsterを出さない。

| ファイル | 中身 |
|---|---|
| `world.json` | 版2・種・定数・高さ範囲・光・配置・各バイナリのSHA-256 |
| `height.f32` | Float32 LE・GRID²、地形の雪面。湖の格子は1180m |
| `tile-a.f32` | Float32 LE・256²、周期96mの起伏 |
| `masks-a.bin` | RGBA8・(GRID/2)²、深さ×.02m/新雪/氷/岩 |
| `masks-b.bin` | RGBA8・(GRID/2)²、木密度/起伏振幅/風/区域 |
| `sun-evening.u8` | R8・GRID²、南東28°からの日照 |
| `lake.u8` | R8・512²、湖の氷と水 |

生成物はGit対象外。旧版2にlakeが無い場合、lake.u8の取得は省略し、waterAtはfalse。
受入の実測と未達は `.agent-harness/runs/worldgen/verify-valley.md`、4回の比較と修正理由は `.agent-harness/runs/impl/I15_progress.md` に記録。試験の合格と数値要件の合格は区別する。

## 生成の手順（`tools/worldgen/`）
乱数は段ごとに別の系列（種＋段の名前のハッシュ）。生成物には時刻を入れない。公開形式/版は1のまま。
1. **計算格子**：本番1024²（6m）で隆起と浸食を計算し、2048²へ3次Bスプラインで拡大。quickは256²（24m）→512²（12m）。
2. **隆起場**：`FEATURE_PARAMS` の中心(350,-350)、裾600m、非対称±15%の火山断面。火口は長径750m・短径570mを角度で歪めた馬蹄形。異なる高さの5峰、北西への開口/深沢、緩い棚/溶岩ドームを重ねる。南西の小火口を持つ寄生火山、東の1540m中心/約8°の台地、鞍部を持つ南尾根、南東の15°の練習平面を加える。600〜2500mの歪ませた雑音と95/230mの小さな起伏で集水域を分ける。半径から棚/沢を描かない。
3. **流域の浸食**：priority-floodで凹地を排水可能にし、8近傍の最急降下で受け手を選ぶ。Kahnの順序を使い上流から面積A（m²）を足し、下流から `h=(h+c*h_recv)/(1+c)`、`c=K*A^0.45*dt/dx` を解く（dxは斜めなら√2倍）。本番60回、quick24回。元の隆起場に比例した隆起を各回に足す。Kは雑音/傾斜で歪ませ、途切れた溶岩層では小さくする。40°、硬い層は55°を目安に崩壊移動。横方向のcreepで格子方向の筋を抑える。下流の低勾配で土砂を堆積する。
4. **沢の幅/拡大**：実際の浸食量と流域面積から有限幅の斜面崩壊を計算する。26mへ広げ、13mのフィルター3回で断面を丸める。練習面/台地/火口底は保護する。拡大後は斜度と凸な稜線に応じた37/83mの細部を加え、雪原は滑らかに保つ。
4a. **滑走用の小起伏（I9）**：浸食/拡大後・積雪前に、仮雪質の木密度/露岩と30m平滑面の勾配/凹凸で安全な雪面を選ぶ。10〜28°の開けた面の20〜30%に、谷向き22〜45m間隔・高低差0.5〜1.4m・3〜6峰の原を散らす。原と峰線を雑音で歪めて断続させ、縁の高さを滑らかに0へ戻す。北西風の風下（南東）の尾根肩15〜30か所へ長さ60〜200m・高さ1〜2.5mの段を追加し、安全な20〜32°の着地へつなぐ。火口縁/45°超/露岩0.4超/台地中央/出発前方60mを保護する。練習平面上端の200×300mは平坦のまま、下端約100mへ高さ0.3〜0.45m・間隔26〜32mの3峰を加える。練習検査領域の中心は上端300mの中央とする。共有雪面を0.5m刻みで600m×3本（横±10m）勾配追跡し、κ<−9.81cosθ/20²が3m以上の区間を出発地点別/kmで記録する。600m四方の拡大陰影2枚と立体4枚を出し、画像点検/所要時間/2回SHA/試験の証拠をI9_progressへ残す。
5. **積雪**：30mの凹凸と北西風から面の向き/露出を求め、沢底と南東向きの面に厚く積もらせる。45°超と高所の風上の稜線は雪を減らし、0.15m未満を露岩とする。滑らかな雪深場を高さに加えてU字の沢にする。
6. **雪質**：風上/稜線/高所は圧雪と氷、風下/沢/樹林は新雪。隣接する値は滑らかな場として補間する。練習面の細部雑音は0。
7. **木の密度**：森林限界1550±80m（歪ませた滑らかな雑音）。回転/歪曲した30〜120mの雑音で濃い場所と開けた場所を作る。35°超、流域面積の大きい沢底と周辺、風上の稜線、練習面を除外。流域の除外場も平滑化して升や直線を残さない。1350m以上はmonster、その下はtree。
8. **出発地点**：7名称/役割を引き継ぎ、候補から周囲を探索。向きは `atan2(nx,-nz)`。全地点でその場の谷向きと60°以内、前方150m×両側10mの雪深/斜度/露岩/下りを検査し、障害物の実問い合わせでも0件を確かめる。不成立なら生成失敗。
9. **影と確認画像**：実行時の夕方影は仰角18°/西南西で従来どおり。確認画像は別の北西35°の光を使用し、陰影＋向き/斜度/雪/木を1024²で出す。高さ配列を奥から列描画し、真の高さ比・俯角32°でSW/SE/NE/NWの立体画像4枚を追加する。
10. **統計/検証**：共有雪面の全格子で要件1/5を検査。納品する積雪後の高さを浸食格子へBスプライン補間して流域を再計算する。半径1700mを横切るA≥50000m²の流路を80m以内でまとめ、両岸±100mに対して20〜90m深い沢の本数、合流数、排水連結性を記録する。同心輪は96方位の半径方向高域成分から検出する（統計は目視の代わりではない）。同じ種/版で本番/quickを2回ずつ作り、全データと画像のSHAを照合する。進捗と画像3回までの自己点検は `.agent-harness/runs/impl/I5_progress.md` に残す。

陰的更新の根拠: [Braun–Willett (2013)](https://doi.org/10.1016/j.geomorph.2012.10.008)、[FastscapelibのSPL解法](https://fastscapelib.readthedocs.io/en/latest/api_cpp/eroder.html)。追加依存はない。

## 木と岩の配置（`src/world/obstacles.js`）
48 m の升ごとに、種と升の座標から乱数を作る。6 m の揺らした格子を候補にし、木の密度と条件（35°以下・1630m以下・雪の深さ・出発地点の前方）で採否を決める。
幹の半径 0.25〜0.45 m、高さ 4〜9 m。標高 1,350 m 以上は樹氷。岩は露出 0.3〜0.8 の場所に半径 0.6〜2.5 m。升の結果は 256 升まで覚える。

## File Structure Plan
```
src/world/index.js          読み込み・createWorld・問い合わせの入口
src/world/format.js         定数・版・world.json の検査
src/world/surface-math.js   Bスプライン・周期タイル・差分（純粋関数）
src/world/masks.js          雪質の地図の復号
src/world/obstacles.js      木と岩の決定的な配置
tools/worldgen/generate.mjs 命令の入口（--seed --quick --out --preview）
tools/worldgen/lib/         noise.js shape.js erosion.js snow.js features.js sunbake.js png.js stats.js rng.js
tests/world/                surface-math・world・obstacles・worldgen の試験
```

## Error Handling
範囲外は端へ寄せて `inBounds=false`。非数は返さない（入力が非数なら 0 を返し、開発時は警告）。版の不一致と SHA-256 の不一致は Error。

## Testing Strategy
- Bスプライン：重みの和が1、1次式を厳密に再現、格子の境目で値と傾きが連続、解析微分と差分の一致。
- 合成した高さ：タイルと強さを含めた `H` で、格子・タイル・雪質の地図の境目をまたいでも傾きが連続。
- 法曲率：横にも傾いた解析的な面（例 `h = b·z + k·x²/2`）で、X 方向の値が `k/sqrt(1+b²)` になる。
- 問い合わせ：範囲外の扱い、雪質の和が1、同じ入力で同じ出力、`out` の再利用で物を作らない。
- 木と岩：同じ種で同じ結果、幹の間隔 3 m 以上、禁止条件の地点に木が無い。
- 生成（小さな山）：2回作って SHA-256 が一致、要件1の斜度割合（I5では小さな山も同じ厳密な幅で検査）、出発地点の条件（谷向き60°以内も含む）。
- 生成（本番の山）：存在するときだけ、要件1・5 の数値を検査する。
