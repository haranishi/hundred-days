# 筆順データの出典とライセンス

`data/kvg/*.json` は **KanjiVG** の派生データです。リポジトリ本体のコード（MIT）とは
**ライセンスが別**で、この配下のデータには CC BY-SA 3.0 が適用されます。

- 原典: [KanjiVG](https://kanjivg.tagaini.net/) — Copyright (C) 2009-2013 Ulrich Apel ほか
- 版: リリース `r20250816`（`kanjivg-20250816.xml.gz`）
- ライセンス: [Creative Commons 表示-継承 3.0（CC BY-SA 3.0）](https://creativecommons.org/licenses/by-sa/3.0/)
- 継承: この加工後のデータも **CC BY-SA 3.0** で配布します

## 加工したところ

`tools/build-data.mjs` が次の変換をしています。

1. 1画ごとの種別（`kvg:type`）とパス（`d`）だけを取り出し、部首の入れ子・要素名・
   位置・異体字（`kvg:kanji_09038-Kaisho` のような id）は落とした
2. パスの座標を小数1桁へ丸めた。相対座標なので丸めの端数を次の座標へ繰り越し、
   元のパスと曲線上の点を突き合わせて、ずれが 0.25 単位（109四方の0.23%）を超え
   ないことを生成時に検査している（79,907画の実測で最大 0.188）
3. 符号位置の上位バイトごとのJSONへ分けた（6,702字 / 79,907画 / 94ファイル）

## 作り直し方

```
node tools/build-data.mjs
```

配布XMLを取得して `tools/.cache/` に置き、`data/kvg/` を作り直します。手元にXMLが
あるときは `--xml <path>` を渡します。

## 注意

筆順は学校で習う形にもとづいたものです。字によっては書き方が1つに決まっておらず、
KanjiVG のデータもそのうちの1つです。
