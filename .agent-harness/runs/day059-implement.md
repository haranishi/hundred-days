# Day 059 実装記録

## 目的と範囲

年齢を1つ入れると、その歳で受賞した人を数えて一覧に出す。
REQUIREMENTS.mdと工程契約を正本として、アプリ・テスト・索引・CSP・出典・プライバシーを実装した。
外部通信は今年の公式API2本だけ。予想・写真・翻訳・国籍・評価は対象外。
commit・push・PR・ブランチ切り替え・依存追加は行っていない。

## 作ったもの

- 年齢1〜120の即時入力、分野の選択、空欄の事実、0人の答え、近い歳と最年少・最年長。
- 年齢の帯のSVGと「あなた」の印、受賞者一覧、30件の後の追加表示。
- 原文の受賞理由、±1歳・没後・辞退の注記、公式紹介リンク。
- 結果のX共有・文のコピー、共通共有欄。OGPとcanonicalはビルド側が付与。
- 2026年の発表待ち・発表済み・データ待ち・取得失敗・保存分表示と再試行。
- 年齢と今年の応答のlocalStorage保存。発表週30分／それ以外24時間のキャッシュ。
- 日本時間の時計と `?now=`。10月13日以降は年の見出しにし、発表日時を外す。
- 紙とインクの配色、システム書体、ダークモード、フォーカス表示、44px以上の操作要素。

## 変更ファイル

新規：

- `day-059-laureate-age/index.html`、`app.css`、`app.js`
- `day-059-laureate-age/lib/age.js`、`stats.js`、`text.js`、`clock.js`
- `day-059-laureate-age/lib/announcements.js`、`live.js`、`band.js`、`render.js`
- `day-059-laureate-age/tests/logic.test.mjs`、`live.test.mjs`、`render.test.mjs`、`index.mjs`、`package.json`
- `day-059-laureate-age/meta.json`、`README.md`、`data/SOURCES.md`
- `day-059-laureate-age/shared/share.css`、`shared/share.js`（共通正本から同期）
- `tests/e2e/day-059.spec.mjs`
- この実装記録

更新：`scripts/build.mjs`、`static/privacy.html`、`THIRD_PARTY_NOTICES.md`、ルート`README.md`。
既に渡された要件・契約・同梱JSON・取得ツール・実応答fixturesは変更していない。
新しい応答ファイルは不要だった。合成ケースはテスト内で実応答を複製し、Test Laureate A等を足す。

## 関門と証拠

| コマンド・確認 | 結果 |
| --- | --- |
| `TZ=UTC node --test day-059-laureate-age/tests/` | 26件成功、失敗0 |
| `TZ=Asia/Tokyo node --test day-059-laureate-age/tests/` | 26件成功、失敗0 |
| `npm run shared:sync` | 2ファイルを複製。既存Dayへの変更なし |
| `npm run index:sync` | 59件の索引を同期 |
| `npm run build` | 成功。59 Day、共有と索引の同期も検査 |
| `npm run precheck` | 成功、漏洩パターン検出なし。既存ファイル等の要確認警告1,157件 |
| `npx playwright test tests/e2e/day-059.spec.mjs tests/e2e/shared-share.spec.mjs tests/e2e/security-headers.spec.mjs` | 実行不能。サーバー起動時に環境が拒否。試験本体の実施0件 |
| 同じE2Eコマンドに `--list` を追加 | 253件を読み込み成功。Day 059専用22件、共通共有226件、ヘッダ5件 |
| `node --check`（app.js、Day 059 E2E） | 成功 |
| 生成物のCSP・canonical・OGPの直接検査 | 成功。接続許可はselfとapi.nobelprize.org。OG画像は共通画像にフォールバック |
| 基本文字色のコントラスト計算 | ライト／ダークの紙とパネルに対する文字色12組がAAを満たす（最小5.71:1）。実画面の検査とは区別 |

E2E停止のエラー：

```text
Error: listen EPERM: operation not permitted 127.0.0.1:4173
Error: Process from config.webServer was not able to start. Exit code: 1
```

実装確認値：マララ17、ブラッグ25、グッドイナフ97、スタインマン68（没後）、湯川42、坂口74。
同梱998回、30歳未満3回、中央値60歳、54歳34人。54歳の件数は別の暦日計算でも照合した。
初回のテスト期待値を34に訂正し、日付表示がIntlで「10/7」になる点はformatToPartsで「10月7日」に直した。
追加の描画試験で状態の文、一覧の追加、原文・注記、HTMLのエスケープを確認した。

## 判断したこと

- 仕様の「2025年まで同梱」と違い、渡されたJSONには2026年の医学賞3人も含まれていた。
  998回という受け入れ値と通信失敗時の即答を守るため、同梱分を削らずID・年・分野で今年の応答を上書きする。
  APIにない日本語名は既知の同梱ラベルを保持する。生年月日が未着なら既知の年齢を消さない。
- 今年の通信待ち・失敗は今年の欄だけに閉じ、アプリの答えは同梱分でreadyにする。
- API応答のlinksはたどらず、リダイレクトも拒否し、固定した2本だけを取得する。
- HTTP500のE2Eケースはfetchが受けるResponse(500)を再現する。
  ブラウザ自身のHTTPエラーログとアプリのconsole.errorを混同しないための再現で、他のAPI通信はpage.routeでfixturesを返す。
- 共有画像と動画は指示どおり作らず、metaの担当・失敗談は空配列として後工程に残した。
- REQUIREMENTS.mdのUX5階層を採用。年齢・答えを上部、今年の状態を下部に分け、0人の数字を大きくした。

## 残った課題

- 手元で上記E2Eコマンドを実行すること。横スクロール、実際のクリック、コピー、ブラウザのエラー0件はまだ確認できていない。
- スクリーンショットと独立UI評価は未実施。390/768/1280px・ライト／ダークの撮影をE2Eに用意した。
- screenshot.webpがないため、共通共有のDay 059「リンクを貼ったときに中身が出る（OGPとcanonical）」は
  `og:image`にDayのディレクトリが含まれる条件で失敗する見込み。実行で失敗した検査ではなく、生成物から確認した既知の条件差。
  今は実在する共通OG画像を指す。スクショを作る後工程でmetaへ追加する。
- 権利表記は渡された仕様のCC0に従った。Wikidataの構造化データのCC0は公式のLicensingを再確認。
  Nobel Prize API利用条件の一次ページは閲覧ツールから403で開けず、今回の全文再確認はできていない。
  メイン担当が一次ページを開いて照合する工程を残す。
- 公開・SNS投稿・本番確認は実施していない。metaのactualMinutes・担当・制作体験はメイン担当が記入する。
