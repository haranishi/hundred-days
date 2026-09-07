# Day 031「この形、どこ？」要件定義

都道府県、または市区町村の**シルエット（輪郭だけの黒い形）**を見て、4つの地名から正しいものを選ぶ10問クイズ。正解を見た瞬間に、その土地の Wikipedia の要約を1行と写真で添える。形は国土数値情報（行政区域データ）をビルド時に単純化・正規化して同梱し、クイズそのものは通信なしで動く。

## 背景と狙い

- 100日チャレンジ Day 31。**S2（Lv.2）の初日**で、解禁表のとおり「外部API（無料・認証不要）を1個」だけ使う。その1個が Wikipedia REST API（`page/summary`）。クイズは同梱データだけで成立し、API は「正解のあとに1行足す」役に限定する
- 2026-09-05 に AI が出した別案 C「この形、どこ？」を本人が Day 30 として選定したが、カメラ地図が先に Day 030 になったため Day 031 へ繰り下げた（Obsidian「2026-09-05 Day029制作 作業ログ」）
- 規約は Obsidian「2026-09-07 この形どこ 行政区域データ利用の規約チェック」で確認済み。要点は3つ。①国土数値情報 N03 は CC BY 4.0、出典は「国土数値情報（行政区域データ）（国土交通省）（URL）を加工して作成」②原典は国土地理院の測量成果なので、**同梱データに緯度経度を残さず、縮尺も出さない**（地図として使えない絵柄にする）③Wikipedia は CC BY-SA 4.0 の帰属を画面に出す

## ユーザーストーリー

| ユーザー | 欲しいことと理由 | 受け入れ条件 |
|---|---|---|
| 地元の形を当てたい人（本命） | 自分の県の市町村で遊んで、点数を人に見せたい | 県を選んで1タップで始まる。10問で「秋田県の市町村 8.5 / 10」が出て、その文をXに投稿できる |
| 通勤中にサクッと遊ぶ人 | 開いてすぐ、1問5秒で進みたい | 開いた画面にモードのボタンが3つ。押した瞬間に1問目のシルエットが出る。正解表示は自動で進まず「次へ」で進む |
| 地理が好きな人 | 知らない町に出会って「へえ」と言いたい | 全国モードでは毎問ちがう県の町が出る。正解のあとに Wikipedia の要約1行と写真が出る |
| 家族や授業で使う人 | 小学生でも遊べる易しさが欲しい | 都道府県モードは47の形だけ。ヒントで地方名（東北など）が出る |
| 通信が不安定な場所の人 | 途中で止まりたくない | クイズは同梱データだけで動く。Wikipedia が取れないときは何も出さず、壊れない |
| シェアされたURLを開いた人 | 友だちと同じ県で遊びたい | `?p=05` 付きのURLを開くと、秋田県の市町村が選ばれた状態で開く |

## UX5階層

- **戦略**: 「地図アプリ」でも「地理の教材」でもなく、**形だけを見て当てる遊び**。成功＝開いて1タップで黒い形が出て、迷わず4択を押し、正解の瞬間に「あ、こんな形だったんだ」と「こんな町なんだ」が同時に来る。失敗＝縮尺や周辺の県が見えてしまい形以外で当てられること、文字だらけで地図アプリに見えること、正解のあとに情報が多すぎて次へ進めないこと。差別化の源泉は「形しか見せない」と「正解の1行」
- **要件**: 載せるもの＝モード3つ（都道府県／市区町村・県を選ぶ／全国の市区町村）、10問のシルエット、4択、ヒント（1問1回・正解の点が半分になる）、正解表示（名前・県や郡・県内での位置・Wikipedia の要約と写真とリンク）、点数と結果一覧、ベストの保存、結果の投稿文、出典。対象外＝制限時間、ランキング、ログイン、入力式の回答、世界の国、地図タイル、現在地
- **構造**: 単一画面で `start → loading → playing ⇄ reveal → result` の状態遷移。`error` は読み込み失敗のときだけ。迷う分岐は「Wikipedia が取れない」「県の選択が不正」「保存できない」で、どれもクイズを止めない
- **骨格**: いちばん大きい要素は**シルエット**（正方形・幅いっぱい・最大 480px）。その下に4択が2×2（各44px以上）。進み具合「3 / 10」は小さく上に。ヒントは4択の上に文字ボタン1つ。正解表示は4択の下に差し込み、「次へ」が主要ボタン。結果は点数を大きく、10問の一覧を小さく
- **表層**: 紙と墨。地は生成り（`#f7f3ea`）、文字は墨（`#1f2933`）、シルエットも墨。正解は深緑（`#1f7a4d`）、不正解は朱（`#c0392b`）、ヒントの位置表示は県の輪郭を薄墨（`#c9c2b4`）、町を朱で塗る。動きはシルエットが 240ms でふわっと現れる1つと、正解表示のスライドだけ。`prefers-reduced-motion` では即時表示

