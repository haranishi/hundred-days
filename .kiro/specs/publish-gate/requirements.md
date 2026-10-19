# 要件定義：公開ゲート

## Introduction
新しいDayは、下書き（`status: "draft"`）のあいだ、全アプリ横断の検査の対象外になる。
公開（`published`）にした瞬間に初めて、共有・OGP・ヘッダーの契約が掛かり、CIで落ちる。Day70とDay71で続けて起き、CIを1周やり直した。
公開ゲートは、その契約を下書きのうちから確かめられるようにする。公開の直前には、本番と同じ条件の横断試験を、1コマンドで流せるようにする。

## Boundary Context
- 対象：横断の契約の登録簿、下書きのDayへの静的な検査、公開前に横断のブラウザ試験を流すコマンド、手順書への追記。
- 対象外：CIのワークフロー（`.github/workflows/`）、公開（published化・マージ・デプロイ）の自動化、`x:prepare` の置き換え、各Dayの画面。
- 接続先：`scripts/build.mjs`、横断spec（`shared-share`・`external-days`・`security-headers`）、`npm run check`。

## Requirements

### Requirement 1: 下書きのDayも、公開の契約を毎回検査する
**Objective:** 公開の直前になって初めて、共有やOGPの食い違いを知るのを避けたい。

#### Acceptance Criteria
1.1 The 検査 shall `index.html` を持つ全Dayを、`status` に関係なく対象にする。
1.2 The 検査 shall 横断のブラウザ試験が静的に確かめている項目（canonical・og:title・og:url・twitter:card・og:imageの実在・共有文に正式な題名が入ること）を、ブラウザなしで確かめる。
1.3 If 契約に違反する, the 検査 shall Day名・契約名・期待値・実際の値を示す。
1.4 The 検査 shall `npm run check` と共通CIの単体テストに含まれる。

### Requirement 2: 公開の前に、本番と同じ条件の横断試験を1コマンドで流す
**Objective:** 44px・コントラストのように、ブラウザでしか分からない契約も、公開の前に確かめたい。

#### Acceptance Criteria
2.1 When `npm run publish:check -- --day <N>` を実行する, the コマンド shall そのDayを公開済みとみなしてビルドし、横断のブラウザ試験を流して結果を要約する。
2.2 The コマンド shall `meta.json` もGitの作業ツリーも書き換えない。
2.3 When 終わる（成功・失敗・例外・SIGINT・SIGTERM・SIGHUP・出力先の切断）, the コマンド shall 検査用のサーバーを止めて、`dist/` を通常のビルドに戻す。SIGKILL や電源断のように後始末が走らない終わり方では戻せないので、手順書に `npm run build` で戻すと書く。
2.4 The コマンド shall 空いているポートを使い、ほかのサーバーを再利用しない。
2.5 If 対象Dayが無い・`index.html` が無い, the コマンド shall 理由を示して、ビルドの前に止まる。

### Requirement 3: 通常のビルド・CI・本番配信を変えない
**Objective:** 公開ゲートが、本番を壊す原因にならないようにしたい。

#### Acceptance Criteria
3.1 While 環境変数 `PUBLISH_CHECK_DAY` が未設定, the ビルド shall 変更前と同じ内容のファイルを出力する。
3.2 The 変更 shall `.github/workflows/` に触れず、新しい依存を足さない。
3.3 The 横断spec shall `PUBLISH_CHECK_DAY` が未設定なら、検査する項目も対象のDayも変えない。

### Requirement 4: 見つかった契約違反を、次から検査に足す
**Objective:** 同じ種類の違反を、二度と公開時まで持ち越さない。

#### Acceptance Criteria
4.1 The 登録簿 shall 契約を、名前・根拠（どの横断試験の何を静的に写したか）・検査関数の組で足せる。
4.2 The 登録簿 shall 実際に起きた違反（Day71の共有文が題名を含まなかったこと）を、失敗する例として回帰の試験に持つ。
4.3 When 公開時に新しい契約違反が見つかる, the 手順 shall その違反を、同じPRで契約として足すことを求める。

### Requirement 5: 手順書に入れる
**Objective:** 人も、Claude・Codexなどのエージェントも、同じ手順で気づけるようにしたい。

#### Acceptance Criteria
5.1 `AGENTS.md` の公開前チェックに、下書きのDayへ `publish:check` を流すことを入れる。
5.2 `docs/ci.md` に、共有・OGP・ヘッダーの横断の検査が `published` だけを対象にすること（`external-days` は外部公開のDayの一覧の検査）、その穴の埋め方を書く。
5.3 `.kiro/steering/publish-contract.md` に、契約の一覧・足し方・起きた事故を残す（100行以内）。

### Requirement 6: 新Dayの既定を、公開用の状態にする
**Objective:** Day70・Day71のように、マージしても未公開のまま本人が公開を頼み直す往復を無くしたい。

#### Acceptance Criteria
6.1 When 100日チャレンジの新しいDayのPRを出す, the 手順 shall 本人が下書きを指定しない限り、公開ゲートを通した `status: "published"` の状態で出す。
6.2 The 手順 shall マージ・X投稿を、本人の操作として残す。
6.3 If 下書きのまま出す, the 最終報告 shall 「このPRをマージしても本番には出ない」ことを冒頭で伝える。

