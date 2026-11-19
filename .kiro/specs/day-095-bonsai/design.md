# 設計: 盆栽日和

静的なESモジュール（ビルドなし）。three.js r186 を `vendor/` に同梱し、フォルダごと配信する（OriCube・Day87と同じ形）。
`index.html` → `app.js` が、木のモデル（`tree.js`）・描画（`view3d.js`＋`diorama.js`）・操作（`controls.js`）・画面（`ui.js`）・保存（`store.js`）・音（`audio.js`）をつなぐ。
モデルは DOM と three.js を知らない。描画はモデルを知らず、骨格のスナップショット（契約）だけを読む。この境目が、4人（AI）の並行作業の継ぎ目になる。

## 決めたこと・捨てた案（理由）
| 決めたこと | 捨てた案と理由 |
|---|---|
| 木は実行時の手続き生成（骨格→管→葉のカード） | 生成AIの3Dモデル（Meshy等）：曲げる・切るができない。容量と権利の確認も増える。AIは「コードを書く」「画を採点する」に使う |
| 骨格は階層（局所の向き）。曲げ＝向きを回す | 節ごとの世界座標：曲げるたびに先ぜんぶの更新が要り、長さが保てない |
| 葉は「カード」の群れ（パッドごと・数千枚） | 葉1枚ずつ：枚数が桁違いでスマホで重い。点群：陰影が付かない |
| 保存は骨格の複製（toJSON）。元に戻すも複製の列（30回） | 操作の再生：生成器の版が変わると別の木になる。差分：複雑で誤りやすい（複製は1回あたり約80KB） |
| 成長は週ごとの刻み。見た目（look）は日付から連続して決める | 日ごとの成長：計算の割に変化が小さい。成長と見た目を一体にする案：季節の途中で骨格が揺れる |
| カメラは自前（回す・寄る・ずらす） | OrbitControls：枝への操作と取り合い、範囲と慣性を自分で決めたい |
| WebGL2（WebGLRenderer）。描画は必要なときだけ | WebGPU：Safari・Android・CIで不安定。常時60fps：電池とCIの負荷 |
| 共有は共通部品＋「写真」。リンクに木を入れる案は見送り（P2） | 木をURLに入れる案：生成器の版に依存し、長さが数KBになる |
| 外部通信ゼロ。保存は localStorage だけ | 計測・オンライン保存：個人情報の扱いが増え、公開ゲートの確認が増える |

## ファイルの持ち主（同じファイルを2人が書かない）
| 担当 | ファイル |
|---|---|
| 親（Claude） | `lib/contract.js`・`lib/rng.js`・`lib/noise.js`・`tests/index.mjs`（各フォルダの *.test.mjs を自動で集める）・`tests/shared/`・`tests/fixtures/`・`tools/`・`meta.json`・`README.md`・根のREADME/THIRD_PARTY・`tests/e2e/day-095.spec.mjs`・統合 |
| A Codex | `lib/calendar.js`・`species.js`・`look.js`・`tree.js`（と、必要な分割）・`pick.js`・`history.js`・`tests/core/` |
| B Grok | `lib/view3d.js`・`tree-mesh.js`・`wire-mesh.js`・`foliage.js`・`textures-tree.js`・`stage.js`・`capture.js`・`tests/render/`（C の分を除く） |
| C Antigravity | `lib/diorama.js`・`textures-stage.js`・`tests/render/diorama.test.mjs` |
| D Codex | `index.html`・`app.css`・`app.js`・`lib/controls.js`・`ui.js`・`audio.js`・`store.js`・`lore.js`・`favicon.svg`・`tests/ui/` |
他担当の未完のファイルが要るときは、先頭に `// TEMP-PLACEHOLDER(<自分>)` を書いた最小の代用品を置く。本物の担当が上書きする。
git の操作（commit・push・stash・checkout）は親だけが行う。

## 予算（通常画質）
JS は three.js を除いて 250KB 以下／三角形 20万以下／描画呼び出し 40以下／葉のカード 6000以下／骨格の作り直し 25ms 以下（節2000）／初回表示 2秒以内（開発機）／保存 400KB 未満／節の総数 2600 以下。

## 公開の門（下書きのうちに通す）
- `npm run check`（precheck・構文・単体・依存監査・ビルド）。`npm run publish:check -- --day 95`。
- 共有（`shared/share.js`）・OGP・canonical・44px・CSP（`script-src 'self'`・`connect-src 'self'`）は、横断の試験が公開済みのDayにだけ掛ける。`meta.json` を published にする前に公開ゲートで流す。
- 同梱物：`LICENSE`（MIT）・`vendor/LICENSE-three.txt`・THIRD_PARTY_NOTICES の行。第三者の画像・音・書体・モデルは無い。
- localStorage の名前に `_KEY` を付けない（gitleaks）。`tests/`・`tools/` は配信されない。

## 失敗のとき
WebGL なし／コンテキスト喪失（`webglcontextlost` で理由と「もう一度」）／保存が壊れている（捨てて新しい苗）／保存できない（そのまま遊べる）／モデルの例外（操作を取り消し、枝は元のまま、通知を出す）。

## 危険と手当て
葉が平らに見える→固定ショットで周回して直す（3周まで）。曲げの手応え→体験の採点と本人の実機で確かめる。CIでの描画が遅い→`gfx=test`。担当間の食い違い→契約の検証（`validateSkeleton`）を統合の最初の関門にする。AIの利用枠切れ→ Codex は個人用へ、Grok と Antigravity は互いに代わる。
