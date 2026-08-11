# 運用手順（Day追加・公開前チェック・X投稿の準備）

日々の公開作業で使う内部向けスクリプトの手順。アプリ本体には影響しない。

## Dayを1本追加する

1. `apps/day-NNN-<name>/` にアプリ本体と `meta.json` を置く
2. **一覧用のスクショとデモ動画を作る**（下記「デモ動画とスクショを作る」）
   - `meta.json` に `"screenshot": "screenshot.webp"` と `"demo": "demo.mp4"` を書く（フォルダ内のファイル名だけ。パスは書かない）
   - 省略しても壊れない。スクショが無い場合はトップページで夜空グラデーション＋Day番号のプレースホルダになる
3. `npm run build` → `npm run precheck` → デプロイ
4. X投稿後に `meta.json` の `xPostUrl` を追記して再デプロイすると、カードに「X投稿」リンクが出る

トップページ（`dist/index.html`）は `scripts/build.mjs` が `meta.json` から自動生成する。
公開アプリ数・制作時間・制作日数・タグフィルタ・制作メモは、すべて `meta.json` の実値から作られるので、
一覧ページ側を手で書き換える作業は無い。

`status` が `published` 以外のDayはアプリ本体をデプロイしないが、スクショだけはコピーして一覧に載せる。

### 統計ストリップの表示ルール

数字が事実と食い違わないよう、次の条件で表示を変えている。数え方を変えるときはここも直す。

- **制作時間**：`actualMinutes` が未記入（0）のDayが1つでもあると、ラベルは `制作時間（記録分）` になり `記録済み N/M 日` を添える。全Day記入されると `総制作時間` に変わり注記が消える。1件も記録が無いときは `0分` ではなく `—`
- **制作日数**：`startedAt`・`finishedAt` に現れた日付の重複を除いた総数。「連続日数」は使わない（最新の作業日を起点に数えるので、何日空けても古い値を表示し続けてしまう）

## デモ動画とスクショを作る

一覧カードの再生ボタンで流れる `demo.mp4`（720×1280・縦型・音声なし）と、そのポスターも兼ねる
`screenshot.webp`（1200×750）を、Playwrightの録画機能で作る。

```bash
PLAYWRIGHT=/path/to/playwright/index.js \
  node scripts/record-demo.mjs --day 4
```

`--video-only` / `--shot-only` で片方だけ作り直せる。webm→mp4の変換に ffmpeg、WebP化に cwebp（無ければ ffmpeg）を使う。

**操作の振り付けは `apps/day-NNN-<name>/demo-scenario.mjs` に置く。**

```js
export default async function (page, h) {
  await h.pause(1600);                       // そのまま見せる
  await h.slide('#amount', 6, 7, 900);       // rangeを1段ずつ動かす
  await page.click('#seg-kind button[data-v="2"]');
  await h.scrollTo('.burden');               // 要素まで滑らかにスクロール
  await h.scrollTop();                       // 先頭へ戻る
}
```

尺は15〜20秒が目安（Day001は19秒、Day003は17秒）。**生成後は必ず動画とスクショを目視すること**
（CLAUDE.md 公開前チェック②）。フレームを抜いて確認するなら `ffmpeg -ss 3.4 -i demo.mp4 -frames:v 1 f.png`。

## OG画像を作り直す

`static/assets/og.png`（1200×630・XやSlackのリンクカードに出る画像）は `scripts/og-template.html` から生成する。
**Day数など増えていく数字は焼き込まない**（毎日作り直しになるため）。

```bash
PLAYWRIGHT=/path/to/playwright/index.js node scripts/make-og.mjs
```

このリポジトリは依存パッケージゼロを保つので Playwright は入れず、`PLAYWRIGHT` に別プロジェクトのパスを渡して借りる。
文言を変えるときは `og-template.html` を編集してから実行し、**生成後に必ず画像を目視する**。
`npm run build` からは呼ばれない（`static/` の中身がそのまま `dist/` に入る）。

## 公開前チェック（precheck）

初回のみ、公開したくない文字列をローカル専用ファイルに設定する。

```bash
cp .precheck-ng.example.txt .precheck-ng.txt
npm run precheck   # 公開前チェック（シークレット等の漏洩スキャン）
```

`.precheck-ng.txt` はGitの追跡対象外。ファイルが無い場合、公開前チェックは失敗する。

## X投稿の準備

本文・リプライを `meta.json` から生成し、公開前チェック、本番URL、縦型動画、文字数をまとめて検証する。

```bash
npm run x:prepare -- --day 1 \
  --video "$HOME/Downloads/day-001-focus-timer-demo-x.mp4" \
  --media-reviewed
```

出力先は `.social-output/day-NNN/`。実際の公開前に、本文・添付動画・最終プレビューを人が確認する。
