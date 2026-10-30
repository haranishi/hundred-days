# 依存監査の検証（2026-10-30）
## 原因と修正
警告53はGHSA-5j98-mcp5-4vw2。Day79の保存した旧Next/OpenNext sourceに、OpenNext Cloudflare→AWS→node-minify/core 9.0.2→glob 10.3.3の経路があった。
coreはglobを固定しており、ルートのnpm ciと試験だけでは入れ子のlockの勧告を検査しなかった。
公式勧告はCLIのcmdでのシェル実行が対象。該当経路をglob 10.5.0へ固定した。アプリのCSPや権限は広げない。
https://github.com/isaacs/node-glob/security/advisories/GHSA-5j98-mcp5-4vw2

## 取り込んだもの
lockの変更はglob 10.5.0、必要なjackspeak 3.4.3とpackage-json-from-dist 1.0.1の3項目だけ。
全項目の版・取得先・整合値を公式npmレジストリと照合した。公開日は順に2025-11-18、2024-07-10、2024-09-26。install用のフックはない。
glob 10系には一般的なdeprecation警告があるが、同じ主版本の必要最小の修正を選び、実照会で既知勧告0を確認した。
npm12のlock-onlyは既存の同梱WasmでEALLOWREMOTEとなった。許可を広げず、ignore-scriptsの通常installで更新した。
Day80では取り込み時にesbuild 0.28.0のlowを見つけ、最小修正版0.28.1へ固定した。2026-06-11公開。install scriptは実行しない。
https://github.com/advisories/GHSA-g7r4-m6w7-qqqr

## 監査そのものの確認
- 修正前の10プロジェクトを実照会し、Day79だけhigh4件で失敗した。1つの勧告と影響する親の集計である。
- 修正後は新しいDay80 sourceとpromoも含む12プロジェクトで、全重要度の既知勧告が0件。
- 自動発見はGit管理中と非ignoreの新規manifest/lockが対象。依存のないtype宣言だけのpackage.jsonは監査しない。
- peerだけの新規project、空グラフ、lock欠落・不一致、通信失敗、不正なJSONと型、異常終了を拒否する関連13件が成功。
- 独立担当が見つけた空グラフ・peer-only・true/42応答の見逃しを修正し、同じ条件で再確認した。残るP1/P2なし。
- npm ciのoffline dry-runは、空cacheの既存11組と新規promoで成功。sourceやinstall scriptを実行しない。
- npm lsは正常なoptional同梱Wasmで誤って失敗するため使わない。勧告照会はdev/optional/peerも明示的に含む。
- 共通checkは4982件中4981成功・1skip・失敗0、依存監査と静的サイトのビルドが成功。

## 継続CI
共通の必須チェックで全lockを監査する。high/critical・検査不能・lock不整合は失敗する。
毎日の専用workflowでも同じ監査を実行し、定期照会からの配信は行わない。
Day80はソース39件・公開物の再現性・ブラウザ40件も必須の集約結果へ接続した。
既存4分割ブラウザ・秘密値検査・デプロイ条件を維持した。

## 公開物と既存の問題
Day79の配信物はGitのblobを全ファイル比較して同一。旧sourceとtoolsは配信しない。
Day79の旧Next sourceの単体・型・lint・buildは、修正前から失敗していた。og-fontの欠落と型/lintエラーがあり、変更後の終了結果も一致した。今回新たに壊れた結果とは扱わない。
公開ゲートの初回は317成功・CSPの接続先検査1件失敗。配信しない旧Nextの開発生成物を読んだ誤検出だった。
CSPの検査を実際のdistへ合わせ、CSPの許可は追加せずに関連11件が成功。Day80には本番CSPも適用し、主要操作・音・外部通信なしを確認した。
マージ後の警告終了と本番の記録は追記する。
