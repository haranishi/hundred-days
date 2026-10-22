# A2 受領書

2026-10-22。担当範囲の実装とオフライン検証を完了。

## 作成・編集したファイルと公開API
- day-074-link-dokumi/lib/headers.js: parseCsp / evaluateCsp / parseHsts / isSessionLikeCookie / classifyCookies / headerFindings
- day-074-link-dokumi/lib/libs.js: compareVersions / detectLibs
- day-074-link-dokumi/lib/eol.js: detectEol
- day-074-link-dokumi/lib/rules.js: evaluate
- day-074-link-dokumi/lib/score.js: visitorLevel / ownerScore / gradeOf
- day-074-link-dokumi/lib/messages.js: MESSAGES / HEADLINES / ACTIONS / LIMITS_TEXT / BANNED_PHRASES
- day-074-link-dokumi/lib/report.js: buildReport / buildSummary
- day-074-link-dokumi/lib/resources.js: CONSULT_LINKS / EXTERNAL_CHECKS
- day-074-link-dokumi/lib/samples.js: SAMPLES
- day-074-link-dokumi/tests/judge-headers.test.mjs
- day-074-link-dokumi/tests/judge-rules.test.mjs
- day-074-link-dokumi/tests/judge.index.mjs（上記2ファイルをimportで登録）
- この受領書とnotes_A2.md

## 検証の証拠
- node --test day-074-link-dokumi/tests/judge.index.mjs: A2の169件すべて成功、失敗・skipなし。
- node --test day-074-link-dokumi/tests/: 全体487件すべて成功、失敗・skipなし。他担当の並行追加分を含む。内訳はA2が169件、その他318件。
- 開始時の全体は8件。途中で他担当も追加したため、全体の増分をA2の件数とは扱っていない。
- 全Trace × 全Around（それぞれnullを含む）72組で例外なし・validateResult成功・禁止語なし。
- 全71idに文面があり、実際にevaluateから出たidの集合と仕様のid集合が一致。
- 3見本のtrace/aroundはfixtureとdeepEqual。予約済み.exampleのみ、見本の表記あり。
- 点数・floor・HSTS・RDAP ageDays・CVE範囲・EOL日付・公式/紹介記事の抑制・非HTML対象外・Cookie推定/除外・CSP実効・失敗時の所見を確認。
- 9モジュールと3テスト関連ファイル、合計12ファイルをnode --checkで確認、構文エラーなし。
- 新規ファイルはテキストのみ。画像等の追加なし。データは指定された調査表とfixtureを使用し、依存導入・外部取得は行っていない。

## 設定例の確認方法
judge-rules.test.mjsの「文面と設定例」で5種類の値を担当指示とR2 §Fに照合した固定値と厳密比較。nginxはadd_header … always;、ApacheはHeader always set …。HSTSはmax-age=63072000、CSPはdefault-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'、XFOはDENY、XCTOはnosniff、Referrer-Policyはstrict-origin-when-cross-origin。CSPにはアプリごとの調整が要る文を付けた。Webサーバー実機での設定適用は行っていない。

## 仕様の曖昧さ・メインが把握すべき扱い
- design.mdのlib検出結果はadvisory[]表記、担当指示はadvisories[]。より具体的な担当指示に従いadvisoriesを採用。
- 自サイトの絶対URLと任意の外部ホストのファイルを区別するため、detectLibs(scriptRefs, {selfHost})という省略可能な第2引数を追加。evaluateは最終ホストを渡す。第1引数だけでも正式CDNと相対ローカルパスを検出する。CDN名の部分一致や任意の外部ホストの版付きファイル名は採用しない。
- Apache 2.2は出典が2017-12までの月精度。eolDateも2017-12とし、12月を過ぎたときから終了扱い。架空の終了日を表示しない。
- HSTSの弱い境界はrules.mdの15,552,000秒を採用。R2にあるMozillaの15,768,000秒とは意図的に区別。
- 非HTML応答は運営者の採点対象外としてscore/gradeをnull、owner所見なし。未取得とは区別してlimitsとowner.noteに対象外と明記。モデルはnullを許すが、対象外時のUI表示はメイン側で確認が必要。
- 不正なCookie prefix/None属性はclassifyCookies.invalidへ分類。rules.mdに独立の減点規則がないため、勝手に追加せずlimitsに観測した違反を記す。Secure不足の減点は指示どおりHTTPSに限定。
- CSPはscript-src/default-srcの簡易評価。複数ポリシーの交差適用やscript-src-elem/attrを含む完全な実効防御は再現しない。この限界を常設文面に記載。
- SSL Labs/urlscanはverified:trueだが、入力/検索ページへの到達確認と診断完了の未確認をnoteで区別。未確認のGoogle/VirusTotal/MDNはverified:false。Google状態確認は相談先リストから除き、未検証リンクの表示制限を迂回させない。
- partial.aroundは全体errorのないAroundオブジェクトを受け取れたか。一部の補助取得の失敗は各limitsとsummaryで伝える。
- trace失敗時はO-UNKNOWNだけを運営者へ返す。訪問者は目視のみで、TLS失敗だけは仕様のV-TLS-FAILとして併記。失敗時のRDAP情報や転送経路を追加加点に使わない。
- chainはtrace.hopsとfinalをそのまま順に構成。無転送時はfinalだけ、通信結果なしはinputだけとし、同じURLの架空の転送を作らない。

