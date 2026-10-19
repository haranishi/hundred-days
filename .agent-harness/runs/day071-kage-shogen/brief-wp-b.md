# 依頼書 WP-B：影証言（Day071）の画面の動き（app.js）と実ブラウザ試験

## あなたの役割
実装担当。作業ディレクトリは、このリポジトリ（haranishi/hundred-days）のworktree。ブランチは `feat/day-071-kage-shogen`。
git操作（add・commit・checkout・push など）はしない。ネットワークは使わない。
**この環境では Chromium が起動できず、ローカルの待受（listen）も拒否されることがある。** 実ブラウザの試験は書くだけで、実行はできない（設計側が実行する）。代わりに、構文検査と、試験が使うセレクタが `index.html`・`app.js` に存在することの静的な突き合わせを自分で行う。

## 触ってよいファイル
- `day-071-kage-shogen/app.js`（新規）。補助のモジュールを作りたいときは `day-071-kage-shogen/lib/ui.js` の1本まで。作ったら `tools/serve.mjs` の許可リストと `tests/preview.test.mjs` に足す。
- `tests/e2e/day-071.spec.mjs`（リポジトリ直下の `tests/e2e/`。新規）。
- 純粋な補助関数（文の組み立てなど）を `lib/ui.js` に置くなら、その単体試験 `day-071-kage-shogen/tests/ui.test.mjs` と `tests/index.js` への登録。

## 触らないファイル
`index.html`・`app.css`（設計側が持つ。変更が要るときは、記録に「提案」として書く）、`lib/` の既存ファイル（`geometry`・`shapes`・`score`・`cases`・`deduction`・`config`・`stage`・`game`・`transform`・`hit`・`view`）、`tests/` の既存の試験、`scripts/`・`docs/`・`shared/`・`.kiro/`・`.agent-harness/contracts/`・他のDay。
`lib/` に明らかなバグを見つけたら、直さずに記録へ書く。

## 最初に読むもの（この順）
1. `AGENTS.md`・`docs/ci.md`。
2. `.kiro/specs/day-071-kage-shogen/ux.md`（**全文**。DOM契約・操作・成功の演出・推理・焦点・レイアウト）、`requirements.md`、`model.md`、`design.md`。
3. `day-071-kage-shogen/index.html` と `app.css`（特に末尾の「app.js が作る要素」。classの構造はそのとおりに作る）。
4. `day-071-kage-shogen/lib/` の全ファイル。APIは各ファイルの冒頭と `model.md`。`stage.js`（セッション）・`game.js`（進行）・`view.js`（描画器）・`hit.js`（つかむ対象）・`transform.js`・`deduction.js`・`cases.js`・`config.js` は必ず読む。
5. 実例：`day-070-flip-court/app.js`（dialogと焦点の戻し・共有の結線・入力の解放）、`tests/e2e/day-070.spec.mjs`（E2Eの型：preview起動・外部通信の遮断・CSP違反の検出・共有APIの偽物）。

## 作るもの

### 1. `day-071-kage-shogen/app.js`
`index.html` が `<script type="module" src="./app.js">` で読む。**モデルやデバッグ用のグローバルを公開しない。** 文は `textContent` で入れ、`innerHTML` にデータを渡さない。インラインのstyle属性・`eval`・外部通信を使わない（previewのCSPは `script-src 'self'; style-src 'self'`）。

#### 起動
- 要素を `id` で取る。`localStorage` は `try` で包んで取り、取れなければ `null`（保存不可）。`loadProgress(storage)` で進行を読む。
- 描画器を作る：`createWallRenderer(#wall)`・`createSketchRenderer(#sketch)`・`createSketchRenderer(#sketch-brief)`・`createWallRenderer(#wall-result)`・`createSideRenderer(#side-view)`。どれか1つでも `null` なら描画不可：`#unsupported` を表示し、事件のカードを `aria-disabled="true"` にして開けないようにする。
- 各canvasに `ResizeObserver` を付け、変わったら `resize()` して描き直す。`window` の `resize` でも同じ。非表示だったcanvasが表示されたとき（0→正の大きさ）にもObserverで描き直される。
- home を描いて `showPhase('home')`。起動時に焦点は動かさない。

