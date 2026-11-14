# Design：sign-content

## 方針
- 中身は `src/content/` の TypeScript のデータとして持つ（型検査で形式違反を書いた時点で止めるため。JSON にしない）
- 元の調査は `.agent-harness/research/`（r1＝指文字、r2＝数字と単語）。データの各項目は、調査の出典を `sources.ts` の出典IDで参照する
- 確信度は**基本の形**（どの指を伸ばす・曲げるか、手のひらと指先の向き、動き）の確かさ。high＝文章の出典2つ以上と、照合した表2つ以上（指文字・数字）が一致、medium＝基本の形で資料が食い違う・または1つしかない、low＝確認できない。low はデータに入れても `course` から参照させない（自動検査で落とす）。medium は画面に「要確認」の印を出す
- 細部（親指の収め方・指の開き幅・角度）が資料で決まらないだけなら、確信度は下げずに `detailNote` に書く（表の図から推し量った値は「推定」）。調査 JSON は細部の未確定でも medium にしていたので、アプリの確信度は調査より高い字がある。上げた根拠は字ごとに `.agent-harness/runs/content-kana/verify.md` に残す（2026-11-13 の判断。独立照合の指摘を受けて明記）
- 由来（origin）と覚え方の例（mnemonic）を分ける。調査で由来が確認できたものだけを origin にする

## 項目の形（`SignItem`）
- `id`：`kana-a`・`mod-dakuon`・`num-1`・`word-arigatou` のように種類の接頭辞＋ローマ字
- `kind`：`kana`・`modifier`・`number`・`word`
- `label`（表示名）・`reading`・`meaning`（単語のみ）
- `sign`：hand-model の `SignSpec`
- `describe.viewer`（相手から見た説明）・`describe.self`（自分で作るときのコツ。自分の目に見える形で書く）
- `memory`：`{ kind: 'origin' | 'mnemonic', text }`（任意）
- `confusables`：`[{ id, tip }]`（見間違えやすい項目と見分け方）
- `variants`（地域差・別形の注記）・`sources`（出典ID）・`confidence`・`dynamic`（動きがあるか。カメラ判定の対象外になる）
- 単語は `face`（表情の指定：`neutral`・`smile`・`nod` など）と、上半身つきで描くことを持つ

## 濁音などの「変化」の扱い
- `modifier` の項目は「元の形のまま手をどう動かすか」を持つ。`が` のような組み合わせの形は、`kana-ka` の形に `mod-dakuon` の動きを合成して作る（46×変化の全組み合わせをデータで持たない）
- 合成の関数は `src/content/compose.ts`。指文字で綴る問題と、図鑑の指文字再生が使う

## 指文字で読む練習の単語（`vocab.ts`）
- ひらがなの日常語200語以上。各語に短い意味（例：「いぬ＝動物の犬」）。どの文字を覚えた時点から出せるかは、語に含まれる文字から自動で決める
- 除外の基準：人を傷つける語・性的な語・固有名詞・特定の団体の名前。作成後に一覧を目で確かめる

## 検証
- `npm run content:check`（vitest）：46文字＋変化5種＋数字11個がそろう、ID が重複しない、参照先がある、出典IDが登録済み、low が course に入っていない、見間違えやすい組の仕様が「指の状態・親指・接触・向き・動き」のどれかで異なる、単語リストが除外の基準に触れない（禁止語の表で照合）
- 目視検証（実装していない別の確認者）：`scripts/contact-sheet.mjs` が開発用の一覧ページを撮り、全項目を相手側・自分側から描いた画像を `.agent-harness/runs/content-review-<n>/` に置く。確認者は画像と、調査の説明文（r1・r2）だけを見て、1項目ずつ「一致／不一致（どこが）」を書く。不一致を直して撮り直す。最大3周
- 監修を受けていないことは消さずに表示する（product.md の原則）
