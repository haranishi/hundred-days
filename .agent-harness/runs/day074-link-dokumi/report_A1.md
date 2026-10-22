# A1（住所）受領書

依頼の6モジュール・テスト5ファイル・担当のテスト入口を実装した。仕様、contract.js、fixtures、他担当のファイルは変更していない。依存追加・ネットワーク・ブラウザ・Git書き込みは実行していない。

## ファイルと公開する関数・データ

| ファイル | 公開するもの |
|---|---|
| day-074-link-dokumi/lib/url-input.js | extractUrl(raw)、parseInput(raw, {includeQuery}) |
| day-074-link-dokumi/lib/punycode.js | toUnicode(label)、toUnicodeHost(host) |
| day-074-link-dokumi/lib/psl.js | registrableDomain(host) |
| day-074-link-dokumi/lib/lists.js | SHORTENERS、FREE_HOSTS、RISKY_TLDS、SENSITIVE_WORDS、CONFUSABLES、REDIRECT_PARAM_NAMES、RESTRICTED_JP |
| day-074-link-dokumi/lib/brands.js | BRANDS、findOfficialBrand(host, registrable)、matchBrands(lexicalParts)、brandKeywordsInText(text) |
| day-074-link-dokumi/lib/lexical.js | analyzeLexical(parsed) |
| day-074-link-dokumi/tests/address-punycode.test.mjs | RFC3492の18例、日本語.jp、münchen、壊れた入力・巨大入力 |
| day-074-link-dokumi/tests/address-domains.test.mjs | 登録境界、指定2階層サフィックスと第三者公開先全件、データ件数 |
| day-074-link-dokumi/tests/address-brands.test.mjs | 公式の全ドメインと配信先、指定の誤検知・兆候、Unicode編集距離、一般語除外 |
| day-074-link-dokumi/tests/address-input.test.mjs | 抽出・正規化、Parsed全項目、エラー、通信可否の共通ベクトル、一度きりの手がかり |
| day-074-link-dokumi/tests/address-lexical.test.mjs | LexicalFacts全項目、文字体系、符号化、転送、巨大入力・純関数性 |
| day-074-link-dokumi/tests/address.index.mjs | 上記5ファイルのimport登録 |

## データの件数

- ブランド36件（R1 §A2）。正規ドメイン78エントリ／重複を除き76件、配信専用ドメイン8件。両方を合わせた登録単位は84件。
- 公知の正規ドメイン追加6件（amazon.com、office.com、outlook.com、onedrive.com、youtube.com、gmail.com）。Amazonの配信先4件も公知として追加。各項目の `domainSources[domain] = {source:'公知'}` で、ブランド自体の `source:'research/R1 §A2'` と区別した。
- 短縮URL24件（第三者16件・公式8件）。第三者公開先18件。弱い目安のTLD3件。
- 汎用語 mileage と kurashi はweakKeywordsにし、ドメインの照合に使っていない。

## 検証

- `node --test day-074-link-dokumi/tests/address.index.mjs`：最新178件、178合格・0失敗（約72ms）。入口に全5ファイルを登録済み。
- `node --test day-074-link-dokumi/tests/`：最新484件、483合格・1失敗（約225ms）。住所担当以外のテストが同時に追加され、途中では全313件合格した。初期の既存入口は8件のみだった。
- 最新の全体失敗は `tests/judge-rules.test.mjs` の「目視ルール V-REDIRECT-PARAM」。`lib/rules.js` の所見文に「絶対URL」があり、`messages.js` の禁止語「絶対」に掛かる。住所担当の生成した事実の失敗ではない。担当外のため修正していない。
- 初回住所試験で見つかった試験側の誤りを修正（apple.exampleは登録ラベルそのものなのでkeyword対象。ヘブライ／アラビアとLatinの混在はURLのIDNA検査で先に拒まれるため、入力拒否と文字体系判定を別に確認）。
- 末尾ドットは脅威モデルに合わせて通信を控える。共通宛先ベクトル32件でクライアント・サーバーの許可可否を比較した。
- RFC3492を自作し、PSL・他ライブラリの実装は転記していない。復号上限は256字（RFCの韓国語の例が63字を超えるため）。巨大な復号入力は元のまま返す。
- ブラウザ実操作、ビルド、公開ゲート、独立レビューは担当範囲外で未実施。

## 仕様の食い違い・メインが判断する点

1. **通信前判定とtarget-guardの一部が違う。** A1指示は80/443以外を拒否するため、`https://example.com:80/` と `http://example.com:443/` はブラウザ側で許可する。現在のtarget-guardはスキーム既定以外の明示ポートをすべて拒否する。仕様のどちらに統一するかはメインへ返す。
2. **追加の予約名・ホスト書式。** target-guardは`.corp`・`.intranet`・`.private`・`.arpa`全域、下線や先頭ハイフンを含むホスト等も拒否する。A1指示の予約名一覧とWeb標準URLの解釈だけではこれらを拒否しないため、ブラウザは通信を試みてもサーバーで止まる。サーバーが最終の門番という指定を守り、追加条件の採否はメインへ返す。
3. **空のuserinfo。** ブラウザは`https://@example.com/`もuserinfoとして通信を控えるが、現在のtarget-guardはURL正規化で空の認証欄が消え、許可する。認証情報がある場合の理由名もブラウザ`userinfo`／サーバー`credentials`で異なる（共通テストは許可可否を比較）。
4. **Herokuの分類。** A1の明示指定に従い`herokuapp.com`をFREE_HOSTSに含めたが、R1 §C3は無料枠終了とする。画面ではこの表全体を「無料」と断定せず、「第三者が公開できるホスティング」として扱う必要がある。
5. **paypa1のブランド名。** 指定36ブランドにPayPalは無いため、新しいブランドや未検証の正規ドメインを加えていない。指定の距離1規則により、`paypa1.example`はPayPay（paypay）に対する`distance1`としてtypoが出る。PayPalの紛らわしい文字（confusable）として扱いたい場合は、参照ブランド追加の判断が必要。
6. **データの出典の表現。** 指定のBRANDSのドメイン配列は文字列配列を保ち、項目別出典を追加のdomainSourcesで表した。契約の定数・検査器は変更不要だった。

## できなかったこと

最新の全体試験を全件合格にはできていない。失敗は上記の別担当の禁止語検査1件で、A1の変更範囲には含まれない。実ネットワーク・UIの検証は依頼の共通指示により実施していない。
