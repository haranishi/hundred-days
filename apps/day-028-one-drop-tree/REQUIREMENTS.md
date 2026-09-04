# Day 028「ひとしずくの木」要件定義

開くと鉢植えの木がいて、**「水をあげる」を1日1回押すと、その日のぶんだけ育つ**。木の形は端末ごとの種（乱数の種）から決まり、水をあげた回数だけ枝と葉が増える。忘れた日があれば葉がしおれるが、枯れも、やり直しもない。木は端末の中だけで育ち、通信は1本も出ない。

## 背景と狙い

- 100日チャレンジは Day 28。**この木も、Day 100 にどうなっているかは作者も知らない**。「毎日1回だけ、少し育つ」という時間の積み重ねを、数字ではなく1本の木の形で見せる。
- 習慣アプリの多くは連続日数（ストリーク）で人を縛る。このアプリは**連続を数えない**。数えるのは「水をあげた日」の総数だけで、忘れてもしおれるだけ、水をあげれば戻る。
- 難易度設計（Day21〜30）: **localStorage**（種の番号と水をあげた日付だけを保存。それが木の全て）＋**演出のこだわり1つ**（水をあげた瞬間、しずくが落ちて土に波紋が広がり、新しい枝と葉がほどけるように伸びる）。外部依存は0。
- 2026-09-04 に AI が出した4候補（掃除は1日1か所／定例の年間コスト／レポートの締切逆算／毎日開くと育つ植物）から本人が「毎日開くと育つ植物」を選んだ。

## ユーザーストーリー

| ユーザー | 欲しいことと理由 | 受け入れ条件 |
|---|---|---|
| 毎朝スマホで開く私（本命） | 1タップで「今日も来た」の証拠が残ってほしい。入力や設定はいらない | 開いて1秒で木が見え、「水をあげる」を1回押すと、その場で枝か葉が増えるのが分かる |
| 数日忘れた私（このアプリが救う相手） | 忘れた自分を責められたくない。戻ってきたときに「おかえり」であってほしい | 連続日数は出ない。「4日ぶりですね」と出て、水をあげると葉が持ち上がる。木は減らない |
| ひと月続いた私 | 育った木を人に見せたい | 「画像で保存」で 1080×1080 の PNG が落ち、「水をあげた日 30日」が入っている |
| 自分の木を眺めたい私 | 種から今日までの成長を見返したい | 「成長を見る」で種から今日の形まで数秒で育ち直す |
| 別の端末で開いた私 | 同じ木が出ないことを不思議に思う | 「木は端末の中だけで育ちます」と画面に書いてあり、通信も登録も無いことが分かる |
| もう一度やり直したい私 | 新しい種から始めたい。ただし誤操作で失いたくない | 「最初からやり直す」は2段階（押す→「手放す」）で、確認ダイアログは出ない |

## UX5階層

- **戦略**: 「習慣トラッカー」ではなく、**自分だけが育てている小さな生き物**。成功＝開く→1タップ→2秒後に昨日は無かった枝がある。ひと月後には、他の誰とも違う形の木がスクショしたくなる状態で立っている。失敗＝連続日数・スコア・通知が付いて、ただの習慣アプリに見えること。木が毎日同じに見えること。差別化の源泉は「1日1回しか押せない＝時間だけが木を育てる」と「忘れても枯れない」。
- **要件**: 載せるもの＝木（種から決まる形・水をあげた回数ぶんの枝葉・しおれ）／水をあげる／成長を見る（種からの再生）／画像で保存／最初からやり直す／使い方と約束。対象外＝通知、連続日数、複数の木、名前付け、着せ替え、共有のためのサーバー保存、天気やAPIとの連動、ゲーム要素（スコア・ランキング）。
- **構造**: 単一画面。上から「木（キャンバス）」→「状態の1行と伝言」→「水をあげる」→「成長を見る／画像で保存」→「使い方と約束」→「最初からやり直す」→シェア。900px以上は木を左、操作と説明を右の2列。迷う分岐は「今日はもうあげた」「時計が戻っている」「保存データが読めない」「localStorageが使えない」で、どれも木を消さずに一言返す。
- **骨格**: いちばん大きい要素は**木のキャンバス**1つ（正方形）。主要ボタンは「水をあげる」だけを塗りにし、押せないときは「今日はあげました」に文言を変えて無効化する。「成長を見る」「画像で保存」は枠だけ。「最初からやり直す」は文字ボタンで最下部。数字は「水をあげた日 12日 · 芽が出て 20日目」の1行だけ。
- **表層**: 地は生成り色、文字は墨色、主要ボタンと選択の印は深い緑。木は土色→若葉色へ、新しく伸びた部分は明るい若葉色。しおれは葉が下を向き、色が黄土色へ寄る（色だけに意味を持たせず、角度も変える）。花は薄桃色。演出は1つだけ、**しずくが落ちて波紋が広がり、新しい枝葉がほどける（1.4秒）**。`prefers-reduced-motion` では即座に最終形を描く。

