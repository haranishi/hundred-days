# へんかんデスクのソース

公開版はブラウザ内の24ツール。開発用のローカル版はOffice3操作も含む27ツール。
Dayの説明・公開URL・仕様は[Day076のREADME](../README.md)を参照。

## 開発

Node.js 24.22.1以上の24系を使う。

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run release:static
```

release:staticは公開モードでビルドし、Day直下に静的配布物を更新する。
meta.json・README・検証文書は書き換えない。
通常のbuild/devでは元のOffice機能が使える。Officeは別途Dockerと送信同意が必要。

```sh
npm run build
bash infra/run-local.sh
```

PDF.jsの固定版補正と自己配信資材はprebuild/predevで準備する。
依存・キャッシュ・ビルド結果を公開対象へ混ぜない。
