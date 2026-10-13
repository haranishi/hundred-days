# Day066『箱影の怪盗』実装依頼（実装担当向け・自己完結）

## 作るもの

押せる箱で、見張り・警備員の光とレーザーをさえぎり、影を通って宝を盗み、出口へ逃げるパズル。1手＝怪盗が上下左右に1マス動く（前の箱を押す）か待つ → 警備員が1歩。光が自分のマスに当たると見つかる。全8面（levels.json）。登録なし・外部通信なし・依存ライブラリなし（素の JS・CSS・SVG。ES modules）。
一周：盤を見る（光・影・点線の予告）→ 動く・押す・待つ → 見つかったら原因を読んでひとつ戻す／詰んだら戻す／宝を持って出口に着いたら星と手数 → 次の面へ。

## 置き場所と手本

- 作業ツリー：Day066 の作業ツリー（ブランチ feat/day-066-hakokage-kaito）。その外を触らない。ほかの Day の作業ツリーは開かない。
- アプリ：`day-066-hakokage-kaito/`（index.html・app.css・app.js・lib/・tests/・meta.json・README.md・favicon.svg・shared/）。E2E：`tests/e2e/day-066.spec.mjs`。
- 手本：day-065-teikoku-gohan（構成・tests/index.mjs の登録・shared の取り込み・meta.json・README）、tests/e2e/day-065.spec.mjs（CSP を当てて開く関数・外への通信の記録・44px の測り方）。
- 読む順：01_rules → 02_ui（入口）→ 02_ui_style → 02_ui_states → 02_ui_text → 02_ui_hooks → 03_gates → levels.txt → reference/ → 06_design_skills → 08_design_review。
- このフォルダの正：levels.json（面データ）、reference/sim.mjs（ルール）、reference/layout.mjs（画面の型とマスの大きさ）、02_ui_text.md（文言）。検証の道具：solve・checks・verify-levels・rules-check・mutate・layout-table（いずれも reference/）。build-levels.mjs は面を作り直す道具で、使わない。

## ファイルと関数（この名前で作る）

| ファイル | 中身 |
|---|---|
| lib/sim.js・lib/layout.js | reference/sim.mjs・layout.mjs の写し（1〜3行目のコメントだけ書き換えてよい） |
| lib/levels-data.js | `export const LEVELS = ` に levels.json をそのまま |
| lib/render.js | `drawBoard(svg, level, state, { cell })`：scene() を1回呼び、02_ui.md の順で SVG を作り直し、02_ui_hooks.md の data 属性を付ける。`movePieces(svg, events, ms)`：怪盗・箱・警備員を CSS の transform で動かし、`finish()` を持つ物を返す |
| lib/phrase.js | `sourceLabel(level, source)`・`caughtText(level, caught)`→{ title, lines }・`bumpText(reason)`・`moveText(events, steps)`・`clearText({ par, steps, best, prevBest })`・`deadText()`・`shareText({ no, name, stars, steps })`。文は 02_ui_text.md の表の写しだけ |
| lib/board-text.js | `boardLines(level, state)`→ 文の配列（盤を文で読む） |
| lib/progress.js | `STORAGE_NAME`・`loadProgress(storage)`・`saveProgress(storage, data)`・`recordClear(data, id, stars, steps)` |
| lib/audio.js | `createAudio({ muted })`→{ unlock(), play(name), setMuted(on) }。name は step・push・bump・wait・treasure・caught・dead・clear |
| app.js | 画面の状態（02_ui_hooks.md の移り変わり）、入力（02_ui_states.md のキーとフォーカス）、型とマスの計算（実測の reserve を `cellSize` に渡す）、詰みの検出、お手本、保存のつなぎ |
| index.html | 02_ui_hooks.md の id で組む。`<link rel="stylesheet" href="./shared/share.css">` と `<script src="./shared/share.js" defer>` を1行ずつ（Day065 と同じ）。`<script type="module" src="./app.js">` |
| meta.json | day 66・season 3・title「箱影の怪盗」・description は 02_ui_text.md の description・tags ["game","puzzle","stealth","audio","localstorage"]・status "draft"・publicUrl `https://hundred-days.pages.dev/day-066-hakokage-kaito/`・screenshot "screenshot.webp"・startedAt と finishedAt "2026-10-13"・actualMinutes 0・sourceOfIdea「掛け合わせゲーム200案のうち081（箱押し×潜入）を本人が選んだ。名前は仮称のまま。Web で検索した範囲では同名の作品は見つからなかった（商標の確認は別に行う）」・humanHandled「081 を選び、Day66 として制作を指示（設計は Opus、実装は Sonnet）」・aiHandled と failuresAndFixes は実際にしたことだけ |

