# 設計
既存の公開前検査は秘密値と個人情報の検査であり、依存の勧告を照会していなかった。
Day79は移行前のNext/OpenNextソースも保存したため、静的配信には不要なCLI依存がlockに残った。
依存を削除して旧構成を失う代わりに、node-minify/coreのglobだけを10.5.0へoverrideする。

## 検査の境界
Gitが管理するファイルと未追跡の非ignoreファイルから、package.jsonとpackage-lock.jsonを発見する。
node_modulesや生成物は扱わない。manifestにlockがなければ失敗し、削除済みのファイルは除く。
同じディレクトリでnpm ci --dry-run --ignore-scripts --offlineを先に実行し、必須ノードの欠落・版の不整合も止める。
installや通信は行わない。npm lsは正常なoptional同梱Wasmで過剰に失敗するため使わない。
それぞれのディレクトリでnpm audit --package-lock-only --ignore-scripts --jsonを実行する。
監査結果の構造と件数、プロセス終了を検査し、high/critical・処理エラーでは非0で終わる。
監査先の依存コードは実行しない。ネットワーク障害は監査不能として閉じる。

## CI
共通CIのchecksで依存監査を実行し、既存の集約必須チェックへ伝播する。
定期監査は配信を起動しない専用workflowとし、同じコマンドを使う。
テストでは仮のnpm実行器で結果を制御し、実ネットワークとは独立に失敗条件を再現する。
実際の修正前後のlockでもnpmレジストリへ照会し、変異の検査だけを安全性の根拠にしない。
