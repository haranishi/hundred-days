# モデル契約：影証言

画面に依存しない部分の契約。`lib/geometry.js`・`lib/shapes.js`・`lib/score.js`・`lib/cases.js`・`lib/deduction.js`・`lib/config.js` は**設計側の参照実装で、実装済み**。
`lib/stage.js`・`lib/game.js`・`lib/transform.js` は、この契約に沿って実装する。

## 座標と単位
- 壁の面（cm）。x は右へ（0〜240）、y は上へ（0〜180、床が0）。描画側が上下を反転する。
- 画面に出す範囲は VIEW（x −10〜250、y 0〜180）。左右10cmは余白。
- 灯りは壁から `distance` 手前にあり、壁面上の真下の点 `(lamp.x, ly)` で表す。`lamp.x` は足跡で決まり動かない。動かせるのは `ly ∈ [lamp.min, lamp.max]`。
- 道具は、壁から `z` 手前の棚にある。棚の高さ `y` は固定。横位置 `x ∈ [x.min, x.max]`（`min===max` なら固定）。形は `shape`（SHAPES）に `scale`・`rot` を掛けて `(x, y)` に置く。
- 影の点 ＝ 灯り ＋ k × (道具の点 − 灯り)。k ＝ distance / (distance − z)。灯りに近い道具ほど k が大きく、影が大きく・速く動く。

## 一致の判定（`lib/score.js`）
- 壁を2cmのセル（120×90）に区切り、セルの中心が影の中にあるかで塗る（偶奇規則）。壁の外は捨てる。
- ねらい（目撃者のスケッチ）は、場面の「正解の配置」で落ちる影。`buildTarget(stage)` が道具ごとのマスク `pieces` と和集合 `union` を返す。
- `evaluate(stage, target, arrangement)` は次を返す。`arrangement` は `{ ly, xs: { 道具id: x } }`。
  - `iou`：現在の影の和集合とねらいの重なり率。
  - `parts[id].coverage`：道具が、自分のねらいの部分をどれだけ覆うか。邪魔な道具（`decoy`）は `area`（壁の上の影の面積）。
  - `success`：`iou ≥ union` かつ 全ての道具で `coverage ≥ part` かつ 邪魔な道具の `area ≤ decoyArea × ねらいの面積`。
  - `band`：`match`（成功）／`near`（iou≥0.7）／`warm`（≥0.5）／`far`。
- しきい値の既定は `{ union: 0.8, part: 0.6, decoyArea: 0.05, near: 0.7, warm: 0.5 }`。夜5だけ `union: 0.84`。

## 場面データ（`lib/cases.js`）
`CASES[i]` は物語と幾何を持つ。幾何は `stage`：

```
stage: { distance, lamp: { x, min, max, start, solution },
         props: [{ id, shape, label, scale, z, y, rot?, decoy?, x: { min, max, start, solution } }], threshold? }
```
`stageOf(caseDef)` が形（polygons）を結びつけた計算用の場面を返す。`start` は開始の配置、`solution` は正解。邪魔な道具の `solution` は壁の端（影が壁の外へ出る位置）。
物語側は `title / place / summary / intro / witness / sceneNote / footprint / guide('on'|'off') / coach / coachNoGuide?（guide が 'on' の夜だけ）/ showsHeight?（夜1だけ true）/ hints[2] / deductionHint / clues / suspects / culprit / stool / reveal / closing`。`PEOPLE` が名前・職・身長を持つ。

## 推理（`lib/deduction.js`）
灯りの高さ ＝ 身長 × 0.6 ＋ 踏み台（cm）。
- `candidatesBeforeReproduction(caseDef)`：アリバイで外れない容疑者（2人以上）。
- `matchingByHeight(caseDef, lampHeight)`：アリバイを見ずに、灯りの高さが0.5cm以内で合う人。夜3（椿・久我＝170cm）と夜5（白瀬・柊＝180cm）は2人、ほかは犯人だけ。
- `candidatesAfterReproduction(caseDef, lampHeight)`：アリバイで外れず、灯りの高さも合う人（犯人だけ）。夜3・夜5は、身長だけでは決まらず、アリバイが決め手になる。
- `readingOf(caseDef)`：再現した灯りの高さの文。`showsHeight` の夜（夜1）だけ「灯りの高さ→身長」の計算まで書き、夜2以降は「灯りの高さは96cm。これを提げた人の身長は？」で止める。`judge(caseDef, suspectId)`：正誤と文。

