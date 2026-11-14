# Implementation Plan：sign-content

担い手：形のデータは Opus（描いた手を目で確かめて直すため）、単語リストと自動検査は Codex、目視の照合は実装していない別の Opus。

- [x] 1. 出典の登録と指文字のデータ
- [x] 1.1 `sources.ts`（r1・r2 の出典を ID つきで登録）と、清音46文字・変化5種のデータ（説明・覚え方・見分け方・出典・確信度）
  - 調査 `.agent-harness/research/r1_yubimoji.json`・`r1_yubimoji_notes.md` を元にする。low は course に入れない
  - 完了条件：一覧ページで46文字と変化が描け、調査の説明と一致することを作り手が目で確かめた記録がある
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_
- [x] 1.2 濁音・半濁音・促音・拗音・長音の合成（`compose.ts`）と単体試験（「が」「ぱ」「っ」「ゃ」「ー」）
  - _Requirements: 1.1_

- [x] 2. 数字と単語
- [x] 2.1 数字0〜10と、確信度 high の単語12語以上（表情・上半身・両手の動き）
  - 調査 `r2_numbers_words.json`・`r2_numbers_words_notes.md` を元にする
  - _Depends: hand-model 2.3_
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 3. (P) 指文字で読む練習の単語リスト（200語以上・意味つき・除外の基準）
  - _Boundary: src/content/vocab.ts_
  - _Requirements: 5.1, 5.2_

- [x] 4. 自動検査 `npm run content:check`
  - 収録範囲・重複・参照・出典・low の除外・見間違えやすい組の区別・単語リストの禁止語
  - _Requirements: 3.1, 4.1, 4.2, 5.2_

- [x] 5. 目視の照合（最大3周）
  - `scripts/contact-sheet.mjs` で全項目を相手側・自分側から撮る。実装していない確認者が、画像と調査の説明文だけで1項目ずつ照合し、結果を `.agent-harness/runs/content-review-<n>/` に残す。不一致を直して撮り直す
  - _Requirements: 4.3_

## 進み具合の記録（2026-11-13）
- 指文字：46文字＋変化5種。作った担当が4つの表と照合し、2周目で全項目が表の多数派と一致（1周目に お・め・こ・て・へ・え・り を直した）。確信度 high 41・medium 10・low 0。記録は `.agent-harness/runs/content-kana/verify.md`
- 単語リスト：319語（`src/content/vocab.ts`）
- 数字13・単語16語：調査 r2 と一致、数字は2つの表とも照合。確信度 high 27・medium 2（数字の0・大丈夫）。記録は `.agent-harness/runs/content-words/verify.md`
- 自動検査：`npm run content:check`（tests/content）。収録範囲・重複・出典・low の除外・見間違えやすい組の区別・合成・禁止語
- 独立の照合 第1周（作っていない確認者・コードを見ない・指文字51件）：一致49・軽微な不一致2（ら・ろ）・重大0。記録は `.agent-harness/runs/content-review-1/report.md`。指摘（ろ・ら・へ・こ・ん・説明文4点・小さい字の呼び方）は第2周の直しで反映済み。第2周の独立照合は、描画の第2周の直しの後に行う
- 独立の照合 第2周：好き（開閉が見えない）を重大、嫌い・ごめんなさい・ろ・ぬ・め・6〜9・説明文3点を軽微として指摘。描画の第3周（`.agent-harness/runs/content-r3/`）で直した。記録は `.agent-harness/runs/content-review-2/report.md`
- 独立の照合 第3周（最終）：第2周の指摘11件のうち9件が直り、残った説明文2件（小さい「ぉ」・わかる の地域差）と書き方2件（数字8・好き）はその後に直した。形と動きの新しい不一致は0。表どうしで分かれて絵では決められない項目は、の・数字0・数字10・はじめまして・わかる・大丈夫。記録は `.agent-harness/runs/content-review-3/report.md`
- NEEDS_HUMAN（公開前にろう者の実演で確かめる8項目）：わかる・はじめまして・大丈夫・も・ろ・の・数字0・数字10。確かめることは第3周の報告の最後の表にある
