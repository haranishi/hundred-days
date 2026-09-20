# 直読み提供元の利用条件（調査台帳）

`<img>` で提供元から直接読んでいる画像について、**埋め込み（hotlink）が許されているか**を調べた記録。
件数の多い順に12ホスト（当時の直読み2,665件のうち2,108件＝79%）を確認した。

**調査日: 2026-09-13。**以降に条件が変わっている可能性がある。手を入れる前にこのファイルの各URLを読み直すこと。

読み方の約束を2つ。**「記載を見つけられなかった」は「使ってよい」ではない。**探した範囲で見つからなかった、
という事実だけを書いている。そして**画像がホットリンクで取れること自体は許可の意思表示ではない。**

## 一覧

| ホスト | 件数 | 判定 | いまの扱い |
|---|---:|---|---|
| informo.madrid.es | 358 | 条件付きで許可（CC BY 4.0・出典表示） | 直読み |
| trafficnz.info | 334 | **禁止**（画像は複製許可の対象外） | **リンクのみ** |
| ristmikud.tallinn.ee | 257 | 記載を見つけられなかった | 直読み（現状維持） |
| data.nottinghamtravelwise.org.uk | 229 | 条件付きで許可（OGL v3.0・出典表示） | 直読み |
| www.foto-webcam.eu | 215 | 条件付きで許可（リンク＋出典＋16:9） | 直読み（下の未達1件あり） |
| etraffic.dgt.es | 200 | 記載を見つけられなかった | 直読み（現状維持） |
| images.wsdot.wa.gov | 176 | 記載を見つけられなかった | 直読み（現状維持） |
| webcams.tirol.gv.at / luft.tirol.gv.at | 140 | 条件付き。**事前申請が必要で満たせない** | **リンクのみ** |
| ctroads.org | 80 | **禁止**（framing 等を書面同意なしに禁止） | **リンクのみ** |
| tripcheck.com | 54 | 条件付きで許可（ODOTのクレジット） | 直読み |
| land-oberoesterreich.gv.at | 40 | 条件付きで許可（出典表示） | 直読み |
| m.hak.hr | 25 | **禁止**（許諾なしの複製・公表を禁止） | 直読み → **リンクのみ** |

未調査（上位15の残り）: tsftp.no 25件、tebgroup.eu 20件、richmond.ca 20件。

「リンクのみ」にしたホストは `exclude-hosts.txt` に入れてある。地点は地図に残り、押すと提供元が開く。

---

## 禁止 → リンクのみにした

### trafficnz.info（334件）

- 確認: https://journeys.nzta.govt.nz/about-this-site （live）／NZTA Traffic and Travel API Terms of Use（**live はWAFで読めず、Internet Archive 2026-04-10 版**）
- 判定: **明確に禁止**（登録し書面許可を得た場合を除く）

> The permission to reproduce copyright protected material does not extend to any material on this site such as logos, emblems, trademarks, photography and imagery, and material identified as being the copyright of a third party.
> （複製の許可は、ロゴ・紋章・商標・**写真および画像**、第三者の著作物と明示された素材には及ばない）

> Such information may be reproduced for personal use without permission, as long as you attribute the work to Waka Kotahi NZ Transport Agency, and abide by the licence terms under the Creative Commons Attribution 4.0 International licence
> （当該情報は、クレジット表示とCC BY 4.0の条件に従う限り、**個人利用のために**許可なく複製できる）

API規約側（Archive版）はさらに厳しく、登録が前提で、商用利用を否定し、リンクにも事前の書面同意を求めている。

> no part of this website that relates to the Traffic and Travel API Service may be: … re-sold, published, copied, reproduced, transmitted or stored (including in any other website or other electronic form), without the NZTA's express prior written permission.

公開サイトでの表示は「個人利用」を超え、画像はCC BYの対象外。登録も書面許可もしていないので直読みは止めた。

### ctroads.org（80件）

- 確認: https://ctroads.org/termsandconditions （live・原文を直接確認）
- 判定: **明確に禁止**

> Redistribution or republication of any part of ctroads.org or its content is prohibited, including by such methods as framing, other similar methods or by any other means, without the prior express written consent of CTDOT.
> （ctroads.org またはそのコンテンツのいかなる部分の再配信・再公開も、framing その他類似の方法を含め、CTDOTの事前の明示的な書面同意なしには禁止される）

> Links may not be established to any other pages on this website without ctroads.org's prior written permission.
> （本サイトのホームページ以外のページへのリンクは、事前の書面許可なしにはできない）

