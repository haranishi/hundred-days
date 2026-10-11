# Day63 名称の実在確認（画面に出る架空名8件）

調査日は2026-10-11。Webで確かめられた事実と、名前の重なり具合の目安だけを書く。法的な評価はしていない。表に載せたURLは、実際に開いて中身を確かめたページに限る。偽ドメインの登録状況は依頼者が確認済みなので、再調査していない。

## 1. 結論：4件が実在の名前と重なるので、改名を勧める

- 同じ分野にほぼ同じ名前があったのは2件。後払いの旅行予約アプリ「TRAVEL Now（トラベルナウ）」と、小林製薬の機能性表示食品「ブルーベリーEX」（60粒・30日分）だ。ゲームでは、トラベルナウが「残り1室」と煽る予約サイトの名前に、ブルーベリーEXが定期便を勝手に付けて売る商品の名前になっている。**この2件は改名を勧める。**
- 似た名前が見つかったのは2件。「クラウドミュージックFREE」は香港上場の Cloud Music Inc.（NetEase の音楽配信の運営会社）と、「天然温泉 翠明館」は山中温泉の宿「翠明」や同じ読みの下呂温泉「水明館」と重なる。こちらも改名の検討を勧める。
- 「健康ライフ通販」は、健康食品を通販する「安心健康ライフ株式会社」と一部の語が重なるだけだった。TRENDY STYLE、動画デリバリーPlus、題名「解約ボタンは、どれ？」は、ぶつかる実在の名前が見つからなかった。
- 今のコード（dea762e）で文字として画面に出る名前は、翠明館、ブルーベリーEX、Movie Delivery Plus、それに題名だけだ。ほかの店名は、偽ドメインとしてアドレス欄に出る。トラベルナウとクラウドミュージックの重なりは travel-now-hotel.jp と cloud-music-free.jp に残っているので、改名するならドメインも替える。
- 商標の登録は1件も確かめられていない。名前を確定する前に、開発者本人が J-PlatPat で引く必要がある。

## 2. 名称ごとの表：高2件・中2件・低1件・見つからない3件

