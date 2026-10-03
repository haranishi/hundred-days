// OWNER: tests
// 操作性の計測（r02-controls）：描画なしの遊びの本体に、人と同じ入力の経路（InputState → readControls）で操作を入れ、
// 刻みごとに体の向き・位置・速さを記録して、体験の採点（runs/r01-eval-play.md の3節）と同じ物差しで秒数と速さを出す。
// 前の版（計測の前に控えた src の写し）でも同じ手順で測れるよう、遊びの本体の型には頼らず、共通の名前だけを使う。

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyGame = any;

export interface MeasureMods {
  Game: new (city: any, index: any) => AnyGame;
  InputState: new () => any;
  readControls: (input: any) => any;
  pressInput: (sink: any, name: string | number) => void;
  releaseInput: (sink: any, name: string | number) => void;
  BasicPlaytest: new () => { update(dt: number, game: AnyGame, sink: any): void };
  FixedStepLoop: new (hooks: { update(dt: number, t: number): void; render(a: number, f: number): void }, o: { step: number; maxSubSteps: number }) => any;
  city: any;
  index: any;
  sensitivity: number;
  durationSeconds: number;
}

const DT = 1 / 60;
const DEG = Math.PI / 180;
const wrap = (a: number): number => {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
};
const r2 = (v: number): number => Math.round(v * 100) / 100;
const footDist = (b: any, x: number, z: number): number => {
  const f = b.footprint;
  return Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1));
};

interface Rig {
  game: AnyGame;
  input: any;
  t: number;
  step(n?: number): void;
  run(seconds: number, each?: (t: number) => void): void;
  press(name: string | number): void;
  release(name: string | number): void;
  look(dx: number, dy?: number): void;
}

export function rig(m: MeasureMods): Rig {
  const game = new m.Game(m.city, m.index);
  const input = new m.InputState();
  game.start();
  const r: Rig = {
    game,
    input,
    t: 0,
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        game.step(DT, m.readControls(input));
        r.t += DT;
      }
    },
    run(seconds, each) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        r.step();
        each?.(r.t);
      }
    },
    press: (name) => m.pressInput(input, name),
    release: (name) => m.releaseInput(input, name),
    look: (dx, dy = 0) => input.injectMotion(dx, dy),
  };
  return r;
}

/**
 * 高い建物（踏みつぶせない高さ）から clearance m 以上離れた点。街は建て込んでいて陸には90m空いた所が無いので、
 * 湾の浅瀬（歩ける）も含め、湾の中ほど（x=-600, z=0）に近い順に探す。
 */
export function openSpot(m: MeasureMods, clearance: number): { x: number; z: number } {
  const pts: { x: number; z: number; d: number }[] = [];
  for (let x = -700; x <= 700; x += 20) for (let z = -700; z <= 700; z += 20) pts.push({ x, z, d: Math.hypot(x + 600, z) });
  pts.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  for (const p of pts) {
    if (m.index.surfaceAt(p.x, p.z) === 'outside') continue;
    const near = m.index.buildingsNear(p.x, p.z, clearance);
    if (near.every((b: any) => b.height < 14 || footDist(b, p.x, p.z) > clearance)) return { x: p.x, z: p.z };
  }
  throw new Error('開けた場所が見つからない');
}

export function place(g: AnyGame, x: number, z: number, yaw: number, mode: 'ground' | 'air', altitude = 0, speed = 0): void {
  const b = g.body;
  const ground = g.groundAt(x, z);
  b.groundY = ground;
  b.pos.x = x;
  b.pos.z = z;
  // r03-roster：体の中心の高さは怪獣ごと（前の版の遊びの本体には bodyHeight が無いので、紅竜の 9.5m を使う）
  b.pos.y = ground + (b.bodyHeight ?? 9.5) + (mode === 'air' ? altitude : 0);
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.mode = mode;
  b.diveKind = null;
  b.speed = speed;
  b.yaw = yaw;
  g.view.yaw = yaw;
  g.view.pitch = -16 * DEG;
}

