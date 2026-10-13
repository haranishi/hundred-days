---
day: 66
slug: day-066-hakokage-kaito
role: 実装担当（Sonnet）の再開メモ。段階が終わるたびに書き足す
---

# Day066 実装の再開メモ

止まったら、末尾の「次にやること」から続ける。作業ツリーの外のものは触らない。git add・commit・push・PR・マージ・公開はしない。

## 段階

| 番号 | 段階 | 状態 |
|---|---|---|
| 0 | 依頼書一式を読む（00→01→02→02_ui_*→03→levels.txt→reference→06→08） | 済 |
| 1 | lib/sim.js・layout.js・levels-data.js ＋ 単体テスト（sim・rules・levels・layout） | 済（121件・変異13個すべて検出） |
| 2 | 画面：index.html・app.css・app.js・lib/render・phrase・board-text・progress・audio・dom・icons ＋ 単体テスト（phrase・board-text・progress・static） | 済（単体184件） |
| 3 | スクショ（5つの画面幅×4場面）を撮って自分で見て直す | 済（5つの幅・面1と面8・見つかった・詰み・成功・窓・お手本・200%拡大・強制カラーまで見た） |
| 4 | E2E（tests/e2e/day-066.spec.mjs） | 済（動きを減らす設定と通常の動きの両方で 51件通過・1件省略。等速3回・CPU 5倍/10倍は最後にまとめて流す） |
| 5 | README・meta.json・favicon・プライバシー文書（Day066＋Day065の節） | 済（README 58行・lint 0件。プライバシー文書に Day065 と Day066 の段落、最終改定を2026年10月13日に） |
| 6 | まとめ：shared:sync・index:sync・build・test:unit・precheck・E2E・変異13個・デザイン系スキル2本 | 済（E2E は全段通過。meta.json は draft に戻し、index:sync・build をやり直し、開発用の配信を止めた。最終報告を提出） |

## 実行したコマンド

- 段階1：`node --test day-066-hakokage-kaito/tests/` → 121件すべて合格（sim・rules・levels・layout）
- 段階1：変異13個 → 作業ツリーの外の run-mutants.mjs（reference/mutate.mjs の MUTANTS を lib/sim.js に当て、SIM_PATH に渡して単体テストを流す）で13個すべて落ちた
- 段階2：`node --test day-066-hakokage-kaito/tests/` → 184件すべて合格（phrase・board-text・progress・static を追加）
- 開発用の配信：作業ツリーの外の serve-root.mjs をポート4666で起動（止めるのは最後。pid は scratchpad/day066/serve-root.pid）。撮影は scratchpad/day066/scenario.mjs（使い方は冒頭のコメント）
- diff：lib/sim.js と lib/layout.js の4行目以降は reference と同一（tests/sim.test.mjs が毎回突き合わせる）

## 次にやること（最新・最終）

実装側の作業はすべて終わった。残りは発注側（本人）の判断だけ。

- 最終：E2E 全段通過（等速・CPU 5倍・10倍・shared-share・security-headers）。meta.json の status は draft、actualMinutes は 0 のまま（その後、発注側が公開前に実測して入れた。根拠は progress.md の末尾）。開発用の配信（ポート4666）は止めた。git add・commit・push・PR・マージ・公開はしていない
- 公開するとき：meta.json の status を published にして `npm run index:sync`（ルートの README.md の Day66 の行が「未公開」から「アプリを開く」に変わる）→ `npm run build` → 本人が commit・PR
- 判断が要る点：面7の guard-turn-box の手順（03_gates.md）を UUURRURDDDULLLDDR に差し替える／幅195px（390pxの端末を200%拡大）では、フッターとあそびかたの窓で行頭に句読点が来る所が16件ある（幅320〜1440の5つの幅では全場面で0件。読めるし操作もできるので直していない）

## 古い「次にやること」

段階3の続き：お手本・拡大200%・横向きの確認 → 段階4：tests/e2e/day-066.spec.mjs を書く（dist/_headers の CSP を当てて開く。published にして build してから流す。PLAYWRIGHT_PORT=4666 は開発用の配信が使っているので、E2E は別のポート（例 4667）か、開発用の配信を止めてから）。

