# E2E が使う id・data 属性と、保存・状態の形（ここに書いた名前を変えない）

## 状態の属性（画面の今を外から読めるようにする）

| 要素 | 属性 | 値 |
|---|---|---|
| `html` | `data-ready` | 最初の描画が終わったら `"true"` |
| `html` | `data-layout` | `tall` `compact` `tiny` `short` `wide`（reference/layout.mjs の layoutMode） |
| `#app` | `data-level` | `L1`〜`L8` |
| `#app` | `data-status` | `play`（遊んでいる）`caught`（見つかった）`dead`（詰み）`escaped`（成功）`demo`（お手本の再生中） |
| `#app` | `data-steps` / `data-treasure` / `data-fails` | 手数／宝 `0` か `1`／この面で失敗した回数（面を変えると0） |

## 盤（`#board` は `<svg role="img">`。`data-cols` `data-rows`）

| 要素 | 属性 | 意味 |
|---|---|---|
| `.cell` | `data-x` `data-y` | 床のマス（全マスに1つずつ。壁は `data-wall="1"`） |
| `.cell` | `data-lit="1"` | 今光っている（scene().lit） |
| `.cell` | `data-next="1"` | 次の1手で光る（scene().preview の光） |
| `.cell` | `data-shadow="1"` | 影（scene().shadows） |
| `.player` | `data-x` `data-y` | 怪盗 |
| `.box` | `data-i` `data-x` `data-y` | 箱（i は面データの B の順・0から） |
| `.guard` | `data-i` `data-x` `data-y` `data-facing` `data-next-action` | 警備員。facing は U/R/D/L、next-action は preview の action（move・turn・turn-box・rotate・still） |
| `.laser-src` | `data-i` | レーザーの台 |
| `.treasure` / `.exit` | `data-taken` / `data-open` | `0` か `1` |
| `.caught-beam` / `.caught-mark` | — | 見つかったときだけある（原因の光の通り道の枠・怪盗の印） |
| `#board-text` | — | 「盤を文で読む」の `<details>` |

E2E は「見えている光＝判定」を、`.cell[data-lit]` の集合と `lib/sim.js` の `scene()` を突き合わせて確かめる。

## ボタンと欄（id は1つずつ。押せるものは全部 `<button>` か `<a href>`）

