// OWNER: config
// 雷翼（らいよく）：二脚＋大きな翼の翼竜。空が速く、地上は遅く爪が弱い。壊し方の芯は、雷が当たったビルから近くのビルへ跳ねる連鎖。
// 数値は紅竜（config/locomotion.ts・attacks.ts）との比で決めた。変えた理由は各項目の注に書く。
import { LOCOMOTION as L } from '../locomotion';
import type { MeleeSpec } from '../attacks';
import { DRAGON_LOOK } from '../dragon';
import { SHOWCASE_COMMON } from './kurenai';
import type { CreatureConfig, LightningSpec, ThunderSpec } from './types';

/**
 * 雷の息（左クリック長押し）。炎と同じく溜めて照準へ向き直ってから、0.42秒ごとに雷を撃つ。
 * 1発：最初の建物に 55、そこから近いビルへ最大4回跳ね、跳ぶたびに 0.65 倍（55・36・23・15・10）。燃やさず窓を割る。
 * r06-balance：最初の建物 70→55（照準のビルへ毎秒およそ 167→131。炎は 115）。指摘「同じ台本で回ごとに 20.9〜34%」（体験の採点 r05）。
 * 揺れの元は、空から高層の集まった街区（ガラスの高層は48棟で街の体積の37.5%）を雷で崩し続けられた回か、街の外れへ流れた回かの差だった
 * （.captures/r06-balance の記録）。高層を崩す速さを抑えて上振れを削り、跳ねる連鎖の割合はそのままにした
 */
export const LIGHTNING_BREATH: LightningSpec = {
  windup: 0.12,
  range: 190,
  moveScale: 0.7,
  neckYawLimitDeg: 55,
  interval: 0.42,
  coreRadius: 3,
  damage: 55,
  falloff: 0.65,
  hops: 4,
  hopRadius: 60,
  hopDelay: 0.07,
  glass: 0.6,
  hitStop: { scale: 0.4, seconds: 0.03 },
  shake: 0.12,
};

/** 翼の打ち据え（右クリック）：爪より遠く広いが弱い（CHARACTERS.md「爪が弱い」）。紅竜の爪は 36m・58°・110 */
export const WING_SLAM: MeleeSpec = {
  windup: 0.26,
  active: 0.14,
  recovery: 0.46,
  range: 46,
  halfAngleDeg: 76,
  facing: 1,
  below: 12,
  above: 26,
  damage: 80,
  glass: 0.6,
  moveScale: 0.4,
  cancelAfter: 0.18,
  hitStop: { scale: 0.2, seconds: 0.06 },
  shake: 0.26,
};

/** 尾の鞭（Q）：細く長い尾で遠くまで速く払う。紅竜の尾は 52m・112°・90 */
export const TAIL_WHIP: MeleeSpec = {
  windup: 0.24,
  active: 0.2,
  recovery: 0.46,
  range: 60,
  halfAngleDeg: 96,
  facing: -1,
  below: 12,
  above: 12,
  damage: 72,
  glass: 0.45,
  moveScale: 0.3,
  cancelAfter: 0.22,
  hitStop: { scale: 0.24, seconds: 0.05 },
  shake: 0.24,
};

/**
 * 落雷の輪（E）：着地点（地上では体の周り）から 64m の輪に8本が0.05秒ずつ遅れて落ちる。1本は半径26m・260。
 * r06-balance：1本ごとに、輪の上の点から 40m 以内でいちばん高い立っている建物の真上に落ちる（雷は高い所に落ちる）。
 * 建物のまばらな所で使っても、まわりのビルに当たる（決まった点では、8本のうち何本かが空き地に落ちていた）
 */
export const THUNDER_RING: ThunderSpec = {
  ringRadius: 64,
  count: 8,
  delay: 0.05,
  strike: { radius: 26, damage: 260, glass: 1, glassRadius: 34, hitStop: { scale: 0.35, seconds: 0.03 }, shake: 0.3 },
  seekRadius: 40,
};

