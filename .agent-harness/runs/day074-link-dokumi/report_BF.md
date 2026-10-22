# BF（観測側の手直し）受領書

2026-10-22。指定された観測側だけを変更。依存導入、実通信、ブラウザ、Git書込みは行っていない。contract.js、fixtures、tests/index.mjs、仕様、UI、ルート設定は変更していない。

## 変更ファイルと公開関数

- `day-074-link-dokumi/lib/html-facts.js`: `extractHtmlFacts`, `decodeHtml`（署名の変更なし）。属性とbase64を文字コードで走査、引用値はindexOf、実体参照なしのreplaceを省略。可視文・捕捉文のsliceを上限までに限定。無関係タグの属性を解析せず、基準ホストとURLオブジェクトを再利用。全文小文字化はscript/styleの閉じタグ探索が必要になったときだけ。
- `day-074-link-dokumi/lib/observe.js`: `runTrace`, `runAround`（署名の変更なし）。本文量は既存のLIMITS.BODY_CAP_BYTESを使用し、上限時にhtml/final.truncatedとnotes.body_truncatedを記録。HTTPSのfetch例外だけで同一ホストのHTTPルートを1回取得（purpose:tls-fallback、manual、本文cancel、同じホップと全体の残り期限）。HTTP応答ありはtls_failed/http_responds、応答なしはconnect_failed/no_response、時間切れはtimeout。メッセージからTLS/DNSを推測しない。転送先のdns_failedとresolver_unavailableはそのまま保ち、blocked_targetだけblocked_redirectへ変換。
- `day-074-link-dokumi/lib/handlers.js`: `handleTrace`, `handleAround`, `jsonResponse`。LINK_DOKUMI_RATE_LIMITの整数文字列1〜1000を採用。不正・未設定なら既定値。両APIに適用。
- `day-074-link-dokumi/lib/target-guard.js`: `validateTarget`, `isPublicIp`, `isNumericHost`。::/96、3fff::/20、64:ff9b:1::/48、5f00::/16を非公開扱い。
- `day-074-link-dokumi/tests/observer-{guard,html,network,handlers}.test.mjs`を変更。
- `day-074-link-dokumi/tests/observer-performance.test.mjs`を作成、`observer.index.mjs`へimport登録。
- `notes_BF.md`と本受領書を作成。

## 検証

- `node --test day-074-link-dokumi/tests/observer.index.mjs`: **171件、171合格、失敗0**。Bの132件から39件増加（guard 5、html 2、network 10、handlers 16、performance 6）。既存HTMLの9件もすべて合格。
- LINK_DOKUMI_BENCH_PAGESにメインの保存済みページのディレクトリを指定した同入口の実行: **179件、179合格、失敗0**。実通信はしない。
- 変更した実装4ファイル、試験5ファイル、入口1ファイル、計10ファイルの`node --check`合格。
- 保存済み8文書について、最適化前後のHtmlFactsをdeepEqualし、すべて一致。
- `node --test day-074-link-dokumi/tests/`: **不合格**。担当外`lib/rules.js:101`のモジュール初期化で`MESSAGES[id].title`が例外となり、全体は1件失敗として終了。独立した入口では観測171件が走ることを確認した。同一失敗2回で全体の再実行を停止。

追加試験はHTTP補助取得の目的・ホスト・パス・manual・本文破棄・転送を追わないこと・期限共有、HTTP入力と本文読取失敗で追加取得しないこと、転送先DNS理由、上限後のHTMLを無視すること、IPv6範囲の先頭/末尾/隣接公開境界、IPv4互換ループバックをDoH段階で拒否すること、環境変数の境界/不正値/両API適用を確認する。

## 性能（Node v24.22.1、15回、単位ms）

メインが保存済みの実在ページ8件をUTF-8の先頭LIMITS.BODY_CAP_BYTES以下で切り、extractHtmlFactsだけを測定。各文書の初回と15回の中央値。各列は別の新規Nodeプロセスで測定。先頭のWikipediaだけがプロセス内の最初の抽出で、後続文書の「初回」は関数自体が温まっている。Amazonの保存文書は小さく、大きい実ページの性能の根拠にはしない。

