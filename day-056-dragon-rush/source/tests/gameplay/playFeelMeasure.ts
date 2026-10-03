// OWNER: tests
// 遊びの手応えの計測（r05-play）：近い的に主砲が出るまでの秒数（体験の採点 r04 の B1）と、空中で塔をかすめたときの1コマのずれ（B3）。
// 描画なしの遊びの本体に、人と同じ入力の経路（InputState → readControls）で操作を入れて測る。
// 直す前の版（写しの .captures に取り出した src）でも同じ手順で測れるよう、遊びの本体はモジュールを引数で受け取り、
// 型には頼らず共通の名前だけを使う（controlsMeasure.ts と同じ作り）。
import { approach, openSpot, type MeasureMods } from './controlsMeasure';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyGame = any;

const DT = 1 / 60;
const DEG = Math.PI / 180;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const footDist = (b: any, x: number, z: number): number => {
  const f = b.footprint;
  return Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1));
};

/** 怪獣を決めた遊びの本体（計測の道具は new Game(city, index) で作るので、怪獣を決めた型を渡す）。 */
export function creatureMods(m: MeasureMods, creature: string): MeasureMods {
  const Base = m.Game as any;
  class CreatureGame extends Base {
    constructor(c: any, i: any) {
      super(c, i, undefined, creature);
    }
  }
  return { ...m, Game: CreatureGame as any };
}

/** 遊びを始めた本体と入力（刻みは 1/60 秒）。 */
function start(m: MeasureMods): { game: AnyGame; input: any; step(n?: number): void } {
  const game = new m.Game(m.city, m.index);
  const input = new m.InputState();
  game.start();
  return {
    game,
    input,
    step(n = 1) {
      for (let i = 0; i < n; i++) game.step(DT, m.readControls(input));
    },
  };
}

function placeGround(g: AnyGame, x: number, z: number, yaw: number): void {
  const b = g.body;
  const ground = g.groundAt(x, z);
  b.groundY = ground;
  b.pos.x = x;
  b.pos.z = z;
  b.pos.y = ground + (b.bodyHeight ?? 9.5);
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.mode = 'ground';
  b.speed = 0;
  b.yaw = yaw;
  g.view.yaw = yaw;
}

/** 口の位置（体の中心と向き、怪獣ごとの口の局所座標から。gameplay/aim.ts の mouthOf と同じ式）。 */
function mouthOf(g: AnyGame): { x: number; y: number; z: number } {
  const [lx, ly, lz] = g.creature?.body?.mouthLocal ?? [0, 5, 25];
  const b = g.body;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return { x: b.pos.x + lx * c + lz * s, y: b.pos.y + ly, z: b.pos.z - lx * s + lz * c };
}

export interface CloseAimResult {
  setup: 'wall' | 'ground';
  /** 狙った照準の距離（m、口から照準の点まで。__state.aim.distance と同じ物差し） */
  want: number;
  /** 押す直前の照準の距離（m）と、照準の先の建物（地面なら -1） */
  distance: number;
  building: number;
  /** 押す直前の照準の明るさ（炎の届く所か） */
  reach: boolean;
  /** 照準の点が口より体の側にある（口から体の前へ測って後ろ）。直す前は、この場面で出なかった */
  behind: boolean;
  /** 左を押してから主砲が出るまで（秒。炎と雷は dragon.breath.start、礫は lava.launch）。出なければ null */
  fireSeconds: number | null;
  /** 押している間、照準が明るいのに主砲が出ていなかった秒数（溜めを含む） */
  silentSeconds: number;
  /** 照準の先の建物が、押している間に傷んだか（地面の照準では null） */
  aimedBuildingHit: boolean | null;
  /** 出た主砲が最初に当たった点と照準の点の距離（m。出なければ null） */
  landMeters: number | null;
}

