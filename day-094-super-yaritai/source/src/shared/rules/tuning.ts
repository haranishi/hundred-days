/**
 * ゲームの数値（正本。docs/03_ルール.md の値をここに集める）。
 * 体験ループで直すのはこのファイルだけにしたいので、ほかのファイルに数値を直書きしない。
 * 単位：秒・メートル・点。
 */
import type { CpuLevel } from '../view';

export const MATCH = {
  countdown: 3,
  /** 既定の試合の長さと、部屋の主が選べる長さ */
  duration: 120,
  durations: [90, 120, 180] as const,
  /** 開店直後は店員が追わない（最初の成功体験をここで作る） */
  friendlyOpening: 20,
  /** 残りこの秒数で店長が出る */
  managerAt: 60,
  /** 残りこの秒数からラストスパート */
  lastSpurtAt: 10,
  lastSpurtMultiplier: 1.5,
  /** 結果を出す前の「そこまで！」の間 */
  endDelay: 1.6,
};

export const SCORE = {
  /** コンボの猶予。点が入るたびにここから数え直す */
  comboWindow: 5,
  /**
   * 連打・長押しの悪事（ベル・試食・放送・冷凍ケース・駄々）の最中は、コンボの猶予を減らさない。
   * 連打は押すたびにこの秒だけ止めておく（押す間隔より長く）
   */
  engageGrace: 0.6,
  /** 段ごとの倍率（段0〜4） */
  comboMultipliers: [1.0, 1.2, 1.5, 2.0, 3.0] as const,
  /** やっちゃダメを初めて達成（倍率はかけない） */
  achieveBonus: 300,
  /** 10個すべて達成 */
  completeBonus: 3000,
  secretBonus: 800,
  /** 棚・台の商品を床に落とした1個 */
  knockItem: 10,
  /** 店員から逃げ切った */
  escape: 100,
};

/** 称号。min 以上で、その称号（上から順に見る） */
export const TITLES: readonly { min: number; title: string }[] = [
  { min: 10000, title: '伝説の迷惑客' },
  { min: 7000, title: '出入り禁止' },
  { min: 4000, title: '店長に顔を覚えられた' },
  { min: 1500, title: '要注意人物' },
  { min: 0, title: 'ちょっと迷惑なお客さん' },
];
export const COMPLETE_BADGE = 'やっちゃダメ全制覇';

export const HEAT = {
  max: 100,
  /** 点が入ると「点÷この値」だけ上がる */
  perPointsDivisor: 10,
  maxPerScore: 25,
  samplesBite: 8,
  pa: 40,
  /** この秒数なにもしないと下がり始める */
  calmAfter: 2,
  decayPerSecond: 5,
};

export const FALL = {
  /** 定位置からこれだけ動いたら「動いた」 */
  moveDistance: 0.35,
  /** これだけ傾いたら「動いた」（度） */
  tiltDegrees: 50,
  /** 最後に触った人の記録が有効な秒数（これより古ければ点なし） */
  ownerWindow: 3,
  /** 床に着いたとみなす高さ（物の一番低い所） */
  floorContact: 0.1,
  /** 商品どうしの引き継ぎ：この速さ以上で動いている物だけが相手に渡す */
  handoffSpeed: 0.6,
};

export const AVATAR = {
  radius: 0.3,
  /** 背の高さ（カプセルの全長） */
  height: 1.6,
  runSpeed: 5,
  /** 歩きの見た目に切り替える速さ */
  walkAnimBelow: 2.6,
  dashSpeed: 9,
  dashTime: 0.35,
  dashCooldown: 1.5,
  /** 速さを目標に寄せる加速度（大きいほどキビキビ） */
  accel: 45,
  turnRate: 16,
  gravity: 25,
  jumpSpeed: 7.2,
  /** 段差を自動で上る高さ */
  stepHeight: 0.3,
  /** 1回の動作（蹴る・なぎ払い・ベル）の見た目の長さ */
  actionAnimTime: 0.45,
  /** ネットの参加者の位置を受け入れる速さの上限（瞬間移動の位置は丸める。docs/05） */
  remoteMaxSpeed: 14,
  /**
   * 参加者の写しの置き直し：届いた位置からこの距離以上離れたまま、remoteSnapAfter 秒ほとんど近づけていなければ（棚などに引っかかった）、
   * 届いた位置が動かない物の中でない限り、そこへ置き直す（通信が詰まって位置がまとめて届いたときも、店員が幽霊を追わないように）
   */
  remoteSnapDistance: 1.5,
  remoteSnapAfter: 0.5,
  /** この速さ（m/秒）より遅くしか近づけていなければ「引っかかっている」 */
  remoteStuckSpeed: 0.5,
};