⚠️ **リンクのみに落としても条件は満たしきれない**: 2つ目の引用のとおり、リンクそのものもホームページ以外は書面許可制。
条件を完全には満たしていない。地点ごと外すかどうかは本人の判断が要る（`exclude-ids.txt` で外せる）。

### m.hak.hr（25件・クロアチア自動車クラブ HAK）

- 確認: https://www.hak.hr/hak/uvjeti-koristenja/ （live・原文を直接確認）
- 判定: **明確に禁止**

> Sadržaji koji se nalaze na ovom web-sjedištu (www.hak.hr), interaktivnoj karti Hrvatske HAK-a (map.hak.hr) te mobilnim aplikacijama HAK-a isključivo su vlasništvo Hrvatskog autokluba. Nije dopušteno, bez odobrenja Hrvatskog autokluba, reproduciranje, umnožavanje, prerada i objava navedenih sadržaja.
> （本サイト、HAKの地図、HAKのモバイルアプリのコンテンツは専らHAKの所有物である。**HAKの許諾なしに、これらのコンテンツを複製・複写・改変・公表することは許されない**）

道路状況の「情報」については出典表示＋原文リンクを条件に転載を認める緩和規定があるが、対象はテキスト情報で、
画像に読み替える根拠は原文にない。なお規約が名指しするのは www.hak.hr と map.hak.hr で、画像を配信している
m.hak.hr は文言上は列挙されていない。HAK自身のモバイル版なので同じ扱いにした。

## 条件を満たせない → リンクのみにした

### webcams.tirol.gv.at / luft.tirol.gv.at（140件・ティロル州）

- 確認: https://www.tirol.gv.at/impressum/ （live・原文を直接確認）。`webcams.tirol.gv.at` 自体に規約ページはない（404）
- 判定: **条件付き。事前申請が必要で、いまは満たせない**

> Wenn Sie Informationsdienste dieser Webseite für andere Zwecke als zu ihrer persönlichen Information verwenden wollen, müssen Sie zuvor einen Antrag nach dem Tiroler Informationsweiterverwendungsgesetz stellen.
> （本サイトの情報サービスを**個人的な情報取得以外の目的**で使いたい場合は、事前にティロル州情報再利用法に基づく申請をしなければならない）

> Das bloße Verlinken auf Inhalte dieser Webseite steht grundsätzlich jedermann frei und bedarf keiner besonderen Genehmigung
> （本サイトのコンテンツへの**単なるリンクは原則として誰にでも自由**であり、特別な許可を要しない）

申請していないので直読みは止めた。2つ目の引用のとおりリンクは自由なので、リンクのみなら条件を満たす。
州のオープンデータ（CC BY 4.0）にウェブカメラ画像が含まれる証拠は見つけられなかった。

## 条件付きで許可（直読みを続ける）

### www.foto-webcam.eu（215件）

- 確認: https://www.foto-webcam.eu/webcam/infos/ （live・原文を直接確認。「Nutzungsbedingungen」という独立ページは無く、見出し `Verlinkung, Einbindung und Nutzung des Webcambildes` の下にある）
- 判定: **条件付きで許可**

> Eine Live-Einbindung des Kamerabildes ist erlaubt, wenn bei einem Klick auf das Bild obiger Link geöffnet wird.
> （カメラ画像のライブ埋め込みは、**画像をクリックしたとき上記のリンク（`/webcam/<name>/`）が開く場合に**許可される）

> Die Nutzung und Veröffentlichung der Bilder in TV-, Druck- oder Internetmedien ist erlaubt, wenn als Bildquelle deutlich lesbar die Adresse www.foto-webcam.eu angegeben wird. Bei Internetmedien ist diese Quellenangabe als klickbarer Link zu realisieren. Eine Veröffentlichung oder Verwendung der Bilder ohne Quellenangabe bzw. Link ist explizit untersagt.
> （画像の利用・公開は、出典として www.foto-webcam.eu を**はっきり読める形で**示す場合に許可される。ネット媒体では出典表示を**クリックできるリンク**として実装すること。出典表示ないしリンクの無い公開は明示的に禁止する）

> Das Bild hat ein Seitenverhältnis von 16:9 und muss so auch angezeigt werden. Eine Streckung oder Beschneidung des Bildes ist untersagt.
> （画像は16:9であり、そのまま表示しなければならない。引き伸ばしまたは切り取りは禁止する）

満たしていること: 画像をクリックすると `website`（＝`/webcam/<name>/`。215件中214件に入っている）が開く。
出典 `www.foto-webcam.eu` を画像のすぐ下にクリックできるリンクで出している。`object-fit: contain` なので
引き伸ばしも切り取りもしない。

