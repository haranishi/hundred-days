# A2F 受領書

2026-10-22。担当範囲の修正とオフライン検証を完了。

## 編集したファイル・公開API

- `day-074-link-dokumi/lib/rules.js`: 既存の`evaluate`、新規の`RULE_CATALOG`。
- `day-074-link-dokumi/lib/messages.js`: `MESSAGES`の文面を更新。公開名、禁止語一覧、設定例の値は維持。
- `day-074-link-dokumi/lib/headers.js`: `evaluateCsp` / `headerFindings`のCSP評価を修正。`evaluateCsp`の戻り値へ`hasFramePolicy`を追加（強制CSPのframe-ancestorsの存在）。他の公開関数は維持。
- `day-074-link-dokumi/lib/report.js`: `buildReport`の状態・重大度・経路を日本語化。`buildSummary`も全文点検し、挙動は維持。
- `day-074-link-dokumi/tests/judge-rules.test.mjs`: 回帰31件追加、旧期待値2か所更新。
- `day-074-link-dokumi/tests/judge-headers.test.mjs`: CSPの回帰2件追加。
- `notes_A2F.md`とこの受領書。

`score.js`・`libs.js`・`eol.js`・`resources.js`・`samples.js`は点検のみ。契約、fixture、他担当、仕様、UI、リポジトリ直下の設定は編集していない。

## 変更内容

- `V-NOT-FETCHED`: traceなし・fetch.allowed=falseのとき、通信失敗と分けて接続見送りの理由を表示。userinfo / numeric_host / reserved_name / port / self / schemeに加え、モデルに存在するtoo_longにも対応。.exampleは見本用の予約名と説明。O-UNKNOWNも表示。
- `V-SHARED-HOST`: freeHostまたはuserContentHost=trueでinfo・0点。サービス運営会社とページ作成者を区別し、「無料」とは書かない。
- `O-STATUS-NOTE`: 400以上の応答にinfo・0点の注記。通常ページと設定が異なる場合があると説明。HTML以外でも応答に対する参考情報として出すが、採点対象外は維持。
- V-OFFICIAL-DOMAINはuserContentHost=trueで抑制。未定義はfalse扱い。指定された文面で個々のページ作成者の未確認を明記。
- V-BRAND-KEYWORDは名前の部分4点／パスのみ2点、敏感語で各+3。位置が混在しても1回だけ加点し、A1Fのkeyword判定をそのまま使用。
- 本文切り詰めの説明はLIMITS.BODY_CAP_BYTESからKiBを計算。RDAPはunsupported / timeout / error / not_foundを日本語で区別。DNS未取得も表示し、欠落の減点にはしない。
- 文面: 既存35所見の47フィールド（title/why/fix）を変更し、3所見の文面を追加。rules.jsのwhatを全件点検し、内部用語・真偽値の羅列・不自然な直訳を言い換えた。report.jsでは英語の状態名・重大度・経路名を日本語化し、加点と減点を分けた。
- R2 §F-4と照合し、script-src/default-srcの両方がないCSPを良い制限とする誤判定を修正。frame-ancestors *を埋め込み防御とせず、強制CSPがあるときのXFOよりの優先も反映。複数ポリシー等の完全な実効評価をしない限界表示は維持。

## RULE_CATALOGの使い方

`import { RULE_CATALOG } from './lib/rules.js'`で74所見を取得できる。各要素は`{id, axis, title, points, severity, floor, note}`。

- titleはMESSAGES[id].title。固定点はnumber、条件で変わる点はnumber[]、O-VULN-LIBは点の内訳と合計上限を示すstring。
- severity / floorは候補の最大値。条件による違いはnoteに明記。V-NEW-DOMAINの重大度とfloorは日数によって変わる。
- 固定の所見はadd()が表の点・重大度・floorを参照。可変の所見は表と同じRULE_VALUESから候補を選び、点数を二重に定義しない。O-VULN-LIBは共通のVULN_WEIGHTSとVULN_CAPを使って表示と実装をそろえる。
- 変動所見のnote内の点数も同じ定義から生成。画面はpointsだけでなくnoteも表示すること。

## テスト結果

- `node --test day-074-link-dokumi/tests/`: **761件成功、失敗0、skip0**（最終実行時点）。他担当のテストも含む。
- `node --test day-074-link-dokumi/tests/judge.index.mjs`: **202件成功**。A2の169件から33件増加。既存の入口importで追加分が走ることを確認。
- 変更した実装4ファイル・テスト2ファイルの`node --check`: 成功。
- Result契約、全idの文面と実到達、点数・floorの既存境界、禁止語、title/why/fix/whatの長さ・文数、設定例、見本3つとfixtureのdeepEqualが成功。
- 旧試験の「pathだけは抑制」を2点へ変更した理由は今回の指示。旧仕様id集合の検査は既存の全idを維持し、追加3idだけを明示して拡張。削除や無条件のskipはしていない。

## メインが仕様へ反映する点

1. rules.mdへV-NOT-FETCHED / V-SHARED-HOST / O-STATUS-NOTEの3行を追加し、V-OFFICIAL-DOMAINのuserContentHost除外と文面、V-BRAND-KEYWORDのパス2点／敏感語+3を反映。
2. rules.mdのO-CSP-WEAKにscript-src/default-srcの両方がない場合、O-FRAME-MISSINGに無制限のframe-ancestors *とCSP優先の扱いを明記。
3. design.mdへRULE_CATALOGの公開と型、model.mdへLexicalFacts.userContentHost:booleanを反映（住所担当との契約）。limitsの切り詰め・未取得理由も必要に応じて反映。
4. 現在のrules.mdは71idを記載し、O-*-OKの7idが1行にまとまっている。試験はこの行を7件へ展開して行数相当を照合する。未反映の3idだけを明示して加え、合計74件とcatalog・MESSAGES・実到達を厳密比較している。仕様の行を足すまでcatalogと物理行数の単純比較はできない。

## 未実施・残件

担当内の未完了や失敗はない。ネットワーク・ブラウザ・依存導入・Git書き込み・commit/push/PRは指示どおり実施していない。ビルド、公開ゲート、UI/E2E、本番確認、独立レビューは実施していない。仕様の反映と画面でのRULE_CATALOG表示はメイン側の統合範囲。