/**
 * 建物 b の4つの面のうち、面の正面 standoff m の所から面までの帯（幅 ±halfWidth）に、高さ blockHeight 以上の別の建物が無い面。
 * 見つかれば、立つ位置と面へ向かう向き（yaw）。id の小さい建物・北東南西の順に決まる。
 */
export function approach(m: MeasureMods, b: any, standoff: number, halfWidth: number, blockHeight: number): { x: number; z: number; yaw: number } | null {
  const f = b.footprint;
  const cx = (f.x0 + f.x1) / 2;
  const cz = (f.z0 + f.z1) / 2;
  const faces = [
    { nx: -1, nz: 0, x: f.x0, z: cz },
    { nx: 1, nz: 0, x: f.x1, z: cz },
    { nx: 0, nz: -1, x: cx, z: f.z0 },
    { nx: 0, nz: 1, x: cx, z: f.z1 },
  ];
  for (const face of faces) {
    let clear = true;
    for (let s = 2; s <= standoff + 10 && clear; s += 5) {
      const x = face.x + face.nx * s;
      const z = face.z + face.nz * s;
      if (m.index.surfaceAt(x, z) === 'outside') clear = false;
      for (const o of m.index.buildingsNear(x, z, halfWidth)) if (o.id !== b.id && o.height >= blockHeight) clear = false;
    }
    if (!clear) continue;
    return { x: face.x + face.nx * standoff, z: face.z + face.nz * standoff, yaw: Math.atan2(-face.nx, -face.nz) };
  }
  return null;
}

export interface Measurements {
  groundReverse: { walkSeconds: number; runSeconds: number; walkMinSpeed: number; walkRecoverSeconds: number };
  airReverse: { seconds: number; diameter: number; minSpeed: number };
  attackPivot: Record<'breath' | 'claw' | 'tail', { turnSeconds: number; fireSeconds: number; offAtFireDeg: number }>;
  running: { runTo90Seconds: number; runStopSeconds: number; runStopMeters: number; breathWalkSpeed: number };
  climb: { holdRate: number; tapGain48: number; tapMaxRate: number };
  diveExit: { shiftReleaseToGlideSeconds: number; spaceStopSeconds: number };
  descend: { cRate: number };
  landing: { diveStiffSeconds: number; glideStiffSeconds: number };
  stick: { airSeconds: number; groundSeconds: number; airSmashed: boolean; airBuilding: number; groundBuilding: number };
  clawChain: { pressAfterHit: number; pressDuringWindup: number; mash15: number };
  breathMidrise: { building: number; hp: number; stageAfter3s: number; fractionAfter3s: number };
  clock: { endedAt: number };
  loop: { lagAfterHitchMs: number };
}

/** 地上：歩き（と走り）で進みながら視点を180度振り、体の向きが新しい向きの5度以内に入るまで。 */
export function groundReverse(m: MeasureMods, run: boolean): { seconds: number; minSpeed: number; recover: number } {
  const s = openSpot(m, 90);
  const r = rig(m);
  place(r.game, s.x, s.z, 90 * DEG, 'ground');
  r.press('w');
  if (run) r.press('shift');
  r.run(2.5);
  const full = r.game.body.speed;
  r.look(Math.PI / m.sensitivity);
  const t0 = r.t;
  let turned = -1;
  let minSpeed = Infinity;
  let recover = -1;
  r.run(5, (t) => {
    const g = r.game;
    minSpeed = Math.min(minSpeed, g.body.speed);
    if (turned < 0 && Math.abs(wrap(g.body.yaw - g.view.yaw)) < 5 * DEG) turned = t - t0;
    if (turned >= 0 && recover < 0 && g.body.speed >= full * 0.9) recover = t - t0;
  });
  return { seconds: turned < 0 ? 99 : turned, minSpeed, recover: recover < 0 ? 99 : recover };
}