⚠️ **満たせていない条件が1つ**: 埋め込み用として案内されている固定URLは `current/<幅>.jpg` の
**150 / 180 / 240 / 320 / 400 / 640 / 720** の7種類で、同梱データが使っている `current/1920.jpg` は
この一覧に無い（他の幅を禁じる文は無いが、提示もされていない）。パネルの幅は最大560pxなので
720 で足り、提供元の負荷も減る。URLの幅を差し替えるかは本人の判断（215件のデータ変更になる）。

### informo.madrid.es（358件・マドリード市）

- 確認: https://datos.madrid.es/dataset/202088-0-trafico-camaras ／ https://datos.madrid.es/pages/condiciones-generales-ayuntamiento-de-madrid ／ https://www.madrid.es/.../Aviso-legal/ 。`informo.madrid.es` 自体に規約ページは無い
- 判定: **条件付きで許可**（CC BY 4.0）

> Licencia: Creative Commons Attribution 4.0 International (CC BY 4.0)

> Debe citarse la fuente de los documentos objeto de la reutilización. Esta cita podrá realizarse de la siguiente manera: "Origen de los datos: Ayuntamiento de Madrid"
> （再利用対象の出典を明記しなければならない。表記例：「データの出典：マドリード市役所」）

CC BY 4.0 が付いた公式KMLの中に `https://informo.madrid.es/cameras/CamaraXXXXX.jpg` という画像URLが
そのまま列挙されている＝市自身がこのURLをオープンデータとして配布している。

⚠️ **ここは解釈が入っている**: madrid.es 全体の Aviso legal は自由利用の対象から「imágenes, vídeos u otros contenidos multimedia」を
外している。ただし同じ文に「salvo que expresamente se establezca lo contrario（明示的に別段の定めがある場合を除き）」
とあり、当該データセットのCC BY 4.0 がその別段の定めに当たると読んだ。**これは読み方であって、原文にそう書いてあるわけではない。**
出典「Ayuntamiento de Madrid」は358件中331件に `operator` として入っており、詳細の「運営者」に出ている。

### data.nottinghamtravelwise.org.uk（229件・ノッティンガム市）

- 確認: Nottingham City Council Open Data Geoportal「CCTV Cameras」データセット（https://hub.arcgis.com/api/v3/datasets/df2bf0314b184b449ff595df02e320cf_83 経由）／https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ 。ホスト自体に規約は無い
- 判定: **条件付きで許可**（OGL v3.0）

> Data is released under the terms of the Open Government Licence (OGL) https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

> acknowledge the source of the Information in your product or application by including or linking to any attribution statement specified by the Information Provider(s) and, where possible, provide a link to this licence
> （情報提供者が指定する帰属表示を含めるかリンクし、可能ならライセンスへのリンクも示すこと）

12ホスト中もっとも明快に埋め込みを許している（商用可）。

⚠️ **OGLが宣言されているのは画像ではなくデータセット**（カメラ画像の所在一覧）で、
JPEGそのものにOGLが及ぶと明記した文は見つけられなかった。

### tripcheck.com（54件・オレゴン州運輸省 ODOT）

- 確認: https://www.tripcheck.com/Pages/Frequently-Asked-Questions （live）／旧 TTIP Terms of Use（**live は2017年以降404。Internet Archive 2017-07-12 版**）
- 判定: **条件付きで許可**（ODOTのクレジット表示）

> The Oregon Department of Transportation allows businesses, private citizens and organizations to use data and images found on TripCheck. … ODOT should be credited for use of the camera. Language such as "Camera courtesy of ODOT" is acceptable.
> （ODOTは企業・個人・団体がTripCheck上のデータおよび画像を利用することを認めている。…カメラの利用にあたってはODOTをクレジットすべきである）

現行FAQはカメラ画像URLの取り方を案内したうえでクレジットだけを求めている。54件中48件は `operator` が
"Oregon Department of Transportation" で、詳細の「運営者」に出ている。

⚠️ **旧規約はミラーリングを求めていた**: 現在は削除されている2017年版TTIP規約は、再公開者に**自サーバへのコピー**を求めていた
（`Republisher must mirror the data found on this site.`）。これに従うならホットリンクは不可になる。
現行の公式文書にこの要求は見当たらないが、条件が緩んだと断定できる文も無い。

### land-oberoesterreich.gv.at（40件・上オーストリア州）

- 確認: https://www.land-oberoesterreich.gv.at/nutzungsbedingungen.htm （live・原文を直接確認）
- 判定: **条件付きで許可**（出典表示）

