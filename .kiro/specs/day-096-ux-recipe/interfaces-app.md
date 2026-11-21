# 契約: 画面（担当C=骨格・担当D=パネル・どちらもCodex）

**C**: `index.html` `app.css` `app.js` `favicon.svg` `lib/ui-goal.js` `ui-outline.js` `dnd.js` `ui-preview.js` `ui-palette.js` `ui-topbar.js` `ui-toast.js` `keys.js` と `tests/ui/c-*.test.mjs`。
**D**: `lib/ui-inspector.js` `ui-diagnosis.js` `ui-look.js` `ui-share.js` `ui-slots.js` `ui-form-model.js` `png-export.js` と `panels.css`、`tests/ui/d-*.test.mjs`。
他のファイルは変えない。画面の動きと見た目は `ux.md`・`visual-direction.md`。**Codex はブラウザと localhost を動かせない**: DOMを触らない所（並べ替えの計算・フォームの設計・URLと共有文の組み立て・PNGの寸法）は純粋な関数に切り出して Node で試験する。DOMを触る所は、この契約どおりに丁寧に書く（親が実ブラウザで確かめる）。

## index.html（C）の構造と、共通の決まり
`<div id="app" data-screen="goal|editor|viewer" data-ready="true">`（起動が終わったら data-ready）。中に:
`#screen-goal` ／ `#screen-edit`（`#slot-topbar`・`#slot-outline`・`#slot-preview`・`#slot-panel`＝タブ「構成」（狭い幅だけ）「編集」「診断」「見た目」と、`#panel-edit` `#panel-diagnosis` `#panel-look`）／
`#screen-view` ／ `<dialog id="dlg-share">` `<dialog id="dlg-slots">` `<dialog id="dlg-palette">` `<dialog id="dlg-app-share">` ／ `<div id="toasts" aria-live="polite">`。
- 共通の共有部品: `<link rel="stylesheet" href="./shared/share.css">` と `<script src="./shared/share.js" defer>`。`#dlg-app-share` の中に `<div id="share">`（ここへ共通部品が入る）。
  **「このアプリを共有する」という名前のボタン**を、目的画面と見るだけ画面に置き、押すと `#dlg-app-share` が開く（横断試験がこの名前で探す）。
- **クラス名に `share` と `share__*` を使わない**（共通部品のもの。横断試験が `.share` の数を数える）。D は接頭辞 `cs-`、C は `app-`・`ed-` などを使う。
- 外部通信・CDN・外部フォント・インラインの `<script>`・`eval`・`on*=` 属性は禁止（本番CSPは `script-src 'self'`）。`<meta name="share:text">` は題名「UXレシピ — 目的を選ぶと、ページの組み立て方が出る」を含める。
- URLの引数: `?goal=<key>` その目的で開始／`?fresh=1` 保存を無視／`?tips=0` 初回のヒントを出さない／`?debug=1` で `window.__uxr = { ctx, getState, dispatch, diagnose }`／`#v=<符号>` 見るだけ。
- 起動: `#v=` があれば復号して見るだけ画面（失敗なら理由を toast で出して目的画面）→ `?goal=` → 保存があれば編集画面（つづき）→ なければ目的画面。

## ctx（C が app.js で作り、全部の mount* に渡す）
```
getState() getHistory() getSelectedId() getTab() getDevice()
dispatch(action, { coalesce? })     // reduce→commit→通知→自動保存（400msまとめ）。coalesce は履歴をまとめる鍵（打鍵に使う）
undo() redo() canUndo() canRedo()
subscribe(fn) → 解除              // 登録直後に1回 fn({reason:'init',…})。以後、変化のたび fn({ state, selectedId, diagnosis, reason })
                                   // reason = init|dispatch|undo|redo|select|load|tab|device
select(id|null, { path?, tab? })   // 選ぶ。path があれば編集欄の該当入力へ移る。tab があれば切り替える
setTab('outline'|'edit'|'diagnosis'|'look')  setDevice('phone'|'pc')
diagnose()                          // 同じ state ならキャッシュ
toast(message, { kind?:'info'|'error', actionLabel?, onAction? })
openShare(tab?:'link'|'export')  openSlots()  openPalette(index?)  toGoalScreen()
slots: { list() save(name) load(id) remove(id) rename(id,name) }   // persist.js の包み。結果は toast
viewUrl() → Promise<string>
```
mount の規約: 渡された要素の**中だけ**を触る。subscribe のたびに再描画してよいが、**入力中の要素のフォーカス・選択範囲・値を上書きしない**／スクロール位置を保つ／解除関数を `destroy()` で呼ぶ。

