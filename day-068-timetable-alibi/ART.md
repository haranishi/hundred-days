# 人物画と背景の制作記録
- 制作日：2026-10-16。
- 組み込み image_gen で、この作品用に新規生成。CLI・外部音声APIは使用していない。
- 成人の架空人物。初期の表情シートは3人分。既存作品・実在人物の参照画像は指定していない。
- 2×2の透過表情シート。左上：平常、右上：発話、左下：動揺、右下：安堵。
- 画像を切り抜かず、CSSで表示セルを切り替える。発話の切替は文字送り中のみ。
- 配信用にWebPへ変換。画素数・アルファを維持し、EXIF・XMPを含めない。
- 保存先：assets/shiori-expressions.webp、assets/toru-expressions.webp、assets/akari-expressions.webp。
- 最終プロンプト全文：[prompts.json](assets/prompts.json)。
- 合計：802,658 bytes。元PNGは3点計5,836,445 bytesで、配信量は約86%減。
- 生成時の元PNGはアプリから参照しない。配信に必要な最終画像はこのディレクトリ内に同梱。

## 第1話の背景
- 同日の組み込み image_gen で3点を新規制作。実在の駅や他作品を参照していない。
- 待合室：assets/episode/concourse-night.webp、308,900 bytes。
- 閉鎖ホーム：assets/episode/platform-night.webp、400,072 bytes。
- 港の記録映像：assets/episode/harbor-footage.webp、333,634 bytes。
- 最終プロンプト全文：[episode/prompts.json](assets/episode/prompts.json)。
- WebP3点計1,042,606 bytes。元画像の寸法を保ち、配信用形式へ変換した。
- 港の人物は傘で顔を隠した架空の成人。時刻・駅名・資料のラベルはHTMLで表示する。
- カメラの記録は待合室背景と透の人物画を画面内で組み合わせた架空の写真。
- 壁時計は8:40で故障した設定。捜査の時刻はカメラの保存時刻23:14を使う。

## 完結版の追加素材

- 同日の組み込み image_gen で背景3点と編集者の表情シートを新規制作。
- 列車内：assets/complete/train-car-night.webp、312,664 bytes。
- 灯台港：assets/complete/harbor-platform.webp、427,330 bytes。
- 駅務室：assets/complete/station-office.webp、313,876 bytes。
- 高瀬 玲：assets/complete/takase-expressions.webp、295,586 bytes。架空の成人、透過2×2。
- 最終プロンプト全文：[complete/prompts.json](assets/complete/prompts.json)。
- 合計1,349,456 bytes。生成元の寸法と透過を維持し、配信用WebPへ変換した。
- 灯は既存の三好 灯の表情シートを再利用。列車・駅・衣装は架空で、参照画像は指定していない。
- 写真の封筒・受領控え・入構記録・最後の写真は、背景と人物画にHTML/CSSを重ねて表示する。
- 写真の削除を選んだ後は、所持品の元写真を表示しない。最後の写真は選んだ構図から表示する。