## 守ること

1. ルールは lib/sim.js だけが決める。app.js で光・影・判定・予告を計算し直さない（描くのは scene() の結果だけ）。違いや矛盾を見つけたら、直さずに報告する。
2. 面データ（盤・警備員・レーザー・par・見本の解・罠）を変えない。面を足さない。
3. **文言は 02_ui_text.md が正。実装者は文言を作らない・言い換えない。** 足りない文があれば止めて報告する。デザイン系スキルが別の言い方を出しても、02_ui_text.md に反映されるまで使わない。
4. 配信するコードは day-066 の中で完結させる（reference/ を import しない）。インライン script・`on*=` 属性・`style` 属性・外部フォント・外部画像・外部通信は禁止。scripts/ とほかの Day は変更しない。絵文字を使わない（★☆は文字として可）。
5. コミット・push・PR・マージ・公開をしない。meta.json の status は "draft"。git add もしない。
6. 宣伝動画・X投稿文は作らない。screenshot.webp は共通の試験のために作る（1200×750・メタデータなし）。
7. README は100行以内。コードを消したら失われること（目的・設計判断・捨てた案・罠）だけを書く。
8. 「全テスト合格」と書くなら、実行したコマンド・件数・実際の出力を貼る。発注側が再実行して照合する。

## 設計判断（理由つき。README にも要点を書く）

- 見えている光＝判定：動いた直後と警備員の後の2回判定し、次の1歩の光を点線で常に出す。理不尽な失敗をなくすため（企画の反証②）。予告は、箱を動かさずに待った場合の次の光。箱を押す手では遮光や巡回が変わるので、予告と結果が違うことがある。
- 巡回は一直線の道を往復し、端と箱の前では1歩使って向きを変える。止まって引き返す瞬間が目に見える。
- 出口は宝を取るまで閉じた扉。盤のタップ・スワイプは入れない（スクロールとぶつかり、光へ踏み込む事故になる）。
- 詰みは箱を押した直後だけ調べる（上限1万状態。全面の詰み状態より多いので取りこぼさない。面8でも Node で44ms）。
- 画面の型（tall・compact・tiny・short・wide）は layout.js の1関数で決め、CSS は `html[data-layout]` を見る。境目を二重に持たない。
- 星は par 以内★3・par×1.5以内★2。お手本（2回失敗で最短解を再生）を見ても星は減らさない。
- 結果の欄は操作の場所に差し替える（窓にしない）。共通の共有欄（`.share`）は、帯のボタンから開く `#share-dialog` の中だけ。結果の共有（Xで送る・LINEで送る・リンクをコピー・端末の共有シート）は、成功の欄の中に別のボタンとして置く。
- 「最初へ」は確認の窓を出さず、ひとつ戻すで取り消せるようにする（親指の誤タップ対策）。

## デザイン系スキル（06_design_skills.md・本人の指示）

- 設計の段階で ux-copy・design-handoff・design-system・accessibility-review を当て、結果は 02_ui*.md に反映済み（記録は 08_design_review.md）。
- **実装の最後に、実ページへ design:accessibility-review と design:design-system（audit）を当て、表を最後の報告に貼る。** accessibility-review は実測で示す（getComputedStyle・getBoundingClientRect・キーボードだけで面1をクリア・拡大200%のスクショ）。重大（Critical）が残ったら直す。design-system の audit は、`:root` の外の色と、決めた段にない px を数えて直した数を書く。
- Skill ツールで呼べなければ、そのスキルの型（見出しと表の列）を手で再現し、「手で再現した」と書く。使ったふりをしない。

## 最後の報告に含めること

変更・追加したファイルの一覧／実行したコマンドと結果（shared:sync・index:sync・build・test:unit・precheck・E2E〔day-066 を等速3回・CPU 5倍と10倍で各1回、shared-share、security-headers〕・変異テスト13個の表）／reference との差異（`diff` で sim.js・layout.js の4行目以降が同一であること）／デザイン系スキル2本の表／未解決の点と判断が要る点／自分で確かめたこと（画面幅ごとのスクショを見た結果）と、確かめていないこと（実機・音）。
