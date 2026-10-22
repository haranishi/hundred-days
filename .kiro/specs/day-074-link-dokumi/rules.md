# 所見のルール

`rules.js` の `evaluate` が持つ全ルール。1ルールに1つの`id`、文面は`messages.js`に同じ`id`で持つ（全`id`の文面が揃っていることを単体テストで固定）。
「点」は`Finding.points`。`floor`は訪問者の段階の下限。入力の欠けで判定できないルールは出さず、まとめて`O-UNKNOWN`／`V-UNREACHABLE`の1件にする。

## 訪問者の軸（なりすましの兆候）
| id | 条件 | 点 | 重大度 | floor |
|---|---|---|---|---|
| V-USERINFO | `@`の左に認証情報があり、左側がドメインに見える（`https://amazon.co.jp@evil.example`） | 9 | high | danger |
| V-IP-HOST | ホストが数値のアドレス（あらゆる表記） | 8 | high | warn |
| V-HOMOGRAPH | 1ラベルに複数の文字体系が混じる、または日本語以外で紛らわしい文字（キリル・ギリシャ）を含む | 8 | high | warn |
| V-PUNYCODE | `xn--`を含み、V-HOMOGRAPHでない（読める形を示す） | 1 | info | – |
| V-BRAND-SUBDOMAIN | ブランドの公式ドメインが、別の登録ドメインの手前のラベルとして並ぶ（`www.amazon.co.jp.x.example`） | 9 | high | danger |
| V-BRAND-TYPO | 登録ドメインのラベルが、紛らわしい文字を直すとブランド名に一致する、または編集距離1（6字以上のブランド名） | 8 | high | warn |
| V-BRAND-KEYWORD | 公式でないドメインのラベル／サブドメインにブランド名を含む（名前の部分は4点、パスだけに含むなら2点）。ログイン・確認など敏感語が同居すれば+3。人名・地名・一般語としても使われる語（yamato・sagawa・saison・apple・amex・aeon・epos・mizuho）は、敏感語・ハイフン2つ以上・弱い目安のTLD・第三者公開先のどれかが同居するときだけ。**ハイフンを含む語（e-tax・smbc-card・etc-meisai など）は、ラベル／パスの区切りに挟まれた形で部分一致**する（`e-tax-login`・`verify.e-tax.top`・`/e-tax/login`）。**登録名が`ac.jp`・`ed.jp`・`go.jp`・`lg.jp`（学校・官公庁だけが取れる）の場合、登録名のラベルによる一致は出さない**（`mizuho.ac.jp`は学校）。照合に使う名前の部分は**公開サフィックスより左のラベルだけ**（`s3.amazonaws.com`の`amazonaws`は使わない）。文面は「この診断の公式ドメイン一覧にはありません」と事実を書き、別の公式サービスの可能性を残す | 4/2（+3） | medium | – |
| V-BRAND-CONTENT | ページの題・見出し・サイト名がブランドを名乗り、ドメインは公式でない（`userContentHost`は公式扱いしない）。**ログイン/確認の文脈があるときだけ**（パスワード/カード入力欄がある、または題・見出しに ログイン・サインイン・認証・確認・会員・マイページ・Sign in・Verify などの語がある）。**入力を求める画面かどうかで3段**：パスワード・カード・メールの入力欄があれば9点（floor warn）／3項目以上のフォームがあれば5点／入力欄が無い、または検索窓のような小さなフォームだけなら**2点・low**（「Amazonのログイン方法を確認する」のような解説記事を拾わない）。ニュース記事が楽天やドコモの名前を出しているだけでは出さない | 9/5/2 | high/high/low | warn（入力欄あり） |
| V-SENSITIVE-WORDS | ホスト/パスに敏感語が2語以上 | 2 | low | – |
| V-SHORTENER | 第三者の短縮URL（公式の短縮は対象外） | 1 | info | – |
| V-TLD-RISKY | 弱い目安のTLD。単独では根拠にしないと書く | 1 | low | – |
| V-LABEL-ODD | 登録ラベルにハイフン3つ以上、または乱数のような長いラベル | 2 | low | – |
| V-DEEP-SUBDOMAIN | 登録ドメインの手前に4ラベル以上 | 2 | low | – |
| V-LONG-URL | 120字超（200字超は2点） | 1 | info | – |
| V-ENCODED | `%`エンコードが6個以上、`%00`、二重エンコード | 2 | low | – |
| V-REDIRECT-PARAM | クエリに**別の登録ドメイン**の絶対URL（同じ登録ドメインの別ホストへの指定は、通常のサイトでも普通なので対象外）（`url=`・`redirect=`・`next=`・`goto=`・`link=`・`target=`・`u=`・`r=`・`return=`・`continue=`・`dest=`） | 3 | medium | – |
| V-HTTP | 最終ページが`http://`（暗号化なし）。パスワード欄があれば+3 | 3（+3） | medium | – |
| V-TLS-FAIL | HTTPSの接続に失敗した（`tls_failed`）。ローカル実測で、証明書エラーと名前が引けない場合は同じ例外のため、推定でしかない。status=`unknown`・0点。段階は`unknown`（見た目に兆候が無いとき）になり、`http://`には応答があったことを併記し、証明書の期限切れなどと断定しない | 0 | info | – |
| V-REDIRECT-CROSS | 転送が3つ以上の異なる登録ドメインを通る（5つ以上は5点） | 3 | medium | – |
| V-HTTPS-DOWNGRADE | 転送の途中でhttpsからhttpへ落ちる | 4 | medium | – |
| V-NEW-DOMAIN | 登録から14日未満=8／30日未満=6／90日未満=3／1年未満=1 | 8/6/3/1 | high/high/medium/low | warn（30日未満） |
| V-CROSS-FORM | パスワード/カード入力のあるフォームの送信先が、別の登録ドメイン | 8 | high | warn |
| V-META-REFRESH | `<meta refresh>`が別の登録ドメインへ（パスワード欄があれば3点。正規のサイトも移転で使うので、単独は2点） | 2/3 | low/medium | – |
| V-HIDDEN-IFRAME | 見えない（0サイズ・非表示）別ドメインのiframe（広告・計測で正規の大手サイトにもあるので、単独は1点。パスワード欄があれば3点） | 1/3 | low/medium | – |
| V-OBFUSCATION | 難読化の型（最大2種、各2点） | 2/4 | low | – |
| V-DOWNLOAD-APK | 最終応答がAndroidアプリ（`.apk`・`application/vnd.android.package-archive`） | 10 | critical | danger |
| V-DOWNLOAD-EXEC | 実行形式/インストーラ/スクリプト（`.exe .msi .scr .bat .cmd .js .vbs .jar .dmg .pkg .lnk .hta .ps1`） | 7 | high | warn |
| V-DOWNLOAD-ARCHIVE | 圧縮/ディスクイメージ（`.zip .rar .7z .iso .img`） | 2 | low | – |
| V-NOT-FETCHED | `parsed.fetch.allowed === false`（IP・予約名・`@`・ポート・自サイト・スキーム）で、つなぎに行かなかった。理由を平易に。`.example`は見本用の予約名と説明。status=`unknown` | 0 | info | – |
| V-UNREACHABLE | つながらなかった。`error.code`ごとに平易な理由（時間切れ・名前が見つからない・接続失敗・HTTPS失敗〔HTTPには応答あり〕・転送先が診断できない宛先・転送が多すぎる・名前の確認サービスに接続できない）と、次にすること。点なし・status=`unknown` | 0 | info | – |
| V-BLOCKED-FETCH | ボット対策などで断られた。点なし・status=`unknown` | 0 | info | – |
| V-OFFICIAL-DOMAIN | ホストが公式ドメイン表にあり、`userContentHost`でない。**転送の途中・最終ページに、別の登録ドメイン（同じブランドの公式でないもの）があるときは`good`にせず`info`**にして「入口は公式ドメインの一覧にありますが、転送先は別のドメインです」と書く（入口が公式でも、転送先の保証にはならない）。status=`good`・点なし。「◯◯の公式ドメインの一覧にあります。ただし、このドメインの中の個々のページを誰が作ったかは、ドメインからは分かりません」（乗っ取りの否定ではない） | 0 | info | – |
| V-SHARED-HOST | `freeHost`（第三者がサブドメインを取れるサービス）または`userContentHost`（`sites.google.com`など公式ホストだが利用者がページを作れる、**または公開サフィックスリストのPRIVATE区画にあるホスト**＝`sakura.ne.jp`・`github.io`・`s3.amazonaws.com`など）。「誰でもページを置けるサービスのアドレスです。このページの作成者は、サービスの運営会社とは限りません」（「無料」と書かない）。status=`info` | 0 | info | – |
| V-JP-RESTRICTED | `go.jp`・`co.jp`など登録資格のあるJPドメイン。status=`good`・点なし。資格の中身は`research.md`の記述どおり | 0 | info | – |
| V-OLD-DOMAIN | 登録から5年以上。status=`good`・点なし | 0 | info | – |

