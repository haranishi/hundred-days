// OWNER: config
// 三人称のばねカメラの数値。巨体（全長60m）が画面に収まる距離と画角にする。
// 狙いの光線（炎の向き・爪の向き）は、ばねを通す前の「決まった位置のカメラ」から出す（自動プレイを決定的にするため）。
// 決まった位置のカメラの規則（回転の中心・肩越し・地面からの高さ）は camera/placement.ts が持ち、照準の光線（gameplay/aim.ts の
// fixedCamera）と追うカメラ（camera/followCam.ts）の両方がそれを呼ぶ。
// r05-camera：距離・高さ・見下ろし・画角を怪獣ごとに持つ（config/creatures/*.ts の camera。無い値はこの FOLLOW_CAMERA）。
//   揺れ（CAMERA_SHAKE）・画角の跳ね（CAMERA_KICK）・着地の沈み込み（CAMERA_SINK）は、遊びの出来事（core/events.ts）の大きさと
//   竜からの距離で決める。瓦礫の山の上へ逃がす規則（CAMERA_CLEARANCE）と網点の範囲（CAMERA_OCCLUSION）もここに置く。

export const FOLLOW_CAMERA = {
  /** 回転の中心の高さ（体の中心から上へ、m） */
  pivotHeight: 13,
  /**
   * 肩越し：回転の中心を視点の右へずらす（m）。r02-controls：指摘「近い的では照準が竜の翼に重なる」 0→7。
   * 竜は画面の中央より少し左に寄り、照準の先（首と頭の右）が見える。寄せすぎると竜の向きが読みにくいので体の幅ほどにした
   */
  shoulder: 7,
  /** 竜までの距離（m）：地上・空中・急降下 */
  distanceGround: 74,
  distanceAir: 96,
  distanceDive: 84,
  /** 画角（度）：ふだん・走り・急降下で広げる */
  fovBase: 58,
  fovRun: 62,
  fovDive: 74,
  /** ばねの時間（秒）：回転の中心の追従・距離・画角 */
  pivotSmooth: 0.14,
  pivotSmoothVertical: 0.22,
  distanceSmooth: 0.55,
  fovSmooth: 0.45,
  /**
   * r00b：遮られたら竜へ寄せる作りは、都心の高層の間で竜の背中だけが映る寄りになった。
   * 寄せずに、カメラと竜の間の建物を網点で透かす（city/damageGlsl.ts）。寄せるのは建物の中に入るときだけ。
   */
  minDistance: 30,
  /** 建物の中に入りそうなときに寄せる速さ（秒）と、空いたら戻す速さ */
  groundIn: 0.08,
  groundOut: 0.6,
  /**
   * カメラを地面から離す高さ（m）。見上げたときは、竜へ寄せずにこの高さでカメラを止め、視線の向きだけを上げる。
   * r02-controls：指摘「見上げるとカメラが地面から3mまで下がり、尾と街路樹が中央をふさぐ」 旧 groundClearance 3→12
   */
  minHeight: 12,
  /**
   * 見上げたときに竜へ寄せる割合（見上げの上限で距離をこの割合だけ縮める。0 度以下では寄せない）。
   * r02-controls：高さを止めたカメラで見上げると竜が画面の下へ外れるので、少し寄せて背と頭を画面に残す
   */
  lookUpPullIn: 0.22,
  /** 速さの方向へ少し先を見る（秒ぶんの移動量） */
  lookAhead: 0.25,
};

/**
 * r05-camera：怪獣ごとに変えられるカメラの値。怪獣の設定（config/creatures/*.ts の camera）に無い値は DEFAULT_CAMERA_PROFILE。
 * 照準の光線（fixedCamera）と追うカメラは、この同じ値から置くので、照準と画面の中央は一致したまま。
 */
