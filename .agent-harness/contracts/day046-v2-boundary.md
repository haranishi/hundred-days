# Day046 v2 共通境界（物理担当と画面担当の受け渡し）

正本は `day-046-namahage-night/DESIGN-v2.md`（§2〜§8）。ここは2人が同時に作業するために、§8の受け渡しを先に確定したもの。**どちらもこの境界を変えない。**変えたくなったら自分の側で吸収し、報告に書く。

## 1周目の範囲（§8のとおり）
入れる: 雪うさぎ `R`・雪かきイノシシ `B`／風呂敷 `F`・駆け鈴 `S`／雪台 `J`・崩れる枝 `%`／全20面に米俵6・餅2（うち任意餅1）／連続踏み倍率／3お札（早駆け・福集め・無傷）と面内得点・ミス巻戻し／保存v2／HUD・結果画面／4-5の安全終端16列と締め文／縦床・つららの表示位置修正。
入れない: フクロウ `O`・山わらじ `K`・反転する風・4軒点灯・新音源・チェックポイント・攻撃・体力。

## タイル記号
既存: `. # = ~ ^ o * C D M P G`。新規: `R B F S J %`（`%` は半角）。予約（今回は出さない）: `O K`。
- `R/B` は床の上に置く（床上面＝敵の底面）。`J` は当たり16×8（タイルの上端側）。`%` は当たり16×4（上端）。`F/S` は16×16の収集物。
- 面の主路（戸口までの必須経路）は **既存記号だけで通れる**こと。`J % F S` は任意路と報酬のために使う。`R/B` は主路に出てよい。

## 面データ（`lib/level-data.js` の各要素）
```js
{ id, name, world, sky, wind, rows,            // 既存
  parTicks: 1440,                                // 早駆けの上限。省略時 2400
  secretMochi: { col, row } | null,              // 任意餅の位置（rows 上の 'o' の1つを指す）
  entityOptions: { "col,row": { axis: 'x'|'y', phaseTicks: 0..639 } },  // 主に M 用。省略時 axis x・位相0
  routes: { safe: [{x,y,w,h}], reward: [{x,y,w,h}] } }                 // 検証用の矩形（px）。物理には使わない
```
`lib/levels.js` は `LEVELS`/`getLevel`/`levelId`/`tileAt`/`markers` を保ち、省略された新フィールドに既定値を入れて返す。`M` の軸は `entityOptions` から決める（`id==='2-4'` 決め打ちをやめる）。

## 状態（`lib/physics.js`）
`createState(id, options)` / `step(state, input)` / `advance(...)` の外部形は不変。`input = {left,right,jump}` のまま（追加入力なし）。
追加フィールド:
- `ability: null|'F'|'S'`, `abilityTicks: 整数`（§3の数値: F=1440tick, S=960tick。異種は即置換・同種は残りを規定値へ）
- `collectedRice: 0..6`, `secretCollected: 真偽`, `runHits`, `runMisses`, `attemptScore`（面内得点）, `entryScore/entryRice/entryLives`（面入口で固定）
- `combo`（連続踏みの段数。着地・被弾・ミスで0）
- `clearResult: { ticks, score, rice, secret, hits, misses, seals } | null`（戸口で確定。seals は 早駆け1・福集め2・無傷4 のビット和）
- `telemetry: [{ type, ... }]`（そのtickの構造化イベント。`events: string[]` は音用にそのまま残す）
- `pendingStage`（天井でつかえた成長の保留）
得点は §5: 米俵50・餅100・任意餅+200・クリア500・早駆け `10*floor(max(0,par-elapsed)/120)`・無傷300・福集め300・敵 C/D/R=100, B=150・連続踏み ×1/×2/×3。
ミス時の巻戻し（§5「やり直しと記録」）: 面内の敵・収集物を復元し、面内得点・米俵増分・追加残機を入口値へ戻し、累積ミス数ぶん残機を引く。`runHits/runMisses/elapsedTicks` は維持。

## 敵・足場のフィールド（描画側が読むもの）
`type, x, y, w, h, alive, phase, phaseTicks, retireTicks, direction`。`drawY` は `G` だけが持つ（他は実座標で描く）。
- `phase`: 敵は `waiting|warning|moving|resting|retired`、枝は `ready|cracking|absent`、それ以外は `ready`。
- 退場: `alive=false` にした後 `retireTicks` を24→0で数え、描画は絵を最大16px上へ動かして消す。
- 予告の絵は描画側が `phase==='warning'` を見て変える（うさぎ＝耳を2px下、イノシシ＝前脚下に雪色の点3個、枝＝左右1px振動）。

## 自動操作（`lib/autopilot.js`）
`createAutopilot(level, { mode: 'safe'|'collect' })`。省略時 safe。safe は能力なし・ちびで主路を通り戸口へ。collect は報酬を狙う。敵を消す・状態を書き換える補助は禁止。

## 保存（`lib/store.js`）
キー `namahage.v1` を維持し `rulesVersion: 2` と `recordsV2: { [id]: { bestTicks, bestScore, seals } }` を追加。旧 `bestMs` は転用しない。`unlockedWorld`・`muted` は維持。

## 絵（`lib/sprites/props.js`・作成済み）
`rabbit boar furoshiki bell snowpad branch`（および次周用 `owl waraji`）が16×16・共通16色で入っている。`frames.idle` のみ。描画は `R→rabbit, B→boar, F→furoshiki, S→bell, J→snowpad, %→branch`。

## 所有ファイル（同じファイルを2人で触らない）
- **物理担当（Codex）**: `lib/physics.js`, `lib/entities.js`, `lib/levels.js`, `lib/autopilot.js`, `tests/physics.test.mjs`, `tests/entities.test.mjs`, `tests/levels.test.mjs`, `tests/helpers.mjs`
- **画面担当（Claude Opus）**: `lib/level-data.js`, `lib/sprites/props.js`, `lib/render.js`, `lib/store.js`, `app.js`, `index.html`, `app.css`, `tests/sprites.test.mjs`, `tests/store.test.mjs`, `tests/app.test.mjs`, `tests/index.mjs`, `tests/e2e/day-046.spec.mjs`（リポジトリ直下）, `REQUIREMENTS.md`, `README.md`
- 触らない: `lib/sprites/hero.js`, `lib/audio.js`, `shared/`, `tools/`, `demo-scenario.mjs`, `DESIGN-v2.md`, 他のDay
