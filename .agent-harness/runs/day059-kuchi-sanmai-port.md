# Day059 移植記録（口さんまい）

2026-10-06。手元の試作の標準版（ログインなしで動く版）を、Day59「口さんまい」（`day-059-kuchi-sanmai/`）として移した。
アプリ名とフォルダ名は作業中に決まり、フォルダは最初から `day-059-kuchi-sanmai` で作った（この記録のファイル名だけ仮の名前のまま）。commit・push・PR はしていない。制作時間は未計測で、meta.json の actualMinutes は0。

## 写したもの・写さなかったもの

- 写した：`src/`（認証の `src/auth/`・`src/components/Auth/` と認証のテストを除く）、`public/`（見本4枚・テスト音・ライセンス表示）、`index.html`、`vite.config.ts`、`tsconfig.json`・`tsconfig.app.json`・`tsconfig.node.json`、`tools/` の `generate-notices.mjs`・`gen-sample-audio.mjs`・`gen-sample-sprites.mjs`、`package.json` と lockfile。見本の5ファイルは、権利の調べに記録されたハッシュと一致した。
- 一覧には無かったが足した：lint の設定 `.oxlintrc.json`（7行）。`npm run lint` を元と同じ規則で動かすため。
- 写さなかった：`worker/`・`migrations/`・`vendor/`・`wrangler*.jsonc`・`docs/`（06〜10 に加えて01〜05も）・`.agent-harness/`・`dist*`・`node_modules`・試作の `shared/`（認証版の文書）・`src/assets/`（雛形の画像2つ）・`public/legal/SERVER_THIRD_PARTY_NOTICES.txt`・試作の README（認証版と限定テスト環境の記述があるので、Day の README は書き起こした）。
- 写してから外した：同意画面（`ConsentBoundary.tsx`・`consentContext.ts`）と同意の保存（`src/lib/consent.ts` とそのテスト）。写していない文書を指すコメント「契約: docs/02_architecture.md」10行。
- 依存：better-auth・@better-auth/utils・wrangler・miniflare・esbuild（認証版のテスト用）と、認証・ステージング・Worker・ハーネスのスクリプトを外した。lockfile は元のものに `npm install` と `npm prune` をかけて作り直した。配る8パッケージの版は元のまま（react 19.3.0・vite 8.3.0 など）。

## 変えたこと

- 名前は `source/src/appName.ts` の `APP_NAME`（読みの `APP_READING` も同じファイル）と `source/index.html` の `<title>` だけで決まる。ライセンス表示の見出しも `generate-notices.mjs` が `APP_NAME` から作る。favicon の `<title>` は外した。
- 運営者は「100 DAYS / 100 APPS（haranishi）」、お問い合わせは X の @haranishi_ikki と GitHub の Issue。規約・プライバシー・Cookieの説明は実際の配信（Cloudflare Pages・共通のプライバシーポリシー・アクセス解析なし）に合わせて書き直し、版と日付を 2026-10-06 にした。
- 同意画面を外し、開くとすぐスタジオが出るようにした。調べの2・3の注意書きを、キャラクター素材の欄・背景画像の欄・音声の欄（ファイルとマイクの両方）に常に出す。マイクの欄には「周りの人の声が入らない場所で使ってください。」を添えた。規約などは画面の下のリンク（`#terms` など）から重ねて読み、スタジオへ戻っても作業は残る。端末には何も保存しない。
- 配信は `base: './'`。ライセンス表示のリンクと見本は `import.meta.env.BASE_URL`（ビルドでは `./`）から、favicon は `%BASE_URL%` から読む。meta の CSP と開発用の `ws:` は外した。
- 画面の上に帯を足した。左が「100 DAYS / 059」（`../`）、右が「共有する」（`#share-dialog` を開く）。共有欄はサイト共通の部品。
- テスト用の窓口の名前を、試作の名前を含まない `window.__lipSyncDebug` に変えた。

## 変更ファイル一覧

