# 気象庁の台風データ 実測メモ（2026-09-18）

Day 042「台風、うちに来る？」で使うデータを実際に叩いて確かめた記録。生データは `tests/fixtures/`、出典表は `tests/fixtures/SOURCES.md`、取得スクリプトは `tools/probe-jma.mjs`。

観測時の対象は台風第25号（ドゥージェン／Dujuan）。気象庁のイベントIDは `TC2630`（台風番号 2625 とは別物なので注意）。

## 結論

気象庁 bosai サイトの JSON だけで作れる。**CORS は `*` なので中継関数は要らない**。防災情報XMLを自前でパースする必要もない。

アプリが叩くのは4本。すべて `https://www.jma.go.jp/bosai/` 配下、`cache-control: max-age=60`。

| 用途 | URL | 展開後サイズ |
|---|---|---|
| いま発表中の台風の一覧 | `typhoon/data/targetTc.json` | 106 B |
| 3時間ごとの暴風域確率（5日先まで） | `typhoon/data/{eventId}/probabilityTimeseries.json` | 35.6 KB |
| 1〜5日先の積算確率 | `typhoon/data/{eventId}/probabilityThrough.json` | 8.3 KB |
| 現在位置・予報円・諸元 | `typhoon/data/{eventId}/specifications.json` | 4.0 KB |

地図を描くなら `typhoon/data/{eventId}/forecast.json`（4.6 KB・経路と円の幾何）、市区町村の対応表に `common/const/area.json`（262 KB）、現在地から市区町村を当てるなら `common/const/class20relm.json`（144 KB）を足す。

これらのURLは `https://www.jma.go.jp/bosai/typhoon/` のHTMLに埋め込まれたJSから抜いた（`bosai-typhoon-index-20260918.html` を grep）。第三者記事にあった `bosai/typhoon/data/targetTimes.json` は **404**、`bosai/information/data/typhoon.json` は200で返るが中身が2026-05-27の台風第6号のまま更新されておらず、どちらも使えない。

## 台風の一覧: targetTc.json

```json
[{"tropicalCyclone":"TC2630","typhoonNumber":"2625","category":"STS","issue":"2026-09-18T18:45:00+09:00"}]
```

配列。`tropicalCyclone` が以降のパスに入る eventId。台風が複数あれば要素が増える設計だと読める（今日は1個しかないので**未確認**）。`issue` は電文の発表時刻で、この日は3時間ごとに更新されていた。

## 暴風域に入る確率

`probabilityTimeseries.json`（3時間ごと）:

```
targetDatetime : "2026-09-18T15:00:00+09:00"   基準時刻
validtime      : 40要素。3時間間隔。18:00(+3h) から 5日後の15:00(+120h) まで
probability    : { "<地域コード6桁>": [40個の整数] }  375地域
```

`probabilityThrough.json`（積算）は同じ形で `validtime` が5要素（翌日から5日後までの各15:00）、値は「その時刻までに暴風域に入る確率」。

実測した性質:

- 値は **0〜100 の整数のみ**。`"-"` や null、文字列は1つも無い（375×40=15,000個と375×5個を全数確認）。
- 地域は **375件で固定**。40本・5本の系列長も全地域で揃っている。
- 地域コードは6桁で、**`area.json` の `class15s` と375件すべて一致**。ファイル上の並びも両者同じ（宗谷北部 `011011` から始まる北→南順）。
- `validtime` は3時間の**区間の終わり**を指す。XML側の `TimeDefine` は同じ区間の**始まり**（`Duration` が `PT3H`）なので、両方を見るときは3時間ずれる。

**落とし穴**: `Object.keys(probability)` はファイルの並び順を返さない。`100011` のような先頭が0でない6桁コードはJSエンジンに配列添字とみなされて数値順で先に来るため、先頭0の北海道〜九州（`0xxxxx`）が全部うしろに回る。実測で `Object.keys()` の先頭は群馬県の `100011`、末尾は鹿児島県の `0941100` だった。`area.json` の `class15s` も `class20s` も同じ挙動なので、キーで突き合わせる分には問題ないが、**一覧を表示する順番には使えない**。並べたいなら自分でソートする。

