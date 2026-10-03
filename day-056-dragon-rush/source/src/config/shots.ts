// OWNER: config
// 固定ショット6構図（GRAPHICS-DIRECTION.md）。名前は変えない。
// 位置は街のデータの目印（大通りどうしの交差点など）からの相対で持ち、街の生成が変わっても構図が崩れにくくする。
// 座標の向き：x が東、z が南。heading は +z を 0 として上から見て反時計回り（度）。

export const SHOT_NAMES = ['overview', 'street', 'breath', 'landing', 'closeup', 'aftermath'] as const;
export type ShotName = (typeof SHOT_NAMES)[number];

export function isShotName(value: string): value is ShotName {
  return (SHOT_NAMES as readonly string[]).includes(value);
}

export type Vec3Tuple = [number, number, number];

export interface ShotSpec {
  description: string;
  /** 竜の姿勢（config/dragon.ts の DRAGON_POSES の名前） */
  pose: string;
  fov: number;
  /** 露出の倍率（固定。撮影ごとに測って決める） */
  exposure: number;
  /** 撮影する時刻（水面の波・雲の位置が決まる） */
  simTime: number;
  /** 影・AO が落ち着くまで回すコマ数 */
  settleFrames: number;
  /** ?film のときの竜の動き（前進の速さ m/s、羽ばたきの振幅（度）と周波数（Hz）） */
  film: { speed: number; flapAmplitude: number; flapHz: number };
}

export const SHOTS: Record<ShotName, ShotSpec> = {
  overview: {
    description: '湾岸の街を上空から見下ろし、竜が画面中央のやや下を飛ぶ。夕日は逆光',
    pose: 'glide',
    fov: 50,
    // 逆光で反射ガラスの塔が光るので、露出を少し絞る
    exposure: 0.82,
    simTime: 12,
    settleFrames: 48,
    film: { speed: 32, flapAmplitude: 22, flapHz: 0.55 },
  },
  street: {
    description: '大通りの目の高さから、交差点に降りた竜を見上げる',
    pose: 'stand',
    fov: 62,
    exposure: 1.15,
    simTime: 12,
    settleFrames: 48,
    film: { speed: 0, flapAmplitude: 6, flapHz: 0.3 },
  },
  breath: {
    description: '中層ビルへ炎を吐き、ビルが傾き始めている（炎と崩れは r00b で入れる）',
    pose: 'breath',
    fov: 52,
    exposure: 1.1,
    simTime: 12,
    settleFrames: 48,
    film: { speed: 0, flapAmplitude: 8, flapHz: 0.4 },
  },
  landing: {
    description: '着地の瞬間。土煙の輪と、周りの窓ガラスの破片（粒子は r00b で入れる）',
    pose: 'land',
    fov: 56,
    exposure: 1.1,
    simTime: 12,
    settleFrames: 48,
    film: { speed: 0, flapAmplitude: 30, flapHz: 0.8 },
  },
  closeup: {
    description: '竜の頭と首の寄り',
    pose: 'snarl',
    fov: 40,
    exposure: 1.05,
    simTime: 12,
    settleFrames: 48,
    film: { speed: 0, flapAmplitude: 5, flapHz: 0.35 },
  },
  aftermath: {
    description: '燃える街区を上空から見る。煙の柱と火の照り返し（炎と煙は r00b で入れる）',
    pose: 'hover',
    fov: 48,
    exposure: 1.0,
    simTime: 12,
    settleFrames: 48,
    film: { speed: 10, flapAmplitude: 26, flapHz: 0.7 },
  },
};

/**
 * 構図の数値。anchor は街の目印（harness/shotResolver.ts が解決する）。
 * offset は目印を原点にした (東, 上, 南) の m。カメラは道の上（車道の中）に置き、建物にめり込ませない。
 * 夕日は西（湾）から東西の大通りに沿って差し込むので、竜の顔を照らす構図は西から東を見る。
 */
