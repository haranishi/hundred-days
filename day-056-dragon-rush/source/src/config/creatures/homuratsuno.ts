// OWNER: config
// 焔角（ほむらづの）：翼のない重い四脚。地上の突進と地響きが得意で、飛べない（Space は跳んでのしかかる）。
// 壊し方の芯は「押し倒す」。r04-roster2：押し倒したビルが隣を巻き込むドミノ（gameplay/domino.ts）を入れた。
import { LOCOMOTION as L } from '../locomotion';
import type { MeleeSpec, RingSpec } from '../attacks';
import { DRAGON_LOOK } from '../dragon';
import { SHOWCASE_COMMON } from './kurenai';
import type { CreatureConfig, DominoSpec, FissureSpec, LavaSpec } from './types';

/**
 * 溶岩の礫（左クリック長押し）：0.55秒ごとに照準の点へ放物線で投げる。飛ぶ秒数は距離で決め（100m で約1.4秒）、
 * 弾けた点のまわり半径20mに 130 の輪と、16m 以内の建物への着火。炎より届く間は遅いが、1発で窓と外壁をまとめて壊す。
 * r06-balance：輪を 150→130。地割れが空振らなくなって3分の中央値が 24% の上の端に寄り、礫を多く投げる遊び方（rotation）が 27% に
 * 届いたため（4通り×種20 で 3分の中央値 23.2→22.7%、rotation 26.9→24.7%）
 * 弧の高さ（まっすぐな線より上へ膨らむ量）= 重力 × 秒数² ÷ 8。r03-roster の見た目の確認で、重力 32・100m で1.2秒では弧が 6m しか無く、
 * 巨体の背に隠れて放物線に見えなかったので、重力 55・秒数 0.6＋0.008×距離にした（100m で 1.4秒・弧 13m）
 */
export const LAVA_BOMB: LavaSpec = {
  windup: 0.18,
  range: 170,
  moveScale: 0.6,
  neckYawLimitDeg: 55,
  interval: 0.55,
  gravity: 55,
  flight: { base: 0.6, perMeter: 0.008, min: 0.7, max: 1.9 },
  bombRadius: 1.8,
  ring: { radius: 20, damage: 130, glass: 0.45, glassRadius: 26, hitStop: { scale: 0.35, seconds: 0.035 }, shake: 0.18 },
  igniteRadius: 16,
  heat: 1.4,
};

/** 角の突き上げ（右クリック）：爪より近く狭いが重い。紅竜の爪は 36m・58°・110 */
export const HORN: MeleeSpec = {
  windup: 0.3,
  active: 0.14,
  recovery: 0.5,
  range: 34,
  halfAngleDeg: 42,
  facing: 1,
  below: 14,
  above: 18,
  damage: 175,
  glass: 0.5,
  moveScale: 0.3,
  cancelAfter: 0.22,
  hitStop: { scale: 0.15, seconds: 0.09 },
  shake: 0.4,
};

/** 尾の鎚（Q）：短く太い尾の先の岩で、近くを重く払う。紅竜の尾は 52m・112°・90 */
export const TAIL_HAMMER: MeleeSpec = {
  windup: 0.38,
  active: 0.24,
  recovery: 0.62,
  range: 46,
  halfAngleDeg: 118,
  facing: -1,
  below: 14,
  above: 10,
  damage: 150,
  glass: 0.4,
  moveScale: 0.2,
  cancelAfter: 0.3,
  hitStop: { scale: 0.18, seconds: 0.08 },
  shake: 0.4,
};

/**
 * 地割れ（E）：前脚で叩いて（クリップ stomp の振りかぶり 0.58秒）、体の18m 先から15m おきに14個、0.08秒ずつ遅れて輪の当たりが走る（長さ195m）。
 * r06-balance：指摘「地割れは4回のうち2回が0%（向けた先に建物が無いと空振る）」（体験の採点 r05 の TOP1）。体の向きではなく、E を押した
 * 瞬間の照準のまわりへ走る（尾の鎚で背を向けた直後に押すと、裂け目が的と逆へ走っていた）。照準の左右40°を10°ずつ試し、立っている建物を
 * いちばん多く崩せる向きを選ぶ（照準からずれるほど点を3割まで引く）。その向きで崩れると見込める体積が3万m³（タイルの中層2棟ほど）に
 * 届かなければ、全周から選ぶ。輪の強さは前のまま（人に近い遊び方で1回の3秒の伸びの中央値 約 +1.9%）
 */
