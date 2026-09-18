# 同梱データの出典

このフォルダの2つは**ビルド時に1回だけ作った生成物**で、`tools/` のスクリプトから作り直せる。
実行時に取りに行くのは気象庁の台風JSONだけで、ここには入っていない。

## `towns.json` — 市区町村1805件

| | |
|---|---|
| 出典 | 気象庁「[気象庁ホームページ](https://www.jma.go.jp/bosai/)」の `common/const/area.json`・`common/const/class20relm.json`（2026-09-18取得。実物は `tests/fixtures/` に置いてある）と、Day 015 で作った市区町村の代表点 |
| ライセンス | [気象庁ホームページの利用規約](https://www.jma.go.jp/jma/kishou/info/coment.html)（政府標準利用規約・公共データ利用規約 第1.0版に準拠）。Day 015 の代表点は「令和2年国勢調査」「境界データ」（総務省統計局・e-Stat）由来 |
| 作り方 | `node tools/build-towns.mjs` |

加工した内容：

- `class20s`（市区町村・7桁）に、`parent` でたどった `class15s`（地域・6桁＝確率のキー）の名前と、
  `class10s` → `offices` とたどった都道府県名を付けた。**階層をまたいで同じコード文字列が使われる**
  （小笠原諸島の `130040` は class15s にも class10s にもある）ので、辞書は混ぜず1段ずつ引いている
- 都道府県名は `offices` の名前。ただし北海道7・沖縄4・鹿児島2の計14件は気象台の管轄名になっているので、
  コードの上2桁で「北海道」「沖縄県」「鹿児島県」に寄せた。画面に「◯◯市（◯◯県）」と出して見分けるため
- 並び順（`order`）は `area.json` の**ファイル上の出現順**（北→南）。`JSON.parse` したキーの順は使えない
  （先頭が0のコードが後ろへ回り、群馬県が先頭・鹿児島県が末尾になる）
- 代表点は Day 015 の代表点を5桁コードで当て、無い17件は外接矩形の中心にした
- 外接矩形（`sw`/`ne`）は `class20relm.json` のまま。小数4桁に丸めただけ

確率の値そのものはここに入れていない（毎回気象庁から取る）。

## `land.json` — 陸の輪郭

| | |
|---|---|
| 出典 | [Natural Earth](https://www.naturalearthdata.com/) 1:50m Land（`ne_50m_land.geojson`） |
| ライセンス | パブリックドメイン（[Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)） |
| 作り方 | `node tools/build-land.mjs`（元ファイルは `tools/cache/` に落ちる。`.gitignore` 済み） |

加工した内容：東経118〜160度・北緯12〜50度の窓に掛かるポリゴンだけを残し、
Douglas-Peucker（許容 0.02度）で間引いて座標を小数2桁に丸めた。内陸の湖（穴）は落としている。
地図の縮尺では0.01度が1ピクセルに届かないので、この粗さで足りる。120KB以内に収めるための丸めでもある。