export interface CameraProfile {
  /** 回転の中心の高さ（体の中心から上へ、m） */
  pivotHeight: number;
  /** 肩越し：回転の中心を視点の右へずらす（m） */
  shoulder: number;
  /** 回転の中心までの距離（m）：地上・空中（跳んでいる間も）・急降下 */
  distanceGround: number;
  distanceAir: number;
  distanceDive: number;
  /**
   * 見下ろす角度の足し（度）：カメラを回転の中心のまわりで、視線よりこの角度だけ高い所に置く。視線の向き（照準の向き）は変えない。
   * 視線まで下げると、遊ぶ人には見上げられる範囲が狭まるだけで、自動プレイの決め打ちの見下ろしも狙いがずれるため。0 で r04 までと同じ
   */
  lookDownDeg: number;
  /**
   * カメラが回転の中心より高い所へ回る角度の上限（度。90 で上限なし）。見下ろすほどカメラが上がり、上がるほど的を見下ろすので、
   * 人の遊び方では高さが際限なく上がる（焔角で地面から中央値105m）。上限を超えて見下ろすと、カメラは止まり視線だけが下がる
   */
  maxOrbitDeg: number;
  /** 画角（度）：ふだん・走り（焔角は突進）・急降下 */
  fovBase: number;
  fovRun: number;
  fovDive: number;
  /** 瓦礫の山とビルの上を越えて見せる、体の点の高さ（体の中心から上へ、m）。背の高さほど */
  sightHeight: number;
  /**
   * 飛んでいる間、カメラと体の間のビルを越えるためにカメラを上げてよい高さ（m）。網点で透かす前に上げる。0 で上げない。
   * 上げすぎると体が画面の下へ外れるので、上限を超える分は今までどおり網点で透かす
   */
  buildingLift: number;
  /** 翼を広げた幅（m）。離陸の間は、この幅が画面の横に収まる距離より寄せない */
  wingSpan: number;
  /**
   * r06-camera2：全長の目安（m、config/creatures の view.length と同じ値）。ビルの裏から寄せてよい最短の距離（CAMERA_PLACE.pullPerLength 倍）を
   * 怪獣の大きさから決める
   */
  bodyLength: number;
  /**
   * r06-camera2：見下ろしの足しが効く範囲（度）。視線が lookDownFadeFromDeg より下を向くと減り始め、lookDownFadeToDeg で 0 になる
   * （深く見下ろしたら、紅竜と同じく回転の中心のまわりを視線どおりに回ってカメラも上がり、怪獣が画面の上の端へ逃げない）。
   * 既定は -90（いつも全部効く）
   */
  lookDownFadeFromDeg: number;
  lookDownFadeToDeg: number;
  /**
   * r06-camera2：肩越しのずれの下限（m）。回転の中心が右の建物に入るなら、肩越しを shoulder からこの値まで縮める
   * （camera/placement.ts の shoulderFor）。shoulder と同じなら縮めない（紅竜・雷翼）
   */
  shoulderMin: number;
}

/** 既定（紅竜）。r04 までの FOLLOW_CAMERA と同じ値なので、紅竜の照準は1桁も変わらない */
export const DEFAULT_CAMERA_PROFILE: CameraProfile = {
  pivotHeight: FOLLOW_CAMERA.pivotHeight,
  shoulder: FOLLOW_CAMERA.shoulder,
  distanceGround: FOLLOW_CAMERA.distanceGround,
  distanceAir: FOLLOW_CAMERA.distanceAir,
  distanceDive: FOLLOW_CAMERA.distanceDive,
  lookDownDeg: 0,
  maxOrbitDeg: 90,
  fovBase: FOLLOW_CAMERA.fovBase,
  fovRun: FOLLOW_CAMERA.fovRun,
  fovDive: FOLLOW_CAMERA.fovDive,
  sightHeight: 4,
  buildingLift: 0,
  wingSpan: 80,
  bodyLength: 60,
  lookDownFadeFromDeg: -90,
  lookDownFadeToDeg: -90,
  shoulderMin: FOLLOW_CAMERA.shoulder,
};

