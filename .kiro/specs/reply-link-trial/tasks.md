# タスク

- [x] 公開URLの確認を `scripts/lib/public-url.mjs` に分け、名前を引けないときだけ行き先で取り直す
- [x] `x:prepare` に組み込み、警告・`checkedVia`・チェックリストの項目を足す
- [x] 単体テスト（`scripts/tests/public-url.test.mjs`）と、わざと壊した検査
- [x] `AGENTS.md` に新しいDayの `publicUrl` の規則を足す
- [x] 開始をDay081からDay080へ前倒しする（同日の夜・本人の指示）。Day080の `meta.json` の `publicUrl` を切り替え、README の一覧を作り直す
- [x] 全Dayへ拡大する（2026-11-01・本人の依頼）。`AGENTS.md` の規則を全Dayに広げ、73件の `meta.json` の `publicUrl` と README の一覧を切り替え、見張りのテスト `scripts/tests/public-url-contract.test.mjs` を足す。Day058・059 の試験の固定を直す
- [ ] 旧住所から新住所への 301 を入れるかどうかを、本人と決める（今は入れていない。理由は design.md）
- [ ] 数日後（Day083の公開あたり）に、Functions の使用回数を見て、続けるか戻すかを本人と決める

検証の証拠は [verification.md](verification.md) を参照。
