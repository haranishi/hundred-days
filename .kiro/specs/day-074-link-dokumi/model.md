# データの契約

サーバーが返す観測（Trace・Around）、抽出した事実（HtmlFacts）、ブラウザの判定（Result）の形。
`lib/contract.js` の `validateTrace`・`validateAround`・`validateResult` が、ここに書いた形と上限を検査する。
値は**すべて信頼できない文字列**として扱う（取得先が決める）。上限は`LIMITS`で切る。

## Parsed（`parseInput` の戻り値）
```
{ ok:true, raw, original:string(取り出した1件), otherLinks:number, assumedScheme:boolean,
  href:string, scheme:'https'|'http', hostname:string(ASCII), hostUnicode:string, registrable:string, suffix:string, labels:string[],
  hasUserinfo:boolean, port:string, path:string, hasQuery:boolean, hasHash:boolean,
  fetch:{ allowed:boolean, reason:null|'userinfo'|'numeric_host'|'reserved_name'|'port'|'scheme'|'too_long'|'self', href:string|null },  // hrefは送るURL。既定は?と#を除く。includeQuery指定で?を含める
  hints:{ oneTime:string[] } }          // 一度しか使えなさそうなリンクの手がかり（該当した語）。空でなければ調べる前に確認を挟む
| { ok:false, reason:'empty'|'no_url'|'invalid'|'scheme'|'too_long', message:string }
```
スキームを省いた入力でも、制御文字（U+0000–001F・U+007F–009F）を含めば`invalid`、ホスト名（punycode後）が253字を超えれば`too_long`で断る（`ok:true`のまま後段の契約検査を落とさないため）。
メッセージ全文が貼られたら、最初のhttp(s)のリンクを`original`にし、残りの件数を`otherLinks`に入れる（末尾の句読点・括弧は外す）。`https://`が無ければ補い、`assumedScheme:true`。
`hints.oneTime`：クエリのキーが `token|code|key|sig|signature|auth|otp|ticket|session|sid|invite|reset|verify|confirm|hash` に当たる、または、パスに `verify|confirm|activate|reset|unsubscribe|optout|magic|invite|approve|accept` があり16字以上の乱数らしい区間（`[A-Za-z0-9_-]{16,}`）がある。

## LexicalFacts（`analyzeLexical(parsed)` の戻り値。通信なし・純関数）
```
{ host, hostUnicode, registrable, suffix, labels:string[], subdomainLabels:string[],     // subdomainLabels＝登録ドメインより左のラベル。境界は公開サフィックスリスト(PSL)の本物で決める
  isPublicSuffix:boolean,                                   // ホスト自身が公開サフィックス（co.jp・github.io）。そのとき registrable は自身
  section:'icann'|'private',                                // 採用されたPSLの規則の区画。'private'＝サービス運営者が利用者にサブドメインを配る領域（sakura.ne.jp・s3.amazonaws.com…）
  scheme:'https'|'http', port:string, urlLength:number,
  hasUserinfo:boolean, userinfoLooksLikeHost:boolean,       // `https://amazon.co.jp@evil.example/` のように左がドメインに見える
  isIpHost:boolean,
  isPunycode:boolean, mixedScript:boolean, confusableChars:string[],
  brand:{ official:null|{ id, name },                        // ホストが公式ドメイン（またはそのサブドメイン）
          subdomain:{ id, name, domain }[],                  // 公式ドメインが別の登録ドメインの手前に並ぶ
          typo:{ id, name, label, brandLabel, kind:'confusable'|'distance1' }[],
          keyword:{ id, name, keyword, where:'registrable'|'subdomain'|'path' }[] },
  sensitiveWords:string[], shortener:null|'third-party'|'official',
  freeHost:null|{ provider:string, domain:string },          // 誰でもサブドメインを取れるホスティング（既知の提供者、またはPSLのPRIVATE区画のサフィックス。「無料」とは限らない）
  userContentHost:boolean,                                   // 利用者がページを作れる場所：sites.google.com など公式ホストの一覧、またはPSLのPRIVATE区画。true のとき公式の免除・良い所見を出さない
  tld:string, tldRisky:boolean, hyphenCount:number, digitCount:number, labelOdd:boolean, subdomainDepth:number,
  encodedCount:number, doubleEncoded:boolean, hasNullByte:boolean,
  redirectParams:{ name:string, host:string }[],
  jpRestricted:null|'co.jp'|'or.jp'|'go.jp'|'ac.jp'|'ed.jp'|'lg.jp'|'ne.jp'|'ad.jp'|'gr.jp' }