/**
 * r06-camera2：カメラをビルの裏に置かない規則（camera/placement.ts の solveCamera。照準の光線と追うカメラが同じ答えを使う）。
 * 見た目の採点 r05 の2位・体験の採点 r05 の TOP4：網点を体のまわりに絞ったので、ビルの真後ろでは画面の大半が不透明な壁になった
 * （カメラから50m 以内の壁が画面の3割を超えた標本 177枚中4枚、最大74%。焔角の始まりでガラスの高層の真後ろ）。
 * 視線（カメラ → 体の点と回転の中心）に立っている建物が入ったら、①画面の中央の線に沿って建物の怪獣の側まで寄せる
 * （最短 max(minDistance, 全長 × pullPerLength)。飛んでいる間は翼の幅が収まる距離も）②寄せきれなければ寄せずに屋上を越える高さまで上げる
 * （上限：要までの距離の liftShare 倍、かつ体の点が画面の縦の半分の keepInFrame 倍より下へ出ない高さ）③残る分は網点
 * ④カメラが建物の箱の中に入るなら、必ず外へ（怪獣の側の面の手前まで寄せるか、屋上の上へ上げるか、動きの少ない方）
 */
export const CAMERA_PLACE = {
  /** 寄せを探す刻み（m） */
  pullStep: 4,
  /** 寄せてよい最短の距離＝全長のこの倍（紅竜60m で36m、雷翼52m で31m、焔角53m で32m）。FOLLOW_CAMERA.minDistance より近くはしない */
  pullPerLength: 0.6,
  /** 視線をふさぐかを調べるとき、体の点・回転の中心の手前でこの長さ（m）は見ない（怪獣が触れている建物で寄せない） */
  sightMargin: 8,
  /** 建物を越えるために上げてよい高さの上限（要までの距離に対する割合） */
  liftShare: 0.3,
  /** 上げても、体の点が画面の中央から縦の半分（画角の半分）のこの割合より下へ出ない */
  keepInFrame: 0.72,
  /** 上げた視線が屋上の上を越える余裕（m） */
  liftMargin: 3,
  /** 中に入ったカメラを押し出すとき、建物の面からさらに離す長さ（m）と、寄せてよい最短の距離（m。これより近いなら屋上の上へ） */
  pushClear: 2,
  pushMin: 16,
  /**
   * 肩越しを縮めるとき、回転の中心を右の建物の面から離す長さ（m）と、縮める・戻すばね（秒）。焔角は肩越し30m で回転の中心が通りの右の
   * 建物に入り、カメラが建物の中から屋上のすぐ上へ押し出されて、画面がほぼ屋上になった（人の遊び方の3分で2枚、50m 以内の面 87〜90%）
   */
  shoulderMargin: 8,
  shoulderIn: 0.25,
  shoulderOut: 0.8,
};

/** 怪獣の設定のカメラの値（一部だけでよい）を、既定で埋める。肩越しの下限を書いていなければ、肩越しと同じ（縮めない）。 */
export function cameraProfileOf(overrides?: Partial<CameraProfile> | null): CameraProfile {
  if (!overrides) return DEFAULT_CAMERA_PROFILE;
  const p = { ...DEFAULT_CAMERA_PROFILE, ...overrides };
  if (overrides.shoulderMin === undefined) p.shoulderMin = p.shoulder;
  return p;
}

/**
 * r05-camera：揺れ。指摘（r01・r03 の見た目の採点）「揺れは位置で2〜4cm と目に見えず、足音や崩落で画面が揺れない」。
 * 揺れは位置でなく向き（カメラの回転）で与え、強さ＝出来事の大きさ × 竜からの距離の減り。角度は「視線の向きの振れの最大」（度）。
 * 減り：ためて（hold 秒）から、seconds 秒で 0 へ（2乗で）減る。重なった揺れは、いちばん大きいものを上限にして足す。
 */
