# 調査（2026-10-30）
- functions/apiにはGETを使う10本のAPIがある。Day74は既にCache APIで12回/分の制限を持つが、ほかの入口に共通の連打制限はない。
- 外部サービスの取得結果のキャッシュはある。キャッシュの有無は利用者ごとの呼び出し制限とは別である。
- Cloudflare接続はゾーンの読み取りに成功したが、Pages・Bot Management・WAFの読み取りは403。既存WranglerはPagesの読み書きに利用できる。Bot Management/WAFの権限は持たない。
- 正式中継はrairakkuのserver/hundred-days-proxy.mjs。CF-Connecting-IPを転送せず、別ゾーンWorkerの固定IPになる。署名付きのハッシュ識別を追加する。
- 現在のWrangler実装のPages用設定許可リストにratelimitsはない。WorkersのRate Limiting bindingをPages設定へ流用しない。

## 公式資料
- [Pages Middleware](https://developers.cloudflare.com/pages/functions/middleware/)
- [Pagesの設定](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Rate Limitingの精度](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cache APIは拠点単位](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [WorkerのCF-Connecting-IP](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip)
- [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/): ゾーン全体に適用され、パス単位の除外はできない。事業サイト全体で一律に有効化しない。

CIのWrangler 4.115.0に同梱されるworkerdが対応する最終日は2026-07-29。実行環境試験の日付をこの版に揃える。新しいローカル版での2026-09-15の41項目も成功済み。