## 運営者の軸（サイトの守り）　対象：最終応答がHTML（それ以外は「対象外」として出さない）
| id | 条件 | 点 | 重大度 |
|---|---|---|---|
| O-NO-HTTPS | 最終がhttpで、httpsも使えない | 40 | critical |
| O-NO-UPGRADE | httpsは使えるが、httpがhttpsへ転送されない | 15 | high |
| O-HSTS-MISSING | HTTPSなのにHSTSがない。`max-age=0`（保護を解除する指定）も未設定と同じ扱い（根拠に「max-age=0＝保護の解除」と書く） | 15 | high |
| O-HSTS-WEAK | `max-age`が15,552,000秒（180日）未満 | 5 | medium |
| O-CSP-MISSING | CSPがない（Report-Onlyだけも同じ。`<meta>`のCSPは「あり（弱い）」） | 15 | high |
| O-CSP-WEAK | scriptに`'unsafe-inline'`（nonce/hash/`strict-dynamic`なし）・`'unsafe-eval'`・`*`・`https:`・`data:`・`http:` | 8 | medium |
| O-FRAME-MISSING | `X-Frame-Options`も`frame-ancestors`もない | 8 | medium |
| O-XCTO-MISSING | `X-Content-Type-Options: nosniff`がない | 5 | low |
| O-REFERRER-MISSING | `Referrer-Policy`（ヘッダー/メタ）がない | 3 | low |
| O-COOKIE-SECURE | セッションらしいCookieに`Secure`がない（HTTPSサイト） | 10 | high |
| O-COOKIE-HTTPONLY | セッションらしいCookieに`HttpOnly`がない | 6 | medium |
| O-COOKIE-SAMESITE | セッションらしいCookieに`SameSite`がない | 2 | low |
| O-VERSION-DISCLOSURE | `Server`/`X-Powered-By`/`X-AspNet-Version`に版番号 | 2 | low |
| O-EOL-SOFTWARE | 上の版が終了済みの系統（`eol.js`：PHP・Apache 2.2・IIS 6〜8.5）。「ヘッダーは◯◯系を示している。上流の保守は終了済み。配布元の延長保守・修正の適用はこの診断では確認できない」と書き、**番号が古くても修正済みのことがある**／**新しくても安全とは限らない**の両方向を示す。nginxは固定の終了日が確認できないので対象外 | 10 | high |
| O-MIXED-ACTIVE | HTTPSのページが`http://`のscript/css/iframeを読む | 15 | high |
| O-MIXED-PASSIVE | HTTPSのページが`http://`の画像を読む（観測が画像の件数だけなので、動画・音声は対象外。HtmlFactsに件数が無い） | 3 | low |
| O-SRI-MISSING | 別ホストのscript/cssに`integrity`がない（1つ以上） | 3 | low |
| O-VULN-LIB | 既知の脆弱性のある版を指すJSのURL（`libs.js`）。深刻度（CVSS 7以上=10点／4以上=6点／未満=3点）で引き、合計は最大15点。**同じライブラリ・同じ版・同じCVEは、配信元（CDN）が複数でも1回だけ数える**（配信元は根拠に1行でまとめる）。文言は「既知の脆弱性の影響範囲と一致する版表記を検出。実際の影響は未確認」 | 10/6/3 | high/medium/low |
| O-EOL-LIB | 上流のサポートが終了したJS（AngularJS 1.x＝2022-01以降、Vue 2＝2023-12-31以降） | 4 | medium |
| O-FORM-HTTP | HTTPSのページのフォーム送信先が`http://` | 10 | high |
| O-PASSWORD-HTTP | パスワード欄のあるページが`http://` | 25 | critical |
| O-DIR-LISTING | ディレクトリの一覧（`Index of /`）が見える | 10 | high |
| O-ERROR-DISCLOSURE | エラーの詳細（スタックトレース・SQL・ファイルパス）が画面に出ている | 8 | medium |
| O-DEFAULT-PAGE | サーバーの初期画面（`Welcome to nginx!`等） | 2 | low |
| O-DMARC-MISSING | 登録ドメインにDMARCがない | 2 | low |
| O-SPF-MISSING | 登録ドメインにSPFがない | 1 | low |
| O-DMARC-WEAK | DMARCが`p=none`、またはSPFが`+all`/`?all` | 1 | info |
| O-CORS-WILDCARD-CREDS | `Access-Control-Allow-Origin: *`と`Allow-Credentials: true`の同居 | 3 | low |
| O-DEPRECATED-HEADER | `X-XSS-Protection`有効・`Public-Key-Pins`・`Expect-CT`（点なし。外す案内） | 0 | info |
| O-STATUS-NOTE | 応答の状態が400以上。「エラー画面は、通常のページと設定が違うことがあります」。status=`info` | 0 | info |
| O-SECURITY-TXT | あれば`good`、なければ`info`（点なし） | 0 | info |
| O-HTTPS-OK・O-HSTS-OK・O-CSP-OK・O-FRAME-OK・O-XCTO-OK・O-REFERRER-OK・O-COOKIE-OK | それぞれ満たしたとき`good`（点なし） | 0 | info |
| O-UNKNOWN | 最終応答が取れず運営者の軸を出せない。status=`unknown` | 0 | info |

