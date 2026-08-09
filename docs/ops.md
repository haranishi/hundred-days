# 運用手順（公開前チェック・X投稿の準備）

日々の公開作業で使う内部向けスクリプトの手順。アプリ本体には影響しない。

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
