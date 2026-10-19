# 依頼書 WP-A：影証言（Day071）の単体モデルとテスト

## あなたの役割
実装担当。作業ディレクトリは、このリポジトリ（haranishi/hundred-days）のworktree。ブランチは `feat/day-071-kage-shogen`。
**テストを先に書き、失敗を確かめてから実装する。** git操作（add・commit・checkout・push など）はしない。ネットワークは使わない。
触ってよいのは、下の「作るもの」に挙げたファイルだけ。他のDay・`scripts/`・`docs/`・`shared/`・`day-071-kage-shogen/lib/` の参照実装（下記）は、不備を見つけたときだけ最小限直し、理由を記録に書く。

## 最初に読むもの（この順）
1. `AGENTS.md` と `docs/ci.md`。
2. `.kiro/specs/day-071-kage-shogen/` の `brief.md`・`model.md`・`design.md`・`tasks.md`（タスク1〜5）・`requirements.md`。`ux.md` は、読み出しの文（近さ）を決めるところだけ読む。
3. **参照実装（設計側が作成済み・動作確認済み）**：`day-071-kage-shogen/lib/` の `geometry.js`・`shapes.js`・`score.js`・`cases.js`・`deduction.js`・`config.js` と、`tests/cases.test.mjs`。ここにある書き方（日本語コメントを短く・関数は小さく・JSDocは付けない・シングルクォート・2スペース・セミコロンあり）にそろえる。
4. **結合の型の実例**：`day-070-flip-court/` の `tests/index.js`・`tests/*.test.mjs`・`tools/serve.mjs`・`lib/*.js`。命名と構成をそろえる。

## 作るもの

### 1. `day-071-kage-shogen/tests/index.js`
全テストの入口。新しいテストファイルを順に `import` する。既存の `cases.test.mjs` の行は残す。

### 2. `day-071-kage-shogen/tools/serve.mjs` と `tests/preview.test.mjs`
Day070の `tools/serve.mjs` と `tests/preview.test.mjs` を雛形にする。違いだけ：
- 公開パスの接頭辞は `/day-071-kage-shogen/`。既定portは `4171`（`PORT` 環境変数、`0` も可）。起動時に `http://127.0.0.1:<port>/day-071-kage-shogen/` を標準出力へ出す。
- 配る許可リスト（それ以外は404）：`index.html`・`app.css`・`app.js`・`lib/config.js`・`lib/geometry.js`・`lib/shapes.js`・`lib/score.js`・`lib/cases.js`・`lib/deduction.js`・`lib/stage.js`・`lib/game.js`・`lib/transform.js`・`lib/view.js`・`shared/share.js`・`shared/share.css`・`og.png`。
- セキュリティヘッダはDay070と同じ。試験はDay070と同じ観点（許可リスト・404・パス走査・メソッド・ヘッダ）を、新しい許可リストで確かめる。`index.html` などがまだ無い段階でも、試験は一時ディレクトリや存在するファイルだけで通ること（存在しない許可ファイルは404でよい）。

### 3. `tests/geometry.test.mjs`
`lib/geometry.js` の試験。最低限：
- `flattenShape`：rect は4点、circle は28点で全点が半径 r、trap の上辺・下辺、arc の点数と半径、未知の種類・空配列で `TypeError`。
- `placePolygons`：90°回転で (1,0)→(0,1)、scale、平行移動、元の形を変更しない。
- `depthRatio`：z=0→1、距離300・z=150→2、z<0・z>距離−20・非有限で `RangeError`。
- `project`：灯り(100,50)・比率2で点(110,60)→(120,70)。
- `rasterize`：壁の中の長方形 x20〜60・y10〜40 は 300 セル。範囲外は空。重なる2つの多角形は和集合。壁の端で切れる。セル中心の規則（境界の扱い）。
- `iou`：同一→1、重なり無し→0、半分重なり、両方空→1、長さ違いで `RangeError`。
- `propShadow` / `castShadows` / `shadowMask`：z=0 で影が輪郭と一致、k=2 で拡大、灯りを縦に d 動かすと影が縦に (1−k)·d 動く。

### 4. `tests/score.test.mjs`
`lib/score.js` の試験。実際の事件簿（`CASES` と `stageOf`）と、小さな合成の場面（長方形の道具2〜3個）の両方を使う。最低限：
- `solutionArrangement` と `buildTarget`：正解は `evaluate` で `success:true`・`iou:1`・`band:'match'`・各部品の被覆1。
- しきい値の境界：全体のIoUがしきい値の直前は不合格・直後は合格になる合成例。
- **部品の被覆**：全体のIoUは合格でも、面積の小さい部品を外すと `partsOk:false` で不合格になる合成例。
- **邪魔な道具**：影が壁に残ると `decoysOk:false`、壁の外なら true。
- `band` の `near / warm / far` の境界（0.7・0.5）。
- `evaluate` が入力（stage・target・arrangement）を変更しない（`Object.freeze` した入力で）。
- `arrangement.xs` に無い道具は正解のxを使う。

### 5. `tests/deduction.test.mjs`
`lib/deduction.js` の試験。最低限：
- `lampHeightOf` / `heightFromLamp`：165→99、踏み台20の175→125、往復で一致。
- 夜ごとの `candidatesBeforeReproduction` と `candidatesAfterReproduction`：夜1は前=佐伯・森山／後=森山、夜4は前=桐谷・蓮見／後=桐谷。
- `readingOf`：夜1は「灯り99cm。6割で割ると、身長は165cm。」、夜4は「灯り125cm − 踏み台20cm ＝ 105cm。6割で割ると、身長は175cm。」、夜5は身長180cm。
- `judge`：犯人は `correct:true` と夜の `closing`。誤りはアリバイの文（例：夜1の日向）と、身長の計算の文（例：夜1の佐伯「佐伯 ふみは違う。身長150cmの6割は90cm。再現した灯りは99cmで、合わない。」、夜4の蓮見「蓮見 渉は違う。身長188cmの6割は約113cm。踏み台の20cmを足すと約133cm。再現した灯りは125cmで、合わない。」）。未知のidで `RangeError`。