### UX5階層を通したことで決まった実装（9件）

1. **1日1回しか押せない**（戦略層）。連打では育たない。判定は端末の現地日付（YYYY-MM-DD）で、同じ日付なら2回目は受け付けない
2. **連続日数を持たない**（戦略層）。保存するのは水をあげた日付の一覧で、数えるのは総数。連続が切れても何も減らない
3. **しおれは見た目だけ**（要件層）。枝葉の構造は減らず、水をあげた瞬間に元へ戻る。水をあげない期間が長いほど葉が下を向き、色が黄土色へ寄る（最大7日で頭打ち）
4. **木の形は種から完全に決まる**（構造層）。保存するのは種の番号と日付だけで、木の座標は保存しない。だから「成長を見る」（再生）が同じ計算で作れ、データが壊れても種さえ残れば木は戻る
5. **今日伸びた部分だけ色を変える**（表層層）。1日1段の成長は小さいので、新しい枝葉を明るい若葉色にして「今日はここが伸びた」を伝える
6. **開いた瞬間に木が出る**（骨格層）。スプラッシュや説明を先に出さない。使い方は木の下
7. **やり直しは2段階の行内確認**（骨格層）。`confirm()` は使わない。「最初からやり直す」→「手放す／やめる」
8. **保存できない環境でも育つ**（要件層）。localStorage が使えないときは「閉じると消えます」と伝えたうえで、その場では普通に動く
9. **画像で保存は木だけを書き出す**（戦略層）。画面のスクショではなく、木と「水をあげた日 N日」だけの1080×1080。見せたいのはUIではなく木

## 機能要件

**状態**
- `<main id="app" data-state="seed|ready" data-can-water="true|false" data-growing="false|true" data-replaying="false|true">` の1か所で切り替える
- `seed`: まだ一度も水をあげていない。キャンバスには鉢と土と、半分埋まった種。`#status`「まだ種です。水をあげると芽が出ます」。`#water` は押せる。`#replay` と `#save` は `disabled`
- `ready`: 1回以上水をあげた。`#status` は「水をあげた日 12日 · 芽が出て 20日目」。`#water` は `canWater` のときだけ押せる
- 読込中は無い（非同期処理が無い）。エラーは全画面にせず、木を消さない通知で返す
  - `#storage-error`（`role="status"`）：localStorage が読めない・書けない → 「この環境では木を保存できません。閉じると消えますが、その場では育ちます」
  - `#data-notice`（`role="status"`）：保存データが壊れていた・版が違う → 「保存データが読めなかったので、新しい種から始めます」
- 状態が切り替わったときのフォーカス：水をあげ終わったら `#plant`（`tabindex="-1"`）へ。やり直し確認を開いたら `#reset-no` へ。やり直したら `#water` へ

**日付（`lib/days.js`・純関数）**
- `localDateString(date)` → その端末の現地日付 `YYYY-MM-DD`
- `isDateString(value)` → `YYYY-MM-DD` で実在する日付か
- `daysBetween(from, to)` → 暦日の差（`to - from`）。`Date.UTC` で計算し、夏時間・うるう年に影響されない。負の値も返す