## D のモジュール
- `mountInspector(root, ctx)` → `{ focusPath(path), destroy() }`: 選択中の部品の「なぜこの部品？」（`BLOCK_INFO` の role・place・mistake）・バリエーション（`role="radiogroup"`・各 `role="radio"`）・項目の入力（`BLOCK_SCHEMA` から自動で作る）。
  text/long は文字数「12/32」の表示・上限で警告・`maxlength` をつける・`dispatch({type:'setProp',…},{coalesce:`p:${id}:${path}`})`。
  **日本語入力（IME）の変換中（`isComposing`）は dispatch を保留し、`compositionend` で1回送る**（変換の途中で文字が欠けたり、戻る段が増えたりしないように）。check はチェックボックス。list は「項目を足す」「項目を消す」「上へ」「下へ」（件数の上下限で無効化）。
  言い換え候補（`suggestionsFor(goal,type,key)`）がある項目の下に、押すと入るチップ。何も選んでいないときは案内文。
- `mountDiagnosis(root, ctx)`: 点の輪（SVG・数字入り）・短い講評・項目を「必須／おすすめ／ヒント」に分け、満たしているものは「できていること（n）」にまとめる。項目は開閉で `why`・`note`・根拠（リンク・確度）を出す。
  `fix` があり満たしていなければ「なおす」ボタン（押すと `dispatch(fix.action)`・toast「なおしました」＋元に戻す）。`blockId` があれば「この部品を見る」。末尾に診断の見かた（点はこのアプリの目安・根拠は各項目）。
- `mountLook(root, ctx)`: サイトの名前（入力・24字）・テーマ4つ（ラジオ・小さな見本つき）・強調色6つ（ラジオ・色の名前）。
- `mountShare(dialog, ctx)` → `{ open(tab) }`: タブ「リンク」「書き出し」。リンク: 共有リンク（読み取り専用の入力）・「リンクをコピー」・「Xで投稿」（`https://x.com/intent/post?text=&url=`）・「LINEで送る」（`https://social-plugins.line.me/lineit/share?url=`）・
  `navigator.share` があるときだけ「端末の共有を開く」・Instagram と YouTube は偽のボタンを作らず説明の1行・内容がリンクに入っていて、サーバーへは送られないが、受け取った人と共有先には見えることの1行・3000字超で、断定しない知らせ（「リンクが長めです。貼り付け先で全文が入らないときは、HTMLで渡せます。」）。普通のページ（約2200字）では出さない。この閾値は調べて決めた値ではなく目安。共有文は「UXレシピで「<目的>」のページを組み立てました（UX診断 <点>点）」。
  書き出し: 「HTMLをダウンロード」（Blob＋`a[download]`・`exportFileName`）・「HTMLをコピー」・「画像で保存(PNG)」（スマホ幅/パソコン幅・2倍・`canExportPng()` が false なら出さない）・叩き台である注意。
