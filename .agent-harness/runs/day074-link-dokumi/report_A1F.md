# A1F（住所担当の手直し）受領書

## 結果

- 指定の正規ドメイン96件中、brand.subdomain / typo / keywordの兆候が付いた件数は **0件**。
- 指定の偽装URL22件は、期待したファクトをすべて検出した。
- 住所担当入口：377件合格・0失敗。新規回帰テスト200件をaddress.index.mjsへimport登録した（従来178件から、公式期待を取り除いたGoogle Docsの1件を除き、199件増）。
- 最新の全体試験：`node --test day-074-link-dokumi/tests/`、717件合格・0失敗。開始時は487件合格。全体の件数には別担当の同時変更が含まれる。

## 作成・変更したファイルと公開するもの

- `day-074-link-dokumi/lib/brands.js`：BRANDS、findOfficialBrand(host, registrable)、matchBrands(parts)、brandKeywordsInText(text)。既存署名を維持。matchBrandsは任意のparts.pathも受け取り、URLデコード・NFKC・小文字化後にパスを照合する。
- `day-074-link-dokumi/lib/lists.js`：既存のSHORTENERS、FREE_HOSTS、RISKY_TLDS、SENSITIVE_WORDS、CONFUSABLES、REDIRECT_PARAM_NAMES、RESTRICTED_JPを維持。SHARED_HOSTS、USER_CONTENT_HOSTS、isUserContentHost(host)を追加。
- `day-074-link-dokumi/lib/lexical.js`：analyzeLexical(parsed)。LexicalFactsにuserContentHost:booleanを追加。
- `day-074-link-dokumi/lib/url-input.js`：extractUrl(raw)、parseInput(raw, {includeQuery})。通信可否と理由はtarget-guard.jsのvalidateTargetを使う。
- `day-074-link-dokumi/tests/fixtures/legit-domains.json`：正規ホスト名配列96件。
- `day-074-link-dokumi/tests/fixtures/phish-urls.json`：URLと期待するファクト22件。
- `day-074-link-dokumi/tests/address-regressions.test.mjs`：新規200テスト。正規96件、偽装22件、追加仕様9件、門番との比較73件（既存attack fixtureの攻撃45件・正規8件＋追加20件）。
- `day-074-link-dokumi/tests/address-brands.test.mjs`、`address-input.test.mjs`、`address-lexical.test.mjs`：下記の仕様変更に対応する既存期待値を更新。
- `day-074-link-dokumi/tests/address.index.mjs`：新規回帰テストのimport登録。
- `.agent-harness/runs/day074-link-dokumi/notes_A1F.md`：各ファイルの完了メモ。
- この`report_A1F.md`。

psl.js、punycode.jsは変更不要。contract.js、既存fixtures、tests/index.mjs、target-guard.js、他担当のファイル、仕様文書、直下設定には手を加えていない。

## 追加した公式ドメイン（19件）

すべてブランドの`domainSources[domain] = {source:'公知'}`に記録した。ブランド自体の一次調査のsourceは維持。今回独自に追加したドメインはなく、指示された19件だけを追加した。

- Microsoft（8）：office365.com、microsoft365.com、windows.com、bing.com、msn.com、xbox.com、skype.com、msftauth.net。
- ヤマト（1）：yamato-hd.co.jp。
- ドコモ（1）：nttdocomo.co.jp。
- Apple（2）：apple.co.jp、apple.com.cn。
- みずほ（2）：mizuho-fg.co.jp、mizuho-sc.com。
- 三井住友カード（1）：vpass.ne.jp。
- 楽天グループ（4）：rakuten-sec.co.jp、rakuten-insurance.co.jp、rakuten.com、rakuten.ne.jp。

## キーワードと照合

