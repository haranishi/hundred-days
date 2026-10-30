# Day80と依存監査の読み取り専用レビュー
目的：本人が依頼したDay80公開と、glob警告の原因を踏まえた再発防止を確認する。
対象：scripts/audit-dependencies.mjs、scripts/lib/dependency-audit.mjs、scripts/tests/dependency-audit.test.mjs、共通CIと定期監査、Day79のoverride。
変更はメイン担当のみ。レビュー担当はコードを書き換えず、P1/P2と再現条件を報告する。

## 受け入れ条件
ルートと入れ子・新規Day・toolsの監査、開発依存の包含、エラー時に閉じること、必須チェックへの失敗伝播。
今後追加するsource/toolsも固定リストなしで見つかり、欠落・不整合lockを見逃さない。
既存の公開前検査・4分割ブラウザ・デプロイ条件を緩めない。
Day79は旧OpenNextの推移依存のglobだけを10.5.0へ固定し、静的な公開物は変えない。

## 現時点の証拠
監査の回帰10件が成功。実照会では修正前の10プロジェクトのうちDay79だけhigh4件（1勧告と影響する親）で失敗した。
修正対象のlockはglob、必要なjackspeakとpackage-json-from-distだけが変わる。
Day79の旧Next sourceは変更前からog-font欠落・型・lint・buildが失敗。依存修正の失敗とは分けて比較する。
Day80は元v0.7の単体39件と型・静的ビルドが成功。新しい必須jobで全40ブラウザも実行する。
秘密値・.env・非公開NGリストは読まない。配信やGitHub設定を変更しない。