### UX5階層を通したことで決まった実装（10件）

1. **縮尺を出さない・向きは北固定・周辺を見せない**（戦略層）。シルエットは各形ごとに枠いっぱいに正規化する。大きい県も小さい町も同じ大きさに見える
2. **4択の相手は「同じ県の町」**（戦略層）。市区町村モードの誤答候補は同じ県から出す。都道府県モードは同じ地方から2つ、別の地方から1つ
3. **ヒントは答えに近づきすぎない形で出し、点を半分にする**（要件層）。市区町村では県の輪郭の中に町の位置を塗る。都道府県では4択を2択に絞る。ヒントは1問1回で、正解表示の後は押せない
4. **正解表示は自動で進まない**（骨格層）。Wikipedia の1行を読む時間を奪わない。「次へ」で進む
5. **Wikipedia は正解表示の後に非同期で足す**（構造層）。表示を待たせない。4秒で諦め、失敗しても何も出さない
6. **同梱データは県ごとに分けて必要な分だけ読む**（構造層）。都道府県の47形は最初に読み、市区町村は選んだ県の分だけ読む
7. **結果画面に「この結果を投稿する」を置く**（要件層）。共通のシェア部品は文言をマウント時に決めるので、点数入りの投稿文は結果画面の専用ボタンで出す
8. **`?p=NN` で県を持ち運ぶ**（構造層）。友だちと同じ県で遊べる。乱数の種は持ち運ばない
9. **ベストはモードと県ごとに端末に残す**（要件層）。localStorage が使えなくても遊べる
10. **出典は画面の下に2段で常に出す**（表層層）。国土交通省の国土数値情報と、原典の国土地理院。「形は単純化した概略で、位置や面積の参照には使えません」を添える

### UI採点1周目（12/20）で決めた見た目の規則（2026-09-07）

1. **出題中は何も動かさない**。ヒントの地図は `#shape` のカードの左下に重ねる（絶対配置・`#hint` は `#shape` の親カードの中）。ヒントの文字は `#hint-button` と同じ行・同じ高さで入れ替える。4択・シルエット・「次へ」の位置は、ヒントを開いても、回答しても、要約が届いても動かない。スマホでもシルエットを縮めない
2. **出題中は見出しの説明文（`.lead`）を隠す**。`start` 以外の状態では h1 だけ残す
3. **PC のシルエットは最大 440px**。右カラムには4択の下に `#tracker`（10問ぶんの丸。未回答 `○` 薄墨の枠・正解 `●` 深緑・ヒント正解 `◐` 深緑・不正解 `✕` 朱。`aria-label`「10問中3問回答、正解2」）。スマホでは4択の下に同じものを小さく
4. **除外した選択肢は塗らない**。`data-eliminated="true"` は白地のまま `opacity: .45`・破線の枠・文字は `--muted`。取り消し線は使わない。ホバーの薄茶（`#ede6d6` 系）は除外と別の意味なので、除外には使わない
5. **回答後の選択肢は色と記号の両方で伝える**。`data-result="correct"` は文字の前に「✓」、`data-result="wrong"` は「✕」（`<span aria-hidden>` で足し、`aria-label` は「正解 北海道」「不正解 沖縄県」）
6. **結果一覧は朱を記号だけに使う**。不正解の行は文字を墨色にして「✕」と「（正解は◯◯）」の「✕」だけ朱。正解の行は文字を墨色にして「✓」だけ深緑。ヒント正解は「△ ヒント」を `--muted`
7. **最初の画面は主役を1つにする**。「都道府県ではじめる」だけ塗り（主要ボタン）、他の2つは枠線ボタン。見出しの横（PC）または下（スマホ）に `#start-samples`：`prefectures.json` から北海道 `01`・千葉 `12`・沖縄 `47` の3つを小さな墨のシルエットで並べ、キャプション「こんな形が出ます」。データが届くまでは空のまま
8. **リンクは青を使わない**。`#wiki-link` と出典の `<a>` は墨色＋下線。`#quit-button` の文字は `--muted`（薄墨より濃く）
9. 共通のシェア部品（`shared/`）の見た目は全 Day 共通なので変えない
10. （2周目 18/20 のあとの磨き）高さの短い端末（360×640 など）ではシルエットのカードを幅いっぱいのまま高さだけ抑え、中の図をレターボックスで縮める。4択とカードの左右の余白は揃える。正解表示でヒントを使わなかった問は、ヒント行に薄く「ヒントなしで回答」を出して空の帯にしない。回答したら `#reveal` の上端が画面に入るよう自動でスクロールする