**判定（`lib/decide.js`・純関数）**

```
decide(record, today)
→ { steps, lastWateredOn, wateredToday, canWater, daysSinceWater, wilt, ageDays, status, kind }
```

- `record = { seed, plantedOn, wateredDays }`。`steps = wateredDays.length`、`lastWateredOn` は末尾
- `canWater = steps === 0 || lastWateredOn < today`（ISO文字列の比較）。`today <= lastWateredOn` は押せない（同じ日、または時計が戻っている）
- `daysSinceWater = lastWateredOn ? daysBetween(lastWateredOn, today) : null`
- `wilt = steps === 0 ? 0 : clamp((daysSinceWater - 1) / 6, 0, 1)`。昨日あげていれば 0、7日以上で 1
- `ageDays = plantedOn ? daysBetween(plantedOn, today) + 1 : 0`
- `status`（`#status` の文言）と `kind`：
  - `steps === 0` → kind `seed`、「まだ種です。水をあげると芽が出ます」
  - `wateredToday` → kind `done`、「今日の一滴はあげました。また明日」
  - `daysSinceWater === 1` → kind `waiting`、「今日の一滴を待っています」
  - `daysSinceWater >= 2` → kind `missed`、「{n}日ぶりですね。水をあげると元気になります」
  - `daysSinceWater < 0` → kind `clock`、「時計が戻っているようです。また明日」、`canWater=false`
- 検算：`lastWateredOn='2026-09-03', today='2026-09-04'` → `canWater=true, daysSinceWater=1, wilt=0`／`'2026-08-30'`→`'2026-09-04'` → `daysSinceWater=5, wilt=4/6`／`today='2026-09-03'` と同じ → `canWater=false, wateredToday=true`／`'2026-09-05'`→`'2026-09-04'` → `canWater=false, kind='clock'`

**木の生成（`lib/plant.js`・純関数・DOMに触れない）**

```
generatePlant(seed, steps)
→ { steps, segments: [{ id, parent, x1, y1, x2, y2, depth, born, width }],
    leaves: [{ id, segment, t, side, size, angle, born }],
    flowers: [{ id, segment, size, born }],
    stats: { branches, leaves, flowers } }
```

- 座標は単位正方形（左上原点・y下向き）。土の面は `y = 0.80`、幹の根元は `(0.5, 0.80)`。**`steps <= 400` のあいだ、すべての座標が `x ∈ [0.06, 0.94]`、`y ∈ [0.06, 0.80]` に収まる**（外へ出る候補は縮める・向きを内側へ倒すなど決定的に処理する）
- 乱数は `xorshift32`。**ステップ k の追加は `hash(seed, k)` から作った乱数列だけを使う**。こうすると同じ種・同じ回数なら必ず同じ木になり、`generatePlant(seed, n)` の `segments/leaves/flowers` は `generatePlant(seed, n+1)` の**先頭部分（prefix）**になる（`width` だけは子孫の数で毎回計算し直すので比較から外す）
- step 1：根元からほぼ真上へ幹1本（長さ 0.10 前後）と葉2枚
- step k ≥ 2：先端（子の無い枝）を1つ選んで枝を1本伸ばす。長さは `0.09 × 0.86^depth`（最小 0.03）、角度は親の向き ±18〜38° で左右を交互に、25% の割合で真上へ引き戻す。3ステップに1回は途中の枝からも分岐を1本足す。新しい枝には葉を1〜3枚。**毎ステップ必ず 1つ以上の要素（枝か花）が増える**
- 花は step 20 から 2ステップに1つ、花の無い先端に付ける。step 80 以降は枝を増やさず、葉と花だけ増やす（枝は最大でも 100 本程度で頭打ち）
- `width` は「その枝の子孫の枝数」から `0.006 + 0.004 × log2(1 + 子孫数)` で計算（幹ほど太い）
- `born` はその要素が増えたステップ番号。描画で「今日伸びた部分」を見分けるのに使う
- `stats` は本数・枚数・個数（キャンバスの `aria-label` に使う）

