# タスク

実装の担当はCodex（会社用。切れたらOpus）。UI・ブラウザ検証はOpus。要件・設計・判定・最終確認はメインループ。
完了は、テストと実挙動の証拠で判断する。各タスクの証拠は `verification.md` に残す。

- [x] 0. 公開ゲートの先出し：空の骨組み（`meta.json`・`index.html`・共有欄・OGP）を置き、`npm run publish:check -- --day 74` を通す（294件合格・2026-10-22）。以後の変更のたびに流す。
- [x] 1. 契約：`lib/contract.js`（`LIMITS`・列挙・`validateTrace/Around/Result`）と、手書きの観測データ `tests/fixtures/*.json`（きれいなサイト・なりすまし風・古いサイト・失敗）。_Boundary:_ 契約の変更はメインループだけ。
- [x] 2. 判定側（A）：`url-input`・`punycode`・`psl`（公開サフィックスリストの本物）・`lexical`・`brands`・`lists`・`headers`・`libs`・`eol`・`rules`・`score`・`messages`・`report`・`resources`・`samples` と単体テスト。
- [x] 3. 観測側（B）：`target-guard`・`doh`・`rdap`・`html-facts`・`cookies`・`observe`・`handlers`・`functions/api/day-074/*.js` と単体テスト（攻撃ベクトル表・変異試験・CPU時間・無限ストリーム・停止）。
- [x] 4. 画面（C）：`index.html`・`app.css`・`app.js`・見本・共有欄・OGP・`og.png`・`favicon.svg`。3幅の画面。
- [x] 5. 統合：判定側・観測側・画面をつなぐ。契約テスト（見本と全fixtureの`Result`が`validateResult`を通る）。
- [x] 6. E2E：`tests/e2e/day-074.spec.mjs`（通信は差し替え。送ったURLの検査・敵対的な値・429/500・キーボード・3幅）。
- [x] 7. ローカルの実観測：workerdで関数を動かし、実在の無害なテスト用サイトと、拒否されるべき宛先で確かめる。
- [x] 8. 独立レビュー（読み取り専用）：セキュリティ（SSRF・濫用・XSS）2回と判定1回。指摘は直すか、直さない理由を残した（`verification.md` §3）。
- [x] 9. UI採点：体験評価→画面評価（10項目・16点以上かつ0点なし・最大3周・同一指摘2周で停止）。偽陽性は対策コードをgrepで確かめてから要件化。
- [x] 10. 公開前チェック：`npm run check`・`publish:check -- --day 74`・権利/規約/法の確認・メタ/README/注記・個人情報の映り込み。
- [x] 11. PR（公開用の状態）→最新CI→マージ→自動デプロイ→本番の主要操作と、拒否されるべき宛先の拒否を本番で確認。
- [x] 12. Obsidianに制作先・PR・本番URL・検証・残件を記録する。

## 許可と判定
本人の依頼は、作成・マージまで。X投稿とプロモ動画は含めない。Day73は触らない。
HTTPに関わる公開（`published`）は本人が指示した範囲で行う。公開時に新しい契約違反が見つかったら、同じPRで契約に足す（`.kiro/steering/publish-contract.md`）。
