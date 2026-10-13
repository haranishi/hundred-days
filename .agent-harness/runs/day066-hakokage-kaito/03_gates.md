# 検査と進め方

> 注：これは初期の設計。修正1周目・2周目で変わった点（お手本の速さ・札の位置・Space の扱い・ヒントの出し方・題字など）は、`04_resume.md` の修正記録と、アプリの `README.md` が現仕様。

## 進め方（この順で。各段階で止まらず次へ。直しは3周まで）

1. 読む：00 → 01 → 02（入口）→ 02_ui_style・02_ui_text・02_ui_hooks → 03 → levels.txt → reference/。手本は day-065-teikoku-gohan（構成・tests/index.mjs・shared の取り込み・meta.json）と tests/e2e/day-065.spec.mjs（CSP を当てて開く関数・外への通信の記録）。
2. lib/sim.js と lib/layout.js：reference/sim.mjs・layout.mjs を**そのまま**写す（1行目〜3行目のコメントだけ書き換えてよい）。lib/levels-data.js：`export const LEVELS = ` に levels.json を貼る。単体テストを緑にする。
3. 画面：index.html・app.css・app.js と lib/render.js（盤の SVG）・lib/phrase.js（文）・lib/board-text.js（盤を文で読む）・lib/progress.js（保存）・lib/audio.js。
4. Playwright で 390×844・375×667・320×568・844×390・1440×900 のスクショを、面1の最初・面8の最初・見つかった直後・成功の欄で撮り、**自分で画像を読んで**崩れを直す。
5. E2E（tests/e2e/day-066.spec.mjs）。等速で3回続けて通し、さらにページの CPU を5倍と10倍に遅くして各1回通す。
6. README.md（100行以内）・meta.json（status は draft）・favicon.svg（自作の SVG）。
7. まとめて：`npm run shared:sync` → `npm run index:sync` → `npm run build` → `npm run test:unit` → `npm run precheck` → E2E（day-066・shared-share・security-headers）。共通の試験は published の Day だけを見るので、その間だけ meta.json を published にし、screenshot.webp（1200×750・メタデータなし）を置く。終わったら draft に戻す（Day065 と同じ手順）。

## 単体テスト（node --test。tests/index.mjs に必ず登録。登録し忘れたテストは一度も走らない）

- sim.test.mjs：全8面で、見本の解が出口に着き、手数＝par・★3。最初の位置は光っていない。罠の手順の後は `canWin(level, state)`（既定の上限のまま）が `'dead'`、最初の状態は `'dead'` でない。
- rules.test.mjs：reference/rules-check.mjs の17個の例をそのまま `node:test` に移す（影の端・押してどかした光・光源へ押す・端で向きを変える・箱の前で引き返す・予告と違う唯一の場合・判定AとB・無効な手・成功の手・光る宝・光の止まる物・同時に照らされた原因・星の境界・詰み・L字の道の拒否）。
- levels.test.mjs：tests/solver.mjs と tests/checks.mjs（reference/solve.mjs・checks.mjs の写し）で、全面の par と最短解の本数が LEVELS と一致し、V1〜V7 が合格すること（judge() の結果）。詰み状態の数が `DEAD_CHECK_LIMIT` より少ないこと。
- layout.test.mjs：layoutMode の境目（幅699/700、高さ499/500・619/620・759/760）。全8面×7つの画面幅で、マス36px以上・余り8px以上（`node reference/layout-table.mjs` の表と同じ）。`reserve` を渡すと、その値で盤の高さが決まる。
- phrase.test.mjs：見つかった文を、6つの理由×光源の呼び名（見張りが1つ・見張りが2つの面の「見張り2」・警備員・レーザー）で。無効な手の一言5つ。成功の文（最少・★2の「あと何手」・自己ベスト）。結果の共有文は、面3・★2・23手の例で文字列が完全一致すること。
- board-text.test.mjs：盤を文で読むの「光っているマス」「次の1手で光るマス」「影のマス」が、同じ状態の scene() と一致する。
- progress.test.mjs：壊れた JSON・使えない storage・知らない面IDで落ちない。成功で stars は大きい方・best は小さい方。お手本では保存しない。`STORAGE_NAME` の名前が `_KEY` で終わらない。

## 変異テスト（試験が門番か確かめる。実装の写しのテストにしない）

- sim を読み込むテスト（sim・rules・levels）は、`const sim = await import(process.env.SIM_PATH ?? '../lib/sim.js')` で読み込む。
- reference/mutate.mjs の13個の変異（M1 判定Aを消す〜M13 理由の取り違え）を、lib/sim.js の写しに1つずつ当て、`SIM_PATH` をその写しにして `node --test day-066-hakokage-kaito/tests/` を流す。**13個すべてで1件以上落ちること**。生き残った変異があれば、それを捕まえる試験を足す。
- 参照側では、`node reference/mutate.mjs` で13個すべてを rules-check と verify-levels が捕まえることを確かめてある（progress.md）。

## E2E（Playwright。tests/e2e/day-066.spec.mjs）

