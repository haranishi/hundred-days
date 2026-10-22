# Day74 セキュリティ独立レビュー 1

## 総評（3行）
URL文字列の入口と通常の転送・本文上限はよく絞られているが、DNSが返す予約IPv6を通すため、公開先だけへ接続する受け入れ条件は未達。
64KiB未満のHTMLでも長いbase URLを再解析してCPU予算を超える入力を再現し、DoH/RDAPのJSONにも読み取り量の上限がない。
既存の観測系174テストは全件成功したが、以下のhigh/mediumの解消と、プライバシー説明との整合を確認するまで、この部分を公開可とは判定しない。

## 対象・実施方法

- 2026-10-22、`feat/day-074-site-check` の作業中ファイルをレビュー。指定の脅威モデル・設計・モデル・要件§3/4/7・実行基盤調査§E、観測ライブラリ、両Pages入口、`observer-*.test.mjs`、Day35の比較対象を読んだ。`static/privacy.html` とクエリ除外の純関数も確認した。
- 変更したのはこの文書と `day074-security-probes/probe.mjs` のみ。製品・仕様・既存テストは変更していない。公開・Git操作・依存導入はしていない。
- Node v24.22.1。`node --test --test-reporter=spec day-074-link-dokumi/tests/observer-*.test.mjs`：174件成功、失敗0。
- 再現：`node .agent-harness/reviews/day074-security-probes/probe.mjs`。fetchをすべて差し替え、実ネットワーク呼び出しを禁止した。公式資料の閲覧を除き、外部サービス・診断先へ通信していない。
- 重要な限界：下記のSSRF再現は**拒否すべきアドレスを含むDNS応答から、ホスト名へのfetch呼び出しまで到達する証明**。本番からそのIPへ接続できること、IPv4へ変換されること、内部情報が取得できることまでは実証していない。CPUはローカルNodeの経過時間であり、本番WorkersのCPU計測値ではない。

## 指摘

パスの `lib/` はすべて `day-074-link-dokumi/lib/` を指す。プローブの名前は標準出力の `name` と対応する。