## 機能要件

### 画面と状態

- `<main id="app" data-state="start|loading|playing|reveal|result|error" data-mode="pref|town|town-all" data-hint-used="false|true">`
- **start**（`#start`）: 見出し「この形、どこ？」、説明1行「都道府県や市区町村のシルエットを見て、地名を当てる10問」。モードのボタン3つ
  - `#play-pref`「都道府県ではじめる」（副文「47の形から10問」）
  - `#play-town`「{県名}の市町村ではじめる」＋ `<select id="pref-select">`（地方ごとの `<optgroup>`・既定は `?p` があればその県、無ければ前回の県、無ければ「秋田県」ではなく `13`（東京都）でもなく、**先頭の北海道**）。県名に「区」がある東京都は「市区町村」、それ以外は「市町村」と表記する
  - `#play-town-all`「全国の市区町村ではじめる」（副文「毎問ちがう県から」）
  - 各ボタンの下にそのモードのベスト「ベスト 8.5 / 10」（無ければ「まだ記録なし」）
- **loading**（`#loading`・`aria-busy="true"`）: 同梱データを読む間のスケルトン。300ms 未満なら出さない
- **playing**（`#question`）: `#progress`「3 / 10」と `#score-now`「正解 2.5」（ここまでの得点。0 のときは「正解 0」。そのモードのベストがあれば「ベスト 6 / 10」を続けて出す）、`#quit-button`「やめる」（文字ボタン。押すと確認なしで `start` へ戻り、ラウンドは捨てる。`reveal` でも押せる）、`<svg id="shape" viewBox="0 0 1000 1000" role="img">` に `<path id="shape-path">`（`fill-rule="evenodd"`）、`aria-label` は「出題中のシルエット」（名前を漏らさない）。`#hint-button`「ヒントを見る（正解の点が半分）」。`#choices` に `<button class="choice" data-code="…">` を4つ。都道府県モードは県名、市区町村モードは町名（郡名は出さない）
- **reveal**（`#reveal`・`playing` の下に差し込む）: `#reveal-result`「正解！」または「ざんねん」、`#reveal-name`（例「美郷町」）、`#reveal-sub`（市区町村「秋田県 仙北郡」／東京の区「東京都」／都道府県「東北地方」）。市区町村モードでは `#reveal-map`（県の輪郭と町の位置。ヒントと同じ絵）。`#reveal-progress`「3 / 10 · 正解 2.5」（スマホでは自動スクロールで `#progress` が画面外へ出るため、正解表示の中にも出す）。`#reveal-wiki`（**最初から表示して高さを先に確保する**。`data-status="loading|ready|none"`。`loading` は薄い1行「解説を読み込み中…」、`ready` で本文に差し替え、`none` は薄い1行「Wikipedia の解説は取れませんでした」。**`#next-button` の位置は本文が届いても動かない**＝本文3行ぶんの `min-height` を確保し、本文は3行で切る）に `#wiki-thumb`（`<img>`・`loading="lazy"`・`referrerpolicy="no-referrer"`・`alt` は記事名）、`#wiki-extract`、`#wiki-link`「Wikipedia で読む」（`target="_blank" rel="noopener"`）、帰属「Wikipedia · CC BY-SA 4.0」。押した選択肢は `data-result="wrong"`、正解の選択肢は `data-result="correct"`、4つとも `disabled`。`#next-button`「次へ」（10問目は「結果を見る」）。フォーカスは `#next-button` へ
- **result**（`#result`）: `#result-score`「8.5 / 10」、`#result-best`（「ベスト更新！」／「ベスト 9 / 10」／保存不可なら空）、`#result-list`（`<ol>`・10問ぶん「美郷町 ✓」「大仙市 ✗（正解は横手市）」「男鹿市 △ ヒント」）、`#post-score`「この結果をXに投稿」（`https://x.com/intent/post?text=…&url=…`・新しいタブ）、`#copy-score`「投稿文をコピー」、`#again-button`「同じ設定でもう一度」、`#home-button`「モードを選び直す」。フォーカスは `#result-score`（`tabindex="-1"`）へ
- **error**（`#load-error`・`role="alert"`）: 「データを読み込めませんでした」＋ `#retry-button`「もう一度読み込む」。start へ戻る `#error-home`
- 保存できない環境は `#storage-notice`（`role="status"`）「この環境ではベストを保存できません」を start に出す。壊れた保存データは黙って捨てて新しくする