- `mountSlots(dialog, ctx)` → `{ open() }`: 名前をつけて保存（入力＋「保存する」）・一覧（名前・目的・日時・部品数・「開く」「消す」）・件数「n/6」。開くと `dispatch({type:'replace',state})`（元に戻せる）。
- `ui-form-model.js`（純粋）: `formModel(block, goal)` → 入力欄の記述（path・kind・label・max・値・role・suggestions・list の min/max と項目）。`counter(value,max)`。Node で試験。
- `png-export.js`: `canExportPng()`（SVG の foreignObject→canvas で実際に1回試して判定・結果を覚える）・`exportPng(state,{width,scale})` → `Promise<Blob>`。HTMLを XHTML に直して `PAGE_CSS` ごと SVG に入れ、描画後の高さは画面外の要素で測る。失敗は例外でなく `null`。
- `panels.css`: D の画面の見た目（`cs-` 接頭辞・`--app-*` 変数）。

## C のモジュール
- `mountGoal(root, ctx)`: 入口（題・問い「お客さんに、どうなってほしいですか？」・8枚のカード＝名前・ひとこと・流れの小さな帯）。つづきから・保存を開く・このアプリを共有する。選ぶと `ctx.dispatch({type:'replace', state:createState(goal)})` ではなく、**`createState` で作った状態で履歴を新しく始める**。
- `mountOutline(root, ctx)`: 構成リスト（`role="list"`）。行=段階チップ（記号＋色）・部品名・中身の一部・「並べ替えのつまみ」・「上へ移動」「下へ移動」「複製」「削除」。つまみのドラッグ（pointer events・`touch-action:none`・端の自動スクロール・並べ替え後に `aria-live` で「<部品名>を<n>番目に移動しました」）。末尾に「部品を足す」。`dnd.js` の計算は純粋に切り出して試験。
- `mountPreview(root, ctx)` → `{ scrollToBlock(id) }`: 上に流れメーター（5段階の帯＋部品数・点のバッジ→診断タブ・「スマホ表示」「パソコン表示」）。下にページ（`renderPage(state,{mode:'preview'})` を `innerHTML`）。`PAGE_CSS` は `<style>` を1回だけ。
  委譲クリック: `[data-path]` なら `select(blockId,{path})`・それ以外は `select(blockId)`。**プレビュー内の `<a>`・`<summary>` の既定動作を止める**（`#v=` を壊さない）。選択中は `.is-selected`（2pxの外線＋部品名のタグ）。再描画でスクロール位置を保つ。
- `mountPalette(dialog, ctx)` → `{ open(index?) }`: 「部品を足す」。効果別（見せる・迷わせない・不安を減らす・背中を押す）に19種。各項目=段階チップ・名前・role の1文。上限18で無効化。選ぶと `addBlock`（選択中の直後）→選択→プレビューへ移動。
- `ui-topbar.js`: 「目的を選び直す」・目的名とサイト名・「元に戻す」「やり直す」・「保存・開く」・「共有・書き出し」（主）。自動保存の表示。`ui-toast.js`: 積み重ね・自動で消える・操作つき。
- `keys.js`: Ctrl/⌘+Z・Shift+Ctrl/⌘+Z・Ctrl+Y・Delete（入力中は無効・削除は toast で元に戻せる）・Alt+↑↓（選択中を移動）・Esc。
- 見るだけ画面: ページ（幅は端末に合わせる）・診断の点・「このレシピをもとに作る」「目的を選んで作る」・このアプリを共有する。
- 初回のヒント（`hasSeen`/`markSeen`・`?tips=0` で出さない）: 「部品をタップすると、なぜそこにあるのかが右に出ます」。

## 試験が探す名前（aria-label／ボタン名）
`目的を選び直す` `元に戻す` `やり直す` `保存・開く` `共有・書き出し` `このアプリを共有する` `部品を足す` `並べ替えのつまみ` `上へ移動` `下へ移動` `複製` `削除`
`スマホ表示` `パソコン表示` タブ `構成` `編集` `診断` `見た目` ／ `項目を足す` `項目を消す` `上へ` `下へ` `なおす` `リンクをコピー` `Xで投稿` `LINEで送る` `HTMLをダウンロード` `画像で保存(PNG)` `保存する`
入力欄の名前は `BLOCK_SCHEMA` の label・サイトの名前は「サイトの名前」。テーマは「テーマ: やわらか」…、強調色は「強調色: コーラル」…。