- 新規：`day-059-kuchi-sanmai/`（107ファイル。公開物の `index.html`・`assets/`・`sample/`・`legal/`・`favicon.svg`・`shared/`、手で持つ `meta.json`・`README.md`・`tests/`、ソースの `source/`）、`tests/e2e/day-059.spec.mjs`、この記録。
- 変更：`scripts/build.mjs`（`SOURCE_DIRS_BY_APP`・`MEDIA_BY_APP` の ` blob:`・Day別の Permissions-Policy の表 `PERMISSIONS_BY_APP`）、`tests/e2e/security-headers.spec.mjs`、`static/privacy.html`、`THIRD_PARTY_NOTICES.md`、`docs/security.md`、`README.md`（`npm run index:sync`）。
- `source/` の中で書いた・書き換えたもの：新しく `src/appName.ts`・`src/legal/notices.ts`・`src/components/Legal/PolicyBoundary.tsx`・`RightsNotice.tsx`・`src/components/DayBar/`・`tools/release.mjs`・`.gitignore`・`public/shared`（`../../shared` へのリンク。Day58と同じ）。書き換えは `src/legal/policies.ts` とそのテスト・`LegalFooter.tsx`・`legal.css`・`main.tsx`・`App.tsx`・`CharacterUploader.tsx`・`AudioControls.tsx`（と CSS）・`AnimationControls/index.tsx`・`CanvasPreview/index.tsx`・`index.html`・`vite.config.ts`・`package.json`・`package-lock.json`・`public/favicon.svg`・`public/sample/README.md`・`tools/generate-notices.mjs`。

## 関門の結果

`day-059-kuchi-sanmai/source` で：

- `npm ci`（108パッケージ）→ `npm test`（vitest 8ファイル・129件合格）→ `npm run build`（prebuild がライセンス表示を作り直す）→ `node tools/release.mjs`（index.html・favicon.svg と assets/ 3・sample/ 6・legal/ 1 ファイル）。ビルドを作り直しても、公開物のハッシュは変わらなかった。
- `node tools/generate-notices.mjs --check`：「Third-party notices are current (8 distributed packages).」
- `npx oxlint`：58ファイル・116規則で指摘0。

リポジトリ直下で：

- `node --test day-059-kuchi-sanmai/tests/`：8件合格。`npm run test:unit`：2452件（合格2451・既存のskip 1・失敗0）。
- `npm run build`：59 day(s) / 公開59（うち外部3）。`npm run precheck`：漏洩パターン検出なし。Day59のテキストに警告なし（画像・音の「目視確認が必要」は従来どおり出る）。
- `PLAYWRIGHT_PORT=4279 npx playwright test tests/e2e/day-059.spec.mjs tests/e2e/shared-share.spec.mjs tests/e2e/security-headers.spec.mjs`：240件中239件合格。落ちたのは shared-share の「Day 059 口さんまい › リンクを貼ったときに中身が出る（OGPとcanonical）」の1件で、screenshot.webp が無く og:image がサイト共通の画像になるため（予想どおり）。Day59の8件（録画の通しを含む）と security-headers の6件は合格した。4173番は空いていたが、並行の作業とぶつからないよう4279番を使った。

## Permissions-Policy の実測（wrangler pages dev）

試作側に入っている wrangler 4.135.0 で、hundred-days の dist を `wrangler pages dev dist --port 8799` で配り、`curl -sI` で読んだ。

