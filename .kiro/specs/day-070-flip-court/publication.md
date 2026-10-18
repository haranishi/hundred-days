# Day70の本番公開

2026-10-19、本人から「Day70はなぜ未公開か、公開してほしい」と依頼を受けた。
既存CPU版の公開設定を変更する。ゲームの挙動・33基準・2人対戦の承認範囲は変えない。

## 変更と受け入れ
- meta.jsonのstatusをpublished、publicUrlを正規URL、finishedAtを2026-10-19にする。
- README一覧とアプリ説明を同期し、標準buildがDay70を含む70件を生成する。
- 配信に必要なHTML・JS・CSS・共有・OG画像・demoを含み、tools/testsを配らない。
- ゲーム13ファイルと最終動画・demoを変更しない。新依存・外部APIを追加しない。
- 正規URL、OGP、security headers、開始・入力・60秒の終了・再戦を公開用出力で確認する。
- npm run checkと当該headの必須共通CIが成功した後にマージする。
- mainの既存CI・Cloudflare Pagesのデプロイ完了後、本番URLで主要操作を確認する。
- 本番URLの検査後に既存x:prepareで本文・返信・動画を検証して渡す。SNSには投稿しない。

## 進め方と記録
1. Task10で公開用の設定と手元の検証を準備する。
2. 同じ依頼の範囲でcommit・push・PR・マージ・既存の本番デプロイを進める。
3. 本番確認とX準備の結果を私有実行記録とObsidianに残す。

公開前の準備記録は `.agent-harness/runs/day070-flip-court/publication.md`。
過去のdraftという記録は、その時点の履歴として残す。最大3周・同一失敗2周の停止条件を維持する。