/** 空中：巡航しながら視点を180度振る。向き直るまでの秒数と、元の進路からの横のずれ（Uターンの直径）。 */
export function airReverse(m: MeasureMods): { seconds: number; diameter: number; minSpeed: number } {
  const s = openSpot(m, 40);
  const r = rig(m);
  place(r.game, s.x, s.z, 90 * DEG, 'air', 220, 36);
  r.press('w');
  r.press('space');
  r.run(1.0);
  r.release('space');
  const g = r.game;
  const x0 = g.body.pos.x;
  const z0 = g.body.pos.z;
  const f0 = { x: Math.sin(g.body.yaw), z: Math.cos(g.body.yaw) };
  r.look(Math.PI / m.sensitivity);
  const t0 = r.t;
  let turned = -1;
  let maxSide = 0;
  let minSpeed = Infinity;
  r.run(6, (t) => {
    if (turned >= 0) return;
    const side = Math.abs((g.body.pos.x - x0) * f0.z - (g.body.pos.z - z0) * f0.x);
    maxSide = Math.max(maxSide, side);
    minSpeed = Math.min(minSpeed, g.body.speed);
    if (Math.abs(wrap(g.body.yaw - g.view.yaw)) < 5 * DEG) turned = t - t0;
  });
  return { seconds: turned < 0 ? 99 : turned, diameter: maxSide, minSpeed };
}

/** 立ち止まって視点を右へ90度振り、すぐ技を出す。体が技の向き（尾は背）へ5度以内に向くまでと、技が出るまで。 */
export function attackPivot(m: MeasureMods, kind: 'breath' | 'claw' | 'tail'): { turnSeconds: number; fireSeconds: number; offAtFireDeg: number } {
  const s = openSpot(m, 70);
  const r = rig(m);
  place(r.game, s.x, s.z, 90 * DEG, 'ground');
  r.step(3);
  const g = r.game;
  r.look((90 * DEG) / m.sensitivity);
  r.step(1);
  const want = (): number => {
    const a = Math.atan2(g.aimPoint.x - g.body.pos.x, g.aimPoint.z - g.body.pos.z);
    return kind === 'tail' ? wrap(a + Math.PI) : a;
  };
  if (kind === 'breath') r.press('left');
  else r.press(kind === 'claw' ? 'right' : 'q');
  const t0 = r.t;
  let turned = -1;
  let fired = -1;
  let offAtFire = 0;
  const ev = kind === 'claw' ? 'dragon.claw' : 'dragon.tail';
  const before = g.bus.count(ev);
  r.run(1.5, (t) => {
    if (t - t0 > 0.05 && kind !== 'breath') r.release(kind === 'claw' ? 'right' : 'q');
    const aimYaw = want();
    if (turned < 0 && Math.abs(wrap(g.body.yaw - aimYaw)) < 5 * DEG) turned = t - t0;
    const firedNow = kind === 'breath' ? g.combat.breathActive : g.bus.count(ev) > before;
    if (fired < 0 && firedNow) {
      fired = t - t0;
      if (kind === 'breath') offAtFire = Math.abs(wrap(g.body.yaw - aimYaw)) / DEG;
      else {
        const e = [...g.bus.recent].reverse().find((x: any) => x.type === ev);
        const a = Math.atan2(e.pos[0] - g.body.pos.x, e.pos[2] - g.body.pos.z);
        offAtFire = Math.abs(wrap(a - Math.atan2(g.aimPoint.x - g.body.pos.x, g.aimPoint.z - g.body.pos.z))) / DEG;
      }
    }
  });
  if (kind === 'breath') r.release('left');
  return { turnSeconds: turned < 0 ? 99 : turned, fireSeconds: fired < 0 ? 99 : fired, offAtFireDeg: offAtFire };
}

function altitudeRate(r: Rig, seconds: number, from: number): { rate: number; max: number; gain: number } {
  const g = r.game;
  const a0 = g.body.altitude;
  let aFrom = a0;
  let max = -Infinity;
  const t0 = r.t;
  r.run(seconds, (t) => {
    if (Math.abs(t - t0 - from) < DT / 2) aFrom = g.body.altitude;
    max = Math.max(max, g.body.vel.y);
  });
  return { rate: (g.body.altitude - aFrom) / (seconds - from), max, gain: g.body.altitude - a0 };
}

