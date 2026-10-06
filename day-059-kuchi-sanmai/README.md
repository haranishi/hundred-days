# Day059 — 口さんまい

口の形がちがう3枚の画像と声から、口パク動画をブラウザの中だけで作るアプリ。
声は音声ファイルでも、マイクで話してもいい。画像も声も、外へは送らない。

[公開ページ](https://hundred-days.pages.dev/day-059-kuchi-sanmai/)

名前の読みは「くちさんまい」。無料・登録不要。PCでもスマホでも開ける。

## できること

- 口とじ・口小・口大の3枚（まばたきの1枚は任意）を入れると、声の大きさに合わせて口が切り替わる。待機中のゆらぎと、話すときの動きも付く。
- 動画の大きさは縦1080×1920・横1920×1080・正方形1080×1080。背景は透明・白・黒・グリーン・好きな色・画像から選ぶ。
- 録画はブラウザの MediaRecorder で、MP4 → WebM（VP9）→ WebM の順に使える形式を選ぶ。MP4でも、編集ソフトが対応するコーデックとは限らない。
- 「サンプルで試す」で、見本のロボット4枚と14秒のテスト音を読み込める。

## 100日チャレンジ版で変えたこと

元は、100日チャレンジとは別に作っていた試作の標準版（ログインなしで動く版）。Day59として公開するにあたり、次を変えた。

- **認証版を外した**：ログイン・サーバー・データベースの部分と、その依存は持ち込んでいない。
- **同意画面を外し、注意書きにした**：開くとすぐスタジオが出る。代わりに、画像を選ぶ欄と、音声・マイクの欄に、他の人の絵や声を使うときの注意を常に出す。規約・プライバシー・Cookieの説明は画面の下のリンクから読める。同意を端末に保存する仕組みも無くなった。
- **運営者の表記を替えた**：「100 DAYS / 100 APPS（haranishi）」。お問い合わせは X の @haranishi_ikki か、GitHub の Issue。
- **マイクを開けたのはこのDayだけ**：サイト全体の Permissions-Policy は `microphone=()` のまま。このDayのパスだけ、全体の値を外してから `microphone=(self)` で付け直している（`scripts/build.mjs`）。
- **相対パスにした**：公開URLが `/day-059-kuchi-sanmai/` なので、画面の素材・見本・ライセンス表示を相対パスで読む（`base: './'`）。
- **画面の上に帯を足した**：一覧へ戻る「100 DAYS / 059」と、「共有する」。共有の欄はサイト共通の部品（`shared/share.js`）で、X・LINE・端末の共有シート・リンクのコピーに対応する。

## データと通信

- 選んだ画像・音声、マイクの音、作った動画は、ブラウザの中だけで扱う。このサイトを含めて、外へは送らない。
- 通信は、サンプルを読み込むときに、このサイトから見本の画像と音声を取ってくるだけ。
- 端末には何も保存しない（Cookie・localStorage を使わない）。再読み込みすると作業は消える。
- 音声ファイルと完成した動画は blob: のURLで再生するので、このDayのCSPだけ `media-src` に `blob:` を足している。
- マイクは「マイクを開始」を押したときだけ、ブラウザが許可を求める。マイクの音はスピーカーへ流さない。

## 権利

- 見本のロボット画像4枚とテスト音は、作者がコードで生成したもの（`source/tools/gen-sample-sprites.mjs`・`gen-sample-audio.mjs`）。第三者の素材は含まない。ライセンスはコードと同じMIT。来歴は [`sample/README.md`](sample/README.md)。
- ブラウザに配る依存（react・react-dom・scheduler・zustand・fix-webm-duration・tailwindcss の生成CSS・vite と rolldown の実行時補助）はすべてMIT。著作権表示と許諾の全文は [`legal/THIRD_PARTY_NOTICES.txt`](legal/THIRD_PARTY_NOTICES.txt) で、画面の「第三者ライセンス」からも開ける。
- 利用者が持ち込む絵や声には、それぞれの権利者がいる。自分で見るだけなら使える場合でも、SNSなどへの投稿には許可が要ることがある。実在の人物が言っていないことを言わせる動画は作らない。画面の注意書きと利用規約にも同じことを書いた。
- 説明・宣伝の画像や動画には、自作のロボットだけを使う。

## ソースと配信

`source/` が TypeScript のソース（React・Vite・Tailwind CSS・zustand）。
直下の `index.html`・`assets/`・`sample/`・`legal/`・`favicon.svg` がそのビルド結果。
公開するのはビルド結果だけで、`source/` はサイトの配信から外している（`scripts/build.mjs`）。

```sh
cd day-059-kuchi-sanmai/source
npm ci
npm test                 # 口パクの判定・音声・録画・画像の読み込み・規約の単体テスト
npm run release          # ライセンス表示を作り直し、型検査とビルドをして、公開物を1つ上へ写す
npm run notices:check    # 配る依存とライセンス表示がそろっているか
```

`npm run release` は、根元（`/`）を指すパスや、共有部品のタグの抜けがあると止まる。
見本を作り直すときは `node tools/gen-sample-audio.mjs`（テスト音）と `node tools/gen-sample-sprites.mjs`（画像。Playwright の Chromium を使う）。
公開物の約束は `tests/`（`node --test day-059-kuchi-sanmai/tests/`）、公開ページの試験はリポジトリ直下の `tests/e2e/day-059.spec.mjs` が見る。

## 確かめていないこと

- 自動の試験は Chromium だけ。Safari/iOS・Firefox と、実機のマイクの聞こえ方は試していない。
- 録画は実時間で進む。別のタブに移ったりスリープしたりすると、描画が止まることがある。