**描画（`lib/draw.js`）**
- `drawScene(ctx, { plant, size, wilt, progress, newborn })`：`size` は正方形の1辺（px）。DPR は呼び出し側で `canvas.width = size × dpr` と `ctx.scale` で処理する
- 描く順：鉢（テラコッタの台形＋縁）→ 土（暗い楕円）→ 枝（`id` 順・古い順）→ 葉 → 花。`steps === 0` は鉢・土・半分埋まった種だけ
- `newborn` に一致する `born` の枝は、親の端から `progress`（0〜1）ぶんだけ伸ばして描き、その葉と花も `progress` で拡大する。`progress = 1` で完成形
- `born === plant.steps` の枝と葉は明るい若葉色（枝 `#6f9d4a`・葉 `#8fcf6a`）、それ以外は幹 `#7a5a3c`〜枝先 `#5d8a3a`・葉 `#4f9a4a`
- `wilt`（0〜1）：葉を下向きに最大 55° 回し、色を `#4f9a4a` → `#a08a3c` へ補間。花は薄くなる。枝は変えない
- `drawDrop(ctx, size, t)`：しずく（`#5aa7d8`）が `y = 0.05` から土（`y = 0.79`）へ落ちる（`t` 0〜1）。`drawRipple(ctx, size, t)`：土の面に同心の波紋（`t` 0〜1）
- `roundRect` は使わない（対応差を避ける）。Canvas 2D の基本 API だけで描く

**木の保存（`lib/store.js`）**
- キー `day028.tree.v1`：`{ v: 1, seed, plantedOn, wateredDays, updatedAt }`
  - `seed`：1〜2147483647 の整数。`crypto.getRandomValues` が使えれば使い、無ければ `Math.random`
  - `plantedOn`：最初に水をあげた日（`YYYY-MM-DD`）か `null`
  - `wateredDays`：`YYYY-MM-DD` の昇順・重複なし。最大 4000 件（超えたら古い方を切る）
- `load(storage, makeSeed)` → `{ record, canSave, recovered }`。無ければ新しい種で `{ seed, plantedOn: null, wateredDays: [] }`。JSON が壊れている・`v` が違う・`seed` が不正 → 新しい種＋`recovered: true`。`wateredDays` は不正な要素を捨て、重複を除き、昇順に並べ直す。`plantedOn` が無いか不正で `wateredDays` があれば先頭の日付を使う
- `serialize(record, now)` は既知の項目だけを書く（余計な項目は落とす）。`save(storage, record, now)` は例外を `{ saved: false }` に変える
- **座標や画像は保存しない**。木は種と日付から毎回計算する

**水をあげる（`#water`）**
1. `today = localDateString(new Date())` で判定し直す。`canWater` でなければ `#message`「今日はもうあげました。また明日」で終わる
2. `steps === 0` なら `plantedOn = today`。`wateredDays` に `today` を足して保存する（保存に失敗しても、その場の状態は進める）
3. `data-growing="true"` にして `#water` を無効化し、`requestAnimationFrame` で 1.4 秒の演出：しずく落下（0〜0.5秒）→ 波紋（0.45〜0.8秒）→ 新しい枝葉が伸びる（0.5〜1.4秒、`progress` を easeOutCubic）。しおれていた葉は同じ時間で持ち上がる（`wilt` を 1→0 へ補間）
4. 終わったら `data-growing="false"`、`#status` と `aria-label` を更新し、`#message` は初回「芽が出ました」／2回目以降「今日の一滴をあげました」。フォーカスは `#plant` へ
5. `prefers-reduced-motion: reduce` では演出を飛ばして最終形を即描く（`data-growing` は `true` にしない）

