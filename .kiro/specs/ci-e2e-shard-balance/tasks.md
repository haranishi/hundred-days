# タスク：時間で割るブラウザテストの分割

## 第1段：測る
- [x] 1.1 `playwright.config.mjs`：CIで `E2E_TIMING_FILE` があるときだけ、`json` レポーターを足す（手元の実行は変えない）。
- [x] 1.2 `ci-deploy.yml`：記録をとるため、従来の件数割りのまま8分割にし、分割ごとの `e2e-timing-<n>` をartifactで保存する。
- [ ] 1.3 PRのCIを流し、artifactから、テストファイルごとの実測時間を取り出す。

## 第2段：割る
- [ ] 2.1 `scripts/e2e-shards.mjs`：`plan`（担当ファイルを出す）と `update`（artifactから記録を作る）。
- [ ] 2.2 `scripts/e2e-shard-durations.json`：1.3の実測から作る。
- [ ] 2.3 `scripts/tests/e2e-shards.test.mjs`：取りこぼし・重複・決定性・未登録ファイル・偏りの上限・入れ子のspec・壊れた記録。
- [ ] 2.4 `ci-deploy.yml`：記録をもとにした割り当てへ切り替える。分割数は1か所。
- [ ] 2.5 `docs/ci.md`：割り方と、記録の更新手順。

## 検証
- [ ] 3.1 `npm run check`（手元）と、独立したレビュー。
- [ ] 3.2 PRのCIで、分割ごとの時間が揃ったこと（最長が合計÷分割数の1.2倍以内）と、全体が約42分より短いことを `verification.md` に記録する。