1. 開く：dist/_headers の CSP を当てて開き、`html[data-ready="true"]`。コンソールのエラー0・CSP 違反0・外への通信0。画面の文字に null・undefined・NaN が混ざらない。
2. 見えている光＝判定：全8面で、最初の状態と見本の解の各手のあとに、`.cell[data-lit]`・`[data-next]`・`[data-shadow]` の座標の集合が、Node で lib/sim.js の scene() から作った集合と一致する。
3. 面1をタップだけで：見本の解を十字ボタンで押す → 成功の欄・`#clear-stars[data-stars="3"]`・手数10 → 再読み込みで面2が開き、面の一覧の面1に★3。
4. 面1をキーボードだけで：矢印・WASD で見本の解 → 成功。Space で待つ・Z で戻す・R で最初へ・Esc で窓が閉じる、も確かめる。
5. 見つかった理由の文（手順は面と組で固定。見つかる手数も確かめる）：walked-in＝面1 `DD`（2手目）／uncovered＝面1 `LLDD`（4手目）／guard-turn＝面5 `RURDDD`／guard-turn-box＝面7 `UUURRURDDDULLLDDR`（17手目。旧案の `UUURURDUDDDULLDD` は10手目の箱を押す手で詰みになり、画面はそこで止まるため、詰みを通らない手順に差し替えた）／guard-rotate＝面4 `RDD`。それぞれ `#caught-text` に 02_ui_text.md の文、`.caught-beam` の数が原因の光のマスの数と同じ。`#btn-caught-undo` で play に戻り、手数が1減る。
6. 詰みとお手本：面3 `RRRRDD` で `#panel-dead`。戻して同じ罠をもう一度 → `#btn-dead-demo` が出る → 押すと `data-status="demo"` → page.clock で 400ms×19手＋余裕を進める → 最初の状態の play に戻り、星は保存されていない。再生の途中で `#btn-demo-stop` を押した場合も最初に戻る。
7. 画面幅（390×844・375×667・320×568・844×390・1440×900）：横スクロールなし。見えている押せる物は幅も高さも44px以上。13px未満の文字が無い。全8面で `#board` と `#controls` が最初の画面に収まって重ならない。見つかった直後の `#btn-caught-undo` と成功の `#btn-next` が、スクロールせずに見える。
8. 操作の間隔を振る：見本の解を、1手ごとの間隔 0・20・60・120・200ms で（ページの中のタイマーで）押しても、結果は同じ成功・同じ手数。動きの途中で「戻す」を押しても、戻った後の状態が `#app[data-steps]` と盤の位置で一致する。
9. 動きを減らす設定：クリック直後に `.player` が最終の位置にいる。点滅の部品が無い。
10. 面の帯：面1で◀、面8で▶が無効。`?level=5` で面5、`?level=9` や `?level=x` は無視。壊れた保存データでも開く。音の切替が再読み込み後も残る。
11. 共有：帯の「このアプリを共有する」で `#share-dialog` と `.share`（共通試験と同じ）。成功の欄の `#share-x` の href に結果の共有文と URL が入る。
12. キーとフォーカス（02_ui_states.md）：見つかった直後のフォーカスは `#btn-caught-undo`、戻した後は `#btn-undo`。`#btn-wait` にフォーカスがある状態で Space を押すと、手数がちょうど1増える（二重に動かない）。あそびかたの `#opt-letter-keys` を外すと W・Z・R が効かず、矢印・Space・Backspace は効く。再読み込み後も外れたまま。
13. 名前：見えている全ボタンで、読み上げの名前が見える文字を含む（2.5.3。例 `getByRole('button', { name: '最初へ戻す' })`）。`#toast` は `aria-hidden="true"`、一言は `#live` にも出る。見つかった光の点滅は1秒に3回を超えない（アニメーションの設定値を読む）。

## 罠（過去に踏んだもの）

- localStorage の定数名を `*_KEY` にしない（gitleaks の誤検知）。
- インライン script・`on*=` 属性・外部フォント・外部画像は禁止（CSP は `script-src 'self'`）。`style` 属性も書かない（CSS 変数は JS から `style.setProperty` で入れる）。
- 共有欄は、帯のボタンから開く `#share-dialog` の中だけ。結果の欄・あそびかたの窓の中に `#share` を置かない（Day044・065で共通試験が落ちた）。
- なめらかなスクロールを使わない（`behavior: 'auto'`）。動きの途中の操作は、間隔を振る試験と CPU を遅くした実行で確かめる。等速の「3回合格」を安定の証拠にしない。テストに「待ち」を足したくなったら、アプリの欠陥を疑う。
- 予告（点線）と結果が違って見えるのは、怪盗がその手で箱を押したとき（遮光・巡回が変わる）だけで、仕様。不具合として直さない。
- 一直線の道の巡回では、`guard-move` の理由は起きない（前へ進むと光は短くなるだけ）。文の表には残すが、E2E の対象にしない。
- 絵文字を使わない（★☆は文字として可）。13px未満の文字を作らない。公開面に実在の作品名を書かない。作業ツリーの中のファイルにローカルの絶対パスを書かない（precheck が落ちる）。
- 完了報告で「全テスト合格」と書くなら、実行したコマンド・件数・実際の出力を貼る。発注側が再実行して照合する。
