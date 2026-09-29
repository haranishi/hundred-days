# Day 052 の同梱データの出典

取得日は2026年9月29日。どれもこのリポジトリで加工している。何をしたかは節ごとに書く。
利用条件は、各サイトの「著作権・リンク」「利用規約」のページを2026年9月29日に読んで要点をまとめた。

## 環境省「令和6年度温泉利用状況」（`stats.json` の areas・sources・flow など）

- 使いみち：温泉地の数（温泉地数）、源泉の数（源泉総数）、湧き出る量（湧出量計、L/分）。宿泊施設数と温泉利用の公衆浴場数も残しているが、画面には出していない
- 時点：2025年3月末時点
- 入手先：[温泉利用状況等について](https://www.env.go.jp/nature/onsen/data/index.html)の[都道府県別の表（PDF）](https://www.env.go.jp/nature/onsen/pdf/6-7_p_1.pdf)
- 加工：PDFの文字を pdftotext で取り出し、47都道府県の5列を抜いた。どの列も、県の和が表の「令和６年度計」と一致することを確かめてから同梱した
- 表の注：温泉地数は、宿泊施設のある場所を数えている。画面の注意書きにも同じことを書いた
- 利用条件：[著作権・リンクについて](https://www.env.go.jp/mail.html)によると、特記のない内容には公共データ利用規約（第1.0版、PDL1.0）が適用される。使うときは出典を書く。編集・加工したときは、そのことと加工した主体を出典とは別に書き、国が作ったままのように見せてはいけない

## 厚生労働省「令和6年度衛生行政報告例」第9表 公衆浴場数（`stats.json` の sento）

- 使いみち：銭湯の数
- 時点：2025年3月末時点
- 入手先：[e-Stat の衛生行政報告例](https://www.e-stat.go.jp/stat-search/files?toukei=00450027)（第9表のCSV、Shift_JIS）
- 加工：「一般公衆浴場」の公営と私営を足して、都道府県ごとの銭湯の数にした。表の「-」は0として数えた。公衆浴場の総数（23,668）は、個室付浴場などを含む「その他の公衆浴場」まで入るので使っていない。県の和が全国の2,730と一致することを確かめた
- 利用条件：[e-Stat の利用規約](https://www.e-stat.go.jp/terms-of-use)は政府標準利用規約（第2.0版）に準拠し、CC BY 4.0 と互換がある。数値データや簡単な表は著作権の対象ではないとしたうえで、出典の記載と、加工したことの記載を求めている。[厚生労働省の利用規約・リンク・著作権等](https://www.mhlw.go.jp/chosakuken/index.html)も PDL1.0 に準拠していて、同じく加工したことの記載を求めている

## 同「令和6（2024）年度衛生行政報告例の概況」表4（`stats.json` の sentoSeries）

- 使いみち：銭湯の数の推移（2020〜2024年度）。画面の「全国の銭湯は4年で3,231軒→2,730軒（501軒減）」
- 入手先：[概況のページ](https://www.mhlw.go.jp/toukei/saikin/hw/eisei_houkoku/24/index.html)の[生活衛生関係（PDF）](https://www.mhlw.go.jp/toukei/saikin/hw/eisei_houkoku/24/dl/kekka3.pdf)
- 加工：表4の「一般公衆浴場」の行から5年分を抜いた。2024年度の値が第9表の全国と一致することを確かめた
- 利用条件：上の厚生労働省と同じ

## OpenStreetMap の公衆浴場（`baths.json`）

- 使いみち：地図の点、県のカードの件数と一覧、お風呂のカード
- 取得：Overpass API で、47都道府県ごとに `amenity=public_bath` を取った（osm_base 2026-09-29T04:21:42Z）。問い合わせは `tools/fetch-osm.mjs`
- 加工（`tools/build-baths.mjs`）：
  - 47県の応答は計5,703件。県の境界にかかって2県に出た6件は、県コードの若い方に1件だけ入れた（5,697件）
  - 私用の印（access=private/no）10件と、閉業の印2件を除いて5,685件
  - 同じお風呂が「点」と「建物の輪郭」で二重に登録されていることが多い（同じ県・同じ名前で100m以内の496組のうち449組は25m以内）。同じ県・同じ名前で100m以内のものは1件にまとめた（477件、`mergeSameName`）。残すのは種類の根拠が強いもの（記載あり→名前→なし）、次に点→輪郭→リレーションの順で、営業時間・料金・露天は残す側に無ければまとめた側から補う。まとめたあとは5,208件
  - 座標は小数5桁に丸めた。残した項目は、名前（`;` でつながった名前は「・」でつなぐ）、営業時間の記載、料金の有無、露天風呂の有無だけ
  - 種類は bath:type の記載、名前、判断できない、の順で5つに分けた。まとめたあとで記載あり1,041件、名前から判断1,919件、判断できず2,248件。「〇〇湯」という名前だけでは銭湯と決めていない
- ライセンス：© OpenStreetMap contributors、[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。`baths.json` は ODbL で提供する派生データベースとして扱う

## 柱を立てる位置（`stats.json` の capital）

- 使いみち：県ごとの柱を立てる点
- 入手先：Day 015 の `data/points.json`。e-Stat の令和2年国勢調査の小地域境界データから、Day 015 で人口の重心として計算した点
- 加工：47の県庁所在地の点を写した（東京都は新宿区）。柱は半径約14kmの32角形にしている。県の中の分布は表していない
- 利用条件：[e-Stat の利用規約](https://www.e-stat.go.jp/terms-of-use)（CC BY 4.0 と互換）

## 画面での出典の出し方

地図の右下に MapLibre の帰属表示を置く。中身は、地図タイルの TileJSON が持つ「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」（OpenMapTiles は openmaptiles.org、OpenStreetMap は openstreetmap.org/copyright へのリンク）。開いた直後は出したままにし、利用者が地図を動かす・押す・拡大縮小したときか、表示から5秒後に（i）のボタンへ畳む。畳んでも（i）から開ける。

この出し方は次の条件に合わせた（2026年9月29日に原文を確認）。

- [OSMF の帰属ガイドライン](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)：地図の隅か地図のすぐそばに出す。畳んでよいのは、閉じる操作・地図の操作・5秒経過のいずれか。畳んだあとも（i）などから出典をたどれること
- [OpenMapTiles のデザインのライセンス](https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md)（CC BY 4.0）：「OpenMapTiles」を、openmaptiles.org へのリンク付きで見える形で出す
- [OpenFreeMap](https://openfreemap.org/)：帰属は必須。印刷物や動画に使うときは「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」を入れる（OpenFreeMap の部分は任意）

当初は読み込み直後に（i）へ畳んでいて、OpenMapTiles の表記が操作なしでは見えなかった。公開の前に上の形に直した。
画面の下の帯にも出典を常に出す。PC では4つ（OpenStreetMap・OpenFreeMap・環境省・厚生労働省）を並べ、スマホでは「出典：環境省・厚労省・OpenStreetMap ほか（詳しく）」の1行に縮めて、「詳しく」から「出典と注意」の節へ移れるようにした。その節には4つの出典を同じ文で出している。
統計を加工したことも、「出典と注意」の節に「〜を加工して作成」と書いている。