- `/day-059-kuchi-sanmai/`：`permissions-policy: geolocation=(), camera=(), microphone=(self), payment=(), usb=()`。値は1本だけで、全体の値はつながっていない。CSP の `media-src 'self' blob:` も付いた。
- `/day-058-meisho-kumitate/`：`permissions-policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()`。
- Day59 の配下（`legal/THIRD_PARTY_NOTICES.txt`・`sample/demo-tone.wav`）も Day59 の値。`/` と `/day-001-focus-timer/` は全体の値。末尾の / が無い `/day-059-kuchi-sanmai` は 308 で / 付きへ移り、移る前の応答は全体の値。
- 実際のヘッダーの下で Chromium（偽のマイク）を動かした。Day59 では `getUserMedia` が通り、画面の「マイクを開始」で入力が始まった。Day58・Day1 では、同じオリジンで許可済みでも `NotAllowedError` になった。見本の再生と録画のプレビューは blob: で動き、CSP違反・外への通信・エラーは0件。
- 配っていない `legal/SERVER_THIRD_PARTY_NOTICES.txt`・`source/`・`tests/` のパスは、Pages の既定どおりサイトのトップページ（200）が返り、中身は出ない。

## 判断したこと

- 注意書きは、背景画像の欄にも出した。指示は「画像を選ぶ欄」で、背景も利用者が選ぶ画像だから。
- security-headers の接続先の網に、React の本番ビルドが持つ `https://react.dev/errors/` を「通信しないURL」として足した。React を同梱した Day は初めてで、足さないと Day59 が「react.dev に繋ぐのに connect-src が許していない」で落ちる（実際に Day59 の JS で拾われるのはこの2か所だけ）。除外は react.dev の `/errors/` に絞った。
- E2E の「44px以上」は、足した帯の2つだけを見る。元の画面のボタンは40pxで、今回は直していない。
- プライバシーページの Day59 の段落は、新しい節「マイクと、選んだファイルの扱い」に置いた。外部通信と端末保存のどちらの節にも当たらないため。調べの文に「マイクを使えるのはこのアプリのページだけ」の1文を足した（上の実測のとおり）。
- Cookie の説明に、トップページの GA4 の Cookie がブラウザから送られることがあること、サイトのデータをまとめて消すとほかの Day の記録も消えることを足した（調べの推奨）。
- 共有文は `<title>` から作られる。`share:text` を置くと名前を書く場所が3つになるので置いていない。
- meta.json の tags は仮。sourceOfIdea・aiHandled・humanHandled・failuresAndFixes は空のまま（あとでメインが書く）。

## 残った課題

- screenshot.webp と demo.mp4 が無い。無いままだと、CI の shared-share で上の1件が落ちる。作ったら meta.json に `screenshot` と `demo` を書く。
- Day58 の `day058-game.yml` のような、ソースから作り直したビルド結果の一致を見る CI は足していない。
- Day 59 の番号が、別ブランチの Day 59（`feat/day059-laureate-age`）と重なっている。
- Safari/iOS・Firefox と実機のマイクは試していない。元の画面のボタン（40px）を44pxにそろえるかも未判断。

## UI採点1周目の修正

スクショだけの採点で12/20（不合格）。採点表の指示のうち、効果の大きい順に1〜8と、追加の3つ（M6・L4・L1）を直した。

### 直したもの

