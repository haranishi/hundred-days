# フリップコートの100daysへの取り込み

2026-10-19、本人が100daysへのマージを希望し、対象が今制作していたフリップコートであることを確認した。

- 対象はharanishi/hundred-daysのmain。iroriのせーので10秒はPR3でマージ済み。
- 検証済みのCPU版を取り込む。local-versus.mdの2人対戦は未実装の更新案。
- status=draft、publicUrl=nullを保ち、公開用buildから除外する。
- 共通設定・依存キャッシュ・私有画像/ログ・個人NG設定はコミットしない。
- 紹介画像は自作1200×630、metadataなし。runtimeとE2Eのhashは検証記録に一致。
- commit/push前に公開前チェック、一覧/共有整合、標準checkを確認する。
- PRはDraftで作成し、当該headの共通CI成功後にReadyへ切り替えてマージする。
- 独立した仕様・実装・体験/UIレビューの結果は同じrun内の記録を引き継ぐ。
- 実時間316111ms・5試合、体験18/20・独立UI19/20。人間の面白さは未確定。
- マージの結果とSHAは、私有実行記録とObsidianへ記録する。

## 取り込み直前の検証

- 本人の追加依頼により、Task9の紹介素材とX下書きを同じPRへ含める。
- 最終標準checkはexit 0。構文1362件エラー0・単体3402成功/既存skip1/失敗0。
- 一覧/共有70件整合、公開69件build成功、Day070のdraft除外を確認した。
- 30秒の縦動画と15秒の無音demoは独立レビューでAPPROVED。保管と制約はtask-9-promotion.mdに記録した。
- これからcommit/push/PRを行い、当該headの共通CI成功を確認してマージする。