/** 照準の距離が want にいちばん近くなる見下ろし（-60〜27度を 0.1度刻み）。accept が真の照準だけを候補にし、prefer が真のものを先に選ぶ。 */
function pitchFor(g: AnyGame, want: number, accept: () => boolean, prefer: () => boolean): number | null {
  let best: { pitch: number; err: number; pref: boolean } | null = null;
  for (let p = -60; p <= 27; p += 0.1) {
    g.view.pitch = p * DEG;
    g.updateAim();
    if (!accept()) continue;
    const err = Math.abs(g.aim.distance - want);
    if (err > 0.6) continue;
    const pref = prefer();
    if (!best || (pref && !best.pref) || (pref === best.pref && err < best.err)) best = { pitch: p * DEG, err, pref };
  }
  if (!best) return null;
  g.view.pitch = best.pitch;
  g.updateAim();
  return best.pitch;
}

const isBehind = (g: AnyGame): boolean => {
  const mo = mouthOf(g);
  const f = { x: Math.sin(g.body.yaw), z: Math.cos(g.body.yaw) };
  return (g.aimPoint.x - mo.x) * f.x + (g.aimPoint.z - mo.z) * f.z < 0;
};

/**
 * 左を押し続け、主砲が出るまでの秒数と、照準が明るいのに出ていない秒数を測る。land は、出た主砲が最初に当たった点と照準の点の距離（m）：
 * 炎は芯が当たった点（combat.breathTarget）、雷は口から落ちた1本目（lightning.hop の hop 0 の行き先）、礫は狙った点（投げた先）。
 */
function holdPrimary(r: ReturnType<typeof start>, m: MeasureMods, seconds: number): { fire: number | null; silent: number; land: number | null } {
  const g = r.game;
  const kind = g.creature?.moves?.primary?.kind ?? 'flame';
  const ev = kind === 'lava' ? 'lava.launch' : 'dragon.breath.start';
  const before = g.bus.count(ev);
  m.pressInput(r.input, 'left');
  let fire: number | null = null;
  let silent = 0;
  let land: number | null = null;
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    r.step();
    if (fire === null && g.bus.count(ev) > before) fire = i * DT;
    if (fire === null && g.aim.reach) silent += DT;
    if (fire !== null && land === null) {
      const a = g.aimPoint;
      if (kind === 'flame') land = Math.hypot(g.combat.breathTarget.x - a.x, g.combat.breathTarget.y - a.y, g.combat.breathTarget.z - a.z);
      else if (kind === 'lightning') {
        const e = [...g.bus.recent].reverse().find((x: any) => x.type === 'lightning.hop' && x.hop === 0);
        if (e) land = Math.hypot(e.to[0] - a.x, e.to[1] - a.y, e.to[2] - a.z);
      } else land = 0;
    }
  }
  m.releaseInput(r.input, 'left');
  return { fire, silent, land };
}

/**
 * 高さ minHeight 以上・正面の幅 24m 以上の建物（id の小さい順）の正面に、体の中心から壁まで standoff m で立ち、照準を壁の上の、
 * 口から want m の所へ合わせる（照準の光線は体の右 7m の肩越しを通るので、幅の狭い面は外す）。preferBehind なら、照準の点が口より
 * 体の側になる見下ろしを先に選ぶ。合わせた建物を返す（無ければ null）。
 */
function standAtWall(r: ReturnType<typeof start>, m: MeasureMods, standoff: number, minHeight: number, want: number, preferBehind: boolean): any {
  const g = r.game;
  const cands = [...m.city.buildings].filter((b: any) => b.height >= minHeight).sort((p: any, q: any) => p.id - q.id);
  for (const b of cands) {
    const f = b.footprint;
    const at = approach(m, b, standoff, 12, 14);
    if (!at) continue;
    const facesX = Math.abs(Math.sin(at.yaw)) > 0.5;
    const width = facesX ? f.z1 - f.z0 : f.x1 - f.x0;
    if (width < 24) continue;
    placeGround(g, at.x, at.z, at.yaw);
    r.step(2);
    const pitch = pitchFor(
      g,
      want,
      () => g.aim.building === b.id,
      () => isBehind(g) === preferBehind,
    );
    if (pitch !== null) return b;
  }
  return null;
}

