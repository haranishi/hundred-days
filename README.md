# 100 DAYS / 100 APPS

1日1個、Webアプリを作って公開します。その100日チャレンジのリポジトリです。
作るのはAIと一緒。「AIに任せたこと」と「自分で考えたこと」を、毎日わけて記録していきます。

**公開ページ: https://hundred-days.pages.dev/**

## Dayからコードを探す

各Dayのフォルダーはリポジトリ直下にあります。下の「コード」列から、そのアプリのソースコードへ進めます。
フォルダー名は `day-番号-英語名` で統一し、番号は3桁で並び順を揃えています。

```text
hundred-days/
├── day-001-focus-timer/       # Day 001 集中タイマー
├── day-002-pixel-art/         # Day 002 ドット絵メーカー
├── …
├── day-043-moveout-consult/   # Day 043 退去費用、相談の準備
├── functions/api/day-NNN/    # 一部のDayで使うサーバー側API
├── shared/                   # 全Day共通のシェア部品
├── scripts/                  # ビルド・制作補助
└── tests/e2e/                # Day別のブラウザテスト
```

各フォルダーでは、`README.md` がアプリの説明、`index.html` が画面、`app.js` または `script.js` が動作の入口です。
`lib/` は処理の部品、`meta.json` は制作記録、`tests/` は単体テストです（存在するファイルはDayによって異なります）。
サーバー側APIが必要なDayは、[APIとDayの対応表](functions/README.md)から関連コードも探せます。

Day 019・020は外部で公開するChrome拡張です。このリポジトリには制作記録と紹介素材を置いており、拡張のソースコードは含みません。

## アプリ一覧

