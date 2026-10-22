# B（観測）受領書

2026-10-22。指定範囲の観測処理とオフライン試験を実装した。依存導入・実通信・ブラウザ起動・Git書込みは行っていない。

## ファイルと公開関数

- lib/sanitize.js: clip, hostOf, schemeOf
- lib/target-guard.js: validateTarget, isNumericHost, isPublicIp
- lib/doh.js: dohQuery, resolvePublicHost, queryTxtRecords, queryMailFacts
- lib/rdap.js: fetchRegistration
- lib/cookies.js: parseSetCookies
- lib/html-facts.js: extractHtmlFacts, decodeHtml
- lib/observe.js: runTrace, runAround
- lib/handlers.js: handleTrace, handleAround, jsonResponse
- functions/api/day-074/trace.js / around.js: onRequestGet, onRequest
- tests/observer-{guard,html,network,handlers}.test.mjs、observer.index.mjs
- この受領書とnotes_B.md。libとtestsはday-074-link-dokumi/配下。

契約・fixture・仕様・ルート設定・他担当のコードは変更していない。

## 検証の証拠

- node --test day-074-link-dokumi/tests/observer.index.mjs: **132件、132合格、失敗0**。
- node --test day-074-link-dokumi/tests/: **487件、487合格、失敗0**。うちB担当132件が入口から実行された。
- node --check: 担当の実装10ファイル・試験/入口5ファイル、計15ファイル合格。
- 攻撃URL52本すべてvalidateTargetで拒否、runTraceのfetch呼出し0回。拒否9種を個別に無効化する補助変異試験が、各変異を検出。
- IPv4の指定15範囲の先頭・末尾・隣接境界、IPv6の指定範囲、mapped/NAT64/6to4と壊れた入力を検証。
- 私設DNS答え5種、私設転送先5種、6回目の転送・転送ループ・リゾルバ全失敗を検証。
- 160KiB敵対的HTMLの3種類: 最終全体実行ではangle 3.62ms、attribute 0.99ms、script 2.30ms。各50ms未満。これはNodeでの処理時間で、Workers CPU 10msの実測ではない。
- 無限本文は復号済みバイト列160KiBで打切り。fetch/DNS/本文の停止は注入した15ms/30msの期限で終了。周辺観測の停止も部分結果で終了。
- UTF-8/Shift_JIS/EUC-JP、抽出配列上限、Cookie値の破棄、64KiB応答、13回目の429、キャッシュ期限、RDAP24時間、同一isolate内の並行レート更新、コンソール出力なしを検証。
- ログはローカル一時ファイルday074-B-observer.txt / day074-B-tests.txtに置いた。先行する全体実行に他担当V-REDIRECT-PARAMの文言試験1件の失敗があったが、他担当の更新後の最終実行では解消している。

## 取得するURLの種類

対象URLと検査済みの転送先、http://host/、https://host/、https://host/.well-known/security.txt、DoHの名前照会、RDAPのみ。周辺プローブとsecurity.txtの転送先は追わない。RDAPは指示どおり自動転送を許すため、onRequestはRDAP開始URLを記録し、fetch内部の転送は観測できない。

robots.txt、.env、.git、admin、wp-login.php、別ポートへの探索を追加していない。

## メインが把握・判断すべき点

1. 指示は「制御文字除去」と「改行/タブ入りURLは接続0回」の両方を要求する。前後の空白を除いた入力に制御文字が残る場合はinvalidで拒否し、URL内部の改行/タブを除去して別URLへ接続する挙動は避けた。
2. 薄い入口のonRequestを常に405にするとGETも先に拒否し得るため、onRequestはGETをonRequestGetへ渡し、その他を405にした。
3. サイズ超過時はnotesにtrimmedを付け、抽出配列、Cookie、経路の順に削る。なお超える場合は許可済みヘッダーを大きいものから落とす。契約の形と64KiBを守るためであり、画面ではtrimmedの注記を扱ってほしい。
4. Aroundの契約はok/cachedを持たないため、ガード拒否はerrorで返し、RDAPキャッシュは内部だけで使う。Aroundにcached:trueは足していない。
5. rdap.orgの404だけからTLD未対応と登録なしを区別できない。指示の方針に沿い、Verisignの404はnot_found、その他はunsupportedとしている。
6. Cache APIのレート制限はデータセンター・isolateを跨いで原子的ではない。同一isolate内の更新は直列化したが、世界全体の厳密な上限にはならない。
7. DoHの確認後と実fetchの名前解決先の一致は保証できない。仕様にあるDNS切替の残存リスクは解消していない。
8. DNSのSPF/DMARCがSERVFAIL等の場合は不在とせず、契約上のdns.unavailableにまとめている。部分的なDNS結果を細かく返すには契約拡張が必要。

## 未実施

指示に従い、workerd/Cloudflare実機、実在サイトでの診断、実TLS例外と応答分類、ブラウザ/E2E、公開ゲート、リポジトリ全体のビルドは未実施。公開工程はメインに残る。Workers CPU時間と実行枠、実環境のCache API/getSetCookie、PagesのGET/非GET入口、停止スイッチ、DNS切替の扱いは実機で確認が必要。