/**
 * 近い的（B1）：立っている竜の照準を、口から want m の所へ合わせて左を押す。
 * wall は高さ45m以上の建物の正面に、体の中心から壁まで（体の半径＋3m）で立ち、壁を狙う（急降下でビルの前に着地した場面。口はビルの中に入る）。
 * ground は開けた地面で見下ろして地面を狙う（照準の点が口の後ろになる見下ろしがあれば、そちらを選ぶ）。
 * 合う場面が無ければ null。
 */
export function closeAim(m: MeasureMods, setup: 'wall' | 'ground', want: number): CloseAimResult | null {
  const r = start(m);
  const g = r.game;
  let target: any = null;
  if (setup === 'wall') {
    target = standAtWall(r, m, (g.body.shape?.radius ?? 9) + 3, 45, want, true);
    if (!target) return null;
  } else {
    const s = openSpot(m, 90);
    placeGround(g, s.x, s.z, 90 * DEG);
    r.step(2);
    const pitch = pitchFor(
      g,
      want,
      () => g.aim.building === -1 && g.aimPoint.y <= g.body.groundY + 0.5,
      () => isBehind(g),
    );
    if (pitch === null) return null;
  }
  const distance = g.aim.distance;
  const building = g.aim.building;
  const reach = g.aim.reach;
  const behind = isBehind(g);
  const dmg0 = target ? g.damage.damage[target.id] : 0;
  const h = holdPrimary(r, m, 1.5);
  return {
    setup,
    want,
    distance: r2(distance),
    building,
    reach,
    behind,
    fireSeconds: h.fire === null ? null : r2(h.fire),
    silentSeconds: r2(h.silent),
    aimedBuildingHit: target ? g.damage.damage[target.id] > dmg0 : null,
    landMeters: h.land === null ? null : r2(h.land),
  };
}

/** 焔角の礫（今の振る舞いを保つ）：口より先の壁（口から want m、口の前）を狙って左を押す。 */
export function lavaInFront(m: MeasureMods, want: number): CloseAimResult | null {
  const r = start(m);
  const g = r.game;
  const mouthZ = g.creature?.body?.mouthLocal?.[2] ?? 21;
  // r06-camera2：焔角のカメラは肩越し30m で、照準の線は怪獣の右30m の回転の中心を通るため、口から約17m より近くには照準を置けない。
  // ここで確かめたいのは「礫が近い的にも0.3秒以内に出る」攻撃の規則なので、測る間だけ r05 の肩越し（8m）に戻して狙う
  g.cameraProfile = { ...g.cameraProfile, shoulder: 8, shoulderMin: 8 };
  const target = standAtWall(r, m, mouthZ + 8, 30, want, false);
  if (!target) return null;
  const distance = g.aim.distance;
  const behind = isBehind(g);
  const reach = g.aim.reach;
  const dmg0 = g.damage.damage[target.id];
  const h = holdPrimary(r, m, 1.5);
  return {
    setup: 'wall',
    want,
    distance: r2(distance),
    building: target.id,
    reach,
    behind,
    fireSeconds: h.fire === null ? null : r2(h.fire),
    silentSeconds: r2(h.silent),
    aimedBuildingHit: g.damage.damage[target.id] > dmg0,
    landMeters: h.land === null ? null : r2(h.land),
  };
}

export interface BrightSample {
  where: string;
  pitchDeg: number;
  yawOffDeg: number;
  distance: number;
  building: number;
  fireSeconds: number | null;
  /** 出た主砲が最初に当たった点と照準の点の距離（m） */
  landMeters: number | null;
}

/**
 * 明るい照準のまま無反応にしない：開けた地面と、高さ30m以上の建物（id の小さい順に4棟）の正面（体の中心から壁まで 半径＋1・半径＋8・30m）に立ち、
 * 視点の向きを体から -40・0・+40 度、見下ろしを -60〜+27 度（3度刻み）に振って、照準が明るい所ごとに最初から左を押す。
 * 0.35秒以内に主砲が出なかった所を silent に返す。
 */