### モードと出題（`lib/quiz.js`・純関数・DOMに触れない）

```
buildRound({ mode, prefs, townsByPref, prefCode, rng, count = 10 })
→ { mode, prefCode, questions: [{ answer, choices: [4件・答えを含む・順序は乱択] }] }
```

- `pref`: 47県から10県を重複なく選ぶ。誤答候補は同じ地方（`lib/regions.js` の8地方区分・三重県は近畿）から2つ、別の地方から1つ。同じ地方に候補が足りなければ別の地方で埋める。**1問目は特徴的な形から出す**（北海道 `01`・青森 `02`・千葉 `12`・石川 `17`・静岡 `22`・香川 `37`・長崎 `42`・鹿児島 `46`・沖縄 `47` のうち1つを乱択。最初の成功体験を運任せにしない）
- `town`: 選んだ県の市区町村（`items`）から10件を重複なく選ぶ（在庫が10未満の県は無い。最少は富山県の15）。誤答候補は同じ県から3つ。**1問目は県内で大きい町から出す**（`pos[2]` が大きい順の上位5件から乱択。大きい町ほど形を知っている人が多い）
- `town-all`: **10県を重複なく乱択し**（画面の文言「毎問ちがう県から」と一致させる）、各県から1件を出す。誤答候補はその問の県から3つ。`planPrefCodes` は `buildRound` と同じ乱数消費順で先にこの10県を返す
- 乱数は `mulberry32(seed)`。`seed` は `?seed=` が整数ならそれ、無ければ `crypto.getRandomValues`。`seed` は結果表示までの1ラウンドだけ使い、「もう一度」は新しい種を取る。URL には書き戻さない
- 選択肢の表示名は `name`。県は `name`（「秋田県」）
- 4択の `choices` は必ず4件・重複なし・答えを含む。在庫が4未満の場合は例外を投げる（データ側で保証するので画面では起きない）

### 回答と得点

- 正解で1点、ヒントを見た問の正解は0.5点、不正解は0点。合計は `8.5` のように表示し、整数なら `9`
- `score(answers)` は純関数。`answers = [{ correct: boolean, hinted: boolean }]`
- 押した瞬間に判定し、`reveal` へ。1問につき1回しか押せない

### ヒント

- `#hint-button` を押すと `data-hint-used="true"`、`#hint`（`hidden` を外す）に表示。市区町村モードは `<svg id="hint-map">`（県の輪郭 `#hint-outline` を薄墨で塗って縁取り、町の位置 `#hint-town` を朱で塗る）と「県内の位置」。**都道府県モードは「2択に絞る」**：誤答の選択肢2つを `disabled` にして `data-eliminated="true"` を付け、`#hint-text` に「2つに絞りました」。地方名は出さない（「四国地方」では1つしか消せず、市区町村の位置ヒントとの効き目の差が大きすぎる）。どちらもその問の配点は半分。同じ問で2回目は押せない。`reveal` に入ったら `#hint-button` は `hidden`
- 町の位置は同梱データの `pos: [cx, cy, size]`（県の枠 0〜1000 での中心と大きさ）から描く。町の形そのものは県の枠の中で `size` に合わせて縮めて置く（`shape` を `size/1000` 倍して `cx, cy` に中心を合わせる）。`far: true` の町（県の枠の外にある離島の町）は地図を出さず、「県の本土から離れた島です」の文字だけを出す。`#reveal-map` も同じ扱い

