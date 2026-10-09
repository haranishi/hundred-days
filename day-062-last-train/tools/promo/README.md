# Day062「終電サドンデス」のプロモーション素材

32秒の縦型動画。終電時刻から、お会計・トイレ・徒歩・改札ダッシュなどのタイムロスを逆算し、店を出るべき限界時刻を突きつける実画面を使う。
音なしでも内容が伝わる字幕に、コードで合成したBGMを加える。

## 再生成

リポジトリのルートで、依存関係とPlaywrightのChromiumを用意して実行する。
ffmpeg / ffprobe と、ローカルの Zen Kaku Gothic New Bold が必要。
別の保存場所にある書体を使う場合は `PROMO_FONT` を指定する。

```sh
npm run build
node day-062-last-train/tools/promo/render-promo.mjs
```

`output/Day062_last_train_promo.mp4` にH.264 / AAC、1080×1920、30fpsで出力する。
録画元は540×960の実画面。字幕、注目箇所の枠、終了カードは撮影時だけ重ねる。
一覧用の既存 `demo.mp4` とアプリ本体は変更しない。
生成された動画・音源・確認用画像はGit管理の対象外。

## 画面と字幕の照合

| 秒 | 内容 | 実画面で確認する値 |
|---|---|---|
| 0–4 | 終電の問いかけとタイマーボード | 新宿駅 ➔ 吉祥寺駅、終電 23:55 |
| 4–8 | タイムロスの逆算操作 | トイレチェックON (+4分)、徒歩12分へ |
| 8–13 | 限界時刻の提示 | 想定タイムロス29分、店を出るべき時刻の急減 |
| 13–18 | 全国主要駅の設定 | プリセットから渋谷駅へ切り替え |
| 18–23 | 臨界・サドンデス突入 | 警戒バナー LEVEL 4 サドンデス発動 |
| 23–28 | 逃せば終電死亡・始発サバイバル | DEAD ENDパネル、サバイバルルーレット |
| 28–32 | 終了カード | 公開URL・リプライへの案内 |

## 使用素材と権利

- 映像：このリポジトリの公開アプリをローカルで操作。実製品の画像や外部データは使わない。
- BGM：自作の純JS合成コードによるBGM。外部音源・サンプルは使わない。
- 字幕：Zen Kaku Gothic New、SIL Open Font License 1.1。
- アプリのOSS通知：`../../legal/THIRD_PARTY_NOTICES.txt`。

## X投稿素材

本文は `../../meta.json` の `social.x.body` に保存する。
完成動画を確認してから、次のコマンドで文字数・URL・ビルド・メタデータを検査する。

```sh
npm run x:prepare -- --day 62 \
  --video day-062-last-train/tools/promo/output/Day062_last_train_promo.mp4 \
  --media-reviewed
```

投稿キットは `.social-output/day-062/` に生成される。Xへの投稿は行わない。
