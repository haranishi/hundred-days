# Design: ride-sim

## Overview
滑走者1人の動きを、操作と地形から固定刻みで計算する純粋な部品。力学の式と係数は `model.md` に分けた。

- **Goals**: 切るターンと横滑りを別の状態として成立させる。調査 R2 の数値目標を回帰試験で守る。同じ入力から同じ結果を出す。
- **Non-Goals**: 入力装置、描画、音、姿勢のアニメーション、得点、スキー（係数と板の表を差し替えれば足せる形にだけしておく）。

## Boundary Commitments
- **This Spec Owns**: `src/sim/`、`tests/sim/`
- **Out of Boundary**: `src/world`（形だけ使う）、`src/core`、`src/render`、`package.json`
- **Allowed Dependencies**: なし（Node 標準も使わない。ブラウザでそのまま動く）
- **Revalidation Triggers**: 状態の項目、出来事の種類、操作の値の形、地形の問い合わせの形を変えたとき

## 外から見える形（`src/sim/index.js`）
```js
export function createRide(terrain, options)   // options: { stance: 1|-1, params }
ride.state            // 下の表。物は作り直さず、中身を書き換える
ride.events           // その刻みの出来事の配列（次の step で空にする）
ride.step(input, dt)  // input: { steer:-1〜1, tuck:0〜1, brake:0〜1, jump:boolean（押している間 true）, grab:0〜1（初版は予約。常に 0 として扱う） }
ride.reset(spawn)     // { x, z, heading, speed }。出発地点として覚える
ride.respawn(kind)    // 'drop'｜'safe'。止まった状態で置き直す
ride.snapshot()  /  ride.restore(s)   // JSON にできる控え。試験と手動送りで使う
ride.createState()                    // 空の状態の入れ物を作る（器が描画用の控えに使う）
ride.copyState(src, dst)              // 入れ子も含めて中身を写す。物を作らない
```
`ride.state` は同じ物を書き換えるので、参照を持つだけでは前の刻みの値が残らない。前後2刻みを使う側（器）は、`ride.copyState` で自分の入れ物へ写す。
器には `ride` だけを渡すので、この2つは `ride` の関数として持つ（仮の滑走も同じ2つを持つ）。
`ride.events` も次の `step` で空になる。1回の画面更新で複数の刻みを進める側は、刻みごとに中身を写して集める。
`terrain` は `sampleSurface(x,z,out)`・`curvatureAlong(x,z,dx,dz)`・`snowAt(x,z,out)`・`obstaclesNear(x,z,r,out)`・`half`（地図の半幅）を持つ。
mountain-world の World はこの形を満たす。試験では `tests/sim/terrains.js` に、平面・一定の曲率の丘と谷・波・キッカーを解析的に用意する。

## 状態（`ride.state`）
| 項目 | 意味 |
|---|---|
| `mode` | `'carve'`・`'skid'`・`'air'`・`'crash'`・`'rest'` |
| `pos` `com` `vel` | 板の中心・重心・速度（m, m/s）。それぞれ `{x,y,z}` |
| `speed` `heading` `yawRate` | 速さ、板の向き（Y まわり・−Z が0）、向きの変化の速さ |
| `fwd` `up` `right` | 板の単位ベクトル。`fwd` は先端の向き |
| `edge` `slip` | エッジの角度（＋が右のエッジ）と、横滑りの角度（＋は板が進む向きより右）。rad |
| `load` `gLoad` `leg` `crouch` | 雪面の反力÷体重、脚にかかる合力÷体重、脚の長さ（m）、しゃがみ 0〜1 |
| `sink` `snow` | 沈み込み（m）と、その場の雪質の割合 |
| `air` | `{ time, spin, apex }`。空中の時間・回った角度・最高点の高さ |
| `switch` `stance` | 逆向きで滑っているか、利き足 |
| `tele` | 計測値：`edgeForce`・`skidPower`（W）・`spray`（0〜1）・`carveDrag`・`lastImpact`（等価落下高 m） |

## 出来事（`ride.events` の要素）
`takeoff{speed,pop}`・`land{efh,yawDeg,quality}`・`crash{reason}`・`recover`・`edgeSwitch{side}`・`carveBreak{cause}`・
`collision{type,speed}`・`bottomOut{impulse}`・`bounds`。`quality` は `clean`・`heavy`・`sketchy`、
`reason` は `landing-hard`・`landing-sideways`・`tree`・`rock`。0.08 秒未満の浮きは `takeoff`・`land` を出さない。

## File Structure Plan
```
src/sim/index.js      createRide・step の振り分け・控え
src/sim/params.js     係数と雪質の表（出どころを横に書く）
src/sim/vec.js        小さなベクトル演算（物を作らない書き方）
src/sim/ground.js     接地：荷重・切る・削る・止まる
src/sim/air.js        空中・踏み切り・着地の判定
src/sim/crash.js      転倒・立ち上がり・復帰・安全な地点
src/sim/contact.js    木と岩・地図の端
src/sim/snow.js       雪質の割合から係数へ。新雪の沈み込み
tests/sim/terrains.js 解析的な地形
tests/sim/*.test.js   数値目標・ふるまい・決定性・耐久
```

## Error Handling
入力は範囲へ丸め、非数は 0 として扱う。刻みの最後に状態の非数を検査し、見つけたら直前の控えへ戻して `crash{reason:'numeric'}` を出す（開発時は例外）。

## Testing Strategy
- **数値目標**（R2 の表。係数を目標の条件へ合わせて検算）：終端速度（20・30・40 度、低い姿勢）、抗力なしの加速度と反力、
  空気の抵抗の大きさ、平らな面の弧の横力と傾き、全力の制動距離（平ら・20 度）、着地の等価落下高、
  丘の頂と谷底の荷重と離雪の境界、放物線の頂点と滞空、しゃがみでの回転の加速、脚の静止時の縮みと減衰比、新雪の支持。
- **ふるまい**：左右なしで斜面を横切り続ける、氷で弧が3倍以上になる、丘の頂で横力不足の出来事が出る、制動を離して 0.5 秒で板が戻る、
  平らな面の踏み切りで高さ 0.2〜0.45 m、着地の4分類の境界、逆向きの着地、木へのかすりと衝突、端で止まる。
- **決定性**：同じ入力の列で状態のハッシュが一致。控えから戻して続けても一致。`copyState` の写しが元と一致。
- **刻み**：60・120・240Hz で終端速度の差 1% 以内、着地の衝撃の差 5% 以内（着地は刻みの中の交点で判定する）。
- **端の値**：速さ 0・荷重 0・控えからの復元直後でも非数が出ない。摩擦で速度の向きが反転しない。
- **遅いとき**：登りで止まったあと、先端が谷へ回って前向きに滑り出す。遅い更新と切るの行き来で、位置と速度が跳ばない。
- **着地の交点**：1刻みのあいだに薄い隆起を越える動きで、最初の交点を見逃さない。
- **法曲率**：横にも傾いた面で、荷重が法曲率の式どおりになる。
- **耐久**：種つきの乱数入力で、波の地形を 5 分ぶん進めて非数が出ない。1刻み 20µs 以下を目安に測る。
