// OWNER: audio-tools
// 効果音の一覧：名前（public/assets/audio/sfx/ の下の道のり）・変化の数・作り方・仕上げの音量（瞬時の最大 LUFS）。
// 怪獣ごとの音（咆哮・足音・着地・羽ばたき・主砲の息・技）は monsters.mjs の全員分を作る。実行時の鳴らし方は src/config/audio.ts にある。
import { MONSTERS } from './monsters.mjs';
import { flap, hit, land, step, swing, diveWind } from './sfx/body.mjs';
import { collapse, crack, glass, peel, tilt } from './sfx/building.mjs';
import { breathLoop, breathStart, breathStop, fireBed, ignite, wind } from './sfx/fire.mjs';
import { hammerHit, hammerSwing, hornHit, hornSwing, whipHit, whipSwing, wingHit, wingSwing } from './sfx/melee.mjs';
import { arc, chargeLoop, fissure, lavaHit, shove, spit, zapLoop, zapStart, zapStop } from './sfx/moves.mjs';
import { click, combo, pause, rage, result, resultGong, start } from './sfx/ui.mjs';
import { roar } from './sfx/voice.mjs';

/**
 * make(rng, ctx, variant) は { audio: { l, r }, loop?, layers } を返す。ctx は { ir: { near, mid, far } }。
 * target は仕上げの瞬時の最大（LUFS）。重い音ほど大きく、細かい音ほど小さくしておき、実行時の混ぜ方で最終の大きさを決める。
 * r02-audio：足音を前足（stepFront）と後ろ足（stepHind）の別の作りに分けた（旧 step）。変化の番号で地面の素材が変わる。
 * 足音の目標は -13→-15（前足）・-14.5（後ろ足）：踏む瞬間の山が大きい短い音は -13 まで上げると制限器で沈み、変化ごとの差が 5dB 開いた。
 */
function monsterBanks(id) {
  const M = MONSTERS[id];
  const out = [
    { name: `${id}/roar`, variants: 4, target: -9, make: (r, c) => roar(r, M, c) },
    // r06-audio：短い声の型を持つ怪獣（焔角）は6変化（うなり・鼻息・短い吠え）。ほかの怪獣は3変化の短い吠えのまま
    { name: `${id}/roarShort`, variants: M.voice.shortVariants ?? 3, target: -10, make: (r, c, v) => roar(r, M, c, { short: true, variant: v }) },
    // r05-audio：焔角は足音が3分の主役（250 歩前後）なので、前後とも変化を 5→8 個に
    { name: `${id}/stepFront`, variants: M.feet.variants ?? 5, target: -15, maxGrDb: 4, make: (r, c, v) => step(r, M.feet.front, v) },
    { name: `${id}/stepHind`, variants: M.feet.variants ?? 5, target: -14.5, maxGrDb: 4, make: (r, c, v) => step(r, M.feet.hind, v) },
    { name: `${id}/land`, variants: 4, target: -11, make: (r, c, v) => land(r, M, c, { variant: v }) },
    { name: `${id}/landHeavy`, variants: 3, target: -9, make: (r, c, v) => land(r, M, c, { heavy: true, variant: v }) },
  ];
  if (M.wings) out.push({ name: `${id}/flap`, variants: 4, target: -15, make: (r, c, v) => flap(r, M, v) });
  out.push(...meleeBanks(id, M.melee));
  const kind = M.breath.kind;
  if (kind === 'fire') {
    out.push(
      { name: `${id}/breathStart`, variants: 3, target: -12, make: (r) => breathStart(r, M) },
      { name: `${id}/breathLoop`, variants: 2, target: -15, loop: true, make: (r) => breathLoop(r, M) },
      { name: `${id}/breathStop`, variants: 3, target: -15, make: (r) => breathStop(r, M) },
    );
  } else if (kind === 'lightning') {
    out.push(
      { name: `${id}/breathStart`, variants: 3, target: -12, maxGrDb: 4, make: (r) => zapStart(r) },
      { name: `${id}/breathLoop`, variants: 2, target: -15, loop: true, make: (r) => zapLoop(r) },
      { name: `${id}/breathStop`, variants: 3, target: -15, make: (r) => zapStop(r) },
      // r05-audio：跳ねる雷・溶岩の着弾は 3分で数十〜百回鳴るので、変化を 4→8 個に（型と尾の長さ・残響の量を散らす）
      { name: `${id}/arc`, variants: 8, target: -12, maxGrDb: 4, make: (r, c, v) => arc(r, c, v) },
    );
  } else if (kind === 'lava') {
    out.push(
      { name: `${id}/breathStart`, variants: 4, target: -12, make: (r, c, v) => spit(r, v) },
      { name: `${id}/breathHit`, variants: 8, target: -11, make: (r, c, v) => lavaHit(r, c, v) },
      { name: `${id}/chargeLoop`, variants: 1, target: -16, loop: true, make: (r) => chargeLoop(r) },
      { name: `${id}/shove`, variants: 4, target: -10, maxGrDb: 3.5, make: (r, c) => shove(r, c) },
      { name: `${id}/fissure`, variants: 3, target: -10, maxGrDb: 3.5, make: (r, c) => fissure(r, c) },
    );
  }
  return out;
}

/**
 * r05-audio：近い技の音を怪獣ごとにした（r04 までは attack/ の共用を3体で鳴らしていた）。
 * 紅竜は r04 までの音をそのまま残すため、乱数の系列を前の名前（seedName）から取る（同じ種なら同じ音）。
 * 目標の大きさ：翼は軽く（当たり -13）、角と鎚は重く（-11・-10.5）。鞭の当たりは鋭い破裂なので制限器で下げてよい幅を広げる。
 */
