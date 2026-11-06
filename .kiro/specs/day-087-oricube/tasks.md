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

検証の証拠: `.agent-harness/runs/day087-oricube.md`。