- H1：プレビューのカードの「口の状態／入力レベル／まばたき」の上に、再生の操作（↺・▶ 再生／Ⅱ 一時停止・0:00 / 0:14）を置いた。音声の欄と同じ部品（`Transport.tsx`）で、同じ状態を指す。testid は `preview-play` などに分け、`audio-play` は音声の欄にだけ残した。
- H2：見本を読み込んだあとの案内の横（スマホでは下）に「▶ 再生してみる」を置いた。押すと、プレビューが画面から外れているときだけ一瞬で移動し、見本を最初から鳴らす。移動を待たないのは、スマホの Safari が「押した操作の中で始めた再生」しか音を出さないため。
- M1：「サンプルで試す」を説明文の直下・左寄せに移した。素材がそろうまでは塗り、そろったら枠線に戻る。
- M2：390px でも、補足行の下に「素材は端末の外に送られません」を出す（見出しの「ブラウザ内で完結」が隠れる幅だけ）。
- M3：カードの見出しの番号をやめた（「CHARACTER」「AUDIO」）。
- M4：「ご注意」は文言を削らず全文を出したまま、本文を補足文と同じ大きさ・色（10px・#99abad）にした。黄の見出しと枠は残し、音声の欄では末尾へ移した。マイクの「周りの人の声が…」も補足文の書式にそろえた（L9）。
- M8：`body` に `line-break: strict`・`text-wrap: pretty`・`word-break: auto-phrase`。見出し・案内・注意書き・補足の決まった文は、文節ごとに `<wbr>` を入れ、`word-break: keep-all` と `overflow-wrap: anywhere` を併用した（`Phrases.tsx`、区切りは文字列の「|」）。keep-all でも閉じかっこの後ろでは折れる（「グリーン」／を）ので、文節の中の閉じかっこの後ろに U+2060 を挟んだ。Chromium で 390・768・1280px を調べ、行頭の「ー」・小書きの仮名・句読点は0件。
- M9：口の状態は「とじ／小／大」、まばたきは「ひらいている／とじている」。大きさは「1,080 × 1,920」、時間は「0:00」、レベルは「入力レベル」の名前で小数2桁、倍率は「3.00×」「1.00×」にそろえた（`src/lib/format.ts`）。入力レベルの右端は「いま：とじ」にした（L3の一部）。使い方の窓の「最初から再生して自動停止」は、実際の名前「音声の最初から録画する」に直した。
- M10：動画のサイズと「音声ファイル／マイク」の選択中に ✓ を付けた。切替は地を明るくし、ミントの下線も付けた。背景の見本にも ✓ の札を付けた（読み上げには含めない）。
- M6：画像4枠が768px前後で隣と接していた。原因は最低の高さ（118px）が縦横比を通して幅の最低値になり、枠が列からはみ出したこと。最低の高さを外し、12px の間隔が出るようにした。
- L4：使えないトグルは本体とラベルだけを暗くし、説明文は補足文の色（約7:1）のまま読めるようにした。
- L1：見出しの下は読み「くちさんまい」だけにし、プレビューの空表示の標語は「まだ画像がありません」に替えた。黒の背景の見本の枠も少し明るくした（L5）。

### 直さなかったもの

- M5（透明の注意を1か所にまとめ、書き出すと黒の札を出す）：黒になるかはブラウザと形式によるので、言い切れるかを確かめてから直す。
- M7（768pxの列幅と右列の固定）・M11（規約の末尾の戻るボタン）・L2（案内の行の高さを最初から確保）・L10〜L17：指示の範囲外。
- L6（トグル・つまみの大きさ）・L7（削除の押せる範囲と元に戻す）・L8（↺ の文字）：部品全体の作りを変えるので、今回は見送った。↺ には読み上げ用の名前「最初から再生」と title が付いている。

### 関門の結果（1周目の修正のあと）

- `day-059-kuchi-sanmai/source`：`npm test` 9ファイル・134件合格（表記と文節の区切りのテスト5件を足した）。`npm run release` が通り、`generate-notices.mjs --check` は8パッケージ。oxlint は指摘0。
- リポジトリ直下：`node --test day-059-kuchi-sanmai/tests/` 8件合格。`npm run build` と `npm run precheck`（漏洩パターンなし、Day59のテキストに警告なし）が通った。
- `PLAYWRIGHT_PORT=4279 npx playwright test tests/e2e/day-059.spec.mjs tests/e2e/shared-share.spec.mjs tests/e2e/security-headers.spec.mjs`：242件すべて合格。screenshot.webp ができたので、shared-share の OGP の1件も通った。Day59 の E2E は、「再生してみる」とプレビューの再生操作、表記と ✓、注意書きの書式と位置を見る2件を足して10件になった。
- メインが作った `demo-scenario.mjs` は書き換えていない。直した画面で待ち時間だけ短くして最後まで流し、エラー0件で動いた（使っている testid・「サンプルを読み込みました。」・「グリーン」のボタンは残っている）。ヘッダーの生成は今回変えていないので、wrangler の実測は前のまま。