export const CAMERA_SHAKE = {
  /** 着地：衝撃（0〜1、急降下の全力で 1）で minDeg〜maxDeg。縦に揺らす */
  landing: { minDeg: 0.5, maxDeg: 1.0, seconds: 0.5 },
  /** 焔角ののしかかり（跳んで着地）。縦に揺らす */
  slam: { deg: 1.0, seconds: 0.5 },
  /**
   * 崩落：大きさ（建物の高さ ÷ sizeHeight、sizeMin〜1）× 距離の減り × maxDeg。近い高層で 0.5〜1°、遠い崩落は小さい。
   * 傾きに入ったとき（ドミノ・突進で押し倒した瞬間）も、その tiltShare 倍で揺らす
   */
  collapse: { maxDeg: 1.0, sizeHeight: 60, sizeMin: 0.3, seconds: 0.45, tiltShare: 0.4 },
  /** 足音：歩き・走り（度）。足もとなので距離では弱めない */
  step: { walkDeg: 0.08, runDeg: 0.12, seconds: 0.3 },
  /** 近くの一撃（爪・角・翼）と周りを払う技（尾）が建物に当たった：当たった棟数が多いほど、perExtra ずつ（上限 maxDeg） */
  claw: { deg: 0.4, perExtra: 0.08, maxDeg: 0.6, seconds: 0.35 },
  tail: { deg: 0.5, perExtra: 0.08, maxDeg: 0.7, seconds: 0.4 },
  /** 焔角の突進でビルを押し倒した瞬間 */
  charge: { deg: 0.85, seconds: 0.45 },
  /** 怒りの大技を出した瞬間（咆哮・地割れ・怒りの急降下） */
  rage: { deg: 1.0, seconds: 0.5 },
  /** 技の着弾（距離で弱める）：溶岩の礫・地割れの裂け目・落雷の輪の1本・雷の跳ね */
  lava: { deg: 0.35, seconds: 0.35 },
  fissure: { deg: 0.4, seconds: 0.35 },
  bolt: { deg: 0.5, seconds: 0.4 },
  hop: { deg: 0.15, seconds: 0.3 },
  /** 距離の減り：1 ÷ (1 + (距離 ÷ falloffDistance)²)。60m で半分、150m で約14% */
  falloffDistance: 60,
  /** これより弱い揺れは足さない（度） */
  minDeg: 0.03,
  /** 振れ始めてから減り始めるまで（秒） */
  hold: 0.05,
  /** 小さな出来事（足音・爪・尾・技の着弾）の揺れの波の周波数（Hz）：0.6°以上は hzBig、未満は hzSmall（r05-camera のまま） */
  hzBig: 8,
  hzSmall: 13,
  /**
   * r06-camera2：重い出来事（着地・のしかかり・崩落・傾き・突進で押し倒す・怒りの大技）の揺れは、速さと減り方も出来事の大きさ（0〜1）で決める。
   * 見た目の採点 r05 の5位・注2「近い崩落の揺れは1秒に12〜15回向きを変える細かい震えで、ビルが倒れる重さより機械の振動に近い」。
   * 周波数は大きさ 0 で hzMax・1 で hzMin（1往復で2回向きを変えるので、1秒に4〜6回）、減りは secondsMin〜secondsMax 秒で 0 になる
   * （2乗で減るので、山の1割を切るのはその約7割＝0.6〜0.95秒。振れ幅は今のまま）。
   * 振れ始めは attack 秒かけて立ち上げる（ゆっくりの波を山から始めると、1コマで画面が跳ぶ）
   */
  heavy: { hzMin: 2.0, hzMax: 3.0, secondsMin: 0.85, secondsMax: 1.35, attack: 0.05 },
  /**
   * r06-camera2：崩れたビルの側へ少し傾く（どこで崩れたかが揺れから分かる）。崩落の大きさ × 距離の減り × leanDeg だけ、カメラを
   * その建物の見える側へ回し（左右）、rollShare 倍だけ同じ側へ傾ける。leanRise 秒で立ち上がり、揺れと同じ秒数で戻る
   */
  lean: { deg: 0.6, rise: 0.15 },
  /** 向きの配分：縦の揺れ（着地・足音）は上下に、そのほかは上下と左右を混ぜる。ロールは振れの rollShare 倍（視線の向きは変えない） */
  rollShare: 0.5,
};

