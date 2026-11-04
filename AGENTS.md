# 公開前チェック

Day Nの公開、コミット、push、デプロイ、SNS投稿文の作成を行う前に、毎回次を実施する。1つでも未解決の問題があれば公開を止め、ユーザーに報告する。

1. `npm run precheck`を実行し、シークレット・個人NGワード・ローカルパス・コミット著者設定を確認する。
2. 新規・変更ファイルを全文確認する。画像・動画・PDFはメタデータと、通知・タブ・ファイルパス・別案件情報の映り込みも確認する。
3. 他人のコード・画像・フォント・音源などの権利とライセンスを確認する。
4. README、meta.json、SNS投稿文の機能・数字・日付・URL・AI担当・本人担当・失敗談を、コードと作業記録に照合する。本人しか知らない体験は推測で埋めない。
5. `npm run build`と、そのDayに必要な動作確認を行う。デプロイ後は本番URLの応答と主要アクションを確認する。
6. `npm run publish:check -- --day <N>`で公開ゲートを通す。下書き（`status: "draft"`）のDayも、PRの前と公開の前に通す。全アプリ横断の検査（共有・OGP・ヘッダー）は`published`のDayにしか掛からず、通さないと違反は公開した瞬間にCIで初めて見つかる。
7. X投稿は`npm run x:prepare -- --day <N> --video <path> --media-reviewed`で本文・リプライ・動画を検証する。生成後も、正しいXアカウント・添付動画・最終プレビューを人が確認してから公開する。

実際の個人NGワードは、gitignoreされた`.precheck-ng.txt`だけに保存する。秘密値や非公開の運用情報を、このファイルを含む公開対象へ書かない。

PR前の自動検査とマージ条件は [CI手順](docs/ci.md) を参照する。通常のローカル検査は `npm run check` にまとめてある。

## 新しいDayのPR

- 本人が下書きを指定しない限り、公開ゲートを通した`status: "published"`の状態でPRを出す。マージとX投稿は本人が行う。
- 下書きのまま出すときは、最終報告の冒頭で「このPRをマージしても本番には出ない」と伝える。
- 公開時に新しい契約違反が見つかったら、同じPRで`scripts/lib/publish-contract.mjs`に契約として足す。理由と事故は [公開の契約](.kiro/steering/publish-contract.md) に残す。

- 公開物の中のサイト内参照は文書相対にする。ルート直下の絶対パスを書かない（`/api/day-NNN/` だけ例外）。`npm run build` が検査する。
- `meta.json` の `publicUrl`（Xの返信リンクと、README の一覧のリンクになる）は、公開済みで一覧にマウントされるすべてのDayで `https://rairakku.com/100days/<フォルダ名>/` にする（2026-10-30にDay080から試験運用し、2026-11-01に本人が全Dayへ広げた）。例外は meta.json で見分ける：`mount: false` のDay（Day064・076。作り直すまで）は `https://hundred-days.pages.dev/<フォルダ名>/` のまま、外部で公開するDay（`status: external`）は外部の公開先、下書き（`draft`）は対象外。新しいDayでも守られているかは `scripts/tests/public-url-contract.test.mjs` が見張る。止めるときは、この行を消して、各Dayの `publicUrl` を元に戻す。住所の全体像は [公開の住所と配信の構成](.kiro/steering/public-urls.md)。詳細は [返信リンクの試験運用](.kiro/specs/reply-link-trial/requirements.md)。
- 外部Dayが、このサイトの中に紹介ページ（`https://rairakku.com/100days/<フォルダ名>/`）を持ちたいときは、`meta.json` に `intro`（`codeUrl`・`poster`・`highlights`・`notice`）を書く。書いたDayだけに、ビルドがページを作る。前提が足りないとビルドが止まる。使っているのはDay081だけ。外部Day（`status: external`）も `npm run x:prepare` でX投稿を準備できる。公開URLは、そのページ自身の canonical（無ければ題名）で確かめ、コードのリンクは `intro.codeUrl` を使う。詳細は [外部Dayの紹介ページ](.kiro/specs/external-intro-pages/requirements.md)。
- 外部Day（`status: external`）のアプリは、専用の公開先に `https://day<番号>.rairakku.com/` で出し、さらに **`https://rairakku.com/day<番号>/` からも見られるようにする**（2026-11-04 本人指示・Day083から。「rairakku.com の中に入れる。新しくビルドは増やさない」）。後者は共通の転送で足す：`infra/day-redirect/worker.mjs` の `EXTERNAL_DAYS` に番号を足し、Workers を出し直す（アプリのビルドではない。手順は同じ場所の README）。**紹介ページ（`intro`）が無い外部Dayは、100日の正の住所 `https://rairakku.com/100days/<フォルダ名>/` も同じ転送でアプリへ送る**（`EXTERNAL_DAYS` に `folder`、`wrangler.toml` に経路を1本。`/100days/*` のように広げない）。足し忘れると `scripts/tests/day-redirect.test.mjs` が落ちる。**中継にはしない**（アプリが1訪問で約30リクエストあり、rairakku.com の無料枠＝問い合わせAPIと共有を食う）。理由は [公開の住所と配信の構成](.kiro/steering/public-urls.md)。