実例（この日の値）:

| 市区町村 | class15s | 3時間値の最大 | 積算（1〜5日） |
|---|---|---|---|
| 東京都渋谷区 | 130011 ２３区西部 | 22%（9/21 12:00） | 0,0,29,30,30 |
| 東京都八丈町 | 130031 八丈島 | 62%（9/21 03:00） | 0,6,78,78,78 |
| 千葉県館山市 | 120032 夷隅・安房 | 42%（9/21 12:00） | 0,0,52,53,53 |
| 秋田県由利本荘市 | 050013 本荘由利地域 | 1%（9/21 15:00） | 0,0,1,2,2 |
| 沖縄県那覇市 | 471011 南部 | 0% | 0,0,0,0,0 |

`typhoon/data/prob50kt/targetTimes.json` は基準時刻と時刻列の索引（45要素＝timeseries 40＋through 5、時刻は UTC の `yyyymmddHHMMSS`、`member` が eventId）。本体JSONに同じ情報が入っているので、アプリでは要らない。

## 現在位置と予報: specifications.json

配列。1件目が `part:"title"`（発表時刻・台風番号・名前・階級）、2件目が `part.jp:"実況"`、以降が12/24/45/69/93時間後の予報。実測値の例（実況）:

- `position.deg: [25.5, 142.2]`、`position.dm`（度分）、`accuracy:"ほぼ正確"`
- `location:"父島の南約180km"`、`course:"西"`、`speed:{"km/h":"25","kt":"13"}`
- `pressure:"975"`、`maximumWind.sustained:{"m/s":"30","kt":"60","note":"中心付近"}`、`maximumWind.gust`
- `category:{"jp":"台風","en":"STS"}`、`scale:"大型"`、`intensity:"-"`（該当なしは文字列のハイフン）
- `stormWarning`（暴風域）と `galeWarning`（強風域）は**方向別の配列**。全方向同じなら `area:{"jp":"全域"}` 1件、非対称なら `area:"北東"` `area:"南西"` のように和名の文字列が入る
- 予報の各要素には `probabilityCircleRadius:{km,nm}`（予報円）と `stormWarningArea` に相当する `stormWarning`（暴風警戒域）が入る。**強風域は実況にしか無い**

数値が文字列だったり数値だったりする（`pressure` は文字列、`range.km` は数値）。パーサ側で揃える。

`forecast.json` は同じ発表を地図用の幾何にしたもの。`track.preTyphoon` / `track.typhoon`（過去の経路の緯度経度列）、`center`、`probabilityCircle:{radius(メートル), tangent(接線)}`、`stormWarningArea:{arc:[[中心,半径m,[開始角,終了角]],…], line:[…]}`。半径はメートル、角度は度。

## 市区町村と地域の対応: area.json

5階層。いずれもキーは文字列。

| 階層 | 件数 | コード桁数 | 例 |
|---|---:|---:|---|
| `centers` | 11 | 6 | `010300` 関東甲信地方 |
| `offices` | 58 | 6 | `100000` 群馬県 |
| `class10s` | 142 | 6 | `100010` 南部 |
| `class15s` | **375** | 6 | `100011` 前橋・桐生地域 |
| `class20s` | **1805** | **7** | `1020100` 前橋市 |

`class20s` の各要素は `{name, enName, kana, parent}`。**1805件すべてに `kana` と有効な `parent` があり、親が見つからないものは0件**。`class15s` も全件が `class20s` の子を持つ。

たどり方は `class20s[7桁].parent` → `class15s[6桁]`（＝確率のキー）→ `.parent` → `class10s` → `.parent` → `offices` → `.parent` → `centers`。

```
0521000 由利本荘市 → 050013 本荘由利地域 → 050010 沿岸 → 050000 秋田県 → 010200 東北地方
1342100 小笠原村   → 130040 小笠原諸島   → 130040 小笠原諸島 → 130000 東京都 → 010300 関東甲信地方
```