<!-- day-index:start -->
| Day | アプリ | コード | 公開ページ |
|---|---|---|---|
| 001 | 集中タイマー | [day-001-focus-timer/](day-001-focus-timer/) | [アプリを開く](https://hundred-days.pages.dev/day-001-focus-timer/) |
| 002 | ドット絵メーカー | [day-002-pixel-art/](day-002-pixel-art/) | [アプリを開く](https://hundred-days.pages.dev/day-002-pixel-art/) |
| 003 | タップ花火 | [day-003-tap-fireworks/](day-003-tap-fireworks/) | [アプリを開く](https://hundred-days.pages.dev/day-003-tap-fireworks/) |
| 004 | 奨学金、何歳まで返す？ | [day-004-scholarship-repay/](day-004-scholarship-repay/) | [アプリを開く](https://hundred-days.pages.dev/day-004-scholarship-repay/) |
| 005 | その写真、何色でできてる？ | [day-005-color-palette/](day-005-color-palette/) | [アプリを開く](https://hundred-days.pages.dev/day-005-color-palette/) |
| 006 | 構造化データ、いま出るやつだけ | [day-006-schema-jsonld/](day-006-schema-jsonld/) | [アプリを開く](https://hundred-days.pages.dev/day-006-schema-jsonld/) |
| 007 | ひといきピアノ | [day-007-web-piano/](day-007-web-piano/) | [アプリを開く](https://hundred-days.pages.dev/day-007-web-piano/) |
| 008 | じはんきレーダー | [day-008-vending-radar/](day-008-vending-radar/) | [アプリを開く](https://hundred-days.pages.dev/day-008-vending-radar/) |
| 009 | 秋田バスライブ | [day-009-akita-bus-3d/](day-009-akita-bus-3d/) | [アプリを開く](https://hundred-days.pages.dev/day-009-akita-bus-3d/) |
| 010 | いま、誰かが書き直している | [day-010-wikipedia-live/](day-010-wikipedia-live/) | [アプリを開く](https://hundred-days.pages.dev/day-010-wikipedia-live/) |
| 011 | この写真、まだ場所を覚えている | [day-011-photo-metadata/](day-011-photo-metadata/) | [アプリを開く](https://hundred-days.pages.dev/day-011-photo-metadata/) |
| 012 | 海賊船の打ち返し係 | [day-012-pirate-rebound/](day-012-pirate-rebound/) | [アプリを開く](https://hundred-days.pages.dev/day-012-pirate-rebound/) |
| 013 | 政府はこう答えてきた | [day-013-gov-answers/](day-013-gov-answers/) | [アプリを開く](https://hundred-days.pages.dev/day-013-gov-answers/) |
| 014 | いま、日本でいちばん暑い場所 | [day-014-hottest-now/](day-014-hottest-now/) | [アプリを開く](https://hundred-days.pages.dev/day-014-hottest-now/) |
| 015 | あなたの街のステータス | [day-015-town-stats/](day-015-town-stats/) | [アプリを開く](https://hundred-days.pages.dev/day-015-town-stats/) |
| 016 | 回線の犯人さがし | [day-016-line-suspect/](day-016-line-suspect/) | [アプリを開く](https://hundred-days.pages.dev/day-016-line-suspect/) |
| 017 | AIの読みが見えるリバーシ | [day-017-reversi-mind/](day-017-reversi-mind/) | [アプリを開く](https://hundred-days.pages.dev/day-017-reversi-mind/) |
| 018 | 秋田の飯は、打てた分だけ | [day-018-akita-typing/](day-018-akita-typing/) | [アプリを開く](https://hundred-days.pages.dev/day-018-akita-typing/) |
| 019 | そのままコード | [制作記録のみ](day-019-sonomama-code/) | [紹介ページ](https://rairakku.vercel.app/sonomama-code) |
| 020 | モザイカー | [制作記録のみ](day-020-mozaiker/) | [紹介ページ](https://rairakku.vercel.app/mozaiker) |
| 021 | ちかくのラジオ | [day-021-nearby-radio/](day-021-nearby-radio/) | [アプリを開く](https://hundred-days.pages.dev/day-021-nearby-radio/) |
| 022 | その備蓄、何日もつ？ | [day-022-stock-days/](day-022-stock-days/) | [アプリを開く](https://hundred-days.pages.dev/day-022-stock-days/) |
| 023 | MAGTRACE | [day-023-magtrace/](day-023-magtrace/) | [アプリを開く](https://hundred-days.pages.dev/day-023-magtrace/) |
| 024 | 読めない地名が、向かってくる | [day-024-unreadable-places/](day-024-unreadable-places/) | [アプリを開く](https://hundred-days.pages.dev/day-024-unreadable-places/) |
| 025 | ちかくの駐車場 | [day-025-nearby-parking/](day-025-nearby-parking/) | [アプリを開く](https://hundred-days.pages.dev/day-025-nearby-parking/) |
| 026 | 今夜の月 | [day-026-tonight-moon/](day-026-tonight-moon/) | [アプリを開く](https://hundred-days.pages.dev/day-026-tonight-moon/) |
| 027 | スクショに額縁を | [day-027-screenshot-frame/](day-027-screenshot-frame/) | [アプリを開く](https://hundred-days.pages.dev/day-027-screenshot-frame/) |
| 028 | ひとしずくの木 | [day-028-one-drop-tree/](day-028-one-drop-tree/) | [アプリを開く](https://hundred-days.pages.dev/day-028-one-drop-tree/) |
| 029 | ちかくのWi-Fi | [day-029-nearby-wifi/](day-029-nearby-wifi/) | [アプリを開く](https://hundred-days.pages.dev/day-029-nearby-wifi/) |
| 030 | せかいのまど | [day-030-world-window/](day-030-world-window/) | [アプリを開く](https://hundred-days.pages.dev/day-030-world-window/) |
| 031 | この形、どこ？ | [day-031-shape-where/](day-031-shape-where/) | [アプリを開く](https://hundred-days.pages.dev/day-031-shape-where/) |
| 032 | いま干していい？ | [day-032-laundry-dry/](day-032-laundry-dry/) | [アプリを開く](https://hundred-days.pages.dev/day-032-laundry-dry/) |
| 033 | 揺れた？ | [day-033-did-it-shake/](day-033-did-it-shake/) | [アプリを開く](https://hundred-days.pages.dev/day-033-did-it-shake/) |
| 034 | 潮、いまどっち？ | [day-034-tide-now/](day-034-tide-now/) | [アプリを開く](https://hundred-days.pages.dev/day-034-tide-now/) |
| 035 | きょうの一面 | [day-035-front-page/](day-035-front-page/) | [アプリを開く](https://hundred-days.pages.dev/day-035-front-page/) |
| 036 | 一画ずつ | [day-036-stroke-by-stroke/](day-036-stroke-by-stroke/) | [アプリを開く](https://hundred-days.pages.dev/day-036-stroke-by-stroke/) |
| 037 | バイトの法律、原文はこう | [day-037-baito-law/](day-037-baito-law/) | [アプリを開く](https://hundred-days.pages.dev/day-037-baito-law/) |
| 038 | 昔の1000円、いまいくら | [day-038-yen-back-then/](day-038-yen-back-then/) | [アプリを開く](https://hundred-days.pages.dev/day-038-yen-back-then/) |
| 039 | 足もとを掘る | [day-039-dig-below/](day-039-dig-below/) | [アプリを開く](https://hundred-days.pages.dev/day-039-dig-below/) |
| 040 | その避難場所、洪水でも？ | [day-040-shelter-by-hazard/](day-040-shelter-by-hazard/) | [アプリを開く](https://hundred-days.pages.dev/day-040-shelter-by-hazard/) |
| 041 | この道、誰がケガしてる？ | [day-041-who-got-hurt/](day-041-who-got-hurt/) | [アプリを開く](https://hundred-days.pages.dev/day-041-who-got-hurt/) |
| 042 | 台風、うちに来る？ | [day-042-typhoon-coming/](day-042-typhoon-coming/) | [アプリを開く](https://hundred-days.pages.dev/day-042-typhoon-coming/) |
| 043 | 退去費用、相談の準備 | [day-043-moveout-consult/](day-043-moveout-consult/) | [アプリを開く](https://hundred-days.pages.dev/day-043-moveout-consult/) |
| 044 | Tokyo Railscape — 東京の電車を、眺める。 | [day-044-train-here/](day-044-train-here/) | [アプリを開く](https://hundred-days.pages.dev/day-044-train-here/) |
<!-- day-index:end -->

## 1日アプリのルール

どのDayでも変わらない基本ルール：

- 1つの公開URL・1つの主要アクション・1本のハッピーパス（1日で完成させるための枠）
- アカウント登録なし。開いた瞬間から誰でも使える
- 本名・住所・健康情報など、人を特定できるデータは扱わない（匿名のスコアや作品データはOK）
- 利用も開発も無料。課金なし・ぜんぶ無料枠で作る
- 100個すべてを記録する（100個すべての公開は約束しない）

そのかわり、Dayが進むごとに作れるものの幅を解禁していきます：

| 区間 | 解禁されること |
|---|---|
| Day 1–10 | ブラウザ完結・最小構成。毎日出す型を作る |
| Day 11–20 | 空・読込中・エラー・不正入力の4状態対応 |
| Day 21–30 | localStorage保存・見た目のこだわり |
| Day 31–60 | 外部API（無料・認証不要）を1個 → 組み合わせ |
| Day 61–90 | 複数API・サーバー側の保存・AIを機能として組み込む |
| Day 91–100 | 新規解禁なし。リクエスト改修と総まとめ |

## 構成

- `day-NNN-<name>/` — 各日のアプリ本体と記録（`meta.json`）＋一覧用スクショ（`screenshot.webp`）とデモ動画（`demo.mp4`）。どちらも任意
- `scripts/build.mjs` — `dist/` に一覧ページと各アプリを生成（依存パッケージなし）
- `static/` — 一覧ページ用の静的ファイル（OG画像など）。中身がそのまま `dist/` 直下に入る
- `shared/` — 全アプリ共通のSNSシェア部品。正本はここだけで、`scripts/sync-shared.mjs` が各アプリの `shared/` へ複製する（アプリを1フォルダで完結させるため）
- `functions/api/day-NNN/` — Cloudflare Pages Functions。ブラウザから直接は呼べない外部APIだけを中継する（CORS・User-Agent の指定・キャッシュ）
- ホスティング: Cloudflare Pages（1プロジェクトに全アプリをパスでルーティング）

```bash
npm run build      # dist/ を生成
npx wrangler pages deploy dist --project-name=hundred-days
```

公開前チェックや投稿準備スクリプトの使い方は [docs/ops.md](docs/ops.md) にあります。

## ライセンス

ソースコードは [MIT](LICENSE) です。**`day-*/data/` 配下の第三者データは対象外**で、
ODbL 1.0 や CC BY-SA 3.0（継承あり）など、それぞれ別の条件が付きます。
使っているデータの出どころ・ライセンス・加工した内容は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にまとめてあります。
