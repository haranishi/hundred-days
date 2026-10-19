# 公開ゲート（publish-gate）の実装依頼

あなたは実装担当。リポジトリは `haranishi/hundred-days`（1日1アプリ。素のJS・ESM・Node 24・依存はPlaywrightだけ）。
作業ツリーは、いま居るディレクトリ（ブランチ `feat/publish-gate`）。ここだけを触る。この依頼は会話の文脈を持たないので、次をこの順に読む。

1. `AGENTS.md`（公開前チェック）と `docs/ci.md`。
2. 仕様：`.kiro/specs/publish-gate/` の `requirements.md`・`design.md`・`tasks.md`。**これが正本**。仕様と食い違う点を見つけたら、黙って直さず、最終回答に書く。
3. 関連コード：`scripts/build.mjs`（`status` と `published` の判定、`injectAppMeta`）、`scripts/serve-dist.mjs`、`scripts/verify-public-page.mjs`、`shared/share.js`（`shareText()`）、`tests/e2e/shared-share.spec.mjs`・`external-days.spec.mjs`・`security-headers.spec.mjs`、`playwright.config.mjs`、`package.json`、`scripts/tests/*.test.mjs`（試験の書式の手本）。

## 背景
下書きのDayは、全アプリ横断の検査（共有・OGP・ヘッダー）の対象外になる。公開にした瞬間に初めて掛かり、CIで落ちる（Day70・Day71で実際に起きた。Day71は、Xの共有文が題名「影証言 — 灯りの高さで、証言の嘘を暴く」をそのまま含まず、`shared-share` の1件が落ちた）。
この仕組みで、下書きのうちに同じ検査を掛けられるようにする。

## やること（tasks.md の 1〜4）

### 1. `scripts/lib/day-status.mjs`（新規）と単体テスト
- 環境変数 `PUBLISH_CHECK_DAY` を読む。値は `71`・`071`・`day-071-kage-shogen`・カンマ区切りの組み合わせ。空白は無視する。
- `effectiveStatus(meta, dir, env = process.env)`：通常は `meta.status || 'published'`。環境変数がそのDayを指していて、`meta.status === 'draft'` のときだけ `'published'` を返す。ほかの状態（`external` など）は変えない。
- 環境変数が空でないのに `env.GITHUB_ACTIONS === 'true'` のときは、例外を投げる（本番のビルドで、下書きが公開されるのを防ぐ安全弁）。
- 環境変数が、どのDayも指さないときは、気づけるよう `scripts/build.mjs` が警告を1行出す（例：番号の打ち間違い）。
- `scripts/build.mjs` の `const status = meta.status || 'published';` を `effectiveStatus` 経由にする。環境変数が効いたDayは、ビルドの出力に1行「（検査用）公開済みとして扱う：…」を出す。
- `tests/e2e/shared-share.spec.mjs` の公開判定と、`tests/e2e/external-days.spec.mjs` の `status` の読み取りも、`effectiveStatus` 経由にする。
- **環境変数が未設定のとき、挙動はいっさい変えない。** `scripts/build.mjs` と2つのspecの差分は、この差し替えと上の表示だけにする。

### 2. `scripts/lib/publish-contract.mjs`（新規）と `scripts/tests/publish-contract.test.mjs`（新規）
横断specが静的に確かめている項目を、ブラウザなしで確かめる登録簿。設計は `design.md` の「契約の初期セット」。