/** 地上の走り（Shift＋W）：最高速の9割に届くまでと、離してから止まるまで（秒・m）。炎を吐きながら歩く速さ。 */
function running(m: MeasureMods): Measurements['running'] {
  const s = openSpot(m, 90);
  const r = rig(m);
  const g = r.game;
  place(g, s.x, s.z, 90 * DEG, 'ground');
  r.step(2);
  r.press('w');
  r.press('shift');
  const t0 = r.t;
  let to90 = -1;
  // r03-roster：走りの最高速は怪獣ごと（前の版には motion が無いので紅竜の 22m/s）
  const runSpeed: number = g.body.motion?.ground?.runSpeed ?? 22;
  r.run(4, (t) => {
    if (to90 < 0 && g.body.speed >= runSpeed * 0.9) to90 = t - t0;
  });
  const x0 = g.body.pos.x;
  const z0 = g.body.pos.z;
  r.release('w');
  r.release('shift');
  const t1 = r.t;
  let stop = -1;
  let dist = 0;
  r.run(4, (t) => {
    if (stop < 0 && g.body.speed < 0.3) {
      stop = t - t1;
      dist = Math.hypot(g.body.pos.x - x0, g.body.pos.z - z0);
    }
  });
  const b = rig(m);
  place(b.game, s.x, s.z, 90 * DEG, 'ground');
  b.step(2);
  b.press('w');
  b.press('left');
  b.run(3);
  return { runTo90Seconds: to90 < 0 ? 99 : to90, runStopSeconds: stop < 0 ? 99 : stop, runStopMeters: dist, breathWalkSpeed: b.game.body.speed };
}

function climb(m: MeasureMods): Measurements['climb'] {
  const s = openSpot(m, 60);
  const hold = rig(m);
  place(hold.game, s.x, s.z, 90 * DEG, 'air', 60, 0);
  hold.press('space');
  const h = altitudeRate(hold, 3, 1);
  const tap = rig(m);
  place(tap.game, s.x, s.z, 90 * DEG, 'air', 60, 0);
  const g = tap.game;
  const a0 = g.body.altitude;
  let maxRate = -Infinity;
  for (let k = 0; k < 12; k++) {
    tap.press('space');
    tap.run(0.05, () => (maxRate = Math.max(maxRate, g.body.vel.y)));
    tap.release('space');
    tap.run(0.35, () => (maxRate = Math.max(maxRate, g.body.vel.y)));
  }
  return { holdRate: h.rate, tapGain48: g.body.altitude - a0, tapMaxRate: maxRate };
}

function diveExit(m: MeasureMods): Measurements['diveExit'] {
  const s = openSpot(m, 60);
  const a = rig(m);
  place(a.game, s.x, s.z, 90 * DEG, 'air', 280, 20);
  a.press('shift');
  a.run(1.0);
  a.release('shift');
  const t0 = a.t;
  let glide = -1;
  a.run(4, (t) => {
    if (glide < 0 && a.game.body.vel.y >= -6) glide = t - t0;
  });
  const b = rig(m);
  place(b.game, s.x, s.z, 90 * DEG, 'air', 280, 20);
  b.press('shift');
  b.run(1.0);
  b.press('space');
  const t1 = b.t;
  let stop = -1;
  b.run(6, (t) => {
    if (stop < 0 && b.game.body.vel.y >= 0) stop = t - t1;
  });
  return { shiftReleaseToGlideSeconds: glide < 0 ? 99 : glide, spaceStopSeconds: stop < 0 ? 99 : stop };
}

function descend(m: MeasureMods): Measurements['descend'] {
  const s = openSpot(m, 60);
  const r = rig(m);
  place(r.game, s.x, s.z, 90 * DEG, 'air', 150, 0);
  r.press('c');
  return { cRate: -altitudeRate(r, 3, 1).rate };
}

