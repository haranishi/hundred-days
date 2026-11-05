# AirPresenter ローカル版

macOSのPCで資料を開き、同じWi-Fiのスマホからページ送り・暗転・ポインターを操作するWebアプリです。
資料はこのPCのサーバーで処理し、外部サービスへ送りません。

## 必要な環境
Node.js 22以上、Homebrew、Poppler、qrencode、Fontconfig、LibreOffice、PlaywrightのChromium。
PCとスマホを同じWi-Fiへ接続します。端末間通信が禁止されたWi-Fiでは接続できません。
この配布版はmacOSで動作確認しています。

## 起動
ZIPを展開し、airpresenterフォルダの中でターミナルを開きます。

```sh
brew install poppler qrencode fontconfig
brew install --cask libreoffice
npm ci
npx playwright install chromium
npm start
```

PCで http://localhost:3084/?mode=dual を開き、PC画面のQRをスマホのカメラで読み取ります。
QRは操作権限を含むため、接続する人だけに見せてください。
終了はターミナルでCtrl+C。再起動後はPC画面を再読み込みし、新しいQRから接続します。

## 資料を選ぶ
PDF・PPTX・PPT、25 MiB・100ページまで。資料の準備中は段階・経過時間・生成枚数を表示します。
PowerPointは全ページの変換結果を確認し、「この資料で発表する」で採用してください。
取消・変換失敗では現在の資料を維持します。別の資料を選び直すこともできます。
閉じて準備を続けたり、ページ再読込後に進行状況・未採用候補へ戻れます。

PowerPointとは描画エンジンが異なるため、完全一致は保証できません。
見た目を優先する場合は元のPowerPointの「ファイル → エクスポート／名前を付けて保存 → PDF」で書き出し、このPDFを選んでください。
アニメーション・動画は静止画になります。
PPTX/PPTはLibreOfficeのSVG→隔離Chromium→PNG、PDFはPopplerで画像化します。原本のXML・背景・フォントを書き換えません。
Macの既存フォントを変換用プロファイルへ参照させます。フォントの再配布やOSの変更は行いません。

## 操作
- スマホ：大きな左右ボタンで送り・戻り、暗転、長押し中だけポインターを表示。
- PC：Space/→で次へ、←で戻る、Bで暗転、Fで全画面、Escで終了。入力欄では割り込みません。
- 全画面の操作バーは上端・下端への移動やTabで呼び出します。
- PCでページ別カンペを保存し、スマホで確認できます。
- 開始・一時停止・リセットができる共通タイマーを使えます。
- 通常のLAN HTTPでは、ポインターを長押し＋指で移動します。傾き操作は対応HTTPS環境と端末の権限が必要です。

資料・カンペ・一時データは通常終了時に消去します。強制終了では残る場合があります。
保存先はAIRPRESENTER_DATA_DIR、既存の.runtime、OSの一時領域の順で選びます。
インストール時に依存パッケージと描画ブラウザを取得します。発表資料の外部送信はありません。

## 検証
```sh
npm run check
npm test
npm run test:browser
```
Python 3で合成資料を作り、Macの日本語画像検証にはSwift/Visionを使用します。
既定のブラウザ試験画像は.artifactsに保存します。
実資料・変換画像・接続用QRはこの配布物に含みません。
