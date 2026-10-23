# Day075 セキュリティレビュー

判定：**PASS**。移植ソース・実配布24件・生成ヘッダーに再現する脆弱性・必須修正なし。

## 対象と独立性

- 対象：Day75のHTML/CSS/JS/lib/shared/assets/metaと、共通dist除外規則・ヘッダー生成部分。
- security-and-hardeningスキルに沿い、URL・端末保存値・共有・DOM・音資源を点検した。
- 移植実装と分離した監査。製品変更なし。通常ビルドは実行していない。
- ローカルの許可済みコードと検証contextのみ使用。第三者へ攻撃・投稿・送信しない。

## 移植差分・配布境界

- lib/shared/CSS/アイコンは監査済み移植元と同一。
- 主な差分は固定canonical/OGP/共有文、location由来の上書き削除、紹介SVGの20面表記。
- meta.publicUrlとcanonicalは同じ正規HTTPS URL。紹介用og.pngの実在を確認。
- 実ファイルへisServedPathを適用し、最終配信24件、除外10件を確認。
- toolsの探索・ブラウザ検証2件とtestsの8件は配信対象外。
- 開発server、検証artifact、個人用仕様、秘密設定はDay本体へ混入していない。
- 配信対象とGitHubへ追加するテスト/ツール/仕様も走査。秘密tokenパターン・個人絶対パス・symlinkなし。

## 未信頼入力の評価

| 経路 | 確認結果 |
|---|---|
| URL/query/hash | HTML文字列へ連結しない。移植後の共有URLは固定canonicalを利用 |
| DOM生成 | 固定レベル/章/仕掛けから生成。庭名はエスケープ、保存値はtextContent |
| localStorage | 記録は既知IDのsafe integer 1〜10000。音設定は既知項目を明示抽出・clamp |
| 共有 | X/LINEの固定origin、値を符号化、noopener/noreferrer。端末共有も明示操作のみ |
| 自動通信 | 外部script/font/API/分析送信/録音・マイクなし。追加の実行時依存なし |
| 権利 | 共通MIT実装と本作用のSVG・配置・合成音。新たな外部素材・ライブラリを追加していない |

## 実検証の証拠と重大度

- 成立した脆弱性：Critical/High/Medium/Lowいずれも0件。
- 移植元の実contextでquery/hashと保存値へSVG onload payloadを投入。
  実行マーカー0・注入SVGなし・pageerrorなし。不正な記録/音量を除外し、prototype汚染なし。
- 共有先を調べ、X/LINEの固定originだけであること、初期外部リクエスト0を確認。
  共有先へは遷移せず、検証中の第三者向け通信も遮断した。
- 実AudioContextを無音の検証sinkで使用し、予約3音とBGMを生成。
  cancelEffectsで効果音0、muteで全voice/scheduler 0、hideで0かつsuspended、disposeで0かつclosed。
- 上記検証に関係するlib/sharedは移植元と同一。移植後のapp差分はURL上書きの削除のみ。
- 移植元の開発serverは不正percent/NUL/dot/親経路要求を404で拒否。公開対象には含めない。

## ヘッダー・最終確認

- 共通生成コードではDay75専用CSPを自動生成する構成を確認。
  `script-src/connect-src`は`self`、`object-src/frame-ancestors/base-uri`は`none`。
  共通のnosniff、DENY、Referrer-Policy、COOP、マイク/カメラ禁止も引き継ぐ。
- 生成後dist24件は配信規則上の実ファイル一覧と一致。tools/tests/server/artifact/個人仕様なし。
- `_headers`を実読し、Day75のCSP規則が1本、上記ディレクティブと共通ヘッダーを確認。
- distのindex差分は共通ビルドによるOG site_name・Twitter meta4項目の追記のみ。
- 直下og.pngはIHDR/IDAT/IENDのみ。EXIF/textなし。旧assets/og.pngは削除済み。
- 公開ゲート/ローカルHTTPの実行結果はrootの別工程。本書は未実施を成功扱いしない。

## 他の確認との区別

rootによる全変更ファイル全文・紹介画像の目視、ゲーム評価、全体CI/PRの同一head確認は別工程。
本監査のPASSはそれらの完了や本番への攻撃試験を意味しない。
