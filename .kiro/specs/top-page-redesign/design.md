# 設計：トップページの作り直し

見た目の数値（色・書体・寸法・動き）は [visual-spec.md](visual-spec.md)。ここは発想・構成・挙動・置き場所。

## 発想
> このページでは、**「1日1マス」の100日**が、**目次であり進捗でもあるマップ**になる。マスに触れると、その日のアプリの実画面が出る。

競合テスト：ほかの100日企画の草グラフや一覧では成り立たない。77本の実画面と日数が、この作者にしか無い素材だから。
動かすのはマップのプレビューだけ。それ以外の動きは、その補助にとどめる。

## 構成（上から）
1. スキップリンク（`#main`）
2. 上の帯：左「100日チャレンジ」（朱の小さな四角つき）、右に「Xでフォロー」「GitHub」（`.pill`）。下の線は内容幅
3. ヒーロー：1100px〜は3列グリッド（コピー＝列1〜2、コンソール＝列3＝カードの1列と同じ幅）。720〜1099pxはコンソールが全幅で2列（マップ｜プレビュー）。〜719pxは縦積み
   左＝`h1.hero__title`・一行説明（`SITE.tagline`）・補足（`SITE.description` の後半）・進捗（`.progress__now`）・ボタン2つ・フォロー導線（`a.follow`）
   右＝`aside.console`：マップ（`ol.matrix`）＋プレビュー（`figure.preview`＝画像の枠＋**画像の下**に札・題名・リンク）
4. 数字の帯：制作時間（記録分）・制作日数・デモ動画。各項目に注（数え方）
5. アーカイブ（`section.apps#archive`）：見出し＋件数、道具の帯（検索・並べ替えの `select`・タグ一覧・よく使うタグ）、0件の表示、カード
6. ルール：作者の一行（旧ページの文言）・READMEリンク・Xの入口、ルール5項目、解禁の段階（導入文つき。いまの段階に「いまここ」）
7. フッター：従来の文言（計測の説明を含む）を保つ
8. 固定ボタン `#to-tools`「↑ 検索・絞り込み」（〜899pxで、帯が画面の上へ出たときだけ）

## カード
見出し行（`DAY 077`・最新だけ `LATEST`・外部公開などの `.badge`）→サムネ（`object-fit: contain`）→題名→説明（3行）→タグ→所要時間→操作→制作メモ（全文）の順。
`display: grid; grid-template-rows: subgrid; grid-row: span 7` で、同じ行のカードの7つの段をそろえる（要素が無くても段は動かない）。
題名は `splitTitle()` で「主題 — 副題」に分け、副題を `inline-block` に（収まらないときは「—」の直後で折り返し、副題の途中では折らない）。`textContent` は元の題名のまま。

## 挙動
- **マップ**：セルは `a.cell[href="#day-NNN"]`。公開済みだけ。タブ停止は1つ（最新のセル）で、←→は前後の公開日、↑↓は±10、Home/End。ホバー・フォーカスでプレビューを差し替え、離れたら最新へ戻す。クリックでそのカードへ。隠れていれば先に条件を解除する。動いている間（`scrollend`。無いブラウザは2秒）は `html.is-jumping` を付けて全要素の遷移を止める（WebKitが、通り過ぎるカードの遷移でスクロールを途中で打ち切るため。理由は steering）。
- **プレビュー**：画像は触れたときに `src` を入れる。`loading="lazy"`（スマホで非表示のあいだ342KBを読まない）。題名は2行分の高さを常に確保（1行のDayでもコンソールの高さが動かない）。〜719pxは画像の枠を隠し、主題だけの1行。
- **検索**：`fold()`（NFKC・小文字・カタカナ→ひらがな）で題名・説明・タグ・Day番号を畳んだ文字列をビルド時に `data-search` へ。数字だけ（`34`・`034`・`day34`）は日番号の完全一致（3文字以上は文面にも）。`/` で検索欄へ、Esc で消す。
- **タグ**：`quickTags()`＝統合したキーで数え、占有率40%超を除き、上位12。別名表 `TAG_ALIASES`（5組）で英日を統合し、ラベルは多数派の綴り。カードの `#タグ` も同じラベルで、占有率40%超は後ろへ。「タグ一覧」は初回に開いたとき `data-tags` から全タグをJSで作る。
- **並べ替え**：`select`。DOMの並びごと入れ替える（CSSの `order` は使わない）。
- **検索へ戻る**：スクロール位置から直接判定する（`IntersectionObserver` は瞬間移動で反応しない）。
- **計測**：既存の5イベントの名前と値は同じ。`.cta`・`.go` を `app_open`、`.follow` を `profile_click` に加えた。新しいイベントは足していない。
- **JSなし**：マップのリンク・最新のプレビュー・全カード・ルールが読める。道具の帯は `noscript` で隠す。

## 置き場所と境界
- `scripts/build.mjs`：ページを作る部分（`cardHtml` から `html` の組み立てまで）だけ。ヘッダ表・CSP表・apps の読み込み・`injectAppMeta` は触らない。
- 新規：`scripts/lib/home-model.mjs`（`fold`・`tagKey`・`TAG_ALIASES`・`splitTitle`・`tagCatalog`・`quickTags`・`buildMatrix`・`phaseOf`・ルール文言）、`scripts/site/home.css`・`home.js`（ビルドが読み込み、`index.html` にインライン。`fold`・`tagKey`・`splitTitle` は `toString()` で画面側へ埋め込む）。
- 書体：`static/assets/fonts/`（Big Shoulders Display・Geist Mono・OFL本文）。権利は `THIRD_PARTY_NOTICES.md`・`LICENSE`。
- OG：`scripts/og-template.html`・`scripts/make-og.mjs`（点灯数は `meta.json` の最新の公開Dayを `?lit=` で渡す）・`static/assets/og.png`。
- 試験：`scripts/tests/home-model.test.mjs`、`tests/e2e/home.spec.mjs`（390・768・1440px ほか）。`scripts/serve-dist.mjs` に `.woff2`・`.txt` の型を足した。
- 持ち込まない：新しい依存、外部の書体・画像・CDN。各Dayのフォルダは1バイトも変えない（本番のmainと再ビルドして `dist/day-*` が一致）。

## 落とし穴
`.kiro/steering/top-page.md` に理由つきで残した（DOMの約束・インラインJSを壊す空白除去・`object-fit: cover` の欠け・IntersectionObserver の瞬間移動 など）。
