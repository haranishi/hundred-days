# Day99 meibo 宣伝動画ツール 検証記録

対象：T4（`day-099-meibo/tools/promo/`・`day-099-meibo/tests/` の作成、UI-1 後半修正、ならびに第 1 稿の採点・目視で見つかった 9 点の修正）。
実施日：2026-11-24（サンドボックス環境：Node v24.22.1・FFmpeg 8.1.2。Chromium・Playwright・ローカルサーバー起動は不可）。

## 1. 修正したファイル（第 1 稿レビュー 9 点対応）
- `day-099-meibo/tools/promo/timeline.mjs` …
  1. UI-2 受注移動を 4 段階化：`14.0` カード黄色枠（`proposalTopDealCard`, `hold: 0.75`）→`14.2` 選択欄へ指着地・波紋（`focus-deal-stage`, `lead: 0.4`）→`14.3` 表示値のみ `'4'`（`preview-deal-stage`, `cue: click`）→`14.75` `change` 発火移動（`move-deal-won`, `cue: won`）→`14.9` 受注列パン（`over: 0.65`）→`15.35` 移動後カード強調（`hold: 1.15`）。
  2. UI-3 着地予測の大きな札・カード強調を `19.0–19.9`（`hold: 0.9`）へ短縮し、20.0 のカメラ移動前に完全消去。
  3. UI-3 の横送り `projectionRight` を廃止し、`20.0` に `projectionLeft`（`over: 0.55`）で停止。`20.3–22.8`（`hold: 2.5`）に「目標との差」の大きな札（`valueFrom: 'projectionDiffs'`）と `projectionTable`・`projectionDiffColumn` 強調を配置。
  4. `END_CARD.cta = 'GitHubで見る'` と `END_CARD_LAYOUT` / `computeEndCardLayout()` を追加し、安全域 `y=77..768`（算出 `y=152..601`）・非重複・幅を `selftestStoryboard()` で検証。
  5. `CAPTIONS[1]`（2.0–4.0 秒）へ `tag: '営業リストの架電に'` を追加（正本字幕文言は不変）、`STAGE.captionTag`（`top: 205`）の安全域・幅を検査。
  6. `STAGE.footerBrand`（`営業リスト向けのCRM`・高さ 16px ロゴ）を追加。
  7. `AI_CLIPS.b.defaultIn` を `0.5`（0.5–7.5 秒）へ変更。
- `day-099-meibo/tools/promo/render-promo.mjs` …
  - `focus-deal-stage`・`preview-deal-stage`（`el.value = '4'` のみ、14.55→14.71 で指の輪を消去）・`move-deal-won`（`change` 発火・指の輪強制消去・`report.readValues.movedDeal` 維持）を実装。
  - `boardStart` と `board-pan` の上端余白を `computeBoardTopPad()`（8–12px、直前の説明文を横切らない余白）へ統一。
  - `projectionRight` / `S.projPan` を削除し、`projectionLeft` 時に `scrollLeft = 0` を保証。`extractProjectionDiffRows()`・`isNegativeCurrency()`・`readProjectionDiffColumnRect()`・複数行 `createCalloutState()` を実装（読み取れなければ札を出さず `report.warnings` へ記録）。
  - ロゴ撮影を `.brand-mark` と右の文字 `meibo` の外接矩形＋上下左右 2px（`computeLogoClip()`）の `page.screenshot({ clip })` へ変更（失敗時は `a.brand` 要素撮影へフォールバック）し、背後の明色背景（`logoBg`）も渡す。
- `day-099-meibo/tools/promo/stage.html` / `stage.css` / `stage.js` …
  - 2.0–4.0 秒の字幕下タグ `#cap-tag`（y=205・角丸枠・20px 太字・琥珀色）、複数行対応 `#callout .callout-rows`（負は `#C62828`・0 以上は `#0B2545`）、UI 下端左のブランド表示 `#footer-brand`（高さ 16px ロゴ＋12px 白 90%「営業リスト向けのCRM」・AI 場面非表示）、終わりのカード `#end-cta`（18px 太字・琥珀色「GitHubで見る」・`#end-inner` `top: 152px`・`#end-brand-card` 不透明白＆左右等余白）を実装。
- `day-099-meibo/tools/promo/promo-audio.mjs` … `click` 効果音（0.12s）を追加し、更新後の `CUES`（14 件：`click=14.3s`・`won=14.75s`）で A/B 両案を再生成。
- `day-099-meibo/tools/promo/README.md` / `.kiro/specs/day-099-meibo/design.md` … 照合表へ 2–4 秒の札の行と修正内容、AI-B 入り点既定 0.5 秒を反映（正本の字幕文言は不変、README は 67 行）。
- `day-099-meibo/tests/promo/{timeline,cli,audio}.test.mjs` … 9 点の修正と 30fps コマ丸め後 `cues.json` での主要合図 3dB 立ち上がりを含む単体試験を追加（21 件）。

