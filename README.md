# 100 DAYS / 100 APPS

1日1個Webアプリを作って公開する100日チャレンジのリポジトリ。
AIと一緒に作りながら、「AIに任せたこと」と「自分で考えたこと」を毎日記録していきます。

**公開ページ: https://hundred-days.pages.dev/**

## アプリ一覧

| Day | アプリ | 公開URL |
|---|---|---|
| 001 | [集中タイマー](apps/day-001-focus-timer/) | https://hundred-days.pages.dev/day-001-focus-timer/ |

## 1日アプリのルール

- 1つの公開URL・1つの主要アクション・1本のハッピーパス
- アカウント不要・課金なし・機微データは扱わない
- 100個すべてを記録する（100個すべての公開は約束しない）

## 構成

- `apps/day-NNN-<name>/` — 各日のアプリ本体と記録（`meta.json`）
- `scripts/build.mjs` — `dist/` に一覧ページと各アプリを生成（依存パッケージなし）
- ホスティング: Cloudflare Pages（1プロジェクトに全アプリをパスでルーティング）

```bash
npm run build   # dist/ を生成
npx wrangler pages deploy dist --project-name=hundred-days
```