- 契約は `{ id, title, source, check(day) }`。`check` は、守れていれば `null`、違反なら `{ expected, actual }` を返す。
- 対象のDay：`day-NNN-*` で `index.html` を持つもの。`status` は問わない（下書きも対象）。
- HTMLは正規表現で読む（DOMライブラリは足さない）。`<meta>`・`<link>`・`<title>` を属性ごとに読み、`&amp;` `&lt;` `&gt;` `&quot;` `&#39;` を戻す。
- **ビルドは、ソースに無いcanonical・OGPのタグを `meta.json` から足す**（`scripts/build.mjs` の `injectAppMeta`）。ソースに書かれているタグは上書きしない。だから、**ソースに書かれた値だけ**を検査し、書かれていないタグは「ビルドが正しく足す」とみなす。
- 初期セット（ページのURLは `https://hundred-days.pages.dev/<フォルダ名>/`）：
  - `canonical`：書かれていれば、ページのURLと一致する。
  - `og-title`：書かれていれば `meta.json` の `title` と一致する。
  - `og-url`：書かれていれば、ページのURLと一致する。
  - `twitter-card`：書かれていれば `summary_large_image`。
  - `og-image`：書かれていれば、ページのURLのフォルダの下を指し、指すファイルが実在する。書かれていなければ、`meta.json` の `screenshot`（ファイル名だけ）が実在する。
  - `share-text-title`：共有文が `meta.json` の `title` をそのまま含む。共有文は `shared/share.js` の `shareText()` と同じ規則で求める（`<meta name="share:text">` の `content` を trim して空でなければそれ。無ければ、`<title>` を `|` で割った最初の部分を trim したもの。それも空なら `<title>` 全体）。
- 関数：`listAppDirs(root)`、`loadDay(root, dir, { exists })`（ファイルの実在を確かめる関数は差し替えられる）、`checkDay(day)`（違反の配列：Day名・契約の `id`・`title`・`expected`・`actual`）、`formatViolations(violations)`（人が読める文字列）。
- 試験（`node:test`）：
  1. このリポジトリの全Dayが、契約を満たす。違反があれば、`formatViolations` の文字列で落とす。
  2. **回帰の例**：Day71の旧い共有文 `影証言 — 灯りの高さで、目撃証言の嘘を暴く影絵×推理パズル。5つの夜、約10分。`（題名は `影証言 — 灯りの高さで、証言の嘘を暴く`）が、`share-text-title` の違反として検出される。
  3. 各契約の違反・合格の例（HTML文字列と `meta` を直接渡す。実在確認は `exists` を差し替える）。`share:text` が無いときは `<title>` に落ちる例、`&amp;` を含む例も入れる。
- **既存の公開済みDayは、すべて通るはず**（横断specがCIで通っているため）。通らないDayがあれば、契約を弱めずに、Day名・契約名・値を最終回答に書く。契約の読み違いも疑う。

### 3. `scripts/publish-check.mjs`（新規）と `package.json`
- `package.json` の `scripts` に `"publish:check": "node scripts/publish-check.mjs"` を足す。使い方：`npm run publish:check -- --day 71`。オプション：`--static-only`（ブラウザ段を飛ばす）。
- 手順：
  1. `--day` からフォルダを1つ決める（`day-071-*`）。無い・複数・`index.html` が無いときは、理由を示して終了コード2で止まる（ビルドの前に）。
  2. 静的な契約検査（上の登録簿）。違反は表示するが、ブラウザ段も続ける（一度の実行で、全部の失敗が見えるように）。`--static-only` ならここで終わる。
  3. `PUBLISH_CHECK_DAY=<番号>` を付けて `node scripts/build.mjs`。`dist/<フォルダ名>/index.html` ができたことを確かめる。
  4. 空きポートを選び（`net` で `listen(0)`）、環境変数 `PLAYWRIGHT_PORT` に渡して、`npx playwright test tests/e2e/shared-share.spec.mjs tests/e2e/external-days.spec.mjs tests/e2e/security-headers.spec.mjs` を、`PUBLISH_CHECK_DAY` を付けて流す。出力は `--reporter=line`、成果物の置き場は `--output` で一時ディレクトリにする（既定の `test-results/` を消さないため）。
  5. **どう終わっても**（成功・失敗・例外・SIGINT・SIGTERM）、`dist/` を通常のビルド（環境変数なし）で作り直す。作り直しに失敗したら、`dist/` に検査用のビルドが残っていること、`npm run build` で直ることを、目立つ文で出す。
  6. 要約：静的・ビルド・ブラウザの結果、違反の一覧、最後に「公開ゲート：合格／不合格」。終了コードは 合格0・不合格1・使い方の誤り2。
