# 実装タスク

タスクグラフ: 1 → 2 → 3 → 4。5 は 1 のあと 2〜4 と並行（模擬のmodelで先行）。6 は 4 と 5 の後。7 は 6 の後の第2段階。8 は最後。

- [x] 1. 土台を作る
  - Day087フォルダ、vendor/three.js、shared同期、index.htmlの骨格、favicon、draftのmeta.json、README。
  - _Boundary: day-087-oricube/ の土台のみ_
  - _Requirements: 4.5_
- [x] 2. 折りエンジンの核を実装する
  - 三角形メッシュ・切断・マーク・fold/crease/scribe/turn・層の順序（auto）・検査・単体試験。
  - _Depends: 1_
  - _Boundary: lib/math.js, sheet.js, ops.js, stack.js, model.js, tests/_
  - _Requirements: 3.1,3.2,3.3_
- [x] 3. 立体の動きと描画の入力を実装する
  - hinge（立ち上げ・開く）、between の層指定、案内（guides）、frame()、変異試験。
  - _Depends: 2_
  - _Boundary: lib/ops.js, stack.js, model.js, tests/_
  - _Requirements: 2.5,3.1,3.2,3.3_
- [x] 4. 作品を実装する（紙飛行機・白鳥）
  - 手順データ・文章・完成形の基準の試験。全手順で検査が通る。
  - _Depends: 3_
  - _Boundary: lib/models/, tests/_
  - _Requirements: 1.1,1.2,3.3,3.4_
- [x] 5. 描画と操作UIを実装する
  - viewer、timeline、app、凡例、視点、重なりの表示、WebGLなしの代替。まず模擬のmodelで動かし、4の完成後に実エンジンへ差し替える。
  - _Depends: 1_
  - _Boundary: lib/viewer.js, timeline.js, app.js, index.html, app.css, assets/_
  - _Requirements: 1.1〜1.7,2.1〜2.6,4.1,4.2,4.6_
- [x] 6. 公開基盤へ統合し、検証する
  - published用meta、共有・OGP、NOTICE、THIRD_PARTY、E2E（スマホの指操作を含む）、公開ゲート、全体check。
  - _Depends: 4,5_
  - _Boundary: meta.json, README.md, NOTICE.txt, og.png, tests/e2e/day-087.spec.mjs, 根のREADME/THIRD_PARTY_NOTICES_
  - _Requirements: 4.1〜4.5_
- [x] 7. 箱（トレイ）を足す（第1弾に前倒し）
  - scribe と、壁の立ち上がりに角が連動する `drive`（三辺測量）。モデルと完成形の基準。
  - _Depends: 6_
  - _Boundary: lib/ops.js, lib/models/tray.js, tests/_
  - _Requirements: 3.1,3.4_
- [x] 8. 評価・独立レビュー・PR
  - UI採点（最大3周）、独立レビュー、全文・権利・漏洩の照合、commit/push/公開用のPR。マージとX投稿は本人。
  - _Depends: 6_
  - _Requirements: 4.5_

## 第2弾（作品を約10個に・2026-11-07）
タスクグラフ: 9・10・11 は 7 のあと並行（9 は別の作業ツリー）。12 は 9 の後。13 は 9 と 11 の後。14 は 10〜13 の後。15 は最後。
担当: エンジンと作品データ＝Codex（ブラウザが使えないので、画面の確認は親）／作品選択UI＝Opus（ブラウザで確かめる）。

- [x] 9. 連動折り（mechanism）を試作し、実装する
  - 正方基本形のつぶし・花弁折り・袋を開く（かぶと・紙コップ）・つぶし折りが、剛体で表せるかを数値で確かめる。表せる分は `lib/mechanism.js` に実装し、`frame(i,t)` と案内（guides）につなぐ。表せない分は証拠つきで報告し、近似（`relaxed`）の要否を親へ返す。
  - _Depends: 7_
  - _Boundary: lib/mechanism.js, ops.js, model.js, tests/mechanism.test.mjs, engine.md, engine-notes.md_
  - _Requirements: 3.1,3.2,3.3,5.6_
- [x] 10. 作品の選択UIを作る
  - ヘッダーの「作品を選ぶ」・一覧（スマホは下から出るシート、PCは重なる枠）・完成形の絵の自動生成（tools/make-thumbs.mjs）・「次の作品へ」。作品数に依存しない作り。
  - _Depends: 7_
  - _Boundary: app.js, app.css, index.html, lib/viewer.js（必要な分のみ）, tools/, assets/thumb-*.svg_
  - _Requirements: 1.1,5.2,5.3,5.4,5.5,4.1_
- [x] 11. 平面の作品を足す（ハート・ポチ袋・着物）
  - _Depends: 7_
  - _Boundary: lib/models/, tests/_
  - _Requirements: 5.1,5.7,3.4_
- [x] 12. 平面の作品を足す（ヨット・もみの木・ネクタイ）。袋を開く作品（かぶと・舟・紙コップ）は見送り
  - かぶとは開いた形が十字になり実物と違った（models-more.md の「見送り」）。ちょうちょは4案で基準に届かず、ネクタイに替えた。
  - _Depends: 7_
  - _Boundary: lib/models/, tests/_
  - _Requirements: 5.1,5.6,5.7_
- [x] 13. 鶴を足す
  - _Depends: 9, 11_
  - _Boundary: lib/models/crane.js, tests/_
  - _Requirements: 5.1,5.6,5.7_
- [x] 14. 統合する
  - 全作品を通すE2E（各作品を最後まで再生・スマホの指で一覧から選ぶ）、README・meta.json・OGP・作品数と手順数の記述、公開ゲート、全体check。
  - 証拠（2026-11-07）: Day087単体294件・E2E 56件成功／`npm run check` 成功（単体5,401件中5,400件・既存の1件スキップ）／公開ゲート成功（横断338件中337件・既存の1件スキップ）。記録は `.agent-harness/runs/day087-oricube.md`。
  - _Depends: 10,11,12,13_
  - _Boundary: tests/e2e/day-087.spec.mjs, meta.json, README.md, og.png, 根のREADME_
  - _Requirements: 4.1〜4.5,5.1〜5.7_
- [ ] 15. 評価・独立レビュー・PR
  - UI採点（最大3周）・体験評価・独立コードレビュー（Codex読み取り専用）・権利と全文の照合。宣伝動画とX投稿文を作る。第1弾（PR #211）の状態に応じてPRを出す。マージとX投稿は本人。
  - 進み具合（2026-11-07）: 評価は2周目で両方合格（画面17/20・体験17/20）。独立レビューは2回（エンジン・画面まわり）済み。残り＝宣伝動画（「使いたくなる」構成で作り直し中）・X投稿文・PR（出し方は本人が選ぶ）。
  - _Depends: 14_
  - _Requirements: 4.5,5.1〜5.7_

検証の証拠: `.agent-harness/runs/day087-oricube.md`。
