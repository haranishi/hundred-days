# 設計：リンクの毒見

## 構成
```
ブラウザ（day-074-link-dokumi/）                      Cloudflare Pages Functions
  parseInput ─┐                                         GET /api/day-074/trace?url=…   … 転送をたどり、最終応答を読む
  analyzeLexical（通信なし）→ すぐ表示                    GET /api/day-074/around?host=…&scheme=… … DNS・登録日・http転送・security.txt
  fetch trace ──────────────────────────────────────────▶ 受け身の観測だけ。判定はしない
  fetch around（転送先のホストで）──────────────────────▶
  evaluate({parsed, lexical, trace, around, failure}) → Result → 描画（textContentのみ）
```
**サーバーは観測、ブラウザが判定。** 判定はブラウザ側の純関数なので、Nodeの単体テストで全ルールを固定できる。
サーバーは観測だけなので、CPU時間（無料枠は1回10ms）を判定に使わない。

## ファイル
```
day-074-link-dokumi/
  index.html  app.css  app.js            画面（ES module。インラインscript/styleなし）
  meta.json  README.md  og.png  favicon.svg
  shared/                                 共通の共有欄（npm run shared:sync が複製）
  lib/
    contract.js     定数(LIMITS)・列挙・validateTrace/Around/Result
    url-input.js    extractUrl・parseInput（全角/省略/メッセージ全文から最初のリンク）
    punycode.js     RFC3492のtoUnicode
    psl.js          registrableDomain（公開サフィックスリストの本物。データは psl-data.js）
    lexical.js      analyzeLexical → facts（通信なし）
    brands.js       ブランド表・照合（公式ドメイン/キーワード/つづり）
    lists.js        短縮URL・無料ホスティング・弱い目安のTLD・紛らわしい文字
    headers.js      CSP/HSTS/Cookieの解析と評価
    libs.js         古いJSライブラリの版の取り出しと既知の脆弱性表
    eol.js          Server/X-Powered-Byのソフトの終了日表
    rules.js        evaluate（facts→所見）
    score.js        段階・点数・A〜F
    messages.js     所見の題・理由・直し方・設定例・行動・限界（日本語）
    report.js       平文の報告・家族向けの短い要約
    resources.js    報告先・相談先・外部の診断サービスのリンク（オブジェクトのリテラルで書く）
    samples.js      見本3つ（通信なしの観測データ）
    observe.js      サーバー側の観測（trace/around）。fetch・DNS・時計は注入
    target-guard.js 宛先の検査（数値ホスト・予約名・私設IP・DNS）
    doh.js  rdap.js  html-facts.js  cookies.js
    handlers.js     Request→Response（同一生成元・レート・キャッシュ・JSON）
  tests/  index.mjs  *.test.mjs  fixtures/*.json
functions/api/day-074/trace.js  around.js   薄い入口（handlers.jsを呼ぶだけ）
tests/e2e/day-074.spec.mjs
```
`lib/` の関数はNodeでもブラウザでもworkerdでも動く素のESM。依存パッケージは入れない。