## 2. 実行した検査と結果（第 1 稿レビュー修正後）

| コマンド | 結果 | 要点・実測値 |
|---|---|---|
| `node --test day-099-meibo/tests/` | 合格 | 21/21 PASS（絵コンテ・正本字幕一致・札/CTA 安全域と非重複計算・UI-2 4段階移動・UI-3 残像防止/2行札/正負判定・ロゴ clip/ボード上端余白計算・コマ丸め `cues.json` 含む音声合成・README 100行以内） |
| `node day-099-meibo/tools/promo/render-promo.mjs --selftest` | 合格 | `SELFTEST PASS: 900 frames (30s @ 30fps), 5 scenes, 9 captions, 14 cues, demo=15.6s` |
| `node day-099-meibo/tools/promo/promo-audio.mjs --variant a` | 合格 | `A: 30.000 s, -16.01 LUFS, -2.51 dBTP; PASS (22項目)` |
| `node day-099-meibo/tools/promo/promo-audio.mjs --variant b` | 合格 | `B: 30.000 s, -16.01 LUFS, -2.62 dBTP; PASS (22項目)` |
| `node day-099-meibo/tools/promo/verify-audio.mjs` | 合格 | A（`-16.01 LUFS, -2.51 dBTP`）・B（`-16.01 LUFS, -2.62 dBTP`）とも 22 項目全合格・スペクトログラム生成確認 |
| `npm run check:syntax` | 合格 | `JavaScript構文: 2955ファイル、エラー0件` |
| `npm run precheck -- --public` | 合格 | `OK: 漏洩パターン検出なし`（exit 0） |

## 3. 未検証の部分（実環境で確認が必要）→ 2026-11-24 に §5 で確認した
1. 実ブラウザ（Playwright/Chromium）および `meibo serve` 起動を含む全撮影（サンドボックスではブラウザ・サーバー起動不可）。
2. **14.0–14.9 秒の実動作**：`select.value = '4'` 代入時に `change` が発火せず「受注」が 0.45 秒間表示されること、14.75 秒の `new Event('change', { bubbles: true })` で実際に受注列へ移動して再描画されること、指の輪が 14.9 秒まで（実際には 14.71 秒）に消えて次カードの上に残らないこと。
3. **12.5 秒の上端切り取り**：`.crm-board` 上端からの余白（`computeBoardTopPad`）で説明文が途中で切れないこと。
4. **19.9–22.8 秒の表示**：19.9 秒で「着地予測」札が完全消去されること、20.0 秒の `projectionLeft` で担当名が収まり 20.3–22.8 秒に画面から読んだ 2 行の「目標との差」札（負が赤 `#C62828`）と列強調が表と重ならず表示されること。
5. **冒頭 2–4 秒の札・UI 下端左ブランド・終わりのカード**：`#cap-tag`（y=205）、`#footer-brand`（16px ロゴ＋文字、AI 場面非表示）、`.brand-mark`＋`meibo` の `clip` 撮影（`report.readValues.logoCaptureMode === 'clip'`）で白い箱の境目が消えていること、「GitHubで見る」の見た目。
6. **差し替え `ai-b-take2.mp4`（既定 0.5–7.5 秒）**の実連番展開・書き出し・再生成音源（14.3s `click`→14.75s `won`）の耳による試聴および第 2 稿の画像採点。

## 4. 親（実ブラウザ）で最初に確かめるべき箇所 → §5 で確認した
1. **14.0–15.0 秒のコマ確認（例：`--frames 415-465`）**：14.0 で提案先頭カードに黄色枠、14.2 で選択欄に指と波紋、14.3–14.73 でカード移動前に選択欄が「受注」表示、14.75（443 コマ）で移動し指の輪が別カード上に残らないこと、`capture-report.json` の `readValues.movedDeal` が埋まること。
2. **19.8–22.8 秒のコマ確認（例：`--frames 590-690`）**：20.0 で「着地予測」の残像が無いこと、担当名が画面内にあり、20.3–22.8 で「目標との差」2 行札（負は赤）と黄色枠が表と重ならず出ること。
3. **12.5 秒・2.5 秒・27.0 秒の目視**：12.5 秒で盤上の説明文が切れないこと、2.5 秒で「営業リストの架電に」札が見えること、UI 下端左のブランド表示と終わりのカード（ロゴ境目なし・「GitHubで見る」・`logoCaptureMode: "clip"`）および `ai-b-take2.mp4` の 0.5–7.5 秒のつながり。

## 5. 親（実ブラウザ）での撮影・確認と、公開前の検査（2026-11-24）

