# Day093「find」の宣伝動画

32秒の縦型動画（1080×1920・30fps）と100日一覧用の `demo.mp4`（540×960・16秒・無音）を作る道具です。
機能の羅列ではなく、「服さがしに疲れた気持ち → 左右スワイプの直感 → 3つの質問と写真選び → お試し8枚 → 好み反映と1手戻し → お気に入り」の流れで構成しています。

## 撮影の仕組み

- **手元再現（外部通信0）**: ページは `https://day93.rairakku.com/` として開き、Playwright の `context.route` で静的配信を本番と同一ビルドの控え（`PROMO_SITE_DIR`）から、API を手元の統合 Worker（`createUnifiedApp`＋使い捨てローカル SQLite/libSQL DB 4本）から返します。他の住所への通信は遮断して 0 件を検証します。
- **デモ商品と非表示要素**: アプリ自前のルック写真16枚×2巡（計32件・予算内外で2巡目が後ろに回る構成）を投入し（好みの系統「きれいめ」の写真は2巡目を女性向けにしない。同じ写真の別商品が続けて出ないため。撮影後の点検が見張る）、撮影中だけ CSS で `.card .shop-row`・`#sheet-shop`・`#sheet-go`・`#sheet-disclosure`・`#fav-grid .fav-btn`・設定の収益説明と Yahoo! 表示を隠します（PR 表記は維持）。
- **時計制御と切り抜き**: `requestAnimationFrame`・`performance.now`・`Date.now`・`setTimeout`・Web Animations を凍結し 1/60 秒×2 ずつ進めて撮影します。スワイプ解放時は仮想時計を即座に進めて飛出カードの半透明重なりを防ぎ（重なり3コマ以内）、予算（C-3）の折れ注記、写真選択（C-4）の途中切れ行、結果画面（S5）の下段商品欄、お気に入り（S7）の上段重複PR帯は `windowFrames` で切り抜いて除外します。商品表示中は見出し直下に「画面の商品はイメージです」を常時表示します。

## 再生成コマンド

必要な環境変数（または同等引数 `--site-dir` 等）：`PROMO_SITE_DIR`・`PROMO_FIND_ROOT`・`PROMO_FRAMES_DIR`・`PROMO_OUT_DIR`（書体既定は `~/Library/Fonts/ZenKakuGothicNew-{Bold,Black}.ttf`、別場所は `PROMO_FONT` / `PROMO_FONT_BLACK`）。

```sh
node day-093-find/tools/promo/promo-audio.mjs --variant a --out-dir <out>
node day-093-find/tools/promo/promo-audio.mjs --variant b --out-dir <out>
node day-093-find/tools/promo/verify-audio.mjs --out-dir <out>
node day-093-find/tools/promo/render-promo.mjs --site-dir <site> --find-root <find> --frames-dir <frames> --out-dir <out> --mux a,b
```

- 分割実行: `--only hook,drop,flow,overlay`、`--no-compose`、`--compose-only`。
- 所要時間目安（実測値）: BGM生成＋検証約20秒（生成約8秒＋検証約12秒）、撮影＋合成＋検証約1分55秒（撮影約38秒＋合成・検算約74秒）。既存の `frames/hook`・`frames/drop`・`frames/flow` が揃っていれば `--only overlay --mux a,b`（約74秒）だけで重ね・書き出しを再実行できる。

## 画面と字幕の照合表

| 秒 | 字幕 / カード | 画面で起きていること | 事実照合 |
|---|---|---|---|
| 0–2.5 | 服さがし、／スクロールに疲れてない？ | 本画面で指がカードをゆっくり右へ引き、終盤に離して次カードへ | 主観への問い |
| 2.5–5.0 | （札3枚） | アプリなし。検索疲労の札が1拍ごとに出る | 主観表現 |
| 5.0–7.5 | 好きか、ちがうか。／左右にスワイプ。 | 本画面で右（♥）→左（✕）へスワイプ | 画面操作の事実 |
| 7.5–12.5 | 3つの質問と、／好きな雰囲気の写真選び。 | 誰の服→年代→予算→写真を欠けずに表示し5枚選択（C-0除外） | 導入手順の事実 |
| 12.5–17.5 | 右で好き、左でちがう。／まずは8枚、お試し。 | お試し画面で1枚目〜8枚目まで順に全8枚をスワイプ | お試し8枚の事実 |
| 17.5–20.0 | 写真選びと8枚から、／好みの傾向をチェック。 | 系統名と割合バーまで1行表示（下段商品は除外） | 初期傾向の事実 |
| 20.0–22.5 | 選んだ好みを、／服の並びに反映。 | 本画面で好み系統（#きれいめ）の服が3枚続けて出てスワイプ | 学習反映の事実 |
| 22.5–25.0 | ひとつ前のスワイプも、／もどせる。 | ↺にタップの輪が出て直前カードを復元し、約1秒後に次場面へ | アンドゥの事実 |
| 25.0–27.5 | 好きな服は、／お気に入りに。 | お気に入り一覧（4件・PR表記1つ・購入ボタン非表示）を表示 | 自動保存の事実 |
| 27.5–32.0 | （終わりのカード） | find / 登録なし・無料 / ブラウザから試せる / day93.rairakku.com / DAY 093 / 100 / 画面の商品はイメージです | 公開条件の事実 |

## BGM と検証

- 96 BPM・32秒。A「クローゼット・ポップ」（D major・シンセプラック＋FMエレピ）と B「ウィンドウ・ステップ」（Bb major・Rhodes＋マリンバ）の2案を純 JS 計算で合成（録音・外部サンプルなし）。
- `verify-audio.mjs` で −16 LUFS±1・真のピーク ≤ −1.5 dBTP・クリップ 0・ドロップ前後 ≥ +3 dB・再生成 SHA256 一致とスペクトログラムを確認（耳での試聴は未実施）。

## 素材と権利

- アプリ画面・ルック写真16枚: `find` 公開用ビルドおよびアプリ同梱の自前画像。外部ショップの商品写真・店名・モール名は不使用。
- 書体: Zen Kaku Gothic New Bold / Black（SIL Open Font License 1.1、リポジトリ外参照）。
- BGM: `promo-audio.mjs` による純 JS 合成（第三者音源なし）。