## 実際に起きたこと（meta.json の failuresAndFixes に書く材料。起きた順）

1. 横幅広（1440×900）で題字の行が盤の下に回り込んだ → 格子の行を明示した（盤の行指定が先に確定し、全幅の題字が後ろへ追いやられていた）
2. 無効な手の一言が盤の半分の幅で折り返し「進めな／い」と割れた → 吹き出しの幅を中身に合わせた（left:50% で使える幅が半分になっていた）
3. 共有の窓で共通の共有欄が最低幅を持ち、右にはみ出して余白も出た → 窓の中では幅と区切りを打ち消した
4. あそびかたの1文目が「見つか／る」と語の途中で割れた → 折り返してよい所（ひらがなの並びが終わる所）を入れた
5. 390幅の端末を200%拡大（195px幅）にすると、帯が横にあふれ、固定した操作が盤を隠した → 折り返しを許し、操作が画面の半分を超えるときは固定をやめた
6. 静的な検査が、icons.js のコメントの記号（三角・星）と、CSS の white-space の語を色と取り違えたのを拾った → コメントを書き換え、検査の語の判定を直した
7. 状態の行の「お手本」を押しても始まらなかった（失敗の欄の間しか受け付けていなかった）→ play からも始められるようにした（E2E を書いていて気づいた）
8. E2E の「動きを減らす」試験群が、実は通常の動きで走っていた（test.use({ reducedMotion }) はこの Playwright では効かない）→ contextOptions に入れ、両方の動きで流す
9. 面の一覧・あそびかたの窓が、小さい画面で「とじる」が画面の外に出た → 本文だけをスクロールさせ、「とじる」は固定した
10. 375×667 の面6「通り道をふさがない」が面の帯で2行になった → 面の名前の字の大きさを、ボタンの幅に9字が収まる大きさまで縮める（上限17px・下限13px）
11. 設計の食い違い：03_gates.md の面7 guard-turn-box の手順（UUURURDUDDDULLDD）は、10手目の箱を押す手で詰みになり、画面は先へ進めない → 詰みを通らない UUURRURDDDULLLDDR（17手目）に置き換えて E2E に使い、単体テストで両方を固定した（報告に書く）
12. flex-wrap を許したら、390幅の題字の行が2段に割れた → 文字側の最小幅を決めて右に並ぶ形に戻した
13. 盤を文で読む（キーボードで届くと見える）が、盤でなく画面の上端に重なっていた → 盤の入れ物の中に移した
- 14. 窓を閉じたあとの焦点戻しを非同期の close イベントでしていたため、閉じた直後に別の場所へ移した焦点を奪い返し、Space が効かない場面が出た（試験を25回繰り返して再現）→ 標準の同期の戻しに任せ、自前の閉じる経路は閉じた直後に同期で戻すようにした

## 実行したコマンドと結果（段階6・最終）

- `npm run shared:sync` → 0ファイル複製／`npm run index:sync` → 66件の一覧を更新／`npm run build` → 66 day(s) / 公開 66
- `npm run test:unit` → 3158件中 3157 合格・失敗 0・省略 1（省略は Day031 の Natural Earth の生データ待ちで、Day066 ではない）
- `node --test day-066-hakokage-kaito/tests/` → 191件すべて合格・省略 0（3回流して毎回同じ）
- E2E（published にして build した dist・ポート4667）：day-066 を等速で4回（51通過・1省略。うち最終の試験ファイルでは3回）／CPU 5倍 51通過／CPU 10倍 51通過／shared-share 254通過／security-headers 7通過
- 幅195px以外の行頭の禁則：幅320・375・390・844・1440の5つの幅×10場面（計50）で0件。幅195px（390pxの端末を200%拡大）では16件（フッターと あそびかたの窓。overflow-wrap: anywhere の緊急の折り返しが句読点を行頭に出す）
- `npm run precheck` → exit 0・失敗 0（目視確認の警告は画像のみ）
- 変異13個（scratchpad の run-mutants.mjs）→ 13個すべてで1件以上落ちた
- diff：lib/sim.js・lib/layout.js の4行目以降が reference と同一／lib/levels-data.js は levels.json と deepStrictEqual で同一
- 参照側：verify-levels.mjs 全面OK・rules-check.mjs すべて想定どおり・layout-table.mjs 全面収まる
- デザイン系スキル：design:accessibility-review・design:design-system を Skill ツールで呼んだ（実測の結果は報告に貼る）
- 15. 読み返しで見つけた：盤を文で読むを開いたまま矢印キーを押すと盤が動いた（読んでいる最中に盤が変わる・長い文を矢印でスクロールできない）→ 開いている間は盤を動かさず、Esc で閉じる。使われていない renderAll も削除

