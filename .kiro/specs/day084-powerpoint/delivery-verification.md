# 公開エンジン配信の再検証

## 公開後に見つかった問題

PR209の全必須CI42174231055が成功し、main722399fへマージ。Worker c19b9b2cを正式routeへ反映した。
公開URLで標準PPTX/PPTの直接入力と、PDF/スマホ/全画面等9工程は成功した。
その後、エンジン初期化中に失敗するケースが見つかった。PC書体の有無や元資料自体が直接原因ではない。

独立ChromeでHTTP200とloadingFinishedにもかかわらず、WASMが120,503,064B、fallback8,430,743Bで完了した。期待rawは161,667,499B。
旧office Workerが0になり5秒待っても91,198,172B/160,617Bへ欠け、終了待ちでは解決しない。
curlおよび単独ブラウザーでの取得はraw SHA一致となる場合もある。固定アセットの誤配置ではなく間欠的な途中切れを確認した。
CPU超過や通信層のどれが切断を起こしたかは未確定。今回の修正は、受信データ欠損という直接原因を対象にする。

## 修正する契約

- 通常ReadableStreamの手動Content-LengthはWorkerdでは無視される。実HTTPでも長さがなかった。
- 圧縮wire総bytesのFixedLengthStreamを使い、ASSETS bodyをnative pipeToで順につなぐ。最後にcloseし、失敗はabortへ伝える。
- JSによる各chunkの読書きをやめ、実Content-Lengthと過不足のエラーを保証する。encodeBody:manual、Brotli/gzip、登録pathとpreflightを維持する。
- Nodeの小さいfixtureは標準TransformStreamの注入で確認する。長さ保証と不完全body拒否は実Workerd/HTTPで検証する。
- 不完全な200がimmutableで残り得るため、配信pathをstream-v2へ変更する。元エンジン・raw SHA・ソースURLは変更しない。

一次資料：[Response](https://developers.cloudflare.com/workers/runtime-apis/response/)、[FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/)。

## ローカル修正の検証

- 実Workerd HTTPのGET Content-Lengthがundefined≠57でRED。固定長化後はGET/HEADの圧縮wire長と元bytesが一致。
- 配信10/10成功。実HTTPで過少/過大bodyをabortし、同Workerd内で下流取消→source取消・次part未取得を確認。
- 最終relay/assets25/25、実engine3/3、新UI7工程成功。ページ例外/CSP違反0、スマホengine取得0。
- 共通check：5106成功/既存skip1/fail0、16依存監査失敗0、85Day build成功。
- 独立レビューAPPROVED。別scratchの実Workerd3試験でGET/HEAD・wire bytes・過不足拒否・native取消を確認。
- Node fixtureの標準TS注入は長さ保証の証拠に使わず、本番FixedLengthStream経路を実runtimeで検証した。

## 検証の範囲

実装・独立レビュー、全必須CI、修正PRのマージ、同Day route反映を行う。
公開後はブラウザーでraw bytes/SHAを照合し、同一画面でPPTX/PPT・標準/許可PC書体の連続入力と採用・スマホ操作を確認する。
元の研究資料は引き続きローカルだけで扱い、公開試験・映像・Gitには含めない。
完了結果と時刻/Worker versionは修正PRへ追記する。この記録自体は公開成功を先取りしない。

証拠：非配信.cache/day084-post-release-review/、day084-native-fonts-*.log、day084-public-asset-audit.log。
