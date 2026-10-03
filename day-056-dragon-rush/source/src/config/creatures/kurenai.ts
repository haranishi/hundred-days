// OWNER: config
// 紅竜（くれないりゅう）：四脚＋翼の西洋竜。飛ぶ・歩くの両方ができる基準の1体。壊し方の芯は燃え広がり（docs/CHARACTERS.md）。
// 数値はこの周より前の表（config/locomotion.ts・attacks.ts・dragon.ts）をそのまま指す。紅竜の動きと見た目は変えない（r06-motion の二次運動は3体共通の規則で、値は dragon.ts の DRAGON_SECONDARY）。
import { BODY_CONTACT, BREATH, CLAW, ROAR, TAIL } from '../attacks';
import { DRAGON_ASSET, DRAGON_LOOK, DRAGON_MOTION, DRAGON_SECONDARY } from '../dragon';
import { LOCOMOTION } from '../locomotion';
import type { CreatureConfig } from './types';

/** 標本で見せる時刻は3体で共通の技の区切り（クリップの marks）の中ほど */
export const SHOWCASE_COMMON = { idle: 1.0, walk: 0.45, run: 0.3, breath: 0.9, claw: 0.4, tail: 0.46, roar: 0.58, land: 0.18 };

export const KURENAI: CreatureConfig = {
  id: 'kurenai',
  name: '紅竜',
  recordKey: 'kurenairyu',
  sound: 'dragon',
  card: {
    reading: 'くれないりゅう',
    tagline: '炎で焼き、燃え広がりで街区ごと落とす',
    // 札の棒：地上の走り 22 m/s・空の巡航 36 m/s・爪 110（どれも3体の中ほど）を 3 とする
    bars: { speed: 3, power: 3, flight: 3 },
    labels: { primary: '炎', near: '爪', sweep: '尾', special: '咆哮／急降下', up: '飛ぶ', fast: '走る／急降下' },
  },
  view: {
    url: DRAGON_ASSET.url,
    rig: 'dragon_rig',
    lods: ['dragon_lod0', 'dragon_lod1'],
    metaKey: 'dragon',
    material: { key: 'dragon', look: DRAGON_LOOK },
    boundsRadius: DRAGON_ASSET.boundsRadius,
    lodDistance: DRAGON_ASSET.lodDistance,
    aimShare: DRAGON_MOTION.aim.share,
    secondary: DRAGON_SECONDARY,
    anim: {
      walkFrom: DRAGON_MOTION.walkFrom,
      walkFull: DRAGON_MOTION.walkFull,
      runFrom: DRAGON_MOTION.runFrom,
      runFull: DRAGON_MOTION.runFull,
      flapFrom: DRAGON_MOTION.flapFrom,
      flapFull: DRAGON_MOTION.flapFull,
    },
    specialClip: 'roar',
    wingLegs: false,
    contactScale: 1,
    length: 60,
    airClips: ['fly', 'glide', 'dive'],
    showcase: { ...SHOWCASE_COMMON, takeoff: 0.7, fly: 0.06, glide: 0.75, dive: 0.3 },
    // 札の影絵は r03-roster のまま（休みの姿勢の横顔）
    card: { clip: 'idle', t: SHOWCASE_COMMON.idle, turnDeg: 0 },
  },
  body: {
    bodyHeight: LOCOMOTION.bodyHeight,
    radius: BODY_CONTACT.radius,
    smashSpeed: BODY_CONTACT.smashSpeed,
    mouthLocal: BREATH.mouthLocal,
    feet: [
      { foot: 'HL', phase: 0, x: 4.2, z: -6.5 },
      { foot: 'FL', phase: 0.25, x: 3.6, z: 6.5 },
      { foot: 'HR', phase: 0.5, x: -4.2, z: -6.5 },
      { foot: 'FR', phase: 0.75, x: -3.6, z: 6.5 },
    ],
  },
  motion: { canFly: true, ground: LOCOMOTION.ground, air: LOCOMOTION.air, dive: LOCOMOTION.dive, landing: LOCOMOTION.landing, jump: null, charge: null },
  moves: {
    primary: { kind: 'flame', spec: BREATH },
    near: CLAW,
    sweep: TAIL,
    special: { ground: { kind: 'roar', spec: ROAR }, air: { kind: 'rageDive' } },
    slam: null,
    domino: null,
  },
  // r06-balance：指摘「怒りの満タンが51.5秒（雷翼28.7・焔角30.3）」。炎の芯と爪は1回に1〜2棟しか段階を進めず、燃え広がりの分は半分しか
  // たまらないので、たまり方を 1.8倍にした（人に近い遊び方の3分で、初めての満タンの中央値 約30秒）。2.0 では27秒・2.2 では25秒
  rage: { gainScale: 1.8 },
};
