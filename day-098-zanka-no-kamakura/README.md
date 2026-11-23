# Day 098「残火の鎌倉 — 隠れ谷の灯」

1333年、鎌倉幕府滅亡後の信濃の隠れ谷を舞台に、旧臣の侍が里を襲う追手と戦い、負傷した弓手の仲間と廃寺へ帰る三人称3D時代劇アクション（試作・第一章。所要10〜15分）です。登録やインストールは不要で、ブラウザだけで遊べます。PC（キーボード・マウス）でもスマホ（タッチ操作）でも操作できます。

- 公開サイト: https://day98.rairakku.com/
- `rairakku.com` の中の住所: https://rairakku.com/day98/（`day98.rairakku.com` へ転送します）
- 同梱ソースコード: [`source/`](source/)（別リポジトリ https://github.com/haranishi/kamakura-no-zanka と同じ第一章のコードと素材）

架空の谷を舞台にした創作です。初回は約78MBの3Dモデル等を読み込むため、Wi-Fi環境での利用をおすすめします。

## できること

- **剣戟と駆け引き**：三連斬り・強斬り・受け・弾き（敵の刃が光る予兆を見て押すと弾く→反撃）・とどめ・背後からの闇討ち。血の表現は休止メニューから「なし／ひかえめ／標準」を選べます（既定は「ひかえめ」）
- **選択が効く任務**：廃寺→林道→見晴らし→水穂の里（正面から入るか、脇道から回るか）→縛られた弓手・梓 弥十郎の救出→帰り道の待ち伏せ→廃寺の焚き火。選んだ道と戦い方が、食糧・士気・村の信頼と結末の文章に反映されます
- **スマホとPC**：スマホでは左ドラッグで移動（外側の輪まで倒すと走る）・右ドラッグで視点・右下のボタンで斬る／受ける／避ける／強斬り／調べる（とどめ・闇討ち）を操作できます。タッチ端末は初回自動で「軽量」品質から始まります
- **ログイン・外部通信なし**：進行の保存と設定は端末のブラウザ内（`localStorage`）のみ。効果音24種は Web Audio API で合成しています

## コード・素材と宣伝動画

ゲームのソースと第一章の3D素材一式は [`source/`](source/) に同梱しています（コードはリポジトリ直下の MIT ライセンス、3Dモデル・動き・物語は CC BY 4.0＝[`source/LICENSE-ASSETS.md`](source/LICENSE-ASSETS.md)）。動かし方・試験・公開用ビルド手順は [`source/README.md`](source/README.md)、設計書は [`source/docs/`](source/docs/) にあります。

- 第三者ライブラリ・素材：Three.js 0.180.0（MIT・[`source/licenses/THREE-LICENSE.txt`](source/licenses/THREE-LICENSE.txt)）、地面と自然の質感は Poly Haven（CC0 1.0）、歩行・走行モーションの一部は CMU Graphics Lab Motion Capture Database（NSF EIA-0196217）、人物7体と小道具14点は有料プランの Meshy で生成し Blender で動きを焼いています（出所と SHA-256 は [`source/NOTICE.md`](source/NOTICE.md) / [`source/provenance/`](source/provenance/) およびリポジトリ直下の [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) に記録）
- 宣伝動画（縦型30秒・BGM 2案）の撮影・組み立て・BGM合成の道具は [`tools/promo/`](tools/promo/README.md) です。一覧のカードの動画（`demo.mp4`）は、その映像から切り出した16秒です。

## このDayの記録

構成は Day094 と同じ外部Dayです。ゲーム本体の配信（78.4 MiB）は専用の `day98.rairakku.com`（Cloudflare Static Assets）で行い、このリポジトリにはゲームのソース一式（`source/`・本番には配信しない）、宣伝動画の道具（`tools/promo/`）、および一覧のカード用の画像と動画（`screenshot.webp`・`demo.mp4`）を置いています。