function meleeBanks(id, melee) {
  const { claw, tail } = melee;
  const byKind = {
    claw: { swing: (r, v) => swing(r, { variant: v }), hit: (r) => hit(r), swingTarget: -16, hitTarget: -12 },
    tail: { swing: (r, v) => swing(r, { heavy: true, variant: v }), hit: (r) => hit(r, { heavy: true }), swingTarget: -15, hitTarget: -11 },
    wing: { swing: (r, v, pk) => wingSwing(r, { peak: pk, variant: v }), hit: (r) => wingHit(r), swingTarget: -15.5, hitTarget: -13 },
    whip: { swing: (r, v, pk) => whipSwing(r, { peak: pk, variant: v }), hit: (r, v) => whipHit(r, v), swingTarget: -16.5, hitTarget: -12, hitGr: 6 },
    horn: { swing: (r, v, pk) => hornSwing(r, { peak: pk, variant: v }), hit: (r) => hornHit(r), swingTarget: -15.5, hitTarget: -11, hitGr: 4 },
    hammer: { swing: (r, v, pk) => hammerSwing(r, { peak: pk, variant: v }), hit: (r) => hammerHit(r), swingTarget: -15, hitTarget: -10.5, hitGr: 4 },
  };
  const old = id === 'dragon';
  const C = byKind[claw.kind];
  const T = byKind[tail.kind];
  return [
    { name: `${id}/clawSwing`, seedName: old ? 'attack/clawSwing' : undefined, variants: 4, target: C.swingTarget, make: (r, c, v) => C.swing(r, v, claw.peak) },
    { name: `${id}/clawHit`, seedName: old ? 'attack/clawHit' : undefined, variants: 4, target: C.hitTarget, ...(C.hitGr ? { maxGrDb: C.hitGr } : {}), make: (r, c, v) => C.hit(r, v) },
    { name: `${id}/tailSwing`, seedName: old ? 'attack/tailSwing' : undefined, variants: 4, target: T.swingTarget, make: (r, c, v) => T.swing(r, v, tail.peak) },
    { name: `${id}/tailHit`, seedName: old ? 'attack/tailHit' : undefined, variants: 4, target: T.hitTarget, ...(T.hitGr ? { maxGrDb: T.hitGr } : {}), make: (r, c, v) => T.hit(r, v) },
  ];
}

export const BANKS = [
  ...Object.keys(MONSTERS).flatMap(monsterBanks),
  { name: 'attack/diveWind', variants: 3, target: -16, make: (r) => diveWind(r) },
  // maxGrDb：仕上げの制限器で下げてよい幅（dB、既定 2.5）。頭を丸めた破裂は、深く下げても手応えが消えにくい
  // r02-audio：指摘「ひびの素材が -20〜-24 LUFS で目標の -15 に届かない」 ひび 2.5→7dB（頭は作る側で丸めた）、剥がれ 2.5→5dB・近い崩落 2.5→4.5dB
  // r05-audio：ひびとガラスは 3分で百回前後鳴るので、変化を 5→8 個に（走り方・割れ方の型を4つ、それぞれ2個）
  { name: 'building/crack', variants: 8, target: -15, maxGrDb: 7, make: (r, c, v) => crack(r, v) },
  { name: 'building/peel', variants: 4, target: -14, maxGrDb: 5, make: (r) => peel(r) },
  { name: 'building/tilt', variants: 4, target: -14, make: (r, c) => tilt(r, c) },
  // r06-audio：近い崩落は崩れ方の型を4つにして 5→8 変化（3分で 72〜132 回鳴る）
  { name: 'building/collapseNear', variants: 8, target: -9, maxGrDb: 4.5, make: (r, c, v) => collapse(r, c, { variant: v }) },
  { name: 'building/collapseFar', variants: 4, target: -13, make: (r, c) => collapse(r, c, { far: true }) },
  { name: 'building/glass', variants: 8, target: -15, make: (r, c, v) => glass(r, c, v) },
  { name: 'fire/ignite', variants: 4, target: -14, make: (r, c, v) => ignite(r, { variant: v }) },
  { name: 'fire/spread', variants: 4, target: -16, make: (r, c, v) => ignite(r, { spread: true, variant: v }) },
  { name: 'fire/bedNear', variants: 1, target: -20, loop: true, make: (r) => fireBed(r) },
  { name: 'fire/bedFar', variants: 1, target: -20, loop: true, make: (r) => fireBed(r, { far: true, seconds: 10 }) },
  { name: 'air/wind', variants: 1, target: -20, loop: true, make: (r) => wind(r) },
  { name: 'ui/click', variants: 3, target: -20, make: (r, c, v) => click(r, c, v) },
  { name: 'ui/start', variants: 1, target: -14, make: (r, c) => start(r, c) },
  { name: 'ui/pause', variants: 1, target: -19, make: (r, c) => pause(r, c, 0) },
  { name: 'ui/resume', variants: 1, target: -19, make: (r, c) => pause(r, c, 1) },
  { name: 'ui/result', variants: 1, target: -12, make: (r, c) => result(r, c) },
  // r06-audio：曲の最後の大太鼓に重ねる銅鑼だけの結果の音（曲の大太鼓が重さを持つので、銅鑼は少し控える）
  { name: 'ui/resultGong', variants: 1, target: -12.5, make: (r, c) => resultGong(r, c) },
  { name: 'ui/rage', variants: 1, target: -14, make: (r, c) => rage(r, c) },
  { name: 'ui/combo', variants: 3, target: -18, make: (r, c, v) => combo(r, c, v) },
];

export const IR_NAMES = ['near', 'mid', 'far'];
