# 名画の、その先。

実際の名画の一部を見て作品名を4択で当てる、5問の小さな美術館。
答え合わせの後に全体像と制作背景・表現の意図・出典を読める。

## 遊び方と意図

- 4段階で見える範囲を広げる。正解は順に1,000・750・500・250点。
- 時間制限はない。わからなければ答えを見て、0点で次へ進める。
- 今日の5作品は日本時間の日付で固定。ランダム出題と9作品の図録もある。
- 鑑賞した作品と最高得点だけ、このブラウザのlocalStorageへ保存する。
- 制作目的の裏付けがない作品は「表現の特徴」として説明する。

## 素材と制約

画像はシカゴ美術館所蔵作品の公開画像。家具はKenneyのGLB、描画はThree.js。
画像・3D素材は同梱し、プレイ中に外部サービスへ問い合わせない。
WebGLが使えない場合も実画像で遊べる。切替ボタンで平面展示も選べる。
解説は同館の作品資料の日本語要約。詳しくは[data/SOURCES.md](data/SOURCES.md)。

## ローカル確認

リポジトリで `npm run shared:sync` と `npm run index:sync`、`npm run build`。
公開先は `https://hundred-days.pages.dev/day-050-art-uncovered/`。
ソースのプレビューと、ビルド成果物のテストは次を実行する。

```sh
node day-050-art-uncovered/tools/serve.mjs
node --test day-050-art-uncovered/tests/
PLAYWRIGHT_PORT=4250 npx playwright test tests/e2e/day-050.spec.mjs
```

プレビューは `http://127.0.0.1:5050/day-050-art-uncovered/`。
ブラウザテストは公開用の `dist/` を使い、本番用のCSPと同梱素材を確認する。
