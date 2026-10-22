総評：要修正。転送先の偽装ドメインとS3の利用者コンテンツで、ブランド検出をすり抜ける入力を再現した（P1 2件）。
既存テスト630件は合格したが、追加135ドメイン中5件を誤検知し、e-taxの見逃しとResult契約違反も確認した（P2 6件、P3 3件）。
実装・仕様・既存テストは変更していない。作成物はこの文書と同じディレクトリ下の許可されたプローブ1本だけ。

確認日：2026-10-22。Node.js v24.22.1。判定時刻は `2026-10-22T00:00:00Z` に固定。レビュー対象は未コミットの作業ツリー。

**指摘（P1：優先修正、P2：修正推奨、P3：軽微／仕様の明確化）**

以下のファイル名はすべて `day-074-link-dokumi/lib/` 配下。再現は `node .agent-harness/reviews/day074-judge-probes/probe.mjs --compact`、詳細は `--case=<ケース名>`。プローブはネットワーク接続もファイル書き込みも行わない。

| 番号 | 重大度 | ファイル:行 | 何が起きるか | 再現する入力 | 直し方 |
|---|---|---|---|---|---|
| J1 | P1 | rules.js:149、rules.js:180 | 入力URLのlexicalだけを採点し、取得した転送先の名前は照合しない。同じ偽装先を直接入力するとdangerだが、短縮URL経由ではok。入力がGoogleの場合は、その公式ドメインのgoodも残る。 | `redirect-to-brand-spoof`：`https://bit.ly/test` → `https://amazon.co.jp.account-check.xyz/signin`。題・入力欄にブランドを出さないclean観測で、ok/1点。t.co・Google経由はok/0点。Trace/Around/Resultの検査はすべて合格。 | 最終URLと取得済みの各ホップにもparse/analyzeLexicalを適用し、ホップごとの証拠でブランド・同形異字等を評価する。同じ根拠の重複加点は避ける。入力元の公式一致を転送先の保証として見せない。 |
| J2 | P1 | brands.js:53、brands.js:73、brands.js:82、rules.js:220 | `amazonaws.com`全体をAmazon公式にする一方、S3を利用者公開先として識別しないため、利用者のAmazon確認画面でもV-BRAND-CONTENTを抑止する。V-OFFICIAL-DOMAINが付き、V-SHARED-HOSTは付かない。 | `brand-content-at-user-host`：`https://bucket.s3.amazonaws.com/`、題「Amazon アカウント確認」、passwordFields=1でok/0点。同じ内容をGitHub Pagesに置く観測ではwarn/9点。公式に文書化されたHTTPのS3 website形式でもブランド9点が消え、HTTP由来のwarn/6点だけ。 | S3のバケット／公開サイトの実ホスト境界をuserContentHostとして優先し、AWS基盤の運営者とコンテンツ作成者を区別する。amazonaws.com全体をログイン先の公式免除に使わない。 |
| J3 | P2 | psl.js:20、rules.js:223 | 2ラベルの手書き表では`sakura.ne.jp`、地域型JP、S3などの公開境界を表せない。別々の登録者／利用者へのパスワード送信を同じ登録ドメインと誤認し、V-CROSS-FORMが出ない。転送数・meta refresh等も同じ誤った境界を使う。 | `cross-tenant-form-sakura.ne.jp`：`first.sakura.ne.jp` → `second.sakura.ne.jp`へのpasswordフォームでok/0点。同様にfirst.tokyo.jp→second.tokyo.jp、別S3バケットでも0点。 | PSLのICANN・PRIVATE区分と最長一致・ワイルドカード・例外を扱う境界判定へ置き換える。利用者が同じホストのパスを共有するサービスは、別途その限界を示す。 |
| J4 | P2 | brands.js:52、brands.js:137、rules.js:162、messages.js:27 | 実在する学校を銀行名の使用と見なし、公式サービス4件も「公式ドメインとは別」と表示する。単なる一覧未掲載を、非公式という事実へ変換している。 | `https://www.mizuho.ac.jp/`（みずほ幼稚園）note/4点。`ahamo.com`、`www.docomo-cycle.jp`、`rakuten.today`もnote/4点。`www.rakuten-wallet.co.jp`はwalletに反応しwarn/7点。null観測／clean観測とも同じ。 | mizuho等の地名・人名由来の語に追加条件を設ける。公式ドメインは一次資料で利用範囲を確認して追加する。未掲載という観測しかない場合の文を「この診断の公式ドメイン一覧にはありません」等に変える。 |
| J5 | P2 | brands.js:113、brands.js:124、brands.js:138 | 5文字のキーワード`e-tax`をハイフンで分割してから完全一致させるため、登録ラベル・サブドメイン・パスのすべてで当たらない。国税庁をまねる型を見逃す。 | `compound-short-brand`：`e-tax-login.top`、`verify.e-tax.top`、`ordinary.top/e-tax/login`はclean観測でok/0点。指定型の`e-tax-refund-confirm.top`でもブランド所見なし、note/4点。 | 複合キーワード自身のハイフンを保持して、語の左右境界で照合する。ドメイン／サブドメイン／パスの3箇所に回帰例を置く。 |
| J6 | P2 | url-input.js:56、url-input.js:74、rules.js:274 | スキームを省いたURL中の制御文字と、253字を超えるホストがParsed.ok=trueを通り、evaluateからvalidateResult不合格の結果が返る。前者はfetch.reasonもモデル外のinvalidになる。 | `example.com/a\\u0000b`（実際のNUL文字）で `$.target.input: 制御文字を含む`。`'https://' + 'a.'.repeat(130) + 'com/'`でhost/hostUnicode/chain.hostが263字となる。 | URL抽出・スキーム補完後にも制御文字／ホスト長を検査し、無効な入力として返す。接続を見送る正常Parsedと、形が不正なParsedを分け、Resultに入る値は契約を満たすようにする。 |
| J7 | P2 | brands.js:44、brands.js:57、brands.js:59 | 追加29ドメインの根拠は「公知」だけだが、全行をconfidence=high・source=R1 §A2として公式goodと検出免除に使う。うち28個はR1内にドメイン文字列もない。検出の免除を支える一次資料・確認日・公開機能の記録が欠ける。 | BRANDSのdomainSourcesを列挙。`office365.com`、`msftauth.net`、`mizuho-sc.com`、`amazonaws.com`等。`findOfficialBrand('sub.' + domain)`が一律にブランドを返す。 | 追加単位で一次URL・確認日・用途・第三者公開の有無を記録し、確認済みの範囲だけ免除する。「公知」を確認済みと同じhighにしない。J2のAWS境界も同時に是正する。 |
| J8 | P2 | libs.js:69、rules.js:316 | 同じライブラリ・版・CVEを、読み込み元ホストが違うだけで重複して減点する。既知の弱点が増えていないのに評点まで変わり、改善項目のgainも水増しされる。 | `same-cve-multiple-cdns-1/2`：jQuery 3.4.1をcode.jquery.comだけならCVE-2020-11023で6点減／94=A。同じ版をajax.googleapis.comにも置くと12点減／88=B。 | 採点前に少なくともlib・version・CVEで重複を除き、複数の配信元は証拠として集約する。複数箇所へ独自加点する設計なら、仕様と画面の「既知の脆弱性ごと」を明示的に変更する。 |
| J9 | P3 | headers.js:48、rules.js:287 | `max-age=0`は仕様表の「180日未満=O-HSTS-WEAK/5点」ではなく、O-HSTS-MISSING/15点になる。解除を有効HSTSとして扱わないこと自体は正しいが、仕様の分類・点と一致しない。 | `hsts-0`：85=B。仕様をそのまま読むと95=A。15551999秒→5点、15552000秒→0点は一致。 | 解除・無効値・未設定を15点扱いする意図なら、rules.mdに0秒を明記する。文面も「ヘッダーなし」と「設定を解除する値」を区別する。 |
| J10 | P3 | messages.js:289 | security.txtを「問題を見つけた人の連絡先」と説明しており、連絡先の主体が逆。実際は問題を受け付ける組織側の窓口。報告書にも同文が出る。 | `security-txt-description`のO-SECURITY-TXT.why、またはclean見本の報告。 | 「問題を見つけた人が、運営者へ連絡するための窓口を示すファイル」等に修正する。 |
| J11 | P3 | lexical.js:36 | V-REDIRECT-PARAMの仕様は「別ホスト」だが実装は「別登録ドメイン」。同じ登録ドメインの別ホストへ進む指定が出ない。既存テストは実装側の解釈を固定しており仕様と不一致。 | `redirect-parameter-same-registered-domain`：`https://example.com/?next=https://sub.example.com/`で所見なし、ok/0点。表の条件なら3点。 | 意図が「別登録ドメイン」なら仕様・モデルの文言をそろえる。「別ホスト」が要件ならhostname同士で比較する。 |