- 強い語からmitsubishi、sumitomo、mitsui、suicaを除外。suicaはweakKeywordsへ移した。kurashi、mileageは既に弱い語で、引き続きドメイン照合には使わない。
- contentNamesには「三井住友」「三菱UFJ」を保持・追加した。
- 各BRANDSのambiguousKeywordsは、そのブランドの強い語のうちyamato、sagawa、saison、apple、amex、aeon、eposに当たる語。eposは従来弱い語だったが、追加の手がかりを要求する強い語として登録した。
- 曖昧語はホスト/パスの敏感語、ホストにハイフン2つ以上、既存の弱い目安TLD（xin/icu/cfd）、第三者公開ホストのいずれかがあるときだけkeywordになる。topはTLDリスクへ追加せず、yamato-redelivery.topはredeliveryで検出する。
- 公式ドメイン文字列をホスト全体のラベル列から探すため、www.mufg.jp.cnも検出する。文字列だけの非境界一致はしない。
- 手前ラベルも4〜5字はハイフン区切りの完全一致、6字以上は部分一致。パスは4字以上の強い語と、/・-・_・.で区切った語の完全一致。
- 同じkeyword・whereは最初のブランドだけ。同じ場所で既出の語を含むハイフン複合語も重ねない（rakutenとrakuten-cardでrakuten-card-login.cnを2件にしない）。
- 配達・金銭・脅しの指定20語をSENSITIVE_WORDSに追加。クエリは敏感語の対象外。

## メインが仕様へ反映すべき点

1. **モデル**：LexicalFactsに`userContentHost:boolean`を追加。contract.jsの検査対象ではなく変更不要。BRANDSの`ambiguousKeywords:string[]`とその追加手がかり、パス照合、共有語の重複抑止を設計・ルールへ記録する。
2. **公式と利用者コンテンツの区別**：`findOfficialBrand`はUSER_CONTENT_HOSTSそのものと配下でnullを返す（署名・返り値の型は従来と同じ）。`matchBrands(...).official`もnull。Google Docsのように登録ドメインが提供者の公式名の場合、その提供者の名前自体を偽装の悪い所見にはしない。他ブランドは引き続き検査する。
3. **一覧と関数**：USER_CONTENT_HOSTSは既存SHARED_HOSTSの18件と、sites.google.com・docs.google.com・drive.google.com・forms.gle・storage.googleapis.com・googleusercontent.com・sharepoint.com・azurewebsites.net・blob.core.windows.netの9件（合計27件）。`isUserContentHost(host) → boolean`は小文字・NFKC・末尾ドット除去後、完全ホスト名またはドット境界つきの配下を判定する。google.com全域・windows.net全域へ広げていない。研究で利用状況未確認のホストは追加していない。
4. **通信前判定**：parseInput.fetchはvalidateTargetの結果を使用。credentials→userinfo、bad_host→reserved_name、その他の理由は指定の対応。スキームの既定以外のポートを拒否、空の認証欄はhasUserinfo:falseで許可。予約名・ホスト書式も門番と同じ。単体URLの制御文字・ホスト内空白は抽出で切り落として許可しないよう、入力段階でinvalidを返す。既存攻撃fixtureと追加ベクトル73件で許可可否と、Parsedが成功したときの理由を比較した。
5. **料金と共有先を混同しない**：SHARED_HOSTSへ改名し、FREE_HOSTSは同一オブジェクトのエイリアス。freeHostの契約形は維持。herokuapp.comは残した。画面では「無料」とせず「誰でもページを置けるサービス」と書く必要がある（画面の変更は担当外）。

## 既存テストを変えた理由

- address-brands：docs.google.comを「公式」とする既存ループから除外した。新規の正規ドメイン回帰で兆候0を確認し、USER_CONTENT_HOSTS全件の別試験で公式nullも確認する。
- address-brands：appleid-apple.exampleの陽性例をappleid-apple-verify.exampleへ変更。曖昧語appleは追加手がかりが必要になったため。手がかりなしで空、4種類の手がかりがあると陽性になることを新規試験で固定する。
- address-input：httpsの80/httpの443を許可する期待を、portによる拒否へ変更。空userinfoを拒否する期待を、hasUserinfo:false・通信許可へ変更。いずれも今回の明示指示。
- address-lexical：全項目の完全一致期待にuserContentHost:falseを追加。従来の項目の期待を緩めていない。
- 新規の曖昧語テスト作成時、apple.comを非公式の陽性例にしてしまったため、非公式の.topへ訂正。公式除外は維持している。

## 検証と制約

住所試験377件と全体717件はすべてオフライン。通信・ブラウザ起動・依存導入・Git書き込み・ビルド・公開は行っていない。今回の契約はユニット試験までで、画面文言・仕様の更新はメインへ引き継ぐ。
途中の全体実行では別担当の観測テスト2件が失敗していたが、担当外ファイルには触れていない。最終実行時点ではそれらも合格した。未解決のテスト失敗はない。
