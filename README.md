# 100 DAYS / 100 APPS

1日1個Webアプリを作って公開する100日チャレンジのリポジトリ。
AIと一緒に作りながら、「AIに任せたこと」と「自分で考えたこと」を毎日記録していきます。

**公開ページ: https://hundred-days.pages.dev/**

## アプリ一覧

| Day | アプリ | 公開URL |
|---|---|---|
| 001 | [集中タイマー](apps/day-001-focus-timer/) | https://hundred-days.pages.dev/day-001-focus-timer/ |
| 002 | [ドット絵メーカー](apps/day-002-pixel-art/) | https://hundred-days.pages.dev/day-002-pixel-art/ |
| 003 | [タップ花火](apps/day-003-tap-fireworks/) | https://hundred-days.pages.dev/day-003-tap-fireworks/ |
| 004 | [奨学金、何歳まで返す？](apps/day-004-scholarship-repay/) | https://hundred-days.pages.dev/day-004-scholarship-repay/ |
| 005 | [その写真、何色でできてる？](apps/day-005-color-palette/) | https://hundred-days.pages.dev/day-005-color-palette/ |
| 006 | [構造化データ、いま出るやつだけ](apps/day-006-schema-jsonld/) | https://hundred-days.pages.dev/day-006-schema-jsonld/ |
| 007 | [ひといきピアノ](apps/day-007-web-piano/) | https://hundred-days.pages.dev/day-007-web-piano/ |
| 008 | [じはんきレーダー](apps/day-008-vending-radar/) | https://hundred-days.pages.dev/day-008-vending-radar/ |
| 009 | [秋田バスライブ](apps/day-009-akita-bus-3d/) | https://hundred-days.pages.dev/day-009-akita-bus-3d/ |
| 010 | [いま、誰かが書き直している](apps/day-010-wikipedia-live/) | https://hundred-days.pages.dev/day-010-wikipedia-live/ |
| 011 | [この写真、まだ場所を覚えている](apps/day-011-photo-metadata/) | https://hundred-days.pages.dev/day-011-photo-metadata/ |
| 012 | [海賊船の打ち返し係](apps/day-012-pirate-rebound/) | https://hundred-days.pages.dev/day-012-pirate-rebound/ |
| 013 | [政府はこう答えてきた](apps/day-013-gov-answers/) | https://hundred-days.pages.dev/day-013-gov-answers/ |
| 014 | [いま、日本でいちばん暑い場所](apps/day-014-hottest-now/) | https://hundred-days.pages.dev/day-014-hottest-now/ |
| 015 | [あなたの街のステータス](apps/day-015-town-stats/) | https://hundred-days.pages.dev/day-015-town-stats/ |
| 016 | [回線の犯人さがし](apps/day-016-line-suspect/) | https://hundred-days.pages.dev/day-016-line-suspect/ |
| 017 | [AIの読みが見えるリバーシ](apps/day-017-reversi-mind/) | https://hundred-days.pages.dev/day-017-reversi-mind/ |
| 018 | [秋田の飯は、打てた分だけ](apps/day-018-akita-typing/) | https://hundred-days.pages.dev/day-018-akita-typing/ |
| 019 | [そのままコード](apps/day-019-sonomama-code/)（Chrome拡張） | https://rairakku.vercel.app/sonomama-code |
| 020 | [モザイカー](apps/day-020-mozaiker/)（Chrome拡張） | https://rairakku.vercel.app/mozaiker |
| 021 | [ちかくのラジオ](apps/day-021-nearby-radio/) | https://hundred-days.pages.dev/day-021-nearby-radio/ |
| 022 | [その備蓄、何日もつ？](apps/day-022-stock-days/) | https://hundred-days.pages.dev/day-022-stock-days/ |
| 023 | [MAGTRACE](apps/day-023-magtrace/) | https://hundred-days.pages.dev/day-023-magtrace/ |
| 024 | [読めない地名が、向かってくる](apps/day-024-unreadable-places/) | https://hundred-days.pages.dev/day-024-unreadable-places/ |

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

- `apps/day-NNN-<name>/` — 各日のアプリ本体と記録（`meta.json`）＋一覧用スクショ（`screenshot.webp`）とデモ動画（`demo.mp4`）。どちらも任意
- `scripts/build.mjs` — `dist/` に一覧ページと各アプリを生成（依存パッケージなし）
- `static/` — 一覧ページ用の静的ファイル（OG画像など）。中身がそのまま `dist/` 直下に入る
- ホスティング: Cloudflare Pages（1プロジェクトに全アプリをパスでルーティング）

```bash
npm run build      # dist/ を生成
npx wrangler pages deploy dist --project-name=hundred-days
```

公開前チェックや投稿準備スクリプトの使い方は [docs/ops.md](docs/ops.md) にあります。