**成長を見る（`#replay`）**
- `steps >= 1` で押せる。`data-replaying="true"` にし、`steps 0 → n` を `min(1.2 + 0.12 × n, 6)` 秒で順に描く（各ステップの伸びは `progress` で補間）。終わったら `false` に戻し、`#message`「{n}日ぶんの成長です」。実行中は `#water` `#replay` `#save` `#reset` を無効化
- reduced motion では補間せず、`n` を4等分した節目の静止画を 0.6 秒ずつ出して最終形で止める

**画像で保存（`#save`）**
- 1080×1080 の Canvas に、背景 `#fbf7ef`、木（現在の `wilt` を反映）、左下に「水をあげた日 12日」（墨色・大きめ）、右下に小さく「ひとしずくの木」。`canvas.toBlob(…, 'image/png')` → `<a download>`。ファイル名 `one-drop-tree-YYYYMMDD.png`（現地日付）。`#message`「保存しました」
- `toBlob` が `null` のとき（Canvas 上限など）は「この環境では画像を書き出せませんでした」
- `URL.createObjectURL` したものは使用後に `revokeObjectURL`

**最初からやり直す（`#reset`）**
- 押すと `#reset-confirm`（`hidden` を外す）：「この木を手放して、新しい種から始めますか？ 水をあげた日の記録も消えます」＋ `#reset-yes`「手放す」／`#reset-no`「やめる」。フォーカスは `#reset-no`
- `#reset-yes`：新しい種・`plantedOn: null`・`wateredDays: []` で保存し、`seed` 状態へ。`#message`「新しい種を用意しました」。フォーカスは `#water`
- `#reset-no`：閉じるだけ。`confirm()` は使わない

**日付をまたいだとき**
- `visibilitychange` で表示に戻ったとき、`today` を取り直して `decide` し直し、`#status` と `#water` を更新する（開きっぱなしで日付が変わっても押せる）

**キャンバス**
- `<canvas id="plant" role="img" tabindex="-1">`。`aria-label` は `ready` で「水やり{steps}日目の木。枝が{branches}本、葉が{leaves}枚、花が{flowers}つ」、`seed` で「鉢に植えた種」
- 表示は正方形。幅は親に合わせ、最大 560px。`ResizeObserver` で `devicePixelRatio` を掛けた実ピクセルで描き直す

**シェア・OGP**
- `index.html` の `</head>` 前に `./shared/share.css` と `./shared/share.js`（defer）。`<meta name="share:text">` は「ひとしずくの木 — 1日1回、水をあげるだけで育つ木。端末の中だけで育ちます」（アプリ名を含める）。`<main>` の末尾に `<div id="share"></div>`。OGP・canonical はビルドが入れるのでアプリ側に書かない

## 画面の文言

- 見出し上のラベル「DAY 028 · ONE DROP TREE」、`<h1>`「ひとしずくの木」、説明「1日1回、水をあげる。それだけで育つ木。」
- HOW TO「水をあげる、育つ、また明日」：「「水をあげる」を押すと、その日のぶんだけ育ちます。1日1回まで。忘れた日があってもしおれるだけで、枯れも、やり直しもありません。」
- 約束（`.privacy`）：「**木は端末の中だけで育ちます。** 通信なし・登録なし・通知なし。残るのは種の番号と、水をあげた日付だけです。」

## 非機能・技術

- 依存ゼロ・ビルドなしの vanilla JS（ES modules）。`index.html`＋`app.css`＋`app.js`＋`lib/`（`days.js`／`decide.js`／`plant.js`／`draw.js`／`store.js`／`share-image.js`）
- **外部通信ゼロ**（fetch も外部フォントも外部画像も無し）。CSP はリポジトリ既定のまま。インライン `<script>`・`style` 属性・`onclick` 属性は使わない（スタイルの動的変更は class か `element.style.setProperty`）
- 演出は `requestAnimationFrame`。1コマの描画は 16ms 以内を目安（枝 100 本・葉 300 枚程度）
- アクセシビリティ：すべてのボタンの操作領域は 44px 以上。コントラスト 4.5:1 以上。フォーカスリング可視。`#message` と通知は `role="status"`。しおれは色と角度の両方で伝える
- レスポンシブ：320 / 390 / 1280px で横スクロール無し。1200×750 でキャンバス・`#status`・「水をあげる」が同じ画面に入る
- `alert/confirm/prompt` を使わない。`innerHTML` にユーザー由来の文字列を入れない（ユーザー由来の文字列は無い）
- 定数名を「KEY」で終わらせない（シークレット検査が誤検知する）。ソースにローカルの絶対パスを書かない
- 時刻は `new Date()` から取る（テストと録画で `page.clock.setFixedTime` により差し替えるため、`performance.now()` を日付に使わない）