### 正解表示と Wikipedia（`lib/wiki.js`）

- 端点: `https://ja.wikipedia.org/api/rest_v1/page/summary/{encodeURIComponent(title)}`。`fetch` は `headers: { 'Api-User-Agent': 'hundred-days-day031 (https://hundred-days.pages.dev/day-031-shape-where/)', accept: 'application/json' }`、`AbortController` で 4000ms
- 記事名の候補（純関数 `titleCandidates(item, prefName)`）: 都道府県は `[prefName]`。市区町村は `[name, `${name} (${prefName})`]`。応答の `type` が `disambiguation` のとき、または市区町村で `extract` に県名が含まれず次の候補が残っているときは、次の候補を試す（純関数 `shouldTryNext(summary, prefName, remaining)`）
- 使う項目は `title`・`extract`・`thumbnail.source`・`content_urls.desktop.page` だけ。`extract` は純関数 `trimExtract(text, 110)` で先頭から110字に切り、切ったら「…」を足す。本文は必ず `textContent` で入れる（`innerHTML` 禁止）
- 同じ記事は1ラウンド内で再取得しない（`Map` でキャッシュ）。応答が来る前に「次へ」が押されたら結果を捨てる（問番号で照合）
- 失敗（ネットワーク・404・タイムアウト・`extract` 空）は `#reveal-wiki` を `data-status="none"` にして薄い1行「Wikipedia の解説は取れませんでした」だけを出し、枠の高さは変えない。コンソールにエラーを出さない（`console.error` を使わない）
- `thumbnail` が無い記事は画像なしで本文だけ出す

### 結果・ベスト・投稿文（`lib/store.js`・`lib/share-text.js`）

- キー `day031.best.v1`: `{ v: 1, best: { "pref": { score, at }, "town:05": {…}, "town-all": {…} }, lastPref: "05" }`。`score` は数値、`at` は ISO 日時
- `load(storage)` → `{ record, canSave }`。壊れていれば新しい記録。`saveBest(storage, record, key, score, now)` → `{ saved, improved }`。同点は更新しない
- `lastPref` は `town` で遊び始めたときに保存し、次回 `#pref-select` の既定にする（`?p` が優先）
- 投稿文（純関数 `postText({ mode, prefName, score })`）:
  - pref: 「この形、どこ？ 都道府県のシルエットクイズ 8.5 / 10」
  - town: 「この形、どこ？ 秋田県の市町村クイズ 8.5 / 10」（東京都は「市区町村」）
  - town-all: 「この形、どこ？ 全国の市区町村クイズ 8.5 / 10」
  - 末尾に改行して URL（`town` は `?p=NN` 付き・`<link rel="canonical">` があればそれを基準にする）と `#100日チャレンジ`
- `#post-score` は `https://x.com/intent/post?text={投稿文}&url={URL}` を新しいタブで開く。`#copy-score` は `navigator.clipboard.writeText`、失敗したら「コピーできませんでした」

### URL

- `?p=NN`（`01`〜`47`）: `town` を既定にし、`#pref-select` をその県にする。不正な値は無視して通常どおり
- `?m=pref|town|town-all`: 既定のモード。`?p` があれば `town`
- `?seed=整数`: テストとデモのための固定の種。それ以外は乱択
- 開いた直後に自動で開始はしない（1タップで開始）

### シェア・OGP

- `index.html` の `</head>` 前に `./shared/share.css` と `./shared/share.js`（defer）。`<meta name="share:text">` は「この形、どこ？ — 都道府県・市区町村のシルエットを見て地名を当てる10問クイズ」（アプリ名を含める）。`<main>` の末尾に `<div id="share"></div>`。OGP・canonical はビルドが入れるのでアプリ側に書かない

### 出典表示（`#sources`・`<footer>`）

- 「出典：「国土数値情報（行政区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html）を加工して作成。原典は国土地理院「数値地図（国土基本情報）」。形は単純化した概略で、位置や面積の参照には使えません」
- 「解説と写真：Wikipedia（CC BY-SA 4.0）」

## 同梱データ（`tools/`・`data/`）

### 入手（`tools/fetch-n03.mjs`）

