# 画面で使う画像の来歴

| ファイル | 元 | ライセンス |
|---|---|---|
| chars/character-*.png | Kenney「Mini Characters」の3Dモデル（`public/models/ch/*.glb`）を `tools/ui-faces.mjs` が three.js で胸から上だけ撮った 192px の顔の画像 | CC0 1.0（表記不要） |

元の Previews（64px）はスマホの高精細な画面でぼやけるので使わない。作り直すときは `node tools/ui-faces.mjs`。
警官の帽子の male-c と、補助具・車いすは撮っていない（docs/04 と同じ理由）。

OGP画像（`public/og.png`）は、Kenneyの3D素材を使ったゲーム画面に題字とキャッチコピーを重ねたもの。生成手順は [`tools/ui-og.mjs`](../../tools/ui-og.mjs) を参照。

アイコン（`public/favicon.svg`・`public/apple-touch-icon.png`）は、このゲームのために作った、赤い地にカートの輪郭と黄色い車輪を描いた絵です（SVGをコードで描き、PNGは同じ図柄です）。第三者の素材は使っていません。
