# Day076 へんかんデスク

画像・PDF・テキスト/データを端末内で変換する24ツール。
公開URL：https://hundred-days.pages.dev/day-076-henkan-desk/

## 使い方

画像・PDF・データからやりたい操作を選び、入力→設定→変換→保存へ進む。
画像はJPG/PNG/静止WebPの相互変換、サイズ、定番/自由比率、切抜き・余白・配置・背景に対応。
PDFは画像作成/画像化、結合、抽出、分割、並替え、回転、文字抽出、構造最適化の9操作。
データはCSV/JSON/TSV/YAML、JSON整形・圧縮、Markdown/HTML、Base64/URLの14操作。

## 入力と公開条件

入力・成果物・ファイル名は送信しない。原本を上書きせず、履歴保存もしない。
ページ配信のアクセス情報とリンク共有は別に通信する。詳細は[ご利用について](legal.html)。
変換する権利のあるファイルを使い、原本を保管して結果を開いて確認する。
PDFの保護解除・OCR・音声動画・旧Office形式は対応しない。PDF最適化は容量減を保証しない。
Office3形式のサーバー変換は静的公開版から除外し、ローカル版sourceに残す。

## 開発・検証

公開物はsourceの固定lockfileから生成する。sourceとtestsはWeb配信しない。

```sh
cd day-076-henkan-desk/source
npm ci
npm run release:static
```

リポジトリのルートでnpm run checkとnpm run publish:check -- --day 76を実行する。
対象ブラウザ検証はtests/e2e/day-076.spec.mjs。公開ヘッダーを実付与してWASM/Worker/フォントも確認する。
元のローカル27ツールはsource/README.mdを参照。

## 権利と記録

本体は[リポジトリのMIT](../LICENSE)、依存物は[個別の許諾全文](licenses/index.html)。
PDF資材は複数ライセンス。Liberation Sansは公式未改変2.1.5/OFL1.1へ置き換えた。
[法的確認](../docs/day076/verification/legal-review.md) / [統合SDD](../.kiro/specs/day-076-henkan-desk/)。
公開Issueに個人ファイルや秘密値を添付しない。実Safari/iOS機器の保存・メモリは未確認。
