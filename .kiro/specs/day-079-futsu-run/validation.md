# Day079 外部公開登録の検証
2026-10-29。

## 実施したこと
- futsu-run本体を `@opennextjs/cloudflare` で Cloudflare Workers（haranishi.workers.dev）へデプロイ完了。
- 本番URL（`https://futsu-run.haranishi.workers.dev/`）でトップ・結果・動的OGP画像（200 OK）を確認。
- 本番URLに対してPlaywright E2E全5件を実行し、完全合格（1.7分）。
- hundred-daysリポジトリの `day-079-futsu-run` に紹介README、meta.json、screenshot.png、demo.mp4を配置。
- `npm run index:sync` でルートREADMEのDay一覧を更新。
- `npm run build` 成功: 79 day(s) / 公開 79（うち外部 5） / スクショ 78 / 動画 59 / OGP付与 73 -> dist/
- `npm run test:unit` 成功: 4968 tests passed, 0 failed。
- `npm run check:syntax` 成功: エラー0件。
- `npm run precheck` 成功: 漏洩パターン検出なし。