- 国土数値情報 行政区域データ 2025年版の都道府県別 zip（`https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_NN_GML.zip`・`NN` は `01`〜`47`）を `tools/cache/n03/` に保存する（gitignore 済み）。既にあれば取らない。逐次で、1件ごとに 300ms 空ける。`User-Agent: hundred-days build tool (+https://hundred-days.pages.dev/)`。秋田（05）は 5.6MB、直リンクで 200 が返ることを 2026-09-07 に実測済み
- zip の中の `N03-20250101_NN.geojson` だけを `tools/cache/n03/NN.geojson` に展開する（`unzip -o -j` を `child_process` で呼んでよい）
- 属性（2025年版の実データで確認済み）: `N03_001` 都道府県名、`N03_002` 北海道の振興局、`N03_003` 郡名（「郡」で終わるものだけ。政令市名は入らない）、`N03_004` 市区町村名（政令市は市名）、`N03_005` 政令市の区名、`N03_007` 5桁コード。所属未定地は null ではなく末尾 `000`（`13000` など・計140 feature）。同じコードの feature が複数ある（飛び地・島）

### 変換（`tools/build-data.mjs`・mapshaper を使ってよい）

- mapshaper は `npx -y mapshaper@0.7.59` で呼ぶ（`child_process`）。手元で 0.7.59 が動くことを確認済み。実行時には使わない（出力 JSON を同梱する）
- 市区町村の単位に揃える。**政令市の区は市に融合**する（`N03_005` に区名がある feature は、名前を `N03_004`（市名）にし、コードはその市の区コードの最小値を10の位で切り下げた値にする。`先頭3桁 + "00"` にすると川崎市・相模原市・堺市・浜松市・福岡市が同じ県の1市目と衝突して消える）。**東京23区は区のまま**（`N03_005` が null で `N03_004` が区名）。それ以外はコードと `N03_004` をそのまま。同じコードの feature は1件に融合する（`-dissolve`）
- 除外: `N03_007` の末尾が `000`（所属未定地）、北方領土の6村（`01695` 色丹村・`01696` 泊村・`01697` 留夜別村・`01698` 留別村・`01699` 紗那村・`01700` 蘂取村。後志の泊村 `01403` は除外しない）
- 単純化: 市区町村は `-simplify interval=100 keep-shapes`、都道府県（県の全 feature を融合したもの）は `interval=300 keep-shapes`。フラグは `mapshaper -h simplify` で確かめる
- 島の扱い（純関数 `keepMainParts(parts, { distanceRatio })`）: 面積最大の部分を残し、それ以外は「面積が最大部分の1%以上」かつ「外接矩形の中心の距離が最大部分の外接矩形の対角線の `distanceRatio` 倍以内」のものだけ残す。市区町村は、対角線の 1.0 倍以内なら面積 1% 以上で残し、1.0〜1.5 倍は**面積が最大部分の 10% 以上のときだけ**残す（上島町や日高町のように離れた部分こそが形になる町は残り、多度津町の小島のように本体を隅へ追いやるだけの小島は落ちる）、都道府県は 1.0（1.5 だと東京都に伊豆大島が残って本土が枠の高さの 17% まで潰れる。1.0 でも佐渡・隠岐・淡路島・小豆島・種子島・屋久島・天草は残る）。穴（湖など）は残す
- 投影と正規化（純関数 `normalizeShape(multiPolygon)`）: `x = lon × cos(中心緯度)`、`y = −lat` で平面にし、外接矩形の長い辺が 1000 になるように拡大縮小、短い辺は中央寄せ、整数に丸める。連続する重複点を除き、4点未満のリングは捨てる。**緯度経度は出力に残さない**
- 県内の位置（純関数 `positionIn(prefFrame, townProjected)`）: 県と同じ投影・同じ枠で町の外接矩形を測り、`pos = [cx, cy, size]`（中心と長い辺・県の枠 0〜1000 の整数）。町の外接矩形の中心が県の枠の外にある町（離島だけの町・34件）は `pos` を枠内にクランプしたうえで **`far: true`** を付ける。アプリはこの町でヒント地図を出さず、文字で「県の本土から離れた島です」と伝える
- 出力
  - `data/prefectures.json`: `{ "version": 1, "generatedAt": "YYYY-MM-DD", "source": "国土数値情報（行政区域データ）2025年版（国土交通省）を加工", "items": [{ "code": "05", "name": "秋田県", "region": "tohoku", "towns": 25, "shape": { "rings": [[x, y, x, y, …], …] } }] }`（コード順・47件）
  - `data/towns/NN.json`: `{ "pref": "05", "prefName": "秋田県", "items": [{ "code": "05201", "name": "秋田市", "kind": "市", "district": null, "pos": [cx, cy, size], "shape": { "rings": [...] } }] }`（コード順・`district` は `N03_003` が「郡」で終わるときだけ・北海道は `N03_002` の振興局を `district` に入れる・枠外の離島の町だけ `"far": true` を持つ）
  - `rings` は外側も穴も同じ配列に入れる（`evenodd` で描く）。最初のリングが外側
