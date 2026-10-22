# R3：実行基盤・相談窓口・法務・先行サービス調査

確認日：**2026-10-22（日本時間）**。以下の各表の行・根拠URLはすべてこの日に確認したもの。資料自身の年が古い場合は併記した。`unverified` は裏取りできなかった事項であり、採用・推奨対象に含めない。

調査方法：公式文書の検索・本文取得、指定ディープリンクへの実アクセスを実施。Web取得ツールはHTTP成功時の数値ステータスやJavaScript実行後の画面を提示しない。シェルのcurlはDNS解決に失敗した。そのため、HTML取得をHTTP 200や診断成功と読み替えていない。Workers本番環境での試験は行っていない。

## E. Cloudflare Workers / Pages Functions

### E1. プラン制限

| 項目 | Workers Free | Workers Paid | 根拠・確認日 |
|---|---|---|---|
| HTTPリクエストのCPU時間 | 10ms | 標準30秒、最大5分に設定可 | [Limits](https://developers.cloudflare.com/workers/platform/limits/)／2026-10-22 |
| 外部サブリクエスト | 50回/実行 | 標準10,000回、設定で最大1,000万回 | [2026-02-11変更履歴](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/)／2026-10-22 |
| Cloudflare内部サービスへのサブリクエスト | 1,000回/実行 | 設定上限に従う（標準10,000回） | 同上／2026-10-22 |
| メモリ | 128MB | 128MB | [Limits](https://developers.cloudflare.com/workers/platform/limits/)／2026-10-22 |
| リクエスト数 | 100,000回/日、UTC午前0時にリセット | 日次上限なし。課金・契約上の制限は別 | [Limits](https://developers.cloudflare.com/workers/platform/limits/)、[Pricing](https://developers.cloudflare.com/workers/platform/pricing/)／2026-10-22 |

CPU時間はネットワーク待機時間と異なる。リダイレクト先への取得もサブリクエストに数える。「有料は1,000回」という古い説明は現行値ではない。[Limits](https://developers.cloudflare.com/workers/platform/limits/)（確認：2026-10-22）。Pages FunctionsはWorkersとして課金・計数され、Freeの日次100,000回をWorkersと共有する。Functionsを呼ばない静的アセットは無料・無制限。[Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)（2026-09-08更新、確認：2026-10-22）。

### E2. fetch・関連API

| 項目 | 確認結果・適用範囲 | 一次情報・確認日 |
|---|---|---|
| 接続ポート | `allow_custom_ports` は互換日2024-09-02以降の既定。非Cloudflareプロキシ宛ては任意ポート指定可。Cloudflareプロキシ宛てはその対応ポートだけで、非対応指定は無視される。80/443だけという説明は不正確 | [Compatibility flags：custom port](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#allow-specifying-a-custom-port-when-making-a-subrequest-with-the-fetch-api)／2026-10-22 |
| IP直指定URL | 通常の外向きWorkerサブリクエストはIPを直接fetchできず、DNS名が必要との記述あり | [Known issues：Fetch to IP addresses](https://developers.cloudflare.com/workers/platform/known-issues/#fetch-to-ip-addresses)／2026-10-22 |
| private IP・localhost | 通常のglobal fetchについて、全予約範囲・DNSでprivate IPに解決されるホスト・localhostの拒否方法と戻り値を一覧保証する公式記述は今回確認できず `unverified`。TCP socketsの制限をfetchの仕様として転用しない | [Fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/)、[Known issues](https://developers.cloudflare.com/workers/platform/known-issues/)／2026-10-22 |
| private接続の例外 | Workers VPCの専用bindingではprivate IPへfetchする公式例がある。global fetchとは区別が必要 | [VPC Networks](https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/)（2026-10-15更新）／2026-10-22 |
| 同一ゾーン | 同一ゾーンの別Workerをglobal fetchで呼ぶ場合は制約があり、Service Bindingsを使用する。Custom Domainは別扱い。自身のCustom Domainへのfetchによる522は互換フラグ等で扱いが変わる | [Limits](https://developers.cloudflare.com/workers/platform/limits/)、[Error 522](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/)／2026-10-22 |
| 外向きcf系ヘッダー | `CF-Worker` はfetchサブリクエストに付加。`CF-Connecting-IP` は同一ゾーン・別Cloudflareゾーン・非Cloudflare宛てで異なる。別ゾーンでは固定Worker用IPv6。受信ヘッダーをそのまま転送すると利用者IPが相手に渡るケースがある。CF-Ray、CF-EW-Via等の説明もあるが、全外向き経路で同じ一式になるとは断定しない | [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)／2026-10-22 |
| redirect: manual | 3xxをそのまま返す。新しいRequestの既定はfollow、受信Requestはmanual。followでは認証情報を含むヘッダーが別ホストにも転送されるとの注意あり | [Request](https://developers.cloudflare.com/workers/runtime-apis/request/)／2026-10-22 |
| getSetCookie | `response.headers.getSetCookie()`を利用可。互換日2023-03-01以降が既定、無効化フラグにも注意 | [Compatibility flags：Headers](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#headers-supports-getsetcookie)／2026-10-22 |
| 本文の途中cancel | ReadableStream.cancelが利用可。readerでロック中はreader.cancelを使う。未読データを破棄できるが、相手サーバーの処理や既送信バイトを取り消す保証ではない | [ReadableStream](https://developers.cloudflare.com/workers/runtime-apis/streams/readablestream/)、[reader.cancelの公式例](https://developers.cloudflare.com/durable-objects/examples/readable-stream/)／2026-10-22 |
| AbortController | Requestのsignalでfetchを中止できる | [Request](https://developers.cloudflare.com/workers/runtime-apis/request/)／2026-10-22 |
| AbortSignal.timeout | 対応あり。公式Worker例でfetchへの指定と応答本文cancelを併用 | [公式Worker例](https://developers.cloudflare.com/cloudflare-one/traffic-controls/integrate-workers/worker-templates/slack-notification/)／2026-10-22 |

Cloudflareプロキシの対応ポート一覧：HTTPは80・8080・8880・2052・2082・2086・2095、HTTPSは443・2053・2083・2087・2096・8443。[Network ports](https://developers.cloudflare.com/fundamentals/reference/network-ports/)（2026-04-20更新、確認：2026-10-22）。

アプリへの示唆（設計上の整理）：private宛ての安全性を基盤任せにする根拠は不足している。自動転送せず、URL・宛先・ポートをアプリ側で制限する必要がある。ただし事前DoHの結果とfetchが実際に使う解決先が一致する保証も今回確認できず、DoHだけでSSRFを完全に防げるとは書けない。

### E3. TLS・DNS失敗

| ケース | 公式に確認できた内容 | 未確認の境界 | 根拠・確認日 |
|---|---|---|---|
| 期限切れ・自己署名・ホスト名不一致 | Error 526は不正なオリジン証明書。公式ページは有効期限、信頼CA、CN/SAN一致等を確認するよう案内。Workersの「ゾーン外かつ非Cloudflareプロキシ」へのサブリクエストは常にFull(strict)と説明 | これら各ケースが常にJS例外か、fetch Responseの526かを包括的に約束するAPI記述は「公式の記述なし」（今回確認範囲）。526文書はWorkersとの関係を説明しているため、TLS失敗はすべて例外とするのも不適切 | [Error 526](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/)／2026-10-22 |
| TLSハンドシェイク失敗 | Cloudflareとorigin間のハンドシェイク失敗は525として説明される | 一般の全Worker fetchでの例外/Response対応は `unverified`。Cloudflareを使う相手サイト自身が返す525/526とも区別する | [Error 525](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-525/)／2026-10-22 |
| DNSが引けない | partial/CNAME構成でCloudflare DNSに必要レコードがないとfetchが530（1016）になる具体例あり | 一般のNXDOMAIN・SERVFAIL・タイムアウトすべてのJS戻り方を規定する「公式の記述なし」（今回確認範囲）。530の具体例を全DNS失敗に一般化しない | [Known issues](https://developers.cloudflare.com/workers/platform/known-issues/)／2026-10-22 |

短い原文引用：Error 526はWorkersについて “are always made using the Full (strict) SSL mode” と記す。自己署名を特別に信頼するCustom Origin Trust Storeと互換フラグも記載されている。[Error 526](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/)（確認：2026-10-22）。本アプリの判定は「接続・証明書を確認できなかった」とし、この失敗だけで詐欺と判定しないのが妥当な設計上の整理。

### E4. 利用規約

| 文書・条項 | 原文の要点（要約） | 本用途についての確認範囲 | URL・確認日 |
|---|---|---|---|
| Self-Serve Subscription Agreement 2.7 Acceptable Use | フィッシング、スパム、その他の技術的悪用や違法行為等を禁止 | 第三者への通常GET・プロキシ・セキュリティチェックを一律に許可する文言ではない | [Terms](https://www.cloudflare.com/terms/)／2026-10-22 |
| Developer Platform 第1項 | ネットワークに過度な負担、サービスへの悪影響等があれば送受信リクエスト等を一時制限できる | 無料枠内なら何でも許されるという根拠にはならない | [Developer Platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/)／2026-10-22 |
| 同第3項 | End Userの行為も利用者側の責任。違反の疑いで制限・停止可能 | 入力受付側の悪用対策が必要という運用上の示唆 | 同上／2026-10-22 |
| 同第4項(ii)(iii) | volumetric attacks、他者の権利を意図的に害する行為を禁止。開発資料および適用される第三者規約に従う | 1回GET診断の個別承認や、第三者規約の免除は確認できない | 同上／2026-10-22 |

第三者サイトの自動リクエスト、公開プロキシ、スキャンという名称そのものに対する包括的な許諾・禁止条項は今回の確認範囲では `unverified`。技術仕様にfetchやproxy例があることを、契約上の無条件許可に読み替えない。

### E5. Cache API

| 項目 | 確認結果 | 一次情報・確認日 |
|---|---|---|
| Pages Functions | custom domainでもpages.devでもCache APIを使用できる | [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)／2026-10-22 |
| 保存範囲 | キャッシュ内容は生成元データセンター外へ複製されない。cache.putはTiered Cache非対応 | 同上／2026-10-22 |
| Cache-Control | putに渡した応答のCache-Control、Expires等を参照。Set-Cookie応答は原則キャッシュしない。stale-while-revalidate / stale-if-errorは非対応 | 同上／2026-10-22 |
| 保存しない方針との関係 | 診断結果をCache APIへputすれば保存に当たる。保存なしを掲げる本アプリでは使わないという設計上の帰結。DNSなど別データのキャッシュは別途方針が必要 | 同上に基づく整理／2026-10-22 |

### E6. 無料レート制限

| 機能 | 無料で確認できた範囲 | 注意 | 一次情報・確認日 |
|---|---|---|---|
| WAF Rate limiting rules | Freeは1本。条件フィールドはPathとVerified Bot、計数特性はIP、計数期間10秒・緩和期間10秒 | ゾーンのWAF機能でありWorkersプランと別。カスタムドメインに設定したWAFがpages.dev等の別入口も保護するとはいえない。全世界で厳密なカウンターではない | [現行Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)、[計数方法](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)／2026-10-22 |
| Workers Rate Limiting API / binding | API・bindingの存在、Wrangler 4.36.0以降、拠点別のおおよその制限であることは確認 | **Freeプランでの可否・料金を明記した記述は今回確認できず `unverified`**。公式例のFREE_USER_RATE_LIMITERはアプリ利用者の区分で、Workers Free利用可の根拠ではない。Pages Functionsでのbinding可否も未確認 | [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)／2026-10-22 |

採用根拠が確認できた無料手段は、条件に合うゾーンのWAF 1本。これは外部宛てのホスト別頻度制限を直接保証するものではない。

### E7. 公開DoH

| サービス | サーバー利用・形式 | 利用条件・制限 | 一次情報・確認日 |
|---|---|---|---|
| Cloudflare 1.1.1.1 | `https://cloudflare-dns.com/dns-query?name=example.com&type=A`へGET、Accept: application/dns-json。認証不要。公式はネットワーク事業者やsecurity scanning servicesによる利用も説明 | Website and Online Services Terms of Useに同意する扱い。通常用途で制限に遭遇しない想定だが、scan/proxy用途・高頻度・上流に負担のかかる問い合わせ等を制限しうる。固定の公開QPS保証は確認できず `unverified` | [API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/)、[Terms](https://developers.cloudflare.com/1.1.1.1/terms-of-use/)、[Network operators](https://developers.cloudflare.com/1.1.1.1/infrastructure/network-operators/)／2026-10-22 |
| Google Public DNS | `https://dns.google/resolve?name=example.com&type=A`。JSON APIはHTTP GET。組織・ISPを含め誰でも無料利用可 | SLAなし。単一IPv4・IPv6 /64からの大量問い合わせは制限対象。一般DNSのトラブル資料には1,000QPS超の記述があるが、DoH専用の保証枠ではない。サービスのprivacy policy等が適用 | [JSON API](https://developers.google.com/speed/public-dns/docs/doh/json)、[ISP向け条件](https://developers.google.com/speed/public-dns/docs/isp)、[FAQ](https://developers.google.com/speed/public-dns/faq)、[Troubleshooting](https://developers.google.com/speed/public-dns/docs/troubleshooting)／2026-10-22 |

Cloudflare JSON形式には正式RFCがないとの公式注意がある。[Using JSON](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)（2026-05-05更新、確認：2026-10-22）。名前だけを問い合わせ、利用者が貼ったパス・クエリ・トークンまでDNSサービスへ渡す必要はない。

### E8. RDAP

| サービス | 運営・役割 | 条件・制限 | 一次情報・確認日 |
|---|---|---|---|
| rdap.org | Gavin Brown個人の時間・費用で運営。ICANN勤務者ではあるがICANN公式運営サービスという意味ではない。IANA情報に基づき権威RDAPへ302転送 | 最大10回/10秒、超過429。不正利用は403。専用clientやIANA bootstrapの利用を案内。独立した包括利用規約は今回 `unverified`。転送先の条件は別 | [運営者説明・Rate Limits](https://about.rdap.org/)／2026-10-22 |
| Verisign（.com/.net） | レジストリの登録情報参照。正確性は保証しない | 合法目的に限定。迷惑広告や大量自動照会等への使用を制限し、安定性確保のためアクセス制限・停止可能。数値レート上限は `unverified` | [RDAP Terms of Use](https://www.verisign.com/legal-center/rdap-terms/)／2026-10-22 |

ドメイン作成日だけで詐欺かどうかを断定する根拠は上記にない。Verisignに大量自動問い合わせする使い方は推奨しない。

## G. 相談窓口・通報先

各行の確認日：2026-10-22。「—」は今回確認した公式ページで掲載用の電話・受付時間を採録していないことを示す。24時間対応という意味ではない。

| 窓口 | 何のため | 公式URL | 電話/受付（公式にある場合のみ） |
|---|---|---|---|
| フィッシング対策協議会 | フィッシングメール・SMS・サイトの報告。被害回復相談とは別 | [フィッシングの報告](https://www.antiphishing.jp/registration.html) | —（メール・Web報告案内） |
| 都道府県警察サイバー窓口 | 犯罪被害・サイバー事案の相談 | [警察庁：相談窓口](https://www.npa.go.jp/bureau/cyber/soudan.html) | 各都道府県窓口により異なる |
| 警察相談専用電話 | 緊急ではない犯罪・生活安全の相談 | [警察庁公式一覧PDF](https://www.npa.go.jp/bureau/soumu/soudan/soudanmadoguti.pdf) | #9110。土日祝日・夜間は当直・音声案内等。全国一律の有人受付時間は記さない |
| 警察庁・全国統一オンライン窓口 | 通報・相談・情報提供を、選択した都道府県警察へ届ける | [通報等のオンライン受付案内](https://www.npa.go.jp/bureau/cyber/soudan.html) | —。緊急は110、被害届は最寄り警察署等へ連絡する旨あり |
| 消費者ホットライン | 消費生活センター等への消費者相談 | [消費者庁：188](https://www.caa.go.jp/policies/policy/local_cooperation/local_consumer_administration/hotline/) | 188。接続先により時間が異なる。土日祝日は国民生活センターによる補完あり、施設点検日・年末年始等を除く。「平日10～16時」は別のバックアップ相談の案内と混同しない |
| IPA 情報セキュリティ安心相談窓口 | ウイルス・不正アクセス等の一般的な技術相談 | [窓口詳細](https://www.ipa.go.jp/security/anshin/about.html) | 03-5978-7509、10:00～17:00、土日祝日・年末年始除く（旧資料の昼休み付き時間と区別） |
| JPCERT/CC | インシデント報告・調整依頼・情報提供。捜査・法的対応代行ではない | [報告案内](https://www.jpcert.or.jp/form/)、[Webフォーム](https://form.jpcert.or.jp/) | 原則電話報告不可。Web・メールを使用 |
| IPA 脆弱性関連情報の届出 | ソフトウェア製品・Webアプリの脆弱性を届ける | [届出フォーム入口](https://isec-vul-form.ipa.go.jp/ipa-vul-main/index.html)、[FAQ](https://www.ipa.go.jp/security/todokede/vuln/faq.html) | —。発見者・運営者とも案内を参照。必要以上の追加調査への注意あり |
| IPA 安全なウェブサイトの作り方 | サイト開発者・運営者の実装改善資料 | [資料ページ](https://www.ipa.go.jp/security/vuln/websecurity/about.html) | 相談受付ではない。改訂第7版、2021年3月31日更新 |
| 日本郵便 | 日本郵便を装うメール・SMS・偽サイトの注意喚起 | [注意喚起入口](https://www.post.japanpost.jp/notification/notice/fraud-mail.html) | 同ページの相談センター：0120-23-28-86、携帯0570-046-666、全日8:00～21:00 |
| ヤマト運輸／ヤマトHD | 迷惑メール・なりすましサイトの注意喚起 | [注意喚起入口](https://www.yamato-hd.co.jp/important/info_181212.html)、[公式FAQ](https://faq.kuronekoyamato.co.jp/app/answers/detail/a_id/2507/related/1) | — |
| 佐川急便 | なりすまし連絡の注意喚起入口とSMSのFAQ | [お知らせ一覧](https://www2.sagawa-exp.co.jp/information/list/)、[FAQ](https://www.sagawa-exp.co.jp/faq/) | —（個別事件の臨時窓口を一般相談番号として転用しない） |
| 三井住友銀行（金融機関例） | フィッシング対策・不正送金時の案内入口 | [セキュリティ](https://www.smbc.co.jp/security/) | — |
| Google Safe Browsing：報告 | フィッシングの疑いのあるページをGoogleへ報告 | [フィッシング報告](https://safebrowsing.google.com/safebrowsing/report_phish/) | —。ページ到達は確認、JS後のフォーム操作は未実施 |
| Google Transparency Report | Safe Browsingでのサイト状態確認 | [サイト状態確認](https://transparencyreport.google.com/safe-browsing/search) | —。JS後の結果表示は `unverified` |

### G. 外部サービスへのディープリンク実査

確認日：2026-10-22。テスト入力は公開の `https://example.com/`（一部MDNはwww.mozilla.orgも試行）。URLの一部に埋め込む値はその位置に合わせてパーセントエンコードし、二重エンコードしない。**数値HTTPステータスは6件とも `unverified`**。取得失敗を404と記録していない。

| サービス | 渡す形・エンコード | 実アクセスの結果 | 掲載判断 |
|---|---|---|---|
| Google Transparency Report | `https://transparencyreport.google.com/safe-browsing/search?url=<完全URLをクエリ値としてエンコード>` | [試験URL](https://transparencyreport.google.com/safe-browsing/search?url=https%3A%2F%2Fexample.com%2F)はWebツール取得不可。パラメータなし入口は本文空。curlはDNS解決失敗 | 値の引き継ぎ・結果表示は `unverified`。自動入力リンクの推奨外 |
| VirusTotal | 候補：`https://www.virustotal.com/gui/search/<完全URLをパス要素としてエンコード>`。公式検索説明はhttp/https付きURLを入力すると正規化して検索すると説明 | [試験URL](https://www.virustotal.com/gui/search/https%3A%2F%2Fexample.com%2F)取得不可。[入口](https://www.virustotal.com/gui/home/url)はJS必須表示のみ | GUIの正しい永続ディープリンク形式は `unverified`。APIのbase64url識別子をGUI仕様と混同しない。入口で手動入力を案内 |
| urlscan.io | `https://urlscan.io/search/#example.com`。ドメインをfragmentに指定。厳密に入力先を調べるなら公式検索フィールドの`task.domain:example.com`等を使用し、検索式全体をfragment用にエンコード | [試験URL](https://urlscan.io/search/#example.com)は検索ページ本文に到達。fragmentはHTTPサーバーには送られない。JSによる検索実行・結果は未確認 | 検索構文は確認済み、ディープリンク完動は `unverified`。新規スキャンと既存履歴検索を区別 |
| SSL Labs | `https://www.ssllabs.com/ssltest/analyze.html?d=<ホスト名>`。scheme/pathを渡さずホストだけ。通常ASCIIホストはそのまま、値としてエンコード可能 | [試験URL](https://www.ssllabs.com/ssltest/analyze.html?d=example.com)はSSL Server Testの入力画面本文を返した。example.comの分析結果は本文に現れず | そのホストの診断開始・結果まで進めることは `unverified`。入口の利用は確認 |
| MDN HTTP Observatory | 候補：`https://developer.mozilla.org/en-US/observatory/analyze?host=<ホスト名>` | [example.com試験](https://developer.mozilla.org/en-US/observatory/analyze?host=example.com)は取得不可。www.mozilla.orgでもCache miss。[入口](https://developer.mozilla.org/en-US/observatory)本文は取得 | host形式の現行有効性は `unverified`、自動入力リンクの推奨外 |
| securityheaders.com | `https://securityheaders.com/?q=<完全URLをクエリ値としてエンコード>` | [試験URL](https://securityheaders.com/?q=https%3A%2F%2Fexample.com%2F)から正規化されたURLへ転送され、対象がexample.comのレポート本文を取得。レポート時刻は2026-10-16と表示されたため当日の新規計測とは断定しない | **対象付きレポートまで確認済み**。数値HTTP状態・現在時刻の新規スキャンは未確認 |

検証済み機能の根拠：[VirusTotal公式検索説明](https://docs.virustotal.com/docs/searching)、[API URL identifier仕様](https://docs.virustotal.com/reference/url)、[urlscan検索仕様](https://urlscan.io/docs/search/)（ページには2022-04-20表記、2024年の追記もあり）、[SSL Labs公式入口](https://www.ssllabs.com/ssltest/)。いずれも確認：2026-10-22。

**URLを外部に渡す意味**：VirusTotalはWebで検索・照会したIoCもスキャンし、コミュニティが参照できるデータセットに追加すると明示している。検索機能の商用組込みやAPI代わりの自動利用も制限している。urlscanのスキャンはブラウザーによる通信・DOM・スクリーンショット等を記録する。秘密・個人情報入りURLを自動で外部に渡す導線は推奨しない。[VirusTotal](https://docs.virustotal.com/docs/searching)、[urlscan](https://urlscan.io/about/)（確認：2026-10-22）。

## H. 法務・作法

**法律相談ではない。公的な一次情報の整理であり、本アプリの個別適法性を保証するものではない。** 各項目の確認日：2026-10-22。

| 項目 | 条文・一次情報から確認できたこと | 本アプリへの整理・限界 | 根拠URL |
|---|---|---|---|
| H1 不正アクセス禁止法 | 第2条第3項はアクセス制御機能、第4項は他人の識別符号の無断入力等および識別符号以外の情報・指令による制限回避を定義し、第3条が不正アクセス行為を禁止。ID/パスワード悪用だけでなく脆弱性を突く回避も含む | 認証を要しない公開ページへ、識別符号の悪用や制限回避を伴わず通常GETする場合は、これらの構成要件を欠くという条文に基づく整理。「1回なら合法」という回数の例外規定ではない。URL内のトークンが認証情報なら前提が変わる | [e-Gov法令](https://laws.e-gov.go.jp/law/411AC0000000128)、[警察庁：不正アクセス行為の類型](https://www.npa.go.jp/bureau/cyber/pdf/6_QA.pdf) |
| H2 岡崎市立中央図書館事件 | 2010年、自作クローラーで図書館にアクセスした男性が偽計業務妨害容疑で逮捕され、起訴猶予。JPCERT/CCの2010年講演資料はDB接続・セッション管理等の設計問題と、逮捕・起訴猶予を記載 | 有罪判決の事例でも、クローラーの一般的適法性を判決で確定した事例でもない。「毎秒1回なら安全」といった共通の数値基準を導けない。1回/利用者でもサービス全体では同じサイトへ集中しうるという教訓 | [JPCERT/CC講演・JPNIC掲載、2010年](https://www.nic.ad.jp/ja/materials/iw/2010/proceedings/d3/iw2010-d3-03.pdf) |
| H2補足 当時報道 | 2010年の当時報道では、5月25日逮捕、6月起訴猶予、毎秒約1回のアクセスとの説明 | 精密なアクセス間隔・回数は当時の公表ログや捜査資料を直接再検証できていない。一般公開文では歴史の概要に留める。逮捕罪名は刑法234条の2とは別 | [J-CAST報道の配信記事、2010-09-02](https://news.livedoor.com/article/detail/4985118/)、[当時朝日報道を論じた2011年記事](https://webronza.asahi.com/national/articles/2011011800003.html)（報道資料であり補助） |
| H3 刑法234条の2 | 電子計算機・電磁的記録の損壊、虚偽情報・不正指令その他の方法によって使用目的どおり動作させず、業務を妨害する行為を処罰。未遂も対象 | 過大な集中アクセスで正常処理を妨げる行為が問題となりうるという整理。頻度だけで成立を断定しない。条文に万人共通の回数閾値はない。ホスト単位の集中抑止・中止対応は運用上の配慮 | [e-Gov刑法：234条の2](https://laws.e-gov.go.jp/law/140AC0000000045?occasion_date=20260624) |
| H4 User-Agent・robots.txt | RFC9309（2022年）はクローラーの識別とrobots.txt照合を定める一方、アクセス認証の代替ではないとする。SlackはUser-Agentで名乗り、リンク展開は人間の依頼によるものでrobots.txtを尊重していないと公式に説明 | 「すべてのプレビューサービスがrobots.txtを守る」は誤り。独自User-Agentにサービス説明・連絡先のURLを入れる設計はRFCやSlackの例と整合。robots取得を加えれば対象GET以外に1アクセス増えるので、「1回だけ」の説明との整合が必要 | [RFC9309](https://www.rfc-editor.org/rfc/rfc9309.html)、[Slack Robots](https://api.slack.com/robots) |
| H4補足 Twitterbot・facebookexternalhit | 今回、両者の現行公式文書のrobots扱いを取得・確認できず `unverified` | Slackの仕様を他サービスに一般化しない。両者の挙動を本アプリの推奨根拠に採用しない | [Twitter Cards旧公式文書候補](https://developer.x.com/en/docs/twitter-for-websites/cards/guides/getting-started)、[Meta crawler公式文書候補](https://developers.facebook.com/docs/sharing/webmasters/crawler/)（本文未確認） |
| H5 個人情報保護法 | 生存する個人を識別する情報、他情報と容易に照合して識別できる情報が個人情報となりうる。PPC通則編は利用目的の特定・適正取得・安全管理等を説明し、不要な個人データは遅滞なく消去する努力義務を説明 | URL内の氏名・メール等は内容により個人情報。トークンはすべてが直ちに個人情報とは限らないが秘密情報としても扱いが必要。「保存しない」は保持リスクを減らす運用であり、受信・利用・第三者送信への義務が消える根拠ではない。アプリログ・例外ログ・アクセスログ・外部解析へURLが残らない運用も確認対象 | [PPC通則編（2025年資料）](https://www.ppc.go.jp/files/pdf/250324_guidelines01.pdf)、[現行FAQ入口](https://www.ppc.go.jp/personalinfo/faq/APPI_QA/) |
| H6 名誉毀損・信用毀損 | 刑法230条は公然の事実摘示による名誉毀損、230条の2は公共性・公益目的・真実証明等の特例、233条は虚偽風説・偽計による信用毀損等を規定。法務省資料は社会的評価の低下や真実相当性の判例を整理 | 根拠の弱い「詐欺サイト」断定は運営者の評価・信用を傷つける危険がある。「HTTPヘッダーがなかった」「取得できなかった」の観測事実、条件・日時を示す設計が妥当。ただし「兆候」「可能性」と付けるだけで責任を免れるという一般的免責は `unverified` | [e-Gov刑法](https://laws.e-gov.go.jp/law/140AC0000000045?occasion_date=20260624)、[法務省：人権侵害情報処理要領（2019年資料）](https://www.moj.go.jp/content/001290355.pdf)、[法務省：違法情報ガイドライン抄](https://www.moj.go.jp/content/001448892.pdf) |
| H7 商標・文字列照合 | JPO資料は、出所表示機能を果たさない態様の使用には商標権効力が及ばないことを商標法26条1項に沿って説明 | ブランド文字列を内部で照合することと、自社サービスの出所表示として使うことは分けて考える必要がある。本アプリの「識別目的なら必ず許諾不要」は `unverified`。文字のみ・ロゴなしでも具体的な表示態様や提携誤認を含め個別評価が残る | [JPO：商標権の効力（2020年更新）](https://www.jpo.go.jp/system/trademark/gaiyo/seidogaiyo/shotoha.html)、[JPO掲載：商標的使用の説明](https://www.jpo.go.jp/resources/shingikai/sangyo-kouzou/shousai/isho_wg/document/23-shiryou/s01.pdf) |

公表表現への適用案（法的免責の主張ではない）：詐欺の兆候とHTTP設定の観測を分離し、「危険なサイトです」「安全です」という総合断定を避ける。観測できた事実と、通信失敗・未検査による不明を別表示にする。この表現だけで法的責任を回避できるという判例・公的保証は確認していない。

## I. 先行サービスの比較

各行確認日：2026-10-22。「何を見ないか」は公式に説明された検査範囲からの限界整理であり、ベンダーが全く検査していないことを網羅的に実証した意味ではない。「すぐ使える」は入力入口の有無と実診断完了を区別した。

| サービス・一次情報 | 何を見るか | 何を見ないか／範囲外 | 結果の言い方 | 日本語対応 | URLを入れてすぐ使えるか |
|---|---|---|---|---|---|
| [MDN HTTP Observatory](https://developer.mozilla.org/en-US/observatory) | HTTPのセキュリティ設定・ベストプラクティス | 運営者の身元・詐欺の有無の保証にはならない | セキュリティ設定の評価。今回、実結果の等級表示は `unverified` | 検査画面の日本語化は `unverified`。取得した入口は英語 | 入力サービスの存在は確認。JS後の診断・deep linkは `unverified` |
| [securityheaders.com](https://securityheaders.com/about/) | HTTP応答のセキュリティヘッダー | サイト内容の合法性・詐欺・全脆弱性 | A等の採点。[試験](https://securityheaders.com/?q=https%3A%2F%2Fexample.com%2F)ではF。安全性全般の等級ではない | 取得UIは英語、日本語切替は `unverified` | 登録なしの対象付きレポート取得を確認。既存結果の可能性あり |
| [SSL Labs](https://www.ssllabs.com/ssltest/) | 公開SSL/TLSサーバーの設定・証明書等 | ブランドの正当性、ページ内容・詐欺 | A+等のTLS評価 | 取得UIは英語、日本語切替は `unverified` | ホスト入力欄あり。URLのパスは評価しない。試験では分析完了を確認できず |
| [Hardenize](https://www.hardenize.com/) | ネットワーク境界・証明書・サービス設定の発見・監視 | サイト内容の詐欺判定・取引相手の保証とは別 | 設定・監視のレポート。具体的な現行判定ラベルは `unverified` | 取得UIは英語、日本語切替は `unverified` | 公開ドメインレポート入力欄あり。JS後の実行完了は `unverified` |
| [urlscan.io](https://urlscan.io/about/) | ブラウザーでアクセスし通信先・DOM・画面等を記録。ブランド標的サイトを潜在的悪性として強調 | 取引の安全や未発動攻撃の不存在の保証にはならない | potentially malicious等、観測情報を併記 | 取得UIは英語、日本語切替は `unverified` | 履歴検索入口あり。新規scanは検索と別で、ブラウザー実行・記録を伴う。今回新規投稿は未実施 |
| [VirusTotal](https://docs.virustotal.com/docs/searching) | URL検査レポート、検査エンジン・blocklist等の検出情報 | 検出がないことによる未知詐欺の不存在保証 | エンジン別検出数・判定。[検索修飾子仕様](https://docs.virustotal.com/docs/url-search-modifiers)にもpositives/enginesの説明あり | 現行GUIの日本語対応は `unverified` | 無料検索は利用者向けに提供。今回GUIはJS必須表示まで。検索もデータ追加対象 |
| [Google Safe Browsing](https://developers.google.com/safe-browsing)、[Transparency Report](https://transparencyreport.google.com/safe-browsing/search) | 既知のsocial engineering・malware・不要ソフト等の危険リソースリスト照合 | 未登録・新規詐欺、運営者の本人確認やHTTPヘッダー採点 | リストに基づく警告。今回Transparencyの個別結果文言は `unverified` | 公式開発資料に日本語あり。状態確認画面の日本語動作は `unverified` | 状態確認入口あり。今回個別結果は未確認。APIは別途導入が必要、非商用限定 |
| [Sucuri SiteCheck](https://sitecheck.sucuri.net/) | 外部から既知malware、blocklist、エラー、旧ソフト・悪性コード等を確認 | サーバー内部の全ファイルや未公開領域。リモートスキャンは範囲が限られると明記 | 結果は保証しないと明記。現行の具体的な結果ラベルは `unverified` | 取得UIは英語、日本語切替は `unverified` | 無料URL入力欄あり。JS必須、今回診断完了は未確認 |
| [Trend Micro Site Safety Center](https://global.sitesafety.trendmicro.com/?cc=jp) | 経年・ホストの履歴・不正プログラム分析等によるWebレピュテーション | HTTPヘッダー・TLS詳細採点を提供するという根拠なし。未評価もあり | **「安全」「危険」「不審」「未評価」**。安全は最新試験で有害プログラムやフィッシング兆候がないという説明 | **日本語画面を確認** | URL入力欄あり。今回フォーム送信後の個別結果は未確認 |
| [Norton Safe Web](https://safeweb.norton.com/)、[公式日本語説明](https://support.norton.com/sp/ja/jp/home/current/solutions/v19116982) | Webサイトの脅威・安全性評価 | 未評価サイトや未検出リスクが残る。包括的な守りの設定監査ではない | **「安全」「未評価」等**。安全は表示しても安全と判定した旨の説明 | **公式説明は日本語**。現行検査サイトUIは `unverified` | サイト本体は本文取得できず、現在の入力・結果動作は `unverified` |

一般利用者の「踏む前」用途では、日本語の入力画面と評価説明を確認できたTrend Microが候補になるが、今回の個別診断完了は未検証。VirusTotalとurlscanは追加調査に使える一方、URL共有・公開範囲の理解が必要。
HTTP Observatory・Security Headers・SSL Labs・Hardenizeは主に運営者の設定確認を助ける。設定の良さと詐欺でないことを結びつけず、未知サイトの不明扱い、なりすましの観測根拠、日本語での説明を補う余地がある（上記検査範囲からの比較上の整理）。

## 不確かな点

- **実HTTPステータス・ブラウザー実行**：6ディープリンクの数値応答、JS後の値引継ぎと診断完了は未検証。Security Headersのみ対象付きレポート本文を確認。未確認ディープリンクは推奨リストに入れていない。
- **Workers実機**：TLS3ケース、一般DNS失敗、private/localhost各範囲、IP直指定、各互換日・宛先経路での戻り方は実測していない。公式の特定条件の説明を、あらゆるfetchの例外/HTTP応答契約へ一般化しない。
- **無料binding**：Workers Rate Limiting bindingのFree利用条件・料金、Pagesでの対応は未確認。WAFの無料1本とは別物。
- **契約**：本サービスのスキャン・プロキシ用途がCloudflareから個別に承認されるかは未確認。DoHの保証QPS、rdap.orgの独立利用規約、Verisignの数値レート上限も未確認。
- **法務**：通常GETにアクセス制御回避がないという前提は個別URLごとに異なる。トークン利用、商標の具体的画面、判定表示の名誉・信用への影響の個別適法性は未確認。「兆候」と書けば免責になるという根拠はない。
- **資料年**：岡崎事件は2010年の一次講演資料と当時報道、RFC9309は2022年、IPAウェブ作成資料は2021年、PPC通則編は2025年資料。2026年に新規作成された資料として扱わない。
- **他社ロボット**：Twitterbot・facebookexternalhitの現行robots.txt運用は未確認。Slackの例だけで一般化しない。
- **先行サービス**：日本語切替の不存在は断定しない。未確認の検査完了・判定ラベル・翻訳対応は `unverified` のままとする。
