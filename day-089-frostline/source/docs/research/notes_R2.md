# R2 調査経過

確認日：2026-11-10。検索結果だけのページは出典に採用しない。実装・Git操作・ブラウザ起動は行わない。

## 1. 基本の力・速度：確認済み

- 【事実】直滑降は `m dv/dt=mg(sinθ−μcosθ)−ρCdA v²/2`。一定係数なら終端速度を解析できる。Komissarov本文II.1を確認。Lind & Sanders本体は未読であり、同書の値はこの論文経由の二次確認。
- 【事実】滑走摩擦は一定ではない。単走平均約0.02–0.10、実験全体約0.02–0.14。冬雪は低速で低下し、湿雪は高速で増加する。温度だけで予測しない。
- 【留保】直滑降の終端速度は長い一様斜面の漸近値で、一般滑走者の普段の速度とは別。
- 出典本文：https://arxiv.org/html/1812.02539v3
- 出典本文：https://www.frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2021.728722/full

## 2. カービング・雪のせん断限界：確認済み

- 【事実】`R=Rsc cosφ` は板が適切にたわんで平面上に接する理想幾何。スキーの実測論文では、既往FEMとの一致は低角度（40°未満）で良く、高角度は半径を過小評価すると整理している。45°の数値例は理想式の回帰目標としてのみ使う。
- 【事実】Mössnerらは圧入・せん断・滑走摩擦を別の力として測定。`Fn=Hv V`、破壊開始横力 `Ft=Sf L e`。測定は破壊開始までで、滑り続ける動的せん断の係数ではない。
- 【解釈】アイスは強い材質でも浅くしか食い込めないため、横グリップが小さくなり得る。「硬いほどグリップ良好」と単調に設定しない。
- 出典本文：https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2020.00025/full
- 出典本文：https://www.cambridge.org/core/services/aop-cambridge-core/content/view/00DD7880EF30BFB651D61146B3EFC3FA/S0022143000203870a.pdf/measurement_of_mechanical_properties_of_snow_for_simulation_of_skiing.pdf

## 3. 板の向き・進行方向：確認済み、タイヤからの直接移植例は未確認

- 【事実】MathWorks公式の車両例は横力をスリップ角に比例させる。これは車両の式で、雪上の板への妥当性を示すものではない。
- 【事実】Yoshidaらのスノーボード研究は粒子間のばね・ダンパー・摩擦を持つDEMを用い、ミニチュア板と模擬雪で検証。実雪・実寸の全条件を検証した研究ではない。
- 【提案】横速度を消す飽和横力と、滑りゼロでも横反力を出せるカービング拘束を併用する。力の投影を誤って推進エネルギーを作らないようにする。
- 出典本文：https://www.mathworks.com/help/ident/ug/modeling-a-vehicle-dynamics-system.html
- 出典本文：https://www.mdpi.com/2504-3900/49/1/101
- 追加本文：https://arxiv.org/pdf/2411.08056 （SSSI接触モデル、プレプリント）

## 4. スキー・スノーボード差分：確認済み

- 【事実】AUGMENT 2018/19カタログでSL 165cm・12.5m、GS 188/193cm・30m以上、SG 40/45m以上、DH 50m以上、オールマウンテン77mm幅・半径14–19mを確認。現行競技規則として扱わない。
- 【事実】Burton公式はregular/switch両対応を説明するが、取得本文でサイズ表を展開できず、検索に出た7.9mを確認済みとしない。寸法はBataleon公式の別例で補う。
- 【提案】板の半径・総面積・接触点・左右／前後荷重・姿勢制御を変える。ストックは低速推進と接地タイミングの補助に限定する。
- 出典本文：https://static1.squarespace.com/static/5b7daed67c9327b708829eaa/t/5bda2b5e0ebbe8a5aa1b180a/1541024621280/Augment_english_web.pdf
- 出典本文：https://eu.burton.com/en-gb/products/mens-burton-custom-camber-snowboard-106881a-o?variant=42867455721549
- 出典本文：https://bataleon.com/products/bataleon-2526-thunderstorm-unisex-snowboard

## 5. 雪質・深雪：確認範囲を確定

- 【事実】圧雪の圧入硬度・せん断破壊強度は独立に測る必要があり、密度だけから硬度を推定する相関は得られていない（Mössnerら）。湿雪で摩擦が増す実測はあるが、未圧雪パウダーやクラストの統一係数表は得られない。
- 【未確認】Wuら2006「Lift mechanics…」は発見できたが通常PubMed表示が空となり、本文式は未確認。検索抜粋だけから係数は採らない。Lind本体の公開PDFは取得サイズ制限により未読。
- 【提案】深雪は沈下量を状態にし、速度依存の支持と静的圧縮支持を合計する。低速で動的支持が消えて沈下し、押しのけ抵抗が増える。クラストは表層破断の履歴を持たせる。
- 既読の出典：https://www.frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2021.728722/full
- 既読の出典：https://www.cambridge.org/core/services/aop-cambridge-core/content/view/00DD7880EF30BFB651D61146B3EFC3FA/S0022143000203870a.pdf/measurement_of_mechanical_properties_of_snow_for_simulation_of_skiing.pdf