- **`meta.json` もGitの作業ツリーも書き換えない。** 念のため、対象Dayの `meta.json` の内容を最初と最後で比べ、違えば警告する。
- 純粋な部分（引数の解釈、Dayの解決、環境変数の組み立て、要約の整形）は関数に分けて `export` し、`scripts/tests/publish-check.test.mjs` で試験する。`main` は `import.meta.url` が実行ファイルのときだけ動かす。試験はブラウザもビルドも使わない。
- メッセージは日本語。

### 4. 手順書（短く。コードを読めば分かることは書かない）
- `AGENTS.md`：公開前チェックに次を足す。①下書きのDayも、PRの前・公開の前に `npm run publish:check -- --day <N>` を通す（横断の検査は `published` のDayにしか掛からないため）。②新しいDayは、本人が下書きを指定しない限り、公開ゲートを通した `status: "published"` の状態でPRを出す。マージとX投稿は本人。下書きのまま出すなら、最終報告の冒頭で「マージしても本番には出ない」と伝える。③公開時に新しい契約違反が見つかったら、同じPRで `scripts/lib/publish-contract.mjs` に契約として足す。
- `docs/ci.md`：新しい節「下書きのDayと横断の検査」。横断のブラウザ試験とビルドは `published` だけが対象であること、その穴を単体テスト（静的な契約）と `publish:check` で埋めること。
- `.kiro/steering/publish-contract.md`（新規・**100行以内**）：概要、目的（なぜ作ったか）、契約の一覧（表）、契約の足し方、起きた事故（Day70：共有ボタンに共通の読み上げ名が無く、共有の試験が共有欄を開けなかった／44pxの大きさ／URLのコピー。Day71：Xの共有文が正式な題名を含まなかった）、やらないこと。**コードを全部消したら失われる情報（背景・理由・落とし穴）だけ**を書く。関数の一覧や処理の流れの写しは書かない。
- 文章は、結論から。常套句や飾りを使わない。文の長さに変化をつける。

## 制約
- 依存を足さない。`.github/` に触れない。
- Git：`add`・`commit`・`push`・`branch`・`stash`・`reset`・`checkout` をしない。変更は作業ツリーに残す。`git diff`・`git status` は使ってよい。
- ファイルに、ホームディレクトリ配下の絶対パス（macOSのユーザーフォルダの下）を書かない（`npm run precheck` が止める）。例は相対パスで書く。
- `rm -rf` は使わない。既存の試験を弱めない・消さない。
- **このサンドボックスではChromiumが起動しない。** Playwright・`npm run test:e2e`・`publish:check` のブラウザ段は実行しない（メインが実行する）。実行してよいもの：`node --test scripts/tests/*.test.mjs`、`npm run test:unit`、`node scripts/check-syntax.mjs`、`npm run precheck`、`node scripts/build.mjs`、`node scripts/publish-check.mjs --day 71 --static-only`。
- コードの書式は、既存の `scripts/` に合わせる（ESM、2スペース。コメントは「なぜ」だけ）。
- 変更するのは、上に書いたファイルだけ。ほかに必要だと思ったら、変更せずに最終回答で提案する。

## 受け入れ（自分で実行して、結果を最終回答に書く）
1. `npm run test:unit` が全部通る。
2. `node scripts/check-syntax.mjs` と `npm run precheck` が通る。
3. 全Dayが契約を満たす。満たさないDayは、検査を弱めずに、Day名・契約名・値を書く。
4. Day71の旧い共有文が、違反として検出される試験が通る。
5. `node scripts/publish-check.mjs --day 71 --static-only` が合格する。`--day 999` は、理由を示して終了コード2で止まる。
6. `git diff` で、`scripts/build.mjs` と2つのspecの差分が、公開判定の差し替えと表示だけであることを示す。

## 最終回答に書くこと
変更・追加したファイルの一覧。実行したコマンドと結果。仕様と食い違った点と、自分で判断したこと。実行できなかった検査（Playwright）。メインに確認してほしい点。