#### phase（`showPhase(name)`）
`#app[data-phase]` を更新し、`[data-panel]` の面板を `name` のものだけ表示（`hidden` の付け外し）。`#back` は home 以外で表示。`#app[data-case]` に夜のid（無ければ空）。
- phase を出る・はじめから・事件簿へ戻る・dialogを開く・ページが隠れる（`visibilitychange`）・`window` の `blur`、のどれでも、**ドラッグ・微調整の長押し・合格の保持・そろえる動き・光らせる動き**のタイマー／rAFを止める。古い結果を新しい状態へ適用しない。
- 焦点：home→`#home-title`、briefing→`#briefing-title`、stage→`#wall`、solved→`#to-deduction`、deduction→`#deduction-title`、verdict→`#next-case`、epilogue→`#epilogue-title`。起動直後のhomeは焦点を動かさない。
- deduction を出るときは、`#deduction-message` を元の位置（`#suspect-list` の直後）へ戻して隠す。

#### home
`#case-list` に、`app.css` 末尾の構造どおり `li > button.case-card[data-case-id][data-locked]` を作る（`第N夜`・題・一文・状態）。
- 解決済み：`.stars[role=img][aria-label="星3つ中2つ"]` に `i.star`（`is-on` が星の数）×3。
- 開いていて未解決：「未解決」の文。
- 鍵つき（`isUnlocked` が偽）：`.lock-note` に `i.lock-icon` と「前の夜を解決すると開く」。`aria-disabled="true"`。押しても何も開かず、`#feedback` に「前の夜を解決すると開きます」。
- `#total-stars` に `totalStars(progress)`。`#reset-progress` で `#reset-dialog` を開き、`#reset-confirm` で `emptyProgress()` を保存して home を描き直し、dialogを閉じる。`#reset-cancel` で閉じる。
- 解決していて開ける夜は、いつでも遊び直せる（星は最高を残す）。

#### briefing（`startBriefing(index)`）
開かない夜は何もしない。`createSession(CASES[index])` を作り、`#briefing-place`（場所）・`#briefing-title`（`第N夜　題`）・`#briefing-intro`・`#witness-name`・`#witness-role`・`#witness-quote`（`「…」`）を入れ、`#sketch-brief` に `render(session.stage)`、`showPhase('briefing')`。`#start-case` で stage へ。

#### stage
`startStage()`：`#stage-title`（`第N夜　題`）・`#strip-quote`（`名前（職）「…」`）を入れ、`#sketch` を描き、`#stage-clues` に `li.clue[data-kind] > span.clue-kind + span.clue-text` を、**証言（全文）・現場（`sceneNote`）・足跡（`footprint`）・決まり（rule）・踏み台（stool、あれば）・アリバイ（alibi）**の順で入れる（kind名は「証言／現場／足跡／決まり／踏み台／アリバイ」）。`#clues`（details）は夜1だけ開いて始める。`#hint-text`・`#band-text` を空に、`#guide-toggle`・`#hint` を初期の文にし、`showPhase('stage')`。

**描画**：描画は状態が変わったときだけ、`requestAnimationFrame` で1回にまとめる（`requestRender()`）。`wallRenderer.render({ stage, arrangement: visual ?? session.arrangement, selected: session.selected, guideOn: session.guideOn, flash })`。

**つかむ・動かす（`#wall`）**
- `pointerdown`：primaryのみ、phase=stage かつ `session.status==='playing'`、すでにドラッグ中なら無視（2本目の指は無視）。`#wall` の `getBoundingClientRect()` で座標を取り、`createTransform(rect.width, rect.height)` と `hitTest(transform, session.stage, session.arrangement, px, py)` で対象（'lamp'／道具id／null）を得る。null なら何もしない。対象があれば `select()`、`setPointerCapture`、`preventDefault`、`#wall` に焦点（`preventScroll`）、ドラッグを `{ pointerId, id, startX, startY, startValue, scale }` で記録（lampなら `arrangement.ly`、道具なら `arrangement.xs[id]`）。
- `pointermove`（同じpointerIdのみ）：灯りは `setLamp(session, startValue − (clientY − startY) / scale)`、道具は `setPropX(session, id, startValue + (clientX − startX) / scale)`。相対移動（押した位置から）。
- `pointerup`・`pointercancel`・`lostpointercapture`・`#wall` の `blur`：ドラッグを終える（1回だけ）。
- 変化のたびに `afterChange()`（下記）。

**キーボード（`#wall` の `keydown`）**：phase=stage・playing のとき。`ArrowUp/Down`＝選択が灯りなら `nudge(session, +1/−1, step)`、`ArrowRight/Left`＝選択が道具なら `nudge(session, +1/−1, step)`。`step` は Shift で `STEP.coarse`、なければ `STEP.fine`。矢印キーは、使わない向きでも `preventDefault`（ページがスクロールしないように）。Ctrl/Meta/Altが付いたものは無視。

