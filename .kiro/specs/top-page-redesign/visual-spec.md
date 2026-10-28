# 見た目の仕様：トークン・寸法・動き

色と書体は、見本ページで11書体を並べて比べて決めた（暖かい黒＋象牙＋朱で、縦長の看板書体が「日を数える」題材に合った）。実装の最終形に合わせて書き直してある。

## 色（暖色系の灰を1系統だけ。`#000`・`#fff` は使わない）
```
--bg:#0f0e0d; --bg-raised:#161412; --bg-sunk:#0b0a09;
--ink:#f3ede3; --ink-2:#cfc6b8; --muted:#a39a8e; --dim:#6f675d;   /* dim は装飾専用。文字に使わない */
--line:rgba(243,237,227,.10); --line-2:rgba(243,237,227,.18);
--signal:#ff5a36; --signal-2:#ff7a5c; --signal-soft:rgba(255,90,54,.14);
```
朱は「いま・選択・押せる」だけ：77、最新のマス、LATEST、選択中のチップ、hover/focus、いまここ、入力欄の枠、ヘッダーの印（ロゴ。例外として許す）。面や背景に広く塗らない。青・緑・紫は使わない。

## 書体
- 表示：`Big Shoulders Display`（`/assets/fonts/BigShouldersDisplay-latin-wght.woff2`・先読み・`font-display: swap`）。題名・大きな数字・カードのDay札だけ。weight 800、`line-height:.86`。
- 等幅：`Geist Mono`。札・件数・日付。12px以上。
- 本文：システムの日本語ゴシック。`word-break: auto-phrase`（文節で折る）・`text-spacing-trim: trim-start`・`text-wrap: balance/pretty`（未対応は無視される）。
- 11px以下の文字は使わない。

## 寸法
- 器 `.wrap`：`max-width:1280px`、左右 `clamp(16px,4vw,40px)`。分岐点：720・900（帯が追従）・1100（3列グリッド）・1280（コンソールの余白）。
- 1100px〜は、ヒーロー・数字の帯・カード・ルール欄・段階表が同じ3列（`repeat(3,minmax(0,1fr))`・列間24px）。1440pxで左端が 120／528／936。
- H1：〜719px は `min(22vw,6rem)`、720〜1099px は `min(17vw,10rem)`、1100px〜は `min(12.4vw,11.5rem)`。左端は `margin-left:-.035em` で光学的にそろえる。`/` の尾のために `padding-bottom:.14em`。
- 進捗の数字：`clamp(4.25rem,11vw,7.5rem)`（朱）。ラベル「公開済み」は14px。
- 余白：セクション間 `--section-gap: clamp(56px,7vw,96px)`。ヒーローの上は `clamp(24px,3.4vw,44px)`。

## コンソール
- 器：`border:1px solid var(--line-2); border-radius:22px; background:linear-gradient(...)`。外側の影は付けない（左右が直線で切れて四角いしみに見える）。
- マップ：10列。セルは正方形、一辺24px以上（1100px〜は gap 4px・余白12px、1280px〜は gap 6px・余白18px）。公開済み＝象牙で、日が新しいほど濃い（`--a: calc(.36 + .54 * var(--i) / 100)`）。最新＝朱＋輪。未来＝枠だけ。ヒントで「明るいほど新しい日」と説明する。
- プレビュー：画像の枠（16:10・`object-fit: contain`・暗い面）と、**画像の下**の説明（札・題名・「アプリを開く →」）。画像の上に文字を重ねない。

## カード（枠なしの編集風）
- 見出し行：`DAY 077`（表示書体22px）。最新は `LATEST`（朱の面）、外部公開などは `.badge`（線）。形は同じ（角4px・12px・等幅）。
- サムネ：16:10・`object-fit: contain`・`border:1px solid var(--line-2)`・暗い面。右下に「デモ」。スクショが無いときは大きなDay番号＋「スクリーンショットなし」。
- 本文：題名 `700 1.1875rem/1.45`、説明 `.875rem/1.7`・3行、タグは `#名前`。操作の `.btn--primary` は既定が線（`rgba(243,237,227,.45)`）で、カードのhover/focus内で象牙の面。ヒーローの `.cta--primary` は象牙の面。
- 押せるものの角は12px（チップだけ丸）。

## 道具の帯
- 不透明（`--bg-raised`）・`border-radius:16px`。900px〜は `position:sticky; top:0`・高さ約120px（余白10px・チップ36px）。角の外側は `::before` で塞ぐ。
- 検索欄：高さ44px。フォーカスは外枠（`.search:focus-within`）に朱の縁と薄い影。チップの列は横に流し、右端40pxを薄くする。

## 動き（`prefers-reduced-motion: reduce` では、すべて止める）
- 読み込み：ヒーローの要素が下から12pxで立ち上がる。マップのセルは `scale(.6)`→1。最新のマスは `ping`。
- 一覧：画面の下にあるカードだけ、入ってきたとき16pxで立ち上がる（上にあるものには付けない）。
- すべて `transform` と `opacity` だけ。`scroll-behavior:smooth`。

## 質感
- ヒーローの背景（粒と朱の光）は `body::before/::after`（ページ全幅）。`position:fixed` と `mix-blend-mode` は使わない。
- ファビコンは4×4のマス（15個が象牙、最後の1個が朱）をSVGで。

## OG画像（1200×630）
左に「100 DAYS / 100 APPS」、右に10×10のマス（点灯数は作る時点の最新のDay・濃淡は同じ規則・最新だけ朱）、下に「アカウント登録不要・課金なし・個人データなし」とURL。件数の文字は入れない。
