# Day 045 動画ツール実装

## 作ったもの

- `app.js`の検証窓口に`recordEvents(on)`・`events()`・`seconds()`。playingから進むtickの実イベントを記録。返却はコピー、記録開始時にログを初期化。
- `demo-scenario.mjs`が開始後の18秒を記録し、`os.tmpdir()`の`day-045-demo-cues.json`へ`{ secondsAtEnd, events }`を保存。
- `tools/render-demo-audio.mjs`：純関数で6種類の音を合成。周波数・波形・8msの指数アタック・指数減衰はアプリと一致。marchは3音循環・半音量、合成PCMはピーク-1dBFS。末尾同期と冒頭0.3秒の切り出し後、`demo-with-audio.mp4`へ合成。
- `tools/promo/`：説明・絵コンテ・合成ページ・120 BPMの独自BGM・連番撮影renderer。30秒、1080×1920、30fps。固定seedのiframeを手動時計で進める。字幕は動画の絶対時刻で切り替える。
- 前例の書き出し後字幕検査を残した。予定6回・最大0.4秒のずれで合否判定。寸法・音声・尺・最初の弾・結果到達も検査。
- デモ／プロモ／BGMスクリプトはimportガード付き。依存追加なし。素材は既存のアプリ画像と新規コード合成音のみ。

## 検証

- `node --test day-045-read-your-shots/tests/`：61件成功（既存47件＋追加14件）。
- 音が鳴ること、重畳してもピーク制限、時刻→サンプル、WAVヘッダー、包絡線、実Web Audio設定との一致、末尾同期、不正入力、再現性を検証。
- Node上のDOM代替で実bootを起動し、記録イベントとゲームロジックの全列一致、停止・再記録・コピー・paused/over時の重複防止を検証。これはE2Eの代用ではない。
- 固定時間のゲーム再生で、1コマ目に弾、学習の熱、艦隊のひるみ、狙いの移動、×2表示、結果到達を確認。
- 副作用のないimportと構文チェックを実施。Nodeの既存MODULE_TYPELESS_PACKAGE_JSON警告は残る。

## 別担当が実行する順序

リポジトリルートから実行。`PLAYWRIGHT`には利用可能なPlaywrightのindex.jsを設定する。

```sh
export PLAYWRIGHT='<playwright index.js>'
node --test day-045-read-your-shots/tests/
# 1. 録画（キューも同時生成）
node scripts/record-demo.mjs --day 45 --video-only
cd day-045-read-your-shots
# 2. 音重ね（ffmpeg・ffprobe必須）
node tools/render-demo-audio.mjs
# 3. プロモの下見と本番
node tools/promo/render-promo.mjs --preview
node tools/promo/render-promo.mjs --out tools/promo/promo.mp4
```

`PLAYWRIGHT`が相対パスなら、cd後も正しく解決するよう設定し直す。デモとキューは必ず同じ録画で作り、先にdemo.mp4を切り出さない。録画と音重ねを複数ジョブで同時実行しない（一時キュー名が共通）。
生成済みデモの画・音・同期を確認して成功した場合にだけ、別担当がmeta.jsonのdemoを`demo-with-audio.mp4`へ変更する。

## 未確認・対象外

- 指示に従いbuild、dist操作、ローカルサーバー起動、Playwright、実録画・描画、既存E2E11件は実行していない。commit・ブランチ操作・公開もしていない。meta.jsonは変更していない。
- 動画の実画素、字幕差分しきい値、セーフ領域、画像の見え方、フォント、iframeの挙動、音質・最終AACピーク、末尾同期の精度は別担当が確認する。未実施のUI評価・体験評価を合格扱いしない。
- 4–9秒は位置固定の発射。他の場面は同じseedの自動操縦を所定時刻から再生する編集構成。24秒は実状態を早送りして結果を出す。1回の連続プレイではない。
- `--preview`も全30秒を検査する。下見は低解像度から拡大、本番は出力解像度で撮影。生成物は追跡しない。
