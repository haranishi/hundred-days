# フリップコート：調査と設計判断

## Summary
新規ゲームの全体調査と、既存の静的アプリへの接続を確認した。
既存69本の構成に合わせ、追加の実行時依存を使わず、Canvas 2DとDOMで作る。

## Research Log
- 既存コード：package.json、scripts/build.mjs、scripts/serve-dist.mjs、shared/share.js、Day068の構成。
- 共有は既存の正本を同期する。コピー失敗は案内し、共有シートの取消で試合結果を失わない。
- draftは標準distから除外される。公開状態を変えず確認するため、新Dayだけを配る小さなpreviewサーバーを使う。
- 既存serve-distはdist固定で、draftのソースを配れない。サーバーは公開ファイルの許可リストだけを配る。
- rootビルドへはtoolsの配信除外1件を追加する。draftの除外ロジックは変更しない。
- テストは既存のNode標準テストとPlaywright 1.62.1を使う。既存のブラウザキャッシュを確認してから実行する。

## 参照した公式資料
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)：フレーム時刻で進行し、バックグラウンド停止だけに頼らない。
- [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)：ドラッグを捕捉し、pointerup/cancel/lostcaptureで入力を終了する。
- [pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event)：OSによる操作中断も処理する。
- [Playwright Clock](https://playwright.dev/docs/clock)：境界試験と実時間の体験評価を分ける。installは読込前に行う。

## Architecture Pattern Evaluation
| 選択肢 | 判断 |
|---|---|
| 既存の静的JSとCanvas 2D | 採用。1画面・1体のCPU・36マスに必要十分 |
| 新しいゲームエンジン | 描画・状態管理を増やす割に今回の利点が小さいため採用しない |
| サーバー対戦 | 承認済みの1人CPU戦の範囲から外れるため採用しない |

## Design Decisions
- 盤面判定は純粋関数、ラリー・CPU・時間は同じシミュレーションにまとめる。CPUにも同じ着地判定を使う。
- 画面は世界座標を拡大縮小する。タッチ入力も同じ座標へ変換し、端末ごとに別の当たり判定を作らない。
- ラケット中央なら奥へ、端なら横へ浅く返る。着地位置の予告と反転箇所を見せて、一打の意味を読めるようにする。
- 60秒は実際に進行した試合時間。非表示・一時停止・共有/説明中は止め、再開は本人の操作で行う。
- シミュレーションは短い刻みで進め、60秒をまたぐ着地を加点しない。描画のコマ落ちでゲーム時間を水増ししない。
- 初期陣地は上3行CPU・下3行プレイヤーの各18マス。空きマスも判定関数では扱える。
- UIは明るい紙色、深いコート色、暖色と青緑の2陣営。色以外に丸・菱形の印を使う。
- 音源・外部画像・外部フォントは導入せず、コートと紹介画像は自作描画から生成する。

## 使用した追加スキル
- search-first、ponytail：共有・検査を再利用し、新しい依存や汎用エンジンを増やさない。
- ui-ux-pro-max：ローカル資料のfocusとモーダル内操作の助言を採用。検索に出たLP/ピクセル書体は本ゲームに合わないため採用しない。
- superpowers：不具合の原因調査、レビュー指摘の確認、完了前の証拠照合に使う。

## Risks & Mitigations
- 反転を読めない：着地マーク、反転枚数、控えめな強調を使い、実操作で確かめる。
- CPUが強すぎる：移動速度と反応に制限を設ける。難易度の調整は試遊の観察に基づく。
- pauseや再戦後の入力残留：入力を破棄し、単一の描画ループだけが現在の試合を進める。
- AI評価だけで人間の面白さや物理端末の動作を保証しない。