**選択チップ（`#item-select`）**：`movableIds(session)` から `button.chip[role=radio][aria-checked][data-item]` を作る（「灯り」と、すべれる道具の `label`）。クリックで `select()`。選択中だけ `tabindex=0`、他は `-1`。チップ上の ←→↑↓ で前後へ移して焦点も動かす（ラジオグループの作法）。選択が変わったら、`#nudge-minus/#nudge-plus` の文とアイコンを更新：灯り＝「下げる」(`.nudge-down`)／「上げる」(`.nudge-up`)、道具＝「左へ」(`.nudge-left`)／「右へ」(`.nudge-right`)。`#feedback` に「灯りを選びました」「帽子を選びました」。夜1・夜2はすべれる道具が無いので「灯り」のチップだけ。

**微調整（`#nudge-minus`・`#nudge-plus`）**：マイナスは向き −1、プラスは +1。`pointerdown`（primary）で即1回（`STEP.fine`）、400ms後から60msごとに繰り返す。`pointerup`・`pointercancel`・`pointerleave`・`blur`・`visibilitychange`・phase変更・dialogを開く、で止める。キーボードでの押下（Enter/Space）は `click` イベントの `detail===0` のときだけ1回動かす（ポインター由来の click は無視）。繰り返しのたびに `afterChange()`。

**読み出し**：`#lamp-readout` を「灯り `<strong>n</strong>cm」に（DOMで組み立てる）、`dataset.ly=n`。道具を選んでいるときだけ `#item-readout` に「`label` 横 `n`cm」を出して表示（灯りなら `hidden`）。`n` は `lampReadout`・`propReadout`。
**近さ**：`describeAssessment(session)` の `step`（1〜4）で `#meter[data-band]` を `far/warm/near/match` に、`aria-label` を「近さ：ラベル」に。`#band-text` には `label`、`detail` があれば `label（detail）`。ラベルが変わったら、操作が止まって250ms後に `#feedback` へ同じ文を出す（ドラッグ中の細かな変化は読み上げない）。

**ガイド（`#guide-toggle`）**：`toggleGuide(session)`。`aria-pressed` は `guideOn`。文：`guideOn` なら「ガイドを消す」、そうでなければ、夜1で未使用なら「ガイドを重ねる」、それ以外は「ガイドを重ねる（★−1）」。初めて使った（`usedGuide` が偽→真）とき `#feedback` に「ガイドを使ったので、この夜の星が1つ減ります」。夜1の初期ガイドは星を減らさない（`stage.js` が担う）。
**ヒント（`#hint`）**：初期の文は「ヒント（★−1）」、使ったあとは「次のヒント」。押すと `useHint(session)` の `text` を `#hint-text` に「ヒント{index+1}：{text}」で出して表示し、`#feedback` にも出す。
**はじめから（`#reset-stage`）**：`reset(session)`、`visual=null`、タイマーを止め、`afterChange()`、`#feedback` に「はじめからにしました」。

**`afterChange()`**：読み出し・近さ・チップ・ボタンの文を更新、`requestRender()`、合格の保持の判断：まず保持タイマーを止め、`session.assessment.success` かつドラッグ中でなく微調整の長押し中でもないなら、`SOLVE_HOLD_MS` 後に `commitSolve()` を予約する。変化が入れば必ず予約し直す。

**成功（`commitSolve()`）**：予約の時点で、まだ phase=stage・playing・success・ドラッグ中でないことを確かめる。`from`＝現在の配置を写し、`confirmSolve(session)`（配置が正解になる）。`prefers-reduced-motion: reduce`（`matchMedia` を使う時点で読む）なら、そろえる動きも光らせる動きも省いて即 `enterSolved()`。そうでなければ、`SNAP_MS` で `from` から正解へ補間した配置を `visual` として描き（イーズアウト）、続けて 600ms で `flash` を 1→0 に下げ、終わったら `enterSolved()`。途中で phase が変わったら全て止める。

#### solved（`enterSolved()`）
`#reveal-text`（`reveal`）・`#reading-text`（`readingOf(caseDef)`）を入れ、`#wall-result` に `render({ stage, arrangement: 正解, selected: null, guideOn: true, flash: 0 })`、`#side-view` に `render({ stage, caseDef, arrangement: 正解 })`、`showPhase('solved')`、`#feedback` に「再現できた」。`#stamp` はCSSのアニメーションで現れる（JSで触らない）。`#to-deduction` で deduction へ。