**落とし穴**: 小笠原の例のとおり、階層が違っても**同じコード文字列が使われることがある**（`130040` は class15s にも class10s にもある）。全階層を1つの辞書に混ぜてはいけない。

`class20relm.json` は市区町村コード（7桁）→ `{name, ne:[lat,lng], sw:[lat,lng]}` の外接矩形。**`class20s` の1805件と過不足なく一致**し、`ne`/`sw` が欠けた要素も無い。現在地から市区町村を絞るのに使える（気象庁の台風ページ自身がこれを使っている）。矩形なので複数ヒットする前提の実装が要る。

## 防災情報XML（VPTW60 / VPTA50）

アプリでは使わないが、bosai JSON の素性を確かめるために実測した。

**VPTW60（台風解析・予報情報 5日予報）** 26 KB。`Report/Head` に `EventID`（TC2630）・`ReportDateTime`・`Serial`。`Body/MeteorologicalInfos/MeteorologicalInfo` が6個（`DateTime type` が `実況` `予報　１２時間後` `予報　２４時間後` `予報　４５時間後` `予報　６９時間後` `予報　９３時間後`）。要素名は実物から書き写すと:

```
CenterPart > jmx_eb:Coordinate type="中心位置（度）"      本文 "+25.5+142.2/"
           > jmx_eb:Coordinate type="中心位置（度分）"    本文 "+2530+14210/"
           > Location / jmx_eb:Direction / jmx_eb:Speed / jmx_eb:Pressure
WindPart   > jmx_eb:WindSpeed type="最大風速"|"最大瞬間風速"（ノットとm/sの2本ずつ）
WarningAreaPart type="暴風域"|"強風域"|"暴風警戒域"
           > jmx_eb:Circle > jmx_eb:Axes > jmx_eb:Axis
                            > jmx_eb:Direction（"全域" または 北東/南西…）
                            > jmx_eb:Radius type="半径"（海里とkmの2本）
ProbabilityCircle type="予報円" > jmx_eb:BasePoint + jmx_eb:Radius type="７０パーセント確率半径"
```

**VPTA50（台風の暴風域に入る確率）** 1.85 MB。`MeteorologicalInfo type` が「台風呼称」＋「1日積算」〜「5日積算」の6ブロックで、各積算ブロックに375個の `Item`。`Item` は `FiftyKtWindProbability unit="%"` と `Area{Name,Code,Prefecture,PrefectureCode}`。3時間ごとの系列はこれとは別に、末尾の `TimeSeriesInfo`（`TimeDefine` 40個・各 `Duration` が `PT3H`）にぶら下がる 375 `Item` に入っている。

- `Area/Code` は6桁で **375件すべてが `area.json` の class15s に一致**し、`Name` も全件一致した
- `PrefectureCode` は6桁だが階層が揃っていない（`offices` に341件、`class10s` に56件、`centers` に3件、`class15s` に1件）。**これを使わず `area.json` の親子をたどること**
- 値は整数の文字列のみ。欠測記号は無し
- 3時間の系列も5日の積算も、**bosai JSON と1件の差も無く一致**（timeseries 375地域×40本、through 375地域×5本を全数照合）

**発表間隔**（`extra_l.xml` の7日ぶんの entry から実測）:

| 電文 | 7日間の件数 | 間隔 |
|---|---:|---|
| VPTW60 | 36 | 3時間ごと（実測 2.64〜3.25h） |
| VPTA50 | 18 | 6時間ごと（実測 5.58〜6.25h） |

台風が日本に接近すると毎時発表になる、という運用は知られているが、今回の7日間では観測できなかった（**推測**）。

## (A) ブラウザから直接読めるか → 読める。中継関数は不要

`Origin: https://hundred-days.pages.dev` を付けて叩き直したところ、bosai の4本も `area.json` も、さらに **`extra.xml` と VPTW60 のXMLまで `access-control-allow-origin: *`** を返した。404（存在しない eventId）にも `*` が付くので、ブラウザでは例外ではなく `res.ok === false` として受け取れる。