J2の公開機能は[AWSのS3 URL仕様](https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html)と[website endpoint仕様](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteEndpoints.html)で確認した。S3 website endpointのHTTP/HTTPS制約も区別し、HTTPSのREST形式の例は合成観測による判定テストである。実際のAWSへフィッシングページを配置・取得したものではない。

J3の境界は[PSL原本](https://publicsuffix.org/list/public_suffix_list.dat)（取得時VERSION: 2026-10-20_08-40-56_UTC）で、`sakura.ne.jp`、`tokyo.jp`、`s3.amazonaws.com`の掲載を確認した。

J4の運営実体は[みずほ幼稚園](https://www.mizuho.ac.jp/en/)、[ahamo](https://ahamo.com/)の企業情報リンク、[ドコモ・バイクシェア](https://www.docomo-cycle.jp/)、[Rakuten Today](https://rakuten.today/)の公式ブログ表記、[楽天のウォレット紹介](https://global.rakuten.com/corp/news/press/2024/0801_03.html)で裏付けた。楽天ウォレット本体は今回のWeb取得では403のため、グループ公式資料を使った。サイト全体の安全性を確認したという意味ではない。

J10の連絡先の役割は[RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html#section-2.5.3)による。

**確認した範囲**

| 範囲 | 方法 | 結果／限界 |
|---|---|---|
| 指示・既存仕様 | 指定プロンプト、AGENTS、開発契約、rules/model/ux/researchとR1/R2/R3を読んだ | 読み取り専用。新仕様・修正は作成していない |
| 対象の純関数15ファイル | url-input・punycode・psl・lists・brands・lexical・headers・libs・eol・rules・score・messages・report・resources・samplesの全文を読んだ | 呼出元のapp.js、contract.js、関連するobserve.jsも必要箇所を確認 |
| 既存住所・判定試験 | `node --test day-074-link-dokumi/tests/address.index.mjs day-074-link-dokumi/tests/judge.index.mjs` | 630/630合格、fail/cancel/skip=0。実装者の実行結果を流用していない |
| 独自国内ドメイン | 135件。既存legit fixtureと重複5件、追加130件 | 正規サービスとのブランド誤認5件。残り130件は0点。全件の現時点の疎通・運営実体の再確認はしていない。誤検知5件は上の一次資料で確認 |
| 独自フィッシング型 | 34件をnull観測／ホストを合わせたclean観測／lookalike観測で実行 | null/cleanでは28件がwarn以上、6件が未達。lookalike観測では全件danger。下表は検出性能の統計ではなく、手作りの型に対する結果 |
| fixtureの組合せ | trace 11種+null × around 5種+null、72通り。実際のparseInput→analyzeLexical→evaluate | 全72通り例外なし・validateResult合格。異なるホストのfixtureを組み合わせた行は、実サイトの観測として解釈しない |
| 全74ルール | rules.mdの各行と条件・点・重大度・floorを照合。既存テストの全ID到達も再実行 | 下のルール別表。定数の主な不一致はJ9、条件／データの問題はJ1〜J5・J8・J11 |
| 文面・レポート | messages.jsの全74項目、HEADLINES/ACTIONS/LIMITS、report.js全文。禁止語の機械確認も既存試験で再実行 | 禁止された肯定的断定はなし。否定形の安全保証注記は残る。運営者を責める表現の新たな問題は確認せず。技術用語nosniff、meta、nonce等は細部の所見には残るが最上部の行動は平易 |
| 技術説明 | R2のHSTS/CSP/Cookie/CORS/SRI/EOL/CVEの範囲・条件と照合 | バックポートの両方向の注意あり、CORSの*+credentialsがブラウザで拒否される説明あり。HTTP資源は「指定」と書き、実通信を断定していない |
| snippet | 7項目のヘッダー行／nginx／Apacheを読んで値・引用符・終端を確認 | nginxのalwaysとセミコロン、ApacheのHeader always setは適切。CSPのfixにはアプリ別調整の注意あり。実nginx/Apacheでの起動確認は未実施 |
| データ表 | 36ブランド、短縮24、共有18、TLD3、EOL、ライブラリ、相談窓口13、外部サービス6をR1/R2/R3と照合 | J7を除き、採用値に明白な転記誤りなし。AngularJS/Vue 2はEOL助言だけで、R2の全CVEを実装した表ではない。網羅性は保証しない |
| 外部リンク表示 | app.jsの `EXTERNAL_CHECKS.filter(check => check.verified === true)` と各buildを確認 | verified:falseのGoogle/VirusTotal/Observatoryは表示されない。表示3件にも「入口到達／結果未確認」の留保あり。電話#9110・188・IPA・日本郵便はR3の値と一致 |
| 境界入力 | 空・null・オブジェクト・全角・NUL・改行・双方向制御文字・2048/2049/2050字・100KB・長大ホスト | J6の2例で契約違反。2048字の正常URLは合格、2049字以降は拒否。双方向制御文字はpathで%エンコードされ、所見は出ずResult契約は合格 |
| 欠損／想定外型 | around={}・false・文字列、欠損headers/signals/rdap、lexical=null等、URLでないfinal.url | 下表。契約外の直接呼び出しは例外になる。app側にTrace/Aroundの型検査と段階的fallbackがあるため、すべてを画面クラッシュとは数えていない |
| 実施しなかった確認 | ネットワークを使う新規プローブ、実機UI、実サーバー設定の適用、ビルド・公開 | 読み取り専用レビューの範囲。ブラウザのWeb取得は一次資料の確認のみ。公開URLへの診断や外部フォーム投稿は行っていない |

**V-TLS-FAILをunknown・0点とする判断**

現行のunknown・0点を支持する。R2/R3と実測記録では、HTTPSの取得失敗だけから証明書の種類や詐欺の意図を確定できない。TLS失敗fixtureは、訪問者unknown／0点・運営者採点なしとなり、「HTTPでは応答あり」も出る。unknownには「入力しない」「別の方法で送り主を確かめる」の行動があり、単に情報を無視してはいない。強い目視所見があればwarn/dangerを維持する。今回、失敗を安全扱いする例は確認しなかった。V-UNREACHABLEとV-TLS-FAILの所見は同時に出るが、二重加点はない。

**正規ドメインの入力と結果（全件）**

すべて入力は `https://<host>/`。null観測で正常なURLがunknownになるのはrules.mdの明示仕様なので、それだけを誤検知とは数えていない。clean列は実際のサイトを取得した結果ではなく、同じホストにclean fixture相当の観測があった場合の対照。既存列の「あり」はlegit-domains.jsonに同じ文字列があるもの。

| 分野 | 入力host | 既存 | trace/around=null（段階/点） | clean観測（段階/点） | V-BRAND所見 |
|---|---|---|---|---|---|
| 自治体 | `www.city.sapporo.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.sendai.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.saitama.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.chiba.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.yokohama.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.kawasaki.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.sagamihara.kanagawa.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.niigata.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.shizuoka.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.hamamatsu.shizuoka.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.nagoya.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.kyoto.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.osaka.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.sakai.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.kobe.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.okayama.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.hiroshima.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.kitakyushu.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.fukuoka.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.kumamoto.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.hachioji.tokyo.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.city.machida.tokyo.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.pref.hokkaido.lg.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.pref.aichi.jp` | なし | unknown/0 | ok/0 | なし |
| 自治体 | `www.pref.okinawa.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.osaka-u.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.tohoku.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.hokudai.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.nagoya-u.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.kyushu-u.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.tsukuba.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.kobe-u.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.hiroshima-u.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.waseda.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.keio.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.sophia.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.ritsumei.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.doshisha.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.titech.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.ocha.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.mizuho.ac.jp` | なし | note/4 | note/4 | V-BRAND-KEYWORD |
| 大学学校 | `www.yamato-u.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.kaiseigakuen.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.azabu-jh.ed.jp` | なし | unknown/0 | ok/0 | なし |
| 大学学校 | `www.musashi.ed.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.ncc.go.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.ncchd.go.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.ncnp.go.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.ncvc.go.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.jrc.or.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `hospital.luke.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.kameda.com` | なし | unknown/0 | ok/0 | なし |
| 病院 | `toranomon.kkr.or.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.saitama-med.ac.jp` | なし | unknown/0 | ok/0 | なし |
| 病院 | `www.jichi.ac.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.yomiuri.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `mainichi.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.nikkei.com` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.sankei.com` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.tokyo-np.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.chunichi.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.hokkaido-np.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.okinawatimes.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `ryukyushimpo.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.nishinippon.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.kobe-np.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.shinmai.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.itmedia.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `news.mynavi.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.watch.impress.co.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `gigazine.net` | なし | unknown/0 | ok/0 | なし |
| メディア | `www.bunshun.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `toyokeizai.net` | なし | unknown/0 | ok/0 | なし |
| メディア | `diamond.jp` | なし | unknown/0 | ok/0 | なし |
| メディア | `president.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.yodobashi.com` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.biccamera.com` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `joshinweb.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.askul.co.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.monotaro.com` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.muji.com` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.uniqlo.com` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.nitori-net.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.lohaco.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `zozo.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.qoo10.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.dospara.co.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.suruga-ya.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.irisplaza.co.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.dinos.co.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.bellemaison.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.felissimo.co.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.palcloset.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `ahamo.com` | なし | note/4 | note/4 | V-BRAND-KEYWORD |
| EC企業 | `www.docomo-cycle.jp` | なし | note/4 | note/4 | V-BRAND-KEYWORD |
| EC企業 | `www.rakuten-wallet.co.jp` | なし | warn/7 | warn/7 | V-BRAND-KEYWORD |
| EC企業 | `rakuten.today` | なし | note/4 | note/4 | V-BRAND-KEYWORD |
| EC企業 | `www.saison-fund.co.jp` | なし | unknown/0 | ok/0 | なし |
| EC企業 | `www.kitano-hp.or.jp` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `note.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `hatenablog.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `blog.hatena.ne.jp` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `ameblo.jp` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `livedoor.blog` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `jugem.jp` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `cocolog-nifty.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `zenn.dev` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `qiita.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `www.1101.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `www.chikawatanabe.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `www.yamdas.org` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `www.hyuki.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `www.otsune.com` | なし | unknown/0 | ok/0 | なし |
| ブログ個人 | `hagex.hatenadiary.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.jtuc-rengo.or.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.zenroren.gr.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.seikatsuclub.coop` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `jccu.coop` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.zennoh.or.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.ja-group.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.greenpeace.org` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.wwf.or.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.msf.or.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.japanforunhcr.org` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.janic.org` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.npo-homepage.go.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.jnpoc.ne.jp` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.shaplaneer.org` | なし | unknown/0 | ok/0 | なし |
| 組合NPO | `www.nippon-foundation.or.jp` | なし | unknown/0 | ok/0 | なし |
| 紛らわしい正規名 | `pineapple.com` | あり | unknown/0 | ok/0 | なし |
| 紛らわしい正規名 | `applebees.com` | なし | unknown/0 | ok/0 | なし |
| 紛らわしい正規名 | `scrapple.com` | あり | unknown/0 | ok/0 | なし |
| 紛らわしい正規名 | `amazonaws.com` | あり | unknown/0 | ok/0 | なし |
| 紛らわしい正規名 | `mercari-shops.com` | あり | unknown/0 | ok/0 | なし |
| 紛らわしい正規名 | `lineage2.com` | あり | unknown/0 | ok/0 | なし |

**フィッシング型の入力と結果（全件）**

URLは実在する攻撃の採取リストではなく、日本のブランドに対する代表的な型を模して作った試験入力。ネットワークへ送っていない。lookalike列はtrace-lookalike/around-lookalikeのホストと最終URLを入力へ合わせ、Amazon確認の題・入力欄・外部フォーム・新規登録等の事実を保った合成観測。null列とclean列だけで辞書・字面由来の見逃しを評価する。

| 入力 | null観測（段階/点） | clean観測（段階/点） | lookalike観測（段階/点） | null観測の根拠 | warn未満 |
|---|---|---|---|---|---|
| `https://amazon-co-jp.verify-account.top/` | warn/9 | warn/9 | danger/39 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS | — |
| `https://www.amazon.co.jp.account-check.xyz/` | danger/18 | danger/18 | danger/48 | V-BRAND-SUBDOMAIN、V-BRAND-KEYWORD、V-DEEP-SUBDOMAIN | — |
| `https://smbc-card.com.login-secure.example/` | danger/18 | danger/18 | danger/48 | V-BRAND-SUBDOMAIN、V-BRAND-KEYWORD、V-SENSITIVE-WORDS | — |
| `https://rakuten-card-login.cn/` | warn/7 | warn/7 | danger/37 | V-BRAND-KEYWORD | — |
| `https://kuronekoyamato-redelivery.top/` | warn/9 | warn/9 | danger/39 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS | — |
| `https://apple-id-locked.icu/` | note/5 | note/5 | danger/35 | V-BRAND-KEYWORD、V-TLD-RISKY | 該当 |
| `https://paypay-bank.co.jp.verify.example/` | danger/16 | danger/16 | danger/46 | V-BRAND-SUBDOMAIN、V-BRAND-KEYWORD | — |
| `https://xn--mazon-3ve.co.jp/` | danger/16 | danger/16 | danger/46 | V-HOMOGRAPH、V-BRAND-TYPO | — |
| `https://amazon.co.jp@evil.example/` | danger/9 | danger/9 | danger/39 | V-USERINFO | — |
| `http://203.0.113.5/login` | warn/8 | danger/11 | danger/44 | V-IP-HOST | — |
| `https://vpass-member-verify.com/` | warn/7 | warn/7 | danger/37 | V-BRAND-KEYWORD | — |
| `https://myjcb-secure-verify.top/` | warn/9 | warn/9 | danger/39 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS | — |
| `https://etc-meisai.jp.payment-check.top/` | danger/16 | danger/16 | danger/46 | V-BRAND-SUBDOMAIN、V-BRAND-KEYWORD | — |
| `https://d-account-authentication.icu/` | warn/8 | warn/8 | danger/38 | V-BRAND-KEYWORD、V-TLD-RISKY | — |
| `https://e-navi-rakuten-card.icu/` | warn/7 | warn/7 | danger/37 | V-BRAND-KEYWORD、V-LABEL-ODD、V-TLD-RISKY | — |
| `https://e-tax-refund-confirm.top/` | note/4 | note/4 | danger/34 | V-SENSITIVE-WORDS、V-LABEL-ODD | 該当 |
| `https://saison-netanswer-verify.icu/` | warn/8 | warn/8 | danger/38 | V-BRAND-KEYWORD、V-TLD-RISKY | — |
| `https://aeon-card-auth.icu/` | note/5 | note/5 | danger/35 | V-BRAND-KEYWORD、V-TLD-RISKY | 該当 |
| `https://eposcard-secure-login.top/` | warn/9 | warn/9 | danger/39 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS | — |
| `https://eki-net-payment-update.icu/` | danger/12 | danger/12 | danger/42 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS、V-LABEL-ODD、V-TLD-RISKY | — |
| `https://mynumber-card-update.icu/` | warn/8 | warn/8 | danger/38 | V-BRAND-KEYWORD、V-TLD-RISKY | — |
| `https://tepco-payment-verify.icu/` | danger/10 | danger/10 | danger/40 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS、V-TLD-RISKY | — |
| `https://jp-bank-login-confirm.top/` | danger/11 | danger/11 | danger/41 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS、V-LABEL-ODD | — |
| `https://softbank-billing-verify.icu/` | danger/10 | danger/10 | danger/40 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS、V-TLD-RISKY | — |
| `https://netflix-payment-update.icu/` | danger/10 | danger/10 | danger/40 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS、V-TLD-RISKY | — |
| `https://microsoft-security-verify.icu/` | danger/10 | danger/10 | danger/40 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS、V-TLD-RISKY | — |
| `https://secure-paypay.pages.dev/login` | warn/9 | warn/9 | danger/39 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS | — |
| `https://apple-login.vercel.app/` | warn/7 | warn/7 | danger/37 | V-BRAND-KEYWORD | — |
| `https://amazon.netlify.app/login` | warn/7 | warn/7 | danger/37 | V-BRAND-KEYWORD | — |
| `https://google-account.web.app/verify` | warn/9 | warn/9 | danger/39 | V-BRAND-KEYWORD、V-SENSITIVE-WORDS | — |
| `https://bank-login.sakura.ne.jp/` | unknown/0 | ok/0 | danger/30 | なし | 該当 |
| `https://аpple.icu/` | danger/17 | danger/17 | danger/47 | V-HOMOGRAPH、V-BRAND-TYPO、V-TLD-RISKY | — |
| `https://random.top/amazon/login` | note/5 | note/5 | danger/35 | V-BRAND-KEYWORD | 該当 |
| `https://smbc-vpass.top/` | note/4 | note/4 | danger/34 | V-BRAND-KEYWORD | 該当 |

warn未満6件のうち、e-taxの欠落はJ5の実装上の問題。`bank-login.sakura.ne.jp`はブランドを含まず、現在のルールでは危険と断定できない入力で、共有先識別・境界の不足はJ3で別に指摘した。`apple-id-locked.icu`と`aeon-card-auth.icu`はlocked/authを敏感語として拾わず5点に止まる。`/amazon/login`は「パスだけ2点＋敏感語3点」、`smbc-vpass.top`は「ブランド4点」であり、現仕様どおりの未達。これらをwarnへ上げるなら、正規サイトの文脈と合わせて敏感語・点・floorの設計を見直す必要がある。無条件の増点はJ4の誤検知を増やす。

**個別の合成観測プローブ**

| ケース名／入力 | 実際の結果 | 所見／評価 |
|---|---|---|
| `redirect-to-brand-spoof` / `https://bit.ly/test` | ok/1点、owner=100 | V-SHORTENER=1 |
| `redirect-to-brand-spoof` / `https://t.co/test` | ok/0点、owner=100 | bad所見なし |
| `redirect-to-brand-spoof` / `https://www.google.com/url` | ok/0点、owner=100 | bad所見なし |
| `intermediate-spoof-then-clean` / `https://bit.ly/test` | note/4点、owner=100 | V-REDIRECT-CROSS=3、V-SHORTENER=1（途中のブランド偽装は未検出） |
| `cross-tenant-form-sakura.ne.jp` / `https://first.sakura.ne.jp/` | ok/0点、owner=100 | bad所見なし |
| `cross-tenant-form-tokyo.jp` / `https://first.tokyo.jp/` | ok/0点、owner=100 | bad所見なし |
| `cross-tenant-form-s3.amazonaws.com` / `https://first.s3.amazonaws.com/` | ok/0点、owner=100 | bad所見なし |
| `brand-content-at-user-host` / `https://s3.amazonaws.com/amazon-login/` | ok/0点、owner=100 | bad所見なし |
| `brand-content-at-user-host` / `https://bucket.s3.amazonaws.com/` | ok/0点、owner=100 | bad所見なし |
| `brand-content-at-user-host` / `http://bucket.s3-website-ap-northeast-1.amazonaws.com/` | warn/6点、owner=75 | V-HTTP=6、O-PASSWORD-HTTP=25 |
| `brand-content-at-user-host` / `https://user.github.io/` | warn/9点、owner=100 | V-BRAND-CONTENT=9 |
| `brand-content-at-user-host` / `https://tenant.pages.dev/` | warn/9点、owner=100 | V-BRAND-CONTENT=9 |
| `news-login-article` / `https://news.mynavi.jp/` | note/5点、owner=100 | V-BRAND-CONTENT=5 |
| `compound-short-brand` / `https://e-tax-login.top/` | ok/0点、owner=100 | bad所見なし |
| `compound-short-brand` / `https://verify.e-tax.top/` | ok/0点、owner=100 | bad所見なし |
| `compound-short-brand` / `https://ordinary.top/e-tax/login` | ok/0点、owner=100 | bad所見なし |
| `hsts-0` / `https://ordinary.example/` | ok/0点、owner=85 | O-HSTS-MISSING=15 |
| `hsts-15551999` / `https://ordinary.example/` | ok/0点、owner=95 | O-HSTS-WEAK=5 |
| `hsts-15552000` / `https://ordinary.example/` | ok/0点、owner=100 | bad所見なし |
| `redirect-parameter-same-registered-domain` / `https://example.com/?next=https://sub.example.com/` | ok/0点、owner=100 | bad所見なし |
| `same-cve-multiple-cdns-1` / `https://ordinary.example/` | ok/0点、owner=94 | O-VULN-LIB=6 |
| `same-cve-multiple-cdns-2` / `https://ordinary.example/` | ok/0点、owner=88 | O-VULN-LIB=12 |

news-login-articleは「Amazonのログイン方法を確認する」という解説記事相当の題でnote/5点になる。現在の「ブランド言及＋確認文脈」の仕様に忠実なので、主な実装バグには数えていない。ただし「ブランドを名乗る」という解釈と単なる言及は別で、ニュース除外を確実に保証する条件ではない。

**壊れた入力と契約の境界**

| 入力／変更 | 結果 | 判断 |
|---|---|---|
| 空文字・null・{}をparseInputへ | emptyで拒否 | 正常 |
| 全角HTTPS・英字・記号 | 正規化後unknown/0点、Result合格 | 正常 |
| https付きURL中のNUL・改行 | invalidで拒否 | 正常 |
| スキーム省略URL中のNUL | Parsed.ok=true、Result不合格 | J6 |
| pathのU+202E | %エンコード、unknown/0点、Result合格 | 双方向制御文字専用の警告はない。入力原文はtarget.inputに残るので、将来それを表示するときは可視化を検討 |
| 正常URLが2048字 | unknown/2点、Result合格 | 正常 |
| 2049/2050字・100020字 | too_longで拒否 | 正常 |
| 263字ホスト | note/4点、Result不合格 | J6 |
| trace={}・false・文字列 | unknown・Result合格 | 最終応答なしとして扱う |
| around={}・false・文字列 | TypeError（tested参照） | Around契約外。appの検査とaround除去fallbackはある |
| trace.final.headers欠損 | TypeError | Trace契約外 |
| trace.html.signals欠損 | TypeError | Trace契約外 |
| around.rdap欠損 | TypeError | Around契約外 |
| lexical=null・{}・false | TypeError | LexicalFacts契約外。通常のanalyzeLexicalの戻り値では発生せず |
| final.url='not a URL' | validateTraceは合格するがevaluateのnew URLでTypeError | スキーマはURLの意味まで検査していない。appではtraceを除くfallbackへ進む。契約検査の限界として記録 |
| TLS失敗＋around-clean | unknown/0点、score=null、Result合格 | RDAP情報では上書きしない |
| httpProbe.tested=true/status=null | O-NO-UPGRADEで15点減 | Aroundスキーマでは許されるが現在のobserve.jsのHTTP失敗経路はtested=falseを返すため、通常経路のバグには数えない |

**技術説明・データに関する補足**

CSPはscript-src/default-srcの簡易評価であり、script-src-elem/attrや複数ポリシーの実効的な積は見ていない。この制約はLIMITS_TEXTに明記されている。`default-src 'none'; script-src-elem *`でもO-CSP-OK、`default-src 'none', script-src *`ではO-CSP-WEAKとなることを再現したが、既知の制約として記録した。`frame-ancestors https:`もOK扱いで、任意のHTTPSサイトによる埋め込みまで防ぐ保証ではない。詳しい値の評価はしていない。

`script-src 'strict-dynamic' 'unsafe-inline'`を誤りとは数えなかった。CSP3のscriptのinline判定ではstrict-dynamic自身もunsafe-inlineを無効にする。[CSP3の該当アルゴリズム](https://www.w3.org/TR/CSP3/#allow-all-inline)を確認した。nonce/hashがないから必ずunsafe-inlineが有効、という指摘にはしない。

EOL表のPHP 5.6〜8.5、Apache 2.2（2017-12の月精度）、IIS 6〜8.5の期限はR2に一致する。nginx/IIS 10/.NETを番号だけでEOLにしない。古い系統への追加判定は依頼文で既知の修正として扱い、重複して取り上げていない。libs.jsの採用CVE範囲はR2の採用範囲と一致し、11022を除外、8203は共通範囲の候補と表示する。AngularJS/Vue 2のEOL日もR2に一致する。R2のlowのAngularJS/Vue CVEを全件検出する実装ではない。

resources.jsの電話・リンク値はR3の掲載値と一致した。未確認の外部サービスをverified=trueへ格上げした例は見つからない。verified=trueのSSL Labs/urlscanも「結果の表示まで確認済み」とは書いていない。外部サービスへのURL転送と、その意味を利用者へ説明する文はある。フォーム送信・各窓口への通話による実動確認はしていない。

**全ルールの1行照合**

下表の点・重大度・floorはrules.mdと実装を突き合わせた結果。「一致」はその行の条件と値の照合であり、データ表や共有境界の網羅性を保証しない。可変値の重大度は同じ順、floorはその値に対応するもの。O軸のfloorはすべてなし。


| ID | 条件の照合 | 点 | 重大度 | floor | 判定 |
|---|---|---|---|---|---|
| V-USERINFO | @の左がドメイン風 | 9 | high | danger | 一致 |
| V-IP-HOST | 数字のホスト（URL標準の正規化後） | 8 | high | warn | 一致 |
| V-HOMOGRAPH | 混在文字体系または紛らわしい文字 | 8 | high | warn | 一致。日本語＋Latinは対象外という試験上の扱いあり |
| V-PUNYCODE | xn--、HOMOGRAPHとの重複なし | 1 | info | — | 一致 |
| V-BRAND-SUBDOMAIN | 別の登録ドメインの手前に公式名 | 9 | high | danger | 値は一致。J1/J2/J3の対象範囲に問題 |
| V-BRAND-TYPO | skeleton一致／6字以上の編集距離1 | 8 | high | warn | 一致。入力URLだけの評価はJ1 |
| V-BRAND-KEYWORD | 名前4／パス2、敏感語+3、曖昧語は追加条件 | 4/7/2/5 | medium | — | 値は一致。J4/J5 |
| V-BRAND-CONTENT | 題等のブランド＋確認文脈、入力欄で+4 | 5/9 | high | —/warn | 値は一致。J2で公式免除が過大 |
| V-SENSITIVE-WORDS | ホスト／パスに2語以上 | 2 | low | — | 一致。部分文字列の語をそれぞれ数える |
| V-SHORTENER | 第三者短縮のみ | 1 | info | — | 一致。公式短縮の0点は転送先検査の免除ではない（J1） |
| V-TLD-RISKY | xin/icu/cfd | 1 | low | — | 一致。単独で危険と断定しない説明あり |
| V-LABEL-ODD | ハイフン3個以上／長い乱数風 | 2 | low | — | 一致 |
| V-DEEP-SUBDOMAIN | 登録ドメイン手前4段以上 | 2 | low | — | 値は一致。登録境界はJ3 |
| V-LONG-URL | 120字超／200字超 | 1/2 | info | — | 一致 |
| V-ENCODED | %6個以上／%00／二重encode | 2 | low | — | 一致 |
| V-REDIRECT-PARAM | url/redirect等に別宛先の絶対URL | 3 | medium | — | 別ホストと別登録ドメインの差はJ11 |
| V-HTTP | 最終応答HTTP、password欄で+3 | 3/6 | medium | — | 一致。最終応答なしでは推測しない |
| V-TLS-FAIL | tls_failed | 0 | info | — | 一致。status=unknown、HTTP応答の説明あり |
| V-REDIRECT-CROSS | 異なる登録ドメイン3つ以上／5つ以上 | 3/5 | medium | — | 値は一致。登録境界はJ3 |
| V-HTTPS-DOWNGRADE | 経路でhttps→http | 4 | medium | — | 一致 |
| V-NEW-DOMAIN | 0〜13／14〜29／30〜89／90〜364日 | 8/6/3/1 | high/high/medium/low | warn/warn/—/— | 一致。負数・非整数は不採用、365日から出さない |
| V-CROSS-FORM | password/card欄の別登録ドメイン送信 | 8 | high | warn | 値は一致。J3で見逃す |
| V-META-REFRESH | 別登録ドメイン、password欄で増点 | 2/3 | low/medium | — | 一致。境界はJ3 |
| V-HIDDEN-IFRAME | 非表示の別登録ドメイン、password欄で増点 | 1/3 | low/medium | — | 一致。境界はJ3 |
| V-OBFUSCATION | 重複なしの型を最大2種採点 | 2/4 | low | — | 一致 |
| V-DOWNLOAD-APK | 非HTMLのapk形式／名前／MIME | 10 | critical | danger | 一致 |
| V-DOWNLOAD-EXEC | 非HTMLの実行形式／スクリプト | 7 | high | warn | 一致 |
| V-DOWNLOAD-ARCHIVE | 非HTMLの圧縮／イメージ | 2 | low | — | 一致 |
| V-NOT-FETCHED | fetch.allowed=false、通信未実施 | 0 | info | — | 一致。status=unknown、理由別の案内あり |
| V-UNREACHABLE | 最終応答を取れない | 0 | info | — | 一致。status=unknown、理由と次の行動あり |
| V-BLOCKED-FETCH | challenge／403等の取得制限 | 0 | info | — | 一致。status=unknown。応答がある403ではpartial.trace=trueを保つ |
| V-OFFICIAL-DOMAIN | 公式表一致、利用者公開先は除く | 0 | info | — | 値・status=goodは一致。J2/J4/J7 |
| V-SHARED-HOST | freeHostまたはuserContentHost | 0 | info | — | 値・status=infoは一致。J2/J3の表の不足 |
| V-JP-RESTRICTED | 資格区分9種類 | 0 | info | — | 一致。status=good、個別ページの保証ではない |
| V-OLD-DOMAIN | 5×365日以上 | 0 | info | — | 一致。status=good。暦上の満5年とは閏日の差がある |
| O-NO-HTTPS | 最終HTTP、HTTPS到達不能 | 40 | critical | — | 一致。HSTS等のHTTPS前提所見なし |
| O-NO-UPGRADE | HTTPS利用可、HTTPProbeが転送なし | 15 | high | — | 一致。未取得tested=falseは出さない |
| O-HSTS-MISSING | HTTPSで有効HSTSなし | 15 | high | — | 0秒の分類はJ9 |
| O-HSTS-WEAK | max-ageが15552000秒未満 | 5 | medium | — | 正の値は一致。0はJ9 |
| O-CSP-MISSING | 強制CSPなし、Report-Onlyのみも同じ | 15 | high | — | 一致。metaありはWEAK |
| O-CSP-WEAK | 広いscript指定／metaのみ | 8 | medium | — | 一致。script-srcもdefault-srcもない場合も弱い |
| O-FRAME-MISSING | 有効XFOもframe-ancestors制限もなし | 8 | medium | — | 一致。metaのframe-ancestorsを数えない |
| O-XCTO-MISSING | 有効nosniffなし | 5 | low | — | 一致 |
| O-REFERRER-MISSING | 有効ヘッダー／metaの方針なし | 3 | low | — | 一致。既定値任せと説明 |
| O-COOKIE-SECURE | HTTPSのsession推定CookieでSecureなし | 10 | high | — | 一致。計測系除外、用途は推測と説明 |
| O-COOKIE-HTTPONLY | session推定CookieでHttpOnlyなし | 6 | medium | — | 一致 |
| O-COOKIE-SAMESITE | session推定CookieでSameSiteなし | 2 | low | — | 一致。None+Secureを誤って減点しない |
| O-VERSION-DISCLOSURE | Server等に版番号 | 2 | low | — | 一致。ASP.NETの文字だけでは版としない |
| O-EOL-SOFTWARE | PHP/Apache/IISの終了した系統 | 10 | high | — | 一致。R2の期限とバックポート注記あり |
| O-MIXED-ACTIVE | HTTPSでhttp script/css/iframeの指定 | 15 | high | — | 一致。実行成功とは断定しない |
| O-MIXED-PASSIVE | HTTPSでhttp画像 | 3 | low | — | 実装は画像の事実を評価。modelにメディア件数がなく、rulesの「画像/メディア」のメディア側は評価不能 |
| O-SRI-MISSING | 別ホストscript/cssにintegrityなし | 3 | low | — | 一致。非HTMLでは出ない |
| O-VULN-LIB | 採用CVEの版範囲と一致、CVSS別点 | 10/6/3、合計15まで | high/medium/low | — | 重み・上限は一致。同じCVEの重複はJ8 |
| O-EOL-LIB | AngularJS1／Vue2 | 4 | medium | — | 一致。上流終了と延長保守を区別 |
| O-FORM-HTTP | HTTPS上のフォーム送信先がhttp | 10 | high | — | 一致 |
| O-PASSWORD-HTTP | HTTPページにpassword欄 | 25 | critical | — | 一致。V-HTTPとは別軸 |
| O-DIR-LISTING | directoryListingの抽出事実 | 10 | high | — | 一致。題の一致だけで意図までは断定しない |
| O-ERROR-DISCLOSURE | errorDisclosureの抽出事実 | 8 | medium | — | 一致 |
| O-DEFAULT-PAGE | defaultPageの抽出事実 | 2 | low | — | 一致 |
| O-DMARC-MISSING | DNS取得済み、DMARCなし | 2 | low | — | 一致。DNS unavailableでは出さない |
| O-SPF-MISSING | DNS取得済み、SPFなし | 1 | low | — | 一致。DNS unavailableでは出さない |
| O-DMARC-WEAK | DMARC none／SPF +all・?all | 1 | info | — | 一致。bad/statusで1点 |
| O-CORS-WILDCARD-CREDS | ACAO=*かつACAC=true | 3 | low | — | 一致。ブラウザ拒否の説明あり |
| O-DEPRECATED-HEADER | X-XSS有効／HPKP／Expect-CT | 0 | info | — | 一致。status=info。X-XSS=0は除外 |
| O-STATUS-NOTE | 応答状態400以上 | 0 | info | — | 一致。status=info、エラー画面の限界を説明 |
| O-SECURITY-TXT | 取得済みならfoundでgood/info | 0 | info | — | 値・statusは一致。説明の主体はJ10 |
| O-HTTPS-OK | 最終HTTPS | 0 | info | — | 一致。status=good |
| O-HSTS-OK | max-ageが15552000以上 | 0 | info | — | 一致。status=good |
| O-CSP-OK | 強制CSPに簡易評価の弱さなし | 0 | info | — | 一致。status=good、細かい実効値は未確認と表示 |
| O-FRAME-OK | 有効XFOまたはframe-ancestors | 0 | info | — | 一致。status=good、frame-ancestors *は除く |
| O-XCTO-OK | 有効nosniff | 0 | info | — | 一致。status=good |
| O-REFERRER-OK | 有効ヘッダーまたはmeta | 0 | info | — | 一致。status=good、unsafe-urlを強い保護とは書かない |
| O-COOKIE-OK | session推定Cookieの欠落なし、またはなし | 0 | info | — | 一致。status=good、未検出と属性確認を文で分ける |
| O-UNKNOWN | 最終応答なし | 0 | info | — | 一致。status=unknown、owner.score/grade=null |

O-MIXED-PASSIVEの「メディア」は、rules.mdにはあるがmodel.mdのHtmlFactsには対応する件数がなく、今回の判定側だけでは評価できない。仕様の対象を画像だけにそろえるか、観測契約にもvideo/audio等を足す判断が残る。これは判定コード単独の不具合とは数えていない。

**点数の境界**

| 軸 | 入力→結果 |
|---|---|
| visitorLevel | 0→ok、2→ok、3→note、5→note、6→warn、9→warn、10→danger |
| floor | 0点でもwarnならwarn、dangerならdanger。既存試験を再実行して確認 |
| gradeOf | 0→F、39→F、40→D、59→D、60→C、74→C、75→B、89→B、90→A、100→A |
| ownerScore | owner/badの点だけを100から引き、0で下げ止め。visitorの点は引かない |
| 登録日 | 13/14、29/30、89/90、364/365日の境界は仕様どおり（既存試験を再実行） |
| 長さ・型数 | 120/121、200/201字、難読化1/2種、転送先3/5ドメインの条件は仕様どおり |
| 表示順・上限 | 軸→status→重大度→点。reasons/actions/evidence/topFixesは各最大3、topFixesは点と重大度順 |

**再実行**

```sh
node --test day-074-link-dokumi/tests/address.index.mjs day-074-link-dokumi/tests/judge.index.mjs
node .agent-harness/reviews/day074-judge-probes/probe.mjs --summary
node .agent-harness/reviews/day074-judge-probes/probe.mjs --compact
node .agent-harness/reviews/day074-judge-probes/probe.mjs --case=redirect-to-brand-spoof
node .agent-harness/reviews/day074-judge-probes/probe.mjs --case=brand-content-at-user-host
node .agent-harness/reviews/day074-judge-probes/probe.mjs --case=compound-short-brand
```

`--summary`は再現結果の要約を出し、終了コードで製品の合否を表さない。既知の不具合も結果として収集するプローブである。修正後は入力・観測・期待値を確認した上で回帰試験へ取り込むこと。

対象の代表的なSHA-256：rules.js `e2e46d9604099e50650288a5c4be1fe73a082b2dbf62148a7d9c3186ef098fb0`、brands.js `54aafac00508e45fad1004288107d953cf1923f6695e30a8d14e80ef64fc9aaa`、messages.js `ee8e84d84cb104d918122cb60dbcbb41edb5dfb5612d56e61ff5090d48f7b70c`。並行作業で対象が変わった場合は、このレビューの再現結果と区別する。

