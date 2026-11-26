# Day100 kamoku の設計

## 方針
kamoku 本体に「ブラウザだけで動くお試し版」の組み立て（`tools/build-web-demo.sh`）を足し、main にマージしたコミットで組み立てた結果を `day-100-kamoku/` に置いて、静的に配る。会計の処理とメモリ上の SQLite は、利用者のブラウザの中で動く。サーバーは持たない。

このサイトのビルドは Rust を使わないので、組み立てた結果をリポジトリに入れる（Day082 と同じく、別の場所のソースから作った成果物を置く形）。どのコミットから作ったかは `build-info.json` に残る。

## 捨てた案
| 案 | 捨てた理由 |
|---|---|
| GitHub へのリンクだけを載せる | 開くだけで触れる形にならない。本人はお試し版を作る案を選んだ（2026-11-26） |
| サーバー版を公開サーバーで動かす | 利用者の帳簿が同じ場所に集まる。費用と運用も要る |
| 専用のサブドメインで配る | 追加の設定が要る。このサイトのフォルダで足りる |

## フォルダの中身（`day-100-kamoku/`）
- 組み立て結果（手で直さない）: `index.html`・画面の CSS と favicon・`rust/pkg/`・`web/`・`build-info.json`・`THIRD_PARTY_LICENSES.txt`
- kamoku のライセンスの写し（MIT と Apache-2.0）
- このサイトで足すもの: `day100/`（帯と共有の窓の CSS・JS）、`shared/`（共通の共有部品の複製）
- 掲載の素材と記録: `meta.json`・`README.md`・`LICENSE`・`screenshot.webp`・`demo.mp4`
- 配らないもの: `tools/`（取り込みと録画の道具）・`tests/`

## 取り込みの道具（`tools/import-build.mjs <組み立て結果のフォルダ>`）
- 前の組み立て結果を消してから写す。写すのは、決めた場所と拡張子のファイルだけ。知らないファイルがあれば止まる。
- `index.html` に、次を1回ずつ足す。目印がちょうど1か所に無ければ止まる。
  - `<head>`: 説明（description）、`share:text`、`shared/share.css`、`day100/day100.css`
  - 本文の列（`.main-col`）の先頭、お知らせ欄の前: 「100日チャレンジ Day 100」と共有ボタン（読み上げ名「このアプリを共有する」）の帯
  - `</body>` の前: 共有の窓（`<dialog>` の中に `#share`）、`day100/share-open.js`、`shared/share.js`
- 組み立てたコミットと、渡した kamoku の作業フォルダの HEAD が違うとき、commit していない変更を含む組み立てのときは、取り込まない。
- 出力に、このPCの絶対パス、漏洩検査に当たる行、25MiB を超えるファイルがあれば失敗する。調べ終わるまで何も書かない。
- 同じ入力なら同じ出力になる。

## 帯の置き場所
kamoku の画面は、広い幅では高さが画面と同じ左の列、狭い幅では上の帯と画面下の固定バーを持つ。固定表示は重なる。画面全体の前に置くと、左の列が帯の分だけ画面の下へはみ出すことを実画面で確かめた。そこで本文の列の先頭に、普通の流れで置く（スクロールすれば消える）。窓を開いている間のキー入力は、後ろの会計の画面のショートカットに渡さない。

## このサイト側の変更
- `scripts/build.mjs`: `wasm-unsafe-eval` を許す一覧に `day-100-kamoku` を足す。ほかの CSP は変えない。
- `scripts/serve-dist.mjs`: 試験用の配信で `.wasm` を本番と同じ `application/wasm` で返す。
- `scripts/og-template.html`: 共有画像の下の住所を、一覧の正式な住所（`rairakku.com/100days`）にする。
- OGP と canonical は、`meta.json` からビルドが入れる（手で書かない）。
- 公開で件数が 100 になる。`static/assets/og.png` を `scripts/make-og.mjs` で作り直し、目で確かめる。
- README の一覧（`npm run index:sync`）、`THIRD_PARTY_NOTICES.md` の節を足す。

## 掲載文と投稿
- `meta.json` は、コード・作業の記録・実画面で確かめた事実だけを書く。
- コードは別リポジトリにあるので、`social.x.codePublished` を `false` にし、`linkReplyNote` に kamoku の URL とライセンスを書く（Day094・098 と同じ書き方）。

## 試験
- 単体（`tests/*.test.mjs`）: 取り込みの道具（差し込みの回数・止まる条件・同じ出力）と、置いた `index.html`（インライン script が無い・外部 URL を読まない・`build-info.json` のコミット）。
- ブラウザ（`tests/e2e/day-100.spec.mjs`）: 本番と同じ見出しで配り、帳簿が出る・取引の登録が仕訳帳に出る・再読み込みで戻る・配信元以外への通信が0件・CSP 違反が0件・幅 390/768/1440 で横スクロールが無い・共有の窓が開く。
- 全アプリ共通の検査（共有・見出し・公開の約束）。

## 戻し方
Day100 の PR を revert すれば、一覧は99件に戻り、公開URLは無くなる。kamoku 本体の変更は残しても影響しない。