## モジュールの署名と持ち主
| 持ち主 | ファイル | 署名 |
|---|---|---|
| メイン | `contract.js`・`tests/fixtures/*.json`・仕様 | `LIMITS`・列挙・`validateTrace/Around/Result/HtmlFacts`。契約を変える必要が出たら、持ち主以外は直さず報告する |
| A1（住所） | `url-input.js` | `extractUrl(raw) → {url, otherLinks}`・`parseInput(raw, {includeQuery}) → Parsed` |
| | `punycode.js` | `toUnicode(label)`・`toUnicodeHost(host)` |
| | `psl.js`・`psl-data.js` | `registrableDomain(host) → {registrable, suffix, labels, subdomainLabels, isPublicSuffix, section:'icann'｜'private'}`。公開サフィックスリスト(PSL, MPL-2.0)の本物を `tools/gen-psl.mjs` で整理したデータ（約115KB、gzip約36KB）で、PSL公式のアルゴリズム（例外＞最長一致＞既定の`*`）どおりに引く。TLDごとに最初に引かれたときだけ規則を展開する（無料枠のCPU対策）。`section:'private'`＝サービス運営者が利用者にサブドメインを配る領域（`sakura.ne.jp`・`github.io`・`s3.amazonaws.com`など）で、`userContentHost`の根拠になる。公式の試験データ78件で検証 |
| | `lists.js` | `SHORTENERS`・`FREE_HOSTS`・`RISKY_TLDS`・`SENSITIVE_WORDS`・`CONFUSABLES`・`REDIRECT_PARAM_NAMES`（データのみ。根拠は`research/`） |
| | `brands.js` | `BRANDS`・`findOfficialBrand(host, registrable)`・`matchBrands(lexicalParts)`・`brandKeywordsInText(text) → {id,name,keyword}[]` |
| | `lexical.js` | `analyzeLexical(parsed) → LexicalFacts` |
| A2（判定） | `headers.js` | `parseCsp`・`evaluateCsp`・`parseHsts`・`classifyCookies`・`isSessionLikeCookie`・`headerFindings(final, htmlFacts)` |
| | `libs.js` | `detectLibs(scriptRefs) → {lib, version, advisory[]}[]`・`compareVersions` |
| | `eol.js` | `detectEol(headers, now) → {product, series, eolDate}[]` |
| | `rules.js` | `evaluate({parsed, lexical, trace, around, now, failure}) → Result`（`trace`/`around`は`null`可。`failure`＝'rate_limited'｜'server_error'｜'network' は、こちら側の都合で調べられなかったとき。相手のサイトの問題として書かない）・`RULE_CATALOG`（全ルールの点・重大度・floor。画面の「点数の付け方」の元） |
| | `score.js` | `visitorLevel(points, floors)`・`ownerScore(findings)`・`gradeOf(score)` |
| | `messages.js` | `MESSAGES[id] = {title, why, fix?, snippet?}`・`LIMITS_TEXT`・`ACTIONS[level]`・`HEADLINES[level]` |
| | `report.js` | `buildReport(result, {now, sample}) → string`・`buildSummary(result, {now, sample}) → string`（`?`・`#`以降の除去・1行化・押せない形のURL・見本の注記） |
| | `resources.js` | `CONSULT_LINKS`・`EXTERNAL_CHECKS`（URLを渡して開く先。押したときだけ） |
| | `samples.js` | `SAMPLES = [{id, label, url, trace, around}]`（実在しないドメイン） |
| B（観測） | `target-guard.js` | `validateTarget(raw, {selfHosts}) → {ok, url, reason}`・`isPublicIp(ip)`・`isNumericHost(host)` |
| | `doh.js` | `dohQuery(name, type, {fetchImpl, signal}) → {status, ad, answers}`・`resolvePublicHost(host, deps) → {ok, addresses, reason}` |
| | `rdap.js` | `fetchRegistration(registrable, {fetchImpl, signal}) → {registeredAt,…}\|{unavailable}` |
| | `html-facts.js` | `extractHtmlFacts(html, baseUrl) → HtmlFacts`（線形時間・上限つき） |
| | `cookies.js` | `parseSetCookies(list) → cookie[]` |
| | `observe.js` | `runTrace(rawUrl, deps) → Trace`・`runAround({host, scheme}, deps) → Around`（例外を投げず、失敗はerrorで返す） |
| | `handlers.js` | `handleTrace(request, ctx)`・`handleAround(request, ctx)`（`ctx = {env, fetchImpl, cache, now, waitUntil}`） |
| | `functions/api/day-074/trace.js`・`around.js` | `onRequestGet(context)` だけの薄い入口 |
| UI | `index.html`・`app.css`・`app.js`・`favicon.svg`・`og.png`・`README.md` | 上の署名と、`design.md`の画面のフック |

## 定数（`lib/contract.js` の `LIMITS`）
`MAX_URL_LENGTH 2048`・`MAX_REDIRECTS 5`・`BODY_CAP_BYTES 65536`・`TRACE_TIMEOUT_MS 12000`・`HOP_TIMEOUT_MS 7000`・`AROUND_TIMEOUT_MS 6000`・`AUX_TIMEOUT_MS 3500`・`RATE_PER_MINUTE 12`・`CACHE_TTL_S 300`・`MAX_FORMS 10`・`MAX_SCRIPTS 40`・`MAX_STYLES 20`・`MAX_IFRAMES 10`・`MAX_COOKIES 20`・`MAX_TAGS 6000`・`MAX_RESPONSE_BYTES 65536`。
画面の文面にこの数字を書くときは、`LIMITS` から作る（食い違いを防ぐ）。

