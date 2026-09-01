# 第三者データ・素材

このリポジトリで利用している第三者のデータ・素材について、各アプリ内のREADME、画面上の出典表示、生成ツールおよび `meta.json` に記録されている範囲をまとめます。各データ・素材には、下表のライセンスまたは利用規約が適用されます。

| Day | 使っているデータ・素材 | 提供元 | ライセンスまたは利用規約 | このリポジトリでの改変 |
|---|---|---|---|---|
| 004 | 奨学金の返還期間・割賦金、返還例、貸与月額の数値と制度上の事実 | [日本学生支援機構（JASSO）](https://www.jasso.go.jp/) | [JASSOホームページの著作権・使用条件](https://www.jasso.go.jp/faq/sonota/jasso/website/1190835_2814.html) | 数値と事実を計算ロジック、選択肢、説明に利用 |
| 008 | OpenStreetMapの日本国内の自動販売機ノード | [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)（Overpass API経由） | [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | 日本付近にクリップし、座標を丸め、重複を除き、自販機の種類をコード化して同梱JSONへ変換 |
| 009 | 秋田県内17事業者のGTFS-JP路線・停留所・時刻表と、秋田中央交通・秋田市のGTFS-RT車両位置 | 秋田県バス協会 公共交通オープンデータ、秋田中央交通、秋田市 | 路線データは [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)（GTFS-RTの利用範囲は[アプリREADME](apps/day-009-akita-bus-3d/README.md)に記録） | GTFS-JPから路線、停留所、時間帯別便数を抽出し、形状がない路線は停留所間を直線で近似。GTFS-RTは中継APIで必要項目だけのJSONへ変換 |
| 010 | Wikimedia EventStreams、各WikimediaプロジェクトのAction APIから得る記事名・編集要約・座標 | [Wikimediaプロジェクト](https://www.wikimedia.org/) | 記事名・編集要約は [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | 編集要約を短縮し、利用者名・IPとみられる文字列を伏せ字化。座標は地図上の表示と集計に利用 |
| 010 | 世界の国境データ（1:110m Admin 0 – Countries） | [Natural Earth](https://www.naturalearthdata.com/) | [パブリックドメイン](https://www.naturalearthdata.com/about/terms-of-use/) | 輪郭を間引き、座標を丸め、日本語国名を付けて同梱JSONへ変換 |
| 013 | 国会会議録の政府答弁 | [国会会議録検索システムAPI](https://kokkai.ndl.go.jp/api.html)（国立国会図書館） | [発言の著作権は発言者に帰属](https://kokkai.ndl.go.jp/) | 政府側の答弁を抽出し、年別・省庁別に集計。画面には抜粋と原文リンクを表示 |
| 014 | アメダスの地点情報・観測値 | [気象庁ホームページ](https://www.jma.go.jp/bosai/map.html#contents=amedas) | [気象庁ホームページの利用規約（公共データ利用規約 第1.0版）](https://www.jma.go.jp/jma/kishou/info/coment.html) | 観測値から順位、気温差、都道府県名を計算し、観測地点を地図状に配置 |
| 015 | 令和2年国勢調査の人口・年齢・世帯データと統計GIS境界データ | [e-Stat](https://www.e-stat.go.jp/)・総務省統計局 | [e-Stat利用規約](https://www.e-stat.go.jp/terms-of-use)（CC BY 4.0互換） | 市区町村単位へ抽出し、単独世帯割合を計算。境界データの小地域重心を人口で重み付けして代表点を計算 |
| 015 | 全国都道府県市区町村別面積調 | [国土地理院](https://www.gsi.go.jp/KOKUJYOHO/OLD-MENCHO-title.htm) | [国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)（[公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0)） | 国勢調査の市区町村データとコードで結合して同梱JSONへ変換 |
| 022 | 飲料水の備蓄量の目安 | [首相官邸](https://www.kantei.go.jp/jp/headline/bousai/sonae.html?vm=r) | [公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0) | 人数と在庫量から備蓄日数・不足量を計算 |
| 022 | 食品の備蓄期間の目安 | [農林水産省](https://www.maff.go.jp/j/zyukyu/foodstock/chapter01.html) | [公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0) | 1日3食として人数と食数から備蓄日数・不足量を計算 |
| 022 | 簡易トイレの便袋数の目安 | [内閣府](https://www.bousai.go.jp/taisaku/hinanjo/pdf/1605hinanjo_toilet_guideline.pdf) | [公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0) | 1人1日5回として人数と便袋数から備蓄日数・不足量を計算 |
| 023 | 国立国会図書館雑誌記事索引のメタデータ | [国立国会図書館サーチAPI](https://ndlsearch.ndl.go.jp/help/api)（データ提供：国立国会図書館） | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 検索語を題名に含む記事を発行年ごとの件数に集計し、転機・ピーク・初出の年の記事を表示 |
| 023 | `apps/day-023-magtrace/tests/fixtures/*.xml` のAPI生レスポンス | [国立国会図書館サーチAPI](https://ndlsearch.ndl.go.jp/help/api)（データ提供：国立国会図書館） | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 未改変。テスト用フィクスチャとして同梱 |
