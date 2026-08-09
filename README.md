# 100 DAYS / 100 APPS

1日1個Webアプリを作って公開する100日チャレンジのリポジトリ。
AIと一緒に作りながら、「AIに任せたこと」と「自分で考えたこと」を毎日記録していきます。

**公開ページ: https://hundred-days.pages.dev/**

## アプリ一覧

| Day | アプリ | 公開URL |
|---|---|---|
| 001 | [集中タイマー](apps/day-001-focus-timer/) | https://hundred-days.pages.dev/day-001-focus-timer/ |
| 002 | [ドット絵メーカー](apps/day-002-pixel-art/) | https://hundred-days.pages.dev/day-002-pixel-art/ |

## 1日アプリのルール

- 1つの公開URL・1つの主要アクション・1本のハッピーパス
- アカウント不要・課金なし・機微データは扱わない
- 100個すべてを記録する（100個すべての公開は約束しない）

## 構成

- `apps/day-NNN-<name>/` — 各日のアプリ本体と記録（`meta.json`）
- `scripts/build.mjs` — `dist/` に一覧ページと各アプリを生成（依存パッケージなし）
- ホスティング: Cloudflare Pages（1プロジェクトに全アプリをパスでルーティング）

```bash
npm run precheck   # 初回は下記の個人NGワード設定が必要
npm run build      # dist/ を生成
npx wrangler pages deploy dist --project-name=hundred-days
```

初回のみ、公開したくない実名・所属ID・取引先名などをローカル専用ファイルに設定します。

```bash
cp .precheck-ng.example.txt .precheck-ng.txt
npm run precheck   # 公開前チェック（シークレット等の漏洩スキャン）
```

`.precheck-ng.txt`はGitの追跡対象外です。ファイルが無い場合、公開前チェックは失敗します。

## X投稿の準備

本文・リプライを`meta.json`から生成し、公開前チェック、本番URL、縦型動画、文字数をまとめて検証します。

```bash
npm run x:prepare -- --day 1 \
  --video "$HOME/Downloads/day-001-focus-timer-demo-x.mp4" \
  --media-reviewed
```

出力先は`.social-output/day-NNN/`です。実際の公開前に、Xのアカウント、本文、添付動画、最終プレビューを人が確認します。