## 修正1周目（体験評価 17/20 のあと・2026-10-13）

範囲：`day-066-hakokage-kaito/`（`tools/` は触らない）・`tests/e2e/day-066.spec.mjs`・設計メモ（02_ui_text.md・02_ui_hooks.md・levels.json・levels.txt・reference/build-levels.mjs）。ルール（lib/sim.js・layout.js）と面の盤・解・罠・par は変えていない。git・公開はしていない。

| 指摘 | 直したこと |
|---|---|
| Space が、マウスで押して焦点の残ったボタンを押す | Tab で当てた焦点だけを覚え（Tab の keydown の直後の focusin）、その要素の上でだけ Space をそのボタンの1手にする。ほかは待つ（keydown と keyup の両方の既定の動作を止める）。`:focus-visible` は使えなかった（下の「実測」） |
| あそびかた・ヒントの説明 | あそびかた1に「白い覆面があなた」と順番の決まり、2に「箱をどかすと、光は戻る」。ヒントは面2・4・5・6・7を「ルールは言うが答えは言わない」形に（reference/build-levels.mjs の hint: を直して levels.json・levels.txt・lib/levels-data.js を作り直した。verify-levels V1〜V7 合格）。02_ui_text.md も同じ文に |
| B2 文字のキーを止めてもキー案内が変わらない | 盤の横とあそびかたの案内を、止めたときは「矢印で移動・スペースで待つ・Backspaceでひとつ戻す」に。aria-keyshortcuts からも文字のキーを外す |
| B3 見張りの所で「警備員がいて通れない」 | 画面側で、ぶつかったマスの光源の種類を面のデータから見て「見張りがいて通れない」に言い換える |
| B4 お手本の終わりの文が見えない | 読み上げ（#live）はそのまま、見える一言（#toast）を約3.2秒（--dur-toast-long）出す |
| B5 面5で「お手本」の札が出口に重なる | 盤の上の札（#demo-badge）をやめ、状態の行の「お手本 i/par手」を札の形にした |
| お手本が速い | 1手 400ms を 700ms に（DEMO_STEP_MS） |
| 共有の窓の説明文が右で切れる | `.share__note`（と、同じ共通部品の `.share__said`）を折り返しを許す一覧に足した。`shared/` は直していない |
| 幅768の面の帯で「次の面」が左下へ落ちる（幅700では、操作が右へはみ出す） | wide の列を「盤の列は縮められる・右の列は操作の幅より狭くしない」に。右の列が240px以下のときは、面の帯を「名前／前・次」の2行に（コンテナクエリ） |
| フッターの文 | 「進み具合と設定は…自動では送りません。共有を押したときだけ、説明か結果（面・星・手数）とURLが共有先へ渡ります。」 |
| 来歴の言い切り | icons.js・index.html のコメント・meta.json の「自作の SVG／絵」を「SVG」に |
| WebKit で Esc のあと焦点が戻らない | 窓の close イベントで、焦点が無い（body・null・閉じた窓の中）ときだけ開いたボタンへ戻す。別の場所に焦点があれば奪わない |