**この確認で踏んだ罠**: `Origin` ヘッダを付けずに叩くと、同じURLでも `access-control-allow-origin` が返らないことがある（応答が `Vary: Origin` を持つため、CDNがオリジン無しの版をキャッシュしている）。実際 `prob50kt/targetTimes.json` は Origin 無しでは「CORSヘッダ無し」に見えた。**curl や Node の素の fetch でCORSの可否を判定してはいけない。**

## (B) 中継が要る場合の条件 → 今回は該当しない

(A) のとおり不要。将来XML経路が必要になったときのために測った値だけ残す。

- `extra.xml`（高頻度・随時）: 193 KB / 304 entry / **約9.8時間ぶん**。10分ごとに取りに行けば取り逃さない
- `extra_l.xml`（長期・随時）: **3.20 MB** / 5,459 entry / 168時間（7日）ぶん
- VPTA50 の本体が 1.85 MB あるのに対し、同じ内容の bosai JSON は 35.6 KB（3時間系列）＋8.3 KB（積算）。転送量でも bosai が有利

## (C) 確率の地域と市区町村の対応 → `class15s`

確率のキーは `area.json` の **`class15s`（6桁・375件）**。市区町村は `class20s`（7桁・1805件）で、`class20s[コード].parent` がそのまま確率のキーになる。全件が対応済みで、欠けはゼロ。表示名は `class15s[コード].name`（例「２３区西部」「本荘由利地域」）。

`class10s`（一次細分区域・142件）ではないので注意。確率は一次細分区域より1段細かい「市町村等をまとめた地域」で出ている。

## (D) 台風が無いときの各データ → 未確認（以下は推測）

今日は台風があるため実測できなかった。分かっているのは次の2点だけ。

- 終わった台風のディレクトリは**消える**。2026-05の `TC2606` の `specifications.json` は 404（`content-type: text/html` の共通エラーページ、ただし CORS ヘッダは付く）
- `bosai/information/data/typhoon.json` の中身は全般台風情報（定型・電文VPTI51）の索引で、台風第25号が動いている最中でも 2026-05-27 の台風第6号のまま200で返ってきた。現在の台風の有無の判定には使えない

したがって **`targetTc.json` が空配列 `[]` を返す（あるいは古い eventId を返さない）ときを「台風なし」と扱う**のが妥当だと考えられる（推測）。実装では、eventId を保存・ハードコードせず毎回 `targetTc.json` から取り、`res.ok` を見てから `res.json()` する。台風なしの実挙動は、台風が去ってから再測する。

## 公開前にやること（この調査から出る宿題）

- **bosai の台風JSONは公式に案内されたWebAPIではなく、気象庁サイト内部のデータ**。Day 033 の地震一覧と同じ立場なので、形式が予告なく変わる前提で書く（`res.ok` と形の検査を入れ、壊れたら「取得できませんでした」で止める）
- `THIRD_PARTY_NOTICES.md` に1行足す。Day 033・034 の書き方に合わせるなら次の形:
  「042 | 台風情報（実行時に取得）と `tests/fixtures/` に置いた実応答 | 気象庁 | 気象庁ホームページの利用規約（公共データ利用規約 第1.0版） | 市区町村コードから地域コードをたどって暴風域に入る確率を引く。確率・位置・予報円の値そのものは変えていない。フィクスチャは `extra_l` の抜粋以外は未改変」
- `static/privacy.html` に「Day 042 は気象庁へ通信する」旨を追記する。**選んだ市区町村は端末内でコードに変換するだけで外へは送らない**（確率JSONは全国ぶんが1本で届くため、地域をURLに載せる必要がない）
- 気象業務法17条に触れないよう、**気象庁の発表値と発表時刻をそのまま出す**。補間・独自の言い換え・「うちは大丈夫」のような判断を足さない

## 未確認のまま残した点

- 台風が2つ以上あるときの `targetTc.json` の中身と、XMLが台風ごとに分かれるか。ファイル名の `_010000` の意味も不明
- 台風接近時にVPTW60が毎時発表になるか
- 台風が1つも無いときの `targetTc.json` / `prob50kt/targetTimes.json` の応答
- `probabilityTimeseries.json` が台風の消滅後どれだけ残るか