export const FISSURE: FissureSpec = {
  windup: 0.58,
  recovery: 0.8,
  start: 18,
  spacing: 15,
  segments: 14,
  delay: 0.08,
  wobble: 3,
  ring: { radius: 17, damage: 250, glass: 0.7, glassRadius: 24, hitStop: { scale: 0.4, seconds: 0.025 }, shake: 0.32 },
  seek: { searchDeg: 40, stepDeg: 10, aimBias: 0.3, fallbackVolume: 30000 },
};

/** のしかかり（Space で跳んで着地）：着地点の半径40mに 330。紅竜の急降下の着地（落下60m/s で半径52m・96）より狭く重い */
export const BODY_SLAM: RingSpec = { radius: 40, damage: 330, glass: 0.85, glassRadius: 52, hitStop: { scale: 0.2, seconds: 0.09 }, shake: 0.7 };

/**
 * ドミノ（r04-roster2）：突進・のしかかり・地割れで傾き・崩落に入ったビルが、倒れる向きの隣へ 0.45秒後に損傷を渡す。
 * 1棟目は耐久の 1.1倍（同じ高さの無傷のビルなら崩落まで）、2棟目 0.88倍・3棟目 0.70倍（どちらも傾きの 0.68 を超える）で、3棟で止まる。
 * 届く隙間は倒れるビルの高さの 0.6倍（住宅 10m で 6m＝同じ街区の隣まで、中層 30m で 18m＝路地を越える、最大 30m）。
 * 自分より高いビルには高さの比でしか効かない（住宅が高層を倒さない）。街の建物の隣との隙間は中央値 2.4m・9割が 4.4m 以内
 */
export const DOMINO: DominoSpec = {
  causes: ['charge', 'slam', 'fissure'],
  maxChain: 3,
  strength: 1.1,
  falloff: 0.8,
  reachPerHeight: 0.6,
  maxReach: 30,
  minOverlap: 2,
  delay: 0.45,
  memberSeconds: 3,
};

