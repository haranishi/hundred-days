# Bot・API連打対策
ゲームや一覧はそのまま開ける。外部サービスへ接続するAPIだけを共通Middlewareで守る。

## 現在の判定
- GET以外は405。別サイト発と分かるブラウザ通信は403。8192文字を超えるURLは414。
- 接続元IPごとに全APIで共通の枠を使う。分の固定窓で60回、10秒の固定窓で20回。Day74自身の12回/分も維持する。
- 超過は429のJSONとRetry-After。状態保存の異常は503。拒否応答はno-storeで、後段のAPIを呼ばない。
- パス・クエリ・User-Agent・X-Forwarded-Forを変えても枠は増えない。
- IPのSHA-256と短期の回数だけを内部Cache APIに置く。診断先URL・Cookie・認証情報・生のIPを記録しない。
- HTML・画像・BGM・動画・OGPは対象外。検索と共有プレビューを一律に拒否しない。

## 正式中継を通る場合
rairakku.comのPages Functionsから別ゾーンへ接続すると、Cloudflareは共通のWorker IPを設定する。
そのため、IPのハッシュを中継元でHMAC-SHA256により署名し、行き先が検証してから制限に使う。
署名はメソッド・パス・クエリ・時刻に結びつく。30秒を過ぎたものと、署名なしの別ゾーンWorkerは403。
同じ利用者は直接アクセスと中継アクセスで同じ枠を使う。Day74にも検証済みの識別を渡す。

## 設定と反映
Secretの名前はHUNDRED_DAYS_API_PROXY_SECRET。値はCloudflare PagesのSecretsにだけ登録する。
両プロジェクトのproduction/previewに同じ値を設定し、中継を先に反映してから本体の制限を反映する。
切り戻しは本体の制限を先に戻す。Secretだけを消すと中継APIが止まる。

全APIを一時停止する場合はPUBLIC_APIS_DISABLED=1を設定して再デプロイする。静的ゲームは停止しない。
Day74だけを止めるLINK_DOKUMI_DISABLEDと、その12回/分の上限設定も引き続き使える。

## 検査
`npm run test:unit`で連打・同時要求・復帰・偽装・保存異常を確認する。
`npm run test:api-abuse`はWranglerがある環境で実際のPages Middlewareを通す。
共通CIは固定したWranglerで実行し、失敗すると必須の集約チェックも失敗する。
試験は外部取得のないDay30のstatus照会と、Day74のローカル宛先の拒否を使う。

## 制約と監視
Cache APIは拠点ごとに独立し、異なる実行環境の更新は原子的でない。固定窓の境界には短時間に多く通る性質もある。
共有回線の複数人は同じ枠になる。この仕組みは基本的な濫用抑止であり、分散攻撃や厳密な利用枠管理の保証ではない。
拒否した要求もFunctionの呼び出しに数えられる。CloudflareのPages Metricsで全体の呼び出し数と429・503を見る。

WAFで入口の遮断を加える場合は、正式中継のAPIパスに対象を絞る。pages.devの直接経路は本体の制限が守る。
Bot Fight Modeはゾーン全体に掛かり、パス単位の除外ができない。事業サイト全体で不用意に有効化しない。
Cloudflare接続には現在Bot/WAFの設定権限がないため、これらを有効化済みとして扱わない。

公式: [Workerの接続元IP](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip) /
[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) /
[Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/)。
