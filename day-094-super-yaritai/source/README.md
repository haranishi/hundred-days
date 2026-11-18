# スーパーやりたい放題

架空のスーパーで、缶の山を崩したり試食を食べ尽くしたりして、2分間で「荒らし度」を競う3Dブラウザゲームです。ひとりでCPUと競うほか、友だちとのネット対戦やランダム対戦を、スマホでもPCでも楽しめます。

[スーパーやりたい放題を遊ぶ](https://day94.rairakku.com/)

## 遊び方

店内の注意書きや「やっちゃダメリスト」を手がかりに、商品や仕掛けに近づいてアクションを使います。目立つほど店員に追われやすくなるので、捕まる前に逃げながら点を稼ぎます。

- PCは WASD または矢印キーで移動、Shift でダッシュ、Space でジャンプ、J または E でアクション。
- スマホは左側のスティックで移動し、右側のボタンでアクション、ダッシュ、ジャンプ。
- 「ひとりで遊ぶ」ではCPUの強さを選べます。「友だちと対戦」では部屋を作り、招待リンクまたは4文字のあいことばを共有します。1部屋に2〜4人が参加できます。

## ローカルで動かす

Node.js 24系を使い、この README があるディレクトリで実行します。

```sh
npm ci
npx playwright install chromium
npm run dev
```

ブラウザで `http://localhost:5331/` を開くと、ひとりで遊べます。Playwright のブラウザは試験と撮影に使います。WebKit を使う場合は `npx playwright install webkit` を実行します。E2E は既定で Chromium を使い、`SY_BROWSER=webkit` で切り替えられます。

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | Vite の開発サーバーを起動 |
| `npm test` | Vitest で単体試験を実行 |
| `npm run typecheck` | ブラウザ側と Worker 側の型を確認 |
| `npm run build` | 型検査後、静的ファイルを `dist/client/` に生成 |
| `npm run preview` | 生成済みの静的ファイルを手元で配信 |
| `npm run e2e` | ひとり用の操作を Playwright で確認 |
| `npm run e2e:online` | ローカルの Worker を使ってネット対戦を確認 |
| `npm run e2e:split` | 画面と Worker を別オリジンに分けた構成を確認 |
| `npm run cf:dev` | 画面と対戦用 Worker を手元で配信。先に `npm run build` を実行し、`http://localhost:8798/` を開く |
| `npm run shots` | 開発サーバーを起動した状態で、ゲームの固定ショットを `shots/core/` に保存。既定は WebKit。Chromium を使う場合は `SY_BROWSER=chromium npm run shots` |

## 自分の環境に配信する

画面は Three.js・TypeScript で実装し、Vite で静的ファイルにまとめます。ネット対戦では Cloudflare Workers の Durable Objects が部屋とマッチングを管理し、WebSocket で試合のデータを中継します。物理演算を行う Rapier は、部屋を立てたプレイヤーのブラウザで動きます。

1. `npx wrangler login` で Cloudflare にログインします。Worker の名前を `wrangler.jsonc` の `name` に設定します。続けて `npx wrangler pages project create` を実行し、Pages のプロジェクト名と本番ブランチを決めます。 [Cloudflare Pages の Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
2. [`src/shared/hosts.ts`](src/shared/hosts.ts) の `WORKER_ORIGIN` に対戦用 Worker の HTTPS オリジンを、`APP_ORIGINS` に画面を配信する Pages のオリジンを設定します。カスタムドメインを使う場合は、そこから開く画面のオリジンも許可リストに加えます。
3. [`public/_headers`](public/_headers) の Content Security Policy（CSP）にある `connect-src` を、自分の Worker の `https://` と `wss://` の接続先に更新します。Rapier の WebAssembly に必要な `'wasm-unsafe-eval'` は `script-src` に残します。
4. `npm run build` で生成し、`npm run cf:deploy` で Worker を配信します。Pages には `npx wrangler pages deploy dist/client --project-name YOUR_PROJECT --branch YOUR_BRANCH` で同じ静的ファイルを配信します。`YOUR_PROJECT` と `YOUR_BRANCH` は作成時のプロジェクト名と本番ブランチ名に置き換えます。
5. 配信した画面を2つのブラウザで開き、部屋を作って招待リンクから参加し、対戦を開始できることを確認します。

共有リンクや検索・SNS向けのページ情報に使う公開URLは、[`src/client/site.ts`](src/client/site.ts) と [`index.html`](index.html) で配信先に合わせます。部屋の通信や使用量の上限は [ネット対戦の設計](docs/05_ネット対戦.md) を参照してください。

## ライセンスと設計書

ゲームのソースと付属文書は、リポジトリ直下の [MIT ライセンス](../../LICENSE) に従います。第三者のライブラリと素材にはそれぞれの利用条件が適用されます。通知と来歴は [第三者のライセンス](public/licenses.txt) と [3Dモデルの来歴](public/models/LICENSES.md) に記載しています。

[`docs/`](docs/) に、ユーザーストーリー、画面設計、ゲームのルール、店と3D、ネット対戦、ビルドと検証の設計書があります。