/** アクションの案内（round3 の C1：表示が出ている間に押せば必ず成功する） */
export const ACTION = {
  /**
   * 悪事の案内は、範囲を出てもこの秒数は残す（止まりぎわに滑って出た・表示から押すまでの間に出た、で蹴りに化けない）。
   * ただし、案内が最後に出ていた所から stickyRange（m）より離れたら残さない
   */
  stickyTime: 0.4,
  stickyRange: 0.8,
};

export const SWEEP = {
  /** 棚の面からこの距離以内で使える */
  reach: 1.4,
  /** 目の前のこの幅の商品が対象 */
  width: 2.2,
  outSpeed: [2.6, 4.2] as const,
  upSpeed: [1.4, 2.6] as const,
  /** 腕を振る向き（棚に沿う向き）の速さ */
  alongSpeed: [-1.2, 1.2] as const,
  spin: 8,
  /** なぎ払いの印が有効な秒数（この間に床に落ちたら sweep で数える） */
  tagWindow: 4,
  /** 連続で振れる間隔 */
  cooldown: 0.5,
};

export const KICK = {
  reach: 1.2,
  /** 扇の半分の角度（度） */
  halfAngle: 55,
  forwardSpeed: [5.5, 7.5] as const,
  upSpeed: [2.0, 3.2] as const,
  spin: 10,
  cooldown: 0.4,
};

export const PYRAMID = {
  /** 下の段から */
  rows: [8, 7, 6, 5, 4] as const,
  canPoints: 15,
  /** この割合が定位置から動いたら崩れた */
  collapseRatio: 0.8,
  collapseBonus: 500,
  rebuildAfter: 25,
  /** 積み直しで「ふわっと」戻す時間 */
  rebuildTime: 1.2,
  /** 特売台のそばで「蹴る」の案内を出す距離 */
  promptRange: 2.2,
  /** いちばん近い缶まで（水平）これより遠いときは、一歩踏み込んでから蹴る（案内が出ていれば必ず当たる） */
  kickReach: 1.25,
  /** 踏み込みの速さ（m/秒）と、跳ぶ高さ */
  lungeSpeed: 9,
  lungeHeight: 0.22,
  /** 「蹴る」1回で跳ばす缶の数（下の2段の、当たった所に近い順）。上の段はつられて崩れ、1回で8割に届く（round4 の F2） */
  kickCans: 12,
  /** 当たる所を、缶の並びの真ん中から蹴った人の正面へどれだけ寄せるか（0＝いつも真ん中、1＝正面） */
  kickAim: 0.35,
};

