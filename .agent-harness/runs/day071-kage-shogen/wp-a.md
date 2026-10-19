WP-A 実装記録（2026-10-19）

依頼書の順に既存の指示・仕様・参照実装・Day070を読み、テストを先に追加してから実装した。Node.js v24.12.0で検証した。

本作業で新規作成したファイルは、`day-071-kage-shogen/` 内の次の9件。

- `lib/stage.js`：選択、移動、微調整、再開、ガイドとヒント、成功の確定、近さと数値の読み出し。
- `lib/game.js`：星、解放、最高星、進行の集計、保存値の検証と読み書き。
- `tools/serve.mjs`：Day070を基にした公開16ファイルだけの配信。接頭辞は `/day-071-kage-shogen/`、既定portは4171、PORT=0にも対応する実装。
- `tests/preview.test.mjs`。
- `tests/geometry.test.mjs`。
- `tests/score.test.mjs`。
- `tests/deduction.test.mjs`。
- `tests/stage.test.mjs`。
- `tests/game.test.mjs`。

`tests/index.js` は既存の `cases.test.mjs` を残して更新した。本作業中に追加された別担当の `transform.test.mjs`・`hit.test.mjs`・`view.test.mjs` も入口に含めた。これら3ファイルと `lib/transform.js`・`lib/view.js` は本作業では作成・変更していない。この記録も新規作成した。

試験件数は次のとおり。previewの親テストと子テストはNodeの集計に合わせて数えている。

| 対象 | 件数 |
| --- | ---: |
| preview（本作業で追加） | 7 |
| geometry（本作業で追加） | 14 |
| score（本作業で追加） | 11 |
| deduction（本作業で追加） | 14 |
| stage（本作業で追加） | 28 |
| game（本作業で追加） | 18 |
| 本作業の追加分 | 92 |
| 既存 cases | 8 |
| 別担当 transform・hit・view | 14 |
| 合計 | 114 |

実行結果：

- 実装前に `node --test day-071-kage-shogen/tests/geometry.test.mjs day-071-kage-shogen/tests/score.test.mjs day-071-kage-shogen/tests/deduction.test.mjs` を実行。39件成功、失敗0件。
- 実装前に `node --test day-071-kage-shogen/tests/stage.test.mjs day-071-kage-shogen/tests/game.test.mjs day-071-kage-shogen/tests/preview.test.mjs` を実行。終了コード1。未作成の `stage.js`・`game.js`・`serve.mjs` により失敗したことを確認してから実装した。
- 初回の全体実行は、モデル93件成功、preview3件失敗。Day070と同じ子プロセスの起動方式では、127.0.0.1への待受が環境により `EPERM` で拒否された。
- 配信処理を `handleRequest` として公開し、CLIで直接実行したときだけ待受を始める形にした。preview試験では同じ配信処理へ要求を直接渡す。実ファイルと一時ディレクトリを使い、全16ファイル、MIME、GET/HEAD、転送、404、パス走査、リンク、ディレクトリ、不正なメソッド、Day070と同じヘッダ、不正なPORTを検証した。試験をskipする処理は入れていない。
- 最終 `node --test day-071-kage-shogen/tests/`：終了コード0。tests 114、pass 114、fail 0、cancelled 0、skipped 0、todo 0、duration_ms 7812.571。15秒以内。
- 最終 `node scripts/check-syntax.mjs`：終了コード0。`JavaScript構文: 1388ファイル、エラー0件`。
- 本作業の実装・テスト10ファイルを全文確認した。秘密値形式、ローカル絶対パス、外部への通信処理の文字列検査は検出0件。配信に必要な `node:http` は `serve.mjs` だけにあり、待受先は127.0.0.1。最終preview試験はソケットを開かない。

判断したこと：

- `reset` は配置とstatusと評価だけを戻し、選択、ガイド、使用歴、ヒントの順番を保つ。
- `hintIndex` は次に出すヒントの添字とし、末尾で0へ戻す。
- `nudge` は向きが不正ならRangeError、stepが非有限または0以下ならfalseを返す。step省略時は `STEP.fine` を使う。
- `describeAssessment` は理由がない場合も `detail: ''` を返す。
- 保存は既知の夜と1〜3の整数の星だけを残し、余分な属性は捨てる。`last` は既知の夜なら未解決でも復元する。
- 要素を持つTypedArrayはfreezeできないため、採点の不変性試験では同じ値を持つ凍結した通常配列をtargetのマスクに使った。

参照実装を直した箇所：なし。本作業は geometry・shapes・score・cases・deduction・config と既存cases試験を変更していない。開始時とのハッシュ比較では `cases.js`・`view.js` 等に本作業以外の並行変更を検出したが、上書きや取り消しは行っていない。最終結果は共有worktreeのその時点のファイルに対するもの。

依存の追加、package.json・package-lock.jsonの変更、他のDay・scripts・docs・shared・.kiro・契約の変更は行っていない。Gitの状態を変える操作は行っていない。指定された構文検査スクリプトは内部で `git ls-files` を読み取りに使う。外部通信は行っていない。最初のpreview検証でローカル待受を試みたが、環境に拒否され、HTTP接続には至っていない。

未解決・未確認：previewの実ソケットでの起動、実際の起動URL出力、HTTP経由の応答は、待受が `EPERM` になるため未確認。配信処理の試験と指定された2つの受け入れコマンドは成功した。
