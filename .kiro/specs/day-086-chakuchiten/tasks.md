# 実装タスク

タスクグラフ: 独立レビューで責任境界の分割とマウント検証の明記を修正し、再確認PASS。

- [x] 1. 質問・候補・通信の契約を実装する
- [x] 1.1 候補選択と質問定義を実装する
  - 気分/空間/同行者/半径/無効座標/重複/最大3軒/地図URLを単体試験で確認する。
  - _Boundary: lib/choices.js, lib/recommend.js, 対応するDay内tests_
  - _Requirements: 1.1,1.2,3.1,3.2,3.4,3.6_
- [x] 1.2 OpenPOI通信を実装する
  - center、応答検証、時間切れ、中断、HTTP失敗を単体試験で確認する。
  - _Depends: 1.1_
  - _Boundary: lib/openpoi.js, 対応するDay内tests_
  - _Requirements: 2.3,3.5_
- [x] 2. 一連の画面と場所取得を実装する
  - 同行者→3問→場所→結果、別候補、戻る、GPS拒否と手動選択、失敗とキャンセルを動かす。
  - 回答保持、古い応答破棄、メモリ限定、キーボード操作を確認する。
  - _Depends: 1.1,1.2_
  - _Boundary: index.html,app.css,app.js,assets,favicon.svg_
  - _Requirements: 1.1,1.2,1.3,1.4,2.1,2.2,2.3,2.4,3.1,3.2,3.3,3.4,3.5,3.6,4.1,4.3_
- [x] 3. 既存公開基盤へ統合する
  - published用meta、共通共有、一覧、OGP、出典、CSP通信先を揃える。
  - _Depends: 2_
  - _Boundary: meta.json,README.md,NOTICE.txt,og.png,shared,scripts/build.mjs,root README_
  - _Requirements: 4.2,4.4_
- [x] 4. 実挙動と公開条件を検証し、必要な修正を行う
  - Day E2E、共通check、公開ゲート、実APIと配信CSPを検証する。
  - 390/768/1440pxの操作と画像、失敗・再試行を含む5〜10分の操作、体験・UI評価を記録する。
  - /100days/配下で場所指定→3問→結果→道案内の主要フローが動くことを確認する。
  - _Depends: 1.1,1.2,2,3_
  - _Boundary: tests/e2e/day-086.spec.mjs,証拠,仕様・実行記録_
  - _Requirements: 1.1,1.2,1.3,1.4,2.1,2.2,2.3,2.4,3.1,3.2,3.3,3.4,3.5,3.6,4.1,4.2,4.3,4.4_
- [x] 5. 変更を確認しPRを作成する
  - 全文・権利・漏洩・事実を照合し、commit/push/公開用PRと同一headのCIを確認する。
  - Obsidianへ作業先と結果を記録する。マージとSNS投稿は本人に残す。
  - _Depends: 4_
  - _Boundary: 変更したファイルのGit操作、Obsidian進捗_
  - _Requirements: 4.4_

検証の証拠: `.agent-harness/runs/day086-chakuchiten.md`。41単体、37E2E、全体checkと公開ゲートが成功。

PR: https://github.com/haranishi/hundred-days/pull/205 。CIの合否はPRの最新headを正とする。マージ・SNS投稿は未実施。


## 追加依頼: 食べたいものを質問で絞る（2026-11-05）
- [x] 6. 料理の分岐と検索の条件を実装する
  - 気分→ジャンル→料理・飲み物を定義し、親の選び直しで下位回答をリセットする。
  - 同じ質問定義を画面・完了判定・要約で使い、料理名を検索へ反映する。
  - _Boundary: lib/food.js,choices.js,recommend.js,openpoi.js,app.js,index.html,app.css_
  - _Requirements: 1.2,1.3,1.4,1.5,1.6,3.1,3.2,3.7,3.8,3.9_
- [x] 7. 分岐と復帰を検証し、説明とPRを更新する
  - 36の葉、親変更、料理の検索・0件・取消・BFCache、3幅の実操作を検証する。
  - 3問固定の説明・OG画像・Obsidianを更新し、公開ゲートとPR差分を確認する。
  - _Depends: 6_
  - _Boundary: Day086 tests,E2E,meta,README,og,仕様・証拠、既存PR205_
  - _Requirements: 1.2,1.3,1.4,1.5,1.6,3.7,3.8,3.9,4.3,4.4_

追加依頼の証拠: `.agent-harness/runs/day086-food-refinement.md`。92単体、全36葉を含む76E2E、公開ゲートが成功。