/**
 * r05-camera：画角の跳ね（度、広げる向き）。大きな当たり（急降下の着地・のしかかり・突進で押し倒す・怒りの大技）は 3〜5°。
 * ばね（周波数と減衰比）に初速を与え、その山が表の度数になるように初速を決める。重なっても maxDeg まで
 */
export const CAMERA_KICK = {
  hz: 2.2,
  zeta: 0.55,
  maxDeg: 5,
  /** 着地：衝撃が minImpact 以上で、衝撃に比例して最大 landingDeg */
  landingDeg: 4,
  landingMinImpact: 0.25,
  slamDeg: 4,
  chargeDeg: 3,
  rageDeg: 5,
  /** 近い大きな崩落（揺れが nearShakeDeg 以上のときだけ）：揺れの角度 × collapsePerDeg */
  collapsePerDeg: 2.5,
  nearShakeDeg: 0.5,
  clawDeg: 1,
  tailDeg: 1.5,
};

/**
 * r05-camera：着地の沈み込み。指摘「着地で体が沈まない」。竜のクリップは変えず、カメラが約0.3秒遅れて下がって戻るばねを重ねる。
 * 臨界に近い減衰のばねに下向きの初速を与え、peakSeconds 秒で depth（m × 衝撃）だけ下がって戻るようにする
 */
export const CAMERA_SINK = {
  peakSeconds: 0.3,
  zeta: 0.8,
  /** 衝撃 1 の着地で下がる深さ（m）。のしかかりは slamDepth */
  depth: 2.6,
  slamDepth: 2.8,
  /** これより弱い着地（衝撃）では沈めない */
  minImpact: 0.15,
};

/**
 * r05-camera：カメラを瓦礫の山とビルの中へ入れない・視線をふさがせない規則（camera/clearance.ts）。体験の採点の B2：
 * 「崩れたビルの瓦礫の山の脇や上で、カメラが山の多角形の中に入り、画面の上半分が暗い面で埋まる」。
 * 山の形は fx/rubble.ts と同じ（崩れ方の規則 city/collapsePose.ts の moundHeight と盛り上がり）。照準の光線も同じ規則で上げる
 */
export const CAMERA_CLEARANCE = {
  /** 山の上面（凸凹の上限で包んだ形）から、カメラを離す高さ（m） */
  rubbleClear: 6,
  /** 山の凸凹の上限（fx/rubble.ts の heapHeight ≤ この倍率 × 台形の形。tests/camera で確かめる） */
  heapBumpMax: 1.26,
  /** 視線（カメラ → 体の点）が山とビルの上を越える余裕（m） */
  sightMargin: 2,
  /** 視線を調べる間隔（m）と、体のまわりで調べない半径（m。体が埋まっている山は網点に任せる） */
  sightStep: 4,
  sightSkip: 16,
  /** 視線のためにカメラを上げてよい高さの上限（回転の中心までの距離に対する割合）。上げすぎると体が画面の下へ外れる */
  sightLiftShare: 0.22,
  /** ビルを越える視線は、外形の外 buildingSoft（m）からなだらかに高さを持たせる（外形に入った瞬間に跳ばないように） */
  buildingSoft: 8,
  /** 追うカメラの上げ下げのばね（秒）：上げるとき・下げるとき。照準の光線はばねを通さない */
  liftRise: 0.12,
  liftFall: 0.5,
  /** 離陸してからこの秒数は、翼の幅が画面の横の spanFill 倍に収まる距離より寄せない */
  takeoffSeconds: 1.6,
  spanFill: 0.85,
};

