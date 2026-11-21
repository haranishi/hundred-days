# 根拠調査（UX診断ルールと、既存サービス）

2026-11-20、Codex（Web検索つき・読み取り専用）が公式資料を開いて確認した結果。診断ルールの理由と、画面・READMEの言い方は、**ここで「確認済み」「一部確認」とされた範囲だけ**を根拠にする。

## 採用方針（親）
- 診断の `why` は、下表の「画面に書いてよい一文」を基にする。数値の閾値（見出し28字・フォーム4項目・12部品）は、調査で確認できていない。**「このアプリの目安です（調査で決まった基準ではありません）」と明記**する。
- 「気づく→わかる→信じる→動く→安心」は**独自の整理**。AIDA・AIDMA とは言わない。
- 「世界初」「他にない」「競合には診断機能がない」と書かない（Unbounce・Framer・Wix・Baymard UX-Ray など、目的の指示からの生成や設計の評価ができるサービスが実在する）。
  言ってよいのは動作の説明だけ: 「目的を選ぶとページの組み立て方が出て、並べ替えるたびに理由つきの診断が出る」。
- 法律名・条文番号は診断文に入れない。「期限や残り枠は実際の状況に合わせましょう」までにとどめる（出典は消費者庁の資料）。
- 出典のURLは、診断の項目から「根拠」としてリンクで出す。確度（確認済み／一部確認／独自の整理）を併記する。

---

## 1. UX診断ルールの根拠

「確認済み」は、開いた資料が診断に使う原則を直接支えているものです。「一部確認」は、関連する原則は確認できたものの、対象や配置を元のルールどおりに一般化できないものです。「出典未確認」は、該当する主張を直接支える資料を確認できなかった箇所に記しました。