- 検算と報告: 市区町村の総数（期待 1,741＝792市＋743町＋183村＋23区）、県ごとの件数、点数の最小・中央値・最大、各ファイルの大きさ。町は中央値 150〜400 点、県は 300〜900 点を目安にし、外れていれば `interval` を調整してから報告する。同じ入力から同じ出力が出ること（決定的）
- `lib/geo.js`（純関数。`keepMainParts`・`normalizeShape`・`positionIn`）は変換ツールとテストから読む。`ringsToPath`・`placeRings` はアプリ側の `lib/svg.js` に置く。ツールから読むときは相対パスの `import`

### 地方区分（`lib/regions.js`）

- Day 024 `lib/blocks.js` と同じ8地方区分（北海道／東北／関東／中部／近畿／中国／四国／九州・沖縄・三重県は近畿）。`id`・`label`・県コードの配列を持つ。県コードは総務省コード（`01`〜`47`）

## 非機能・技術

- 依存ゼロ・ビルドなしの vanilla JS（ES modules）。`index.html`＋`app.css`＋`app.js`＋`lib/`（`quiz.js`／`geo.js`／`regions.js`／`wiki.js`／`store.js`／`share-text.js`／`rng.js`）
- 外部通信は **Wikipedia の `ja.wikipedia.org`（connect）と、記事写真の `thumb.wikimedia.org`・`upload.wikimedia.org`（img）だけ**。`scripts/build.mjs` の `CONNECT_BY_APP` に `'day-031-shape-where': 'https://ja.wikipedia.org'`、`IMG_BY_APP` に `' https://thumb.wikimedia.org https://upload.wikimedia.org'` を足す（CSP で止まると try/catch に吸われて「なぜか出ない」になる。summary の `thumbnail.source` は 2026-09-07 の実測で `thumb.wikimedia.org` から返った）
- インライン `<script>`・`style` 属性・`onclick` 属性は使わない。スタイルの動的変更は class か `element.style.setProperty`。SVG の `d` は `setAttribute`
- `innerHTML` にユーザー由来・API由来の文字列を入れない。`alert/confirm/prompt` を使わない
- 定数名を「KEY」で終わらせない。ソースにローカルの絶対パスを書かない。同梱データに `token=` のようなクエリを含めない
- アクセシビリティ: ボタンの操作領域 44px 以上、コントラスト 4.5:1 以上、フォーカスリング可視、`#reveal-result` と通知は `role="status"`、正解・不正解は色と文字の両方で伝える。`playing` のとき選択肢は `1`〜`4` キーでも押せる（必須）。`reveal` のとき `Enter` で次へ
- レスポンシブ: 320 / 390 / 1280px で横スクロール無し。390×780 でシルエットと4択が同じ画面に入る。1200×750 でも同様。360×640 でも4択の下段まで画面に入る（高さの短い端末ではシルエットを `34vh` まで縮める）
- 時刻は `new Date()` から取る（テストで差し替えるため）

## テスト

- ユニット（`tests/*.test.mjs`、`node --test`）
  - `quiz.js`: 10問が重複しない／4択が4件・重複なし・答えを含む／`town` の誤答候補が同じ県／`pref` の誤答候補に同じ地方が2つ／`town-all` で**県が重複しない**（`planPrefCodes` も同じ10県）／`pref` の1問目が特徴的な9県のどれか／`town` の1問目が `pos[2]` 上位5件のどれか／同じ種で同じ結果／`score` の 1・0.5・0 と表示
  - `geo.js`: `normalizeShape` の範囲（0〜1000・整数）と長い辺が 1000／縦横比が保たれる／穴が残る／`keepMainParts` の面積・距離の条件（正方形で検算）／`positionIn` の中心と大きさ／`ringsToPath` が `M … Z` を出す
  - `wiki.js`: `titleCandidates`／`shouldTryNext`（曖昧さ回避・県名なし・候補切れ）／`trimExtract`
  - `store.js`: 往復／壊れたJSON／同点は更新しない／`lastPref`／例外→`canSave: false`
  - `share-text.js`: 3モードの文言と `?p` の有無
  - `regions.js`: 47県がちょうど1つの地方に入る