## テスト

- ユニット（`tests/*.test.mjs`、`node --test`）
  - `days.js`：`localDateString` の桁、`isDateString`（`2026-02-30` は偽・`2028-02-29` は真）、`daysBetween`（同日 0・翌日 1・逆順は負・年またぎ・うるう年）
  - `decide.js`：上の検算4件＋`steps === 0`＋`wilt` の頭打ち（8日ぶり→1）
  - `plant.js`：同じ種・同じ回数で深い等価／`n` と `n+1` の prefix 性（`width` を除く・seed 3種 × n 0〜120）／毎ステップ要素が増える／`steps 0` は空／座標の範囲（seed 5種 × steps 1・30・100・400）／`stats` と配列の長さが一致
  - `store.js`：往復／壊れたJSON→新しい種で `recovered`／不正な日付を捨てて昇順・重複なし／`plantedOn` の補完／余計な項目を書かない／例外→`canSave: false` `saved: false`
- E2E（`tests/e2e/day-028-one-drop-tree.spec.mjs`、Playwright、`/day-028-one-drop-tree/`）。日付は `page.clock.setFixedTime(new Date('2026-09-04T09:00:00+09:00'))` で固定し、保存済みの木は `page.addInitScript` で `localStorage` に書いて再現する
  - 最初は `seed` 状態で、鉢のキャンバス・見出し・「水をあげる」・約束が見える
  - 「水をあげる」→ `ready`、`#status`「水をあげた日 1日 · 芽が出て 1日目」、ボタンは無効で文言「今日はあげました」、`#message`「芽が出ました」
  - 同じ日にもう一度押せない（無効化）。`localStorage` に `wateredDays: ['2026-09-04']` が入っている
  - 時計を翌日にして再読込 → 押せる → 「水をあげた日 2日」。キャンバスの `aria-label` の枝の本数が増えている
  - 再読込しても木が残る（種が同じ・`steps` が同じ）
  - 6日前に最後の水やりをした木を書いて開く → `#status`「6日ぶりですね…」→ 水をあげると `#message`「今日の一滴をあげました」
  - 最後の水やりが未来日の木 → 押せない、`#status`「時計が戻っているようです。また明日」
  - 壊れたJSON → `#data-notice` が見え、`seed` 状態で押せる
  - `localStorage` 不可 → `#storage-error` が見え、水をあげると `ready` になる
  - やり直し：`#reset` → `#reset-confirm` 表示・フォーカスは `#reset-no` → `#reset-yes` → `seed` 状態、種が変わっている
  - 成長を見る：`data-replaying` が `true` になり、`false` に戻る。`#status` は変わらない
  - 画像で保存：ダウンロードが `one-drop-tree-\d{8}\.png`、IHDR が 1080×1080
  - reduced motion：水をあげても `data-growing` が `true` にならず `ready` になる
  - 320 / 390 / 1280 で横スクロール無し／1200×750 で `#plant` `#status` `#water` が画面内／表示中の操作領域 44px 以上／読み込み後の通信が 0 件／コンソールエラー 0

## やらないこと

- 通知、リマインド、連続日数、スコア、ランキング
- 複数の木、名前付け、着せ替え、季節や天気との連動
- サーバー保存、同期、アカウント、他人の木を見る機能
- 木の座標や画像の保存（種と日付から毎回計算する）