export const CART = {
  count: 6,
  maxSpeed: 10,
  accel: 7,
  /** 入力がないときの減速 */
  drag: 3.5,
  /** 曲がりは遅め（ラジアン/秒）。止まりかけ（秒速 slowSpeed 以下）は turnRateSlow まで速く曲がれる */
  turnRate: 2.4,
  turnRateSlow: 5,
  slowSpeed: 3,
  /** 入力が進む向きと逆（向きとの内積がこれ未満）なら、ブレーキ→止まったら後退 */
  reverseDot: -0.3,
  brake: 14,
  reverseSpeed: 3.5,
  /** 入力があるのにこの秒数ほとんど動けなければ、少し後ろへ戻す（押し付けて固まらない） */
  stuckAfter: 0.5,
  backOff: 0.4,
  /** 押し付けてこの秒数動けなければ、壁に沿って横へ向きを変える（round3 の C2。だめなら stuckAfter で後ろへ戻す） */
  slideAfter: 0.3,
  /**
   * 曲がった先がこの距離（m。速さ×lookAheadPerSpeed を足す）のうちに棚・壁・レジでふさがっていて、いまの向きは空いているなら、
   * 曲がらずにそのまま進む（置き場で↑を押すとレジへ突っ込んで固まらない。壁に沿って走る）
   */
  lookAhead: 0.9,
  lookAheadPerSpeed: 0.15,
  /** 乗ってから launchTime 秒は、曲がった先を launchLookAhead m まで見る（置き場から出るときにレジへ向かって曲がらない） */
  launchTime: 0.7,
  launchLookAhead: 2.6,
  /** 乗れる距離 */
  rideRange: 1.5,
  /** この速さ以上で1mごとに点 */
  scoreSpeed: 4,
  pointsPerMeter: 5,
  crashSpeed: 5,
  crashBonus: 50,
  /** この速さ以上で特売台にぶつかると、台が揺れて缶が崩れる（点の+50 は crashSpeed から） */
  bumpSpeed: 3,
  crashCooldown: 0.6,
  goalMeters: 30,
  mass: 18,
  /** 乗っている人の立ち位置（カートの中心から後ろへ） */
  riderOffset: 0.85,
  /** ダッシュを押すと、乗っているカートの速さに足す */
  dashBoost: 3,
  /** 壁や棚にぶつかったら、速さをこの割合に落とす */
  bumpKeep: 0.2,
};

export const BELL = {
  points: 20,
  /** これより速い連打は数えない（約8回/秒で押しても取りこぼさない。round4 の F3） */
  minInterval: 0.08,
  /** この秒数のうちに数えるのは maxInWindow 回まで */
  window: 10,
  maxInWindow: 20,
  goal: 20,
  range: 1.6,
};

