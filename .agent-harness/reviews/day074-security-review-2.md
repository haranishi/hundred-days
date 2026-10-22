# Day74 セキュリティレビュー 2

## 総評（3行）
S1〜S6は前回の再現入力で修正・説明の整合を確認した。S7はmanual・回数・URL検査までで、転送先のDNS検査がなく一部対応。
新たに、長いLocationのホスト名によるPSL計算量の増大、報告書・要約へのクエリ残存、コピーへの制御文字残存、拒否後の追加アクセスと説明の不一致を確認した。
既存215テストは成功したが、新規medium 2件を含む以下の問題があり、この対象範囲を公開可とは判定しない。本番Workers・実ネットワーク・ブラウザは未検証。

## 範囲・方法・証拠

- 2026-10-22、Node v24.22.1。指定の前回レビュー・プローブ、BG/BF受領書、threat-model/design、現在の観測実装、PSL、report、両API入口、関連するrules/lexical/url-input/app、指定の説明文を読み取った。
- 製品・仕様・既存テストは変更していない。作成したのは本書と `day074-security-probes-2/` のスクリプト・結果だけ。Git操作、依存導入、ブラウザ起動、診断先通信は行っていない。公式資料のみWebで閲覧した。
- 信頼境界は、利用者の入力→API、DoH/RDAPのJSON→解析、診断先のヘッダー/HTML→観測→判定→画面/コピー。守る対象は非公開宛先への接続防止、CPU/メモリ/接続数、利用者のURL内の秘密、結果表示の信頼性。
- 元の `node .agent-harness/reviews/day074-security-probes/probe.mjs` は旧脆弱性の存在をassertするため、S1の `false !== true` で停止した。次に入力を変えず、期待値3種類（IPv6許可→拒否、対象取得1→0、Bidi残存→除去）だけ更新したコピー `previous-inputs.mjs` で**元の入力を全件再実行**した。旧末尾のapp.js骨組みという注記は現在に当てはまらないのでコピーの出力では訂正。
- 追加攻撃は `node .agent-harness/reviews/day074-security-probes-2/probe.mjs`。全fetchを注入/禁止し、ネットワークへ出ない。入力・結果は同ディレクトリの `results.jsonl`、前回入力の結果は `previous-results.jsonl`。
- `node --import ./.agent-harness/reviews/day074-security-probes-2/no-network.mjs --test day-074-link-dokumi/tests/observer.index.mjs day-074-link-dokumi/tests/psl.test.mjs`：**215件成功、失敗0**。証拠 `tests.txt`。この成功を追加攻撃への耐性の根拠にはしていない。
- 時間はローカルNodeの経過時間。Workers CPU時間や本番障害を実測した値ではない。前回時点の全ソースの保存版は参照できず、Git禁止のため履歴差分は取っていない。「70への置換以外に差分なし」という履歴上の断定はしない。

## S1〜S7 の確認表

以下 `lib/` は `day-074-link-dokumi/lib/`。

