# Day84 ブラウザ版の進行記録

## 現在地（2026-11-06）

ブラウザ版は既存URLで公開済み。ダウンロードや利用者のNode/ローカルサーバー起動は不要。
PR207/208をマージし、version0222037bで正式routeへ反映。本番9工程が成功した。
その後native summaryのSpace開閉とページ送りの重なりを見つけ、1行修正＋14工程GREEN・独立APPROVED。
追加キー修正の最新CI・正式反映・本番再確認を続ける。最新の公開結果は[PR208](https://github.com/haranishi/hundred-days/pull/208#production-verification)へ追記する。

## 作業場所と境界

- 専用worktree：~/Projects/hundred-days-day084-web、外部SSDのAPFS実体。
- 現branch：fix/day084-native-keyboard、起点main ea64ae7。
- 仕様：.kiro/specs/day084-browser/。PDFのみ、PowerPointは元のPowerPointでPDF出力する。
- 元の3084・ローカル実装・本人の私的原本は操作対象に含めない。
- 共通ブラウザ完結方針は個人の共通ハーネス/cc-sddへ反映済み。個人設定はrepoへ転載しない。

## 検証の証拠

- Relay15/15、Browser13/13、skip0。実Miniflare/SQLite/Chrome、独立APPROVED。
- UIは実Wrangler設定を使い、全SECURITY_HEADERS・配信除外・資料/スマホ/全画面/切断復帰を確認。
- native-key REDは本番summaryOpen=false/1→2と追加E2E失敗。修正後14工程、例外/CSP0、独立APPROVED。
- UI18/20・体験19/20、全項目1点以上。3幅overflowなし・44px・footer contrast約7.73:1。
- ChromeとモバイルWebKitの相互操作、WebKitの日本語PDF表示成功。物理Safariとは区別する。
- 初期共通checkはunit5092件（5091成功/既存skip1）、16依存監査high/critical0、構文0・build成功。
- 公開gate329成功/既存skip1。静的Day84 E2E2/2、共通/専用headersのfixtureも成功。

## 配信の履歴

- 初期案はnon-root assets.base_path。dry-run/Miniflareは成功したが、実accountが100343で拒否。
- PR207 head f8e7edfのCI42146693725はsuccess、main5ce6cafへmerge。初回main run42150200081は途中状態の公開を避けて意図的にcancelした。
- 専用root内の実prefix階層へ変更。rootをcleanしDay84だけcopy、root/_headersを実runtimeで適用。独立設計/コードレビューAPPROVED。
- 非公開受付でversion74c42b7fを確認。routesなし/workers.dev・preview無効で対象なし。有料化/account flag変更なし。
- PR208 head80c6e00の全必須CI42152119707 success、main ea64ae7へmerge。
- version0222037b-8931-4143-a1ca-79cd372317acを既存Day84 routeへ反映。
- 03:13UTCの本番9工程PASS：暗号化接続、日本語PDF、操作、復帰、差替、共有/全画面、終了/旧QR無効化、非配信範囲。例外/CSP0、frame46、PDFupload0。
- 証拠：.cache/day084-production/result.json、day084-deploy.log、verification.md。

## 残る作業と制約

- キー修正版の最新CI/反映/本番確認、main Pages/catalogueの公開結果、成果物の最終記録を確定する。
- ブラウザ版動画は視覚/技術QCの独立APPROVED、Drive保存・サイズ/親/時刻の読戻し済み。Xは245/280、返信99/280、URL/32秒動画のx:prepare成功。SNS未投稿。
- 物理スマホQR・iOS/Safari実機、idle alarm自動配送時刻、主観音の通し聴きは未確認。期限拒否/実handler明示配送は検証した。
