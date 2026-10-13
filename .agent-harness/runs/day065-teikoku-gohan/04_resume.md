# Day065 再開メモ（最終更新 2026-10-13 朝・公開後のCI修正の時点）

## いまの状態

- **2026-10-13：PR #147 は本人がマージした（main b41910e）が、main の CI が Day65 の画面テスト1件で落ち、デプロイされていない。** 原因は、結果へなめらかに動いている途中に「組み直す」や面チップを押すと、画面の位置がずれる、アプリの不具合だった。結果へのスクロールを一瞬にして直し、再発防止の画面テスト4件を足した（ブランチ `fix/day-065-rebuild-scroll`。経緯は progress.md の「9周目」）。**このPRのマージと、そのあとの main の CI・デプロイが済み、公開URLが開くまでは、公開されていない。**
- 作業ツリー ~/Projects/hundred-days-day065。ブランチは `feat/day-065-teikoku-gohan`（origin/main 2d37e61 から）。**2026-10-12 に、本人の指示（「PRを作成してマージまで」）で、このPRを出して公開する**（meta.json の status は published）。公開URLは https://hundred-days.pages.dev/day-065-teikoku-gohan/。**実装と検査は完了。残りは、公開後の本人の確認と、公開後に直す候補。**
- 追加・変更：README.md（Day一覧に「| 065 | 定刻ごはん | … | 未公開 |」の1行。公開すると index:sync が公開の行に直す）、day-065-teikoku-gohan/、tests/e2e/day-065.spec.mjs、契約、このフォルダ。
- 検査（2026-10-12 22時半・最終コード・公開状態で実施して draft に戻した）：全単体 2967件（失敗0・スキップ1は別Day）／Day65の単体 170／Day65のE2E 68件を3回続けて204／共通（shared-share・security-headers）257／precheck OK／verify-levels 全面OK／lib/sim.js は基準と一致。screenshot.webp は最終の画面で撮り直した（面4で焦げる瞬間・1200×750・メタデータなし）。
- 評価：体験評価は R2・R3 とも 17/20 で合格（3周の上限を使い切った）。**見た目評価は3周で 10（Codex）→12（Opus）→12（Opus）/11（Codex）/20 で、基準の16点に届かなかった**（上限を使い切った）。権利確認（Codex）は済み（05_rights.md）。
- 見た目評価で残った指摘（公開後に直す候補。progress.md の「8周目」）：横向き（844×390）で地図が固定されない／320px・横向きの右列でカードのラベルがずれる／12px未満の文字／列車の色と駅の色の近さ／運行図の呼び名と地図の不一致／結果へスクロールした止まり位置／共有窓の見た目（全Day共通の部品）／結果の共有にLINEが無い／最終面クリア後の案内。
- 公開名は「定刻ごはん」。旧名は実在の食の事業と同名だったため使わない。旧名・理由・商標の確認は 05_rights.md にだけ書く（全文検索で旧名が 05_rights.md 以外に出ないこと）。
- 面6の締切は 11・17・19・20・23（解4通り・締切順では失敗）。★3は お刺身→ゆで卵→ひと口ステーキ→角煮→焼きにんじん（ステーキは近い焼き場、にんじんは遠い焼き場）。

## 公開後の残り（本人）

公開は、PRの時点で次の前提のまま進んだ。公開後に確かめて、必要なら直す。

1. **J-PlatPat で、名前「定刻ごはん」を引き直す**（類似群コードも見る）。公開の直前に行う予定だったが、**公開の時点では未確認**。問題があれば改名になる（旧名のときと同じ手順）
2. **スマホで5分遊ぶ**（本人プレイ判定。契約の最後の関門だったが、公開のあとになった）
3. スクショに写るApple絵文字は、前例（Day063）どおり許容した。許諾をはっきりさせるなら、OFLのNoto Color Emojiで撮り直す
4. 契約の範囲外の `static/privacy.html` と `THIRD_PARTY_NOTICES.md` は、触らずに公開した。全Day共通の課題として、あとでまとめる
5. `actualMinutes`（いまは 0）
6. 見た目評価は基準未達（3周で10→12→12・Codexは11/20）のまま公開した。公開後に直す候補は progress.md の「8周目」（カードのラベルの上揃え、横向きで地図を固定、など7つ）
7. 宣伝（動画・X投稿）は、本人の依頼があってから（契約の対象外）