#### deduction
`#deduction-clues` に `li.clue[data-kind]` を、**決まり（rule）→踏み台（stool、夜4だけ）→アリバイ（alibi）→再現（result。文は `readingOf(caseDef)`）**の順に。`#suspect-list` に `suspectsOf(caseDef)` から `li.suspect[data-suspect-id]` を `app.css` 末尾の構造どおりに作る：`h3.suspect-name`（名前）・`p.suspect-meta`（`職・身長cm`）・`span.suspect-badge[hidden]`（「ちがう」）・`p.suspect-statement`（`「…」`）・`button.button.button-ghost.exclude[aria-pressed=false]`（文「外す ✕」）・`button.button.button-primary.accuse`（文「この人だ」）。
- `.exclude`：`aria-pressed` と `.is-excluded` を付け外し（判定に使わない）。
- `.accuse`：`judge(caseDef, id)`。**誤り**：`wrongAnswers += 1`、カードに `.is-wrong`、`.suspect-badge` を表示、その `.accuse` を無効（`disabled`）、`#deduction-message` をそのカードの末尾へ移して `message` を入れて表示、`#feedback` に同じ文。**正解**：`finishCase()`。
- `#deduction-hint`：初期の文「考え方を見る（★−1）」。押すと `#deduction-hint-text` に `caseDef.deductionHint` を出して表示し、`deductionHintUsed=true`、ボタンを無効に。ヒントとして数える。
- `showPhase('deduction')` で、`wrongAnswers`・`.is-wrong`・✕・`deductionHintUsed` はその夜の開始時にリセット済み（`startBriefing` で初期化）。

#### verdict・epilogue
`finishCase()`：`stars = starsFor({ usedGuide: session.usedGuide, hintsUsed: session.hintsUsed + (deductionHintUsed ? 1 : 0), wrongAnswers })`、`progress = recordClear(progress, id, stars)`、`saveProgress(storage, progress)`（偽なら `#storage-note` を表示）。`#verdict-title`（`第N夜　題`）・`#verdict-text`（`closing`）・`#verdict-stars`（`.stars`（`aria-label="星3つ中{n}つ"`、`i.star(.is-on)`×3）と、続けて `span` の文：`星{n}つ`＋`（ガイドを使った・ヒントを使った・誤った推理があった のうち該当するものを「・」でつないで）`、1つも無ければ `（ガイド・ヒント・誤答なし）`）。`#next-case`：最後の夜でなければ「次の夜へ →」で次の夜の briefing、最後の夜（夜5）は「エピローグへ →」で epilogue。`#to-home` で home（home を描き直す）。
epilogue：`#epilogue-title`（`EPILOGUE.title`）・`#epilogue-text`・`#epilogue-stars`（文「合計 N / 15」）、`#epilogue-share` で `#share-dialog` を開く、`#restart` で home。

#### dialog・共有・案内
`#help`→`#help-dialog`、`#share-open`・`#epilogue-share`→`#share-dialog`、`#reset-progress`→`#reset-dialog`。Day070の `openDialog/closeDialog/restoreDialogFocus`・`cancel`・`close` の処理に倣い、閉じたら開いた操作へ焦点を戻す（非同期の取り返しをしない）。開く間は、ドラッグ・長押しを止める。`#share` は `shared/share.js` が据え付ける（触らない）。
`#storage-note` は保存不可（`storage` が `null` または `saveProgress` が偽）のとき表示。保存不可でも最後まで遊べる。

### 2. `tests/e2e/day-071.spec.mjs`
`tests/e2e/day-070.spec.mjs` と同じ型（`tools/serve.mjs` を子プロセスで `PORT=0` で起動し、標準出力のURLを読む／外部リクエストを遮断／`page.on('pageerror'・'console')`／CSP違反の検出／クリップボード・共有シートの偽物）。viewportは390×844、`hasTouch: true`。`page.clock` は使わない。試験が座標を要るときは、`../../day-071-kage-shogen/lib/` の `cases.js`・`transform.js`・`hit.js` を import して、`#wall` の `boundingBox()` から `createTransform(box.width, box.height)` で画面座標を計算する。DOM契約のIDと `data-*` と表示文だけを使う。
進行を前提にする試験は、`page.addInitScript` で `localStorage['kage-shogen:v1']` に `{"v":1,"cleared":{...},"last":null}` を入れて始める（夜を解放する）。