export const RAIYOKU: CreatureConfig = {
  id: 'raiyoku',
  name: '雷翼',
  recordKey: 'raiyoku',
  sound: 'raiyoku',
  card: {
    reading: 'らいよく',
    tagline: '空から雷。当たったビルから隣のビルへ跳ねる',
    // 札の棒：空の巡航 50 m/s（紅竜 36）で速さ 4・飛行 5、翼と雷は一撃が弱いので力 2
    bars: { speed: 4, power: 2, flight: 5 },
    labels: { primary: '雷の息', near: '翼の打ち据え', sweep: '尾の鞭', special: '雷の急降下（落雷の輪）', up: '飛ぶ（上昇が速い）', fast: '走る／急降下' },
  },
  view: {
    url: 'assets/raiyoku.glb',
    rig: 'raiyoku_rig',
    lods: ['raiyoku_lod0', 'raiyoku_lod1'],
    metaKey: 'creature',
    material: {
      key: 'raiyoku',
      // 鱗は紅竜より細かく平ら、艶は少し強い。膜は夕日の逆光で青く透け、喉と目は青白く光る（r02-roster の roster.ts から移した）
      look: {
        ...DRAGON_LOOK,
        roughness: 0.5,
        scaleBump: 0.08,
        plateLength: 0.95,
        plateBump: 0.05,
        plateBulge: 0.05,
        hornLine: 0.07,
        membraneTransmission: [0.3, 0.6, 1.0],
        membraneStrength: 0.62,
        throatColor: [0.55, 0.8, 1.0],
        throatStrength: 6,
        eyeGlow: 0.9,
      },
      // 翼の骨（前縁）と背骨に沿った細い発光の筋。芯は白に近い青、にじみは青
      emit: { kind: 'stripes', colorA: [0.5, 0.76, 1.0], colorB: [0.12, 0.36, 1.0], strength: 4.0, width: 0.1, pulseHz: 0.9, flow: 0.32 },
    },
    // 翼を広げて95m（紅竜80m）
    boundsRadius: 60,
    lodDistance: 170,
    aimShare: [0.08, 0.12, 0.16, 0.2, 0.2, 0.24],
    // r06-motion: 指摘「畳んだ翼は歩くあいだ1枚の板のまま体と一緒に動き、着地で一瞬暗い殻になる」
    // 翼の指3本の遅れを前縁から 0.1・0.14・0.18 秒（畳む・広げる瞬間は指ごとに 0.04 秒ずつずれる。ずらしすぎると着地の暗い殻が長引く）、
    // しなりの周波数を 1.5・1.2・0.95 Hz、踏み込みの揺れを 5・9・13 と変え、歩く間は指ごとに別の時刻で揺らす。翼の手首で地面を突いて歩くので、前足の一歩ごとに指が跳ねる。細く長い尾は鞭のように速く振れる
    secondary: {
      neck: { lag: 0.12, followZeta: 0.7, swingHz: 1.2, swingZeta: 0.35, inertia: 5, brake: 22, turn: 20, step: { pitch: 2, yaw: 1 }, maxDeg: 24, attackDamp: 0.8, airLag: 1 },
      tail: { lag: 0.18, followZeta: 0.7, swingHz: 1.1, swingZeta: 0.24, inertia: 5, brake: 18, turn: 25, step: { pitch: 7, yaw: 10 }, maxDeg: 55, attackDamp: 0.8, airLag: 1 },
      wing: [
        { lag: 0.1, followZeta: 0.7, swingHz: 1.5, swingZeta: 0.35, inertia: 2.5, brake: 0, turn: 14, step: { pitch: 5, yaw: 2.5 }, maxDeg: 34, attackDamp: 0.6, airLag: 0.45 },
        { lag: 0.14, followZeta: 0.7, swingHz: 1.2, swingZeta: 0.32, inertia: 2.5, brake: 0, turn: 14, step: { pitch: 9, yaw: 4.5 }, maxDeg: 34, attackDamp: 0.6, airLag: 0.45 },
        { lag: 0.18, followZeta: 0.7, swingHz: 0.95, swingZeta: 0.3, inertia: 2.5, brake: 0, turn: 14, step: { pitch: 13, yaw: 6.5 }, maxDeg: 34, attackDamp: 0.6, airLag: 0.45 },
      ],
    },
    // 走りが 14 m/s までなので、紅竜（11〜20）より早く走りへ混ぜる
    anim: { walkFrom: 0.4, walkFull: 2.5, runFrom: 8, runFull: 13, flapFrom: 0.3, flapFull: 0.72 },
    specialClip: 'roar',
    wingLegs: true,
    contactScale: 0.7,
    length: 52,
    airClips: ['fly', 'glide', 'dive'],
    showcase: { ...SHOWCASE_COMMON, takeoff: 0.7, fly: 0.06, glide: 0.75, dive: 0.3, claw: 0.42, roar: 0.62 },
    // 札の影絵：休みの姿勢の横顔（細い首と、畳んで脇腹に沿わせた翼の指）
    card: { clip: 'idle', t: SHOWCASE_COMMON.idle, turnDeg: 0 },
  },
  body: {
    bodyHeight: 12,
    radius: 8,
    // 地上の走りが 14 m/s までなので、体当たりの速さも走りに合わせる（紅竜 20）。これが無いと建物の隅に挟まって抜けられない
    smashSpeed: 12,
    mouthLocal: [0, 6, 18],
    feet: [
      { foot: 'HL', phase: 0, x: 3.4, z: -4 },
      { foot: 'FL', phase: 0.25, x: 8, z: 7 },
      { foot: 'HR', phase: 0.5, x: -3.4, z: -4 },
      { foot: 'FR', phase: 0.75, x: -8, z: 7 },
    ],
  },
  motion: {
    canFly: true,
    // 地上は遅い：歩き 9→6.5、走り 22→14 m/s（歩幅は GLB の 11m・17m）。旋回は紅竜と同じ速さで、180度を1.0秒以内に保つ
    ground: { ...L.ground, walkSpeed: 6.5, runSpeed: 14, accel: 10, runAccel: 16, turnFastDeg: 190, strideWalk: 11, strideRun: 17 },
    // 空は速い：巡航 36→50 m/s、上昇 18→25 m/s（上昇が速い）、旋回 125→150 度/秒（速い分だけ回りも速くし、180度を1.8秒以内に保つ）
    air: {
      ...L.air,
      cruiseSpeed: 50,
      hoverSpeed: 6,
      accel: 20,
      decel: 18,
      turnDeg: 150,
      sharpTurnScale: 0.5,
      sharpTurnBrake: 34,
      takeoffSpeed: 22,
      climbSpeed: 25,
      climbAccel: 44,
      flapKick: 10,
      descendSpeed: 18,
      descendAccel: 34,
      glideSink: -4,
      glideAccel: 22,
      ceiling: 380,
      flapHzCruise: 0.45,
      flapHzClimb: 1.05,
      bankMaxDeg: 38,
    },
    // 急降下も速い：落下 58→70、怒りの急降下 82→92、前へ 40→52 m/s
    dive: { ...L.dive, fallSpeed: 70, rageFallSpeed: 92, fallAccel: 60, forwardSpeed: 52, turnDeg: 90, exitSeconds: 0.4 },
    landing: L.landing,
    jump: null,
    charge: null,
  },
  moves: {
    primary: { kind: 'lightning', spec: LIGHTNING_BREATH },
    near: WING_SLAM,
    sweep: TAIL_WHIP,
    special: { ground: { kind: 'thunderRoar', windup: 0.5, recovery: 0.85, thunder: THUNDER_RING }, air: { kind: 'thunderDive', thunder: THUNDER_RING } },
    slam: null,
    domino: null,
  },
  // r06-balance：雷を 70→55 にした分、跳ねて進む段階が減って怒りが遅れるので 1.1倍（人に近い遊び方で初めての満タンの中央値 約30秒）
  rage: { gainScale: 1.1 },
  // r05-camera：指摘（r03 見た目）「低く飛ぶとカメラがビルの陰に入り、画面の下半分が網点になる」。翼が95m あるので遠め
  // （地上 74→86・空中 96→116・急降下 84→102m）にし、飛んでいる間は間のビルを越えるまでカメラを上げる（26m まで。超える分は網点）
  camera: { shoulder: 8, distanceGround: 86, distanceAir: 116, distanceDive: 102, sightHeight: 5, buildingLift: 26, wingSpan: 95, bodyLength: 52 },
};
