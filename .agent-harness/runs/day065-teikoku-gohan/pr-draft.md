## 概要

Day65「定刻ごはん」。食材を積んだ列車の「出発順」と「分岐の向き」だけで料理をさばく、1画面の段取りパズルです。全6面。登録なし・依存ライブラリなし。進み具合は端末の中（localStorage）に残り、共有ボタンを押したときだけ、説明・結果・URLが共有先（X・LINE・端末の共有機能）へ渡ります。

## 含まれるもの

- `day-065-teikoku-gohan/`：本体、単体テスト（170件）、README、meta.json、screenshot.webp
- `tests/e2e/day-065.spec.mjs`：画面テスト（68件）
- `README.md`：Day一覧の索引（`npm run index:sync` の結果）
- `.agent-harness/contracts/` と `.agent-harness/runs/day065-teikoku-gohan/`：契約と実行記録（要件、評価書、権利確認）。評価画像（`r1`〜`r3` の `experience-shots/`・約36MB）は含めない

## 確認したこと

- 全単体テスト 2967件（失敗0・スキップ1は別Dayの地図データ）、Day65の画面テスト68件を3回続けて204件、共通の共有・ヘッダ検査257件、`npm run precheck` OK
- ルールの正（基準シミュレーター）と `lib/sim.js` が3行目以降で同一。全6面で、見本のダイヤが最短（★3）になることを全探索で確認
- 体験評価（実際に遊ぶ・独立した別セッション）：2周とも 17/20 で合格。全6面を見本なしで★3まで解け、詰みなし
- 権利確認（独立した読み取り専用レビュー・Web検索あり）：第三者のコード・ライブラリ・書体・音・画像の同梱なし。課金・賭博・景品・効能表示なし。詳細は `05_rights.md`

## 見た目評価について（基準未達）

3周で 10 → 12 → 12/20（Codex の同日の採点は 11）でした。契約の基準（16点以上）には届いていません。残りは小さい画面（幅320px・横向き）の見栄えと細部です。実害のある不具合（結果に「null」が出る、キーボードで発車に届かない）は直しました。評価書は `.agent-harness/runs/day065-teikoku-gohan/visual/`、公開後に直す候補は `progress.md` の「8周目」にあります。

## 公開時の扱い

- スクショ（`screenshot.webp`）にはApple絵文字が写ります。Day63と同じ扱い（低リスクとして許容）で公開します。許諾をはっきりさせたい場合は、OFLのNoto Color Emojiで撮り直せます（`05_rights.md`）
- `static/privacy.html` と `THIRD_PARTY_NOTICES.md` には、このPRでは触れていません。全Day共通の課題として別に扱います
- J-PlatPat での名前「定刻ごはん」の再確認は、公開の直前に行う項目です。**このPRの時点では未確認**です
- `meta.json` の `actualMinutes` は 0 のままです（あとから入れられます）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
