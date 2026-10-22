# R1：なりすまし検知用の参照情報

調査・確認日：**2026-10-22（日本時間）**。各表の確認日はこの日。公開日が古い根拠は該当箇所に年を記した。公式サイトを開いた結果、本文や公式リンクで確認できた事実を掲載し、取得失敗だけからサービス終了とは判断していない。

## A. ブランドと正規ドメイン

### A1. 最新の月次報告と上位ブランド

[フィッシング対策協議会・2026年9月月次報告](https://www.antiphishing.jp/report/monthly/202609.html)（2026-10-19公表、2026-10-22確認）。報告総数94,661件、重複を除いたURL49,032件、悪用されたブランド105件。これは被害者数・被害金額ではない。

| 順位・範囲 | ブランド | 公表されたブランド別件数 | 公表割合 | 割合×総数による概算（実測値ではない） |
|---|---|---|---|---|
| 1 | Amazon | unverified（正確な件数は本文未掲載） | 約33.2% | 約31,427件 |
| 2 | Apple | unverified（同上） | 約11.1% | 約10,507件 |
| 上位5の残り・本文記載順 | セゾンカード | unverified | 個別割合未掲載 | 算出しない |
| 同上 | アメリカン・エキスプレス | unverified | 個別割合未掲載 | 算出しない |
| 同上 | 国税庁 | unverified | 個別割合未掲載 | 算出しない |
| 上位5合計 | 上記5ブランド | 正確な合計件数は未掲載 | 約65.3% | 約61,814件 |

1,000件以上の報告を受けたブランドは13、合計約87.9%。残り8ブランドの名前・件数を推測して補っていない。以下の36件は上位5を先に置き、依頼に挙げられた分野を補完した参照候補であり、「国内被害上位36」というランキングではない。

### A2. 確認済みドメイン（high / medium）

ASCII語は**調査者による検知候補の提案**であり、「偽装ドメインでの出現頻度」を測定したものではない。`au`、`line`、`ana`、`jcb`、`etc`などの短い語は特に誤検知しやすい。

ドメイン欄は登録単位にまとめ、確認した実ホスト・用途を補記した。`high`は公式本文・公式ログイン・公式リンクで対応を確認、`medium`は公式側で利用を確認したが現行の利用範囲等に制約があるもの。いずれもサイト全体の安全性の格付けではない。

| id | 日本語名 | ASCII語候補 | 正規ドメイン（登録単位）・確認した用途 | 根拠URLと確認箇所 | 確信度 | 確認日 |
|---|---|---|---|---|---|---|
| amazon | アマゾン | amazon, amzn | amazon.co.jp（日本の通販）、aboutamazon.jp（広報）、amazon.jp（公式リンク）。短縮amzn.toはD参照 | [公式広報](https://www.aboutamazon.jp/)のフッターから通販・Amazon.jpへのリンク。通販トップはロボット確認で本文未取得 | high | 2026-10-22 |
| apple | アップル | apple, icloud | apple.com（ストア・Apple Account）、icloud.com（Web利用） | [日本公式](https://www.apple.com/jp/)、[iCloud公式利用案内](https://support.apple.com/guide/icloud/sign-in-and-use-icloudcom-mm281e3e7d/1.0/icloud/1.0) | high | 2026-10-22 |
| saison | セゾンカード | saison, saisoncard, netanswer | saisoncard.co.jp（netanswerplus.saisoncard.co.jpログイン）、a-q-f.com（ポイントサイト） | [公式](https://www.saisoncard.co.jp/)のNetアンサーログイン・ポイントサイトへのリンク | high | 2026-10-22 |
| amex | アメリカン・エキスプレス | americanexpress, amex | americanexpress.com（日本サイト・ログイン） | [日本公式](https://www.americanexpress.com/ja-jp/)のログイン導線 | high | 2026-10-22 |
| nta | 国税庁／e-Tax | nta, etax, e-tax | nta.go.jp（e-tax.nta.go.jp、国税庁本体への公式リンク） | [e-Tax公式](https://www.e-tax.nta.go.jp/)のマイページ・国税庁リンク。本体トップ取得失敗は別記 | high | 2026-10-22 |
| rakuten | 楽天市場・楽天ID | rakuten, r10 | rakuten.co.jp（市場）、rakuten.net（ichiba.faq.rakuten.netヘルプ）。銀行・カードは別行、r10.toはD | [市場公式](https://www.rakuten.co.jp/)のヘルプへのリンク、[楽天カード公式](https://www.rakuten-card.co.jp/)のグループサービスリンク | high | 2026-10-22 |
| mufg | 三菱UFJ銀行 | mufg, mitsubishi, ufj | mufg.jp（bk.mufg.jp、directg.s.bk.mufg.jp） | [公式](https://www.bk.mufg.jp/)のブラウザでログイン | high | 2026-10-22 |
| smbc | 三井住友銀行 | smbc, sumitomo, mitsui | smbc.co.jp（direct.smbc.co.jp） | [公式](https://www.smbc.co.jp/)のWebでログイン | high | 2026-10-22 |
| smbc_card | 三井住友カード／Vpass | smbc-card, smbc, vpass | smbc-card.com（Vpass、旧セディナ系のwww5も掲載） | [公式](https://www.smbc-card.com/index.jsp)のVpass ID・セディナビIDログイン | high | 2026-10-22 |
| mizuho | みずほ銀行 | mizuho, mizuhobank | mizuhobank.co.jp（銀行サイト） | [公式](https://www.mizuhobank.co.jp/index.html)の商品・手続きリンク。別登録単位の認証ドメインは今回未確認 | high | 2026-10-22 |
| yucho | ゆうちょ銀行 | yucho, yu-cho, jp-bank, japanpost | japanpost.jp（jp-bank.japanpost.jp、direct.jp-bank.japanpost.jp） | [公式](https://www.jp-bank.japanpost.jp/)のゆうちょダイレクトログイン | high | 2026-10-22 |
| paypay | PayPay・金融関連 | paypay | paypay.ne.jp（決済）、paypay-card.co.jp（カード）、paypay-bank.co.jp（銀行）、paypay-sec.co.jp（証券）、paypay-insurance.co.jp（保険） | [PayPay公式](https://paypay.ne.jp/)の金融サービスメニューで各リンク確認 | high | 2026-10-22 |
| epos | エポスカード | epos, eposcard | eposcard.co.jp（エポスNet） | [公式](https://www.eposcard.co.jp/)のエポスNetログイン | high | 2026-10-22 |
| jcb | ジェーシービー／MyJCB | jcb, myjcb | jcb.co.jp（my.jcb.co.jp、j-faq.jcb.co.jp） | [MyJCBログイン](https://my.jcb.co.jp/Login)の入力画面・サポートリンク | high | 2026-10-22 |
| aeon | イオンカード | aeon, aeoncard | aeon.co.jp（カードの公式サイト） | [公式注意喚起](https://www.aeon.co.jp/security/anti_phishing/)を閲覧。メールのFrom欄だけを正規URLの根拠にはしていない | high | 2026-10-22 |
| etc | ETC利用照会サービス | etc, etc-meisai | etc-meisai.jp（www2.etc-meisai.jpログイン） | [公式](https://www.etc-meisai.jp/)のメンテナンス案内からログイン先確認 | high | 2026-10-22 |
| yamato | ヤマト運輸 | yamato, kuroneko, kuronekoyamato | kuronekoyamato.co.jp（cmypage会員・toi追跡・bmypage法人） | [公式](https://www.kuronekoyamato.co.jp/)の各サービスリンク | high | 2026-10-22 |
| sagawa | 佐川急便 | sagawa, sagawa-exp | sagawa-exp.co.jp（k2k追跡、www.e-service会員） | [公式](https://www.sagawa-exp.co.jp/)の再配達・スマートクラブログイン | high | 2026-10-22 |
| japanpost | 日本郵便 | japanpost, post, yuubin | japanpost.jp（post.japanpost.jp） | [日本郵政公式注意喚起](https://www.japanpost.jp/news/fraud-mail/)の日本郵便へのリンク。本体の直接取得は503 | high | 2026-10-22 |
| docomo | NTTドコモ／dアカウント／dカード | docomo, d-account, dcard, ahamo | docomo.ne.jp（id.smt、profile.smt、dcard、dpoint等） | [公式](https://www.docomo.ne.jp/)の会員情報・認証・金融サービスリンク。ahamoのドメインは未検証 | high | 2026-10-22 |
| au | au／KDDI | kddi, auone, au, aupay | au.com（My au）、auone.jp（ID・エネルギー）、kddi.com（企業・規約）、ezweb.ne.jp（災害用伝言板） | [au公式](https://www.au.com/)のMy au・ID規約・企業情報・伝言板リンク | high | 2026-10-22 |
| softbank | ソフトバンク | softbank, softbankbb, ymobile, linemo | softbank.jp（my.softbank.jp）、softbankbb.co.jp（固定回線ログイン）、ymobile.jp、linemo.jp | [公式](https://www.softbank.jp/)と[My SoftBank](https://www.softbank.jp/mysoftbank/)のログイン・関連サービスリンク | high | 2026-10-22 |
| line | LINE | line, lin | line.me（本体）、line.biz（開発者情報）、lin.ee（友だち追加リンク、D参照） | [公式](https://www.line.me/ja/)、[公式開発者案内](https://developers.line.biz/en/docs/messaging-api/try-rich-menu/) | high | 2026-10-22 |
| mercari | メルカリ／メルカリShops | mercari, merpay | mercari.com（jp、help.jp等）、mercari-shops.com（ショップ管理・サポート） | [公式](https://jp.mercari.com/)フッターの運営会社・ヘルプ・ショップ管理リンク。merpayのドメインは未検証 | high | 2026-10-22 |
| microsoft | マイクロソフト | microsoft, office, outlook, live, onedrive | microsoft.com（本体・アカウント）、live.com（login.live.com）、microsoftonline.com（login.microsoftonline.com） | [公式](https://www.microsoft.com/ja-jp/)、[公式ログイン案内](https://support.microsoft.com/en-us/accounts-billing/manage/how-to-sign-in-to-a-microsoft-account)、[認証ホストの説明](https://support.microsoft.com/en-us/office/troubleshoot-sign-in-issues-for-support-microsoft-com) | high | 2026-10-22 |
| google | グーグル | google, gmail, youtube | google.com（検索・accounts.google.com）、google.co.jp（検索からgoogle.comへ転送）。g.co等はD、ユーザー公開先はC参照 | [検索公式を実際に開いた結果](https://www.google.co.jp/)の転送とSign inリンク | high | 2026-10-22 |
| yahoo | Yahoo! JAPAN | yahoo, yj | yahoo.co.jp（本体・メール・買物等）、yahoo-net.jp（support.yahoo-net.jp） | [公式](https://www.yahoo.co.jp/)のサービス・ヘルプリンク | high | 2026-10-22 |
| netflix | ネットフリックス | netflix | netflix.com（視聴・ログイン） | [日本公式](https://www.netflix.com/jp/)のログインリンク | high | 2026-10-22 |
| myna | マイナポータル | myna, mynaportal, mynumber | myna.go.jp（本体・faq・img）、digital.go.jp（サービス説明） | [デジタル庁公式](https://www.digital.go.jp/policies/myna_portal)のmyna.go.jpへのリンク。本体はリダイレクトループで未表示 | high | 2026-10-22 |
| nhk | NHK | nhk | nhk-cs.jp（受信料手続き）、nhk.or.jp（放送・公式注意喚起へのリンク） | [受信料の窓口](https://www.nhk-cs.jp/)の手続きとnhk.or.jpの注意喚起リンク。本体はrobots制限 | high | 2026-10-22 |
| rakuten_card | 楽天カード | rakuten, rakuten-card, enavi, e-navi | rakuten-card.co.jp（本体・e-NAVI）、rakuten.co.jp（apply.card.rakuten.co.jp申込）、rakuten-card.jp（supportヘルプ） | [公式](https://www.rakuten-card.co.jp/)のe-NAVI・申込・ヘルプリンク | high | 2026-10-22 |
| rakuten_bank | 楽天銀行 | rakuten, rakuten-bank | rakuten-bank.co.jp（fes・sfesログイン）、rakuten-bank.net（help-personal） | [公式](https://www.rakuten-bank.co.jp/)のログイン・FAQリンク | high | 2026-10-22 |
| jre | JR東日本／えきねっと／JRE POINT | jreast, eki-net, suica, jrepoint | jreast.co.jp（本体・id.jreast.co.jp）、eki-net.com（予約）、jrepoint.jp（ポイント）、jrewallet.jp（ウォレット）、jreast-app.jp（アプリ）、jre-travel.com／jrview-travel.com（旅行）、jre-hotels.jp（ホテル） | [JR公式](https://www.jreast.co.jp/)・[JRE ID公式](https://www.jreast.co.jp/jreid/)の各リンク。関連する他社・地域サービスまで包括的に許可しない | high | 2026-10-22 |
| ana | 全日本空輸／ANA | ana, mileage | ana.co.jp（予約、cam.ana.co.jp会員情報） | [公式](https://www.ana.co.jp/)の予約・会員情報変更リンク | high | 2026-10-22 |
| jal | 日本航空／JAL | jal, jmb | jal.co.jp（予約・ログイン）、jal.com（tricoコミュニティ・企業）、job-jal.com（採用） | [公式](https://www.jal.co.jp/ja-jp/)のログイン・企業・コミュニティ・採用リンク | high | 2026-10-22 |
| tepco | 東京電力エナジーパートナー | tepco, kurashi | tepco.co.jp（本体・www.app.kurashi.tepco.co.jp等会員サービス） | [公式](https://www.tepco.co.jp/ep/)の家庭向け／法人向けログイン | high | 2026-10-22 |

### A3. 配信専用等の分離

以下は公式ページ内の画像リンクで確認した。`static`はログイン先として採用しない。広告タグ・外部委託先が公式ページから呼ばれていても、その登録ドメイン全体をそのブランドの正規サイト扱いにしない。

| ブランド | ドメイン・ホスト | 区分 | 根拠URL | 確認日 |
|---|---|---|---|---|
| セゾンカード | saisoncard-assets.com（images） | static | [公式画像リンク](https://www.saisoncard.co.jp/) | 2026-10-22 |
| 楽天カード | rakuten-static.com（image.card.jp） | static | [公式画像リンク](https://www.rakuten-card.co.jp/) | 2026-10-22 |
| Netflix | nflxso.net（occ.a）、nflxext.com（assets） | static | [公式画像リンク](https://www.netflix.com/jp/) | 2026-10-22 |
| PayPay | image.paypay.ne.jp（登録単位は既出） | static host | [公式画像リンク](https://paypay.ne.jp/) | 2026-10-22 |
| Microsoft | cdn-dynmedia-1.microsoft.com（登録単位は既出） | static host | [公式画像リンク](https://www.microsoft.com/ja-jp/) | 2026-10-22 |
| メルカリ | static.jp.mercari.com（登録単位は既出） | 文書配信host。利用規約等も掲載されるため純粋な画像専用ではない | [公式フッター](https://jp.mercari.com/) | 2026-10-22 |

### A4. low／未確認（推奨リスト外）

| 候補 | 状態 | 調査に用いた一次URL・不足 | 確信度 | 確認日 |
|---|---|---|---|---|
| amzn.asia | unverified：Amazon運営の短縮である旨の一次記述を確認できず | [Amazon公式の短縮機能案内](https://affiliate-program.amazon.com/help/node/topic/GJMMT7G4C8K4Y3AY)は短縮機能を説明するが、このドメインを特定しない。Amazon Music内の利用者投稿は運営証明に使わない | low | 2026-10-22 |
| 各社の全世界・全関連会社・全配信ドメインの網羅性 | unverified | 各行の公式ページで確認できた範囲のみ。全保有ドメインを公表した一覧は得ていない | low | 2026-10-22 |

### A5. 掲載・照合上の扱い

「この一覧にない＝偽物」にはしない。ドメインの存在確認と、そのURLのコンテンツの正当性は別である。たとえばGoogleの公開サイトやクラウド上の利用者コンテンツは、ブランドの基盤上でも第三者が作れる（C参照）。共有サービスの例外を優先する。

登録単位への集約で、`mufg.jp`に属する各組織や`japanpost.jp`に属する郵便・銀行を一つのサービスと誤認しない。実ホストも保持して表示すること。URL中の語の一致だけで詐欺と断定せず、たとえば紹介記事・比較記事・正規の委託先でも一致し得るという限界を示す。

## B. 属性型JPドメインの登録資格

資格は[JPRS「種類と対象」](https://jprs.jp/about/jp-dom/spec/)、確認手続きは[JPRS登録規則](https://jprs.jp/doc/rule/rule.html)第4・13・15・17条および別紙1、LGは[特則](https://jprs.jp/doc/rule/rule-lgjp.html)による。いずれも2026-10-22確認。下表の「共通審査」は申請の機械的検査と登録審査、必要時の資料提出・調査、資格欠如等の不承認を指す。**すべての申請で登記簿原本の提出・目視確認が行われる、とは確認していない**。即時処理には原則添付書類を定めない規定がある。

| 区分 | 誰が登録できるか（要約） | 確認の仕組み・補足 | 一次情報 | 確認日 |
|---|---|---|---|---|
| co.jp | 国内で登記した会社、信用金庫・信用組合、国内登記した外国会社、一定の組合等 | 共通審査。日本法人の登録情報等が対象。法人設立前の仮登録制度もあるため「登記済み確認済みサイト」とは表示しない | [対象](https://jprs.jp/about/jp-dom/spec/)・[規則](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| or.jp | 財団・社団・医療・宗教・NPO等の法人、協同組合、一定の国際機関・在日公館等 | 共通審査。団体種別により添付資料の定めが異なる | [対象](https://jprs.jp/about/jp-dom/spec/)・[規則別紙1.4](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| go.jp | 日本の政府機関、所管研究所、特殊法人、独立行政法人等 | 共通審査と登録対象の区分。政府機関は複数登録可。「政府機関のみ」では範囲が狭すぎる | [対象・対象組織確認フローへのリンク](https://jprs.jp/about/jp-dom/spec/)・[規則](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| ac.jp | 大学、高専等の高等教育機関、学校法人、大学法人、18歳以上対象の一定の専門学校等 | 共通審査。機関の設置根拠・種別が資格条件 | [対象](https://jprs.jp/about/jp-dom/spec/)・[規則](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| ed.jp | 保育所・幼稚園・小中高校等、主に18歳未満向けの一定の教育機関・組織 | 共通審査。一定の教育センター等は教育長の承認証明が必要。一般の学習サイトなら誰でも取れる区分ではない | [対象](https://jprs.jp/about/jp-dom/spec/)・[規則別紙1.8](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| lg.jp | 地方公共団体とその組織の行政サービス | LG.JP取扱事業者のみが取り次ぎ、登録資格を審査・認定。JPRSが受け付け・検査 | [対象](https://jprs.jp/about/jp-dom/spec/)・[特則第3・8・9条](https://jprs.jp/doc/rule/rule-lgjp.html) | 2026-10-22 |
| ne.jp | 国内の個人または法人が不特定・多数の利用者へ提供するネットワークサービス | 共通審査。サービス内容の明文化、識別子としての使用等の要件。別紙に代表者の印鑑登録証明書等を規定。1サービス1ドメイン | [対象](https://jprs.jp/about/jp-dom/spec/)・[規則別紙1.6](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| ad.jp | JPNIC会員等の対象組織 | JPRSは対象をJPNIC会員と案内し、資格・添付書類等の詳細をJPNICの別定めに委ねる。現行の個別確認書類の網羅はunverified | [対象](https://jprs.jp/about/jp-dom/spec/)・[規則別紙1.5](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| gr.jp | 2名以上の国内在住個人、または複数の国内法人からなる任意団体 | 共通審査。代表・副代表を置き、別紙に両者の印鑑登録証明書等を規定。法人であることは条件ではない | [対象](https://jprs.jp/about/jp-dom/spec/)・[規則別紙1.7](https://jprs.jp/doc/rule/rule.html) | 2026-10-22 |
| 汎用jp | 国内に住所を持つ個人・団体・組織。登録数制限なし | 組織種別の資格制限はないが、**無条件・住所要件なしではない**。指定事業者経由の申請。住所確認の個別実務は一律には確認していない | [対象](https://jprs.jp/about/jp-dom/spec/)・[登録FAQ](https://jprs.jp/faq/registration/) | 2026-10-22 |

画面文言の提案：「このドメイン種別には登録資格の条件があります。サイトの安全性や、表示されたブランド本人であることを保証するものではありません。」`co.jp`・`or.jp`・`ne.jp`・`gr.jp`を同じ強さの「公的機関」と扱わない。JPRSの登録規則第2条も、登録の意味を識別子の一意性としている。

## C. 第三者がコンテンツを公開できるホスティング

「誰でも無料」は、審査なし・制限なし・匿名利用可能を意味しない。アカウント、利用規約、割当上限、用途制限等がある。ここでは無料枠で共有ドメイン上に第三者コンテンツを公開できる仕組みを整理する。ドメインの所持者と個々のページの作成者を区別する。

### C1. 信頼できる報告に名指しされたもの

最新は[Interisle Phishing Landscape 2026](https://www.cybercrimeinfocenter.org/phishing-landscape-2026)（対象2025-05-01〜2026-04-30）。[2026-07-17の無料ホスティング記事](https://interisle.substack.com/p/phishing-landscape-2026-how-phishers)の本文はpages.dev、windows.net、Google Blogspot、Vercelを明示。ただし掲載図の数値をこの環境で読み取れず、2026年版のサービス別件数・順位はunverified。下表の★25は**2025年報告での名指し**であり2026年順位ではない。

2025年の根拠は[Interisle公式PDF、p.19](https://interisle.net/s/phishinglandscape2025.pdf)（2025年9月公表、対象2024年5月〜2025年4月）。件数は提供者単位の合計で、列挙された各ドメインに分配できない。★印はサービス全体や全ページが不正だという意味ではない。

| ドメイン・照合範囲 | 運営・公開機能 | 悪用報告の印・数値の範囲 | 無料公開等の一次根拠 | 確認日 |
|---|---|---|---|---|
| pages.dev | Cloudflare Pages。プロジェクト別サブドメイン | ★26本文／★25：Cloudflare合計43,857攻撃（4ドメイン合計） | [Pages公開先](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)・[Freeプラン言及](https://developers.cloudflare.com/pages/)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |
| workers.dev | Cloudflare Workers。Worker名・アカウント別の公開先 | ★25：上記Cloudflare合計に含む | [公式ルーティング説明](https://developers.cloudflare.com/workers/configuration/routing/)・[無料枠](https://www.cloudflare.com/plans/developer-platform/)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |
| r2.dev | Cloudflare R2。公開オブジェクト用URL。一般のWebアプリホスティングとは用途が違う | ★25：上記Cloudflare合計に含む | [公開バケット](https://developers.cloudflare.com/r2/buckets/public-buckets/)・[料金](https://www.cloudflare.com/plans/developer-platform/)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf)。開発用途、レート制限あり | 2026-10-22 |
| trycloudflare.com（追加） | Cloudflareの一時トンネル | ★25：上記Cloudflare合計に含む。現行の無料条件はunverified、現行無料リストには採用しない | [2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |
| web.app、firebaseapp.com | Google Firebase Hosting。プロジェクト／サイト別サブドメイン | ★25：Google合計30,703攻撃（他のGoogleドメインを含む） | [公式Hosting説明](https://firebase.google.com/docs/hosting?hl=en)・[既定ドメイン](https://firebase.google.com/docs/hosting/default-site)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |
| blogspot.com | Google Blogger。ブログ別サブドメイン | ★26本文／★25：上記Google合計に含む | [公式HTTPS・URL説明](https://support.google.com/blogger/answer/6284029?hl=en)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf)。今回取得したヘルプで現行料金の明文はunverified | 2026-10-22 |
| weebly.com、weeblysite.com | Weeblyの利用者サイト | ★25：Weebly合計29,934攻撃（2ドメイン合計） | [公式無料サブドメイン説明](https://www.weebly.com/app/help/us/en/topics/custom-domains-vs-free-subdomains)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf)。現行無料登録の地域制限・weeblysite.comの新規割当はunverified | 2026-10-22 |
| vercel.app | Vercel。デプロイ別URL | ★26本文はVercelのツールを明示／★25：21,442攻撃 | [公式ドメイン説明](https://vercel.com/docs/domains/working-with-domains/add-a-domain)・[Hobbyの利用条件](https://vercel.com/academy/build-and-launch-with-ai/go-live)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |
| github.io | GitHub Pages。ユーザー・組織・リポジトリ単位 | ★25：20,211攻撃 | [公式：Freeは公開リポジトリで利用可、URL構造](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)・[2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |
| webflow.io（追加） | Webflow | ★25：33,418攻撃。現行無料枠の条件はunverified、現行無料リストには採用しない | [2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |
| gitbook.io（追加） | GitBook | ★25：21,981攻撃。現行無料枠の条件はunverified、現行無料リストには採用しない | [2025報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |

2025 PDFのCloudflare増加率表記と同表の件数には整合しない部分があるため、増加率は転載しない。Googleの合算には多数のサービスが含まれる。`googleapis.com`・`windows.net`全域などを無料サイト専用の接尾辞と見なすことも避ける。windows.netは2026本文で名指しされるが、サービス別の公開境界は今回unverified。

### C2. 一般的な無料ホスティング（今回の上位悪用報告では名指しを確認せず）

「名指しなし」は悪用が存在しないという意味ではない。悪用頻度を主張せず、第三者公開先である旨だけを表示する。

| ドメイン・照合範囲 | 運営元・無料公開の範囲 | 一次根拠 | 確認日 |
|---|---|---|---|
| netlify.app | Netlify。プロジェクト別既定URL。Freeプランあり | [公式プロジェクト説明](https://docs.netlify.com/manage/projects/how-projects-work/) | 2026-10-22 |
| wixsite.com（ホストとパス） | Wix。無料サイトはsiteprefix.wixsite.com/siteaddress | [公式ドメイン説明](https://support.wix.com/en/article/om-dom%C3%A6ner)・[無料ホスティング説明](https://www.wix.com/blog/how-to-host-a-website-for-free) | 2026-10-22 |
| ngrok-free.app | ngrok。無料プランに自動割当の開発用ドメイン1個。公開トンネルであり、コンテンツの保存先とは限らない | [現行Free Plan Limits](https://ngrok.com/docs/pricing-limits/free-plan-limits)。別の公式記事はngrok-free.devを説明しており、新旧全割当規則の統一確認はunverified | 2026-10-22 |
| onrender.com | Render。静的サイト等に既定URL、無料でデプロイ可能なサービス種別あり | [静的サイト](https://render.com/docs/static-sites)・[初回デプロイ](https://render.com/docs/your-first-deploy) | 2026-10-22 |
| notion.site | Notion Sites。Freeは公開サイト数無制限、notion.siteドメイン1個を取得可 | [公式プラン説明](https://www.notion.com/help/notion-sites-availability-and-pricing) | 2026-10-22 |
| canva.site | Canva。無料ドメインでWebサイト公開 | [公式ヘルプ](https://www.canva.com/en_gb/help/publishing-websites-for-free/) | 2026-10-22 |
| framer.app | Framer。生成された公開URL。Freeプランあり。利用者が任意に選ぶ無料接尾辞は別にframer.website等もある | [公式Academy](https://www.framer.com/academy/lessons/framer-fundamentals-publishing)・[公式料金](https://www.framer.com/pricing)・[ドメイン設定](https://www.framer.com/help/articles/how-to-connect-a-custom-domain/) | 2026-10-22 |
| sites.google.com（**完全ホスト名**とサイトパス） | Google Sites。利用者ごとに主にパスで区分。`google.com`全体を同じ扱いにしない | [Google公式公開手順](https://support.google.com/a/users/answer/9310269?hl=en)・[Google公式利用開始資料](https://services.google.com/fh/files/misc/getting_started_with_google_sites.pdf)（2025年資料）。今回の資料では個人向け無料料金の明文はunverified | 2026-10-22 |

### C3. 無料枠終了／ホスティング終了

| ドメイン | 状態 | 一次根拠 | 確認日 |
|---|---|---|---|
| herokuapp.com | **無料枠終了**。Heroku全体の終了ではない。2022-11-28に無料Dynos等を廃止。現行無料ホスティングの推奨リストから除外 | [Heroku公式変更告知](https://devcenter.heroku.com/changelog-items/2461)（2022年） | 2026-10-22 |
| glitch.me | **defunct（ホスティング）**。2025-07-08終了。既存URLの転送対応とホスティング継続を混同しない。★25：4,707攻撃という過去の観測あり | [Glitch公式告知](https://blog.glitch.com/post/changes-are-coming-to-glitch/)（2025年）・[過去のInterisle報告](https://interisle.net/s/phishinglandscape2025.pdf) | 2026-10-22 |

上記の共有ドメインは、悪用報告の有無にかかわらず**接尾辞一致だけで危険判定しない**。表示例：「第三者がページを公開できるサービス上のURLです。サービス運営会社が、このページの作成者とは限りません。」未確認の無料条件を持つ行は、「現行無料サービス」の推奨データには含めない。

## D. URL短縮サービス

「公式短縮」は、そのブランドが利用する／運用に関わる短縮の意味であり、短縮URLの送信者がブランド本人だと認証するものではない。短縮先が外部サイトか、利用者の投稿かも区別する。下表のactiveは公式の現行説明で提供を確認した意味で、リンク作成や任意の既存リンクの実動作試験は行っていない。

### D1. 第三者の一般向け短縮

運営名は一次資料で確認できるサービス・事業者の名称。法人の登記確認はしておらず、法人名が確認できない場合はその旨を明記した。検知用ドメインの確認と、法人名までの確認を混同しない。

| ドメイン | 運営元（確認範囲） | 状態・備考 | 運営・ドメイン対応の一次根拠 | 確認日 |
|---|---|---|---|---|
| bit.ly | Bitly | active。一般の利用者が短縮先を指定する | [Bitly公式サポート](https://support.bitly.com/hc/en-us/articles/4423884643725-What-happened-to-j-mp-and-bitly-com-short-links)（2023年更新、現行掲載） | 2026-10-22 |
| tinyurl.com | TinyURL（サービス運営名まで。法人名はunverified） | active。公式2026記事で短縮サービスを確認。法人名付き運営者一覧の推奨対象にはしない | [TinyURL公式](https://tinyurl.com/blog/do-tinyurls-expire/)（2026-03-30） | 2026-10-22 |
| is.gd | is.gd運営窓口（法人名はunverified） | active。公式が無料短縮・連絡先を説明。Memset等の法人名への帰属は今回未確認 | [公式サービス説明](https://www.is.gd/description.php)・[運営窓口](https://www.is.gd/contact.php) | 2026-10-22 |
| ow.ly | Hootsuite | active。Hootsuite顧客向け。独立した誰でも無料の短縮サービスとは限らない | [Hootsuite公式](https://help.hootsuite.com/s/article/shorten-track-links) | 2026-10-22 |
| buff.ly | Buffer | active。チャンネル別に短縮設定可能 | [Buffer公式](https://support.buffer.com/en-us/articles/shortening-and-unshortening-links-dgev2p41yY) | 2026-10-22 |
| t.ly | Tim Leland／T.LY | active。一般URL短縮 | [運営者を明記する公式About](https://t.ly/about)・[利用規約](https://t.ly/terms) | 2026-10-22 |
| cutt.ly | WEB ROOM STUDIO PATRYK RUMIŃSKI | active。規約で事業者を明記 | [公式規約](https://cutt.ly/terms)（2026-05-19更新） | 2026-10-22 |
| rebrand.ly | Rebrandly | active。一般URLを短縮する共有ドメイン | [公式開始ガイド](https://support.rebrandly.com/en/articles/469536-rebrandly-s-getting-started-guide) | 2026-10-22 |
| rb.gy | Rebrandly | active。ホームページからの一般短縮 | [公式FAQ](https://support.rebrandly.com/en/articles/469545-isn-t-rebrandly-a-free-link-shortener)（2026-06-03） | 2026-10-22 |
| shorturl.at | ShortURL（サービス運営名まで。法人・個人名はunverified） | 公式規約で短縮サービスを確認。運営実体を特定した推奨一覧から除外 | [公式利用規約](https://www.shorturl.at/terms-of-service.php)・[プライバシー](https://www.shorturl.at/privacy-policy.php) | 2026-10-22 |
| tiny.cc | Tiny.cc（サービス運営名まで。法人・個人名はunverified） | 公式Aboutで短縮サービスを確認。TinyURLやtiny.comへの帰属は確認できず、同一運営と扱わない | [公式About](https://tiny.cc/about)・[公式規約](https://tiny.cc/terms) | 2026-10-22 |
| x.gd | X.gd（サービス運営名まで。法人・個人名はunverified） | 無料一般短縮を公式説明で確認。運営実体を特定した推奨一覧から除外 | [公式About](https://x.gd/about)・[利用規約](https://x.gd/terms) | 2026-10-22 |
| s.id | PT Aidi Digital Global | active。短縮のほかマイクロサイト等も提供 | [公式About](https://home.s.id/gl/en/about)・[公式規約](https://home.s.id/en/page/terms-of-service) | 2026-10-22 |

運営名まで裏取りできた一般短縮の**提案用リスト**：`bit.ly, ow.ly, buff.ly, t.ly, cutt.ly, rebrand.ly, rb.gy, s.id`。これは不正URLのブロックリストではなく、「短縮で行き先を読み取りにくい」ことを表示する候補。法人名等unverifiedの残り5件は、確認待ち候補として分離し、運営者を確認済みとする推奨リストには含めない。

### D2. ブランドが使う短縮／ブランド自身のサービス

| ドメイン | 運営・利用ブランド | 状態 | 行き先・信頼の境界 | 一次根拠（資料年） | 確認日 |
|---|---|---|---|---|---|
| amzn.to | Amazon向けブランド短縮、基盤はBitly | active（公式説明） | Bitlyのauto-brandingでAmazon宛リンクに適用。作成者はAmazon本人に限られない。「Amazon単独で自社開発・運営」とはしない | [Bitly公式auto-branding](https://support.bitly.com/hc/en-us/articles/230556947-What-is-auto-branding)（2025）、[Amazon自身の利用例](https://press.aboutamazon.com/2022/6/amazon-canada-launches-refugee-program-offering-vital-resources-to-meet-critical-needs-of-refugees-resettling-in-canada)（2022） | 2026-10-22 |
| lin.ee | LINE／LINEヤフー | active（公式説明） | 友だち追加だけでなく、広告の入稿先URLを短縮する用途もある。利用者・広告主の内容をLINEが保証する意味ではない | [LINE Developers](https://developers.line.biz/en/docs/messaging-api/try-rich-menu/)、[LINE NEWS公式媒体資料](https://www.lycbiz.com/sites/default/files/media/jp/download/LINE%20NEWS_mediaguide_2025_10-12.pdf)（2025） | 2026-10-22 |
| youtu.be | YouTube／Google | ブランド公式の動画短縮 | YouTube公式が動画リンク用と明示。ただし動画そのものは第三者投稿になり得る。導入説明は2009年の古い一次資料で、2026年の全リダイレクト仕様はunverified | [YouTube公式導入記事](https://blog.youtube/news-and-events/make-way-for-youtube-links/)（2009） | 2026-10-22 |
| t.co | X | active | 投稿・DMで共有された外部リンクも短縮する。Xが運営していても、行き先がX公式とは限らない | [X公式リンクサービス説明](https://help.x.com/en/using-x/url-shortener) | 2026-10-22 |
| fb.me | Meta／Facebook | 公式による利用を確認。2026年の全仕様・提供範囲はunverified | MetaのWhatsApp研修への誘導などで利用。過去の利用例から現在のあらゆるパスを安全扱いしない | [Meta公式記事](https://about.fb.com/br/news/2022/08/meta-lanca-chatbot-no-whatsapp-para-treinamentos-de-marketing-digital/)（2022） | 2026-10-22 |
| g.co | Google | ブランド公式URLショートカット | Google所有の製品・サービス向け。短縮先がGoogle基盤であることと、利用者投稿の正当性は別 | [現行説明ページ](https://g.co/)・[Google公式導入記事](https://googleblog.blogspot.com/2011/07/gco-official-url-shortcut-for-google.html)（2011） | 2026-10-22 |
| r10.to（追加） | 楽天グループ | 公式サイトで利用確認 | 楽天カード申込や楽天証券への公式リンクとして使用。全転送仕様と運営法人の特定はunverifiedのため、独立した安全許可リストには入れない | [楽天カード公式](https://www.rakuten-card.co.jp/)・[楽天銀行公式](https://www.rakuten-bank.co.jp/)のリンク | 2026-10-22 |
| aka.ms（追加） | Microsoft | 公式サイトで利用確認 | アカウント画面のプライバシーリンク等。全転送仕様はunverifiedのため、安全許可リストには入れない | [Microsoft Account公式](https://account.microsoft.com/)のYour Privacy Choicesリンク | 2026-10-22 |

### D3. 終了・部分終了・未確認

| ドメイン | 判定 | 根拠URL・確認限界 | 確認日 |
|---|---|---|---|
| goo.gl | **defunct（新規一般短縮のサービス）／既存転送は部分継続**。全URL終了と書かない | [Google公式2025-08-01の方針修正](https://blog.google/innovation-and-ai/technology/developers-tools/googl-link-shortening-update/)：2024年末に非アクティブだったリンク等を対象に停止し、利用中リンクは維持する方針へ変更。Google所有でも元来は一般URL用であり、Google公式の行き先限定短縮ではない | 2026-10-22 |
| amzn.asia | **unverified**：公式短縮の運営帰属・現行仕様を一次情報で確認しきれず。推奨リスト外 | [Amazon公式の短縮機能ヘルプ](https://affiliate-program.amazon.com/help/node/topic/GJMMT7G4C8K4Y3AY)は機能を説明するがドメインを特定しない。一般ブログ、通販出品者・ポッドキャスト投稿内のリンクだけでは裏取りとしない | 2026-10-22 |

### D4. 1回取得というアプリの前提との関係

短縮ドメインが確認できても、元の文字列だけでは転送先を判定できない。1回取得で転送先へ追加アクセスしない設計なら、結果は「短縮URL。行き先は未確認」とする。HTTPリダイレクトを自動追跡して複数回通信した結果を「1回だけ取得」と説明しない。ブランド公式短縮も安全判定の免除には使わない。これは本調査に基づく表示方針の提案であり、実装・コードの変更は行っていない。

goo.glの新規短縮終了については、[Google Developers公式の更新付き告知](https://developers.googleblog.com/google-url-shortener-links-will-no-longer-be-available/)（2024年公開、2025年追記、2026-10-22確認）が、新規URLの短縮受付を終了したことと、既存転送維持の方針変更を両方説明している。古い本文の「全件停止」より2025年追記を優先する。

## E. 悪用率の高いTLD

### E1. Interisle最新版の上位15

根拠：[Interisle／Cybercrime Information Center「Phishing Activity in TLDs」2026年版、Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026)。調査期間は**2025-05-01〜2026-04-30**、確認日は2026-10-22。対象は委任ドメイン30,000以上かつフィッシングドメイン25以上のTLD。

指標は `Phishing Domain Score = 報告されたフィッシングドメイン数 ÷ TLDの委任ドメイン数 × 10,000`。**百分率ではない**。侵害された正規サイトも含み得る「フィッシングに使用されたドメイン」であり、悪意を持って登録されたドメインだけの割合ではない。また、通年の検知件数と母数による比率であり、任意のURLを開いた場合の被害確率ではない。

| 順位 | TLD | フィッシングドメイン数 | Score（1万ドメイン当たり） | 調査年・一次URL | 確認日 |
|---|---|---|---|---|---|
| 1 | .xin | 35,077 | 5,910.0 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 2 | .win | 18,626 | 1,640.7 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 3 | .icu | 74,786 | 1,607.0 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 4 | .garden | 10,340 | 1,567.7 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 5 | .cfd | 70,944 | 1,387.4 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 6 | .pro | 130,945 | 1,200.1 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 7 | .help | 18,715 | 1,058.5 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 8 | .mom | 5,728 | 996.9 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 9 | .rest | 7,774 | 981.0 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 10 | .mobi | 33,424 | 845.1 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 11 | .qpon | 5,941 | 819.8 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 12 | .live | 41,523 | 739.8 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 13 | .ink | 7,980 | 718.4 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 14 | .best | 2,563 | 706.6 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |
| 15 | .lat | 9,137 | 664.5 | [2026 Table 2](https://www.cybercrimeinfocenter.org/phishing-activity-in-tlds-may-april-2026) | 2026-10-22 |

### E2. Spamhaus現行情報との区別

[Spamhaus公式](https://www.spamhaus.org/)は2026-10-21更新の統計概要を表示していた。ただし[現行ランキング](https://www.spamhaus.org/reputation-statistics/)は今回の取得では本文0行で、旧`/statistics/tlds/`は404。**現行のThe World's Most Abused TLDsの上位15・各悪用率はunverified**。過去の2022年表や、ボットネットC&Cドメイン件数で補完していない。

| 確認できた現行数値 | その意味 | 一次URL | 確認日 |
|---|---|---|---|
| .world +63%（October 2026、2026-10-21更新） | スパム関連ドメイン数の増加率として表示。TLD内の悪用ドメイン割合ではない | [Spamhaus公式概要](https://www.spamhaus.org/) | 2026-10-22 |
| .si +137%（同上） | 悪意あるドメイン数の増加率として表示。悪用率そのものではない | [Spamhaus公式概要](https://www.spamhaus.org/) | 2026-10-22 |

[Spamhaus公式の指標FAQ](https://check.spamhaus.org/faqs/reputation-statistics/)は、悪評ドメインの割合とTLD規模を重み付けしたスコアを説明している。Interisleの1万件当たりScoreと同一指標として混ぜない。上の増加率2件は、TLD推奨リストの選定根拠にはしていない。

### E3. 「弱い目安」の短い提案リスト

**候補：`.xin, .icu, .cfd` の3個。** E1の最新Score上位群から、各3万件以上のフィッシングドメイン報告が確認できるものに絞った調査者の暫定提案（同率順位の厳密な上位3ではない）。誤検知率・検出率を測定した分類器ではなく、選択基準そのものに統計的な性能保証はない。

**正規の利用者も多いので、単独では判断の根拠にしない。** 他の具体的兆候がある場合の補助表示にとどめる。TLDだけで「詐欺」「危険」と断定、全サイトを遮断、あるいは逆に非掲載TLDを安全と判断しない。ブランド語、短縮、無料公開先、HTTP守りの設定の不足はそれぞれ違う情報であり、同一の確定事実として合算しない。

## 不確かな点

以下はすべて**unverified**。推奨リストには入れていない、または該当する未確認の属性を推奨根拠にしていない。

1. 月次報告のブランドごとの正確な件数。Amazon・Appleの概算は丸め済み割合からの計算であり、その件数が公表されたわけではない。セゾン・アメックス・国税庁の個別件数、1,000件以上13ブランドの完全内訳は未確認。
2. Aの全関連ドメインの網羅性。別サービス・海外・キャンペーン・認証・配信用ドメインが追加・変更される可能性がある。ahamo、merpay、みずほ等の別登録単位の認証先などは、未検証部分を名前から補っていない。ASCII語の実際の悪用出現率も未測定。
3. amzn.asiaの運営帰属・現行仕様。Amazon本体の一部ヘルプはロボット確認・503で読めず、公式機能の説明から特定ドメインを推定しなかった。
4. JPRS各手続きの全例外・全指定事業者での本人確認実務、ADの現行確認書類の完全一覧。各属性に資格要件があることと、すべての登録者を一律の手法で本人確認済みであることは異なる。
5. Interisle 2026無料ホスティング記事の図中の順位・件数。2025表を明確に過去データとして補助利用した。2026年の各ホスティング・ドメイン別悪用率は未確認。
6. Cで名指しを確認できなかったサービスの悪用頻度。悪用が無いとする調査結果ではない。無料枠の将来の継続、地域別の利用可否、Blogger・Google Sitesの現行無料料金の明文、Weeblyの新規割当範囲、追加したWebflow・GitBook・一時トンネルの現行条件も未確認。これらの未確認属性は「現行無料」の推奨根拠にしない。
7. ngrokのngrok-free.appとngrok-free.devの全割当条件。公式文書間の記述差を一方の完全終了と解釈していない。
8. tinyurl.com、is.gd、shorturl.at、tiny.cc、x.gdの運営法人・個人名。サービス自身とのドメイン対応は一次ページで確認したが、登記主体まで同定していない。
9. youtu.beの現行の全転送仕様、fb.meの2026年提供範囲、r10.to・aka.msの全転送仕様や運営実体の詳細。過去の公式利用例だけから全パスの現在の安全性を主張しない。
10. goo.glの個々の既存リンクの生存状況。方針上部分継続であり、すべての既存リンクが存続すると確認したわけではない。
11. Spamhaus現行ランキングの上位15と悪用率。取得できた増加率・他種の脅威件数を代用していない。
12. 提案リストを実際のURL群へ適用したときの誤検知率・検出率。今回の成果は出典付きの参照調査であり、診断性能の実証ではない。
