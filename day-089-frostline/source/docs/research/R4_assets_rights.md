# R4 素材・標高データ・名称の権利調査

確認日：2026-11-10。対象：three.jsの無料公開Webゲームと、素材を含む公開GitHubリポジトリ。法的助言ではなく採用判断のための整理。
凡例：**事実**＝開いた規約本文・一次資料の記述、**解釈**＝本件への当てはめ、**提案**＝採用方針。未確認を許可と扱わない。表の同梱判断は解釈を含む。

## 1. 結論

- **提案：自作＋作者の公式配布CC0を基本にする。** 雪・岩・HDRIはPoly Haven／ambientCG、人物はMPFBまたはQuaternius、音は自録音・Freesound CC0が第一候補。[A1](https://polyhaven.com/license)[A2](https://docs.ambientcg.com/license/)[A4](https://quaternius.com/packs/universalbasecharacters.html)[A5](https://quaternius.com/packs/universalanimationlibrary.html)[A12b](https://freesound.org/help/faq/)[A16](https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html)
- **提案：日本の山は国土地理院の標高タイルを第一候補にする。** DEM本体と手続が異なり、標高タイルは出典表示で申請不要の区分。加工表示を添えて高さデータを配布する。[D1](https://maps.gsi.go.jp/development/ichiran.html)[D2](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)[D3](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0)
- 海外の詳細地形はswissALTI3Dの通常OGD、米国ならUSGS 3DEP 1mを優先する。[D7](https://www.swisstopo.admin.ch/en/height-model-swissalti3d)[D8](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices)[D12](https://www.usgs.gov/faqs/what-types-elevation-datasets-are-available-what-formats-do-they-come-and-where-can-i-download)[D13](https://catalog.data.gov/dataset/1-3rd-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-co)
- Mixamo、Fab Standard／旧Megascans、Sonniss、Pixabay、Zapsplatは、ゲーム利用可でも素材ファイルの公開同梱には向かない。[A8](https://www.fab.com/eula?lang=en)[A9](https://dev.epicgames.com/documentation/fab/licenses-and-pricing-in-fab)[A10](https://www.unrealengine.com/eula/content)[A17](https://sonniss.com/gdc-bundle-license/)[A18](https://pixabay.com/service/terms/)[A19](https://www.zapsplat.com/license-type/standard-license/)
- CC BYは著作者・出典・ライセンス・変更表示を整えれば候補。コードのライセンスに素材まで一括で含めない。[A6](https://creativecommons.org/licenses/by/4.0/legalcode.en)
- **「雪線」は同ジャンルの衝突候補あり。** 作者サイトでYuki Lineを確認、日本語「雪線 Yuki Line」は検索結果のみ。SESSEN完全一致のゲームは今回未発見だが商標調査は別途必要。[N1](https://mitchellhanson.com/)
- Ready Player Meは利用先サービスが2026-01-31終了を告知。新規採用しない。[A14](https://learn.framevr.io/blog/rpm-closure)

## 2. 素材は「商用可」と「ファイル再配布可」を分ける

事実：CC0は著作権等を可能な限り放棄するが商標・特許等は対象外。CC BY 4.0も商標等を許諾しない。無料公開・ロゴ削除・形式変換だけで第三者の権利が消えるわけではない。[A6](https://creativecommons.org/licenses/by/4.0/legalcode.en)[A7](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)
以下の「可」は、その配布物に記載されたライセンスと、投稿者が権利を持つ部分が対象。「条件つき・未確認」は同梱を保留する意味で、許可確認済みではない。

| 入手先 | 種類 | ライセンス・商用 | 公開リポジトリ同梱 | クレジット | 注意・生成AI条項 |
|---|---|---|---|---|---|
| Poly Haven [A1](https://polyhaven.com/license) | テクスチャ・HDRI・3D | CC0／商用可 | 可 | 不要 | 素材は再配布可。サイト本文・ロゴ・利用者のレンダーは別。素材にAI用途の追加禁止なし、サイトの無許可スクレイピングは禁止 |
| ambientCG [A2](https://docs.ambientcg.com/license/) | PBR・HDRI等 | CC0／商用可 | 可 | 不要 | rawファイル同梱を明示。確認した素材ライセンスに追加AI禁止なし |
| Kenney [A3](https://kenney.nl/support) | 3D・ゲーム素材・音 | CC0／商用可 | 可 | 不要 | asset pagesの素材が対象。Kenneyロゴは公式作品専用。確認資料に追加AI禁止なし |
| Quaternius [A4](https://quaternius.com/packs/universalbasecharacters.html)[A5](https://quaternius.com/packs/universalanimationlibrary.html) | Universal Base Characters／Universal Animation Library | 商品ページはCC0／商用可 | 可 | CC0では不要 | 無料版とSource版で収録範囲が違う。購入時も対象ファイルのLICENSE確認。確認資料に追加AI禁止なし |
| Sketchfab CC0 [A7](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)[A11](https://sketchfab.com/blogs/community/restricting-generative-ai-use-of-free-models/) | 投稿3D | 各作品のCC0／商用可 | 可 | 不要 | 個別作品未選定。NoAI付きは方針で除外。実在ブランド・無断転載を避ける |
| Sketchfab CC BY [A6](https://creativecommons.org/licenses/by/4.0/legalcode.en)[A11](https://sketchfab.com/blogs/community/restricting-generative-ai-use-of-free-models/) | 投稿3D | 各作品のCC BY／商用可 | 条件つき | 必要 | バージョンごとの原文、著作者・権利表示・元URL・変更・ライセンスを保持。NoAI付き除外 |
| OpenGameArt [A15](https://opengameart.org/content/faq/) | 3D・画像・音楽・音 | 投稿ごとCC0／BY／SA／GPL等。商用も条件次第 | 条件つき | CC0不要、他は条件次第 | 本件はCC0優先。SA・GPLを一律採用しない。FAQに追加AI禁止は確認できず、個別投稿は未確認 |
| Fab Standard [A8](https://www.fab.com/eula?lang=en)[A9](https://dev.epicgames.com/documentation/fab/licenses-and-pricing-in-fab) | 3D・PBR等 | 独自／公式要約は商用可 | 不可（raw素材） | 要約では不要 | 任意の互換ツール可、UE限定ではない。Web完成品は組込み条件次第。本文未取得、NoAIは生成AI収集禁止の表示 |
| Fab CC BY [A6](https://creativecommons.org/licenses/by/4.0/legalcode.en)[A9](https://dev.epicgames.com/documentation/fab/licenses-and-pricing-in-fab) | 3D等 | CC BY／商用可 | 条件つき | 必要 | Standardとは別。FabではCC BYとNoAIの併用不可と公式説明 |
| 旧Quixel Megascans [A10](https://www.unrealengine.com/eula/content) | スキャンPBR・3D | 取得時プランによる | 不可（raw素材） | 取得契約確認 | 旧UEプランはUE-Onlyでthree.js不可。旧Personal/Indieは条件内で他ツール可。無プランFreeは内部評価のみ。Fabで得た権利と混同しない。NoAIはAI入力も禁止 |
| Mixamo [A12](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)[A13](https://www.adobe.com/legal/terms.html)[A25](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400?lang=en) | 人物・モーション | Adobe独自／商用ゲーム可 | 不可（人物・動作ファイル） | 補助FAQは不要と説明 | 一般規約3.6は素材単体配布不可。GLB変換で解決しない。AI/ML訓練禁止はCommunity FAQの説明で、Mixamo固有の現行条文との照合は未確認 |
| Ready Player Me [A14](https://learn.framevr.io/blog/rpm-closure) | アバター | 現行規約未確認 | 条件つき・未確認 | 未確認 | Frameが終了を告知。当事者規約・既存GLBの再配布権は未確認。取得済みでもCC0と扱わない |
| MakeHuman／MPFB [A16](https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html)[A23](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.md) | 自作人物出力 | コア素材CC0／商用可 | 可（コア素材からの出力） | CC0では不要 | 追加の服・髪・肌は別LICENSE。ソフト本体のAGPL等と出力を区別。CC0部分に追加AI禁止なし |
| Rokoko Motion Library [A22](https://support.rokoko.com/hc/en-us/articles/4410021327121-Getting-Started-Rokoko-Studio-Motion-Library) | 動作FBX | 現行素材規約未確認 | 条件つき・未確認 | 未確認 | 公式ヘルプは購入・チーム共有を説明するが公衆への再配布許諾ではない。AI条件も未確認 |
| CMU Motion Capture Database | 動作 | 原文未取得 | 条件つき・未確認 | 未確認 | 商用可という評判だけで採用しない。素材販売・再配布・変換版の扱いを原文確認してから使う |
| Freesound CC0のみ [A7](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)[A12b](https://freesound.org/help/faq/) | 効果音 | 各音CC0／商用可 | 可 | 不要 | 2026年7月追加の生成AI訓練の投稿者設定がある。CC条件とは別の希望・設定として説明されている。今回AI訓練はしない |
| Sonniss GDC [A17](https://sonniss.com/gdc-bundle-license/) | 効果音 | 独自／商用可 | 不可（素材ファイル） | 不要 | 加工済み音も素材としての再配布禁止。チーム共有・完成作品への組込みは可。AI開発・訓練等は禁止 |
| Pixabay [A18](https://pixabay.com/service/terms/) | 効果音・音楽 | Content License／商用可、例外あり | 不可（未加工の音等） | 不要 | 単体配布禁止。CC0と同義でない。投稿者→運営の機械学習利用許諾とオプトアウト規定あり。一般利用者への無条件AI許諾とは読まない |
| Zapsplat [A19](https://www.zapsplat.com/license-type/standard-license/) | 効果音・音楽 | Standard／商用可 | 不可（素材ファイル） | Basic必要、Premium不要 | 完成作品への埋込み可。素材譲渡・再配布とAI/ML訓練禁止。Premium中に取得した音は表示不要が継続 |
| BBC Sound Effects [A20](https://sound-effects.bbcrewind.co.uk/licensing) | 効果音 | 個人・教育利用の案内。RemArc原文未取得 | 条件つき・未確認（採用保留） | 未確認 | 商用は別ライセンス確認。個人事業の公開ゲームをpersonal利用と決めつけない。AI条件・raw再配布も未確認 |

**解釈：Web配信とGitHubの両方が配布になる。** 別CDN、圧縮、GLB／Ogg変換、リポジトリ内の別フォルダ化だけでは、禁止素材の再配布条件を解消しない。Fab等の「完成作品に不可分に組み込む」条件は、URLから素材を個別取得できるthree.jsで特に判断が必要。[A8](https://www.fab.com/eula?lang=en)[A10](https://www.unrealengine.com/eula/content)[A13](https://www.adobe.com/legal/terms.html)[A17](https://sonniss.com/gdc-bundle-license/)
**提案：** 素材台帳に作者・個別URL・取得日・LICENSE版・改変内容を残し、ゲームのクレジットとリポジトリの素材ライセンス一覧から参照させる。CC BYは既存の著作権表示・免責も保持する。NoAI素材をAIへ渡して加工しない。

### 滑走モーション・雪の音をどこまで確認できたか

| 必要素材 | 原文・掲載確認 | 本件での扱い |
|---|---|---|
| 人物の基本動作 | Quaternius UALは120以上、8方向移動・走行・泳ぎ等 [A5](https://quaternius.com/packs/universalanimationlibrary.html) | スキー／スノーボード専用動作の収録は未確認。曲がる姿勢・板を履く動作・着地は自作を前提にする |
| Mixamo／Rokoko／CMUの滑走 | 対象クリップの一覧・権利の組合せを未確認 | 「専用動作あり」とは断定しない。参考映像から動作を自作する場合も映像自体は同梱しない |
| ビンディング | Freesound「snowboard straps 6.wav」、fleurescence、CC0、0.515秒 [S1](https://freesound.org/people/fleurescence/sounds/573139/) | 同梱候補。ストラップ音であり、スキーのステップイン音と同じではない |
| 雪を削る・滑る | Pixabayにそり滑走録音、skiingの一覧あり [S2](https://pixabay.com/sound-effects/search/snow/)[S4](https://pixabay.com/sound-effects/search/skiing/) | 存在確認のみ。スキーのエッジ削雪音の代用可否・音質は未試聴。公開素材同梱には採用しない |
| 風・雪上足音 | Pixabay個別ページで吹雪・雪上足音を確認 [S3](https://pixabay.com/sound-effects/nature-wind-during-snow-storm-2-17562/)[S5](https://pixabay.com/sound-effects/nature-footsteps-in-the-snow-499652/) | 同梱しない。Freesound CC0で同等品を探すか自録音する提案 |
| 雪への着地 | 条件に合う個別録音は未確認 | 自録音の雪への踏込み・布擦れ等を重ねる提案。Sonniss／BBC／Zapsplatの必要音の個別収録も未確認 |

音楽候補は、自作、Kenney「Music Jingles」（85点・CC0、短い場面転換用）、FreesoundのCC0音楽、OpenGameArtのCC0曲。曲ごとに権利を確認し、ループ素材の原権利も見る。FreePD.comは閉鎖告知があるため現行候補から外す。[A15](https://opengameart.org/content/faq/)[A21](https://kenney.nl/assets/music-jingles)[A24](https://freepd.com/)

## 3. 地形は公開高さデータの条件まで確認する

DEM＝標高の格子データ。DTM＝地面、DSM＝建物・樹木等を含む表面。30mを1mに補間しても1mの実測精度にはならない。以下は高さデータの切出し・加工・ゲーム配布を想定した判断で、航空写真や地図画像の許諾とは別。[D7](https://www.swisstopo.admin.ch/en/height-model-swissalti3d)[D12](https://www.usgs.gov/faqs/what-types-elevation-datasets-are-available-what-formats-do-they-come-and-where-can-i-download)[D16](https://copernicus-dem-30m.s3.amazonaws.com/readme.html)

| 提供元・製品 | 解像度・地域 | ライセンス／商用 | 加工高さデータの再配布 | クレジットの書き方 | 申請・登録 |
|---|---|---|---|---|---|
| GSI 標高タイル [D1](https://maps.gsi.go.jp/development/ichiran.html)[D2](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)[D3](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0) | 元DEM 5m・10m、現在1m系も一部。国内、範囲別 | PDL1.0＋GSI重要情報／商用可 | 可、出典・加工表示。タイルは平滑化値 | 「地理院タイル（標高タイル）を加工して作成：制作名」＋元URL | 一覧の区分2で測量法承認不要。静的配布もこの区分・規約で判断 |
| GSI 基盤地図情報DEM 5m [D4](https://www.gsi.go.jp/LAW/2930-index.html)[D5](https://www.gsi.go.jp/LAW/2930-qa.html)[D6](https://www.gsi.go.jp/LAW/2930-sample.html) | 国内整備域、全国一律5mではない | 同上＋測量法 | 条件つき。成果物の性質により承認 | 「基盤地図情報 数値標高モデル（国土地理院）を加工して作成」＋URL。承認時は指定の承認表示 | ダウンロード登録と法29/30条の承認を区別。下記参照 |
| GSI 基盤地図情報DEM 10m [D4](https://www.gsi.go.jp/LAW/2930-index.html)[D5](https://www.gsi.go.jp/LAW/2930-qa.html)[D6](https://www.gsi.go.jp/LAW/2930-sample.html) | 国内全国を基本 | 同上＋測量法 | 条件つき。5mと同様 | 上と同様 | 上と同様 |
| JAXA AW3D30 [D9](https://www.eorc.jaxa.jp/ALOS/jp/dataset/aw3d30/aw3d30_j.htm) | 約30m、全球。日本・南極等で版が異なるDSM | 商品ページは商用可、現行規約本文未取得 | **未確認**。加工データ配布を保留 | そのままの画像は©JAXAと公式指定。加工高さデータの指定は未確認 | 公式直接取得はユーザー登録・条件同意。再配布の追加手続未確認 |
| Copernicus GLO-30 [D10](https://docs.sentinel-hub.com/api/latest/static/files/data/dem/resources/license/License-COPDEM-30.pdf)[D16](https://copernicus-dem-30m.s3.amazonaws.com/readme.html) | 約30m、全球陸域だが公開版に一部未公開域。DSM | 固有の無償ライセンス／商用利用を排除せず | 可。4条で配布・加工を明記 | 6条(b)の加工用指定文＋6条(c)の免責文。下記参照 | 規約同意。別途許諾申請は規定なし、取得経路の登録は別 |
| Copernicus GLO-90 [D16](https://copernicus-dem-30m.s3.amazonaws.com/readme.html) | 約90m、全球陸域DSM | 配布元は固有ライセンスを案内 | **未確認**。GLO-30原文を90へ流用しない | 製品固有の指定文を再確認 | 経路の登録・同意条件と固有規約を再確認 |
| NASA SRTM GL1 [D11](https://portal.opentopography.org/raster?opentopoID=OTSRTM.082015.4326.1)[D15](https://science.data.nasa.gov/about/license) | 1秒角・約30m。準全球、厳密な緯度端は今回原文未確認 | NASA一般方針は別指定なしならCC0。OT個別欄はNot Provided | 条件つき。NASA一般方針の適用と配布ファイルの別指定を照合 | 推奨例「NASA／NGA SRTMGL1 v003」、DOI。OT経由ならOTも | Earthdata等の経路登録は別。一般方針上の利用許可申請不要 |
| NASADEM [D15](https://science.data.nasa.gov/about/license) | 約30m・SRTM再処理という仕様は今回個別原文未確認 | NASA一般方針は上記。製品メタデータ未取得 | **未確認**。個別条件を保留 | 提案例「NASA JPL, NASADEM_HGT v001」＋実際の製品DOIを照合 | 経路登録と個別条件は未確認 |
| USGS 3DEP [D12](https://www.usgs.gov/faqs/what-types-elevation-datasets-are-available-what-formats-do-they-come-and-where-can-i-download)[D13](https://catalog.data.gov/dataset/1-3rd-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-co) | 米国・領土。1m LiDAR DTMは取得済み地域、他に約10m/30m等 | public domain／商用可 | 可 | 義務は確認されず、推奨「USGS 3DEP、製品・地域・年」＋元URL | The National Mapは登録不要・無料。別途利用申請不要 |
| swisstopo swissALTI3D [D7](https://www.swisstopo.admin.ch/en/height-model-swissalti3d)[D8](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices) | 0.5m／2m、スイスDTM。高山は元データの精度が異なる | OGD独自規約／商用可 | 可、加工・配布を明記 | ©swisstopo、または規約列挙の正式組織名 | 通常OGDは別途申請不要。**Sample dataは試験専用・製品組込み禁止** |
| Kartverket DTM1 [D14](https://www.kartverket.no/api-og-data/vilkar-for-bruk)[D17](https://data.norge.no/en/data-services/df1adc4b-7575-351a-b9d4-4891decc8b16/dtm1-atom-feed-tjeneste) | 1m、ノルウェーの当該整備域 | CC BY 4.0／商用可 | 可、表示条件つき | © Kartverket＋リンク、CC BY 4.0、加工表示 | 開放対象は別途申請不要。個別点群の制限・他機関データは別確認 |
| オーストリアのDGM | 州別。10m等の候補は検索で見つかったが原文未確認 | **未確認** | **未確認** | 対象州・版の指定を確認 | 全国一律の条件と扱わず、州のカタログ原文確認後に判断 |
| IGN RGE ALTI [D18](https://www.data.gouv.fr/datasets/referentiel-a-grande-echelle-rge)[D19](https://github.com/etalab/licence-ouverte/blob/master/LO.md)[D20](https://cis2.eea.europa.eu/data/900/) | 1m／5m、フランス本土と一部海外領土、対象範囲確認 | Licence Ouverte 2.0／商用可 | 可、加工・再配布を明記 | 「Source : IGN, RGE ALTI, 更新日」＋URL。日付は使用データの更新日 | ライセンス内の利用は別途申請不要。Webサービス登録は別 |
| OpenTopography [D11](https://portal.opentopography.org/raster?opentopoID=OTSRTM.082015.4326.1)[D21](https://opentopography.org/usageterms) | 元製品による | 元データの個別条件を適用 | 条件つき。OTの表示が元ライセンスを置換しない | 元データ指定引用・DOI＋OpenTopography経由である旨 | 一部サービスは登録・APIキー・利用枠制限。鍵を公開Webアプリに埋め込まない |

**GSIの事実と解釈：** 現行GSI規約は2025-11-20改正でPDL1.0を採用。標高タイルは一覧の「基本測量成果以外・出典のみ」区分にあり、規約自身も加工表示例を示す。したがって日本用はこの経路を選ぶ。PNGを数値として扱い、テキスト形式は2024年10月から更新停止という注意にも従う。[D1](https://maps.gsi.go.jp/development/ichiran.html)[D2](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)[D3](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0)
基盤地図情報のDEM本体は基本測量成果。事実として、内部利用・デザイン等には申請不要例があり、GSIサーバーのリアルタイム表示も出典のみで可。一方、座標付きデータ同梱配布は複製、別種の測量成果の作成は使用の承認対象となる例がある。29条／30条を「加工したかどうか」だけで決めない。[D4](https://www.gsi.go.jp/LAW/2930-index.html)[D5](https://www.gsi.go.jp/LAW/2930-qa.html)[D6](https://www.gsi.go.jp/LAW/2930-sample.html)
**解釈：** ゲーム用の非測量的な表現だけならデザイン利用の余地があるが、実在座標に戻せる高さ配列の公開配布まで自動的に免除と断定できない。DEM本体を使う場合は、データ形式・保持座標・加工内容・GitHub配布を示してGSIの利用手続ナビ／窓口で要否を確認する。承認不要の標高タイルの条件と混同しない。
**Copernicusの表示：** GLO-30加工版は6条(b)の「produced using Copernicus WorldDEM-30」で始まる全文を採用する。続くDLR e.V.の2010–2014、Airbus Defence and Space GmbHの2014–2018、EU・ESAによるCOPERNICUS提供、権利留保を省略しない。6条(c)の利用責任を負わない旨も同梱する。原データの配布には6条(a)の別文を使う。正確な全文は原文の該当箇所から取得する。[D10](https://docs.sentinel-hub.com/api/latest/static/files/data/dem/resources/license/License-COPDEM-30.pdf)
**提案：** 日本＝GSI標高タイル、スイス＝swissALTI3D通常配布、米国＝3DEP。広域背景はGLO-30。滑走面の細かな雪・凹凸は自作し、実測と創作を説明する。地形データのLICENSE・加工履歴はコードと分けて残す。

## 4. 実在名称の利用と「雪線 SESSEN」の確認

**一般整理・解釈：** 自然の山の形や地名という事実を表現することと、他人の地図・写真・コース図の表現を複製することは別。地名の記載だけを一律禁止と考える必要はないが、ゲーム名・ロゴ・販売表示として使う場合は商標・混同を別途確認する。DEMの利用許諾はスキー場の名称・ロゴやコース図の許諾まで含まない。[A6](https://creativecommons.org/licenses/by/4.0/legalcode.en)[A7](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)[D3](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0)
**提案：** 実在山を採用しても、スキー場ロゴ・マスコット・公式コース図・パンフレットは流用しない。コースの事実情報を用いる場合は適法な元データから独自に描き、図のレイアウト・イラストをトレースしない。「公式」「公認」や提携を誤認させる表示を避ける。現地撮影や録音は施設の撮影・立入条件を別に確認する。

### 既存名称の避けたい例

| 分類 | 確認できた既存名称・シリーズ | 根拠 |
|---|---|---|
| 同じ方向の現代作品 | Steep、Riders Republic、Shredders、Grand Mountain Adventure | 開いた公式製品ページ [N2](https://www.ubisoft.com/en-us/games/steep)[N3](https://www.ubisoft.com/en-us/game/riders-republic)[N4](https://i-illusions.com/games/shredders)[N5](https://www.toppluva.com/GrandMountainAdventure/index.html) |
| 長期シリーズ等 | SSX／SSX Tricky／SSX 3、1080° Snowboarding／1080° Avalanche、Amped、Cool Boarders、Snowboard Kids、Shaun White Snowboarding | SSXは公式、他は開いた作品一覧による二次確認 [N6](https://www.ea.com/games/ssx)[N7](https://en.wikipedia.org/wiki/List_of_snowboarding_video_games) |
| その他 | SkiFree、SNOW、The Snowboard Game、Steep Slope Sliders、We Ski & Snowboard | SkiFreeは作者公式、他は開いた作品一覧による二次確認。網羅的な権利調査ではない [N7](https://en.wikipedia.org/wiki/List_of_snowboarding_video_games)[N10](https://ski.ihoc.net/) |
| 本仮称の衝突候補 | Yuki Line | 作者Mitch Hansonのサイトにブラウザ用スノーボードゲームとして掲載 [N1](https://mitchellhanson.com/) |

**事実：** Web検索で「雪線 Yuki Line」という表示を発見し、作者の英語サイトでYuki Lineの存在と内容を確認した。日本語ページは取得できず、**漢字名の原文確認は未了**。SESSEN／雪線とgame・ゲーム・service・サービス等を組み合わせた検索では、SESSEN完全一致の同ジャンル作品は確認できなかった。検索で見えた他業種の社名等は一次確認できず、本件の衝突を断定しない。
**提案：** 「雪線」単独は採用を保留し、SESSEN併記でも混同の解消を保証しないと考える。読み・綴りを含む別候補も用意する。今回、J-PlatPatで出願・登録の検索実行はしていない。

### 日本の商標を調べる手順

1. J-PlatPatの「商標」→「商標検索」で、出願・登録情報を対象にする。文字検索に「雪線」「SESSEN」「セッセン」、空白・大小文字等の表記違いも入れる。まず区分で絞りすぎない。[N8](https://www.inpit.go.jp/j-platpat_info/lecture/qa.html)[N9](https://www.inpit.go.jp/j-platpat_info/reference/index.html)
2. 「称呼（単純文字列検索）」に全角カタカナの「セッセン」、次に「称呼（類似検索）」を使う。必要なら「セツセン」等の読み違いも試す。文字検索・称呼検索を片方だけで済ませない。[N8](https://www.inpit.go.jp/j-platpat_info/lecture/qa.html)[N11](https://www.inpit.go.jp/content/100888006.pdf)
3. **提案する調査区分：第9類（ダウンロード可能なゲームソフト等）、第41類（オンラインゲーム提供等）**。SaaS等へ拡張するなら42類も検討。商品・役務名検索で正確な表示と類似群コードを選ぶ。区分番号だけで権利範囲を判断しない。[N8](https://www.inpit.go.jp/j-platpat_info/lecture/qa.html)[N9](https://www.inpit.go.jp/j-platpat_info/reference/index.html)
4. 類似群コード、指定商品・役務、権利者、出願日、存続・審査状態、経過情報を読む。ロゴ案が決まったら図形も検索する。類似検索のヒットは法的に類似との判定ではなく、不検出も安全の保証ではない。[N8](https://www.inpit.go.jp/j-platpat_info/lecture/qa.html)

区分への当てはめは提案であり、2026年版の商品・役務分類の該当項目本文は今回取得できていない。確定前に現行分類と実際の提供方法を照合する。

## 5. 装備は機能を参考に独自の外観で作る

**提案：** 板・ビンディング・ブーツ・ヘルメット・ゴーグル・ウェアは、一般的な構造・装着関係から自作し、実在ブランドのロゴ・型番・製品名・特徴的な柄を入れない。板のグラフィック、ゴーグルのストラップ柄、服の大きな切替模様まで独自にする。
**解釈：** ロゴのない写実モデルでも、特定製品の特徴的な意匠・立体商標・無断スキャンの権利は残り得る。写真1枚や市販CADの丸写しを避け、ブランドのない汎用形状へ設計し直す。CC0／CC BYだけでは商標・意匠等の第三者権利を処理できない。[A6](https://creativecommons.org/licenses/by/4.0/legalcode.en)[A7](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)
**提案：** 実在ライダーの顔・名前・特徴的な衣装も無断で再現せず、架空人物にする。共同制作者からはゲーム利用とモデル再配布の範囲を記録して受領する。

## 6. 未確認事項は採用前に本人が原文で照合する

- Fabは公式要約とライセンス案内を確認したがEULA本文は抽出できず、Webで個別取得可能な素材の配信条件は確定していない。旧Megascansは取得日・契約プラン・再取得の権利を照合する。
- Rokokoの素材ライセンス、CMUの商用・再配布条件、BBC RemArcの原文、Ready Player Me当事者の終了・取得済みアバター規約は未確認。保留は利用禁止を断定する意味ではない。
- AW3D30の現行規約リンク先は本文を取得できず、加工高さデータの再配布を確認できなかった。GLO-90固有規約、NASADEM個別メタデータ、オーストリア対象製品も保留。GLO-30・NASA一般方針を自動流用しない。
- 「雪線」の日本語原文、SESSEN類似の全サービス、商標登録状況、意匠登録状況、対象国ごとの権利は未調査・未確定。名称は検索だけで確定しない。
- 素材の試聴・ダウンロード・現物LICENSE照合・不正転載の鑑定は未実施。滑走動作・削雪・着地音の品質と適合性は保証していない。規約に追加AI禁止が見えないことを、他人の全権利の許諾と扱わない。
- 方法：Web検索35クエリ、規約・公式説明を直接開き、取得失敗は再探索後に未確認とした。検索結果だけの情報は確認済み出典にしない。ブラウザ・ローカルサーバー・Git操作は行っていない。

## 7. 出典一覧

以下は実際に本文を開いた資料。すべて確認日 **2026-11-10**。公式説明・補助FAQ・二次資料を区別して使用した。取得不能URLは末尾の「再確認先」に分離する。

- A1 — Poly Haven素材ライセンス・サイト規約（2026-11-10）：<https://polyhaven.com/license>
- A2 — ambientCG素材ライセンス（2026-11-10）：<https://docs.ambientcg.com/license/>
- A3 — Kenney公式FAQ（2026-11-10）：<https://kenney.nl/support>
- A4 — Quaternius人物商品ページ（2026-11-10）：<https://quaternius.com/packs/universalbasecharacters.html>
- A5 — Quaternius動作商品ページ（2026-11-10）：<https://quaternius.com/packs/universalanimationlibrary.html>
- A6 — CC BY 4.0原文（2026-11-10）：<https://creativecommons.org/licenses/by/4.0/legalcode.en>
- A7 — CC0原文（2026-11-10）：<https://creativecommons.org/publicdomain/zero/1.0/legalcode.en>
- A8 — Fab公式要約のみ取得（2026-11-10）：<https://www.fab.com/eula?lang=en>
- A9 — Fab公式ライセンス案内（2026-11-10）：<https://dev.epicgames.com/documentation/fab/licenses-and-pricing-in-fab>
- A10 — Epic Content License・Megascans Addendum原文（2026-11-10）：<https://www.unrealengine.com/eula/content>
- A11 — Sketchfab公式NoAI説明（2026-11-10）：<https://sketchfab.com/blogs/community/restricting-generative-ai-use-of-free-models/>
- A12 — Adobe公式Mixamo FAQ（2026-11-10）：<https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>
- A12b — Freesound公式FAQ・生成AI設定（2026-11-10）：<https://freesound.org/help/faq/>
- A13 — Adobe一般規約3.6（2026-11-10）：<https://www.adobe.com/legal/terms.html>
- A14 — 利用先FrameによるRPM終了告知。当事者告知ではない（2026-11-10）：<https://learn.framevr.io/blog/rpm-closure>
- A15 — OpenGameArt公式FAQ（2026-11-10）：<https://opengameart.org/content/faq/>
- A16 — MPFB公式CC0説明（2026-11-10）：<https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html>
- A17 — Sonniss GDCライセンス原文（2026-11-10）：<https://sonniss.com/gdc-bundle-license/>
- A18 — Pixabay利用規約原文（2026-11-10）：<https://pixabay.com/service/terms/>
- A19 — Zapsplat Standard原文・2026-05-08版（2026-11-10）：<https://www.zapsplat.com/license-type/standard-license/>
- A20 — BBC案内のみ取得、規約本文未取得（2026-11-10）：<https://sound-effects.bbcrewind.co.uk/licensing>
- A21 — Kenney音楽商品ページ（2026-11-10）：<https://kenney.nl/assets/music-jingles>
- A22 — Rokoko公式操作説明、ライセンス原文ではない（2026-11-10）：<https://support.rokoko.com/hc/en-us/articles/4410021327121-Getting-Started-Rokoko-Studio-Motion-Library>
- A23 — MakeHuman公式ライセンス構成・出力説明（2026-11-10）：<https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.md>
- A24 — FreePD公式閉鎖告知（2026-11-10）：<https://freepd.com/>
- A25 — Adobe Community掲載補助FAQ、規約本文ではない（2026-11-10）：<https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400?lang=en>
- S1 — CC0ストラップ音（2026-11-10）：<https://freesound.org/people/fleurescence/sounds/573139/>
- S2 — Pixabay雪音の掲載一覧（2026-11-10）：<https://pixabay.com/sound-effects/search/snow/>
- S3 — Pixabay吹雪音（2026-11-10）：<https://pixabay.com/sound-effects/nature-wind-during-snow-storm-2-17562/>
- S4 — Pixabay滑雪音の掲載一覧（2026-11-10）：<https://pixabay.com/sound-effects/search/skiing/>
- S5 — Pixabay雪上足音（2026-11-10）：<https://pixabay.com/sound-effects/nature-footsteps-in-the-snow-499652/>
- D1 — GSIタイル一覧・区分2・標高タイル詳細（2026-11-10）：<https://maps.gsi.go.jp/development/ichiran.html>
- D2 — GSIコンテンツ利用規約（2026-11-10）：<https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html>
- D3 — PDL1.0原文（2026-11-10）：<https://www.digital.go.jp/resources/open_data/public_data_license_v1.0>
- D4 — GSI利用手続（2026-11-10）：<https://www.gsi.go.jp/LAW/2930-index.html>
- D5 — GSI承認申請Q&A（2026-11-10）：<https://www.gsi.go.jp/LAW/2930-qa.html>
- D6 — GSI複製・使用の事例（2026-11-10）：<https://www.gsi.go.jp/LAW/2930-sample.html>
- D7 — swissALTI3D仕様・サンプル制限（2026-11-10）：<https://www.swisstopo.admin.ch/en/height-model-swissalti3d>
- D8 — swisstopo OGD規約原文（2026-11-10）：<https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices>
- D9 — JAXA仕様・利用案内。リンク先本文未取得（2026-11-10）：<https://www.eorc.jaxa.jp/ALOS/jp/dataset/aw3d30/aw3d30_j.htm>
- D10 — Copernicus GLO-30ライセンス原文、配布事業者掲載（2026-11-10）：<https://docs.sentinel-hub.com/api/latest/static/files/data/dem/resources/license/License-COPDEM-30.pdf>
- D11 — OpenTopography SRTM仕様・権利欄（2026-11-10）：<https://portal.opentopography.org/raster?opentopoID=OTSRTM.082015.4326.1>
- D12 — USGS解像度・取得案内（2026-11-10）：<https://www.usgs.gov/faqs/what-types-elevation-datasets-are-available-what-formats-do-they-come-and-where-can-i-download>
- D13 — USGS提供公式メタデータ・public domain（2026-11-10）：<https://catalog.data.gov/dataset/1-3rd-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-co>
- D14 — Kartverket開放データ規約（2026-11-10）：<https://www.kartverket.no/api-og-data/vilkar-for-bruk>
- D15 — NASA科学データ一般方針（2026-11-10）：<https://science.data.nasa.gov/about/license>
- D16 — 配布事業者によるGLO-30/90仕様（2026-11-10）：<https://copernicus-dem-30m.s3.amazonaws.com/readme.html>
- D17 — ノルウェー政府カタログDTM1（2026-11-10）：<https://data.norge.no/en/data-services/df1adc4b-7575-351a-b9d4-4891decc8b16/dtm1-atom-feed-tjeneste>
- D18 — IGN公式カタログ・適用ライセンス（2026-11-10）：<https://www.data.gouv.fr/datasets/referentiel-a-grande-echelle-rge>
- D19 — Etalab Licence Ouverte 2.0原文（2026-11-10）：<https://github.com/etalab/licence-ouverte/blob/master/LO.md>
- D20 — EEAによるRGE ALTI仕様説明（2026-11-10）：<https://cis2.eea.europa.eu/data/900/>
- D21 — OpenTopography規約原文（2026-11-10）：<https://opentopography.org/usageterms>
- N1 — 作者公式Yuki Line紹介（2026-11-10）：<https://mitchellhanson.com/>
- N2 — Steep公式（2026-11-10）：<https://www.ubisoft.com/en-us/games/steep>
- N3 — Riders Republic公式（2026-11-10）：<https://www.ubisoft.com/en-us/game/riders-republic>
- N4 — Shredders公式（2026-11-10）：<https://i-illusions.com/games/shredders>
- N5 — Grand Mountain Adventure公式（2026-11-10）：<https://www.toppluva.com/GrandMountainAdventure/index.html>
- N6 — SSX公式（2026-11-10）：<https://www.ea.com/games/ssx>
- N7 — 既存作品一覧・二次資料（2026-11-10）：<https://en.wikipedia.org/wiki/List_of_snowboarding_video_games>
- N8 — INPIT公式検索手順・限界（2026-11-10）：<https://www.inpit.go.jp/j-platpat_info/lecture/qa.html>
- N9 — INPIT現行マニュアル案内（2026-11-10）：<https://www.inpit.go.jp/j-platpat_info/reference/index.html>
- N10 — SkiFree作者公式（2026-11-10）：<https://ski.ihoc.net/>
- N11 — INPIT 2026.06版マニュアル第7章、検索画面・操作を確認（2026-11-10）：<https://www.inpit.go.jp/content/100888006.pdf>

再確認先（以下は出典本文を確認できなかったもの、試行日2026-11-10）：JAXA現行規約 <https://earth.jaxa.jp/policy/ja.html>、CMU <https://mocap.cs.cmu.edu/>、Ready Player Me <https://readyplayer.me/>、NASADEM <https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001>、オーストリア州別候補 <https://www.data.gv.at/datasets/46a7a06a-f69b-405e-aac2-77f775449ad3?locale=de>、日本語名称候補 <https://mitchellhanson.com/ja/>。