| 番号 | 重大度(critical/high/medium/low/info) | ファイル:行 | 何が起きるか | 再現する入力（可能なら、そのまま関数に渡せる形） | 直し方 |
|---|---|---|---|---|---|
| S1 | high | `lib/target-guard.js:70`、`lib/doh.js:33` | IPv6を既知の少数の拒否範囲以外すべて公開とみなすため、予約範囲・旧site-local・benchmark・dummy prefixまで通す。攻撃者のドメインのAAAAに設定すると、DoH検査が成功して対象fetchへ進む。既存テストは `fec0::` や `100:0:0:1::` の許可を正解として固定しており、現状のテスト成功では防げない。実際の内部到達には基盤の経路等の条件が必要。 | `isPublicIp('fec0::1')`、`isPublicIp('2001:2::1')`、`isPublicIp('100:0:0:1::1')`、`isPublicIp('4000::1')` がすべてtrue。`runTrace('https://attacker.com/', ...)` にDoH応答 `{Status:0,Answer:[{type:28,data:'fec0::1',TTL:0}]}` を返すと、対象へのfetchが1回発生。`non-public-ipv6-accepted`参照。`::ffff:0:7f00:1` も予約範囲なのに許可されるが、これがOSでloopbackに変換されるとは主張しない。 | IANAの公開割当と特殊用途の到達性に沿った許可判定にする。少なくとも列挙した非公開/予約範囲を拒否し、未割当範囲を既定許可しない。埋め込みIPv4の例外は意図を限定し、公開IPv4の検査を行う。現在誤って許可を期待する境界テストも修正する。 |
| S2 | medium | `lib/html-facts.js:114`、`lib/html-facts.js:165` | 表示用baseHrefは300字に切る一方、解析用effectiveBaseは最大約64KiBのまま。多数の相対リンクごとに長いbase文字列を `new URL` で読み直し、処理量がbase長×リンク数になる。本文上限内でも無料枠10msに収める根拠が崩れる。タイマーは同期解析を途中停止できない。 | `extractHtmlFacts('<base href="https://attacker.com/'+ 'a'.repeat(32000)+'/">' + '<a href=x>x</a>'.repeat(1500), 'https://attacker.com/')`。入力59,033 bytes、7回の中央値約22ms。base 4,000字で約4.3ms、16,000字で約11.6ms。`large-base-cpu`参照。 | 解析用baseの長さにも上限を設け、超過時はそのbaseを採用しない/解析不能を記録する。URL参照の解析件数や処理量にも予算を設ける。長いbaseと多数リンクを組み合わせた回帰試験を加え、全観測処理を含めてworkerdで測る。 |
| S3 | medium | `lib/doh.js:20`、`lib/doh.js:22`、`lib/rdap.js:15` | 両方とも `response.json()` で全文を読み込んでから切り詰める。DoHのAnswer件数、RDAPのevents/entities件数にも解析前の制限がない。タイムアウトは同期JSON解析のCPU・メモリ消費を止めない。外部応答が大きい場合に無料枠を消費する。 | DoHへ `{Status:0,Answer:[{type:16,data:'x'.repeat(2*1024*1024)}]}`、RDAPへ `{events:[{eventAction:'registration',eventDate:'2020-01-01'}],ignored:'x'.repeat(2*1024*1024)}` を8KiBずつ配信。2,097,197 / 2,097,233 bytesを全量読んで成功する。`json-unbounded`参照。 | 復号後のストリーム読み取り上限を設け、超過時はcancelしてunavailable。JSON.parse前のバイト上限と、parse後の配列件数・要素型を制限する。固定の信頼先を使うため、通常のドメイン所有者だけでこの2MiB応答を作れるとは未確認。DoHサービスの増幅限度・レジストリの制限を別途確認しつつ、応答上限は自前で持つ。 |
| S4 | low | `lib/handlers.js:9`、`lib/handlers.js:80`、`lib/handlers.js:106`、`static/privacy.html:63` | API応答を `public, max-age=60` にするため、URL・抽出テキストを含む結果を端末/中間キャッシュへ保存可能にしている。「端末には何も保存しません」と一致しない。また、299秒前の結果に新しい60秒の鮮度を与え、最大5分の後も最大約59秒利用可能。登録日も24時間直前のaround応答で同種の延長が起きうる。 | t=0で `handleTrace` を呼び、同じURLをt=299,000msで呼ぶ。対象取得1回のまま `cached:true`、`Cache-Control: public, max-age=60`、Ageなし。`cache-freshness-reset`参照。実ブラウザのディスク保存までは試していない。 | 外向きAPI応答を `Cache-Control: no-store` にし、短期保存は明示したサーバー内キャッシュに限定する。外部キャッシュも残す設計なら説明を更新し、残りTTL/Ageを引き継ぐ。ただしmax-ageは物理的削除時刻の保証ではない。 |
| S5 | low | `lib/sanitize.js:4` | C0/DELだけ除去し、U+202E等の双方向制御をそのまま返す。攻撃サイトが題名やファイル名などの見た目を並べ替え、診断結果・コピーした報告を紛らわしくできる。textContentでXSSを防いでも文字の視覚的偽装は残る。 | `<title>Invoice\u202egpj.exe\u202c</title>` をHTMLとして返すと、`runTrace` の `html.title` にU+202E/U+202Cが残る。`bidi-survives`参照。ブラウザ描画は未実施。 | 信頼しない表示用文字列のBidi_Controlを除去するか、`\\u202e` 等として可視化する。URL解析用文字列には表示用の加工を流用しない。 |
| S6 | low | `lib/html-facts.js:180`、`lib/handlers.js:83`、`static/privacy.html:63` | HTMLの可視本文を最大400字のtextSampleとしてJSONへ返し、結果キャッシュにも保存する。「HTMLの構造だけ」「ページの本文は保存せず」と一致しない。model.mdのtextSample契約には沿っているため、単純な実装逸脱ではなく、仕様内のプライバシー説明との矛盾。本文全体を返す問題ではない。 | `runTrace('https://attacker.com/', {resolve:publicDns,fetchImpl:async()=>new Response('<p>BODY_ONLY_MARKER_12345</p>',{headers:{'content-type':'text/html'}})})` の `html.textSample` にマーカーが入る。`body-excerpt-returned`参照。 | 判定に不要ならtextSampleを返却/保存しない。必要なら、題名・見出し・先頭の可視本文等の短い抜粋を最大5分一時保存して返すことを仕様・画面・プライバシー説明で明示する。 |
| S7 | info | `lib/rdap.js:12` | RDAPだけは `redirect:'follow'` であり、転送先のURL/DNS検査・独自ホップ数制限を行わない。`rdap.org`から権威サーバーへの転送は設計上必要だが、上流が内部URLへ転送した場合には自前のSSRF対策を通らない。通常の入力ドメインだけで転送先を攻撃者が選べる経路は今回見つからなかった。 | `fetchRegistration('attacker.org', {fetchImpl:async(_url,init)=>{ /* init.redirect === 'follow' */ return new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}});}})` で指定モードを確認。`rdap-redirect-mode`参照。モックは自動転送しないため実内部接続の再現ではない。 | IANA bootstrap等で権威先を決めるか、RDAPもmanualでHTTPS/公開ホスト/DNS/転送数を検査する。既知の信頼上流に依存する例外として残すなら、脅威モデルに明記する。 |