### 実測（設計との食い違い）
- `:focus-visible` は、最初のキー入力の keydown の中で、マウスで押したボタンにも真になる（Chromium 151。Firefox 153 は偽。WebKit はクリックでボタンに焦点が当たらない）。依頼の指針（`:focus-visible` で分ける）は使えないので、Tab の直後の focusin を覚える方式にした。振る舞いは依頼どおり。
- keyup の抑止は、Chromium と Firefox 153 では、外しても結果が変わらなかった（keydown の抑止だけで、ボタンは押されない）。依頼どおり入れてある（古い Firefox への保険）。変異で落ちる試験は作れない。
- close イベントの時点では、閉じた窓の中のボタンが activeElement のまま残る（Chromium）。「body か null」だけを見る方式では戻らなかったので、窓の中も「焦点が無い」に数えた。

### 検査（実出力は報告に貼った）
- 単体：Day66 196件すべて合格（修正前191）。リポ全体 3163件・合格 3162・失敗 0・省略 1（Day031 の元データ待ち）。
- 参照側：verify-levels V1〜V7 合格・rules-check すべて想定どおり。lib/sim.js・lib/layout.js は基準と4行目以降が同一。
- 変異13個：13個すべてで落ちた。新しい E2E の変異17個（Space・共有の説明文・wide の列・面の帯・札・お手本の速さと終わりの一言・見張りの一言・キー案内・窓の焦点・フッター・あそびかた）もすべて落ちた。
- E2E：Day66 は等速 67通過・1省略（動きを減らす設定だけの試験）、CPU 5倍 67通過・1省略。WebKit は 60通過・5失敗（Tab でボタンに着かない・navigator.share があり clipboard-write が無い、の Playwright の WebKit の仕様差。修正と無関係）。shared-share は 260通過・1失敗（Day044 の3D の頁が「Target page … closed」。Day66 ではない）。
- precheck：終了コード 0（目視確認の警告は画像のみ）。絵文字・商標・絶対パスの混入：アプリと E2E は0件（設計メモの ◀▶ は元からの記号）。

### 触っていないもの・残した点
- 02_ui.md・02_ui_states.md・03_gates.md は、お手本の1手を 400ms、札を盤の左上と書いたまま（依頼の範囲外）。
- design:ux-copy を1回呼んだ。直す指摘は無し。観察2点：「共有を押したとき」は、成功の欄の「Xで投稿」などの名前と少し離れる。「Backspace」は Mac の delete キー（指定の文のまま）。

## 修正2周目（見た目評価 11/20 のあと・2026-10-13）

評価（別セッションの Opus）：タイポグラフィが0点（共有の窓の説明文の欠け・語の途中の改行）、ほかも1点が多く不合格。範囲・禁止事項は1周目と同じ（ルール・`lib/sim.js`・`lib/layout.js`・`shared/`・`tools/` は触らない・git と公開はしない）。