## 6. ジャンプ・着地：確認済み

- 【事実】Petroneら2016は等価落下高（EFH）を法線方向の速度変化のエネルギーで評価し、実際に施工・測定。接線方向の速度は着地しても残る。斜度だけでなく軌道と着地面の角度差が重要。
- 【留保】EFH 1.5mは研究中で引用された脚の吸収限界で、誰にでも当てはまる安全保証ではない。エッジが引っ掛かる事故は接線速度にも依存する。
- 出典本文：https://arxiv.org/html/1611.04448
- 補助資料（研究者のソフトウェア資料）：https://skijumpdesign.readthedocs.io/en/latest/real-jumps.html

## 7. 脚・荷重抜け：モデル案確定

- 【事実／導出】拘束された質点の法線反力は `N=m(v²κn−g・n)`。凸でκn<0となり、必要反力が負になるなら離雪する。脚の力を加算して拘束反力を二重計上しない。
- 【提案】脚は片側ばね・ダンパーで近似し、圧縮量と速度を状態にする。ばね定数は生体の実測値とせず、初期調整値と明記する。
- 【解釈】荷重抜けで接触による回頭抵抗が減るため板を回しやすい。空中では身体と板の相対回転と全角運動量の区別が必要。
- 関連本文：https://arxiv.org/pdf/2411.08056 （非線形圧入ばね・減衰の雪接触モデルであり、脚のばね定数の根拠ではない）

## 8. 開発者資料：取得範囲を確定

- 【事実】ShreddersのDirk Van Welden本人の発言：重力は現実と同じ、オーリーは現実より高く調整、空中動作は物理に同期する手続き的アニメーション。内部の力学式は非公開。
- 【事実】Snow RidersのDaniel Helbig本人の回答：スキー物理と操作を試作し、Downhillで成立した急旋回・深いドロップ中心の区間を再検討した。
- 【事実】Shreddersの開発者表示付き投稿では低速操作の課題とアナログスティックの精度の必要性を述べる。
- 【未確認】Steep／Riders Republic／SSX／Infinite Air／The Snowboard Gameの内部力学式を開示した本人記事・講演は今回確認できず。レビュー記事の推測を式の根拠にしない。
- 出典本人発言：https://news.xbox.com/en-us/podcast/shredders-and-tunic/
- 出典本人回答：https://www.sixoneindie.com/post/interview-with-the-developer-of-lonely-mountains-snow-riders
- 出典開発者投稿：https://steamcommunity.com/app/1874170/discussions/0/592909603984955084/

## 補足照合・取得制約

- 追加確認した空力の一次論文：Elfmark & Bardal 2018。本文4.1で基準姿勢CdA=0.412m²、低い姿勢への前面面積減41.2%、Cd減23.1%。この被験者について両者を乗算した低姿勢の推定CdAは約0.186m²。姿勢と服装を無視して全滑走者に適用しない。
- 本文PDF：https://mdpi-res.com/d_attachment/proceedings/proceedings-02-00310/article_deploy/proceedings-02-00310-v2.pdf
- Wolfspergerら2021空力研究は著者要旨の転載を開いて確認（スキー0.30–0.95m²、ボード0.35–0.55m²、4人と3人）。出版社本文は403、PubMedは空表示。本文回帰式は採用しない。
- 著者要旨の転載：https://lida.sport-iat.de/mint/Record/4073141
- PLOS一次論文で421人の成人スキー受講者、実測最大速度に環境差を確認。一般速度・上級者・競技を同じ母集団にしない。
- 本文：https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0256349
- 検索は合計30クエリで打ち切り。以降は既発見URLの閲覧・数値照合だけ。DNS制限によりローカルHTTP取得も不可。未取得資料を既読としない。
- 最終照合：最終報告は193行、数値回帰目標20件。終端速度・制動距離・EFH・荷重・ばね減衰比を電卓相当の一時計算で照合。実装試験は行っていない。
- 日本語lintは既存環境のsudachipy不足で実行不可。追加インストールはせず、スキルの手動チェックリストで用語・条件・断定・読みやすさを確認した。数式の記号と力の二重計上を修正・明示し、技術表の省略文は比較しやすさのため残した。
