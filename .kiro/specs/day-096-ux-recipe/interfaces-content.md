# 契約: 中身と診断（担当A2・Codex）

対象: `lib/blocks.js` `lib/recipes.js` `lib/rules.js` と `tests/core/content-*.test.mjs`。`lib/contract.js` は変更しない。
親の見本の骨格と同じ名前・同じ形で作り直す。書く文章は、**この仕様の「research.md」にある、確認できた範囲だけ**を根拠にする。

## 文章の決まり（画面に出る言葉）
- 平易な日本語。専門用語を使わない。診断は、作る人を叱らず、**来たお客さんの立場**で書く。
- 診断と部品の説明（`why` `note` `BLOCK_INFO`）には、統計の数字（割合・倍率・件数の主張）・法律名・条文番号・「必ず」「確実」「世界初」「他にない」「違法」を書かない
  （`tests/core/content-copy.test.mjs` が機械で止める）。サンプルの店の文章（値段・時間・人数）は、架空なので数字を使ってよい。
- 文字数・項目数の目安（見出し28字・フォーム4項目・12部品）だけは、診断の `note` に「このアプリの目安です（調査で決まった基準ではありません）。」と添えて書いてよい。
- 「気づく→わかる→信じる→動く→安心」は、このアプリの整理であって、AIDA・AIDMA などの既存モデルではない。そう書く（`STAGE_NOTE` を使う）。
- 架空の店・人・数字だけを使う（実在の店名・地名・企業名・商標を避ける）。サンプルが約束する効果（治る・必ず痩せる等）を書かない。

## blocks.js
- `BLOCK_INFO[type] = { role, place, mistake }` を19種すべてに。各1文・60字以内。role=この部品が来た人に果たす役割／place=置く場所のコツ／mistake=よくある失敗。
- `makeBlock(goal, type, id)` → Block。その目的のレシピに同じ種類の部品があれば、その中身と見た目の**深いコピー**。無ければ汎用の見本（`GENERIC[type]`・業種に依存しない・全項目を契約の上限内で）。
- 新しい項目・部品でも `validateState` を通ること。

## recipes.js
- `RECIPES[goal] = { goal, question, summary, siteName, theme:{preset,accent}, blocks:[{type,variant,props}] }`。8目的。`summary` は「この目的で効く流れ」を2文以内で。
- 構成の方針（A2が直してよいが、理由を最終回答に書く）。見た目の欄は「テーマ/強調色の添字」。**どのレシピも、診断が90点以上（event は limited の確認が残るため85以上）・5段階すべてを含む・見た目を散らす。**

| 目的 | 架空の名前 | 見た目 | 部品の並び（括弧は見た目の番号） |
|---|---|---|---|
| reserve | ひだまり整体院 | soft/0 | hero0 pain0 benefits0 menu0 voices0 steps0 faq0 form0 access0 footer |
| buy | 手ぬぐい工房 あおい | lively/5 | hero2 benefits1 compare0 voices1 menu1 guarantee0 faq1 cta0 footer |
| inquire | ことのは設計室 | crisp/1 | hero1 pain1 benefits2 steps1 proof1 story0 faq1 form1 footer |
| signup | ひとこと日記 | soft/3 | hero0 benefits0 steps1 voices1 guarantee1 faq0 cta1 footer |
| apply | まちのパン屋 こむぎ | calm/2 | hero1 story1 benefits2 team0 steps0 voices0 access1 faq0 form1 footer |
| event | 春のまちあるきマルシェ | lively/4 | hero2 benefits1 proof1 schedule0 menu1 limited0(real:false) access0 faq1 form0 footer |
| visit | 喫茶 ひなた珈琲 | calm/5 | hero0 benefits1 menu0 voices1 access0 cta0 footer |
| support | 子ども食堂 むぎのいえ | soft/2 | hero1 story1 proof0 benefits2 plans0 voices0 faq0 guarantee1 cta1 footer |

- 同じ目的の全項目は、契約の最大文字数を超えない。ボタンの文言は「結果が分かる動詞」（予約する・買う・登録する…）。
- `suggestionsFor(goal, type, key)` → `string[]`（4件）。`hero.title`・`hero.cta`・`cta.button`・`form.submit` の4項目を、目的ごとに。各候補は最大文字数以内。

## rules.js
- `diagnose(state)` → `{ score, passed, total, items, stages }`。`items[i] = { id, level, ok, title, why, note?, sources:[{label,url,confidence}], blockId?, fix?:{label,action} }`。
  `title` は「〜がある」の言い切り（満たすとき・満たさないときで同じ文）。`why` は1文（調査の「画面に書いてよい一文」を基に）。`sources` の `confidence` は `確認済み／一部確認／独自の整理`。
- 点 = 適用される項目の重み（must3・should2・tip1）の合計に対する、満たした重みの割合（四捨五入）。適用外の項目は `items` に含めない。
- `stageCoverage(state)` → `[{key,label,count,ok}]`。**`fix.action` は `reduce` がそのまま受ける操作。**

| id | level | 適用 | 満たす条件 | なおす |
|---|---|---|---|---|
| has-action | must | 常に | form か cta がある | cta を足す |
| hero-first | must | 常に | 先頭が hero | 無ければ hero を先頭に足す／あれば先頭へ移す |
| flow-complete | must | 常に | 5段階すべてに部品がある | 足りない段階の既定の部品（notice→hero understand→benefits trust→voices act→cta relief→faq） |
| trust-before-action | must | 行動の部品がある | 最初の form/cta より前に、trust 段階の部品 | voices を最初の行動の直前に足す |
| honest-limited | must | limited がある | すべての limited で real===true | real を true にする（ラベル「本当の数字だと確認した」） |
| price-before-action | should | 目的 reserve・buy・event・visit で行動の部品がある | 最初の form/cta より前に menu か plans | menu を足す |
| button-label-result | should | ボタンの文言（role=button）がある | 空でなく、総称（送信・こちら・詳細・詳しくはこちら・クリック・OK・Submit）でない | なし |
| button-label-consistent | should | ボタンの文言が2つ以上 | 空でない文言の種類が2以内 | なし |
| form-short | should | form がある | 項目が4以内（目安） | 最後の項目を消す |
| hero-title-short | tip | hero がある | title が28字以内（目安） | なし |
| faq-before-last-action | tip | 目的 reserve・buy・apply・signup・support で行動の部品がある | 最後の form/cta より前に faq | faq を足す |
| action-reachable-again | tip | 部品6つ以上で hero に cta がある | 後半の3分の1に form か cta | cta を足す |
| no-adjacent-same | tip | 常に | 隣り合う同じ種類がない | なし |
| not-too-long | tip | 常に | 部品が12以内（目安） | なし |
| replace-samples | tip | 常に | そのレシピの既定と同じ文字列が、文章の項目に残っていない | なし |

## 試験（`tests/core/content-*.test.mjs`）
全レシピ: `validateState`・5段階・診断90以上（event85）・見た目が散る・上限内／`makeBlock` が全種で正しい／全規則の「満たす・満たさない・適用外」と `fix` を当てると
満たすようになること／診断の点が単調（なおすと上がる）／**禁止語**（`why` `note` `BLOCK_INFO` に、数字の直後の `%`・倍・割・秒、および 世界初・他にない・必ず・確実・違法・法律・絶対）／`why` が1文・`sources` の url が `https://`。
