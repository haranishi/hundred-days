# Day079 外部公開登録
2026-10-29更新。本人指示：Day79として公開まで進める。配信先はDay51ハコニワと同じCloudflare Workers（外部公開の形）。

## 要件
- 「あなたの普通、何％？」をDay79の外部公開アプリ（status: external）として登録する。
- 公開URL: `https://futsu-run.haranishi.workers.dev/`。
- 実装は独立プロジェクトfutsu-runを正本としてCloudflare Workersへデプロイ済み。
- 100daysリポジトリには紹介情報、スクリーンショット（screenshot.png）、プロモ動画（demo.mp4）を配置する。
- 練習用の割合を、実際の参加者による集計として記録しない。

## 設計
- day-079-futsu-runにはmeta.json、制作記録README、screenshot.png、demo.mp4を置く。
- meta.jsonのstatusはexternal、externalUrlとpublicUrlに本番URLを設定する。
- READMEのDay一覧は既存のindex:syncで更新し、紹介ページへのリンクとする。
- 全体ビルド（npm run build）で79アプリ（うち外部5）として集計され、カードと動画再生が機能することを確認する。

## タスク
- [x] futsu-runをCloudflare Workersへデプロイし、本番疎通・E2E合格を確認。
- [x] screenshot.png と demo.mp4 を配置。
- [x] meta.json と README.md を作成。
- [x] ルートREADMEのDay一覧を同期（npm run index:sync）。
- [x] 全体ビルド（npm run build）、単体テスト（npm run test:unit）、構文検査（npm run check:syntax）、漏洩検査（npm run precheck）に合格。
