# 第五王子と、名もなき加護 — source
無加護と呼ばれた第五王子が、商いと仲間との共同作業を通じて勇者になる短編RPG。
元プロジェクトv0.7.0を継承し、Day80の相対URLと静的公開先へ合わせた。

## 検証と公開物の更新
Node.js 24を使用する。ソース内で `npm ci --ignore-scripts` → `npm test` → `npm run typecheck` → `npm run release:static`。
公開物はひとつ上のDayフォルダへ生成し、source/tools/node_modulesは配信しない。
ブラウザ検証は `npm run dev -- --port 4180` を別に起動し `npm run test:e2e`。
`GAME_BASE_URL`で検証先を指定できる。開発専用の操作口は本番ビルドから除く。

## 素材
背景・人物・顔・ボス・音楽・効果音はPixel-Boy / AAAのNinja Adventure（CC0）。
書体はDotGothic16（OFL 1.1）。出所と元ファイルのハッシュは `assets-sources.json`。
物語・進行・台座の共有配置・演出・UIはこのゲーム用。生成イラストは配布しない。