| id | 役 |
|---|---|
| `#btn-share` → `#share-dialog`（中に `#share` と `#btn-share-close`） | アプリの共有。`aria-label="このアプリを共有する"`。共通の shared-share 試験がこの形を前提にする |
| `#btn-howto` → `#howto-dialog`（`#btn-howto-close`、切替 `#opt-letter-keys`＝`<button role="switch" aria-checked>`・高さ44px以上） | あそびかた。切替は文字のキーを使うか（チェックボックスは小さくて44pxの決まりを満たせないので使わない） |
| `#btn-sound` | 音の切替。`data-muted="1"` か `"0"` |
| `#btn-prev` `#btn-next-level` `#btn-levels` `#btn-hint` `#hint` | 面の帯（`#btn-hint` は compact・tiny だけ見える） |
| `#level-dialog` の `.level-row[data-level="L3"]`、`#btn-levels-close` | 面の一覧（各行は高さ52px） |
| `#steps` `#par` `#treasure-state` | 状態の行 |
| `#controls` の `#btn-up` `#btn-right` `#btn-down` `#btn-left` `#btn-wait` `#btn-undo` `#btn-restart` | 操作。各ボタンに `data-action`（`U` `R` `D` `L` `.` `undo` `restart`） |
| `#panel-caught`（`#caught-text` `#btn-caught-undo` `#btn-caught-restart` `#btn-caught-demo`） | 見つかった欄 |
| `#panel-dead`（`#dead-text` `#btn-dead-undo` `#btn-dead-restart` `#btn-dead-demo`） | 詰みの欄 |
| `#panel-clear`（`#clear-stars[data-stars]` `#clear-steps` `#clear-note` `#btn-next` `#btn-again`） | 成功の欄 |
| `#result-share`（`#share-x` `#share-line` `#share-copy` `#share-native` `#share-said`） | 結果の共有。`#share-native` は `navigator.share` があるときだけ表示 |
| `#btn-demo` | 状態の行の右端の「お手本」。この面で2回失敗したら出る（`hidden` を外す） |
| `#demo-progress` `#btn-demo-stop` | お手本の進み具合ととめるボタン。`#demo-progress` は札の形（状態の行）。盤の上の `#demo-badge` は修正1周目で廃止（面5で出口を隠した） |
| `#live`（`aria-live="polite"`・見えない）`#toast`（`role="status"`・見える一言） | 読み上げと一言。同じ文を両方に出す作法（`#toast` は `aria-hidden="true"` で二重に読まれない）。お手本の終わりの文も同じ作法で、約3.2秒出す |
| `#hintline`（`data-open`） `#hint` `#btn-hint-close` | ヒントと一言の行。tall・short・wide は面の帯の下（`#levelwrap` の中）、compact・tiny は状態の行（`#status` の中）に JS が置く。`#toast` もこの中（盤には入れない）。`data-open="0"` はヒントを閉じている（compact・tiny）。開いている間、`#status[data-hint="1"]`（修正2周目） |
| `#share-row`（`data-count`） | 結果を送るボタンの行。`data-count` は見えているボタンの数（3か4）。3つのとき、最後を横いっぱいにする（修正2周目） |
| `#panel-clear[data-all]` | `1` は全面クリア（見出しが「全8面クリア！」）。`0` はふつうの成功 |
| `.player-ring` `.player-loot` | 自分の駒の淡い輪（見つかったときは出さない）と、宝を持った印（修正2周目） |
| `#keyhelp` `#howto-keys` | キーの案内（盤の横（wide だけ見える）とあそびかた）。文字のキーを使わない設定のときは、矢印・Space・Backspace だけの文になる |

結果の欄は、操作の `#controls` を隠して同じ場所に出す（`hidden` 属性で切り替える）。3つの欄が同時に出ることはない。

## 起動と URL

- 起動時の面：`?level=N`（N は1〜8の整数。それ以外は無視）があればその面。無ければ、星の無い面のうち一番若い面。全部に星があれば面1。
- `?level=` は E2E と体験評価が面へ直行するために使う。共有の URL には付けない（canonical のまま）。
- 起動の最後に `html[data-ready="true"]`。それまで操作は受け付けない。

## 保存（localStorage）

- 定数名は `STORAGE_NAME = 'hakokageKaito.v1'`（「_KEY」で終わる名前は gitleaks が誤検知するので使わない）。
- 形：`{ "muted": false, "letterKeys": true, "levels": { "L1": { "stars": 3, "best": 10 } } }`。成功したときに stars は大きい方、best は小さい方で上書き。お手本の再生では保存しない。
- 読み書きは try/catch で囲む。壊れた JSON・使えない storage・知らない面のIDでも落ちずに既定値で遊べる。

## 画面の状態の移り変わり（app.js が持つ。ルールは lib/sim.js だけが決める）

`play` →（act で caught）→ `caught` →（ひとつ戻す）→ `play`
`play` →（押した直後の canWin が dead）→ `dead` →（ひとつ戻す）→ `play`（戻した後は調べ直さない。次に箱を押したときにまた調べる）。canWin は箱を押した手の act() の直後に同期で呼び、dead ならその時点で `data-status="dead"` にして以後の移動を受けない。欄は動きの終わりに出す
`play` →（escaped）→ `escaped` →（次の面へ・もう一度）→ `play`
`caught`・`dead` →（お手本を見る）→ `demo` →（終わる・とめる）→ 最初の状態で `play`
戻すの記録（history）は state の配列。「最初へ」は history を消さず、最初の状態を1つ積む（押し間違えても「ひとつ戻す」で取り消せる。確認の窓は出さない）。面を変えると history と失敗の回数を消す。
