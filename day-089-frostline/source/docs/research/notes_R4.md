# R4 調査メモ

確認日：2026-11-10。調査のみ。素材の取得、コード作成、Git操作、ブラウザ・サーバー起動は行わない。
表記：事実＝開いた一次資料で確認、解釈＝利用形態への当てはめ、提案＝採用方針。原文を取得できないものは未確認。

## 1a. テクスチャ・モデル：確認完了

- 事実：Poly Haven、ambientCG、Kenneyのゲーム素材はCC0。Poly Haven・ambientCGは素材の再配布を明示。Kenneyのロゴは公式用途限定。
  - https://polyhaven.com/license
  - https://docs.ambientcg.com/license/
  - https://kenney.nl/support
- 事実：Quaternius Universal Base Characters／Universal Animation Libraryは商品ページにCC0。無料版とSource版の収録範囲が異なる。120以上の汎用モーションだが滑走専用の収録は未確認。
  - https://quaternius.com/packs/universalbasecharacters.html
  - https://quaternius.com/packs/universalanimationlibrary.html
- 事実：CC BY 4.0は再配布・商用利用を許し、著作者・ライセンス・変更の表示を要求。SketchfabはNoAIとCCの関係に留保を示す。NoAI付きは今回の方針で除外。
  - https://creativecommons.org/licenses/by/4.0/legalcode.en
  - https://sketchfab.com/blogs/community/restricting-generative-ai-use-of-free-models/
- 事実：Fabの公式要約は任意の互換ツール利用可、単体再配布不可、私的共同制作共有可。法的本文はページ抽出で取得できず未確認。旧MegascansのEpic Content Licenseは別に原文を確認できた。
  - https://www.fab.com/eula?lang=en
  - https://www.unrealengine.com/eula/content
- 未確認：OpenGameArt FAQは403。規約を確認できるまでサイト全体を利用可とは判断しない。

## 1b. 人物・モーション：一次確認と保留の切り分け完了

- 事実：Adobe公式FAQはMixamo人物・アニメーションの商用ゲーム利用を許す。Adobe Community掲載FAQは素材ファイル再配布不可・機械学習用途不可・クレジット不要と説明するが、投稿は規約本文ではない。
  - https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
  - https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400?lang=en
- 事実：MPFB公式FAQは出力・同梱コア素材がCC0。追加素材は別確認が必要。
  - https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html
- 事実：RokokoヘルプはMotion Libraryの購入・チーム内共有・FBX書き出しを説明。公開再配布の許諾はこの文書では確認できない。
  - https://support.rokoko.com/hc/en-us/articles/4410021327121-Getting-Started-Rokoko-Studio-Motion-Library
- 未確認：CMUはHTTPS／HTTPとも取得タイムアウト。Ready Player Me公式サイトも原文取得できず、閉鎖情報の一次確認を継続する。

## 1c. 音：規約確認完了、個別クリップを追加調査

- 事実：Freesoundは音ごとのCC条件。2026年7月から生成AI訓練に関する投稿者設定が追加され、CCの条件とは別に説明される。
  - https://freesound.org/help/faq/
- 事実：Sonniss GDCは商用可・表示不要だがAI/ML訓練禁止、素材再配布は別制限。
  - https://sonniss.com/gameaudiogdc/
  - https://sonniss.com/gdc-bundle-license/
- 事実：Pixabayは単体配布禁止。Zapsplatも素材ファイル再配布禁止、Basicは表示要、Premiumは不要、AI訓練禁止。
  - https://pixabay.com/service/terms/
  - https://www.zapsplat.com/license-type/standard-license/
- 未確認：BBCページは個人・教育利用とライセンス購入を案内するが、JS依存で規約本文を取得できない。
  - https://sound-effects.bbcrewind.co.uk/licensing

## 2. DEM：地域別の一次規約確認完了

- 事実：GSIタイル一覧では標高タイルは「基本測量成果以外で出典のみ」の区分にある。基盤地図情報DEMのダウンロード成果とは区別が必要。コンテンツ規約と測量法手続は別。
  - https://maps.gsi.go.jp/development/ichiran.html
  - https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
  - https://www.gsi.go.jp/LAW/2930-index.html
  - https://www.gsi.go.jp/LAW/2930-qa.html
  - https://www.gsi.go.jp/LAW/2930-sample.html
- 事実：swissALTI3Dは0.5m/2m、通常OGDは商用・加工・配布可で©swisstopo等の出典要。サンプルは製品組込み不可。Kartverket無料製品はCC BY 4.0、DTM1は1m。
  - https://www.swisstopo.admin.ch/en/height-model-swissalti3d
  - https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices
  - https://www.kartverket.no/api-og-data/vilkar-for-bruk
  - https://data.norge.no/en/data-services/df1adc4b-7575-351a-b9d4-4891decc8b16/dtm1-atom-feed-tjeneste
- 事実：Copernicus GLO-30規約4条は再配布・加工可、6条は原データ／加工データ別の出典文・免責文を要求。GLO-90の同一条件は別原文の取得待ち。
  - https://docs.sentinel-hub.com/api/latest/static/files/data/dem/resources/license/License-COPDEM-30.pdf
  - https://copernicus-dem-30m.s3.amazonaws.com/readme.html
- 事実：USGS提供のdata.govメタデータは全3DEP製品がpublic domainと明記し1m LiDAR由来も説明。NASA一般規約は別指定のないNASA主導データをCC0とするが個別データ確認を優先。
  - https://catalog.data.gov/dataset/1-3rd-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-co
  - https://www.usgs.gov/faqs/what-types-elevation-datasets-are-available-what-formats-do-they-come-and-where-can-i-download
  - https://science.data.nasa.gov/about/license