/** 急降下（と滑空）で着地して、動けるようになる（着地の段階が終わる）までの秒数。 */
function landing(m: MeasureMods): Measurements['landing'] {
  const s = openSpot(m, 90);
  const stiff = (dive: boolean): number => {
    const r = rig(m);
    place(r.game, s.x, s.z, 90 * DEG, 'air', dive ? 80 : 12, 0);
    if (dive) r.press('shift');
    // ゲーム内時刻で測る（体験の採点の記録と同じ物差し。着地のヒットストップの間は時計が遅く進む）
    let landedAt = -1;
    let freeAt = -1;
    r.run(20, () => {
      const mode = r.game.body.mode;
      const t = r.game.clock;
      if (landedAt < 0 && mode === 'landing') landedAt = t;
      if (landedAt >= 0 && freeAt < 0 && mode === 'ground') freeAt = t;
    });
    return landedAt < 0 || freeAt < 0 ? 99 : freeAt - landedAt;
  };
  return { diveStiffSeconds: stiff(true), glideStiffSeconds: stiff(false) };
}

/**
 * バグ B1 の手順を街のどこでも再現する：高い建物の西の壁の正面から、空中（高さ50m・36m/s）か地上（走り22m/s）で W を押したまま突っ込む。
 * 壁に触れてからの6秒で「水平に 3m/s より遅い」状態が続いた最長の秒数を返す（体験の採点では6.5秒）。
 */
export function stick(m: MeasureMods, air: boolean): { seconds: number; smashed: boolean; building: number } {
  // 空中は高さ50m（足は地面から50m）で飛ぶので、それより低い建物は行く手を塞がない
  const minHeight = air ? 90 : 30;
  const block = air ? 45 : 14;
  let found: { b: any; at: { x: number; z: number; yaw: number } } | null = null;
  for (const b of [...m.city.buildings].sort((p: any, q: any) => p.id - q.id)) {
    if (b.height < minHeight || (!air && b.height > 80)) continue;
    const at = approach(m, b, 120, 14, block);
    if (at) {
      found = { b, at };
      break;
    }
  }
  if (!found) return { seconds: -1, smashed: false, building: -1 };
  const { b, at } = found;
  const r = rig(m);
  const g = r.game;
  place(g, at.x, at.z, at.yaw, air ? 'air' : 'ground', air ? 50 : 0, air ? 36 : 0);
  g.view.pitch = air ? -4 * DEG : -8 * DEG;
  r.press('w');
  if (!air) r.press('shift');
  let touched = -1;
  let px = g.body.pos.x;
  let pz = g.body.pos.z;
  let slowFor = 0;
  let longest = 0;
  r.run(12, (t) => {
    const v = Math.hypot(g.body.pos.x - px, g.body.pos.z - pz) / DT;
    px = g.body.pos.x;
    pz = g.body.pos.z;
    // r03-roster：体の半径は怪獣ごと（前の版の遊びの本体には shape が無いので、紅竜の 9m）
    if (touched < 0 && footDist(b, g.body.pos.x, g.body.pos.z) <= (g.body.shape?.radius ?? 9) + 0.6) touched = t;
    if (touched < 0 || t - touched > 6) return;
    slowFor = v < 3 ? slowFor + DT : 0;
    longest = Math.max(longest, slowFor);
  });
  return { seconds: touched < 0 ? -1 : longest, smashed: g.damage.stage[b.id] >= 3, building: b.id };
}

function clawChain(m: MeasureMods): Measurements['clawChain'] {
  const s = openSpot(m, 60);
  const count = (presses: number[]): number => {
    const r = rig(m);
    place(r.game, s.x, s.z, 90 * DEG, 'ground');
    r.step(2);
    const before = r.game.bus.count('dragon.claw');
    let k = 0;
    const t0 = r.t;
    r.run(2.0, (t) => {
      while (k < presses.length && t - t0 >= presses[k] - 1e-9) {
        r.press('right');
        r.release('right');
        k++;
      }
    });
    return r.game.bus.count('dragon.claw') - before;
  };
  return { pressAfterHit: count([0, 0.35]), pressDuringWindup: count([0, 0.08]), mash15: count(Array.from({ length: 15 }, (_, i) => i * 0.1)) };
}

