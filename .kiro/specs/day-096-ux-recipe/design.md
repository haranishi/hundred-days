# 設計（UXレシピ）

## 全体像
静的なWebアプリ（ビルド無し・ESM・外部ライブラリ無し）。**状態1つ（JSON）→ ページのHTML文字列 → 画面**の一方向。
```
contract.js ─┬─ state.js（reduce・履歴）─ persist.js（端末内）  ─┐
(定数・項目表・  ├─ rules.js（診断）・recipes.js・blocks.js（中身） ├→ app.js（ctx）→ ui-*（C・D）
 検証・無害化)   ├─ codec.js（共有リンク）                       ─┘
               └─ render.js ─ blocks/*.js ＋ page-css.js → ページ（preview／export）→ export-html.js・png-export.js
```
- 状態は `{v, goal, site, theme, blocks:[{id,type,variant,props}]}`。画面は `reduce` の結果を描くだけ。部品の項目は `BLOCK_SCHEMA` が正で、
  入力欄・無害化・検証・符号の検査がすべて同じ表から自動で決まる（部品を足すとき、表を1か所足せばよい）。

## 決めたことと理由
- **ページは同じDOMに描き、CSSは `.uxr-page` の中だけ**。iframe は本番CSP（`frame-ancestors 'none'` と子フレームの扱い）と相性が悪く、Shadow DOM は選択・試験が複雑になる。
  代わりにアプリ側のCSSは「クラスだけ」で書き、ページ側は `:where()` で素の要素を初期化して、互いに混ざらない。インラインの `<style>` は本番CSPで許されている（`style-src 'unsafe-inline'`）。
- **幅は container query**（`@container uxr`）。スマホ枠（390）とパソコン枠（960）を同じCSSで切り替えるため。`@media` の幅は枠に効かない。
- **HTML文字列で描く**（仮想DOMなし）。部品は最大18・文字は短い＝全部作り直しても軽い。再描画でスクロール位置を保ち、入力中の入力欄は別のDOMなので奪わない。
- **共有リンクは `#v=`（URLの断片）**。断片はサーバーへ送られないので、サーバー・登録が要らず、内容も保存しない。形式は `deflate-raw`＋base64url（無ければ素のJSON）。
  読み込み側は、長さ・展開後の大きさに上限をつけ、必ず `sanitizeState` を通す（共有リンクは信用できない入力）。
- **履歴は不変の配列**。同じ鍵の打鍵は1.2秒でまとめて1段にする（1文字ごとに戻らない）。目的の変更・保存の読み込み・「なおす」も1段。
- **診断は状態だけの純粋関数**。ルールは「適用の条件・満たす条件・なおす操作」の3つ組。根拠のURLと確度を各項目に持ち、画面に出す。数値は「このアプリの目安」。
- **ドラッグは「つまみ」だけ**。ページ内のドラッグはスクロールと衝突する。▲▼とキーボードも同じ操作を持つ（指・マウス・キーボードのどれでも並べ替えられる）。
- **書き出しHTMLにスクリプトを入れない**。`<details>` の開閉・アンカーの移動はHTMLだけで動く。フォームは見本（送信先なし）で、そのことをコメントに書く。

## 落とし穴（先に潰す）
- 本番CSP: `script-src 'self'`＝インラインのスクリプト・`eval`・文字列の `setTimeout` は不可。Playwright の `waitForFunction` に文字列を渡さない。開発サーバー（`tools/serve.mjs`）は本番と同じCSPを付ける。
- プレビュー内の `<a href="#uxr-b3">` を押すと `location.hash` が変わり、`#v=` の読み取りを壊す → プレビューの委譲クリックで既定動作を止める。`<summary>` も同様。
- 日本語入力（IME）: 変換中の `input` では状態へ書かない（`compositionend` まで保留）。入力欄には `maxlength` をつける。
- 画像（PNG）の書き出しは SVG の `foreignObject`→canvas。WebKit は canvas が汚染されて `toBlob` が失敗することがある → 実際に1回試して、だめならボタンを隠す。
- `color-mix()`・`container`・`text-wrap`・`word-break:auto-phrase` は新しめ。古い環境では見た目が少し劣るだけで崩れないように書く（`auto-phrase` は上乗せ）。
- 強調色の文字: 白地に載せる強調色は 4.5:1 以上（試験で計算）。薄い地の上は `--uxr-accent-text`。
- 保存データは信用しない（拡張機能・別バージョン・手書き）。読むたびに `sanitizeState`。容量超過の例外は握りつぶして false を返す。

## 公開の基準（hundred-days）
`meta.json`（published・共有文に題名・screenshot）・README・LICENSE・`shared/` の複製（`npm run shared:sync`）・根の README の一覧と THIRD_PARTY_NOTICES（外部ライブラリ無しと書く）。
OGP・canonical はビルドが差し込む。`tests/` と `tools/` は本番に配信されない。下書きのうちに `npm run publish:check -- --day 96` を流す。

## v2 候補（今回はやらない）
複数画面の流れ（トップ→申込→完了）・「ありがとう画面」・文章のトーン切替・部品の自作・チームでの共有。