| 項目 | 直したこと |
|---|---|
| A1 共有の窓 | 見出しを17px・800、窓の中のボタンを16px・700に（`#share-dialog` 側で上書き。`shared/` は直さない）。成功の欄は「Xで投稿」。説明文（`.share__note`・`.share__said`）は、部品を直さず、`app.js` が窓の中で `lib/wrap.js` の区切りを入れ直す（「直／接」「リ／ンク」と割れ、「。」だけの行ができた。共有ボタンの有無で2種類の文があり、両方を試験）。「直接投稿・リンク・コピー・Instagram・YouTube・Web」を保護語に |
| A2 語の途中の改行 | 折り返し候補の入れ方を `lib/wrap.js` の1つの決まりに。助詞で終わるひらがなの後ろ・読点・句点・開き括弧の手前だけで折り、保護語（引き返す・通り道・ひとつ戻す・お手本・見つかる・座標・「面6 通り道をふさがない」…）は割らず `<span class="nb">` で包む。index.html の静的な文も同じ決まりで作り直した |
| A3 自動検査 | capture.mjs が、撮るたびに、見えている段落ごとに「最後の行が4文字以下」「保護語の途中の改行」を数える（全8面の最初・見つかった・成功も）。単体（wrap.test.mjs）・E2E（5つの幅×13の状態）にも。`text-wrap: pretty`・`balance` を足して、7つの幅すべて0件 |
| B1 題字 | tiny で `h1` を帯の左に見える形で出し、ホームは「066」だけ（「100 DAYS /」は読み上げにだけ残す） |
| B2 ヒントのボタン | 電球の絵（`ic-hint`）に。compact は「ヒント」の文字つき、tiny は絵だけ。右向きの三角は「次の面」だけ |
| B3 ヒントの出し方 | compact・tiny は、状態の行と同じ場所に差し替える（閉じるボタン・手を動かす・やり直す・面を変える・Esc で閉じる。面1の初回だけ開いて始める）。行の高さはヒントの行で決まり、開閉で変わらない（盤・操作は動かない） |
| B4 一言 | `#toast` を盤から、ヒントの行（tall・short・wide）か状態の行（compact・tiny）へ。absolute・`inset: 0` で行いっぱいに重ね、行の高さは増やさない |
| B5 全面クリア | 見出し「全8面クリア！」・星と手数を1行・「星 24/24」。320×568で主ボタンが画面に収まる |
| C1〜C3 | 押せない見た目は `aria-disabled` に統一し、色で表す（不透明度をやめて、輪の濃さを守る）。「盤を文で読む」の輪を角丸に。あそびかたを開いた直後の焦点を「とじる」に、窓の本文が高さを超えるときは上下をぼかす |
| D1〜D4 | 成功の欄の下余白（コピーの合図の空き欄をやめ、ボタンの文字の差し替えに）・結果を送るボタンを揃った2段（狭い欄は縦1列・広い欄は1行）／「最初へ」を地が透明で弱く／駒に淡い輪と宝を持った印／横向きの十字ボタンを右寄せ |

### 実測
- 画面の密度に関わらず、Chromium は 1.5px の縁を 1px に丸める。D2 の「縁を細く」は縁の太さで表せず、地を透明にして弱くした。
- 状態の行と同じ場所に重ねた `#hintline` が、お手本の「とめる」を覆った（capture の「06 demo」が失敗して気づいた。E2E は wide で走っていて見落とした）。`pointer-events: none` にし、閉じるボタンだけ `auto`。compact・tiny の E2E を足した。
- `overflow-wrap: anywhere` の非常用の折り返しは、禁則を守らず「。」だけの行を作り、語の途中でも割った（共有の説明文）。最初は `word-break: normal` で字の間の折り返しにしたが、「直／接」と割れたので、区切りを入れ直す方式に変えた（発注側の指摘）。
- 幅768×面8の成功の欄（右の列が200px前後）で、2列に並べた「LINEで送る」が2行に割れた。狭い欄は縦1列に（コンテナクエリ）。

### 検査（修正2周目の最後）
- 単体：Day66 208件すべて合格（1周目196）。リポ全体 3175件・合格3174・失敗0・省略1。verify-levels 全面OK・rules-check 想定どおり・sim.js と layout.js は基準と同一・levels-data.js と levels.json は一致。変異13個はすべて落ちた。
- E2E（published にして build）：Day66 等速 83通過・1省略、CPU 5倍 83通過・1省略。shared-share と security-headers 261通過。WebKit は、変えた試験（共有の窓・文字の組み方・面の一覧・成功の欄・窓の焦点）だけ7件通過（全部の再実行は時間のため未実施）。
- 撮影（capture.mjs・Chromium・7幅・191枚）：capture-report.txt は NG 0・失敗 0・A3（最後の行が4文字以下・保護語の途中の改行）0件。`text-wrap` を外すと、390で4件・320で6件になった。
- 新しい試験の変異37個（単体5・E2E 32）：すべて落ちた。最初は2つが生き残り（面の一覧の行・結果を送るボタンの並び）、試験を強めて落ちるようにした（幅290の面の一覧・幅390と320の並びの確認）。
- precheck：終了コード 0。絵文字・絶対パス・商標・「自作」の grep：アプリと E2E は0件。meta.json は draft に戻し、index:sync と build をやり直した。