/** 地上から、高さ45〜52mの中層（耐久が最も400に近いもの）へ3秒炎を当てる。3秒後の段階（3 で傾き）。 */
function breathMidrise(m: MeasureMods): Measurements['breathMidrise'] {
  const r = rig(m);
  const g = r.game;
  const cands = m.city.buildings
    .filter((b: any) => b.kind === 'tileMidrise' && b.height >= 42 && b.height <= 52)
    .sort((p: any, q: any) => Math.abs(g.damage.hp[p.id] - 400) - Math.abs(g.damage.hp[q.id] - 400) || p.id - q.id);
  let pick: any = null;
  let at: { x: number; z: number; yaw: number } | null = null;
  for (const b of cands) {
    at = approach(m, b, 45, 10, 14);
    if (at) {
      pick = b;
      break;
    }
  }
  if (!pick || !at) return { building: -1, hp: 0, stageAfter3s: -1, fractionAfter3s: 0 };
  place(g, at.x, at.z, at.yaw, 'ground');
  g.view.pitch = Math.atan2(pick.height * 0.45 - 22.5, 45 + 74);
  r.step(2);
  r.press('left');
  r.run(3.0);
  r.release('left');
  return { building: pick.id, hp: g.damage.hp[pick.id], stageAfter3s: g.damage.stage[pick.id], fractionAfter3s: g.damage.damage[pick.id] / g.damage.hp[pick.id] };
}

function clock(m: MeasureMods): Measurements['clock'] {
  const game = new m.Game(m.city, m.index);
  const input = new m.InputState();
  const bot = new m.BasicPlaytest();
  game.start();
  for (let i = 0; i < Math.round((m.durationSeconds + 30) / DT) && game.session.phase !== 'result'; i++) {
    bot.update(DT, game, input);
    game.step(DT, m.readControls(input));
  }
  const end = game.bus.recent.find((e: any) => e.type === 'session.end');
  return { endedAt: end ? end.t : -1 };
}

/** 固定刻みのループ：60fps の中に 200ms の引っかかりを1回入れ、1秒後に実時間からどれだけ遅れているか（ms）。 */
function loop(m: MeasureMods): Measurements['loop'] {
  const l = new m.FixedStepLoop({ update: () => undefined, render: () => undefined }, { step: DT, maxSubSteps: 5 });
  let now = 0;
  l.advanceRealtime(now);
  for (let i = 0; i < 60; i++) l.advanceRealtime((now += 1 / 60));
  l.advanceRealtime((now += 0.2));
  for (let i = 0; i < 60; i++) l.advanceRealtime((now += 1 / 60));
  return { lagAfterHitchMs: Math.round((now - l.simTime) * 1000) };
}

export function measureAll(m: MeasureMods): Measurements {
  const gw = groundReverse(m, false);
  const gr = groundReverse(m, true);
  const air = stick(m, true);
  const ground = stick(m, false);
  return {
    groundReverse: { walkSeconds: gw.seconds, runSeconds: gr.seconds, walkMinSpeed: gw.minSpeed, walkRecoverSeconds: gw.recover },
    airReverse: airReverse(m),
    running: running(m),
    attackPivot: { breath: attackPivot(m, 'breath'), claw: attackPivot(m, 'claw'), tail: attackPivot(m, 'tail') },
    climb: climb(m),
    diveExit: diveExit(m),
    descend: descend(m),
    landing: landing(m),
    stick: { airSeconds: air.seconds, groundSeconds: ground.seconds, airSmashed: air.smashed, airBuilding: air.building, groundBuilding: ground.building },
    clawChain: clawChain(m),
    breathMidrise: breathMidrise(m),
    clock: clock(m),
    loop: loop(m),
  };
}

/** 報告用に丸めた平らな表。 */
export function flatten(x: Measurements): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  const walk = (o: any, prefix: string): void => {
    for (const [k, v] of Object.entries(o)) {
      if (v !== null && typeof v === 'object') walk(v, `${prefix}${k}.`);
      else out[`${prefix}${k}`] = typeof v === 'number' ? r2(v) : (v as boolean);
    }
  };
  walk(x, '');
  return out;
}
