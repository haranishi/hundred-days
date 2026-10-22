# A2H受領書（2026-10-22）

## 実装
- `day-074-link-dokumi/lib/rules.js`: 入力に加え、Traceの途中・最終ページにもparseInput→analyzeLexicalを適用。指定8種類の見た目の所見だけを再評価。同じホストは入力の評価を維持し、同じIDは最大点1件だけ採用。根拠の先頭に「入力」「転送の途中」「最終ページ」を付け、採用所見のfloorも維持。
- 入力が公式でも、別登録ドメインかつ同じブランドの公式でない経路があればV-OFFICIAL-DOMAINをinfoに変更。同ブランドの公式間の転送はgood。公式短縮も転送先を評価。
- V-BRAND-CONTENTはフォームも入力欄もなければ2点/low/floorなし、パスワード・カード・メール入力があれば9点/high/floor warn。その他のフォームがある従来の確認文脈は5点を維持。最終ホストのuserContentHostがtrueなら公式ブランドの本文免除を使わない。
- HSTS解除のmax-age=0は15点のまま、whatとevidenceに解除の事実を記載。V-REDIRECT-PARAMは別ドメインという文面に統一。
- `day-074-link-dokumi/lib/libs.js`: lib・versionでまとめてhosts配列に配信元を保持。従来のhost項目は最初の配信元として維持。これにより同一lib・version・CVEの加算は1回で、複数配信元は所見の根拠1行に集約。合計上限15点を維持。
- `day-074-link-dokumi/lib/messages.js`: ブランド3所見は「この診断の公式ドメイン一覧にはありません」とし、名前を使った別サービスの可能性や紛らわしい並びと確認方法を記載。security.txtは発見者から運営者へ連絡する窓口と説明。
- `report.js`は所見のwhyをそのまま使うため変更不要。O-MIXED-PASSIVEは既に画像のみの表現で、変更不要。
- テスト変更: `tests/judge-rules.test.mjs`（26件追加）、`tests/judge-headers.test.mjs`（2件追加）。両ファイルとも既存の`tests/judge.index.mjs`からimport済み。新たな入口の登録漏れなし。
- `notes_A2H.md`にファイル単位の進捗を追記。本受領書以外の仕様・契約・fixture・他担当のファイルは変更していない。

## 公開関数とカタログ
- 既存exportの署名は維持: `evaluate(input, deps)`・`RULE_CATALOG`、`detectLibs(scriptRefs, options)`・`compareVersions(a,b)`、`MESSAGES`ほか既存文面定数。
- evaluateのdepsに既定の純関数を差し替える`parseInput`・`analyzeLexical`を追加。新たなexportはなし。
- detectLibsの各項目にhosts配列を追加。
- RULE_CATALOGは74件のまま。MESSAGESも74IDで、ID一覧の追加・削除なし。V-BRAND-CONTENTの点の候補は既存5/9に2を追加。

## 検証
- 変更前: `node --test day-074-link-dokumi/tests/judge.index.mjs` 253/253合格。
- 最終: 同コマンド281/281合格（28件増、fail/cancel/skip=0）。全ID到達・点数表・文面の禁止語・文字数・文数の既存検査も合格。
- 最終: `node --test day-074-link-dokumi/tests/` 895件中891件合格・4件失敗（cancel/skip=0）。判定側の失敗なし。
- 担当外の4件: address-domains.test.mjsの「第三者公開先18件は登録境界の表と一致する」（PSL変更後、subdomainLabelsにtenantも入る）、address-lexical.test.mjsの「LexicalFactsの全項目は通常のURLで揃う」（isPublicSuffix/sectionの追加）、同ファイルの「第三者公開先18件は登録境界と提供者を返す」（weebly.comのfreeHostがnull）、address-regressions.test.mjsの「A1F 正規ドメインの誤検知なし: s3.amazonaws.com」（ブランドsubdomain所見）。メイン/A1HでPSL・住所側の実装と期待値を照合する必要がある。触っていない。
- レビューのオフラインプローブ`--case=redirect-to-brand-spoof`も実行。bit.ly経由19点/danger、t.co経由18点/danger、Google経由18点/danger（入口公式はinfo）。3件ともResult契約合格。
- jQuery 3.4.1を2CDNで示した試験は94点を確認。本文の解説記事2点/ok、入力欄9点/warn、途中だけ偽装・同じIDの最大点採用も回帰試験で確認。
- 既存テストの期待値は変更していない。ブランド本文の既存試験は「確認文脈5点」を「一般フォーム5点」と題名だけ変更（clean fixtureには一般検索フォームがあるため、フォームなし2点とは区別）。

## メインがrules.mdへ反映する差分
- 指定の見た目8ルールを取得済みの転送先にも適用し、同じIDは最大点・そのfloor1件だけ採用。証拠に経路上の位置を示す。
- V-OFFICIAL-DOMAINは別登録ドメインの経路が同ブランドの公式でなければinfoとし、入口だけの公式一致を示す。
- V-BRAND-CONTENT: フォームも入力欄もなしは2点/low、password/card/email入力ありは9点/high/floor warn。その他のフォームあり・確認文脈ありは従来の5点を維持。
- O-VULN-LIB: 同じlib・版・CVEは配信元が異なっても1回。証拠に複数配信元を集約、合計15点上限。
- O-HSTS-MISSING: max-age=0は保護解除として15点。O-HSTS-WEAKの正の秒数と区別。
- V-REDIRECT-PARAM: 「別ホスト」でなく「別登録ドメイン」。O-MIXED-PASSIVEは画像だけ。
- V-BRAND-KEYWORD/SUBDOMAIN/TYPOは一覧未掲載を事実として示す。security.txtは運営者の受け付け窓口。
- 依頼で指定されたV-NOT-FETCHED・V-SHARED-HOST・O-STATUS-NOTEの仕様追記はメインに委ねる（コード挙動は今回変更なし）。

## 判断・未実施
- 一般フォーム（検索など）だけがある場合は依頼の「フォームも入力欄も一つもないとき」に当たらないため5点を維持した。メール欄は依頼どおり9点に含めた。さらなる仕様分岐なし。
- 全体の4失敗は担当境界のため解消できていない。上記の証拠を返す。contract.jsの修正は不要。
- 指示どおりネットワーク接続・ブラウザ起動・依存導入・Git書き込み・commit/push/PR作成は行っていない。ビルド・公開ゲート・本番検証も本担当のオフライン判定修正の範囲外で未実施。
