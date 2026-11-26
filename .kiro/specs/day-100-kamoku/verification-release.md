# Day100 kamoku の公開と本番確認の記録（2026-11-26）

`verification.md` の続き。マージ前の CI のやり直し、マージ、本番で確かめたことを残す。

## CI のやり直し
- [PR245](https://github.com/haranishi/hundred-days/pull/245) の1回目は、ブラウザ試験の分割1/6で、Day009「矢印キーでカメラが回る」の試験1件（`R` で最初の角度に戻る確認）が時間切れになった。今回の変更は Day009 に触れていない。自動回転を止めるまでに進んだ角度が1度以内であることを前提にした作りで、読み込みが遅いと外れると推定した（未確認）。
- 失敗した分だけをやり直して、全ジョブ成功。同じ試験がもう一度落ちたら、試験を直す。

## マージ
- PR245 を 2026-11-26 16:23（JST）に squash でマージした（`5642e08`。作者は noreply）。本人の依頼（PR を作ってマージする）による。AI署名は付けていない。
- main の `CI and Deploy`（run 45774992194）は、`Deploy production` を含めて全ジョブ成功。

## 本番での確認（`https://rairakku.com/100days/`・2026-11-26・解析の通信を止めて）
| 見たもの | 結果 |
|---|---|
| Day100 のページ | 帯とOGPの題名がある。canonical は公開URL。CSP は `script-src 'self' 'wasm-unsafe-eval'`・`connect-src 'self'`（`'unsafe-eval'` なし） |
| `build-info.json`・`web/shim.js`・WASM 2本・画像・動画・許諾の2ファイル | 200。リポジトリのファイルと MD5 が一致。WASM は `application/wasm` |
| 配らないもの（`tools/`・`tests/`・`LICENSE`） | 404 |
| 共有画像 `assets/og.png` | リポジトリのファイルと一致（100件の絵） |
| 幅1440・390の実際の操作 | 架空の帳簿が開く（2.3秒・1.1秒）。取引の登録で帳簿の末尾の値が変わり、再読み込みで最初の値に戻る。X の共有リンクに公開URL。配信元以外と `/api/` への通信0件、エラーと CSP 違反0件 |
| 一覧 | 100 / 100 公開済み。最新は Day100 kamoku |

## 投稿の準備と本体側
- `npm run x:prepare -- --day 100 --video day-100-kamoku/demo.mp4 --media-reviewed` が通った（本文249/280、返信3本 130・200・265）。投稿は本人。
- kamoku 本体の [PR21](https://github.com/haranishi/kamoku/pull/21) で公開先の URL を README などに足してマージし、GitHub のホームページ欄にも設定した。

## 未了（本人）
実機のスマートフォン・Safari・Firefox の確認／X への投稿／名前「kamoku」の商標の調査（J-PlatPat は 11/26 にメンテナンス中で未調査）／税理士の確認／宣伝動画（未制作）。
