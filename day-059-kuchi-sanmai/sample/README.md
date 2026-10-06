# 同梱サンプル素材の来歴

このフォルダの画像とテスト音は、このアプリの動作確認用に、作者がスクリプトで作成したものです。第三者の素材は含みません。ライセンスはアプリのコードと同じ MIT です。

- `mouth-closed.png` / `mouth-small.png` / `mouth-open.png` / `blink.png`: `tools/gen-sample-sprites.mjs` で Canvas の図形を描画したオリジナルのロボットです。第三者の画像、フォント、キャラクター素材は使用していません。4 枚とも 512 × 640 px で、口と目以外の配置は共通です。
- `demo-tone.wav`: `tools/gen-sample-audio.mjs` が 240 Hz の正弦波から生成する 14 秒の動作確認用テスト音です。無音・小音量・大音量を繰り返し、口の 3 状態を確認できます。48 kHz / モノラル / 16 bit PCM 形式です。人の声、OS の読み上げ音声、外部 TTS、既存楽曲、第三者の録音素材は使用していません。

再生成する場合は、ソースのフォルダ（`source/`）で `node tools/gen-sample-audio.mjs` または `node tools/gen-sample-sprites.mjs` を実行してください。画像の生成には、開発用の依存に入れた Playwright の Chromium を使います（`npx playwright install chromium` で用意）。生成中は外への通信をすべて止めており、外部の素材をダウンロードしません。