## セッション（`lib/stage.js`・実装する）
1つの夜の操作の状態。DOMと時計に依存しない。
```
createSession(caseDef) → { caseId, stage, target, arrangement:{ly,xs}, selected:'lamp'|propId, assessment,
                           status:'playing'|'solved', guideOn, usedGuide, hintsUsed }
select(session, id)                  // 'lamp' か、すべれる道具のid。それ以外は無視
setLamp(session, ly) / setPropX(session, id, x)   // 範囲に収め、評価を更新。固定の道具は無視
nudge(session, direction, step)      // direction は -1 か +1。選択中が灯りなら高さ、道具なら横位置
reset(session)                       // 開始の配置へ。guideOn・usedGuide・hintsUsed は変えない
toggleGuide(session)                 // 夜2以降は、付けた時点で usedGuide を立てる。夜1（guide:'on'）は、何度出し入れしても立てない
useHint(session) → { index, kind, text }  // hintsUsed を増やす。まだ出していない文を1つ：kind:'diagnosis'（diagnose の名指し。配置が変わって文が替わったら、また先に）→ kind:'principle'（hints[] を順に）→ kind:'end'（出し尽くした）。shownHints に覚える
confirmSolve(session)                // 評価が success のときだけ、灯りと必要な道具を正解の配置へそろえて status を 'solved' にする。邪魔な道具は置いた位置のまま
movableIds(session)                  // ['lamp', ...すべれる道具のid]
describeAssessment(session) → { step, label, detail, fills }  // fills：4つの目盛りの満ち具合（0〜1）。IoU が各段の範囲のどこにあるかで連続して伸びる。「近い」「あと少し」の detail は、邪魔な道具が残っている／灯りの高さがずれている／道具の横位置がずれている（灯りと道具が正解から3cm以内なら「合っている」）
```

## ヒントの名指し（`lib/diagnose.js`）
`diagnose(stage, target, assessment, arrangement) → { kind:'lamp'|'prop'|'decoy'|'none', id, text }`。正解の配置との差で、いちばんずれているものを1つ選ぶ。
灯りと道具のずれは同じ物差し（5cm）で比べ、邪魔な道具の影が壁に残っていれば、30cm分のずれより先に名指しする。文は向きと大きさの3段（ほんの少し・少し・だいぶ）で、cmの数字は言わない。
例：「灯りが、だいぶ高い。下げてみよう。」「外套が、少し右にずれている。左へすべらせよう。」「山高帽の影が、壁に残っている。壁の右の端へすべらせよう。」
評価は配置が変わるたびに更新する（`assessment = evaluate(...)`）。合格後に一定時間（`SOLVE_HOLD_MS`）保たれ、操作が止まっていることの判断はRuntimeが行い、`confirmSolve` を呼ぶ。

## 進行（`lib/game.js`・実装する）
```
STORAGE_KEY = 'kage-shogen:v1'
emptyProgress() → { v:1, cleared:{}, last:null }
loadProgress(storage) → progress          // 欠損・壊れた値・保存不可でも例外にせず、空を返す
saveProgress(storage, progress) → boolean
isUnlocked(progress, index)              // 夜1は常に開く。夜nは夜n-1が解決済みのとき開く
starsFor({ usedGuide, hintsUsed, wrongAnswers }) → 1..3   // 3 − min(2, 使った種類の数)。種類はガイド・ヒント・誤答
recordClear(progress, caseId, stars) → progress           // 最も高い星を残す
totalStars(progress) / clearedCount(progress) / nextIndex(progress)
```
`usedGuide` には、夜1のガイドを含めない（`guide:'on'` の夜は、何度出し入れしても false）。
保存形式は `{"v":1,"cleared":{"rack":{"stars":3}},"last":"rack"}`。値は検証してから使う。

## 変換（`lib/transform.js`・実装する）
`createTransform(width, height)` は、VIEW を表示領域へ均等に拡大して中央に置く。`{ scale, offsetX, offsetY, toScreen(x, y), toWorld(px, py) }`。
y は反転する。描画とポインターの座標変換と、E2Eの座標計算が同じ関数を使う。
