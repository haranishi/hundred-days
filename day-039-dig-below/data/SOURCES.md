# 同梱データの出どころ

## `geo-time.json` — 地質年代の区分・境界・色

- 取得元: [Paleobiology Database](https://paleobiodb.org/) の `intervals/list` （`scale=1`）
- ライセンス: **Creative Commons CC0**（APIが応答の中で `"data_license": "Creative Commons CC0"` と返す）
- 区分・境界年代・色は **国際層序委員会（ICS）の国際年代層序表**のもので、PBDB がそれを配布している
- このリポジトリでの加工: 紀(period)と世(epoch)だけを抜き、日本語名を足した。
  日本語名は `tools/geo-time-ja.mjs`。生成は `node tools/build-geo-time.mjs`
- **色は変えていない。** 地質図と同じ意味を持つ色なので、見栄えのために置き換えない

## `taxa-ja.json` — 生きもののグループの日本語名

- 対応づけの相手: PBDB が返す綱(class)・門(phylum)の学名
- 日本語名はこのリポジトリで付けた（第三者データの複製ではない）
- 収録範囲: 日本国内の産出記録30,741件に現れる綱71種・門35種の全部。
  これで記録の97.7%に日本語のグループ名が付く。残りは分類が特定されていない記録

## `env-ja.json` — 堆積環境の日本語名

- 対応づけの相手: PBDB の `env` フィールド
- 日本語名と3分類（海／海と陸のあいだ／陸）はこのリポジトリで付けた
- 収録範囲: 日本国内の産地5,132か所に現れる46種類の全部

## `tests/fixtures/*.json` — テスト用の実応答

- 取得元: 同じく PBDB（CC0）。2026-09-15に取得したものを未改変で置いている
- `colls-tokyo.json` 東京駅周辺の産地31件／`occs-tokyo.json` 化石110件
- `colls-kochi.json` 高知周辺の産地52件／`occs-kochi.json` 化石493件
- `colls-empty.json` 記録が0件になる範囲
