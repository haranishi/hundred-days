# fixtures の出典

Day 042「台風、うちに来る？」のデータ調査で実際に取得した生データ。取得は `tools/probe-jma.mjs`（Node 24 の `fetch`）で行い、全リクエストに `User-Agent: hundred-days-day042 (+https://hundred-days.pages.dev/)` を付けた。機械可読の取得記録は同じフォルダの `_probe-log.json`（URL・HTTPステータス・主要ヘッダ・取得時刻・本文先頭300文字）。

取得日は全件 2026-09-18。当時の対象は台風第25号（アジア名ドゥージェン／Dujuan、気象庁のイベントID `TC2630`）。

| ファイル | 出典URL | 取得時刻(JST) | status | 元データの発表時刻 | bytes |
|---|---|---|---|---|---|
| `bosai-information-typhoon-20260918.json` | `https://www.jma.go.jp/bosai/information/data/typhoon.json` | 20:23:51 | 200 | 2026-05-27（古い） | 422 |
| `bosai-typhoon-index-20260918.html` | `https://www.jma.go.jp/bosai/typhoon/` | 20:24:10 | 200 | last-modified 2026-09-17 | 162,751 |
| `bosai-typhoon-targetTc-20260918.json` | `https://www.jma.go.jp/bosai/typhoon/data/targetTc.json` | 20:25:08 | 200 | issue 2026-09-18T18:45+09:00 | 106 |
| `bosai-typhoon-prob50kt-targetTimes-20260918.json` | `https://www.jma.go.jp/bosai/typhoon/data/prob50kt/targetTimes.json` | 20:25:10 | 200 | basetime 20260918060000Z | 4,486 |
| `bosai-TC2630-probabilityTimeseries-20260918.json` | `https://www.jma.go.jp/bosai/typhoon/data/TC2630/probabilityTimeseries.json` | 20:25:24 | 200 | targetDatetime 2026-09-18T15:00+09:00 | 35,591 |
| `bosai-TC2630-probabilityThrough-20260918.json` | `https://www.jma.go.jp/bosai/typhoon/data/TC2630/probabilityThrough.json` | 20:25:26 | 200 | targetDatetime 2026-09-18T15:00+09:00 | 8,307 |
| `bosai-TC2630-specifications-20260918.json` | `https://www.jma.go.jp/bosai/typhoon/data/TC2630/specifications.json` | 20:25:38 | 200 | issue 2026-09-18T18:45+09:00 | 3,976 |
| `bosai-TC2630-forecast-20260918.json` | `https://www.jma.go.jp/bosai/typhoon/data/TC2630/forecast.json` | 20:25:40 | 200 | issue 2026-09-18T18:45+09:00 | 4,555 |
| `area.json` | `https://www.jma.go.jp/bosai/common/const/area.json` | 20:26:28 | 200 | last-modified 2026-09-14 | 262,108 |
| `class20relm.json` | `https://www.jma.go.jp/bosai/common/const/class20relm.json` | 20:27:11 | 200 | last-modified 2026-09-17 | 144,039 |
| `extra-20260918T2026JST.xml` | `https://www.data.jma.go.jp/developer/xml/feed/extra.xml` | 20:27:09 | 200 | feed updated 2026-09-18T20:23:52+09:00 | 192,976 |
| `extra_l-20260918T2030JST-typhoon-only.xml` | `https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml` | 20:30:43 | 200 | feed updated 2026-09-18T20:23:52+09:00 | 3,199,159（原本） |
| `vptw60-20260918-0940Z.xml` | `https://www.data.jma.go.jp/developer/xml/data/20260918094043_0_VPTW60_010000.xml` | 20:28:51 | 200 | ReportDateTime 2026-09-18T18:45+09:00 / Serial 36 | 26,361 |
| `vpta50-20260918-0645Z.xml` | `https://www.data.jma.go.jp/developer/xml/data/20260918064500_0_VPTA50_010000.xml` | 20:28:53 | 200 | ReportDateTime 2026-09-18T15:45+09:00 / Serial 35 | 1,848,908 |

bytes は展開後のサイズ。転送時は gzip か brotli がかかる。

## 保存しなかった取得

| URL | 取得時刻(JST) | status | 記録した理由 |
|---|---|---|---|
| `https://www.jma.go.jp/bosai/typhoon/data/targetTimes.json` | 20:24:02 | 404 | 第三者記事にあったパスが存在しないことの確認 |
| `https://www.jma.go.jp/bosai/typhoon/data/TC2606/specifications.json` | 20:31:20 | 404 | 終わった台風のディレクトリが消えることの確認 |

## `extra_l` を切り詰めた件

`extra_l.xml` の原本は 3,199,159 bytes・5,459 entry あり、そのままリポジトリに置くには大きい。フィードのヘッダと、`title` に「台風」を含む 54 entry だけを残して `extra_l-20260918T2030JST-typhoon-only.xml`（26,767 bytes）として保存した。ファイル先頭に同じ注記をコメントで入れてある。削ったのは台風と無関係の entry だけで、残した entry には手を加えていない。

## CORSヘッダの再取得について

`_probe-log.json` には同じURLが「Origin なし」と「`[Origin付き]`」の2通りで記録されている。気象庁のCDNは `Vary: Origin` を返すため、`Origin` ヘッダを付けないリクエストでは `access-control-allow-origin` が付かない応答が返ることがある。ブラウザから読めるかを正しく判定するために、主要なURLだけ `Origin: https://hundred-days.pages.dev` を付けて1回ずつ取り直した。結論は `docs/data-discovery.md` の (A) に書いた。

> 2026-09-18 追記：`area.json` は公開前チェック（個人名のローマ字パターン）に当たる `enName`（英名）を全件除いて保存した。名前・読み・親子関係は未改変。