```

## Trace（`GET /api/day-074/trace?url=…` の200の本体）
```
{ v:1, ok:boolean, requested:string, cached?:boolean,
  hops:[{ url, host, status(3xx), location:string|null, ms }],     // 転送だけ。最終応答は入れない
  final:null | { url, host, scheme:'https'|'http', status, contentType:string|null, contentLength:number|null,
    kind:'html'|'download'|'other', download:null|{ reason:'apk'|'executable'|'archive'|'attachment'|'binary', filename:string|null, ext:string|null },
    headers:{ [小文字の名前]:string },              // 許可リストだけ（下記）
    cookies:[{ name, secure, httpOnly, sameSite:'lax'|'strict'|'none'|null, hasDomain, path:string|null, persistent, prefix:'__Host-'|'__Secure-'|null }],
    ms, bytesRead, truncated },
  html:null | HtmlFacts,
  error:null | { code, stage:'validate'|'dns'|'connect'|'tls'|'read'|'redirect'|'timeout', host:string|null, detail:string|null },
  notes:string[], elapsedMs:number }
```
`error.code`：`invalid_url`・`blocked_target`・`blocked_redirect`・`resolver_unavailable`・`dns_failed`・`connect_failed`・`tls_failed`・`timeout`・`too_many_redirects`・`blocked_by_challenge`（`cf-mitigated`・ボット対策の画面）・`upstream_error`。
HTTPの状態は、取り扱った結果は200、入力が不正は400、同一生成元でないは403、レート超過は429（`Retry-After`）、想定外は500。

**ヘッダーの許可リスト**：`strict-transport-security`・`content-security-policy`・`content-security-policy-report-only`・`x-frame-options`・`x-content-type-options`・`referrer-policy`・`permissions-policy`・`cross-origin-opener-policy`・`cross-origin-embedder-policy`・`cross-origin-resource-policy`・`access-control-allow-origin`・`access-control-allow-credentials`・`server`・`x-powered-by`・`x-aspnet-version`・`x-generator`・`x-xss-protection`・`public-key-pins`・`expect-ct`・`content-type`・`content-disposition`・`content-length`・`cache-control`・`cf-mitigated`・`location`。値は600字まで（CSPは4000字）。

## HtmlFacts
```
{ title, h1, siteName, lang, generator:string|null, textSample:string(≤400),
  metaRefresh:null|{ delay:number, url:string|null }, baseHref:string|null,
  forms:[{ method:'get'|'post', action:string, actionHost:string|null, hasPassword, hasEmail, hasCardLike, hasFileUpload, fieldCount, hidden }],
  passwordFields:number,
  scripts:{ total, inline, external:[{ src, host:string|null, scheme, sri, async, defer, module }] },
  styles:{ total, inline, external:[{ href, host, scheme, sri }] },
  iframes:[{ src, host, scheme, hidden, sandbox }],
  images:{ total, http }, links:{ total, external, externalHosts:string[≤10], http },
  signals:{ directoryListing, defaultPage:null|'nginx'|'apache'|'iis'|'litespeed'|'other',
    errorDisclosure:null|'php'|'python'|'java'|'dotnet'|'sql'|'node'|'generic',
    obfuscation:('eval-atob'|'unescape-write'|'hex-array'|'charcode-chain'|'long-base64')[≤5],
    autoSubmit, noindex, metaReferrer:string|null, metaCsp:boolean },
  truncated:boolean }