export const SAMPLES = {
  count: 8,
  points: 30,
  /** 皿を空にした人に */
  allBonus: 300,
  refillAfter: 20,
  /** 1本食べると上がる目立ち度 */
  heat: 8,
  /** これより速い連打は食べない */
  biteInterval: 0.18,
};
export const PA = {
  points: 500,
  holdTime: 2,
  /** 店員が放送ブースへ向かう秒数（その間は誰も追わない） */
  lureTime: 10,
  /** 客が止まる秒数 */
  shopperFreeze: 3,
  heat: 40,
  /** 次に放送できるまで（同じ人が放送し続けないように） */
  cooldown: 20,
};
export const FREEZER = {
  pointsPerSecond: 100,
  maxSeconds: 3,
  /** 3秒涼んだあと、次に点が入るまでの間 */
  cooldown: 5,
  /** 「入る」の案内を出す距離（冷凍ケースの外側から） */
  hopRange: 1.4,
  /** 飛び込みにかける時間（この秒数で中に着く） */
  hopTime: 0.5,
  /** 中で移動キーをこの秒数押し続けたら、その向きへ飛び出す */
  exitHold: 0.3,
};
export const BANANA = {
  slipPoints: 200,
  slipClerkPoints: 400,
  maxPeels: 2,
  peelLife: 40,
  /** 置いてからこの秒数は踏んでも滑らない（置いた本人がすぐ転ばないように） */
  armDelay: 0.8,
  /** 皮を踏んだとみなす距離 */
  slipRadius: 0.45,
  /** プレイヤーが転ぶ秒数（店員は CLERK.slipStun） */
  playerSlip: 1.5,
  /** 皮を置く位置（足元から後ろへ） */
  dropBehind: 0.55,
  /** 台のバナナがなくなってから補充するまで */
  refillAfter: 20,
};
export const TANTRUM = {
  pointsPerSecond: 100,
  maxSeconds: 3,
  /** この秒数長押ししたら駄々が始まる（押してすぐの なぎ払い と区別する） */
  holdDelay: 0.3,
  cooldown: 5,
  /** これより速く動いていたら止まっていない */
  stillSpeed: 0.6,
  /** 看板の真下からこの距離（m）のうちは、棚の「なぎ払う」より「駄々をこねる」の案内を先に出す（床に黄色い輪） */
  promptRange: 0.8,
};
export const BOWLING = {
  pinPoints: 50,
  strikeBonus: 500,
  goalPins: 5,
  pinsResetAfter: 8,
  watermelons: 6,
  refillAfter: 15,
  rollSpeed: 9.5,
  /** 転がしてからこの秒数のうちに倒れたピンを、その1投に数える */
  throwWindow: 6,
  /**
   * 転がしたスイカは、この秒数のあいだ横へそれにくくする（横の速さを毎刻みこの割合に減らす）。
   * ピンの間を押し通って、点線のとおりに進む（round4 の F4）
   */
  straightTime: 1.6,
  sideKeep: 0.15,
  /** ピンを抜けるまでは、この速さより遅くならない（ピンの塊で止まらない） */
  minRollSpeed: 5,
  /** スイカを持ってレーンにいる間、←→でその場で向きを変える速さ（ラジアン/秒）と、レーンの幅の半分 */
  aimTurnRate: 1.1,
  laneHalfWidth: 1.6,
};
/** 持てる物（スイカ・バナナ）を拾える距離 */
export const PICKUP_RANGE = 1.3;
export const CLERK = {
  count: 2,
  walkSpeed: 2.2,
  chaseSpeed: 4.4,
  managerChaseSpeed: 4.8,
  noticeHeat: 30,
  sightRange: 9,
  hearRange: 6,
  giveUpAfter: 4,
  catchRange: 1,
  /** 「！」を出してから、手が届いても捕まえるまでの最低の秒（見てから逃げられる猶予） */
  catchDelay: 1,
  /** 捕まえたら、その場でつかんで止める秒（誰に捕まったかを見せてからカウンターへ） */
  grabTime: 0.6,
  /** カウンターでのお休み（つかんでいる grabTime の後） */
  caughtStun: 3,
  restAfterCatch: 5,
  slipStun: 3,
};

export type CpuTask = 'bell' | 'cart' | 'sweep' | 'pyramid' | 'samples' | 'pa' | 'freezer' | 'banana' | 'tantrum' | 'bowling';

export interface CpuTuning {
  /** 移動の速さの倍率 */
  speed: number;
  /** 判断の間（秒）。1つ終えてから次を始めるまで */
  think: number;
  /** 追われたらダッシュで逃げる */
  flee: boolean;
  /** 遠くへ行くときもダッシュを使う */
  dashTravel: boolean;
  /** 連打の間隔（ベル・試食） */
  mashInterval: number;
  /** 達成済みの悪事をもう一度やる気（1＝同じ、0＝やらない）。2分の点の目安（docs/03）に合わせる */
  revisit: number;
  /** やる悪事（やさしいは近くの簡単なものだけ） */
  kinds: readonly CpuTask[];
  /** 1回の訪問でベルを鳴らす回数・缶ピラミッドを蹴る回数・なぎ払う回数・試食を食べる本数 */
  bellRings: number;
  pyramidKicks: number;
  sweeps: number;
  bites: number;
  /** 同じ悪事をもう一度やるまでに空ける秒数（張り付いて稼ぎすぎないように） */
  repeatGap: number;
  /** 本気：相手の通り道にバナナの皮を置く・追われたら放送で店員をそらす */
  tricks: boolean;
  /** カートで走る距離（m）。この距離を走ったら降りる（ふつう・本気は缶ピラミッドまで走り切る） */
  cartMeters: number;
}