最低限の試験（それぞれ独立して通ること）：
1. **home**：題・5枚のカード・夜2以降は鍵（`data-locked="true"`）・`#total-stars` が 0・`#back` が非表示。`#help` で dialog が開き、閉じると `#help` に焦点が戻る。鍵のカードを押しても phase が変わらない。
2. **夜1をキーボードで完走**：夜1→`#start-case`→stage。`#wall` に焦点。`#lamp-readout` が 150。↓を使って 99 まで下げる（Shift+↓×10 と ↓×1）。`#app[data-phase="solved"]` になる（待つ）。`#reading-text` に「165cm」。`#to-deduction`→deduction。まず `[data-suspect-id="hinata"] .accuse`（アリバイで外れる人）で誤り：`#deduction-message` が表示され、そのカードの中にある。次に `moriyama` で正解：verdict、`#verdict-stars` に「星2つ」と「誤った推理があった」。`#next-case` で夜2の briefing。
3. **保存の復元**：夜1を解決してから `page.reload()`。home で夜1に星、夜2が開いている。
4. **灯りのポインター操作**：夜2を解放して開く。灯りの玉の位置（`createTransform` で計算）でマウスを押し、y方向に動かして離す。`#lamp-readout` の値が動いた向き・量（`scale`）と一致する。灯りの玉から離れた何も無い所を押しても動かない。
5. **すべれる道具**：夜3を解放して開く。チップ「帽子」を選び、→で `#item-readout` が増える。ポインターで帽子をドラッグすると横位置が動く。「はじめから」で開始へ戻る。固定の道具（夜1の外套掛け）はつかめない。
6. **夜3を完走**：チップと矢印キー（Shiftで5cm）で、灯りを102、帽子・外套・鞄を各 `x.solution` に合わせる（誤差±2cm以内）。success で solved へ。星は3つになる（ガイド・ヒント・誤答なし）まで進める。
7. **夜5の邪魔な道具**：夜5を解放して開く。灯りと傘・外套・長靴を正解に合わせても、山高帽・地球儀が壁に残っているあいだは solved にならず、`#band-text` に「関係ない道具の影が残っている」。2つを壁の端（`x.solution`）へ動かすと solved になる。
8. **ガイドとヒント**：夜2で「ガイドを重ねる（★−1）」→ `aria-pressed="true"`、文が「ガイドを消す」。ヒントを押すと `#hint-text` に「ヒント1：」から始まる文。この夜を解決すると、星が1つ減っている（verdict の文に「ガイドを使った・ヒントを使った」）。
9. **共有**：`#share-open` で dialog が開き、`#share` にX・LINE・リンクのコピー（と、偽の `navigator.share` があるときは共有シート）。コピー失敗・共有の取り消しのあとも、画面と進行が残る。Day070の共有の試験に倣う。
10. **描画不可・保存不可**：`HTMLCanvasElement.prototype.getContext` を `null` を返すよう差し替えると、`#unsupported` が表示され、夜1のカードが `aria-disabled="true"` で、押しても briefing に進まない。`localStorage` の取得が例外を投げる環境では、夜1を解決しても最後まで遊べ、`#storage-note` が表示される。
11. **幅**：360・390・768・1440 で、home・stage・deduction に横スクロールが出ない（`documentElement.scrollWidth <= clientWidth`）。stage の `button` は高さ44px以上。
12. **reduced-motion**：`page.emulateMedia({ reducedMotion: 'reduce' })` で夜1を解決しても、solved に進む。
全試験の `afterEach`：ページ／コンソールのエラー0、HTTPエラー0、外部リクエスト0、CSP違反0、本文に `undefined`・`NaN`・`[object` が無い。

## 受け入れ
- `node scripts/check-syntax.mjs` が成功する。`node --test day-071-kage-shogen/tests/` が全件成功のまま。
- E2Eの試験が使うID・セレクタ・表示文が、`index.html`・`app.js`・`lib/` の実際の文と一致する（静的に突き合わせて、結果を記録に書く）。
- `app.js` に、秘密値・ローカルの絶対パス・外部通信・`innerHTML` へのデータ代入・インラインstyleが無い。

## 記録と報告
`.agent-harness/runs/day071-kage-shogen/wp-b.md` に、作ったファイル・設計したこと・静的に突き合わせた結果・`index.html`／`app.css`／`lib/` への提案（あれば）・未確認を、事実だけで書く。最終回答にも同じ要点を短く書く。