S1の範囲の根拠：IANAはfec0::/10と4000::/3を予約とし、2001:2::/48と100:0:0:1::/64はGlobally Reachable=falseとしている。[IPv6 Address Space](https://www.iana.org/assignments/ipv6-address-space/)、[IPv6 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv6-special-registry/)。
S2/S3の影響を評価する基盤条件は、無料枠CPU 10ms、メモリ128MB。[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)。

## 確認したが問題なかったこと

「問題なし」は記載した範囲に限る。すべての入力・本番環境での安全性を保証する意味ではない。

| 何を | どう確かめたか・結果 |
|---|---|
| 数値ホスト・認証情報・ポート・予約名 | guard既存テストと追加プローブでIPv4/IPv6直指定、NAT64/6to4の直指定、`@`、8080、末尾ドット、%00を拒否。URL.hostnameとfetchするURLは同じURLオブジェクト由来。既知の912通りの数値表記試験は重複実施していない。S1はURL直指定ではなくDNS応答側の欠落。 |
| NFKC/IDNA・区切り文字 | 既存テストで全角http/ホストを正規化、①/。で数値となる入力、埋め込みタブ/改行を拒否。around追加プローブで全角スラッシュ・?・@・コロン・逆スラッシュを拒否し通信0。正規化後の同じURLで検査・接続する。 |
| DNSの失敗時 | 既存テストを再実行：公開とprivate混在、65件の公開Aの後のprivate、CNAMEだけ、resolver停止、SERVFAILを拒否。追加プローブでnull/不正Status/不正Answer/要素null/文字列typeを含む公開アドレスなしのJSONを拒否。 |
| DNSのIPv6のみ・AD・TTL | AAAAが `2606:4700:4700::1111` のみ、AD=false、TTL=0の応答を追加プローブで受け付ける。ADは情報として返すだけで、AD=falseをprivate検査の省略に使わない。TTLに依存して安全判定していない。CNAMEはDoH応答の末端A/AAAAを検査し、private末端があれば拒否する。 |
| 転送先と回数 | 既存テストで内部名/内部IP/別ホストのprivate DNSを拒否し、ループも6回の取得・5転送で終了。追加で相対URL、`//host`、逆スラッシュ形式、空Location、javascript/data、認証情報、ポート、巨大Locationを実行。通したHTTP(S)先にもguardを適用。クロスホストはDNS再検査。security.txt・補助プローブは転送を追わない。 |
| 本文量・破棄・停止する通信 | 既存テストで無限ストリームを復号後65,536 bytesで打ち切り、reader.cancelを呼ぶ。非HTML/添付/転送/チャレンジ/TLS状態でも本文cancel。fetch/DNS/readが停止しても期限で戻る。結合は切り取ったチャンクを1回コピーする。CPU解析の例外はS2、JSONの例外はS3。 |
| HTMLの通常の病的入力 | 閉じないscript/comment、`<`連続、巨大属性、6,000タグ上限、正規表現near-missの既存テスト成功。文字列走査と抽出配列の件数は制限される。既存単独入力では検出されないbase×リンク数の組み合わせをS2として分離した。 |
| 許可する取得先 | aroundは検査済みhostを使う反対schemeのルートとHTTPS security.txt、DoH、RDAPのみ。traceは対象と転送先、接続失敗時に同じ検査済みホストのHTTPルート1回。HTML内のform/base/script/meta-refreshをfetchしない。RDAP転送の信頼例外はS7。 |
| RDAPパス注入 | `/`、`?`、`#`、`@`、末尾改行を含むregistrableを追加プローブで拒否、通信0。HTTP入力からregistrable注入のオプションは渡せない。関数のdepsはサーバー内部の依存注入であり公開パラメータではない。 |
| ハンドラーの入口 | POST等405、停止503、cross-site/same-site403、same-origin/none/未送信を許可する既存テスト成功。CORSなし、CORP same-origin、nosniff。Sec-Fetch-Siteはブラウザからの誘発対策であり、任意HTTPクライアントの認証にはならない。 |
| レート制限とキー | 既存テストで13回目429、同一isolate内の同時13件でも1件429、次の固定分で復帰。URL/IPはSHA-256の別種のキーに分離。RDAPは24h期限、結果はサーバー内300秒、レート保存TTL70秒。暗号ハッシュの衝突による汚染経路は見つからなかった。外向き鮮度の例外はS4。 |
| エラー・ログ・返すヘッダー | catchは固定のinternal_error/分類コードを返す。stack/path/例外メッセージを返さない。consoleのURL/IP出力なし。既存テストでSet-Cookie値、任意X-Secret、RDAPのregistrant名を除外。許可ヘッダーの長さとtrace JSONの64KiBを確認。Cookieの名前とPath等の属性は契約どおり返す。 |
| 送るCookie/Referer/Origin | 診断先へのrequestが新しいheadersオブジェクト（User-Agent/Accept/Accept-Languageのみ）を作ることをコードと既存テストで確認。受信Requestのヘッダーをコピーせず、対象のSet-Cookieを次ホップへ引き継がない。基盤が付加するヘッダーは別途本番実測が必要。 |
| クエリ・フラグメント | 追加プローブでparseInputの既定のfetch.hrefはpathまで、includeQuery=trueでだけqueryを追加、hashは常に除外。API自体はqueryを受け付ける設計。転送先URLに含まれるqueryは通常の転送として送られる。app.jsはレビュー時点で骨組み1行なので、実際のブラウザからの既定送信は未確認。 |
| 取得作法・拒否時の再試行 | 診断先はLinkDokumiと説明URLを名乗る。通常の403/429も最終結果として返し、チャレンジ状態は停止。対象の再試行・robots.txt・隠しパス走査はない。TLS推定用のHTTP取得は設計に明記。DoHは失敗時に別resolverへ1回フォールバックし、RDAPのアプリ側再試行はない。 |
| Workers固有の呼び方 | `AbortSignal.any`を使わず親signalのイベントとタイマーで実装。crypto.subtle SHA-256、Request/Response、任意のctx.waitUntil、caches.defaultにない場合の分岐、TextDecoder例外時のUTF-8フォールバックを読んだ。getSetCookieはoptional callで、存在しない場合の文字列分割経路がある。redirectはmanual/followだけ。既存runtimeテスト3件成功。ただしこれはWorkersに似せたNodeモックでありworkerd実測ではない。 |

## 未検証・既知の残存リスク

- DoHとfetchの実際の解決先の一致は保証できない。さらに同一trace内ではhostname単位のMapで検査結果を再利用するため、同一ホストへの転送でTTL=0でも再問い合わせしない。既知のDNS切り替えリスクの一部として扱い、新規発見のSSRF実証とは数えなかった。S1はこれと独立して、最初のDoH応答そのものを誤って許可する。
- レート制限は固定分方式なので境界の前後に12回ずつ可能。DC/別isolateを横断する原子性はなく、IPv6 /64内でIPを変えても別キーとなる。CF-Connecting-IP文字列は正規化しない。Cloudflareが与える接続元値の信頼が前提であり、クライアントの偽装ヘッダーが本番まで通ることは未実証。欠落時は全員unknownにまとまる。cache自体がない環境ではレート制限を省略する。
- 最多の対象取得はtraceが初回+転送5回の6回、HTTPS失敗のHTTP補助がさらに1回、aroundのroot/security.txtが2回で合計9回。同じURLの正常traceはサーバーでキャッシュするが、aroundのroot/security.txt/メールDNS全体は結果キャッシュしない。DoH/RDAPはこの対象取得数と別。RDAPの自動転送はS7のとおりアプリ独自の回数制限がない。
- UIはまだ骨組みだったため、端末保存・実際のfetchオプション・危険リンクの確認・Bidiの視覚的効果・運営者向け説明URLの表示内容は今回のサーバーレビューでは実証していない。
- 本番Workers/workerdの実行、Cloudflareが付加する送信ヘッダー、IPv6予約アドレスへの実接続、停止スイッチの実運用反映、法的適法性や外部サービスからの個別許諾は検証していない。ビルド/公開ゲートは製品変更・公開を行わない今回の読み取りレビューでは実行していない。
- Workersの現行[Headers公式資料](https://developers.cloudflare.com/workers/runtime-apis/headers/)はSet-Cookieの複数値にgetAllを案内する。今回のoptionalなgetSetCookie経路だけを見て本番対応済みとは断定せず、getAllがある基盤ではそちらを優先する回帰実測が望ましい。[Encoding公式資料](https://developers.cloudflare.com/workers/runtime-apis/encoding/)だけからShift_JIS/EUC-JPの本番成功は確定できず、Nodeのデコード成功と区別した。