export const CPU: Record<CpuLevel, CpuTuning> = {
  easy: { speed: 0.8, think: 3.2, flee: false, dashTravel: false, mashInterval: 0.3, revisit: 0.05, kinds: ['sweep', 'bell', 'cart', 'freezer'], bellRings: 5, pyramidKicks: 1, sweeps: 1, bites: 3, repeatGap: 100, tricks: false, cartMeters: 34 },
  normal: { speed: 0.95, think: 0.8, flee: true, dashTravel: false, mashInterval: 0.2, revisit: 0.3, kinds: ['sweep', 'bell', 'cart', 'freezer', 'pyramid', 'samples', 'pa', 'banana', 'tantrum', 'bowling'], bellRings: 10, pyramidKicks: 1, sweeps: 3, bites: 6, repeatGap: 40, tricks: false, cartMeters: 70 },
  hard: { speed: 1.0, think: 0.3, flee: true, dashTravel: true, mashInterval: 0.13, revisit: 0.7, kinds: ['sweep', 'bell', 'cart', 'freezer', 'pyramid', 'samples', 'pa', 'banana', 'tantrum', 'bowling'], bellRings: 20, pyramidKicks: 3, sweeps: 4, bites: 8, repeatGap: 24, tricks: true, cartMeters: 70 },
};

/** CPU の選び方（強さによらない。round2 の7） */
export const CPU_PLAN = {
  /** GO からこの秒数は缶ピラミッドを目標にしない */
  openingPyramidGrace: 5,
  /** 試合の最初の行き先は、見込みの上位この数からくじで選ぶ（毎回同じ所へ行かない） */
  firstPick: 4,
  /** 缶ピラミッドは、この距離（m）より遠ければ見込みを下げる（近くを通ったら崩す程度に） */
  pyramidNear: 5,
  pyramidFarScale: 0.3,
};

export const PHYSICS = {
  hz: 60,
  /** 商品とカートにかかる重力（少し強めにして、崩れる・落ちるをキビキビ見せる） */
  gravity: 12.3,
  /** 1フレームで追いつく刻みの上限（これ以上遅れたら時間を捨てる） */
  maxSubsteps: 4,
  floorFriction: 0.9,
  propFriction: 0.7,
  /** 缶は滑りやすく（崩れやすく）する */
  canFriction: 0.35,
  propRestitution: 0.12,
  /** 商品の重さ（kg/立方m）。小さい物も飛びすぎないよう、下限を設ける */
  propDensity: 140,
  propMinMass: 0.25,
  propMaxMass: 6,
};

/** 経路の格子 */
export const NAV = {
  cell: 0.5,
  /** 動かない物からこれだけ離れた所を歩く（キャラの半径＋ゆとり） */
  clearance: 0.42,
};

export const RENDER = {
  /** Kenney Mini シリーズを何倍にするか（docs/04） */
  modelScale: 2.3,
  /** カメラ：見下ろす角度（度。縦長は北の壁の向こうの空が広く見えないよう、より真上から）と、キャラからの距離（横長・正方形に近い・縦長）、縦の画角（横長・縦長） */
  cameraPitch: { landscape: 50, portrait: 58 },
  cameraDistance: { wide: 14, square: 16, tall: 17.5 },
  cameraFov: { landscape: 45, portrait: 55 },
  /** スマホ縦だけ、見る点をキャラより前（北）へずらす（m）。自分が画面の下寄りに来て、進む先が広く見える。向きは変えない */
  cameraLeadPortrait: 3,
  /** カメラがキャラを追う速さ（大きいほどぴったり付いてくる） */
  cameraFollow: 7,
  /** 透かしの円の半径（画面の短い辺に対する割合）と、キャラより何m手前から透かすか */
  xrayRadius: { mobile: 0.15, desktop: 0.12 },
  xrayMargin: 0.9,
  pixelRatioMobile: 1.5,
  pixelRatioDesktop: 2,
  /** 毎秒の描画数がこれを下回り続けたら画質を下げる */
  fpsFloorMobile: 28,
  fpsFloorDesktop: 40,
  fpsWindow: 3,
  /** タイトルの後ろで店を描く回数（毎秒） */
  idleFps: 30,
  /** 棚の商品で影を落とすのは、この大きさ（m）以上の物だけ */
  productShadowMin: 0.5,
};
