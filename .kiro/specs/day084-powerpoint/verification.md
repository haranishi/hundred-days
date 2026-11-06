# PowerPoint直接入力の検証

2026-11-06。固定版の実WASMとChromeで検証した。公開後の結果は本変更のPRへ追記する。

## 入力と表示

| 対象 | 結果 |
|---|---|
| 自作PPTX/PPT | 英日・通常/太字・白/緑/紺・PNGを含む3ページを直接入力。実描画画像の色とページ数を確認 |
| 私的な指定資料 | ROOTが完成画面で標準書体/任意のPC書体の2ケースを確認。各29枚のプレビュー・採用・スマホ2→29頁が成功 |
| 実資料の画像 | ROOTが両ケースの全29頁を画像で確認。日本語・背景・図・順序の欠落は見つからなかった |
| PC書体 | 明示ボタンとブラウザー許可で取得。実資料の生成PDFでYuGo-Medium/YuGo-Bold埋込を確認 |
| 原本の保持 | 原本・XML・背景・フォント指定を変更せず、HTTPで原本/PC書体を送信しない |

私的資料は非公開キャッシュだけで扱い、Git・配信・宣伝へ含めていない。
元のMS PowerPointとの画素単位の一致は検証していない。書体による字幅や改行の差は起こり得る。

## 実装の境界と独立レビュー

- Assets/Delivery：独立APPROVED。固定SHA、7資産/8part、全part20MiB以下、84ライセンス/出所ファイルを照合。
- Import/Engine：独立APPROVED。実APIのRED422からPPTX/PPT成功へ変更。原本25MiB、100頁、生成PDF64MiBの境界を確認。
- MacroExecutionMode=NEVER_EXECUTE、UpdateDocMode=NO_UPDATE。外部origin接続は禁止。
- 初期化180秒/読込・変換120秒。準備/変換中断後にiframeと所有Workerが0になることを実Chromeで確認。
- フォントは明示操作だけで取得し、許可待ちの終了競合も含めてセッション終了で解放する。
- 最終統合Task4.1：独立APPROVED。原本を確認したROOTと独立レビューの範囲を分け、公開後の記録はTask5.1へ引き継ぐ。
- UI：独立APPROVED。9工程、3幅390/768/1440、UI18/20・体験19/20、全項目1点以上。44px以上、overflowなし。
- 読込中の段階/経過時間・中断・旧資料継続・全ページ採用/取消を確認。推測の残り時間や率は表示しない。
- 新しいPPTX/PPTフローでスマホのengine取得0、ページ例外0、CSP違反0。
- UI証拠のQRは親と子のopacity0で隠し、旧キャプチャを差し替えた。試験用接続は終了済み。

## 最終統合の証拠

- `npm run check`：構文成功、unit5107件中5106成功/既存skip1/fail0、16依存監査high/critical0、85Day build成功。
- `web/npm test`：23/23成功。実SQLite relay、圧縮stream/HEAD/取消・CSP・認証・終了を確認。
- `web/npm run test:browser`：13/13成功。PDF・暗号/AAD・上限・切断復帰・終了の回帰。
- 実configのChromeとmobile WebKit：暗号化操作・カンペ/時計/暗転/ポインター・終了、WebKitの日本語PDF表示の4工程成功。
- 最新build成功。実engine3/3、既存完成UI14工程、新PowerPoint UI7工程が成功。例外/CSP違反0。
- 公開ゲート：333成功/既存skip1、契約/build/復元成功。更新したDay84静的E2E2/2成功。
- CIは実PowerPoint変換と新UIもDay84必須ジョブへ追加。全必須CI成功後にマージする。

証拠は非配信の`.cache/day084-powerpoint-integration-*.log`、`day084-powerpoint-webkit.log`、`day084-private-final/result.json`。
私的な原本・生成PDF・画像は独立レビューへ渡していない。実資料の目視と書体埋込確認はROOTの確認範囲。

## 制約と公開後

アニメーション・動画は静止画。書体がないPCでは代替書体になるため、採用前に全ページを確認する。
初回は公開エンジンと日本語書体の取得で待ち時間がある。Safari実機・物理QR読取は未検証。
新機能の本番反映、宣伝動画・X草案と保存先メモの更新はTask5.1で行い、結果をPRへ追記する。SNSへは投稿しない。