export function brightButSilent(m: MeasureMods): { samples: number; bright: number; silent: BrightSample[]; fired: BrightSample[] } {
  const r = start(m);
  const g = r.game;
  const radius = g.body.shape?.radius ?? 9;
  const spots: { where: string; x: number; z: number; yaw: number }[] = [];
  const open = openSpot(m, 90);
  spots.push({ where: 'open', x: open.x, z: open.z, yaw: 90 * DEG });
  let walls = 0;
  for (const b of [...m.city.buildings].filter((c: any) => c.height >= 30).sort((p: any, q: any) => p.id - q.id)) {
    if (walls >= 4) break;
    const at = [radius + 1, radius + 8, 30].map((s) => approach(m, b, s, 12, 14));
    if (at.some((a) => a === null)) continue;
    at.forEach((a, k) => spots.push({ where: `b${b.id}@${['near', 'mid', 'far'][k]}`, x: a!.x, z: a!.z, yaw: a!.yaw }));
    walls++;
  }
  let samples = 0;
  let bright = 0;
  const silent: BrightSample[] = [];
  const fired: BrightSample[] = [];
  for (const s of spots) {
    for (const off of [-40, 0, 40]) {
      for (let p = -60; p <= 27; p += 3) {
        samples++;
        g.restart();
        placeGround(g, s.x, s.z, s.yaw);
        g.view.yaw = s.yaw + off * DEG;
        g.view.pitch = p * DEG;
        g.updateAim();
        if (!g.aim.reach) continue;
        bright++;
        const distance = g.aim.distance;
        const building = g.aim.building;
        const h = holdPrimary(r, m, 0.5);
        const sample = { where: s.where, pitchDeg: p, yawOffDeg: off, distance: r2(distance), building, fireSeconds: h.fire === null ? null : r2(h.fire), landMeters: h.land === null ? null : r2(h.land) };
        if (h.fire === null || h.fire > 0.35) silent.push(sample);
        else fired.push(sample);
      }
    }
  }
  return { samples, bright, silent, fired };
}

export interface GrazeResult {
  /** 場面の名前と、かすめた建物 */
  scenario: string;
  building: number;
  /** 体が建物の外形に半径の内側まで入ったか（かすめたか） */
  touched: boolean;
  /** 1コマ（1/60秒）の水平の動きの最大（m。36m/s なら 0.6m）と、そのうち進む向きに直交する横の成分の最大 */
  maxStep: number;
  maxSide: number;
  /** 水平の速さが 3m/s を下回り続けた最長の秒数（張り付き） */
  stuckSeconds: number;
  /** かすめる直前の速さに対する、かすめてから0.3秒後の速さの割合 */
  speedKeep: number;
  /** 終わりに体が建物の外形に重なっている量（m、半径 − 外形までの距離。0 なら重なっていない） */
  overlapEnd: number;
}

/**
 * 空中で塔をかすめる（B3）：体の中心が建物の外形から gap m 外（半径の内側）にあり、足が屋上の 1m 上にある所から、
 * 滑空の沈み（毎秒 glideSink m）のまま外形の辺に沿って W で飛ぶ。足が屋上より下がった瞬間に、重なりを押し出す。
 * start を渡すと、その状態（体験の採点 r04 の記録から写した位置・高さ・向き・速さ）から飛ぶ。
 */
