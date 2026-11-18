# スーパーやりたい放題 宣伝動画ツール

ブラウザゲーム「スーパーやりたい放題」の縦型予告編を作る道具です。1080×1920・30fps・30秒（900コマ）、120 BPM・4拍子・15小節で構成します。映像はすべて実際のゲームを1コマずつ撮ったものを使い、撮影用の視点・スローなどの演出・字幕・BGMを加えます。BGMは外部音源を使わずコードで合成する自作の2案（a: 特売エレクトロ・ポップ、b: スーパー特売ブラス・ファンク）です。

## 必要な環境

- Node.js 24系とnpm。以下のコマンドはすべて `day-094-super-yaritai/source/` の直下で実行します。
- `npm ci` で導入する依存パッケージ。
- PlaywrightのChromium（`npx playwright install chromium` で導入）。撮影はANGLE SwiftShaderを使う画面なしブラウザで行います。
- FFmpegとffprobe。`libx264`・`aac`・`libmp3lame` を含み、`loudnorm`・`showspectrumpic` などコード内のフィルターを利用できるビルドが必要です。カメラ比較画像の組み立てには `drawtext` も使います。通常はPATHから探し、必要なら環境変数 `FFMPEG`・`FFPROBE` で実行ファイルを指定できます。
- 日本語書体 **Zen Kaku Gothic NewのBold（700）とBlack（900）**。書体ファイルはリポジトリに入れていません。[Google Fonts](https://fonts.google.com/specimen/Zen+Kaku+Gothic+New)から入手してください。ライセンスは [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/zenkakugothicnew/OFL.txt) です。

`render-promo.mjs` の書体指定は次のとおりです。環境変数はそれぞれの書体ファイルを指します。

| 書体 | 環境変数 | 未指定時の探し先 |
| --- | --- | --- |
| Bold | `PROMO_FONT` | `homedir()` に `Library/Fonts/ZenKakuGothicNew-Bold.ttf` を結合した場所 |
| Black | `PROMO_FONT_BLACK` | `homedir()` に `Library/Fonts/ZenKakuGothicNew-Black.ttf` を結合した場所 |

`homedir()` は実行ユーザーのホームフォルダです。これらはmacOS向けの既定値なので、別の場所に保存した場合や別OSでは環境変数を設定してください。例えば、入手したファイルをリポジトリ外に置き、その場所への相対パスを指定できます。

```sh
export PROMO_FONT=../../fonts/ZenKakuGothicNew-Bold.ttf
export PROMO_FONT_BLACK=../../fonts/ZenKakuGothicNew-Black.ttf
```

書体の読み込み時に `ENOENT`（ファイルが見つからない）などが出たら、`PROMO_FONT` がBold、`PROMO_FONT_BLACK` がBlackの実在するファイルを指すか確認してください。現在の実装は書体専用のエラー案内を出さず、ファイル読み込みのエラーを返します。

## 撮影と組み立て

依存パッケージとChromiumを準備します。

```sh
npm ci
npx playwright install chromium
```

書体を指定したうえで、ゲームのビルド、BGMの合成と検査、撮影と組み立ての順に進めます。

```sh
npm run build
node tools/promo/promo-audio.mjs --variant a --out-dir out/promo
node tools/promo/promo-audio.mjs --variant b --out-dir out/promo
node tools/promo/verify-audio.mjs --out-dir out/promo
node tools/promo/render-promo.mjs --frames-dir frames/promo --out-dir out/promo --mux a,b
```

検査が失敗したら、レポートを確認してから次へ進んでください。`out/` と `frames/` は `source/.gitignore` で無視される使い捨ての出力先です。残したい成果物は別の場所にコピーしてください。撮影にはビルド済みの `dist/client` を使い、スクリプト自身がローカルの配信サーバーを起動します。ゲームの撮影中は配信元以外への通信を遮断します。

`--frames-dir`・`--out-dir` を省略する場合は、それぞれ `PROMO_FRAMES_DIR`・`PROMO_OUT_DIR` が必要です。BGM合成と音声検査も `PROMO_OUT_DIR` を代わりに使えます。`--mux a,b` は同じ出力先の `bgm_a`・`bgm_b` を使い、BGM付き動画を2本作ります（WAVを優先し、なければMP3）。`--mux` を省略すると無音動画だけを作ります。

### 撮影・合成のオプション

| 引数 | 意味 |
| --- | --- |
| `--only <名前,...>` | カンマ区切りで撮影・生成対象を限定します。対象は `pyramid,sweep,cart,bowling,banana,samples,freezer,combo,chase,results,showdown,overlay`。合成は通常どおり実行されるため、部分撮影では既存の残りのコマが必要です。未知の名前はエラーにせず対象から外れるので、綴りを確認してください。 |
| `--compose-only` | ゲーム撮影とオーバーレイ生成を両方省略し、既存のコマから合成・動画検査を行います。`--only` より優先します。ビルド済みの `dist/client` も必要です。 |
| `--no-compose` | 動画合成とオーバーレイ生成を両方省略し、ゲーム撮影とフレーム側のレポート保存だけを行います。`--only overlay` と併用してもオーバーレイは生成しません。 |
| `--clean` | 合成・動画検査・レポート保存が成功した後に、撮影・合成の中間サブフォルダを削除します。`--no-compose` のときは削除しません。動画とレポートは残ります。 |
| `--port <番号>` | ローカル配信サーバーのポートです。既定値は `4399`。 |

**再実行時の削除に注意してください。** `--clean` がなくても、撮影対象テイクのサブフォルダは撮影開始時に中身ごと削除して作り直します。オーバーレイ生成は `overlay/`・`cards/`、合成は `base/`・`overlay-rgba/`、詳細確認画像の生成は出力先の `strips/` を作り直します。`--compose-only` でも合成用の中間フォルダは作り直されます。既存の同名動画・画像・BGM・レポートも上書きされます。出力先に保管用のデータを混ぜないでください。

## スクリプトの役割

| ファイル | 役割 |
| --- | --- |
| `timeline.mjs` | 映像と音楽で共有する時刻表。テイクの範囲、カット、字幕、演出、音楽キューを定義します。 |
| `promo-audio.mjs` | BGMの2案をJavaScriptで合成し、音量調整を行ってWAVとMP3を書き出します。 |
| `verify-audio.mjs` | 両案のLUFS、True Peak、クリッピング、無音区間、同期誤差、形式、再生成時のSHA256一致などを検査し、スペクトログラムと数値レポートを作ります。 |
| `render-promo.mjs` | 仮想クロックと撮影用カメラでゲームのコマを撮り、字幕・演出・エンドカードを生成してFFmpegで合成します。ゲームは1/60秒単位で進め、スローなど場面ごとの進み方を調整して30fpsの映像にします。動画形式やコマの欠損、単色による遮蔽なども検査します。 |
| `shared.mjs` | 撮影用の静的サーバー、Chromium設定、仮想クロック、ゲーム操作、カメラ補間、テイク操作を共有します。単独で実行する道具ではありません。 |
| `camera-study.mjs` | 同じゲーム状態でカメラ候補を比較する試し撮りを行います。 |

ゲーム側の撮影用の窓口は `window.__SY__` です。公開ビルドでは `?debug=1` のときだけ現れ、撮影スクリプトもこの指定で開きます。`camera(pose)` で視点を指定し、`camera(null)` で標準追従に戻します。`seed()`・`teleport()`・`face()`・`state()` なども使います。窓口の一覧は [作り方と検証](../../docs/06_作り方と検証.md) を参照してください。

### カメラ候補の試し撮り

`camera-study.mjs` は、ピラミッド・棚・カート・ボウリング・バナナ・冷凍ケース・コンボ・追走の8場面で、同じ物理状態のまま標準・中寄り・寄って低い視点を順に撮ります。出力先は固定の `out/study-r2/` です。ファイル名とJSONで使う識別子は、標準が `R1`、中寄りが `A`、寄って低い視点が `B` です。比較画像も左からこの順に並びます。これらは保存形式として使われる名前です。撮り直した場面の同名JPEGとメタデータを上書きし、全24枚がそろうと比較画像を作ります。比較画像のラベル用書体は、ホームフォルダの `Library/Fonts/ZenKakuGothicNew-Bold.ttf` だけを探し、なければFFmpegの既定書体を使います。このスクリプトは `PROMO_FONT`・`PROMO_FONT_BLACK` を参照しません。

```sh
node tools/promo/camera-study.mjs
node tools/promo/camera-study.mjs --only pyramid
node tools/promo/camera-study.mjs --sheet-only
```

`--only` は上記8場面の名前をカンマ区切りで指定できます。`--sheet-only` は撮影せず既存の24枚から比較画像だけを作ります。未撮影の画像があれば比較画像の生成をスキップします。`--port` の既定値は `4401` です。

## 出力ファイル

通常手順の出力先は次のとおりです。レポートには指定先から解決したパスや実行時の診断情報が含まれる場合があるため、共有前に内容を確認してください。

| 場所 | ファイル・内容 |
| --- | --- |
| `out/promo/` | `Day094_super-yaritai_promo_silent.mp4`（無音動画）、`Day094_super-yaritai_promo_a.mp4`・`Day094_super-yaritai_promo_b.mp4`（`--mux a,b` で生成するBGM付き動画） |
| `out/promo/` | `bgm_a.wav`・`bgm_b.wav`（48kHz・16bit・ステレオPCM）、`bgm_a.mp3`・`bgm_b.mp3`（192kbps） |
| `out/promo/` | `spectrogram-a.png`・`spectrogram-b.png`（音声検査で生成）と `audio-report.json`（数値・合否） |
| `out/promo/` | `first-frame.png`、`contact-sheet.jpg`、`cut-check-1.jpg` 以降の連番（冒頭・全体・カット前後の確認用） |
| `out/promo/strips/` | `01_pyramid_rules.jpg`、`02_sweep_cart.jpg`、`03_bowling.jpg`、`04_banana_s6.jpg`、`05_combo_chase.jpg`、`06_results_end.jpg`（代表コマの詳細確認用） |
| `out/promo/` | `occlusion-report.json`（遮蔽走査）、`capture-report.json`（撮影・字幕・通信・動画形式など） |
| `frames/promo/` | テイク別の `f00000.jpg` 以降の連番、`overlay/o00000.png` 以降の連番、`cards/` のエンドカード、`base/` のリンク、`overlay-rgba/` の合成用PNG、`capture-report.json`。中間フォルダは `--clean` で削除できます。 |
| `out/study-r2/` | カメラ比較の `<場面>_R1.jpg`・`<場面>_A.jpg`・`<場面>_B.jpg`、`sheet.jpg`（8行×3列）、`study-meta.json`（ゲーム状態・カメラ設定） |

音声検査は数値とスペクトログラムを使う検査です。LUFSやTrue Peakなどの合格だけでは、音色・聴きやすさ・映像との印象の一致は判断できません。**耳での確認は別に行ってください。**

字幕のはみ出しや単色による遮蔽の自動検査も、画面内のすべての重なりを保証するものではありません。画面の端の字幕とゲーム内の表示が重ならないか、`contact-sheet.jpg`・`cut-check-*.jpg`・`strips/` の画像を目視し、完成動画でも確認してください。
