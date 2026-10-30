# 設計
## 入口と配信
`functions/api/_middleware.js` に共通処理を置く。PagesのAPI配下にだけ適用し、静的ページには新しいFunctionを置かない。
依存の追加・外部ストレージの新設・全画面の認証は行わない。

## 判定の順序
1. 管理者が `PUBLIC_APIS_DISABLED=1` を指定した場合は503で止める。
2. GET以外を405、過大なURLを414、明示された別サイトからのブラウザ通信を403で返す。
3. 接続元IPをSHA-256にし、分と10秒の固定窓のカウンターを予約する。正式中継の識別は先に署名を検証する。
4. 同一実行環境では同期の予約とキー単位の待機列で競合を抑える。期限切れを回収し、最大2048クライアント・各クライアントの待機上限を設ける。
5. 識別の非同期処理後に予約時刻を取り直す。Cache APIで拠点内の状態も確認し、更新完了後に後段へ進む。キーは専用の内部ホストにし、ブラウザから読めるパスと分ける。
6. 許可後は検証済みのハッシュをcontext.data.apiAbuseClientに渡す。Day74の既存12回/分もこれを使い、中継利用者の共有枠を作らない。
7. 超過は429、保存の異常と状態上限は503とRetry-After。いずれもJSON・no-store・nosniffを返し、後段を呼ばない。

## 信頼境界
直接アクセスはCF-Connecting-IPを使う。IPがないローカル実行は共通の枠、本番でIPが失われた場合は503。Cache APIが使えない場合はローカル・本番とも503で閉じる。
OriginとFetch Metadataはブラウザによる他サイトからの流用を抑える補助判定であり、Botの認証ではない。公開元と正式な中継元だけを許可する。
User-Agentによる包括的な拒否や、秘密の試験用バイパスは作らない。

## 正式中継との契約
rairakkuのserver/hundred-days-client.mjsが、接続元IPのSHA-256と時刻を、要求メソッド・パス・クエリと一緒にHMAC-SHA256で署名する。
共有SecretはHUNDRED_DAYS_API_PROXY_SECRET。x-hundred-client・x-hundred-time・x-hundred-signatureを検証する。許可する中継Originはhttps://rairakku.comとhttps://www.rairakku.com。
署名対象はJSON配列["hundred-days-api-v1", 時刻文字列, IPのSHA-256, メソッド, パス+クエリ]。署名と識別は小文字の16進数。時刻の差が30秒を超えれば拒否する。
元IP・Cookie・Authorization・Secretは中継しない。中継側もOriginとFetch Metadataを検査してから署名する。
Secretを両方のproduction/previewに設定し、中継側を先に反映する。切り戻しは本体の制限を先に戻す。署名のない別ゾーンWorkerは403。

## 検証
単体テストで次の後段を偽のコールバックにし、拒否時に一度も呼ばないことを確認する。
Pagesのローカル実行で実際のMiddlewareを通し、外部取得のない既存APIのstatus照会と、拒否系・静的ファイルを確認する。
既存の単体・構文・ビルド・ブラウザCIへ接続する。実行結果はverification.mdへ残す。

## 残る限界
Cache APIは非原子的で拠点ごとに独立する。API処理を軽く止めてもFunctionの呼び出し数には数えられる。
回線・中継によるIP共有は同じ枠になる。大規模な攻撃の入口での遮断には、対象を絞ったWAFと使用量監視が別途必要になる。