export function airGraze(m: MeasureMods, scenario: string, start0?: { x: number; z: number; altitude: number; yawDeg: number; speed: number; building: number }): GrazeResult | null {
  const r = start(m);
  const g = r.game;
  const body = g.body;
  const A = body.motion?.air ?? { cruiseSpeed: 36, glideSink: -5 };
  let b: any;
  let x: number;
  let z: number;
  let yaw: number;
  let feet: number;
  let speed: number;
  if (start0) {
    b = m.city.buildings[start0.building];
    x = start0.x;
    z = start0.z;
    yaw = start0.yawDeg * DEG;
    feet = start0.altitude;
    speed = start0.speed;
  } else {
    // 高さ 40〜90m・x の向きの辺が 30m 以上の建物の、z の小さい側の辺に沿って +x へ。1.5秒で飛ぶ先まで、沈んだ足より高い建物が無いもの
    const radius = body.shape?.radius ?? 9;
    const gap = radius - 6;
    const travel = A.cruiseSpeed * 1.5 + radius + 2;
    const cands = [...m.city.buildings].filter((c: any) => c.height >= 40 && c.height <= 90 && c.footprint.x1 - c.footprint.x0 >= 30).sort((p: any, q: any) => p.id - q.id);
    b = null;
    for (const c of cands) {
      const f = c.footprint;
      const pz = f.z0 - gap;
      const blocked = (px: number): boolean => m.index.buildingsNear(px, pz, radius + 2).some((o: any) => o.id !== c.id && o.height > c.height - 6);
      let clear = true;
      for (let px = f.x0 - 10; px <= f.x0 + 6 + travel && clear; px += 4) if (blocked(px) || m.index.surfaceAt(px, pz) === 'outside') clear = false;
      if (!clear) continue;
      b = c;
      x = f.x0 + 6;
      z = pz;
      break;
    }
    if (!b) return null;
    yaw = 90 * DEG;
    feet = b.height + 1 - g.groundAt(x!, z!);
    speed = A.cruiseSpeed;
  }
  const ground = g.groundAt(x!, z!);
  body.groundY = ground;
  body.pos.x = x!;
  body.pos.z = z!;
  body.pos.y = ground + (body.bodyHeight ?? 9.5) + feet!;
  body.mode = 'air';
  body.speed = speed!;
  body.yaw = yaw!;
  body.vel.x = Math.sin(yaw!) * speed!;
  body.vel.z = Math.cos(yaw!) * speed!;
  body.vel.y = A.glideSink ?? -5;
  g.view.yaw = yaw!;
  g.view.pitch = -10 * DEG;
  m.pressInput(r.input, 'w');
  const R = body.shape?.radius ?? 9;
  let touched = -1;
  let speedBefore = speed!;
  let speedAfter = -1;
  let maxStep = 0;
  let maxSide = 0;
  let slow = 0;
  let stuck = 0;
  let px = body.pos.x;
  let pz = body.pos.z;
  for (let i = 1; i <= Math.round(1.5 / DT); i++) {
    const heading = body.yaw;
    const sp = body.speed;
    r.step();
    const dx = body.pos.x - px;
    const dz = body.pos.z - pz;
    px = body.pos.x;
    pz = body.pos.z;
    const step = Math.hypot(dx, dz);
    const side = Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading));
    maxStep = Math.max(maxStep, step);
    maxSide = Math.max(maxSide, side);
    slow = step / DT < 3 ? slow + DT : 0;
    stuck = Math.max(stuck, slow);
    const feetY = body.pos.y - (body.bodyHeight ?? 9.5);
    if (touched < 0 && b.height > feetY + 0.5 && footDist(b, body.pos.x, body.pos.z) <= R + 0.6) {
      touched = i * DT;
      speedBefore = sp;
    }
    if (touched >= 0 && speedAfter < 0 && i * DT >= touched + 0.3) speedAfter = body.speed;
  }
  const feetEnd = body.pos.y - (body.bodyHeight ?? 9.5);
  const overlapEnd = b.height > feetEnd + 0.5 ? Math.max(0, R - footDist(b, body.pos.x, body.pos.z)) : 0;
  return {
    scenario,
    building: b.id,
    touched: touched >= 0,
    maxStep: r2(maxStep),
    maxSide: r2(maxSide),
    stuckSeconds: r2(stuck),
    speedKeep: r2(speedAfter > 0 ? speedAfter / Math.max(1e-6, speedBefore) : 0),
    overlapEnd: r2(overlapEnd),
  };
}

/** 体験の採点 r04 の B3 の記録（evb_flight_kurenai_rec.json）の 30.30 秒の状態：高さ45.6m・36m/s で、建物 259（高さ44.2m）の北西の角へ向かう。 */
export const B3_RECORD = { x: -153.42, z: 205.61, altitude: 45.64, yawDeg: 153.9, speed: 36, building: 259 };
