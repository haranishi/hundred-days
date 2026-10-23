# 調査記録：開発用ツールの脆弱性警告の解消

## Summary
- **Feature**: dev-deps-security-2026-10
- **Discovery Scope**: Extension（既存リポジトリの保守。軽い調査）
- **Key Findings**:
  - 警告41件は9本の勧告で、すべて開発用。修正版は vite 8.3.3、vitest と @vitest/mocker 5.0.3、source-map-js 1.2.2
  - 版を上げると、Day56・58 の再現性検査、Day61 の記録の単体試験、Day59・61 のライセンス表記に触れる
  - 最新の vite 8.3.5 と rolldown 1.2.15 は公開から約2日。修正版でいちばん古い版を選ぶ

## Research Log

### 警告の中身（2026-10-23）
- **出どころ**: Dependabot API（41件・open）、GitHub Advisory DB（`gh api advisories/<GHSA>`）。コードスキャンは未設定、シークレット検出は0件
- **件数の内訳**: Day56=9、Day58=8、Day59=9、Day61=9、Day64=6（vite だけ）
- vite 6本（launch-editor 3本を含む）は 8.3.3、@vitest/mocker 2本は 5.0.3、source-map-js 1本は 1.2.2 で直る。公開日は 9/18〜10/21
- 影響は開発用サーバー・テスト実行器・ソースマップの読み込みに限られ、静的に配信するファイルには入らない

### 取り込む版の安全確認（公式レジストリ、読み取りのみ）
| 版 | 公開 | 経過 | 取り下げ | install script | 出どころ証明 |
|---|---|---|---|---|---|
| vite 8.3.3 | 10/06 | 17日 | なし | なし | あり（GitHub Actions） |
| vitest・@vitest/mocker 5.0.3 | 09/30 | 23日 | なし | なし | あり |
| source-map-js 1.2.2 | 09/30 | 23日 | なし | なし | なし（従来版と同じ公開者） |
| rolldown 1.2.11 | 09/24 | 29日 | なし | なし | あり |
| vite 8.3.5・rolldown 1.2.15（最新） | 10/21 | 約2日 | — | — | 3日未満のため使わない |

### 現在のロックファイル
| Day | vite | vitest | rolldown | source-map-js | 指定の形 |
|---|---|---|---|---|---|
| 56 | 8.3.1 | 5.0.2 | 1.2.11 | 1.2.1 | 固定 |
| 58 | 8.3.1 | 5.0.2 | 1.2.12 | 1.2.2 | 固定 |
| 59 | 8.3.0 | 5.0.1 | 1.2.9 | 1.2.1 | `^` |
| 61 | 8.3.0 | 5.0.1 | 1.2.10 | 1.2.1 | `^` |
| 64 | 8.3.1 | なし | 1.2.13 | 1.2.2 | 固定 |

vite 8.3.3 は rolldown `~1.2.11` を要求する。Day56・58・64 は満たしているので vite と vitest だけが動く。Day59・61 は rolldown も上がる。

### ソースと公開物の結び目
- `scripts/lib/dist-files.mjs`: 5つのDayの `source/` と `tools/` は配信されない。配信するのは、コミットされたビルド済みの公開物
- Day56・58: CI（`day056-game.yml`・`day058-game.yml`）が、ビルドし直して公開物との差を見る
- Day61: `tests/release.test.mjs` が、`package.json` と lock を含むソースのハッシュを `build-record.json` と照合する。`release.mjs` だけがそれを書く
- Day59・61: 配信する `legal/` に vite・rolldown の版が載る（例：vite 8.3.0、rolldown 1.2.9）。Day59 の試験は `legal/` と `source/public/legal/` の一致を見る
- Day64: 専用ワークフローは公開物との差を見ない。Rust・Wasmの作り直しは更新と無関係

### 実行するスクリプトの読み取り
- 外部通信なし。コマンド実行は Day64 の `build-rust.mjs`（`cargo build --offline`）だけで、今回は走らせない
- 削除・上書きするのは、各Dayのリリース用スクリプトによる公開物のフォルダだけ。Gitで管理されているので戻せる
- 環境変数を読むのは `build-rust.mjs`（CARGO・RUSTFLAGS）だけ

## Design Decisions

### Decision: 修正版でいちばん古い版を選ぶ
- **Alternatives**: 最新へ追随 / 修正版の最小
- **Selected**: vite 8.3.3、vitest 5.0.3、source-map-js 1.2.2
- **Rationale**: 変更を最小にし、公開から3日未満の版を避ける（供給元の改ざんは多くが数日で見つかる）
- **結果**: rolldown は npm の選択に任せた（Day59・61 は 1.2.14＝公開から9日）。ほかのDayは動かない

### Decision: 編集はロックファイルだけを最小に動かす
- **Selected**: 部品名と版を指定して更新し、ロックファイルだけを動かす。インストール時スクリプトは実行しない。上限日 `--before=2026-10-20` で、新しく入る部品の公開日も縛る
- **Rejected**: 引数なしの全体更新（無関係な部品まで動く。10/22の点検で差分が肥大した）

### Decision: 公開物は、CI・試験が要求するDayだけ作り直す
- **実測（2026-10-23）**: vite 8.3.2 が、成果物に入る先読みの補助コード（動的importのCSS先読み）を書き換えた。8.3.3 もこれを含む。動的importを使うDayは、入口とJSの塊のハッシュが変わる。Day56 だけは一致した
- **Selected**: 要求するDay（58＝CIの再現性検査、61＝記録の単体試験）は作り直してブラウザ試験を通す。要求しないDay（59・64）は作り直さず、配信ファイルを変えない
- **Rationale**: 本番のJSを変える範囲を最小にする。旧い補助コードにも、読み込み中のスタイルシートを待たない同じ作り（`seen` の早期return）があり、新しい補助コードで悪化はしない（vite #23652 は 8.3.4 で修正済みの長年の軽微な不具合。依頼の範囲外なので 8.3.4 へは上げない）
- **Trade-offs**: Day59・64 は、ソース（ロック）と公開物のビルド元の版が一時的にずれる。次のリリースで解消する

## Risks & Mitigations
- 確認用の照会が壊れて「0件」を返す — 前回は zsh が変数を分割せず、既知の脆弱な版まで0件になった。先に脆弱な版を見つけられることを示す（4.7）
- 更新で入る部品が新しすぎる — 公開日を全項目で点検する（4.1・4.4）
- 公開物が意図せず変わる — サイトのビルド結果を前後で全ファイル比較する（2.2）
- 作業中の本人のフォルダを壊す — 別の作業場所（worktree）で行う（5.1）

## References
- GitHub Advisory DB: GHSA-9jrq-w75r-8gcw ほか9本（`gh api advisories/<id>`）
- 公式レジストリ: https://registry.npmjs.org/（vite・vitest・@vitest/mocker・source-map-js・rolldown）
- OSV: https://api.osv.dev/v1/query