| 番号 | 状態 | 防いでいるコード（ファイル:行） | 試した迂回の入力と結果 |
|---|---|---|---|
| S1 | 修正済み | `lib/target-guard.js:65` の `2000::/3` 許可候補＋特殊用途除外、`lib/doh.js:25`・`:37` の全回答の非公開IP検出 | 元の `fec0::1`・`::ffff:0:7f00:1`・`2001:2::1`・`100:0:0:1::1`・`4000::1` は全て対象fetch 0。追加 `::127.0.0.1`、`::ffff:192.168.0.1`、`64:ff9b::a00:1`、`64:ff9b:1::1`、`2002:7f00:1::`、`2001:db8::1`、`3fff:fff:ffff::1`、`5f00::1` は拒否。`2001:20::1` も保守的に拒否。公開IPv6だけのDNSは引き続き成功。IANA照合は下記。 |
| S2 | 修正済み | `lib/html-facts.js:76` のURL解決1500回予算、`:122` のbase入力/解決結果2048字上限 | 元base 4000/16000/32000字＋1500リンクは中央値約2.2/1.5/1.7ms（実行ごとに変動、previous-results参照）。別入力はbaseでなくform action、script src、meta refreshに各30000字＋1500リンク（約52.5KiB）。追加の最終実行は約2〜3ms。元のbase×リンク増幅は再現せず。ただしPSLの別経路はN1。 |
| S3 | 修正済み | `lib/sanitize.js:26` のreadCapped、`lib/doh.js:21`、`lib/rdap.js:27` | 元の2MiB余分フィールドは成功しない。追加は巨大events配列40000件、別形の入れ子配列30000件、Answer配列50000件。DoHは2窓口合計147456 bytes、RDAPは270336 bytesをストリームから受け取った時点で失敗、cancel各2/1回。各応答の保持/parse上限は64/256KiBで、読取チャンク1個の超過はありうる。parse後64件制限も読んだ。 |
| S4 | 修正済み | `lib/handlers.js:6` の全外向き応答no-store、`:79` のcache hitも同じ関数 | 元の299秒後命中で取得は1回、外向きno-store。追加はtrace不正入力400、around不正入力400、POST405、停止503、全てno-store。内部結果/登録日/レートのTTLと外向き保存は分離。物理的消去時刻は検証できない。 |
| S5 | 修正済み | `lib/sanitize.js:1` のclipがBidi_Controlを除去、`lib/html-facts.js:13` のclean経由 | 元titleのU+202E/U+202Cは除去。追加U+061C、U+200E/F、U+2066/7/8/9、U+202A/B/C/D/Eをtitle→traceで除去。結合文字 `e\u0301` は残る（通常文字の破壊を避ける挙動で、Bidi修正の迂回ではない）。別種のC1・Unicode行区切りはN3。 |
| S6 | 修正済み | `lib/html-facts.js:192` の400字、`lib/handlers.js:82` の内部保存、`static/privacy.html:63` と `index.html:412` の抜粋表示の明記、`app.js:931` の文字表示 | 元BODY_ONLY_MARKERは今も返るが、新説明はそれを明記。追加2000字本文→400字、実体参照500個→323字、script本文＋可視文→可視文7字のみ。本文全量を保存する指摘ではない。400字はJSのUTF-16単位で、利用者の見た目の文字数と同じとは限らない。 |
| S7 | 一部 | `lib/rdap.js:13` のmanual/最大3転送、`:19` のvalidateTarget/HTTPS検査 | 元 `http://127.0.0.1/` は後続fetchなし。追加IPv6直指定、認証情報、8443、internal.localを拒否。公開形式 `https://private-answer.com/` はDNS問い合わせなしで後続fetchへ到達。これはprivate IPを指すかどうかを調べないコードの証明で、内部への実接続の証明ではない。通常の公開形式への転送は成功、ループは4リクエストで終了。DNS検査は依然必要。 |

### IPv6のIANA照合