## サーバー（観測）
1. `validateTarget` → 名前の検査 → `resolvePublicHost`（DoHでA/AAAAを引き、**1つでも**公開でないアドレスがあれば拒否）。DoHが両方失敗したら**閉じる**（`resolver_unavailable`）。
2. GETを送る。`redirect:'manual'`。ヘッダー `User-Agent: LinkDokumi/1.0 (+https://hundred-days.pages.dev/day-074-link-dokumi/#fetcher)`、`Accept`、`Accept-Language: ja,en;q=0.7` だけ。Cookie・Referer・Originは付けない。
3. 3xxなら`Location`を新しい宛先として1から検査（ホストごとのDNS検査もやり直す）。5回を超えたら`too_many_redirects`。
   **失敗の分類**：Workersの`fetch`は、証明書エラーも名前が引けない場合も同じ`Error: internal error`を投げ、メッセージで区別できない（実測）。名前が引けないことはDoHで先に決める（`dns_failed`）。DoHで引けたのにHTTPSのfetchが投げたら、同じホストの`http://`へ1回だけ取りに行き、応答があれば`tls_failed`、なければ`connect_failed`。時間切れは`timeout`。
4. 最終応答：許可リストのヘッダーだけ取り出す（`LIMITS`で値を切る）。`Set-Cookie`は名前と属性だけ（値は捨てる）。HTMLなら先頭64KiBを読み、`html-facts`で事実に落とす。HTML以外は本文を読まず`cancel()`。
5. 返すJSONは `MAX_RESPONSE_BYTES` 以下。超えるなら配列を削る。
6. `around`：転送先のホストについて、DNS（A/AAAA/TXT:SPF・_dmarc/CAA/DNSSEC）、RDAP登録日、`http://`の転送、`/.well-known/security.txt` を**並列**に取る。各々に`AUX_TIMEOUT_MS`。失敗は`unavailable`として返し、全体は200で返す。RDAPは登録ドメインごとに24時間キャッシュ（`.com`/`.net`はVerisign、ほかは`rdap.org`。先頭で取れない場合は`unavailable`）。DoHへ渡すのは名前だけで、パス・クエリは渡さない。
7. キャッシュ・レート制限の鍵はURLや`CF-Connecting-IP`をそのまま使わず、SHA-256のハッシュにする。ログ（`console`）にURL・IP・ホストを出さない。

## ブラウザ
- `app.js` は状態（phase）を持つ薄い制御だけ。描画は取得文字列を**必ず`textContent`**で入れる。`innerHTML`・`insertAdjacentHTML`・`outerHTML`・`document.write`・`eval`・`new Function`を使わない（単体テストでソースを走査して固定）。
- 流れ：`parseInput`→（`hints.oneTime`があれば確認を挟む。`#one-time-notice`・`#one-time-continue`。選ぶまで通信しない）→`analyzeLexical`→（先に）見た目の結果を出す→`trace`→経路と所見を足す→`around`→全部そろえて`evaluate`。どの段が失敗しても`evaluate`はその分を`unknown`にして進む。
- 呼び出しは `fetch('/api/day-074/trace?url=…')` のように**同一オリジンの相対パス**だけ。外部ホストへ接続しない。
- 外部の診断サービスへのリンクは、利用者が押したときに別タブで開くだけ（`rel="noopener noreferrer"`）。URLは`lib/resources.js`にオブジェクトのリテラルで書く（`const X = 'https://…'` と書くと、横断のCSP検査が「接続先」と読む）。
- 何も保存しない（localStorage・sessionStorage・IndexedDB・Cookieを使わない）。

## 画面のフック（E2Eが使う）
`#app[data-phase]`・`#url-input`・`#check-button`・`#paste-button`・`#include-query`・`.sample-chip[data-sample]`・`#progress li[data-step][data-state]`・`#verdict[data-level]`・`#verdict-headline`・`#verdict-actions li`・`#target-chip`・`#path li[data-hop]`・`#axis-tabs [role=tab][data-axis]`・`#panel-visitor`・`#panel-owner`・`.finding[data-id][data-status][data-severity]`・`#owner-score`・`#owner-grade`・`#owner-fixes`・`#limits`・`#copy-report`・`#copy-summary`・`#again`・`#live[aria-live]`。セクション見出しのid：`#how`・`#privacy`・`#fetcher`。

## 統合
- `meta.json`（day 74・published・`publicUrl`・`screenshot: og.png`）、`README.md`、`npm run index:sync`。
- `THIRD_PARTY_NOTICES.md`：外部のコード・データ・書体を同梱しない（ブランド表は事実の一覧。出典は`research.md`）。
- `functions/README.md` に74の行、`docs/security.md` に「第三者のURLを取りに行くAPI」の節（脅威と運用）。
- `scripts/build.mjs`：外部接続なし＝`CONNECT_BY_APP`は足さない。ビルドが`lib/`を配信することを確認する。
- `tests/e2e/security-headers.spec.mjs`：本アプリの外部リンクが`const X = 'https://…'`の形を取らないので変更不要。取る形があれば`TEXT_ONLY_URLS`へ（理由つき）。