## 未実施・変更しなかったもの
- 指示に従い、ネットワーク・ブラウザ・依存導入・commit/push/PRを実施していない。
- ビルド・公開ゲート・UI/E2E・実観測・独立レビューはこの担当の範囲外。メイン側で必要な統合確認を行う。
- contract.js、fixture、tests/index.mjs、仕様、他担当の実装、リポジトリ直下設定は編集していない。契約変更の要請なし。
- testsはparsedとLexicalFactsを手書きし、ブランド・公式判定・登録ドメイン判定をdepsで注入。A1の実装結果を試験の期待値に使っていない。

## 全ルールの実装状況
各idは実装・文面・試験の到達を確認済み。

| id | 状況 |
|---|---|
| V-USERINFO | 実装・文面・試験済み |
| V-IP-HOST | 実装・文面・試験済み |
| V-HOMOGRAPH | 実装・文面・試験済み |
| V-PUNYCODE | 実装・文面・試験済み |
| V-BRAND-SUBDOMAIN | 実装・文面・試験済み |
| V-BRAND-TYPO | 実装・文面・試験済み |
| V-BRAND-KEYWORD | 実装・文面・試験済み |
| V-BRAND-CONTENT | 実装・文面・試験済み |
| V-SENSITIVE-WORDS | 実装・文面・試験済み |
| V-SHORTENER | 実装・文面・試験済み |
| V-TLD-RISKY | 実装・文面・試験済み |
| V-LABEL-ODD | 実装・文面・試験済み |
| V-DEEP-SUBDOMAIN | 実装・文面・試験済み |
| V-LONG-URL | 実装・文面・試験済み |
| V-ENCODED | 実装・文面・試験済み |
| V-REDIRECT-PARAM | 実装・文面・試験済み |
| V-HTTP | 実装・文面・試験済み |
| V-TLS-FAIL | 実装・文面・試験済み |
| V-REDIRECT-CROSS | 実装・文面・試験済み |
| V-HTTPS-DOWNGRADE | 実装・文面・試験済み |
| V-NEW-DOMAIN | 実装・文面・試験済み |
| V-CROSS-FORM | 実装・文面・試験済み |
| V-META-REFRESH | 実装・文面・試験済み |
| V-HIDDEN-IFRAME | 実装・文面・試験済み |
| V-OBFUSCATION | 実装・文面・試験済み |
| V-DOWNLOAD-APK | 実装・文面・試験済み |
| V-DOWNLOAD-EXEC | 実装・文面・試験済み |
| V-DOWNLOAD-ARCHIVE | 実装・文面・試験済み |
| V-UNREACHABLE | 実装・文面・試験済み |
| V-BLOCKED-FETCH | 実装・文面・試験済み |
| V-OFFICIAL-DOMAIN | 実装・文面・試験済み |
| V-JP-RESTRICTED | 実装・文面・試験済み |
| V-OLD-DOMAIN | 実装・文面・試験済み |
| O-NO-HTTPS | 実装・文面・試験済み |
| O-NO-UPGRADE | 実装・文面・試験済み |
| O-HSTS-MISSING | 実装・文面・試験済み |
| O-HSTS-WEAK | 実装・文面・試験済み |
| O-CSP-MISSING | 実装・文面・試験済み |
| O-CSP-WEAK | 実装・文面・試験済み |
| O-FRAME-MISSING | 実装・文面・試験済み |
| O-XCTO-MISSING | 実装・文面・試験済み |
| O-REFERRER-MISSING | 実装・文面・試験済み |
| O-COOKIE-SECURE | 実装・文面・試験済み |
| O-COOKIE-HTTPONLY | 実装・文面・試験済み |
| O-COOKIE-SAMESITE | 実装・文面・試験済み |
| O-VERSION-DISCLOSURE | 実装・文面・試験済み |
| O-EOL-SOFTWARE | 実装・文面・試験済み |
| O-MIXED-ACTIVE | 実装・文面・試験済み |
| O-MIXED-PASSIVE | 実装・文面・試験済み |
| O-SRI-MISSING | 実装・文面・試験済み |
| O-VULN-LIB | 実装・文面・試験済み |
| O-EOL-LIB | 実装・文面・試験済み |
| O-FORM-HTTP | 実装・文面・試験済み |
| O-PASSWORD-HTTP | 実装・文面・試験済み |
| O-DIR-LISTING | 実装・文面・試験済み |
| O-ERROR-DISCLOSURE | 実装・文面・試験済み |
| O-DEFAULT-PAGE | 実装・文面・試験済み |
| O-DMARC-MISSING | 実装・文面・試験済み |
| O-SPF-MISSING | 実装・文面・試験済み |
| O-DMARC-WEAK | 実装・文面・試験済み |
| O-CORS-WILDCARD-CREDS | 実装・文面・試験済み |
| O-DEPRECATED-HEADER | 実装・文面・試験済み |
| O-SECURITY-TXT | 実装・文面・試験済み |
| O-HTTPS-OK | 実装・文面・試験済み |
| O-HSTS-OK | 実装・文面・試験済み |
| O-CSP-OK | 実装・文面・試験済み |
| O-FRAME-OK | 実装・文面・試験済み |
| O-XCTO-OK | 実装・文面・試験済み |
| O-REFERRER-OK | 実装・文面・試験済み |
| O-COOKIE-OK | 実装・文面・試験済み |
| O-UNKNOWN | 実装・文面・試験済み |
