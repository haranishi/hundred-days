# R1 調査メモ
確認日：2026-11-10。事実／解釈／提案を区別する。検索結果の抜粋だけでは出典に採用しない。
関連Obsidianを検索したが、滑走設計の根拠になる既存ノートは確認できなかった。ユーザー指定に従い成果物はこのフォルダ内に保存する。

## 1. Steepの基本操作（調査済み、細部は継続）
- 事実：操作表は左スティックを進行・停止、右をドリフト・ブレーキ、左右逆入力をスイッチに割り当てる。R2/RTはジャンプ兼右手グラブ、L2/LTは左手グラブ。L1/LBはアクションカメラ、△/Yはライン再試行。
- 出典（本文確認）：https://www.spottis.com/games/steep-controls/
- 事実：PCレビューでは、滑走中は右スティックがカメラから技入力へ切り替わり、PCはJ/L等を使う両手キーボード操作になると説明。キー操作自体は十分だが、パッドの模倣という批評。
- 出典：https://primagames.com/featured/steep-pc-technical-review
- 未確認：Fandomの操作Wikiは本文取得失敗。検索抜粋だけのキー一覧は採用しない。

## 2. 衝撃・音（調査済み）
- 事実：Push Squareは速度感と操作を評価。Gゲージは衝撃・雪外走行で悪化し、きれいな滑走や減速で回復する一方、説明不足で不規則に感じると指摘。風と板の雪面音を音楽より前に出す音響を評価。
- 出典：https://www.pushsquare.com/reviews/ps4/steep
- 事実：1.04更新内容の転載では、大衝撃で即転倒する代わりに白黒の危険状態、その次の衝撃で転倒へ変更。ジャンプ不発、頻繁な掛け声、再試行時の曲変更も修正対象。
- 出典：https://www.dsogaming.com/news/steep-new-patch-adds-world-tour-community-challenges-improves-g-force-system-jump-behaviour/
- 事実：音響担当François Dumasは、山ごとに落石音や鳥・風などで危険／平穏を作り分けると説明。
- 出典：https://www.gamereactor.eu/steep-will-have-difference-in-sound-between-mountains/
- 解釈：速度・接地・危険の音が操作結果を伝える。提案：音を装飾として後付けせず、滑走状態に連動させる。

## 3. 回転補助に対するプレイヤーの声（調査済み）
- 事実：投稿者は入力を離しても回転することへの不満と手動操作への希望を記す。返信には慣性の深さを好む声がある。同じスレッド内でも評価が分かれる。
- 出典：https://www.reddit.com/r/Steep/comments/epttvu/automatic_rotations_and_landings/
- 限界：単一スレッド。コメントのG-force説明は内部物理仕様の証拠にしない。

## 4. 雪・地形・カメラ・山の遊び方（調査済み）
- 事実：New Game NetworkはS字ターン、右スティックで減速、雪の変形と滑走跡、適量のモーションブラー、板の雪面音・風・氷河の音を評価。ただし実装方式を解説した資料ではない。
- 出典：https://www.newgamenetwork.com/article/1586/steep-review/
- 事実：RotoRobは急制動・旋回で小さな雪塊と跡が出ると記す。雪の起伏に岩が隠れて速度を失うこと、フレーム低下による入力遅延を批判。
- 出典：https://rotorob.com/2017/01/19/video-game-review-steep/
- 事実：Stuffは三人称のライン・ジャンプの見通しと、一人称アクションカメラの没入感を評価。ただし高速スキーでは一人称の維持が難しいとする。
- 出典：https://www.stuff.tv/review/steep-review/
- 事実：Stevivorは前方が身体で隠れるカメラ、狭い回転入力時間、着地衝撃の累積を批判。一方でイベント・ライン冒頭へのロード待ちなしの再試行を評価。
- 出典：https://stevivor.com/reviews/review-steep/
- 事実：公式商品ページは自由滑走と滑走映像の記録・共有を掲げる。レビューではドロップ地点の解放、山全体の3Dマップ、リプレイと自作イベントを確認。
- 出典：https://www.ubisoft.com/en-us/games/steep
- 未確認：雪質別の摩擦係数、板の物理的沈み込み、追従距離・FOV・揺れの数値、転倒時カメラの制御式。

## 5. 比較作の操作（調査済み、確認範囲だけ採用）
- Riders Republic：公式は自動着地／手動回転・着地、板の空中制御とリバインドを説明。GGReconはRacer＝右スティックがカメラ／技はフェイスボタン、Trickster＝右スティックが技、Steepプリセット＝トリガー等でジャンプと説明。操作プリセットと着地補助は別の選択。
- 出典：https://www.ubisoft.com/en-au/game/riders-republic/news-updates/2HFvoOtBvWRtrlXOF8ZXjo/answering-your-riders-republic-questions
- 出典：https://news.ubisoft.com/en-us/article/6zMpXnJAI44AWNqmm2N6LK/accessibility-spotlight-riders-republic
- 出典：https://www.ggrecon.com/guides/riders-republic-controls-racer-trickster/
- Shredders：左右スティックと肩ボタン、着地準備ボタン、巻き戻し、ドローンによる場所移動をプレイ記事で確認。身体と板の各軸の厳密な入力対応は未確認。
- 出典：https://www.gamespark.jp/article/2022/03/18/116977.html
- Infinite Air：左でカーブ、右で技、トリガーで左右のグラブ。複雑な技では右スティック／トリガーでトルクを仕込むとレビューに記載。立ち上がり地点によっては再加速できないという不満。
- 出典：https://wccftech.com/review/mark-mcmorris-infinite-air-review/
- SNØ：開発者FAQは技ボタンで回転軸変更、踏切前の傾きで回転を加える、空中で縮むと回転が速まり伸びると遅くなると説明。
- 出典：https://steamcommunity.com/app/2943150/discussions/0/604148566876779884/
- Carve：VRの各手が板の前後を操舵。手を上げてジャンプ、グリップで位置に応じたグラブ、トリガー＋腕の動きで回転。Full Tiltで手首の板傾斜操作が加わる。
- 出典：https://www.uploadvr.com/carve-snowboarding-review/