> Sämtliche Informationen, Daten und Dokumente auf den Internetseiten des Landes Oberösterreich stehen kostenlos zur Weiterverwendung bereit, sofern nicht bei der konkreten Information anderes festgelegt ist, und die Nutzung bzw. Weiterverwendung rechtmäßig erfolgt.
> （上オーストリア州のページ上のすべての情報・データ・文書は、個別に別段の定めがなく、利用が適法である限り、無償で再利用に供される）

> Bei der Weiterverwendung sind die Nutzungsrechte des Landes Oberösterreich sowie etwaiger Dritter zu wahren und entsprechende Quellennachweise ( z.B. „Quelle: Land Oberösterreich") anzuführen.
> （再利用にあたっては州および第三者の利用権を尊重し、出典表示（例「Quelle: Land Oberösterreich」）を行うこと）

`operator` が "Land Oberösterreich" で、詳細の「運営者」に出ている。
⚠️「埋め込み（Einbindung / Framing）」という語は一度も出てこない。許諾の対象は「Weiterverwendung（再利用）」という一般語。

## 記載を見つけられなかった（現状維持）

いずれも**禁止が見つかったわけではなく、許可も見つからなかった**。扱いは変えていない。
使い続ける判断をするなら、各提供元へ直接照会するのが唯一の確実な方法。

### ristmikud.tallinn.ee（257件・タリン市）

- 確認: https://ristmikud.tallinn.ee/ ／ https://ristmikud.tallinn.ee/index.php/cams ／ https://avaandmed.tallinn.ee/
- サイト上に利用規約・著作権表示・オープンデータライセンスのいずれも存在しない。全文を走査して
  `autoriõigus` `kasutustingimused` `litsents` 等に該当する条文は0件だった
- 逐語引用: **なし**（引用できる条文が存在しない）
- 問い合わせ先がサイトに明示されている: `kaamera@tallinnlv.ee`

### etraffic.dgt.es（200件・スペイン交通総局 DGT）

- 確認: https://www.dgt.es/contenido/aviso-legal/ ／ https://nap.dgt.es/dataset/camaras-dgt-datex2-v3-7 ／ 同データセットのDATEX2 XML。`etraffic.dgt.es` 自体に法的表示への導線は一切ない
- 埋め込み・ホットリンク・framing を名指しした条項は**どのページにも無い**。代わりに**互いに矛盾する2つの手がかり**がある

> La reproducción, distribución, comercialización o transformación no autorizadas de dichas obras, a no ser que sea para uso personal y privado, constituye una infracción de los derechos de propiedad intelectual
> （Aviso Legal: 当該著作物の無断の複製・配布・商業化・改変は、**個人的かつ私的な利用である場合を除き**、知的財産権の侵害を構成する）

> Tipo de Licencia: Licence and Free of charge ／ Términos de Uso: https://www.dgt.es/contenido/aviso-legal/ ／ Licencia: Creative Commons Attribution
> （NAPのカメラデータセット表示。CC BYラベルと、制限的なAviso Legalへのリンクが同居している）

国家アクセスポイント(NAP)のDATEX2 XMLには `<fse:deviceUrl>https://etraffic.dgt.es/camarasEtraffic/<id>.jpg</fse:deviceUrl>`
として画像URLが直接入っている。ただしCC BYが掛かっているのは形式上「データセット」で、**JPEGそのものに及ぶとは
明記されていない**。確実にするなら `nap@dgt.es` へ照会が要る。

### images.wsdot.wa.gov（176件・ワシントン州運輸省 WSDOT）

- 確認: https://wsdot.wa.gov/ （フッターは `Copyright WSDOT ©` のみでリンク先なし）／https://wsdot.wa.gov/about/policies ／Traveler Information API のドキュメント一式。`wsdot.wa.gov/copyright` は404
- 埋め込みを許可も禁止もする文は**見つからなかった**
- 逐語引用: **なし**

⚠️ **引っかかりやすい罠**: 検索すると「The images provided are for information purposes only, and unauthorized
attempts to alter or modify these views are prohibited.」がWSDOTのカメラ画像ポリシーとして出てくるが、**原文に当たると
これはライブ交通カメラの規定ではない。**2年周期で走行撮影する州道の静止画アーカイブ（SRweb）の
`Digital Imagery and Duplication Disclaimer` の一文で、`images.wsdot.wa.gov` には適用されない。

WSDOTは州機関なので連邦著作物をパブリックドメインとする 17 U.S.C. §105 は適用されず、実際に著作権を主張している。
照会先は `digitalimagingrequest@wsdot.wa.gov`。