```
`scheme` は `'https'|'http'|'relative'|'protocol-relative'|'data'|'other'`。文字列は制御文字を除き、`LIMITS`で切る。

## Around（`GET /api/day-074/around?host=…&scheme=…[&site=0]`）
`site=0` は、診断先に取得を断られた（403・429・ボット対策）あとに画面が付ける。診断先への追加のアクセス（`http://`側・`/.well-known/security.txt`）を省き、`httpProbe={tested:false,reason:'skipped'}`・`securityTxt={unavailable:'skipped'}`・（HTTP入力のとき）`httpsProbe={tested:false}` を返す。DNSと登録日は公開サービスへの問い合わせなので続ける。
```
{ v:1, host, registrable, scheme,
  dns:{ a:string[≤4], aaaa:string[≤4], resolvedPublic:boolean, dnssec:boolean|null, caa:boolean|null, mx:boolean|null,
        spf:{ present, all:'-all'|'~all'|'?all'|'+all'|null, value:string|null }, dmarc:{ present, policy:'none'|'quarantine'|'reject'|null, value:string|null } }
      | { unavailable:string },
  rdap:{ registeredAt:ISO, expiresAt:ISO|null, ageDays:number, registrar:string|null, source:string } | { unavailable:'unsupported'|'not_found'|'timeout'|'error' },
  httpProbe:{ tested:true, status:number|null, location:string|null, upgradesToHttps:boolean } | { tested:false, reason:string },
  httpsProbe:{ tested:true, reachable:boolean, status:number|null, error:string|null } | { tested:false },   // finalがhttpのときだけ
  securityTxt:{ found:boolean, status:number|null, hasContact:boolean, expires:ISO|null, expired:boolean } | { unavailable:string },
  error:null|{ code, detail }, elapsedMs:number }
```

## Result（`evaluate` の戻り値）
```
{ v:1,
  target:{ input:string, href:string, host:string, hostUnicode:string, registrable:string, finalUrl:string|null, finalHost:string|null,
           chain:[{ url, host, registrable, scheme, status:number|null, role:'input'|'redirect'|'final' }] },
  visitor:{ level:'ok'|'note'|'warn'|'danger'|'unknown', points:number, headline:string, summary:string, actions:string[≤3], reasons:string[≤3] },
  owner:{ score:number|null, grade:'A'|'B'|'C'|'D'|'F'|null, note:string, provisional:boolean,   // provisional＝守りの点数に効く周辺の事実（メールの設定・HTTPからの転送）が欠けていて暫定
          topFixes:[{ id, gain:number }≤3 ] },
  findings:Finding[],
  limits:string[],                 // 見ていないこと（固定の文＋その回で取れなかったもの）
  partial:{ trace:boolean, around:boolean },   // trueなら取れた
  evaluatedAt:ISO }
Finding = { id, axis:'visitor'|'owner', status:'bad'|'good'|'info'|'unknown', severity:'info'|'low'|'medium'|'high'|'critical',
  points:number, floor:null|'warn'|'danger',        // 訪問者の段階の下限
  title, what, why, fix:string|null, evidence:string[≤3], snippet:null|{ label, headers?:string, nginx?:string, apache?:string } }
```
並び順：軸 → status（bad, unknown, info, good）→ 重大度の高い順 → 点の大きい順。
`points`：訪問者の軸は足される危険の点、運営者の軸は引かれる点（どちらも0以上）。

## 段階と点
- 訪問者：合計点 0–2 → `ok`、3–5 → `note`、6–9 → `warn`、10以上 → `danger`。`floor`があれば、その段階より下げない。通信が全く取れなければ、目視の点だけで段階を決め、`partial.trace=false` の旨を`summary`に書く。
- 運営者：`score = max(0, 100 − 引かれる点の合計)`。`A ≥ 90`・`B ≥ 75`・`C ≥ 60`・`D ≥ 40`・`F < 40`。`trace`が無ければ`score:null`・`grade:null`。
- `topFixes`：直すと戻る点（`gain`）の大きい順に3つ。同点は重大度の高い順。