export const HOMURATSUNO: CreatureConfig = {
  id: 'homuratsuno',
  name: '溶背',
  recordKey: 'homuratsuno',
  sound: 'homuratsuno',
  card: {
    reading: 'ようはい',
    tagline: '地を駆けて突進。溶岩と地割れで押し崩す',
    // 札の棒：突進 25 m/s（紅竜の走り 22）でも空は無いので速さ 2、角 175・地割れで力 5、飛べないので飛行 0
    bars: { speed: 2, power: 5, flight: 0 },
    labels: { primary: '溶岩の礫', near: '角の突き上げ', sweep: '尾の鎚', special: '地割れ', up: '跳んでのしかかる', fast: '突進' },
  },
  view: {
    url: 'assets/homuratsuno.glb',
    rig: 'homuratsuno_rig',
    lods: ['homuratsuno_lod0', 'homuratsuno_lod1'],
    metaKey: 'creature',
    material: {
      key: 'homuratsuno',
      // 玄武岩のような粗い面：鱗（岩の粒）の凹凸を強く、艶は弱い。喉と口の中は橙に光る（r02-roster の roster.ts から移した）
      look: {
        ...DRAGON_LOOK,
        roughness: 0.84,
        scaleBump: 0.16,
        plateLength: 1.6,
        plateBump: 0.07,
        plateBulge: 0.09,
        hornLine: 0.11,
        membraneStrength: 0,
        throatColor: [1.0, 0.45, 0.08],
        throatStrength: 7,
        eyeGlow: 0.8,
      },
      // 岩の板の隙間と割れ目の溶岩。橙と赤の間を、体に沿った波でゆっくり脈打つ
      emit: { kind: 'lava', colorA: [1.0, 0.42, 0.06], colorB: [0.85, 0.08, 0.015], strength: 3.6, width: 0, pulseHz: 0.35, flow: 0.22 },
    },
    boundsRadius: 50,
    lodDistance: 170,
    // 首は5本（紅竜7本）。首の3本目から先の3本と頭で、狙いを向けきる配分にした
    aimShare: [0.16, 0.24, 0.28, 0.32],
    // r06-motion: 指摘「焔角の鎚の尾はわずかに上下する程度」 重い尾として、遅れ 0.28 秒・しなり 0.65 Hz・減衰比 0.22（戻りがゆっくりで2〜3回揺れる）、
    // 一歩ごとの踏み込みと向き変えで大きく振る。首は短く太いので遅れと振れを小さくした。翼は無い
    secondary: {
      neck: { lag: 0.1, followZeta: 0.7, swingHz: 1.1, swingZeta: 0.4, inertia: 6, brake: 28, turn: 15, step: { pitch: 1.8, yaw: 0.8 }, maxDeg: 18, attackDamp: 0.8, airLag: 1 },
      tail: { lag: 0.28, followZeta: 0.7, swingHz: 0.65, swingZeta: 0.22, inertia: 9, brake: 20, turn: 35, step: { pitch: 8, yaw: 11 }, maxDeg: 65, attackDamp: 0.8, airLag: 1 },
      wing: [],
    },
    anim: { walkFrom: 0.4, walkFull: 3, runFrom: 11, runFull: 21, flapFrom: 0.3, flapFull: 0.72 },
    specialClip: 'stomp',
    wingLegs: false,
    contactScale: 1.5,
    length: 53,
    airClips: [],
    showcase: { ...SHOWCASE_COMMON, jump: 0.9, land: 0.12, breath: 0.95, claw: 0.44, stomp: 0.64, run: 0.35 },
    // 札の影絵（r04-roster2）：咆哮で頭を上げた瞬間（0.85秒）を、斜め前 35°から。横顔だと背の輪郭がこぶの列になり、札の大きさでは
    // 「とげのある甲羅の四足」に読めた。斜め前から頭を上げた姿だと、前へ曲がる角の対が空に抜け、尾の先の鎚も外形に出る
    // （角の突き上げの構え・休みの姿勢・50°も撮って比べ、角と鎚がいちばん読めたこれにした）
    card: { clip: 'roar', t: 0.85, turnDeg: 35 },
  },
  body: {
    bodyHeight: 12.5,
    radius: 11,
    smashSpeed: 15,
    mouthLocal: [0, -1.5, 21],
    feet: [
      { foot: 'HL', phase: 0, x: 5.5, z: -9 },
      { foot: 'FL', phase: 0.25, x: 5.5, z: 9 },
      { foot: 'HR', phase: 0.5, x: -5.5, z: -9 },
      { foot: 'FR', phase: 0.75, x: -5.5, z: 9 },
    ],
  },
  motion: {
    canFly: false,
    // 歩き 9→8、走り（突進）22→25 m/s（歩幅は GLB の 13m・20m）。旋回は紅竜と同じ規則で、180度を1.0秒以内に保つ
    // （突進から振り返る180度は、速いときの旋回 160度/秒 でちょうど1.0秒だったので、175度/秒にして余裕を持たせた）
    ground: { ...L.ground, walkSpeed: 8, runSpeed: 25, accel: 10, runAccel: 18, decel: 26, turnFastDeg: 175, strideWalk: 13, strideRun: 20 },
    // 空の数値は使わない（飛べない）。型をそろえるために紅竜のものを置く
    air: L.air,
    dive: L.dive,
    // のしかかりの着地（落下34 m/s）で衝撃 0.76 になるよう、衝撃の満点を 70→45 m/s にした。硬直は 0.25 + 0.15 × 衝撃
    landing: { ...L.landing, recoverBase: 0.25, recoverPerImpact: 0.15, keepSpeed: 0.3, fullImpactSpeed: 45 },
    // 跳ぶ：頂点 13.8m・滞空 1.6秒（GLB の jump の跳ぶ〜落ちるの長さ 1.2秒より少し長い）
    jump: { crouch: 0.3, launchSpeed: 34, gravity: 42, forwardMin: 12, forwardMax: 24, steerDeg: 50 },
    // 突進：15 m/s 以上で、壁への深さ 0.3（約73度）より正面寄りに当たれば傾きまで押し倒し、速さを 0.82 残す
    charge: { minSpeed: 15, minInto: 0.3, keep: 0.82 },
  },
  moves: {
    primary: { kind: 'lava', spec: LAVA_BOMB },
    near: HORN,
    sweep: TAIL_HAMMER,
    special: { ground: { kind: 'fissure', spec: FISSURE }, air: null },
    slam: BODY_SLAM,
    domino: DOMINO,
  },
  // r06-balance：地割れが空振らなくなった分（3分で +2〜3%）、怒りのたまり方を 0.9倍にした（初めての満タンの中央値 約30秒。1.0 では26秒で3分の中央値が25%）
  rage: { gainScale: 0.9 },
  // r05-camera：指摘（r03 見た目・r04 体験）「背中が照準のすぐ下から画面の下端までを占め、前の地面と地割れの出だしが見えない
  // （体の上の端は画面の下から46〜49%、照準の下の中央3分の1の約2割）」。背の板を低くしても胴がふさぐので、カメラで下げる。
  // 回転の中心を背の上まで上げ（13→22m）、遠く（74→100m）、視線より8°高い所から見下ろし、画角を少し広げる（58→64°）。
  // 体は画面の下の3割に収まり、照準の下に前の地面が見える。跳んでいる間も同じ距離（寄り引きさせない）。
  // カメラが中心より26°を超えて高く回らないようにする（上限なしでは、人の遊び方で地面から中央値105m の見下ろしになった）。
  // 試した値（自動プレイの16時刻の中央値、体の上の端／照準の下の中央3分の1）：距離92・画角62 で 0.29／0.12、肩越し13m で 0.29／0.12
  // r06-camera2：指摘（見た目 r05 の3位・体験 r05 の TOP3）「画面の1.3%の小さく暗い塊。深く見下ろすと頭が画面の上の端へ逃げる」。
  // 後ろから見た焔角は細く（画面の横幅の8%）、照準の真下の帯にほぼ全部が入るので、寄せて大きくすると「照準の下の中央3分の1」が
  // 写る大きさの約6倍で増える（距離75・画角58 で写る大きさ2.9%・照準の下0.17）。肩越しを 8→30m に広げて体を画面の左下へ寄せ、
  // 距離 100→70m・画角 64→60°で写る大きさ3.4%（姿勢18通りの中央値）、照準の下の中央3分の1 0.078（最大0.099）。肩越し 20m では 0.15、26m では 0.11。
  // 見下ろしの足しは視線が −12°より下で減らし −40°で 0、回る角度の上限は外す（深く見下ろしたら紅竜と同じくカメラも上がり、体は画面の中ほどに残る）。
  // 人の遊び方の3分（3秒おき59枚、最後の版）で、写る大きさ1.48→3.13%、照準の下の中央3分の1 0.087→0.070（90%点 0.091）、50m 以内の壁が
  // 3割超え 2→1枚（最大56→47%）。
  // 回転の中心が右の建物に入るときだけ、肩越しを r05 の 8m まで縮める（camera/placement.ts の shoulderFor。中心が建物の中だとカメラが建物の中から
  // 屋上のすぐ上へ押し出され、画面がほぼ屋上になった）。カメラの横の壁まで見て縮める規則も試したが、3分の通しで壁が減らなかったので入れない
  camera: {
    pivotHeight: 22,
    shoulder: 30,
    shoulderMin: 8,
    distanceGround: 70,
    distanceAir: 70,
    distanceDive: 70,
    lookDownDeg: 8,
    lookDownFadeFromDeg: -12,
    lookDownFadeToDeg: -40,
    maxOrbitDeg: 90,
    fovBase: 60,
    fovRun: 64,
    fovDive: 64,
    sightHeight: 7,
    wingSpan: 17,
    bodyLength: 53,
  },
};