### 6. `lib/stage.js` と `tests/stage.test.mjs`
1つの夜の操作のセッション。DOM・タイマー・時計に依存しない。契約は `model.md` の「セッション」。補足：
- `createSession(caseDef)`：`{ caseId, caseDef, stage, target, arrangement:{ly,xs}, selected:'lamp', assessment, status:'playing', guideOn, usedGuide:false, hintsUsed:0, hintIndex:0 }`。`stage = stageOf(caseDef)`、`target = buildTarget(stage)`、`arrangement` は開始の配置、`guideOn = caseDef.guide === 'on'`。
- `movableIds(session)`：`['lamp', ...x.min < x.max の道具のid]`（邪魔な道具も含む）。
- `select(session, id)`：`movableIds` にあるときだけ選び、`true`。それ以外は無視して `false`。
- `setLamp(session, ly)` / `setPropX(session, id, x)`：範囲に収める。非有限・固定の道具・未知のid・`status==='solved'` は無視して `false`。変えたら `assessment` を再計算して `true`。
- `nudge(session, direction, step)`：`direction` は `-1` か `1`（それ以外は `RangeError`）。選択が灯りなら `ly`、道具なら `x`。範囲の端で動かなければ `false`。
- `reset(session)`：配置を開始へ。`guideOn`・`usedGuide`・`hintsUsed` は変えない。`status` が `playing` に戻る。
- `toggleGuide(session)`：新しい `guideOn` を返す。**プレイヤーが消えている状態から付けたとき**に `usedGuide=true`（夜1の最初から付いているガイドは数えない）。
- `useHint(session)`：`{ index, text }` を返す（`caseDef.hints` を順に巡る）。`hintsUsed` を増やす。
- `confirmSolve(session)`：`assessment.success` のときだけ、正解の配置へそろえて `status:'solved'`・`assessment` 更新・`true`。そうでなければ `false` で変更なし。
- `describeAssessment(session)`：`{ step, label, detail }`。`success`→`{step:4, label:'再現できた'}`、`iou ≥ stage.threshold.union` なのに成功でない→`{step:3, label:'あと少し', detail}`（`decoysOk` が偽なら「関係ない道具の影が残っている」、そうでなければ「ずれている道具がある」）、`band` が `near`→`{step:3, label:'近い'}`、`warm`→`{step:2, label:'すこし似ている'}`、`far`→`{step:1, label:'遠い'}`。
- `lampReadout(session)`：灯りの高さを整数cmへ丸めた数。`propReadout(session, id)`：道具の横位置を整数cmへ丸めた数。
- 試験は、5夜すべてについて「開始は不合格」「正解の±2cmで `confirmSolve` が真」「±12cmで偽」、範囲・無視・`reset` の不変量、`describeAssessment` の各分岐（合成か実データで）、`toggleGuide` の `usedGuide`（夜1は初期ON・消す→付けるで true、夜2は付けると true）を確かめる。

### 7. `lib/game.js` と `tests/game.test.mjs`
進行と保存。契約は `model.md` の「進行」。補足：
- `emptyProgress()` は毎回新しい物を返す。`loadProgress(storage)` は、`storage` が無い・`getItem` が例外・JSONが壊れている・`v` が違う・`cleared` が不正・星が1〜3の整数でない、のどれでも例外にせず空（または不正な項目だけ捨てた）を返す。知らない夜のidは捨てる。
- `saveProgress(storage, progress)` は、`setItem` が例外なら `false`、成功で `true`。保存する形は `{"v":1,"cleared":{"rack":{"stars":3}},"last":"rack"}`。
- `isUnlocked(progress, index)`：index 0 は常に真。index n は、`CASES[n-1].id` が `cleared` にあるとき真。範囲外は偽。
- `starsFor({ usedGuide, hintsUsed, wrongAnswers })`：使った種類（ガイド・ヒント・誤答。`hintsUsed>0`・`wrongAnswers>0` で1種類）の数を数え、`3 − min(2, 種類数)`。
- `recordClear(progress, caseId, stars)`：新しい進行を返し（元は変えない）、最も高い星を残し、`last` を `caseId` にする。知らないidや範囲外の星は `RangeError`。
- `totalStars`・`clearedCount`・`nextIndex`（最初の未解決の夜のindex。全部解決なら `CASES.length`）。
- 試験は、星の全組み合わせ、解放の連鎖、最高星の保持、壊れた保存（上の列挙すべて）、`storage` の偽物（Map で作る）での往復、不変性を確かめる。

## 受け入れ
- `node --test day-071-kage-shogen/tests/` が全件成功し、全体で15秒以内。
- `node scripts/check-syntax.mjs` が成功する。
- 新しいファイルに、秘密値・ローカルの絶対パス・ネットワーク呼び出しが無い。
- 参照実装の不備を直した場合は、その箇所・理由・追加した試験を記録に書く。

## 記録と報告
`.agent-harness/runs/day071-kage-shogen/wp-a.md` に、作ったファイル・試験の件数と実行結果（コマンドと出力の要点）・判断したこと・参照実装を直した箇所（無ければ「なし」）・未解決を、事実だけで書く。
最終回答には、同じ要点を短く書く。