| 名称 | 画面での使われ方 | 検索語（引用符つき） | 見つかった実在のもの（名称・分野・URL） | 重なり | リスクの目安 | 推奨 |
|---|---|---|---|---|---|---|
| 1. TRENDY STYLE | 店名の文字は出ない。現場1のアドレス欄に `trendy-style-fashion.jp` | "TRENDY STYLE" ファッション 通販／"トレンディスタイル"／"トレンディースタイル" OR "トレンディ スタイル"／"TRENDY STYLE" アパレル OR 株式会社／"TRENDY STYLE" 楽天 OR Yahoo OR BASE／"Trendy Style" fashion online store Japan／"trendystyle"／"Trendy Style" clothing brand trademark | 国内のファッション通販で同じ名前は見つからない。英語圏の似た名前の店が検索結果に出たが、ページが開けず未確認 | 見つからない | 見つからない | そのまま |
| 2. クラウドミュージックFREE | 店名の文字は出ない。現場2のアドレス欄に `cloud-music-free.jp` | "クラウドミュージック"／"クラウドミュージック" アプリ 音楽／"Cloud Music Free" app／"NetEase Cloud Music"／"Cloud Music Inc." 9899 | Cloud Music Inc.（雲音樂股份有限公司）：香港上場（9899）、NetEase が支配株主。2022年7月に Cloud Village Inc. から改称し、株式略称は CLOUD MUSIC（[HKEX 2022](https://www1.hkexnews.hk/listedco/listconews/sehk/2022/0722/2022072200555.pdf)）。NetEase は音楽事業を「Cloud Music」と呼び、2023年1〜3月期の売上は約20億元（[HKEX 2023](https://www1.hkexnews.hk/listedco/listconews/sehk/2023/0525/2023052500824.pdf)）。サービス名は NetEase Cloud Music（網易雲音楽）で、有料会員がある音楽配信（[THE BRIDGE](https://thebridge.jp/2019/04/netease-cloud-music-nippon-columbia)）。2024年10月に社名を NetEase Cloud Music Inc. へ変える計画が報じられた（[TipRanks](https://www.tipranks.com/news/company-announcements/cloud-music-inc-plans-rebranding-to-netease)）<br>App Store の「Cloud Music - Player Offline」：クラウドに置いた曲を再生するアプリ。課金商品名は Cloud Music PREMIUM（[App Store](https://apps.apple.com/py/app/cloud-music-player-offline/id1389203210?l=en-GB)） | 類似 | 中 | 改名を検討 |
| 3. トラベルナウ！ | 店名の文字は出ない。現場3のアドレス欄に `travel-now-hotel.jp` | "トラベルナウ"／"トラベルナウ" ホテル 予約／"TravelNow" hotel booking／"Travel Now" 旅行会社 日本／"TRAVEL Now" サービス終了 | TRAVEL Now（トラベルナウ）：後払い専用の旅行予約アプリ（航空券＋ホテルなど約65,000種類）。株式会社バンクが2018年6月に始め、2019年10月8日に株式会社エボラブルアジアが事業を譲り受けた（[開示資料](https://www2.infomart.co.jp/web/jp/images/upload/573/140120191009406355_7874286.pdf)・[THE BRIDGE](https://thebridge.jp/2018/06/bank-travel-now)・[トラベルボイス](https://www.travelvoice.jp/20191010-139286)）<br>TravelNow.com：米国のホテル・航空券などの予約サイト（1995年開始、4万軒超のホテル）（[Hotel Online](https://www.hotel-online.com/news/travelnow-achieves-63478-online-bookings-during-june-2000-july-2000)）。2001年2月に Hotel Reservations Network が買収（[SEC](https://www.sec.gov/Archives/edgar/data/0001098322/000091205701006265/a2039538zex-99_1.txt)）<br>株式会社トラベルナウ・インターナショナル：2000年に TravelNow.com と提携した国内のオンライン旅行会社（[INTERNET Watch](https://internet.watch.impress.co.jp/www/article/2000/0419/tn.htm)） | 同一 | 高 | 改名を検討（ドメインも） |
| 4. 天然温泉 翠明館 | 現場3の宿名として見出しに表示（「— スタンダード和室」） | "翠明館"／"翠明館" 旅館／"翠明館" 温泉／"すいめいかん" 旅館 OR ホテル OR 温泉／"山中温泉 翠明" 加賀市／"翠明の湯" 奥道後 | 「翠明館」と同じ名前の宿は見つからない。近いものは次のとおり<br>翠明：石川県加賀市・山中温泉の宿、総客室数80室（[近畿日本ツーリスト](https://yado.knt.co.jp/st/S170074/)）<br>翆明：愛知県新城市の旅館（[フォートラベル](https://4travel.jp/dm_hotel-10047753)）<br>翠明荘：青森県弘前市の登録有形文化財。昭和37年から旅館、平成2年から割烹（[青森県](https://www.pref.aomori.lg.jp/soshiki/kyoiku/e-bunka/torokuyukei_91.html)）<br>翠明の湯：愛媛県松山市「奥道後 壱湯の守」の露天風呂（[るるぶ](https://rurubu.jp/andmore/spot/80036496)）<br>同じ読みの水明館：岐阜県・下呂温泉（[公式](https://www.suimeikan.co.jp/)）、ホテル水明館：長野県山ノ内町（[ニフティ温泉](https://onsen.nifty.com/shigakougen-onsen/onsen008368/)） | 類似 | 中 | 改名を検討 |
| 5. 健康ライフ通販 | 店名の文字は出ない。現場4のアドレス欄に `kenko-life-ec.jp` | "健康ライフ通販"／"株式会社健康ライフ"／"健康ライフ" サプリメント 通販 会社／"健康ライフショップ" OR "健康ライフ館" OR "健康ライフストア"／"kenko-life" 通販 サプリ／"Kenko Life" Japan supplement online shop | 同じ名前は見つからない。一部が重なるのは安心健康ライフ株式会社：東京都江戸川区、化粧品・健康食品の開発と通信販売。2026年10月1日付のお知らせが載っている（営業中とみられる）（[サイト](https://anshin-kenkou.jp/)・[会社概要](https://anshin-kenkou.jp/fcompany/)） | 類似（一部） | 低 | 改名を検討（優先度は低い） |
| 6. 超高濃度ブルーベリーEX（30日分） | 現場4の商品名として表示。★4.9、初回500円、定期便の事前チェックと同じ画面 | "ブルーベリーEX" サプリ／小林製薬 "ブルーベリーEX" 機能性表示食品／"超高濃度ブルーベリー"／"高濃度ブルーベリー" サプリ 商品／"ブルーベリーEX" 商標 登録 | 小林製薬「ブルーベリーEX」：機能性表示食品（届出番号E394）、60粒・30日分（[製品ページ](https://www.kobayashi.co.jp/seihin/bberry_ex/)・[機能性表示食品の一覧](https://www.kobayashi.co.jp/seihin/menu/category_02_8.html)）。通販サイトで在庫ありの表示（[サンドラッグ](https://sundrug-online.com/en/products/4987072057100)）<br>楽天市場に別の店の「ブルーベリーEX 30粒」。ページが文字化けし、製造元は読み取れなかった（[楽天](https://item.rakuten.co.jp/pmone/4573340051200_sh02/)） | 類似（商品名の中核が同じ） | 高 | 改名を検討 |
| 7. 動画デリバリーPlus／Movie Delivery Plus | 現場5のフッター「© 2026 Movie Delivery Plus.」と、アドレス欄の `movie-delivery-plus.jp` | "動画デリバリー"／"動画デリバリープラス" OR "動画デリバリーPlus" OR "動画デリバリー+"／"Movie Delivery Plus"／"MovieDelivery" OR "Movie Delivery" streaming service／"Delivery Plus" video streaming OR 動画 サブスク | 同じ名前・似た名前の動画配信は見つからない。名前の一部が似るだけの古いサービスに、携帯向け動画配信「デリバリDOGA」（ゼノメディアブレンド、2007年開始）がある（[プレスリリース](https://www.value-press.com/pressrelease/24476)） | 見つからない | 見つからない | そのまま |
| 8. 題名「解約ボタンは、どれ？」・副題「欺瞞的UI脱出ゲーム」 | `<title>`、h1、共有文 | "解約ボタンはどれ"／"解約ボタン" ゲーム ダークパターン 見抜く／"解約ボタンを探せ" OR "どれが解約ボタン" OR "解約ボタンはどこ"／"欺瞞的UI" 脱出ゲーム／"Which is the cancel button" game／"deceptive UI" escape game | 同じ題名の書籍・ゲーム・アプリは見つからない。言い回しが近いのは記事の見出し「解約ボタン、どこ……?」で、ジョークWebアプリ「unhearable」の紹介記事（窓の杜、2026-01-30）（[窓の杜](https://forest.watch.impress.co.jp/docs/serial/yajiuma/2082062.html)）。題材が同じ作品に「ダークパターン博物館」（2026-08-25公開）がある（[電ファミ](https://news.denfaminicogamer.jp/news/2608264s)） | 見つからない | 見つからない | そのまま |

「画面での使われ方」は、コード（dea762e の `lib/stages.js`・`app.js`）と `shots-r3` のスクリーンショットで確かめた。リスクの目安は名前の重なりと分野の近さから付けた。高は、同じ分野でほぼ同じ名前の実在を日本で確認できたもの。中は、名前の中核か読みが重なるものの、一般語に近い、日本での展開が見えない、完全一致ではない、のいずれかに当たるもの。低は、一部の語が重なるだけのもの。

高の2件は、名前が重なるうえに、ゲーム内での役回りが悪い。トラベルナウは煽り表示で返金不可プランへ誘う予約サイトの名前で、ブルーベリーEXは★4.9の評価表示と事前チェック済みの定期便に囲まれて売られる商品名だ。

## 3. 改名を勧める場合の代案：同じ名前・同じ分野の実在は見つからなかった

各案を引用符で囲み、分野の語（ホテルや予約、音楽アプリ、温泉旅館、サプリ、通販など）を足して検索した。予約サイト・音楽アプリ・宿の案の一部は英字表記（Sugutoma、Otoburanko、Kumoiro など）でも調べ、該当するものは出なかった。括弧内のドメインは、JPRS WHOIS で未登録（No match）を確かめた（2026-10-11）。

- トラベルナウ！の代わり：「スグトマ！」（`sugutoma-hotel.jp`）、「ネドコナビ」（`nedoko-navi.jp`）、「ヤドハヤ」（`yadohaya-hotel.jp`）。
- クラウドミュージックFREEの代わり：「オトブランコFREE」（`otoburanko-free.jp`）、「ナガラオンFREE」（`nagaraon-free.jp`）、「キキホーダイFREE」（`kikihodai-free.jp`）。キキホーダイは一般語の「聴き放題」に近く、他との区別はつきにくい。
- 天然温泉 翠明館の代わり：「天然温泉 くもいろ亭」「湯宿 ほたるび坂」「天然温泉 ゆたゆた亭」。
- 超高濃度ブルーベリーEX（30日分）の代わり：「濃ゆいベリー粒（30日分）」「ぎゅっとベリー濃縮粒（30日分）」「ムラサキの実 濃縮粒（30日分）」。実在の商品と重なった「EX」は外した。「超高濃度ブルーベリー」も検索したが同名の商品は出なかったので、「超高濃度」は頭に付け直してもよい。
- 健康ライフ通販の代わり（優先度は低い）：「サプリのたまて箱」（`supple-tamatebako.jp`）、「すこやかポスト」（`sukoyaka-post.jp`）。

次の7案は、検索で近い名前が出たので外した。外す判断は検索結果の要約だけで下し、ページは開いていない。

- メロポケ：ポケモン関連の音楽ゲームが出た
- まなこベリー：「まなこ」という配信者が出た
- しずく灯・そよぎ野・ねぼすけ荘：検索結果に出た宿「旅館 しずく」「よもぎ埜」「ねぼーや」と音が近い
- ハツラツ堂：「はつらつ」を冠した健康食品が出た

## 4. 確認できなかったこと：商標の登録は全件わからない

- 商標：J-PlatPat は JavaScript で画面を組み立てるため、取得できたのは「Loading...」だけだった。登録の有無、権利者、指定区分は、どの名称についてもわからない。小林製薬の製品ページで「ブルーベリーEX」に®の表示はないが、未登録だという証拠にはならない。引く順番の目安は、ブルーベリーEX、TRAVEL Now／トラベルナウ、CLOUD MUSIC／クラウドミュージック、翠明、健康ライフ。
- TRAVEL Now の今：終了の告知は見つからなかった。開示資料に載るサービスURL `travel.app` は、2026-10-11時点でドメイン販売サイト（domains.atom.com）へ転送される。提供は終わっていると推測するが、確証はない。サービスが終わっても商標権が残っている可能性はある（推測）。
- TravelNow.com の買収後の行方：未確認。2026-10-11にトップページを開くと HTTP 502 だった。
- 海外の商標：中国・香港の Cloud Music、米国の TravelNow は調べていない。英語圏の Trendy 系の店は、ページが 403／404 で開けなかった。
- 法人登記：国税庁の法人番号公表サイトや gBizINFO で同名の法人は引いていない。
- 検索の届かない範囲：検索に出にくい小さな宿、SNSだけで営業する店、アプリストア内の全件までは確かめられていない。