/**
 * r05-camera：網点（カメラと竜の間の建物を間引いて透かす）の範囲。体験の採点の TOP5「網点を体のすぐ周りに絞る」。
 * 間の建物を1棟まるごと透かすのをやめ、画面の上で怪獣の体（骨を写した外接矩形）と照準の円の中だけ透かす。縁はなだらかに薄める。
 * r00b：奥行きで切る（竜より手前の画素だけ間引く）と、同じ建物の奥の縁だけが宙に浮いて見えたので、画面の上の範囲で決める
 */
export const CAMERA_OCCLUSION = {
  /** 骨のまわりの体の厚み（m）。外接矩形をこの分だけ画面の上で広げる */
  bodyRadius: 5,
  /** 照準の円の半径（画面の高さの半分を 1 とする単位） */
  aimRadius: 0.16,
  /** 縁をなだらかに薄める幅（同じ単位） */
  soft: 0.1,
  /**
   * 外接矩形の半分の大きさの上限（NDC、横・縦）。近くで画面を覆う体でも、網点が画面の3割を超えないように
   * （上限いっぱいの矩形と照準の円と縁を足して、少しでも間引く所が画面の約27%）
   */
  maxHalfX: 0.46,
  maxHalfY: 0.42,
  /**
   * r06-camera2：網点の対象は、光線が建物に入る点の奥行き（カメラの向き）が体の中心の奥行き＋depthSlack（m）より手前の建物だけ。
   * 体験の採点 r05 の B3「網点の窓が、怪獣の向こうで燃やしている的のビルにも開く」：頭の先へ引いた光線が的のビルに入っていた
   */
  depthSlack: 2,
  /**
   * r06-camera2：透かし方（寄せても上げても越えられずに残った壁の見せ方）。window＝今の四角い窓、spread＝カメラのすぐ前の大きな壁では
   * 窓を壁全体へなだらかに広げる、outline＝四角を使わず怪獣の形だけを透かし、壁の上に怪獣の輪郭を描く、outlineSpread＝outline に、
   * すぐ前の大きな面では形のまわりから面全体へ広げるのを足したもの。
   * 人の遊び方の3分（3体、網点の対象があるコマ）で比べて outlineSpread を選んだ：怪獣の見える割合は4つとも同じ。網点の面積の中央値は
   * 形の2つが少なく（最後の版：窓／形＋広げる＝紅竜 3.2／2.2%・雷翼 3.1／1.5%・焔角 1.7／1.1%）、カメラから50m 以内の面の最大は広げる2つが
   * 下げた（紅竜 窓40%・形45% → 34%、雷翼 21% → 16%。途中の版では3割超えのコマも 焔角 4→0枚・紅竜 3→2枚）。代わりに、すぐ前の壁を
   * 透かすので網点の最大は大きい（紅竜 13→49%）。測る道具は camera.userData.occlusionStyle で差し替えて比べる
   */
  style: 'outlineSpread' as 'window' | 'spread' | 'outline' | 'outlineSpread',
  /** spread：外接矩形からの距離 spreadSoft（画面の高さの半分を 1 とする単位）で、透かす度合いが spreadFloor まで下がる */
  spreadSoft: 1.4,
  spreadFloor: 0.4,
  /** spread を始める覆い方：カメラから spreadNear m 以内の網点の対象が画面の spreadOn 以上を覆うと広げ始め、spreadFull で全部広げる */
  spreadNear: 60,
  spreadOn: 0.25,
  spreadFull: 0.45,
  /** outline：骨ごとの太さ（体の当たりの半径に対する割合）と、形の縁の余白（m） */
  silhouette: { torso: 0.62, neck: 0.3, head: 0.34, jaw: 0.2, tailRoot: 0.32, tailTip: 0.08, limbRoot: 0.26, limbMid: 0.18, limbTip: 0.14, wing: 0.12, margin: 1.5 },
  /** outline：怪獣の形の線（骨とその親）と翼の膜の三角形の数の上限（壊れ方の表の最後の行に 1 + 2×線 + 2×三角形 の4つ組で書く） */
  silhouetteMax: { segs: 64, tris: 16 },
};
