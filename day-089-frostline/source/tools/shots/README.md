# 器の実ブラウザ検査

先に `npm run dev` を起動する。器だけの入口は `http://127.0.0.1:5183/dev/shell.html`。
本番入口（既定URL `/`）は、統合担当が `src/main.js` を用意してから検査する。

```sh
node tools/shots/boot-check.mjs http://127.0.0.1:5183/dev/shell.html
node tools/shots/boot-check.mjs http://127.0.0.1:5183/dev/shell.html --webgl
node tools/shots/boot-check.mjs http://127.0.0.1:5183/dev/shell.html --webkit
node tools/shots/capture.mjs http://127.0.0.1:5183/dev/shell.html
node tools/shots/capture.mjs http://127.0.0.1:5183/dev/shell.html --webgl
node tools/shots/capture.mjs http://127.0.0.1:5183/dev/shell.html --webkit
node tools/shots/touch-check.mjs http://127.0.0.1:5183/dev/shell.html
```

出力先の既定は、OS の一時フォルダの `ginrei-shots`。`--out DIR` で変更できる。
`--url URL` でも対象を指定できる。`--webgl` は URL に `webgl=1` を付ける。
器の上面図はどの方式でも2Dのままであり、3Dの方式そのものは本番統合後に `info.backend` で確認する。
Chromium は Playwright 同梱版と Metal/WebGPU 引数を使い、WebKit は Safari 系の検査を行う。

`capture` は既定で3場面×3幅の9枚と状態のJSONを保存する。
本物の山で出発地点の名前が違う場合は、`scenes.mjs` と同じ形の一覧を既定exportした
ローカルのモジュールを `--scenes FILE.mjs` で指定する。各操作は値の部分更新ではなく置き換え。
`camera` は `third` または `first`。`spawn` には名前か `{x,z,heading,speed}` を指定できる。
手動送りは開始前に有効にし、各場面は新しいページから再現する。

`touch-check` は3幅と844×390の横向きで、44px・画面内・部品同士と表示との重なり・横スクロールを検査する。
続いてCDPで左右の指を同時に押し、離す順序と取消を変えて実際の入力値を確かめる。

警告・誤り・ページ例外・開発窓口のerrorsが1件でもあれば終了コード1になる。
失敗経路の確認では一時的に検査対象ページで警告を出し、boot-checkが1で終わることを確認する。
小さい部品や重なりの検出は、対象CSSを一時的に変更してtouch-checkが1で終わることを確認する。
検査用の変更は確認後に戻す。待ち時間には上限があり、終了時はブラウザを必ず閉じる。
この実装作業ではブラウザを起動していないため、上記の実行結果は依頼元で記録する。

## 後から足した道具

| 道具 | 何をするか |
|---|---|
| `play-probe.mjs` | 出発地点と操作の列（例 `--steps "3:;1:steer=1;1:brake=1"`）を渡すと、滑らせて区切りごとに撮る。`--orbit` で滑走者を決まった向きから撮る |
| `play-session.mjs` | ブラウザを開いたまま、操作と時間送りを 1 手ずつ受ける（採点用）。座標や速さの書き換えは受けない。最後に必ず `/quit` |
| `tier-check.mjs` | 滑走中に画質の段を切り替えて、誤りが出ないことを確かめる |
| `perf-check.mjs` | 出発地点ごとに実時間で滑らせ、コマの間隔（中央値・95% 点・最大）を出す。画面なしのブラウザの値なので、比較に使う |
| `audio-check.mjs` | 音を 8 場面ぶん描き出して、実効値と最大値を測る（聞こえ方の確認ではない） |
| `scenes-mountain.mjs` | 本物の山での固定の場面（`capture.mjs --scenes` に渡す）。出発地点は名前で指す |

同じ操作なら同じ絵が撮れる：手動送りの間は、木の読み込みを時間ではなく個数で区切る。前後の比較を画素単位でしたいときは、`--q mid`（残像処理なし）で撮る。
採点役に見せるのは、開発サーバーではなく固めた版（`npx vite build` → `npx vite preview --port 5185`）。編集のたびにページが読み直されるのを避ける。