**段階の `unknown`**：最終応答が取れていない（`partial.trace === false`）で、点から決まる段階が `ok` のときは、`visitor.level = 'unknown'`（見出し「調べきれませんでした」）にする。目視だけで `note` 以上になるときは、その段階のまま。強い兆候（`amazon.co.jp.account-check.example` のようなもの）は、つながらなくても `danger`。
**ブランド名の照合に使わない語**：持ち株会社名（mitsui・mitsubishi・sumitomo）、一般語（kurashi・mileage）、短い語（au・line・jcb・etc・ana・jal・post・live・office・suica）は、ドメインの照合に使わない（ページ内容の照合は、ログイン/確認の文脈があるときだけ）。
**公式ドメインの免除は、一次資料を確かめたものだけ（独立レビューJ7）**：`brands.js` の `BRAND_DOMAIN_SOURCES` に、ドメインごとに `{source（一次資料のURLまたは research/R1 §A2）, checkedAt, confidence, userPublishing, purpose}` を記録する。`confidence:'high'` だけが公式の免除に使われ、`medium`（一次資料を見つけられない）は `UNVERIFIED_DOMAINS` に分けて免除しない。第三者がページを置けるドメイン（`amazonaws.com`・`cloudfront.net`など）は公式の表に入れない。
**転送先の見た目も評価する（独立レビューJ1）**：入力URLに加え、取得できた転送の途中・最終ページのホストにも `V-BRAND-SUBDOMAIN`・`V-BRAND-TYPO`・`V-BRAND-KEYWORD`・`V-HOMOGRAPH`・`V-SENSITIVE-WORDS`・`V-TLD-RISKY`・`V-LABEL-ODD`・`V-DEEP-SUBDOMAIN` を当てる。**同じidは全体で最大1件**（最大点のもの・そのfloor）で、根拠の先頭に「入力」「転送の途中」「最終ページ」と書く。入力固有のルール（`V-USERINFO`・`V-IP-HOST`・`V-LONG-URL`・`V-ENCODED`・`V-REDIRECT-PARAM`・`V-PUNYCODE`・`V-SHORTENER`）は転送先に当てない。短縮URLや公式サイトの `/url` から偽装先へ飛ばされても、直接入力した場合と同じ所見が出る。
**登録ドメインの境界は公開サフィックスリスト(PSL)の本物で引く（独立レビューJ3）**：`sakura.ne.jp`・`city.kawasaki.jp`・`s3.amazonaws.com` のように、別々の利用者が別の登録ドメインになる領域でも、`V-CROSS-FORM`・`V-REDIRECT-CROSS`・`V-META-REFRESH`・`V-HIDDEN-IFRAME`・`V-BRAND-SUBDOMAIN` が正しい境界で働く。PSLのPRIVATE区画（サービス運営者が利用者にサブドメインを配る領域）にあるホストは `userContentHost`＝`V-SHARED-HOST`（info）で、公式ドメインの免除は受けない。
**`RULE_CATALOG`**：`rules.js` が全ルールの `{id, axis, title, points, severity, floor, note}` を export する。画面の「点数の付け方」の元で、判定の実装が同じ表から点・重大度・floorを引く（表と実装が食い違わない）。

**セッションらしいCookie**：名前が `/sess|sid|auth|token|login|jwt|csrf|xsrf/i` に当たる。`_ga`・`_gid`・`_gcl`・`_fbp`・`__cf_bm`・`cf_clearance`は除く。
**重複を避ける**：`O-PASSWORD-HTTP`と`V-HTTP`は別の軸なので両方出してよい。`O-NO-HTTPS`のとき`O-HSTS-MISSING`など「HTTPSが前提」のルールは出さない。HTML以外の応答には`O-CSP-*`・`O-FRAME-*`・`O-REFERRER-*`・`O-SRI-*`を出さない。
**ブランド表**：公式ドメイン一致のホストには`V-BRAND-*`を付けない（`V-OFFICIAL-DOMAIN`だけ）。公式ドメインのサブドメイン（`m.amazon.co.jp`）も公式として扱う。
