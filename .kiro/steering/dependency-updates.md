# 依存更新の手引き：ソースと公開物の結び目

`source/` を持つDay（56・58・59・61・64）の開発用ツール（vite・vitest など）を更新するときの、コードを読んでも分からないことを残す。
2026-10-23 の Dependabot 警告41件の対応（`.kiro/specs/dev-deps-security-2026-10/`）で確かめた。

## 更新しても公開物は勝手に変わらないが、3つの結び目がある
サイトが配信するのは、各Dayにコミットされたビルド済みの公開物。`source/` と `tools/` は配信されない（`scripts/lib/dist-files.mjs` の `SOURCE_DIRS_BY_APP`）。

| 結び目 | 内容 | 対象 |
|---|---|---|
| 再現性検査 | CIがビルドし直し、公開物と1バイトでも違えば失敗する | Day56・58 |
| 記録の単体試験 | `package.json` と lock を含むソースのハッシュが `build-record.json` と合う。合わせるには `npm run release` で公開物ごと作り直す | Day61 |
| ライセンス表記 | `legal/` に vite・rolldown の版が載る。`prebuild` が lock から書き直す | Day59・61 |

vite は、動的importの先読みの補助コードを成果物に入れる。vite の版が変わると、動的importを使うDayのJSの名前（ハッシュ）が変わる。開発用ツールの更新が、本番のJSを変えうる。

## 手順
1. 版を選ぶ。警告の修正版のうち**いちばん古い版**で、公開から3日以上、取り下げなし、install script なし。最新へは追随しない。
2. 編集する。`npm install <部品>@<版> --package-lock-only --ignore-scripts --no-audit --no-fund --before=<3日前の日付>`。固定指定のDayは `--save-exact`。推移的な部品は `npm update <部品>` に同じ引数。
3. ロックの差分を監査する。取得先が公式レジストリだけ、整合値がレジストリの値と一致、公開日が3日以上前、install script の有無、実行時の部品（`dev` でない項目）が不変。
4. `npm ci --ignore-scripts` で入れ直し、そのDayの手順（試験・ビルド・リリース）を流す。更新前のmainでも同じ手順を先に流して、基準にする。
5. 公開物の差を見る。結び目が要求するDayだけ公開物を更新し、そのDayのE2Eを通す。要求しないDayは作り直さない。
6. サイトのビルド（`npm run build`）を前後で全ファイル比較する。ビルドは決定的なので、違いはそのまま更新の影響になる。

## 落とし穴
- **npm 12 の `--package-lock-only` は、同梱依存を持つパッケージで `EALLOWREMOTE` になる**（Day59 の `@tailwindcss/oxide-wasm32-wasi`）。`--allow-remote=all` は全URLの取得を許すので使わない。`--package-lock-only` なしの通常の更新にする。
- vitest 5.0.3 は `why-is-node-running` を 3.2.1 に固定する。lock の差分で下がって見えるが、正しい。
- 脆弱性の照会（OSV など）は、**既知の脆弱な版を見つけられることを先に示す**。zsh は変数を空白で分割せず、`echo` が `\n` を展開し、`=` で始まる語も展開する。照会が壊れて全部0件になり、危うく安全と読むところだった。更新前のロックで、Dependabot と同じ件数の勧告が出るか照合する。
- Day61 の記録の単体試験は、リリースの前に流すと必ず失敗する（ソースのハッシュが変わるため）。`npm run release` の後に流す。
- 更新前のmainでは、5つのDayとも作り直した出力が公開物と一致した。差が出たら、環境でなく更新の影響とみなしてよい。