export const SHOT_LAYOUT = {
  overview: {
    camera: { from: [720, 305, 70] as Vec3Tuple, azimuthDeg: 264, pitchDeg: -6 },
    // r00c-竜：水面の光の柱に重なって読めなかったので、柱の左へずらして近づけた（496,256,94 → 580,262,108）
    dragon: { at: [580, 262, 108] as Vec3Tuple, headingDeg: -95, pitchDeg: -4, rollDeg: -10 },
  },
  street: {
    // 目印：南北の大通りと東西の大通りの交差点。カメラは交差点の西の車道で目の高さ、夕日を背に東を見上げる
    camera: { offset: [-58, 1.7, 7] as Vec3Tuple, lookOffset: [0, 15, 0] as Vec3Tuple },
    // r00c-竜：正面だと首・胴・尾の長さが読めないので、斜め前を向かせた（-72° → -38°）
    dragon: { offset: [0, 0, 0] as Vec3Tuple, headingDeg: -38 },
  },
  breath: {
    // 目印：交差点の近くの、西を向いた中層ビル。竜は前の道に沿って立ち、首をビルへ向ける。
    // カメラは同じ道の先から、少し高い位置で竜とビルの正面を斜めに見る
    searchOffset: [60, 0, 60] as Vec3Tuple,
    searchRadius: 420,
    // r00b：16m では口とビルが近すぎて炎の流れが見えなかったので離した
    dragonStandoff: 30,
    neckYaw: 62,
    // 竜を離した分、カメラは竜からビルの側へ寄せ、ビルの正面から21mの車道の上に置く
    camera: { along: 78, toward: -9, up: 15 },
  },
  landing: {
    // 目印：南北の大通りと2本目の東西の大通りの交差点。カメラは東の車道の中央で低く、夕日を正面に見る
    camera: { offset: [95, 4.5, 3] as Vec3Tuple, lookOffset: [0, 14, 0] as Vec3Tuple },
    dragon: { offset: [0, 3.5, 0] as Vec3Tuple, headingDeg: 95, pitchDeg: -12 },
  },
  closeup: {
    // 竜は交差点で夕日（西）を向く。カメラは竜の局所座標（+x 左・+z 前）で頭の左の斜め前（横顔が読める角度）
    dragon: { offset: [0, 0, 0] as Vec3Tuple, headingDeg: -95 },
    camera: { fromHeadLocal: [14, 1.2, 8] as Vec3Tuple, lookForward: 3.6 },
  },
  aftermath: {
    // 目印：交差点の北東の街区。夕日を背に、西南西の上空から見下ろす
    camera: { offset: [-300, 250, 210] as Vec3Tuple, lookOffset: [70, 0, -60] as Vec3Tuple },
    dragon: { offset: [-175, 168, 112] as Vec3Tuple, headingDeg: 60, pitchDeg: 10, rollDeg: -22 },
  },
} as const;

/**
 * ?film=pan：カメラが街の上を横へ流れる連番（r01-city で追加）。窓のモアレと影の泳ぎを測るための材料なので、竜は映さない。
 * 湾の上の少し高い所から、西日を受けた都心の塔の正面を斜めに見て、岸と平行に南へ流れる。
 */
export const PAN_FILM = {
  /** 始点（東, 上, 南）の m と、1秒あたりの移動（m）。60コマで約24m 流れる */
  from: [-600, 92, -210] as Vec3Tuple,
  velocity: [0, 0, 24] as Vec3Tuple,
  azimuthDeg: 70,
  pitchDeg: -12,
  fov: 55,
  exposure: 1.0,
  simTime: 12,
} as const;

/**
 * ?film=collapse（r03-fx で追加。撮影の口）：breath と同じ中層ビルを傾きまで壊して燃やし、崩れる瞬間を含む連番を撮る。
 * カメラは breath より引いて、ビルの正面の道の先の上空から、倒れる向き（道と反対の奥）を横から近い角度で見る。
 * 1コマで stride 刻み（1/60 秒ずつ）進めるので、90コマで3秒（傾き0.25秒 → 崩落約2.2秒 → 土煙）が入る。
 */
export const COLLAPSE_FILM = {
  /** 前もって与える損傷（耐久に対する割合。0.68〜1 が傾き）と、崩れさせる追いの損傷 */
  preDamage: 0.9,
  extraDamage: 0.3,
  /** 当てる高さ（ビルの高さに対する割合）。割れる高さの目安になる */
  hitHeight: 0.55,
  /** 撮る前に傾きと燃えを育てる秒数と、撮り始めてから追いの損傷を入れるまでの秒数 */
  setupSeconds: 2.5,
  hitAtSeconds: 0.25,
  /** カメラ：ビルの正面の点から、道に沿って along・道の側へ toward・高さ up（m）。見る点はビルの中心の高さ lookHeight 倍 */
  camera: { along: -100, toward: 24, up: 70, lookHeight: 0.4, fov: 44 },
  stride: 2,
} as const;

/**
 * 破壊の出てくる3構図の場面作り（harness/shotScenes.ts）。遊びと同じ仕組み（Stage）に決まった操作を与えて作るので、
 * 炎・崩れ・燃えた街区は本物の効果で写る。数値はどれも「その瞬間に見せたいもの」から決めた。
 */
export const SHOT_SCENES = {
  breath: {
    /** 当てるビルの損傷（耐久に対する割合）。0.68〜1 で「傾き始め」 */
    damage: 0.96,
    /** 炎を吐き続けた秒数（燃え・傾き・炎の流れが落ち着くまで） */
    seconds: 3,
  },
  landing: {
    /** 着地の落下速度（m/s、急降下の全力に近い）と、着地から撮るまでの秒数（土煙の輪が広がる途中） */
    fallSpeed: 60,
    seconds: 0.75,
  },
  aftermath: {
    /** 燃やす街区の半径（m） */
    radius: 170,
    /** 建物を id 順に並べ、この間隔ごとに燃やす・崩す・傷める */
    igniteEvery: 2,
    collapseEvery: 5,
    tiltEvery: 7,
    /** 街だけを進める秒数と、そのうち最後の何秒で効果（煙の柱など）を育てるか */
    worldSeconds: 38,
    fxSeconds: 16,
  },
} as const;