§3・§4 の未確認は、ここで確かめた。環境は、Playwright 1.62.1（Chromium）・ffmpeg 8.1.2・meiboの実行ファイル（2026-11-20版）・複製したデモDB（合成・商談9件）。実行ファイルとDBの sha256 は、撮影のたびに `capture-report.json` に残る。

### 5-1 撮影の前に、実際のmeiboで確かめたこと
| 確かめたこと | 結果 |
|---|---|
| 保存した再架電は、どこに出るか | ホームの「再架電」には出ない（期限が来たものだけが出る）。取引先一覧の「次回対応」に、翌日9時の日付（2026/11/25 09:00）が入る |
| 「保存して次へ」 | 活動メモが必須。保存するとトースト「架電を記録し、再架電を予約しました。」が出て、次の取引先へ進む |
| 受注へ動かすと、月次集計は動くか | 動く。前：月次受注額 ￥320,000・受注率 50%・確度加重見込み ￥650,000・着地予測 ￥970,000。後：￥620,000・66.7%・￥470,000・￥1,090,000 |
| 期限の言い方 | 画面は「土日を除く翌日9時」。meiboの文書は「翌平日の朝9時。祝日も平日として数える」。字幕は「土日を除く翌日の朝9時」にした（「営業日」は祝日を飛ばすと読めるため使わない） |

### 5-2 撮影の結果（最終版）
- 900コマ・約60秒・警告0件・見つからなかった部品0件。音（A・B）は22項目に合格（−16.01／−16.00 LUFS・−2.46／−2.45 dBTP）。
- 画面から読み取った値（`capture-report.json`）：次回対応 2026/11/25 09:00（株式会社物産桜ホーム）、受注へ動かした商談（合成・受注管理画面の改修・￥300,000・提案→受注）、着地予測 ￥1,090,000、担当1の目標との差 ￥520,000・担当2は -￥30,000。
- 撮影で見つけて道具に入れた直し：アプリのCSPが撮影用CSSを止める（`bypassCSP`）／`clock.pauseAt` は未来の時刻だけ／`hidden` 属性が `display` に負ける／トーストが右端で切れる・次のボタンに重なる／月の入力欄が英語表記（`--lang=ja-JP`）。理由は `tools/promo/README.md`。

### 5-3 採点（画像だけ・16点以上で合格）
Codex・Grokは利用枠切れで未実施。OpusとAntigravityの2系統。

| 周 | Opus | Antigravity |
|---|---|---|
| 1 | 16 | 14 |
| 2 | 16 | 16 |
| 3 | 実施せず | 17 |

### 5-4 独立レビュー（Opus・読み取り専用）
リポジトリの変更を読み、10件の指摘が出た。直した点は、字幕の「翌営業日」（祝日も平日として数えるmeiboの仕様と違う）、設計書・READMEとコードの時刻や寄せ方の食い違い、「顔を映さない」の記述、検証の記録の不足、道具の後始末（meiboの起動に失敗するとNodeが終わらない）、DBの複製で `-wal` を落とす恐れ、モデル名の不統一、言い過ぎ（「ひとつの画面で」「高速な」）、公開リポジトリに書いた運用上のパス。足した試験は、設計書の字幕と時刻をコードと照合する試験と、公開する文面に「営業日」を使わない試験。画面の案件名の接頭辞「合成・」と架空の社名は、「画面は合成データです」の表示で補うため残した。

### 5-5 公開前の検査
| コマンド | 結果 |
|---|---|
| `npm run precheck` | OK（漏洩パターンなし） |
| `npm run check:syntax` | OK（2955ファイル・エラー0） |
| `npm run test:unit` | 6661件中 6660件合格・1件スキップ・失敗0（Day99の試験は23件） |
| `npm run audit:deps` | 19プロジェクト・失敗0 |
| `npm run build` | OK（公開99・うち外部12・動画73）。`dist/day-099-meibo/` に出るのは `screenshot.webp` と `demo.mp4` だけ |
| `npm run publish:check -- --day 99` | 対象外（アプリ本体を持たない外部Day） |
| `npm run x:prepare -- --day 99 ...` | OK（本文 279／280・返信 125・226・261／280。GitHubのページを確認） |

### 5-6 権利
画面は、自作アプリの合成データ。人物映像は、Flow（Gemini Omni 1.2 Flash）で生成（動画の終わりのカードと返信3本目に、AI生成と明記）。BGMと効果音は、Nodeの計算だけで合成。字幕の書体は Zen Kaku Gothic New（OFL・リポジトリ非同梱）。ロゴはmeibo自身のもの。

### 5-7 本人の確認（未了）
BGMの試聴（A・B）／スマホ実機での見え方／X投稿／マージの承認／名前の商標の照合／個人情報・営業活動の法規の専門家確認。