| 保存文書 | 前・初回 | 前・中央値 | 後・初回 | 後・中央値 |
| --- | ---: | ---: | ---: | ---: |
| Wikipedia | 6.059 | 2.403 | 4.100 | 1.011 |
| GitHub | 3.496 | 1.788 | 2.320 | 1.030 |
| Yahooニュース | 1.929 | 1.725 | 1.282 | 0.626 |
| Amazon | 0.012 | 0.001 | 0.007 | 0.001 |
| Apple | 2.425 | 1.649 | 0.923 | 0.622 |
| NHK | 0.187 | 0.153 | 0.140 | 0.089 |
| 楽天 | 2.985 | 1.664 | 1.629 | 0.635 |
| Yahoo | 1.267 | 1.072 | 0.685 | 0.436 |

同じ保存文書の結果一致も確認した。**中央値1ms前後は達成したが、コールド初回3ms未満はWikipediaの4.100msで未達**。CPU無料枠を実機で満たす保証とはしない。

永続する性能試験は60KiBの日本語ニュース風HTML、2000リンク、200script、長い属性、大量の不等号、正規表現の失敗候補を各15回測定し中央値10ms未満を要求する。保存文書込みの実行で合成6種の中央値は0.189〜1.535ms、保存8文書は0.001〜1.665ms。これらの各文書の初回は0.004〜2.624msだが、既存テスト実行後の測定でありコールド初回ではない。

既存の敵対的HTML3種はLIMITSちょうどのバイト数をassertし、15回の中央値10ms未満へ強化した。詳細検査の正規表現は全文上限内で、固定接頭語・固定長反復・上限500/80等の反復・互いに重ならない文字クラスの反復であり、重なる可変長反復はない。近似候補を繰り返した入力も上記性能試験で確認した。fixturesは観測JSONであり元のHTML文書は入っていないため、元HTMLとしての性能試験には使えない。既存のfixture契約試験は全体初期化失敗により今回の全体実行では完走していない。

## 既存試験を変えた理由

- fetch例外の文字列だけでtls_failedとする試験を廃止し、同じopaque例外でHTTP応答の有無に応じて分類が分かれる試験へ置換。ステータス由来TLSエラー/チャレンジで再取得しない試験は維持。
- 一時的な接続失敗を2回診断する非キャッシュ試験のfetch回数は、各診断のHTTP補助取得を含むため2から4へ変更。
- 旧「160KiB、1回、50ms未満」の3試験を「LIMITSちょうど、15回、中央値10ms未満」へ強化。本文ストリームのchunkサイズもLIMITSを使用。
- 追加試験作成中に正確な上限用の属性文字列が1バイト長いこと、ニュース風文書が60KiBに足りないことをassertが検出した。生成側を修正し、assertや閾値は緩めていない。

## メインに残る判断・未確認

1. **全体試験の停止原因**: MESSAGESにV-NOT-FETCHED、V-SHARED-HOST、O-STATUS-NOTEがない。判定担当で整合させ、全体テストを再実行する必要がある。担当外なので変更していない。全件合格という完了条件は未達。
2. **コールドCPU**: 初回3ms未満の目標は未達。Cloudflare本番のCPU 10ms以内かは、ネットワークとブラウザ禁止のこの担当では確認できない。decode・ヘッダー・JSONを含む全体CPUも別途必要。
3. B受領書の制約は維持: Cache APIのレートはデータセンター/isolateを跨ぐ厳密な上限ではない。DoH検査と実fetchのDNS解決先の一致は保証しない。RDAP 404の区別、DNS部分結果の扱い、レスポンス削減のtrimmed注記は既存契約のまま。
4. HTTP応答ありのtls_failedは、証明書の問題や期限切れを断定するものではない。HTTPS未対応・一時的な障害等も含みうる。本文・転送先を追加取得せず、HTTP応答が返った事実だけをdetailにする。
5. 上限ちょうどで読み取りを止めた場合は、追加の1バイトを読まず保守的にtruncatedを付ける既存挙動を維持した。extractHtmlFactsの文字列側はLIMITSの文字数上限、実取得側は復号後のバイト列上限を使用する。
6. workerd/Cloudflare本番、実TLS、実Cache API/getSetCookie、Pages入口・環境変数の実環境反映、E2E、公開ゲート、ビルドは未実施。ネットワーク・ブラウザを使わない担当契約に従う。

テスト出力は一時領域のday074-bf-final-observer.txt、day074-bf-observer-pages.txt、day074-bf-final-all.txt、性能の前後はday074-bf-before.json / day074-bf-after.jsonに保存した。公開用ソースに実在ページ本文やローカルパスは追加していない。