## 再開の手順

```sh
cd ~/Projects/hundred-days-day065 && git status
node .agent-harness/runs/day065-teikoku-gohan/reference/verify-levels.mjs                      # 面データの整合
node --test day-065-teikoku-gohan/tests/                                                        # 単体（170件）
```

画面を使うテスト（meta.json は公開（published）のまま。draft に戻さない。公開前は draft にしていたが、公開後にその手順を踏むと、公開を取り下げた状態で build してしまう）：

```sh
npm run build
PLAYWRIGHT_PORT=4566 npx playwright test tests/e2e/day-065.spec.mjs tests/e2e/shared-share.spec.mjs tests/e2e/security-headers.spec.mjs
```

全幅の撮影：`python3 -m http.server 4570 --bind 127.0.0.1 --directory ~/Projects/hundred-days-day065` を起こしてから、`node .agent-harness/runs/day065-teikoku-gohan/capture.mjs <出力先> 4570 --widths=390,375,320,844,768,1440`（出力は一時フォルダでよい）。

## 評価者の呼び出し（Agent・model は opus、またはCodex。どちらも独立した新しいセッション）

- Opus が週の上限で使えないときは、Codexで代わりに回せる（2026-10-12 の見た目評価・権利確認で実施）。`CODEX_HOME=<Codexの設定ディレクトリ> codex exec -C <作業ツリー> --skip-git-repo-check -c model_reasoning_effort=medium -o <出力> - < <プロンプト>`。依頼書の中身をプロンプトに埋め込み、「ファイルは書けないので、評価書の全文を最終メッセージで返す」と書く。画像は `-i` でなく、パスを教えれば自分で開いて見る。バックグラウンドは末尾が `< /dev/null` でなくファイルからの標準入力で足りる
- 評価書は返ってきた文面を、こちらで visual/・rights/ のファイルへ保存する（Codexは読み取り専用で書けない）

- 体験評価：brief-experience.md を読ませる。REPO・R（出力先 r<N>/）・PORT=4571・BASE=http://127.0.0.1:4570/day-065-teikoku-gohan/ を指定。評価書は <R>/experience-r<N>.md、スクショは <R>/experience-shots/。終了時に操作サーバー（tools/playtest-server.mjs）を止めさせる。
- 見た目評価：brief-visual.md を読ませる。<SHOTS> に capture.mjs の出力先を指定。評価書は visual/ に保存する（visual-v1〜v3）。
- 権利：brief-rights.md。出力は <R>/rights-review.md。
- どれも、実装の説明や過去の評価記録を読ませない。結果は発注側が読んで、改善点だけを実装担当へ渡す。

## 設計の要点（直すときの注意）

- ルールの正は reference/sim.mjs。lib/sim.js は先頭2行のコメント以外が同一であること。面データ（盤・辺・長さ・駅・par）は変えない。締切は面6だけ設計し直した。座標（pos）は画面の都合で動かしてよい（verify-levels と単体の一致確認が通ること）。
- localStorage の定数名は STORAGE_NAME（*_KEY は gitleaks が誤検知）。tests/index.mjs への登録を忘れない。
- キーボードの Tab を横取りする近道は、「Enter/Space で選んだ直後の1回」に限る（app.js の `onCarKey`・`state.kbJump`）。選んである列車で常に飛ばすと、カード⇄分岐ボタンの往復になり発車に届かない（キーボードトラップ。5周目に実際に起きた）。
- 画面テストで列車を探すときは `pickTrain`（「N番目に出る ○○の列車。」で絞る）。「ステーキ」は「ひと口ステーキ」にも当たるため、素の部分一致を使わない。