| ルール | 出典URL | 確認できた要旨（原文に即して） | 画面に書いてよい一文の案（30字以内・数字なし） | 確度 |
|---|---|---|---|---|
| R1 最初の画面で「何を・誰に」を伝える | [NN/g ホームページのガイドライン](https://www.nngroup.com/articles/top-ten-guidelines-for-homepage-usability/)・[英国統計局 ユーザーニーズ](https://service-manual.ons.gov.uk/content/writing-for-users/user-needs) | NN/gはページ冒頭でサイトや組織が何をするかを伝えるよう勧める。英国統計局は、読者が誰で何を探しているかを執筆前に特定するよう勧める。対象者をすべてのページの初期表示内に明記すべきという部分は出典未確認。 | 冒頭で何ができるページか伝えましょう。 | 一部確認 |
| R2 見出しは短くする | [NN/g 見出しを拾い読みするパターン](https://www.nngroup.com/articles/layer-cake-pattern-scanning/) | 視線計測では、目立ち、内容を説明する見出しが、必要な箇所を探す手掛かりになった。ガイドは余分な語を省きつつ、見出しが直下の内容を表すよう勧める。読まれにくくなる文字数は出典未確認。 | 内容が伝わる簡潔な見出しにしましょう。 | 確認済み |
| R3 同じ機能のボタンの文言を揃える | [W3C/WAI 一貫した識別](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification) | 同じ機能を一貫して識別できると、利用者は既知の操作を認識しやすい。解説は同一ページ内の繰り返しにも言及し、文脈に応じた文言の違いを認めている。 | 同じ操作だとわかるボタン名にしましょう。 | 確認済み |
| R4 ボタンに押したときの結果を書く | [GOV.UK Design System ボタン](https://design-system.service.gov.uk/components/button/) | ボタンには実行する操作を書く。支払う、保存して続けるなど、押したときに実際に起こることに合わせて文言を選ぶ。 | 押すと何が起きるかボタンに書きましょう。 | 確認済み |
| R5 ページの上と下の両方に行動ボタンを置く | [Unbounce 長いアプリ紹介ページのCTA](https://unbounce.com/landing-pages/10-ways-to-increase-conversions-on-mobile-app-landing-pages/)・[Unbounce ランディングページの講評](https://unbounce.com/landing-page-examples/built-using-unbounce/critiqued-for-conversion/) | 長いページでは、上まで戻らず操作できるようにCTAを途中でも繰り返すことを勧める。長い実例で、利用企業の紹介の後にCTAを再掲した配置を評価している。全ページで上下に置くべきという部分は出典未確認。 | 長いページでは下部にも行動ボタンを置けます。 | 一部確認 |
| R6 行動をお願いする前に信頼の材料を見せる | [NN/g 信頼と求める負担の段階](https://www.nngroup.com/articles/commitment-levels/)・[NN/g Webデザインの信頼性](https://www.nngroup.com/articles/trustworthy-design/) | ユーザーに求める情報や労力が大きいほど、事前に信頼を得る必要がある。条件の早めの開示、十分な情報、第三者のレビューなどが信頼の判断材料になる。資料は申込ボタンとの固定の並び順を示していない。 | 申し込む前に信頼を判断できる情報を示しましょう。 | 確認済み |
| R7 申込の前に価格・料金を見せる | [Baymard 商品ページでの送料見積もり](https://baymard.com/research-articles/show-shipping-costs-on-product-pages)・[Baymard 決済画面のUX](https://baymard.com/blog/payment-ux) | ECの調査では、カートに入れる前の商品ページで送料を探す利用者がいた。決済情報の入力前には、送料・税・手数料を含む最終総額を見せるよう勧めている。 | 申込前にかかる費用がわかるようにしましょう。 | 確認済み |
| R8 申込の前によくある質問で不安を解消する | [Baymard 商品ページのFAQとQ&A](https://baymard.com/research-articles/product-page-faq-and-qa)・[英国政府GDS FAQに関する方針](https://gds.blog.gov.uk/2013/07/25/faqs-why-we-dont-have-them/) | BaymardはECの商品ページで、商品説明で扱いきれない疑問をFAQやQ&Aで補うよう勧める。GDSは、回答が関連情報から切り離されると探しにくくなると指摘する。全ページで申込ボタンの前に独立したFAQが必要という部分は出典未確認。 | 申込前の疑問に関連する箇所で答えましょう。 | 一部確認 |
| R9 フォームの項目を少なくする | [W3C/WAI フォームのチュートリアル](https://www.w3.org/WAI/tutorials/forms/)・[Baymard 購入フォームの項目数](https://baymard.com/research-articles/checkout-flow-average-form-fields) | WAIは、手続きの完了に必要な情報だけを求めるよう勧める。BaymardのEC調査では、利用者が確認・入力する項目を減らすことが、購入手続きの負担を下げるうえで重要だった。全フォーム共通の適正項目数は出典未確認。 | 手続きに必要な項目だけを尋ねましょう。 | 確認済み |
| R10 同じ種類の部品を連続して並べない | [NN/g 関連情報をまとまりにする設計](https://www.nngroup.com/articles/chunking/) | 関連情報を意味のあるまとまりにすると、関係や情報の階層が伝わりやすい。同じ形式で複数の商品を続けて並べることが、閲覧や検索に適した例も挙げている。部品の連続自体を問題にする根拠は出典未確認。 | 関連する情報をまとまりにしましょう。 | 一部確認 |
| R11 ページを長くしすぎない | [NN/g スクロールと注意](https://www.nngroup.com/articles/scrolling-and-attention/) | 視線計測ではページ上部に注意が集まりやすかった。読む理由があれば利用者はスクロールするため、資料は情報の優先順位づけを勧める。ページの長さの上限や、長さだけを理由に減点する根拠は出典未確認。 | 判断に必要な情報は早めに伝えましょう。 | 一部確認 |
| R12 「気づく→わかる→信じる→動く→安心」を揃える | [J-STAGE掲載論文 AIDAの定義](https://www.jstage.jst.go.jp/article/japeronso1991/2006/12/2006_12_47/_article/-char/en)・[グロービス経営大学院 AIDMAの定義](https://mba.globis.ac.jp/about_mba/glossary/detail-12514.html) | AIDAは注意・関心・欲求・行動。AIDMAでは記憶が欲求と行動の間に入る。「気づく」と「動く」はそれぞれ注意と行動に近い。「わかる」「信じる」「安心」まで含むこの順序の出典は未確認。ページに必要な情報を点検するための独自の整理として扱える。 | 内容の理解から手続き後の案内まで確認しましょう。 | 一部確認 |
| R13 期限・残り枠は事実に沿って書く | [消費者庁 ダークパターン実態調査資料](https://www.caa.go.jp/policies/future/ppi/assets/caa_futurer101_251003_01.pdf#page=7)・[消費者庁掲載の法令原文抜粋](https://www.caa.go.jp/notice/assets/representation_%20230627_11.pdf#page=1) | 消費者庁は、時間切れ後も条件によって残り時間が繰り返し付与されたチケットサイトの注意喚起事例を掲載。不当景品類及び不当表示防止法の第5条第2号は、価格などの取引条件が実際より著しく有利だと誤認させ、消費者の合理的な選択を阻害するおそれがある表示を禁じている。 | 期限や残り枠は実際の状況に合わせましょう。 | 確認済み |
| R14 見本の文章を自分の内容に変える | [Studio テンプレート編集ガイド](https://help.studio.design/ja/articles/9974045-テンプレートを編集する)・[Google Search Central ユーザー第一のコンテンツ](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | Studioは、ひな形の文章を自分のサイトの内容に差し替えるよう案内する。Googleは、独自の情報や価値があるかを自己評価の観点に挙げている。 | 見本の文章を自分のサービスの説明に変えましょう。 | 確認済み |

## 2. 既存サービスの有無

公式資料の記載を確認した結果です。「未確認」は、公開資料から機能や動作を確認できなかったことを示します。編集画面での操作検証は行っていません。

| サービス | 目的起点の機能の有無 | 診断・助言の機能の有無 | 根拠URL | 確度 |
|---|---|---|---|---|
| Unbounce | **あり。** AI Hybrid Builderは「相談予約を増やしたい」など、キャンペーン目的を含む指示からランディングページを生成する。 | **あり。** 公開後の計測・比較機能と、メタデータの不足を見つけて文案を出すAI連携を確認。スコアと改善提案を出すLanding Page Analyzerも公式紹介に掲載されているが、リンク先はトップページに遷移し、現在の提供状況は未確認。並べ替え時の理由つきUX診断も未確認。 | [AIによるページ生成](https://documentation.unbounce.com/hc/en-us/articles/54145218906516-Create-a-page-with-Unbounce-AI)・[計測と比較](https://documentation.unbounce.com/hc/en-us/articles/54145204868500-Track-and-improve-page-performance-in-the-AI-Hybrid-Builder)・[AI連携の利用例](https://documentation.unbounce.com/hc/en-us/articles/53217971839124-Unbounce-MCP-Use-Cases)・[Analyzerの紹介](https://unbounce.com/optimization-toolkit/) | 一部確認 |
| Framer | **あり。** 指示文やブリーフからページ構造・セクション・初稿を生成できる。予約・購入などの定型目的を選ぶ方式は未確認。 | **あり。** AI Agentに既存ページのレビュー、レイアウト調整、アクセシビリティ確認、SEOの不足確認を依頼できる。並べ替え時の自動診断は未確認。 | [AI Website Builder](https://www.framer.com/solutions/ai-website-builder/)・[AI Designer](https://www.framer.com/solutions/ai-designer/) | 一部確認 |
| Wix | **あり。** 事業の目的などを会話で入力すると、ページやレイアウトを含むサイト構造を生成する。 | **あり。** Harmony EditorのAccessibility Wizardは問題候補を検出し、手動で確認する項目も案内する。目的に照らした部品順の診断は未確認。 | [AI Website Builder](https://www.wix.com/ai-website-builder)・[Accessibility Wizard](https://support.wix.com/en/article/wix-harmony-editor-using-the-accessibility-wizard) | 一部確認 |
| Squarespace | **あり。** Blueprint AIは事業・目的・好みに合わせてサイトの初案を作る。公式デモでは、最初に入れるページは利用者が選ぶ。 | **あり。** SEO Scannerが代替テキストやページタイトル・説明文の不足を検出し、文案を生成する。部品順のUX診断は未確認。 | [Blueprint AIの公式デモ](https://www.squarespace.com/blog/webinar-ai-tools-growth)・[SEO Scanner](https://www.squarespace.com/blog/squarespace-refresh-2025-product-releases) | 一部確認 |
| Jimdo | **あり。** 事業についての質問への回答とサイトのテーマに基づき、ページ・文章・画像を含むサイトを組み立てる。定型の行動目標からの単一ページ生成は未確認。 | **あり。** Jimdo Creator向けのrankingCoach連携が個別のSEOタスクを提案する。生成フロー内での利用と部品順のUX診断は未確認。 | [Website Builder](https://www.jimdo.com/website/website-builder/)・[Creator向けSEO支援](https://help.jimdo.com/hc/en-us/articles/115005521243-How-does-Creator-Advance-AI-by-rankingCoach-work) | 一部確認 |
| ペライチ | **関連機能あり。** テンプレート選択、予約ボタン・予約ブロックの手動設置を確認。目的選択からの自動構成は未確認。 | **あり。** 基本情報チェックリストがSEOの設定項目を確認する。部品順のUX診断は未確認。 | [ページ作成ガイド](https://support.peraichi.com/hc/ja/articles/46414071740057)・[予約受付ガイド](https://support.peraichi.com/hc/ja/articles/46854002803609)・[SEOチェック](https://support.peraichi.com/hc/ja/articles/360022387273) | 一部確認 |
| Studio | **関連機能あり。** テンプレートを編集し、既存のセクションを複製したり、用意されたセクションを追加したりできる。目的選択からの自動構成は未確認。 | **未確認。** SEO関連の設定ガイドは確認。部品順を評価して理由を出す機能は未確認。 | [テンプレート編集](https://help.studio.design/ja/articles/9974045-テンプレートを編集する)・[SEO設定](https://help.studio.design/ja/articles/2639106-seo対策) | 一部確認 |
| Baymard UX-Ray for Figma | **未確認。** 公式資料では、既存のデザインフレームを選んで分析する流れを確認。 | **あり。** デザインをスキャンし、研究に基づくガイドラインに照らして、問題点や維持を勧める箇所を示す。並べ替え直後の自動診断は未確認。 | [UX-Ray for Figmaの公式解説](https://baymard.com/blog/ux-ray-for-figma) | 一部確認 |

**「世界初」「他にない」とは言い切れません。** 公開資料から、Unbounceでは目的を伝えてランディングページを生成でき、Framerでは構成生成と既存ページへのレビュー依頼ができ、Baymardでは設計を根拠つきで評価できます。定型目的の選択から単一ページを組み、部品を並べ替えた時点でその目的に照らした理由が出る、という一連の動作は、今回の公開資料では未確認です。

## 3. 画面に書いてはいけない言い切り

| 避ける表現 | 理由 |
|---|---|
| 「見出しは何文字以下」「フォームは何項目以下」「ページは何画面以内」 | 今回確認した資料から、ページや手続きの種類を問わず適用できる閾値は得られない。 |
| 「初期表示しか読まれない」「ボタンを上下に置くと申込率が上がる」「フォームを短くすれば離脱が何％減る」 | 視線計測で測った注意、特定ページの配置事例、ECの購入手続きの調査には、それぞれ対象と測定条件がある。別のページの申込率や離脱率を予測する根拠にはできない。 |
| 「お客様の声は最初のボタンより前に必須」「FAQは必ず申込の直前」「同じ部品が続くとUXが悪い」 | 判断材料を必要な時点で見つけられることや、関連情報をまとめることは支持される。部品の種類と順番だけで同じ結論は出せない。 |
| 「この流れはAIDA／AIDMA」「この順に並べれば利用者は申し込む」 | 既存モデルの段階と一致するのは一部。独自の点検順序に沿って利用者が行動することは検証されていない。 |
| 「期限や残り枠を出すと法律違反」「料金が最初のボタンより下なら違法」 | 確認した法令原文は、具体的な表示と実態、誤認のおそれなどに関する要件を定めている。部品の有無や配置だけから違法性を判定できない。未確認の法令名や条文番号も診断文に入れない。 |
| 「見本の文章を変えれば検索順位が上がる」 | Googleの資料は、独自の情報と読者にとっての価値を自己評価するためのもの。文章の差し替えによる順位上昇は確認できない。 |
| 「世界初」「他にない」「競合には診断機能がない」 | 自動生成・レビュー・改善提案に近い機能がすでに確認できる。公開資料で機能が見つからないことから、その機能が存在しないとは判断できない。 |

## 4. 注意点

- **上部の案内ボタンと、契約や予約を確定するボタンでは役割が違います。** 上部が予約枠への案内であれば「空き状況を見る」、確定する操作であれば「予約を確定する」のように、実際の操作に合わせます。料金や信頼材料は、確定前に確認できるかが判断点です。初期表示の範囲は画面サイズでも変わります。 [GOV.UKのボタンガイド](https://design-system.service.gov.uk/components/button/)・[NN/gのスクロール調査](https://www.nngroup.com/articles/scrolling-and-attention/)
- **部品の順番だけで判断できる範囲には限りがあります。** FAQがなくても、料金の説明のそばにキャンセル条件が書かれていれば疑問に答えられます。反対に、期限や残り枠が本当かどうかはページ構成からはわからないため、予約枠やキャンペーンの設定と照合が必要です。 [英国政府GDSのFAQ方針](https://gds.blog.gov.uk/2013/07/25/faqs-why-we-dont-have-them/)・[消費者庁の実態調査資料](https://www.caa.go.jp/policies/future/ppi/assets/caa_futurer101_251003_01.pdf#page=7)
- **R12の「安心」は、完了表示と次の案内で具体化できます。** GOV.UKは、確認画面で手続きの完了と次に起こることを伝えるよう勧めています。予約完了画面が外部の予約サービスにある場合、元のページの部品順から確認できるのは予約への案内までです。 [GOV.UKの確認画面ガイド](https://design-system.service.gov.uk/patterns/confirmation-pages/)