2026年の参照時点で閲覧できた[IANA特別用途登録簿](https://www.iana.org/assignments/iana-ipv6-special-registry/)および[IPv6アドレス空間](https://www.iana.org/assignments/ipv6-address-space/)と照合した。非グローバル範囲の拒否に欠落は今回見つからなかった。`2000::/3` 外の変換用アドレスも拒否する。公開扱いの細分範囲まで広く拒否する箇所はあるが、SSRF対策として保守的な方向。公開候補内の実割当・経路を全件保証する判定ではなく、DoHとfetchの再解決の不一致も残る。

## 新しい指摘

| 番号 | 重大度 | ファイル:行 | 何が起きるか | 再現入力 | 直し方 |
|---|---|---|---|---|---|
| N1 | medium | `lib/observe.js:205`、`lib/psl.js:37` | 周辺HTTP確認のLocationは、長さやホストを検査する**前**にPSLへ渡る。PSLは全suffixをslice/joinして二巡し、ラベル数に対し二乗の処理量になる。HTTP側を制御する受け身のサイトだけで、短い入力URLから高いCPU消費を誘発できる。同期処理なのでタイマーは中断できない。 | aroundの `http://attacker.com/` へ302と `Location: 'https://'+Array(4096).fill('a').join('.')+'.com/'` を返す。Location8204字。`PSL-real-around` は512/2048/4096ラベルで約3.5/44/176ms。aroundの実経路で再現。直接PSLへ不正入力を渡すだけの証明ではない。 | Location全体の上限と `validateTarget` をPSLより先に適用する。PSL自身にもホスト長/ラベル数の入口予算を置く。長大Location→aroundの回帰検証を加え、WorkersのCPUも測る。 |
| N2 | medium | `lib/report.js:19`、`:29`、`:49` | scrubが小文字 `http(s)://` しか認識しないため、HTMLの正当なURL表記でもクエリ/フラグメント内の秘密が報告書・家族向け要約へ残る。「写しには残さない」という契約を満たさない。 | HTML `<form action="HTTPS://other.com/pay?token=SECRET_UPPER#hash"><input type=password></form>` またはaction `//other.com/pay?token=SECRET_REL#hash`。`runTrace→evaluate→buildReport/buildSummary` の実経路で両方にSECRETが残った（`report-real-pipeline`）。通常小文字のURLでは消える。 | 証拠用URLを自由文に埋める前に、基準URLつきで解析してsearch/hashを落とす。大文字、protocol-relative、相対参照、認識失敗時も秘密を残さない出力規則にする。正規表現へiを付けるだけでは後者や空白分断を直せない。 |
| N3 | low | `lib/sanitize.js:5`、`lib/rules.js:117`、`lib/report.js:29` | Bidiは消えるがC1とUnicode行/段落区切りが残り、コピーを行区切りとして表示する受け手で偽の見出しや判定を挿入できる。画面のvisによる可視化はコピー関数には掛からない。scrubはUnicode空白でURLを分断し、後ろの秘密も残す。 | form action `https://other.com/pay\u2028偽の診断：合格?token=SECRET_LINE` →実経路の両コピーにU+2028と秘密が残る。ヘッダー `Server: Example/1.2\u0085FAKE` もtrace→evaluate→reportに残る。実際の貼付先での描画は未検証。直接resultへLFを入れた試験も残存するが、それだけをHTTP経路の証明にはしていない。 | コピー用の取得値を1行に制限し、C0/C1・Unicode行/段落区切り・Bidiを除去または可視化する。構造上の改行と取得値を分ける。URL秘匿はN2と併せて処理する。 |
| N4 | low | `day-074-link-dokumi/app.js:495`、`lib/observe.js:193`、`index.html:401` | 「403などで拒否すれば終わり、もう一度は試さない」という運営者向け説明と違い、通常の403/429もtrace.ok=trueであり、ブラウザはaroundへ続き同じホストのHTTPルートとsecurity.txtを取得する。最終URLがHTTPルートなら同じURLへの再取得にもなる。 | まずtraceに通常の403を返す。そのfinalをaroundへ渡すと `http://attacker.com/` と `https://attacker.com/.well-known/security.txt` へ各1回fetch。`refusal-around` とappのaround条件で到達を確認。既知のchallengeヘッダーで止まる場合とは異なる。 | 403/429後は周辺の対象アクセスを省くか、「当該URLの再試行はしないがHTTP/security.txtは別途取得する」と説明を正す。同じHTTPルートの重複取得も避ける。 |

S7は新番号に重複計上しない。上流RDAPが攻撃者の選ぶ転送を生成する経路は未確認なので、前回同様info相当の残件。修正範囲を「公開ホスト文字列の検査まで」とするなら、その信頼例外を仕様に明記する必要がある。

## 変更部分の追加点検

- PSLのMapとObject.hasOwnは `__proto__`/`constructor` の継承プロパティ参照を防いでいた。`a.__proto__`、`a.constructor`、`__proto__.com`、`constructor.com` で例外なし。サーバーのguardは不正なunderscore名を拒否し、253字までのホストは高速だった。`github.io`の別利用者、`*.ck`/例外、city.kawasaki.jpも期待する境界。N1はこのguardの前に呼ぶ例外経路。
- `psl-data.js:9`・`:15` に規則2件を除外した旨があり、`tools/gen-psl.mjs:46` も除外を実装している。「PSLをそのまま使う」とは一致しない。非公開NGワードのファイル・値を取得/転記していない。除外先の実ドメインでの影響は未確認。該当する登録境界の精度は公式PSL全体と同一とは扱えない。
- RATE_KEEP_Sはcontractで70、handlerでputに使用。整数文字列1〜1000のレート設定、12の既定、trace/rdap/rateの鍵分離、cache hit時のno-store、失敗応答も読んだ。過去版との厳密な差分保証は未確認。
- 入口のPOST/PUT/OPTIONS/HEADは両方とも405/no-store。GETはhandlerに渡り、URL検査・例外を固定応答に閉じる。入口自身の環境オブジェクト構築が壊れるような非標準contextは想定外。本番のルーティングを起動した試験ではない。
- `report-direct-value` のjavascript、全角？、%3Fはクエリとして消えなかった。後二者はURL仕様上はpathnameの一部であり、普通のquery除去だけで消えない。これをすべて「秘密が取れる脆弱性」とは数えない。URLのパス自体に秘密を入れた場合の秘匿は、現契約だけでは保証できない。javascriptの実行はコピーで行わず、今回のN2は実在するHTTP(S)フォーム経路に絞った。

## 主張と実装の照合表

原文のspanで埋める数字は `⟨定数名⟩` と表記。繰り返される主張も出典を分けた。本文全体を取らないとの表現は「先頭部分の取得・短期保持はする」という前後の説明と合わせて評価した。

| 主張（原文） | 場所 | コードでの根拠 | 一致／不一致／未確認 |
|---|---|---|---|
| 貼り付けたURLを同一オリジンの中継API（/api/day-074/）へ送り、中継がそのページ（と、転送先、http://側、/.well-known/security.txt）を取得します。 | privacy.html:63 | app:466/498の相対API、observe:113/195/213 | 一致（HTTP入力では逆schemeのHTTPSも取得する） |
| 既定では、URLの ? 以降と # 以降は送りません（利用者が選んだときだけ ? 以降も送ります）。 | 同上 | url-input:85→app:466。入力URLは既定で除去、hash常時除去。API自体はqueryを受ける。転送先queryはobserve:135/113で送る | 一致（入力URLについて）。転送先にも一切送らないという意味では不一致 |
| 取得するのは、応答のヘッダー、Cookieの名前と属性、HTMLの構造（題名・見出し・フォームの送信先・読み込むファイルの名前など）と、ページの文章の先頭の短い抜粋（最大400字。ボット対策の画面かどうかの判定と、結果の「取得した値」の欄に文字として出すために使います）です。 | 同上 | observe:139/144/152、cookies:10、html-facts:192、rules:237付近のchallenge判定、app:931 | 一致 |
| ページは先頭64KiBまでしか読まず、本文の全体は保持も表示もしません。 | 同上 | readCapped＋observe:151、html-facts:192 | 一致（復号後保持/解析上限。streamからは超過チャンクを受けうる） |
| 名前の確認のため、ドメイン名だけを公開DNS（CloudflareのDNS over HTTPS。失敗したときはGoogle Public DNS）へ、登録日の確認のためドメイン名をレジストリのRDAP（.com・.netはVerisign、そのほかはrdap.org経由で各レジストリ）へ送ります。 | 同上 | doh:queryMailFacts/resolvePublicHost、rdap:8 | 一致（DNSには_dmarc等の名も送る。RDAPは登録ドメイン） |
| 診断先には、このサイトの中継（User-Agent LinkDokumi）からのアクセスとして届き、利用者の接続元IPアドレスやブラウザの情報は送りません。 | 同上 | observe:11の新規ヘッダー、受信Requestヘッダーを継承しない | 一致（アプリが組み立てる要求）。基盤の追加ヘッダーは未確認 |
| 診断したURLの履歴は残しません。 | 同上 | 履歴API/永続化なし。ただし直後の文どおり結果内requested/final/hopsを内部cacheに置く | 一致（明記された短期結果・ログの例外を含む意味） |
| ただし、同じ相手サイトへ短時間に何度もアクセスしないよう、診断の結果（上の抜粋を含む）を最大5分（登録日は最大24時間）、乱用を防ぐため接続元IPアドレスを変換した値とその回数を最大70秒、Cloudflareの一時キャッシュに置きます。 | 同上 | handlers:43/51/82/101、expiresAt/Cache-Control | 一致（再利用期限。物理消去の保証は未確認。around全体のキャッシュはない） |
| アクセスログにURLが残る場合もあります。 | 同上 | APIのGET queryにurl。console記録なし | 未確認（基盤ログ設定未調査。可能性の説明とは矛盾なし） |
| 「外部の診断サービスで調べる」のリンクは、押したときだけ、そのサービスへURLまたはホスト名が渡ります。 | 同上 | app:986以降renderExternal、search/hash削除、aタグのみ | 一致（クリック操作の本番実測は未実施） |
| 端末には何も保存しません。 | 同上 | no-store、Storage/Cookie書込なし。明示コピーはclipboardへ書く | 一致（自動永続化について。利用者のコピー操作は例外） |
| 通信する前に、アドレスの見た目を調べます（つづり、紛らわしい文字、有名な名前の借り方、短縮URL、別のサイトへ進む指定など）。 | index:330 | app:441以降analyzeLexical→renderEarly→callApi | 一致 |
| 「調べる」を押すと、このサイトのサーバーが、そのアドレスへアクセスします。 | index:331 | app:466、observe:94/113。拒否対象や見本では通信しない | 一致（検査を通る通常入力） |
| 転送があれば最大⟨MAX_REDIRECTS⟩回までたどり、行き先を1つずつ確かめてから進みます。 | index:331 | observe:101/122/129/108、定数5。ホスト別Mapは同一ホストで再利用 | 一致（診断先trace。RDAPのDNSはS7） |
| 最後のページについて、応答ヘッダー（守りの設定）、Cookieの名前と属性（値は読み捨てます）、HTMLから取り出した事実（題名・入力欄の送り先・読み込むファイルなど）を見ます。 | index:332 | observe:139〜157、cookies:7〜23 | 一致 |
| 本文は先頭⟨BODY_CAP_BYTES⟩KiBまでしか読みません。 | index:332 | 定数65536をKiBへ換算、readCapped | 一致（保持/解析の上限） |
| 行き先の名前について、公開DNS（メールのなりすまし対策の設定など）、登録日、http://で開いたときの転送、連絡先の公開（/.well-known/security.txt）を調べます。 | index:333 | runAround:183〜225 | 一致（HTTP入力ではHTTPS到達確認） |
| ログイン、入力欄への送信、ファイルのダウンロードや実行、JavaScriptの実行はしません。 | index:337 | GETのみ、フォーム/JS参照は解析のみ、download判定ならbody破棄 | 一致（指定URLへのGET自体は送る） |
| 診断先の画面を撮ったり、このページに映したりはしません。 | index:338 | スクリーンショット/iframe描画なし。取得値は文字 | 一致 |
| 隠れたファイルを探す、何度も繰り返してアクセスするなど、侵入に近い確認はしません。 | index:339 | 取得先は入力/転送/ルート/security.txt、既知のHTTP補助1回 | 一致（同一URLの再試行・重複が絶無という主張にはN4） |
| 既知の詐欺サイトの一覧との照合や、ウイルス検査はしません。 | index:340 | lexical/rulesは兆候の表、外部スキャン呼出しなし | 一致 |
| 必要なら、結果の下にある外部のサービスを使ってください。 | index:340 | renderExternalのリンク | 一致 |
| 診断の履歴を残しません。 | index:341 | 永続履歴機能なし、privacy節の短期cache例外 | 一致 |
| 結果の公開やランキングもしません。 | index:341 | 公開結果API/ランキングなし、共有はアプリ自体 | 一致 |
| 見るのは、押した時点の応答だけです。 | index:347 | handlers:79が最大5分前の応答を再利用 | 不一致（キャッシュ時は過去の応答） |
| あとから中身が変わることがあります。 | index:347 | 一時点の観測、継続監視なし | 一致 |
| 相手のサーバーは、アクセスしてきた相手を見分けて、人が開いたときと違う中身を返せます。 | index:348 | 固定UA、利用者のブラウザで取得しない | 一致 |
| 一部のサイトは、ブラウザ以外からのアクセスを遅くしたり断ったりします。 | index:349 | 時限/拒否の分類はあるが、外部サイトの実際の振る舞いは今回調査外 | 未確認（一般的限界としてコードと矛盾なし） |
| その場合は「時間切れ」や「断られた」と表示します。 | index:349 | observeのtimeout/challenge、rules:237、appのFAILURES | 一致（表示コード。実ブラウザ未検証） |
| 診断のために、ブラウザになりすますことはしません。 | index:349/386 | headersOfはLinkDokumi、ブラウザUAなし | 一致 |
| JavaScriptで後から作られる部分や、ログインした後の画面は見ていません。 | index:350 | HTML静的解析のみ、受信Cookieも引継がない | 一致 |
| 名前の表に載っていないブランドや新しい手口は、見た目の判定に出ないことがあります。 | index:351 | brands/listsの固定表、未知を網羅しない | 一致 |
| 公式ドメインの表と一致していても、乗っ取りや、個別のページの問題までは分かりません。 | index:352 | 公式一致とページ兆候を別評価、侵害有無の照合なし | 一致 |
| 守りの点数は、見えた設定だけを数えた独自の評価です。 | index:353 | rules/scoreの定数減点方式 | 一致 |
| 点数が高くても、なりすましではないとは限りません。 | index:353 | ownerとvisitor別集計 | 一致 |
| 訪問者向けは、見つかった兆候の点を足して段階を決めます。 | index:356 | rulesのvisitorBad.reduce/visitorLevel | 一致 |
| とくに強い兆候には「これより下の段階にはしない」という下限があります。 | index:356 | RULE_VALUES.floor→visitorLevel | 一致 |
| 運営者向けは、100点から「付けると良いもの」の点を引きます。 | index:358 | ownerScore | 一致 |
| ほかの診断サービスの採点（MDN HTTP Observatory など）とは別の、このサービス独自の評価です。 | index:360 | 外部採点値を取得せず独自集計 | 一致 |
| ブランドの公式ドメイン：日本で名前をかたられやすい36の会社・サービスについて、各社の公式サイトで確かめたドメインの表です（2026年10月22日に確認）。 | index:373 | brands.jsの表はあるが各社の出典の再調査はレビュー範囲外 | 未確認（件数・日付・出典照合を未実施） |
| 選ぶときは、フィッシング対策協議会の月次報告（2026年9月分）を参考にしました。 | index:373 | 選定作業の本人の記録は今回照合していない | 未確認 |
| 短縮URLと、だれでもページを公開できるサービスの一覧：各サービスの公式の情報で確かめました。 | index:374 | listsの表はある。個別サービスの一次資料は今回未調査 | 未確認 |
| ドメインの区切り（どこまでが1つの登録か）と、利用者ごとにサブドメインを配るサービスの判別：Public Suffix List（公開サフィックスリスト。2026年10月20日版）をそのまま使っています。 | index:375 | psl-data:9/15は2規則を除外と明記 | 不一致（版は一致、規則はそのままではない） |
| ライセンスはMPL 2.0です。 | index:375 | psl-dataのMPL告知 | 一致（告知）。ライセンス義務全体の監査は未確認 |
| 末尾（.comや.jpの部分）の目安：Interisle Consultingの2026年の調査で、1万ドメインあたりのフィッシングの報告が多かった .xin・.icu・.cfd の3つだけです。 | index:376 | listsの値と外部調査の再照合は未実施 | 未確認 |
| これだけを根拠にはしません。 | index:376 | visitorの複数ルール/小点数 | 一致 |
| サーバーのソフトの保守が終わった時期：PHP・Apache 2.2・IIS 6〜8.5について、配布元の公式の情報で確かめました。 | index:377 | eolは固定表。日付の一次資料再調査は範囲外 | 未確認 |
| JavaScriptの部品（ライブラリ）の既知の弱点：公式の情報で、影響する版の範囲が一致したものだけを使います。 | index:378 | libsの版判定は存在。全アドバイザリ一次資料の照合は範囲外 | 未確認 |
| 守りの設定の目安：MDN（ブラウザの技術資料）などの公開資料をもとにしています。 | index:379 | 出典全体は今回再監査しない | 未確認 |
| このサービスは、利用者が「調べる」を押したときだけ、指定されたページへアクセスします。 | index:384 | UIは押下で通信。APIはSec-Fetch-Site未送信の直接クライアントも受け付ける | 一致（UIの自動取得防止）。サービス全体で押下を保証する意味では不一致 |
| 巡回はしません。 | index:384 | HTMLリンクをfetchしない | 一致 |
| 次のUser-Agentを名乗ります。 | index:386 | observe:9/11は直下の固定UAと同一 | 一致（診断先要求。DoH/RDAPは別ヘッダー） |
| Cookie・Referer・Originは送りません。 | index:386 | headersOfが新規オブジェクト、Set-Cookieを次hopへ渡さない | 一致（実基盤の追加ヘッダーは未確認） |
| 利用者が指定したURL（「?」から後ろは、利用者が選んだときだけ） | index:390 | parseInput.fetch.href→callApi | 一致（UI入力） |
| そこからの転送先（最大⟨MAX_REDIRECTS⟩回） | index:391 | traceは5回 | 一致 |
| 行き先のホストの http:// 側（HTTPSへ転送されるかの確認） | index:392 | around:194は入力httpならhttps | 一致（HTTPS診断）。HTTP診断でもHTTPSを取得する点は説明不足 |
| /.well-known/security.txt | index:393 | around:213 | 一致 |
| 名前の記録（DNS）と登録日（RDAP）は、公開の問い合わせサービスで調べます。 | index:395 | doh/rdap | 一致 |
| この2つのために、あなたのサイトへアクセスすることはありません。 | index:395 | 通常は固定問い合わせ先のみ。ただしRDAP転送先は任意の公開形式ホストを受理 | 一致（通常経路）。任意転送先まで含めた保証は未確認（S7） |
| 同じURLの結果は最大⟨CACHE_TTL_S⟩分まで使い回し、相手のサイトへのアクセスを減らします。 | index:397 | traceの5分cache、aroundは対象取得を毎回行う | 一致（traceに限定）。診断全体で無通信とはならない |
| 利用者ごとの問い合わせは、1分あたり⟨RATE_PER_MINUTE⟩回までに抑えています。 | index:397 | IP・固定分・isolate内lock、envで上書き可能 | 不一致（厳密な利用者単位/分散上限ではない。境界前後24回、別DC等。既知残存リスク） |
| 利用者が指定した1回ごとの取得で、チャットアプリなどがリンクのプレビューを作るときと同じ扱いだからです。 | index:399 | 指定URL中心のGETは確認できる。外部サービスとの同一扱いの根拠は実装から示せない | 未確認 |
| robots.txtの決まり（RFC 9309）は、ページを巡回するクローラーのためのものです。 | index:399 | robots取得がないことのみ確認。RFC解釈は今回のコードレビュー外 | 未確認 |
| User-Agentに LinkDokumi を含むアクセスを拒否（403など）してください。 | index:401 | 対象要求のUAは固定 | 一致（拒否の識別方法） |
| 診断は「取得を断られました」と表示して終わり、もう一度は試しません。 | index:401 | 通常403はtrace.ok、app:495でaround継続 | 不一致（N4） |
| 「調べる」を押すと、入力したリンクが、このサイトのサーバー（Cloudflare Pages Functions）へ送られます。 | index:410 | app:466。拒否入力/見本は例外 | 一致（通常入力） |
| サーバーが、あなたの代わりに相手のサイトへアクセスします。 | index:410 | observeの新規GET | 一致 |
| 「?」から後ろは、くわしい設定で選んだときだけ送ります。 | index:411 | parseInput:85 | 一致（入力URL。転送先queryには適用しない） |
| 「#」から後ろは送りません。 | index:411 | parseInput:85、guard.url.hash='' | 一致 |
| 相手のサイトから読み取った値（題名・大見出し・文章の先頭の最大400字・転送先・ヘッダーなど）は、結果の「取得した値」の欄に、文字としてだけ並べます。 | index:412 | app:931とvis/textContentで描画 | 一致（表示ソースを確認。ブラウザ操作は未実施） |
| 相手のサイトに届くのは、このサイトのサーバーからのアクセスです。 | index:413 | ブラウザは相対APIへ、外部はWorkerのfetch | 一致 |
| あなたのIPアドレスやCookieは相手に渡りません。 | index:413 | headersOfで受信ヘッダーを継承しない | 一致（プログラム範囲）。本番基盤が付加する値は未確認 |
| 行き先の名前（ホスト名）は、名前を調べる公開のサービス（いまはCloudflareとGoogleのDNS）と、登録日を調べる公開のサービス（.comと.netはVerisign、それ以外はrdap.org）にも渡ります。 | index:414 | DoHへhost/登録ドメイン等、RDAPへregistrable | 一致（RDAPへはホスト全体でなく登録ドメイン） |
| 診断の履歴は残しません。 | index:418 | 永続履歴機能なし。短期結果にはURLを含む | 一致（同段落の例外を含む） |
| 同じ相手サイトへ短時間に何度もアクセスしないよう、結果を最大⟨CACHE_TTL_S⟩分だけ一時的に置きます。 | index:418 | trace5分、RDAP24時間は別。静的privacyに24h記載 | 一致（trace）。この段落単体ではRDAP24hの説明不足 |
| 回数の上限を守るため、IPアドレスから作った読めない値（ハッシュ）を、⟨RATE_KEEP_S⟩秒だけ置きます。 | index:419 | SHA-256先頭128bit＋count、70秒Cache-Control | 一致（再利用期限）。ハッシュは匿名化の保証ではなく、物理消去も未確認 |
| このサイトのプログラムは、調べたURLやIPアドレスを記録に書き出しません。 | index:420 | 対象コードconsoleなし。明示した内部cacheは例外 | 一致（ログへの出力） |
| ただし、配信に使っているCloudflareの仕組みで、ふつうのアクセスと同じように、リクエスト（調べたURLを含みます）が処理される場合があります。 | index:420 | URLをqueryに含むGET要求 | 一致（処理されること）。実ログ設定は未確認 |
| この端末には、調べたURLも結果も残しません。 | index:421 | no-store、永続履歴なし、明示コピーあり | 一致（自動永続化。利用者によるコピーは例外） |
| Cookieやブラウザの保存領域は使いません。 | index:421 | appにStorage/Cookie書込なし | 一致（アプリ本体。サイト共通機能の監査は対象外） |
| 結果の下にある外部の診断サービスは、押したときだけ開きます。 | index:425 | renderExternalのaタグ | 一致 |
| そのとき、ボタンの上に書いた値（URLかホスト名）が相手に渡ります。 | index:425 | app:renderExternalの同じbaseからbuildと表示value | 一致（ソース。全外部サービスの実遷移は未実施） |
| 共有欄で送るのは、このアプリのアドレスだけです。 | index:426 | 本体の共有とコピーは別、共有用静的アドレス | 未確認（shared実装の全経路は今回未監査） |
| 診断の結果は含みません。 | index:426 | 公開結果共有は作っていない。コピーには明示的に結果を含む | 未確認（共有欄の全経路）。コピーはN2/N3 |

## 資源増幅とWorkers固有の確認

- **通常UIの診断1回の成功経路の外向きfetchは最大48回をモックで再現した**（`outbound-maximum-success`）：対象6回、DoH36回、RDAP4回、対象補助2回。DoHはtrace最大6ホスト×A/AAAA×2窓口=24、around接続前4＋メール4種×2窓口=8の合計36。RDAPは初回＋転送3。リゾルバーの第1窓口だけ失敗する条件でこの最大になる。対象サイトへは6＋2=8回（RDAPの転送先は別）。
- traceが最終ホップでHTTPS例外ならHTTP補助を加えて最大31回（対象7、DoH24）。その失敗時はUIがaroundを呼ばない。直接APIクライアントがaroundも別途呼ぶなら二要求の合計上限は49回。前回の「対象へ9回」はAPIを独立に組み合わせた数で、普通の成功UIでは8回。
- rateはAPI共通で既定12回/固定分なので通常の完了診断は6回分。未キャッシュのtraceばかり12件なら最大372回/固定分、固定分境界の両側では倍になりうる。これは時間内にすべての外部応答が返る上限計算であり、実際の毎分スループットを測定したものではない。並列実行にも結果の同時取得の合流処理はなく、同URL未キャッシュの同時要求が複数回出る。isolate/DC横断制限もないため全体上限は保証しない。
- 本文保持/解析は対象HTML64KiB、security.txt8KiB、DoH64KiB/応答、RDAP256KiB/最終応答。Content-Lengthの値を信じて上限を変えず、途中欠損や虚偽値でもstream側で処理する。単一チャンク自体の割当やヘッダー全体はこの上限の対象外。Set-Cookieの名前/属性の件数と返却長は制限されるが、最初に受け取った全ヘッダー量をアプリが減らせるわけではない。
- aroundはDNS成功後にメール4種＋RDAP＋probe＋security.txtで最大7 fetchを開始しうる。Cloudflareの接続待ち上限は6で、7つ目はキューになる。自動的に破綻する証拠にはならないが、3.5秒の補助期限に待ち時間が含まれる。[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)。2026年4月の変更ではヘッダー受信後は枠が空くので、以前の「本文を読んでいる間ずっと6枠」を前提にはしなかった。[公式変更記録](https://developers.cloudflare.com/changelog/post/2026-04-09-relaxed-connection-limiting/)
- 全体12秒/6秒・ホップ7秒・補助3.5秒、AbortControllerとPromise.race、遅延fetchのbody破棄を確認。タイマーは同期PSL/JSON/HTML解析を止めない（N1）。readCappedはキャンセル完了をawaitせず、停止するreadをsignalとraceする。DoH/RDAPはfetch側がsignalを守る前提もあり、本番の中断挙動は未実測。
- fetchは全経路manual、RDAPの転送もmanual化。caches.defaultがなければキャッシュ/レートは省略される。内部putはwaitUntilへ登録しつつawaitし、外向きResponseだけno-store。Cache APIはDC単位という既知制約が残る。[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- Pagesの `onRequest` と `onRequestGet` の併記は、公式ではGETのとき専用側だけが呼ばれる。コードコメントの「GETの前にonRequestが呼ばれる」は誤りだが、現コードはどちらも同じ入口へ渡すので重複実行の証拠はない。[Pages API reference](https://developers.cloudflare.com/pages/functions/api-reference/)

## 未確認と残件

- 本番Workers/workerdのCPU・メモリ・Cache API・actual DNS/接続先・プラットフォーム追加ヘッダー・ヘッダー量上限での実挙動・実レート制限の分散特性・ブラウザでの表示/貼付け。
- RDAP上流を入力ドメインだけで任意の私設DNSホストへ転送させられるか。S7は安全検査の欠落を示すもので、内部データ取得の実証ではない。
- PSL除外2規則の具体的な登録境界への影響、ブランド等の全外部出典の再監査、サイト共通共有/解析機能、法的判断、運用ログの設定と物理削除時刻。
- 読み取り専用の依頼につき、修正・ビルド・公開ゲート・公開は実施しない。N1/N2の解消とS7の扱いの確定後、変更範囲に合わせた回帰検証が必要。
