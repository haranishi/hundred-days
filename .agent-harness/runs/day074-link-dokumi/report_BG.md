# BG 受領書：独立レビュー1の観測側修正

## 変更したファイルと公開関数

- `day-074-link-dokumi/lib/target-guard.js` — `isPublicIp`（S1）。`validateTarget`・`isNumericHost`の署名は維持。
- `day-074-link-dokumi/lib/html-facts.js` — `extractHtmlFacts`（S2/S6）。`decodeHtml`は維持。
- `day-074-link-dokumi/lib/sanitize.js` — `clip`（S5）、追加の`readCapped(response, cap, signal, {strict = false})`（S3）。`hostOf`・`schemeOf`は維持。
- `day-074-link-dokumi/lib/doh.js` — `dohQuery`（S3）。`resolvePublicHost`・`queryTxtRecords`・`queryMailFacts`の署名は維持。
- `day-074-link-dokumi/lib/rdap.js` — `fetchRegistration`（S3/S7、依存引数に`selfHosts`を追加）。
- `day-074-link-dokumi/lib/observe.js` — `runTrace`・`runAround`（S3の本文読み取り共通化、拒否転送のホップ保持）。
- `day-074-link-dokumi/lib/handlers.js` — `jsonResponse`・`handleTrace`・`handleAround`（S4、内部キャッシュ鍵）。
- `day-074-link-dokumi/tests/observer-review1.test.mjs` — 新規30テスト。
- `day-074-link-dokumi/tests/observer.index.mjs` — 新規テストのimport登録。
- `day-074-link-dokumi/tests/observer-guard.test.mjs`・`observer-handlers.test.mjs` — 変更後の契約に合わせて既存の期待値を修正。
- `.agent-harness/runs/day074-link-dokumi/notes_BG.md` — ファイルごとの進捗。

## 対応内容

- S1: IPv6は`2000::/3`内だけを候補とし、`2001::/23`・`2001:db8::/32`・`2002::/16`・`3fff::/20`・`2620:4f:8000::/48`を除外。IPv4の拒否範囲は変更していない。IPv4射影・NAT64・6to4もDNS回答として拒否する。
- S2: base属性と解決後のURLが2048字以内のときだけ解析用に採用し、表示用baseHrefは従来の300字。文書全体でURL解決は1500回まで。予算を使い切った後の参照は`scheme:relative`・`host:null`。2KiB base×2000リンク／200scriptも試験。
- S3: `response.json()`を廃止し、復号済みストリームにDoH 64KiB・RDAP 256KiBの上限を適用。超過をcancelし、DoHは次の窓口、RDAPは`unavailable:error`。HTML 64KiB・security.txt 8KiBは従来どおり。DoH回答とRDAP events/entitiesは64件まで。DNS末尾の非公開アドレスを切り落として許可しないよう、バイト上限内の全回答を検査し、非公開があれば拒否用の回答を残す。
- S4: 成功・キャッシュ命中・エラーを含めAPI応答はすべて`no-store`。内部Cache APIの300秒・86400秒・70秒は維持。
- S5: clipでU+061C・U+200E/F・U+202A〜E・U+2066〜9を除去。
- S6: textSampleは保持し、400字の契約とブランド照合用途をコメントと試験で確認。
- S7: RDAPはmanualで最大3回。各転送先をHTTPSかつvalidateTargetに通るホストに限定し、IP・予約名・自サイト・資格情報・不正ポートなどは拒否。転送本文も破棄。
- 追加: 内部キャッシュ鍵を`https://cache.invalid/day-074/<kind>/<digest>`へ変更。trace/rate/rdap各種を試験。拒否した転送でも元URL・状態・拒否先Locationを最後のホップに保持し、最大5件を守る。

## 変えた既存の期待値と理由

- `ff::ffff:ffff:ffff:ffff`・`100:0:0:1::`・`2001:1::`・`fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff`・`fe00::`・`fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff`・`fec0::`・`feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff`・`::ffff:8.8.8.8`・`64:ff9b::808:808`・`2002:0808:0808::`は許可から拒否へ変更（S1の許可リスト外または特殊用途）。
- 旧追加範囲の外側を一律許可する期待も更新。`::1:0:0`、NAT64範囲の隣接値、`5f00::/16`の隣接値は2000::/3外なので拒否。`3fff::/20`の直前・直後は公開候補として維持。`3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff`も2000::/3内かつ除外範囲外なので許可する境界を追加。
- API成功時の`public, max-age=60`を`no-store`へ変更（S4）。

## 検証結果

- `node --test day-074-link-dokumi/tests/observer-review1.test.mjs`: 30件成功、失敗0。
- `node --test day-074-link-dokumi/tests/observer.index.mjs`: 204件成功、失敗0。レビュー時の既存174件＋新規30件で、import登録の反映を確認。
- `node --test day-074-link-dokumi/tests/`: 最終856件成功、失敗0、skip/cancelなし。途中の旧期待値2件は更新して解消。初回全体819件との差37件のうち自担当は30件で、並行担当分と混同していない。
- 元の`probe.mjs`は不具合の存在をassertするため、ファイルは変更せず、実行時にIPv6のtrue→false、対象取得1→0、Bidi付き文字列→除去後文字列の3種類の期待値だけを置換して全体を実行。その他の入力と確認は維持した。
- `non-public-ipv6-accepted`: 指摘の5アドレスすべて対象fetch 0回、ok=false。
- `json-unbounded`: 2MiB入力で成功しない。DoHは2窓口合計147456 bytes（各73728＝64KiB＋8KiB）、RDAPは270336 bytes（256KiB＋8KiB）で停止。専用試験では各応答の読取量とcancel、DoHの正常な次窓口への回復も確認。
- `large-base-cpu`: base長4000/16000/32000字の7回中央値は2.384/1.558/1.611ms。いずれも10ms未満。Node上の経過時間でありWorkers CPUの実測ではない。
- `cache-freshness-reset`: 299秒後のキャッシュ命中でも外向きno-store。`bidi-survives`: Invoicegpj.exeに除去。`rdap-redirect-mode`: manual。`body-excerpt-returned`: textSampleは依頼どおり保持。positive-boundaries/query-defaultも通過。

## メインが判断・反映する点、未実施

- contract.js・fixtures・observer-runtime.test.mjs・tests/index.mjs・仕様は変更不要と判断し、変更していない。
- S6のプライバシー説明の整合はメイン担当のまま。可視本文抜粋を返し、最大5分の内部結果キャッシュに置く挙動を説明に反映する必要がある。
- RDAP転送は依頼どおりホスト文字列の検査まで。転送先DNSの検査やDoHと実接続先の一致保証を追加したとは報告しない。
- Workers/workerdのCPU実測、本番通信、ブラウザ、ビルド・公開ゲート、Git書き込み・公開はこの工程では未実施。ネットワーク・ブラウザ・依存導入・Git書き込み禁止を守り、検証はオフラインで完了した。
