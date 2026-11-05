# Day084 AirPresenter

Macで開いた資料を、同じWi-Fiのスマホから操作するローカルアプリです。
公開ページは、macOS向けローカル版の案内と配布を行います。

- 公開ページ： https://rairakku.com/100days/day-084-airpresenter/
- 配布物： `airpresenter-local.zip`
- ソースと起動手順： [source/README.md](source/README.md)

## 使い始める

Node.js 22以上とHomebrewを用意し、ZIPを展開します。
中の`airpresenter`フォルダでターミナルを開き、次を実行します。

```sh
brew install poppler qrencode fontconfig
brew install --cask libreoffice
npm ci
npx playwright install chromium
npm start
```

Macで http://localhost:3084/?mode=dual を開き、資料を選びます。
同じWi-Fiのスマホで、Mac画面のQRを読み取ってください。
QRは操作権限を含むため、接続する人だけに見せます。
終了はターミナルでCtrl+C。再起動後は新しいQRから接続します。

## 操作できること

ページ送り・戻り、暗転、長押しポインター、ページ別のカンペ、共通タイマーを使えます。
PDF・PPTX・PPT、25 MiB・100ページまで対応します。
差し替え中は処理段階・経過時間・生成枚数を確認でき、PowerPointは変換結果を見てから採用します。

PowerPointとは描画エンジンが異なるため、完全一致は保証できません。
見た目を優先するときは、元のPowerPointからPDFを書き出して読み込みます。
アニメーション・動画は静止画になります。
資料はMacで処理し、外部サービスへ送りません。
端末間通信を禁止するWi-Fiではスマホを接続できません。

## 公開物

`source/`には配布するアプリと合成試験、`tools/`にはZIP作成の道具を置きます。
公開ページの画像は自作サンプルです。実資料・変換画像・接続用QR・過去のGit履歴は配布しません。
配布物はMIT Licenseです。外部ツール・パッケージ・既存フォントそのものは同梱しません。