- 事実：IGN公式カタログはRGE ALTIをLicence Ouverte 2.0、Etalab原文は商用・加工・再配布可、出所とデータ更新日の表示要。EEAは1m/5m・フランス本土と一部海外領土と説明。
  - https://www.data.gouv.fr/datasets/referentiel-a-grande-echelle-rge
  - https://github.com/etalab/licence-ouverte/blob/master/LO.md
  - https://cis2.eea.europa.eu/data/900/
- 事実：OpenTopographyは元データの個別条件と出典・配布経路の明記を要求。APIキーの公開・第三者への共有は禁止。
  - https://opentopography.org/usageterms
- 未確認：JAXA AW3D30の現在のリンク先規約は本文0行。商用可・30m・登録必要・©JAXAは商品ページで確認できるが、加工高さデータの再配布条件は未確認。オーストリアのカタログも本文取得できず保留。
  - https://www.eorc.jaxa.jp/ALOS/jp/dataset/aw3d30/aw3d30_j.htm

## 4. 名称：衝突候補・手順確認完了

- 事実：作者の英語サイトでYuki Lineというブラウザスノーボードゲームを確認。日本語「雪線 Yuki Line」は検索結果にあるが日本語ページ自体は取得不能なので、その漢字表記の原文確認は保留。
  - https://mitchellhanson.com/
- 解釈：同じジャンルの検索結果に同じ漢字名が出るため「雪線」単独は候補から外すのがよい。「SESSEN」完全一致のゲーム・サービスは今回の検索で確認できないが、商標不存在を意味しない。
- 事実：INPITは文字→称呼の単純文字列→称呼の類似検索を案内し、類似検索ヒットが法的な類似判断と同じではないと説明。
  - https://www.inpit.go.jp/j-platpat_info/lecture/qa.html

## 1の追加確認：音・音楽と取得不能ページの再確認

- 事実：OpenGameArt FAQは末尾スラッシュを付けたURLで読めた。投稿ごとのライセンスを守れば商用可、CC0は再配布・表示不要。当初の403をもってサイト全体を未確認とした判断を更新する。個別の雪足音ページは引き続き未取得。
  - https://opengameart.org/content/faq/
- 事実：Freesoundでfleurescenceのsnowboard straps 6.wav、CC0、0.515秒を確認。試聴は未実施。
  - https://freesound.org/people/fleurescence/sounds/573139/
- 事実：Pixabayでは滑雪・雪上足音・吹雪・そり滑走の掲載を確認。素材同梱不可という判断は変わらない。雪への着地に一致する音は未確認。
  - https://pixabay.com/sound-effects/search/snow/
  - https://pixabay.com/sound-effects/search/skiing/
  - https://pixabay.com/sound-effects/nature-wind-during-snow-storm-2-17562/
- 事実：Kenney Music Jinglesは85点・CC0。FreePD.comは閉鎖告知があり現行入手先から外す。
  - https://kenney.nl/assets/music-jingles
  - https://freepd.com/
- 事実：Adobe一般規約3.6はContent Filesの単体再配布を禁止。Mixamoの公開リポジトリ同梱不可の判断を規約本文でも裏づけた。コミュニティFAQは補助資料として扱う。
  - https://www.adobe.com/legal/terms.html
- 事実：Frame（利用先サービス）はReady Player Meの2026-01-31終了を告知。当事者Ready Player Me自身の原文は未確認。新規採用しない提案とする。
  - https://learn.framevr.io/blog/rpm-closure

## 3・5. 実在地名・装備：一般整理完了

- 解釈：自然地形や地名と、他人のコース図・3Dモデル・写真の表現は区別する。DEM利用許諾から施設ロゴ・ブランド・図面の許諾まで得たとは扱わない。
- 事実：CC0原文は商標・特許などを放棄対象に含めず、CC BYも商標等の権利を付与しない。
  - https://creativecommons.org/publicdomain/zero/1.0/legalcode.en
  - https://creativecommons.org/licenses/by/4.0/legalcode.en
- 提案：装備は汎用の機能・寸法から独自に作り、ロゴ・製品名・特徴的なグラフィック・特定製品の意匠を写さない。一般的な板形状全体が禁止という意味ではない。既製モデルのロゴ削除だけで権利処理完了とはしない。

## 調査方法の記録

- Web検索クエリ35件。独立した規約ページを開き、検索結果だけの情報は未確認に区分。ブラウザ起動・サーバー起動・素材ダウンロードはしていない。
- 残件：JAXA現行規約本文、Copernicus GLO-90の固有規約、CMU、Rokoko素材規約、Ready Player Me当事者原文、BBC RemArc原文、オーストリア対象タイル、NASADEM個別メタデータ。

## 最終点検

- GSIの現行採用規約PDL1.0原文も確認。複製・公衆送信・加工・商用利用と、出典・加工主体の表示を確認した。
  - https://www.digital.go.jp/resources/open_data/public_data_license_v1.0
- MakeHuman公式LICENSE原文で、コードはAGPL、コア素材はCC0、出力はコア素材と創作の組合せと説明されることを確認。
  - https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.md
- INPIT現行マニュアル第7章を開いた。SkiFreeは作者公式で存在確認し報告へ追加。
  - https://www.inpit.go.jp/content/100888006.pdf
  - https://ski.ihoc.net/
- natural-japaneseのlintはsudachipy不足で実行不可。依存追加はせず、手動チェックリストで常套句・翻訳調・構造・出典との対応を目視確認。事実／解釈／提案の反復は権利判断の区別に必要なので残した。
- 最終報告は250行以内。出典一覧を可視のURL一覧にし、本文からも直接参照できるようにした。未確認先は確認済み出典から分離した。