- E2E（`tests/e2e/day-031-shape-where.spec.mjs`・Playwright・`/day-031-shape-where/`）。同梱データは `page.route('**/day-031-shape-where/data/**')` で**小さな固定データ**（`tests/fixtures/` に10県。`05`・`06` は町12〜13件、残り8県は各5件。全国モードが10県を重複なく引くには10県が要り、1県で10問を組むには10件以上が要る）に差し替えて決定的にする。Wikipedia も `page.route('https://ja.wikipedia.org/**')` と `https://upload.wikimedia.org/**` で固定応答にする
  - start に3つのボタンと見出し。`?p=05` で `#pref-select` が `05`、ボタンの文言に県名
  - `?seed=1&p=…` で開始→`playing`、`#shape-path` の `d` が空でない、選択肢4つ、`#progress`「1 / 10」
  - 正解を押す→`reveal`、`#reveal-result`「正解！」、正解の選択肢に `data-result="correct"`、4つとも `disabled`、フォーカスが `#next-button`
  - 不正解を押す→「ざんねん」、押した選択肢に `data-result="wrong"`、正解に `data-result="correct"`
  - Wikipedia の固定応答→`#reveal-wiki` が見え、`#wiki-extract` に本文、`#wiki-link` の `href` が記事URL。曖昧さ回避の応答→2回目の候補で取れる。失敗応答（500）→`#reveal-wiki` は `data-status="none"` で1行だけ、枠の高さは同じ、コンソールエラー 0
  - ヒント→`#hint` が見え、`data-hint-used="true"`、その問の正解は 0.5 点で結果に反映（`#result-score`）
  - 10問通す→`result`、`#result-score` の値、`#result-list` が10件、`localStorage` にベスト、再読込した start に「ベスト …」
  - `#post-score` の `href` が `x.com/intent/post` で投稿文に点数とアプリ名、`town` では `?p=` 付きURL
  - 「同じ設定でもう一度」→`playing`、「モードを選び直す」→`start`
  - `playing` で「やめる」→`start`（確認ダイアログ無し）／`1`〜`4` キーで選択肢が押せる／都道府県モードのヒントで2つが `disabled` になり答えは残る／Wikipedia の応答を 1500ms 遅らせても `#next-button` の `boundingBox().y` が届く前後で変わらない／`#reveal-wiki` の `data-status` が `loading`→`ready`、失敗時は `none` で1行が出る／360×640 で4択の下段が画面内／`#score-now` が正解のたびに増える
  - データ読み込み失敗（route で 500）→`error`、`#retry-button` で成功応答に切り替えると `playing`
  - `localStorage` 不可→`#storage-notice`、遊べる
  - 実データのスモーク（`data/prefectures.json` が存在するときだけ）: route を使わず `pref` を開始し、`#shape-path` が描かれ、`#choices` に4県。無ければ `test.skip`
  - 320 / 390 / 1280 で横スクロール無し／390×780 で `#shape` と `#choices` が画面内／表示中のボタン 44px 以上／ページ読込後の外部通信が Wikipedia 以外 0 件／コンソールエラー 0
- 既存の `tests/e2e/shared-share.spec.mjs` と `security-headers.spec.mjs` が新しい Day を拾って通ること

## デモ・スクショ・プロモ

- デモ（15〜20秒・`?seed=` 固定）: 1コマ目は**シルエットが出ている画面**（start 画面から始めない）。正解→Wikipedia が出る→次の問→ヒント→結果、の順
- スクショ `screenshot.webp` はシルエットと4択が入った `playing` の画面
- プロモは Day 026 方式（`tools/promo/`）で別途

## やらないこと

- 制限時間、ランキング、ログイン、サーバー保存
- 入力式の回答（かな・漢字の入力）
- 世界の国、地図タイル、現在地、緯度経度の表示
- 読み仮名の同梱（Wikipedia の要約に含まれることが多い）
