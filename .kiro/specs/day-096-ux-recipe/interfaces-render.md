# 契約: ページの描画（担当B1・B2・Antigravity）

B1=`hero pain benefits steps proof voices story team`　B2=`menu plans schedule faq compare guarantee limited form cta access footer`。
それぞれ `lib/blocks/<type>.js`（親の見本の骨格を全面的に作り直す）と `tests/render/<type>.test.mjs` だけを書く。`hero.js` は B1、`cta.js` は B2 が磨く。
**書き込んではいけない**: `render-kit.js` `render.js` `page-base.js` `page-themes.js` `page-css.js` `contract.js` `blocks/index.js` `blocks/_generic.js`、他人の部品。
足りない道具・トークンは、自分の部品のCSSの中で定義して（`.uxr-page .uxr-<type>{--x:…}`）、最終回答で親へ要望として書く。

## 部品のモジュールの型
```js
export const css = `…`;                      // `.uxr-page` の中だけ。トークン（--uxr-*）と基本部品（.uxr-btn .uxr-card .uxr-chip .uxr-grid …）を使う
export function render(block, ctx) { … }     // → HTML文字列。道具は render-kit の txt multi btn sec each ico initial esc だけ
```
`page-base.js` にある基本部品・変数、`page-themes.js` の4テーマ×6強調色、`hero.js`（見本）を先に読む。

## 出力のHTMLの約束
- 外枠は必ず `sec(ctx, block, inner)`。意味のある要素を使う（見出し h2・項目名 h3・ul/ol・table と th scope・details/summary・figure/blockquote）。
- 文字は必ず `txt`/`multi`/`btn`（path は 'title'・'items.1.text'）。**`esc` を通していない文字をHTMLに入れない**。属性に値を入れるときも `esc`。
- 禁止: `style=` 属性・`on*=` 属性・`javascript:`・外部URL・`<script>`・`<iframe>`・画像ファイル・`@import`・`url(`（`data:` 以外）・`position:fixed`・`vh`/`vw` 単位。
- 空の項目: 編集中（preview）は「ここに書く」の目印が出る（`txt` が付ける）。書き出し（export）では要素ごと消える（`each` が空の項目を飛ばす）。どちらでも崩れない。
- 件数と文字数: list は min〜max のどれでも整う。最大文字数（`maxProps`）でも、はみ出し・見切れ・横スクロールがない。
- 幅は **container query**（`@container uxr (min-width:…)`）で変える。`@media` の幅は使わない（スマホ枠・パソコン枠で効かない）。確かめる幅は 320・390・768・960。
- 色は `--uxr-*` だけ。4テーマ×6強調色の全部で、文字と背景が 4.5:1 以上（大きな文字は 3:1）。色だけで意味を伝えない。
- 動き: `prefers-reduced-motion: reduce` で止める。動きは任意。
- 絵: 写真は使わない。線の絵（`ico()`）・CSSの図形・グラデーションで作る。顔や人物の描写は使わない（名前の頭文字の丸 `initial()` はよい）。
- **form**: 編集中（`ctx.mode==='preview'`）は、押せない見た目の枠（div）で描く（フォーカスや入力を奪わない）。書き出しは本物の `<form action="#">`・`<label>`・`<input>`。
- ボタンの飛び先は `btn()` が決める。`limited` の「本当の数字です」（real）は編集用の項目で、ページには出さない。

## 試験
親の `tests/render/render-contract.test.mjs` が、全部品・全バリエーション・満杯/中/空・preview/export を機械で検査する（タグの対応・禁止事項・無害化・`data-path`・CSSの形）。
自分の `tests/render/<type>.test.mjs` は、その部品に固有のこと（見た目の番号ごとの構造・件数・空の扱い・`<img onerror>` など危険な文字の無害化の実例）を、全バリエーションについて確かめる。

## 見た目の確認（必須・自分で撮って、画像を開いて目で見る）
```
node day-096-ux-recipe/tools/shots.mjs --out <フォルダ> --full --width 390 \
  "名前=tools/gallery.html?mode=block&type=<type>&variant=<n>&theme=<t>&accent=<a>&fill=<mid|max|empty>&width=390"
```
自分の全部品・全バリエーションを、4テーマ（soft crisp lively calm）×幅（320・390・768・960）×（中・満杯・空）で撮る。`mode=themes` は4テーマを横に並べる。
直したら撮り直す。コンソールのエラーが出たら先に直す。撮ったショットの置き場所と、直した点を最終回答に書く。「よくあるAIのテンプレート」に見えたら作り直す（visual-direction.md）。