## 6. 比較の補足と限界（調査済み）
- Lonely Mountains: Snow Riders：PC Gamerは加速前の姿勢、制動、後ろ向き滑走、空中の勢い、固定構図のカメラ、任意チェックポイントを使うZenモードを説明。死んでも残る跡がライン改善の手掛かりになると評価。
- 出典：https://www.pcgamer.com/games/sports/lonely-mountains-snow-riders-review/
- The Snowboard Game：開発元のSteam説明は自然な物理と応答のよさ、任意のセッション出発点・ジャンプ設置を掲げる。技と操舵の具体的入力は未確認。
- 出典：https://store.steampowered.com/app/803830/The_Snowboard_Game/
- Slopecrashers：公式は技の連鎖をブーストへ換える、攻撃アイテム、空中を補助するガジェットを掲げる。具体的なボタン入力と板／速度方向の分離は未確認。
- 出典：https://www.slopecrashers.com/
- 未採用：Grand Mountain Adventure公式FAQは本文がiframeで直接取得できず、Wikiも操作体系の確証に乏しい。別の攻略記事と公式ストアを補足確認する。
- 未採用：検索で見つかったGDC 2023の雪描画資料はSteepの資料ではないため、その実装の証拠として扱わない。SNOWは今回の調査では操作を確認できず、比較を省略する。

## 7. 独自作品への応用の線引き（調査済み）
- 事実：米国著作権局はゲームのアイデアや遊び方と、文章・図柄等の表現を区別する。
- 出典：https://www.copyright.gov/register/tx-games.html
- 整理・提案：旋回、減速、ジャンプ、グラブ、自由な出発地点、リプレイなどの発想は独自表現・独自実装へ落とす。他作品の名称・ロゴ・UI・山の配置・キャラクター・音・抽出素材は流用しない。
- 限界：この資料は米国の著作権に関する一般説明。名称の商標、特許、国別判断を含む包括的な許諾の根拠ではない。法的可否を断定しない。

## 8. 開発者の設計意図・比較補完（調査済み）
- 事実：Arnaud Ragotの文章インタビューは、アルプスの地質を調べつつ遊びのため完全再現にしない、地形で面白いラインを見つけて課題を作る、ヘリ移動の手間を省きスポーツに集中させる、と説明。選手の助言でスノーボードの回転速度を調整したとも述べる。
- 出典：https://gamesbeat.com/how-ubisoft-built-a-mountain-and-then-created-a-video-game-around-it/
- 事実：ワールド担当Renaud Personも、地形の完全コピーより地域の地質・特徴と遊びやすさを重視したと説明。
- 出典：https://www.gamereactor.eu/the-mountains-of-steep-designed-for-maximum-fun/
- 事実：Ars Technicaは滑走そのものの習得の深さを評価しつつ、定型イベントと解放条件が自由探索を狭めると批判。
- 出典：https://arstechnica.com/gaming/2016/12/steep-review/
- 事実：GameSpotの五輪DLCレビューは、高速旋回と見通しのよいコースでの一人称を評価。深雪の腰まで沈む描写はあるが、雪深を計算する仕組みの証拠にはならない。
- 出典：https://www.gamespot.com/reviews/steep-road-to-the-olympics-review/1900-6416824/
- Grand Mountain Adventure：旧モバイル版攻略は左右のポールの同時タップでジャンプ、ドラッグ方向の組み合わせでフリップ・スピン・ロール等を説明。現行版とPC版の同一性は未確認。公式ストアはフリップ等と自由探索、リフト解放を確認できた。
- 出典：https://www.levelwinner.com/grand-mountain-adventure-guide-tips-tricks-strategies-to-earn-more-medals-and-ski-passes/
- 出典：https://play.google.com/store/apps/details?hl=en_GB&id=com.toppluva.grandmountain
- 検索終了：検索語は計30件。以後は既取得資料の照合と報告執筆。検索結果だけのページは根拠に採用しない。

## 9. 操作の追加照合・納品確認
- 本文を取得できたGameSkinnyは右トリガー保持／解除、方向入力による回転、左右トリガーのグラブ、右スティックの姿勢変更を説明。Mountain Viewの俯瞰・マーカー・リプレイ・自作課題も確認。
- 出典：https://www.gameskinny.com/tips/steep-beginners-guide-tips-and-tricks-for-conquering-the-slopes/
- 注意：同記事にあるSSXをUbisoft作品とする誤記は採用しない。操作はSpottis、RotoRob等と照合。Red Bullは本文取得不可のため不採用。
- Arqadeの着地回答はグラブ解除のタイミングに条件不足がある。確定操作として推奨せず、板と雪面の角度という助言と、投稿間の違いを報告に残した。
- 出典：https://gaming.stackexchange.com/questions/302998/how-to-land-cleanly-in-steep
- 最終報告：R1_experience.md、187行。指定8節、体験要素、トップ10、類似作9本＋Steep基準、未確認事項、28件の出典を記載。
- 文書点検：lintはsudachipy未導入で実行不可。依存を追加せず、スキルの手動チェックと全体通読で代替。事実／解釈／提案の反復ラベルは、依頼に必要な区別として残した。
- 証拠点検：引用リンクの定義、資料の版・個人意見の扱い、取得不可ページの除外、250行以内を確認。コード作成・Git操作・ブラウザ／サーバー起動は行っていない。
