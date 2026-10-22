# A2G 受領書

2026-10-22。指定の判定担当範囲で実装・オフライン検証を完了。

## 変更したファイルと公開関数

- `day-074-link-dokumi/lib/rules.js`: `evaluate` / `RULE_CATALOG`。公開名・引数・Result契約は維持。
- `day-074-link-dokumi/lib/messages.js`: `MESSAGES` / `ACTIONS`。公開名を維持。
- `day-074-link-dokumi/lib/eol.js`: `detectEol`。古い系統では `eolDate:null` を返す。
- `day-074-link-dokumi/tests/judge-rules.test.mjs`: 回帰42件追加、今回変わったTLS・日本語表示の旧期待値を更新。
- `day-074-link-dokumi/tests/judge-headers.test.mjs`: 回帰9件追加。
- `notes_A2G.md` と本受領書。

新しい公開関数はない。headers.js / libs.js / score.js / report.js / resources.js / samples.js は変更していない。契約・fixtures・テスト入口・住所担当・観測担当・UI・仕様・ルート設定は変更していない。

## 実装内容

1. 最終応答が取れず目視の合計が0〜2点ならunknown、見出し・行動はunknown用にする。理由の先頭に接続できなかった説明を入れ、見えた兆候を続けて最大3件。目視だけでnote以上になる場合の段階とfloorは維持し、summaryに見た目だけで判断した旨を明記。
2. 隠し別登録ドメインiframeは通常1点・low、パスワード欄ありなら3点・medium。別登録ドメインmeta refreshは通常2点・low、パスワード欄ありなら3点・medium。RULE_CATALOGの候補・重大度・条件注記も合わせた。
3. PHP 4.x〜5.5、Apacheの2.2より古い系統、IISの6.0より古い系統は、時計に依存せず終了済みとして返す。終了日は捏造せずnullにし、detailには延長保守・修正適用の未確認を説明。所見の根拠欄にもnullの文字列ではなく説明を表示。
4. O-HSTS-MISSING / O-NO-UPGRADEのwhyにプリロード一覧の効果と一覧掲載の未確認を追記。fix・設定例・減点は維持。
5. timeout / dns_failed / connect_failed / tls_failed / blocked_by_challenge / blocked_redirect / too_many_redirects / resolver_unavailable / blocked_target / invalid_url / upstream_errorを日本語の説明へ変換。TLSのHTTP応答はdetailがhttp_respondsのときだけ追記。失敗のwhyに次の行動を入れた。接続見送り理由、周辺情報の失敗、RDAP、trace.notes、HTTPS確認の根拠にも生の内部コードを表示しない。
6. 403/429は取得制限の可能性を訪問者へ未確認・0点で説明。5xxはボット対策を示す応答ヘッダーや本文の特徴がある場合に同じ説明を追加し、一般の5xxとは区別。400以上のO-STATUS-NOTEは維持。応答を取れた場合はpartial.trace=trueを維持。
7. ダウンロードのowner.noteに「ダウンロードされるファイルなので、サイトの守りの点数は付けていません」を追加。

## 検証結果

- 修正前 `node --test day-074-link-dokumi/tests/`: 761件成功。
- 最終 `node --test day-074-link-dokumi/tests/`: **812件成功、失敗0、skip0**。他担当を含む。
- `node --test day-074-link-dokumi/tests/judge.index.mjs`: **253件成功**（修正前202件、51件増加）。既存入口のimportで追加試験が登録されることを確認。
- 変更した実装3ファイル・テスト2ファイルの `node --check`: 全件成功。
- 回帰51件の内訳: 判定42件、古いサーバーソフト系統9件。後者は過去・現在・無効な日時でも判定が変わらないことを各試験内で検査。
- 実サイト観測を使った再構成は **4件**: 朝日新聞・東京大学・Yahoo!の隠し広告/計測iframeが各1件、GoogleのHSTS未指定が1件。依頼文で報告された特徴をclean fixtureの形へ手書きで再構成した試験であり、実応答全文を保存・再現したものではない。パスワード欄ありの場合等の比較も同じ試験内で確認。共有fixturesは変更していない。
- 全trace fixture、主なerror.code、周辺情報未取得について、limits/reasons/whatにアンダースコア入り内部コードが出ない回帰を追加。主要error.codeではevidenceも検査。既存の契約・禁止語・点数・所見到達・見本一致の検査も成功。

## メインが仕様へ反映・確認する点

- rules.md: V-HIDDEN-IFRAMEの1/3点・low/medium、V-META-REFRESHの2/3点・low/mediumとパスワード欄による条件。
- model.md / rules.md: partial.trace=falseかつ目視0〜2点はunknown、note以上は維持、unknownの理由・行動とsummaryの規則。
- **TLSの整合**: 旧rules.mdのV-TLS-FAILは4点・mediumだったが、今回の「兆候のないtrace-tls-failed fixtureでもunknown」と「未取得では目視だけで段階を決める」を両立させるため、V-TLS-FAILをstatus=unknown・0点・infoに変更した。4点を保持したまま段階だけunknownにする方式は採用していない。この点も仕様に明記してほしい。
- eol.jsの古い系統、HSTSプリロード未確認、HTTPエラー応答の取得制限所見、ダウンロードの採点対象外理由、日本語の失敗説明を関連仕様に追記。
- 未取得の内部コードを画面へ直接出さず、観測データそのものは維持する。trace.notesの生の文字列は公開文面へ渡さず、取得制限があった旨の共通注記にする。
- A2F受領書の仕様反映事項は引き続きメイン側の担当。contract.jsや住所担当に今回修正が必要な問題は見つけていない。

## 未実施

ネットワーク・ブラウザ・実サイトへの再取得・依存導入・Git書き込み・commit/push/PRは指定どおり実施していない。ビルド・公開ゲート・E2E・本番確認・独立レビューは担当範囲外として未実施。指定された単体テストの未完了はない。
