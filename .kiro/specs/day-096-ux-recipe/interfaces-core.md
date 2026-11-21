# 契約: 状態の核（担当A1・Codex）

対象: `lib/state.js` `lib/codec.js` `lib/persist.js` `lib/export-html.js` と `tests/core/*.test.mjs`。
型・定数・無害化・検証は `lib/contract.js` が正（**変更しない**）。親が置いた「見本の骨格」と同じ名前・同じ形で、全面的に作り直す。
画面は、ここに書いた形だけを使う。書き込めるのは上の4ファイルと、`tests/core/` の新しいファイルだけ（`contract.test.mjs` は消さない）。

## state.js
- `createState(goal)` → State（`recipes.js` の `buildFromRecipe`）。`reduce(state, action)` → State。**純粋**・入力を書き換えない。
  無効な操作は**同じ参照**を返す（履歴に積まれない）。操作（`ACTION_TYPES`）:

| type | 引数 | 意味 |
|---|---|---|
| setGoal | goal | 目的を変える。部品は `buildFromRecipe` で作り直し、theme は保つ。同じ目的なら何もしない |
| addBlock | blockType, index? | `makeBlock(goal,type,nextBlockId)` を入れる。index 省略=フッターの直前（無ければ末尾）。18件超は無視 |
| removeBlock / duplicateBlock | id | 削除／直後に複製（新しいid・上限18） |
| moveBlock | id, to | 移動後の添字。範囲外は端へ丸める |
| setVariant | id, variant | 範囲外は無視 |
| setProp | id, path, value | `resolveField` で項目を引き、text/long は `clampText`、check は `=== true`。list や不明な path は無視 |
| addItem | id, path, index? | list に項目を足す（最後の項目の複製・check は false に）。max 超は無視 |
| removeItem / moveItem | id, path, index / from,to | min 未満・範囲外は無視 |
| setSite | name | `clampText(name, SITE_NAME_MAX)` |
| setTheme | preset?, accent? | 不正は無視 |
| replace | state | `sanitizeState` を通す。null なら無視 |

- 履歴（不変）: `createHistory(state, limit=60)`・`commit(h, state, coalesceKey?, now?)`・`undo`・`redo`・`canUndo`・`canRedo`・`present`。
  同じ `coalesceKey` が1.2秒以内に続けば1段にまとめる。undo/redo のあとは key を空に。state が同じ参照なら commit は何もしない。
- **不変条件**（試験で確かめる）: 結果は常に `validateState` を通る／件数・id・文字数の上限／`blocks` の他の部品は参照を使い回す（描画の差分のため）。

## codec.js（共有リンクの符号）
- `encodeState(state)` → `Promise<string>`。形式 `2.<base64url(deflate-raw(JSON))>`（`CompressionStream` が無ければ `1.<base64url(JSON)>`）。
  符号は**4000文字以内**（`STRESS` でも。超えるなら最小限の短縮を考え、無理なら報告）。
- `decodeState(code)` → `Promise<{ok:true,state}|{ok:false,reason}>`。接頭辞・長さ上限（8000字）・**展開後の上限（200KB で打ち切る＝展開爆弾対策）**・
  JSON解析・`sanitizeState` の順。`reason` は日本語で、画面にそのまま出せる（「このリンクは読み取れませんでした。」など）。例外を外へ出さない。
- `viewUrl(state, base)` → `Promise<string>`（`${base}#v=${code}`）。`parseViewHash(hash)` → 符号の文字列か null（`#v=` の取り出し・`location.hash` をそのまま渡す）。

## persist.js（端末内の保存）
どの関数も**例外を投げない**（保存先が無い・容量超過・壊れたデータ）。第2引数 `storage` は試験用（既定 `localStorage`）。キーは `STORAGE_PREFIX + 名前`。
- `loadCurrent(s?)`→State|null／`saveCurrent(state,s?)`→boolean／`clearCurrent(s?)`
- `listSlots(s?)`→`[{id,name,goal,savedAt,blocks}]`（新しい順）／`saveSlot(state,name,s?)`→`{ok,id}|{ok:false,reason}`（`MAX_SLOTS` まで）／
  `loadSlot(id,s?)`→State|null／`deleteSlot(id,s?)`／`renameSlot(id,name,s?)`
- `hasSeen(key,s?)`／`markSeen(key,s?)`（初回のヒント）。読み込んだものは必ず `sanitizeState` を通す。

## export-html.js
- `buildStandaloneHtml(state)` → string。DOCTYPE・`lang="ja"`・viewport・`<title>`=サイト名・`<meta name="generator">`・`<style>`に `PAGE_CSS`・本体は
  `renderPage(state,{mode:'export'})`。**スクリプトなし・外部URLなし**。冒頭にHTMLコメントで、ボタンの飛び先とフォームは見本であることを書く。
  title とコメントに入る文字は無害化（コメントに `--` を入れない）。他の画面では使わない `PAGE_CSS` の中身は変えない。

## 試験（`tests/core/*.test.mjs`・Node の `node:test`）
- state: 全操作の正常・境界・無効／不変条件を、全 fixtures と**シード固定の乱数による1000回の操作列**で（毎回 `validateState` が空）／履歴の戻す・やり直す・まとめ。
- codec: 全 fixtures の往復・壊れた入力（空・非文字列・短すぎ・上限超・不正base64・不正JSON・展開爆弾）・符号の長さ・無害化（`<script>` を含む文字）。
- persist: 保存先なし・壊れたJSON・容量超過で setItem が投げる・スロット上限・不正データの無害化。
- export-html: 構造・`<script` が出ない・`http` で始まるURLが出ない・title の無害化（`</title><script>`）・`PAGE_CSS` を含む。
- 親が置いた `tests/fixtures/states.js`（`MINIMAL` `RESERVE_SAMPLE` `STRESS` `block` `oneEach`）を使う。

## 完了の条件
`node --test day-096-ux-recipe/tests/` が全部通る。変更したファイル・試験の件数・契約と違う判断をした所を、最終回答に書く。
