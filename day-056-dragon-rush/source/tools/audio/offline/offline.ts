// OWNER: audio-tools
// 書き出しの確かめ（tools/audio-render.mjs が開くページ）。遊びと同じ音の仕組み（src/audio の GameAudio と AudioEngine）を
// OfflineAudioContext の上で動かし、決めた時刻に出来事を出して鳴らす。21ms ごとに止めて「毎コマ」の更新も同じ順で呼ぶ。
// 場面：stress（咆哮・重い着地・10棟の崩落が同時）、spatial（同じ崩落を 43m・176m 左・409m 右・942m で）、session（段階の上下と引きの 72 秒）。
// r02-audio で足した場面：levels／levels_music（続く音と細かい音を、効果音だけ・曲だけで同じ筋書きに書き出して比べる）、
// pause（一時停止の間に曲の時計が止まるか）、roster_<怪獣>（3体の声・足音・着地・主砲・技を同じ筋書きで並べる。曲は鳴らさない）。
// r05-audio で足した場面：finale（遊びの時計を 0.97 倍で進め、71 小節の大太鼓が時間切れに合うか）。roster_<怪獣> の 38〜43 秒に近い技（振りと当たり）。
// r06-audio で足した場面：finale_mix（finale と同じ筋書きを、曲と結果の音で書き出す。時間切れの瞬間に大太鼓が1つに聞こえるか）、
// lowduck_replay／lowduck_replay_r05（遊びの記録から切り出した忙しい1分の重い出来事を、曲だけで、低い帯の引きを今の決まり／r05 の決まりで書き出す。
// 引いては戻るうねりの聞き比べ。出来事の並びは replay.json、作り方は .captures/r06-audio/tools/r06audio_replay.py）。
import { AudioEngine } from '../../../src/audio/engine';
import { GameAudio, type AudioGameLike } from '../../../src/audio/gameAudio';
import { LOW_DUCK, MONSTER_SOUNDS } from '../../../src/config/audio';
import replay from './replay.json';
import { EventBus, type BuildingMaterial, type P3 } from '../../../src/core/events';

const SR = 48000;
const STEP = 1024 / SR;
/** カメラ：(0, 30, 80) から -z を向き、右が +x（列優先の世界行列） */
const CAMERA = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 30, 80, 1];

class FakeGame implements AudioGameLike {
  readonly bus = new EventBus();
  clock = 0;
  /** timeLeft は残りのゲーム内秒（r05-audio：曲の終わりを合わせる仕組みが読む） */
  readonly session = { phase: 'ready', timeLeft: 180 };
  readonly score = { rage: 0, rageFull: false, combo: 0 };
  readonly body = { pos: { x: 0, y: 9.5, z: 0 }, speed: 0, mode: 'ground', grounded: true };
  readonly combat = { mouth: { x: 0, y: 14.5, z: -25 }, claw: { phase: 'none' }, tail: { phase: 'none' } };
  readonly fire = { burning: new Set<number>(), burn: new Float32Array(16) };
  // 0 は昔からの1棟。1〜8 は levels の燃える街の下地を測るための棟（聞く位置から約 50m〜120m）
  readonly city = {
    buildings: [
      { footprint: { x0: -20, x1: 20, z0: -60, z1: -30 }, height: 40 },
      ...Array.from({ length: 8 }, (_, k) => {
        const a = -Math.PI / 2 + (k - 3.5) * 0.35;
        const r = 50 + k * 10;
        const cx = Math.cos(a) * r;
        const cz = 32 + Math.sin(a) * r;
        return { footprint: { x0: cx - 12, x1: cx + 12, z0: cz - 12, z1: cz + 12 }, height: 40 };
      }),
    ],
  };
}

type Action = [number, (g: FakeGame, a: GameAudio) => void];

const building = (g: FakeGame, kind: 'crack' | 'peel' | 'tilt' | 'collapse', id: number, pos: P3, volume: number, material: BuildingMaterial = 'concrete'): void =>
  g.bus.emit(`building.${kind}`, { t: g.clock, id, pos, volume, height: Math.cbrt(volume) * 1.6, material, cause: 'claw' });

const start = (g: FakeGame): void => {
  g.session.phase = 'playing';
  g.bus.emit('session.start', { t: g.clock });
};

function stress(): Action[] {
  return [
    [0, (g) => {
      g.score.rage = 100;
      g.score.rageFull = true;
      start(g);
    }],
    [4, (g) => {
      g.bus.emit('dragon.roar', { t: g.clock, pos: [0, 9.5, 0], dir: [0, 0, -1] });
      g.bus.emit('dragon.land', { t: g.clock, pos: [0, 0, 0], impact: 1, speed: 70, dive: true });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const d = 30 + 12 * k;
        const p: P3 = [Math.cos(a) * d, 12, -Math.sin(a) * d];
        building(g, 'collapse', k, p, 30000 + 12000 * k, k % 3 === 0 ? 'glass' : 'concrete');
        g.bus.emit('glass.shatter', { t: g.clock, id: 100 + k, pos: p, count: 12 });
      }
    }],
  ];
}

function spatial(): Action[] {
  const hit = (x: number, z: number) => (g: FakeGame) => building(g, 'collapse', Math.round(x + z), [x, 10, z], 60000);
  // 前の崩落の尾（遠い崩落は 9 秒＋音速の遅れ）が次の窓に入らないよう 14 秒ずつ空ける
  return [
    [0, start],
    [1, hit(0, -10)],
    [15, hit(-150, -60)],
    [29, hit(380, -120)],
    [43, hit(-300, -850)],
  ];
}

function session(): Action[] {
  const a: Action[] = [[0, start]];
  const step = (t: number, k: number, speed: number): Action => [t, (g) => g.bus.emit('dragon.step', { t: g.clock, foot: (['HL', 'FR', 'HR', 'FL'] as const)[k % 4], pos: [k % 2 ? 4 : -4, 0, -2], speed })];
  for (let k = 0; k < 13; k++) a.push(step(3 + k * 0.55, k, 4));
  for (let k = 0; k < 7; k++) a.push(step(44 + k * 0.42, k, 14));
  a.push([12, (g) => (g.score.combo = 6)]);
  a.push([14, (g) => {
    g.bus.emit('dragon.breath.start', { t: g.clock, pos: [0, 14.5, -25], dir: [0, 0, -1] });
    g.bus.emit('fire.ignite', { t: g.clock, id: 0, pos: [0, 20, -45], size: 30 });
    g.fire.burning.add(0);
    g.fire.burn[0] = 1;
  }]);
  a.push([15.2, (g) => g.bus.emit('glass.shatter', { t: g.clock, id: 0, pos: [0, 20, -45], count: 10 })]);
  a.push([17, (g) => g.bus.emit('dragon.breath.stop', { t: g.clock, pos: [0, 14.5, -25], dir: [0, 0, -1] })]);
  a.push([18, (g) => building(g, 'crack', 1, [30, 15, -40], 40000)]);
  a.push([18.4, (g) => building(g, 'peel', 1, [30, 15, -40], 40000)]);
  a.push([19.2, (g) => building(g, 'tilt', 1, [30, 15, -40], 40000)]);
  a.push([19.8, (g) => (g.combat.claw.phase = 'windup')]);
  a.push([20, (g) => {
    g.combat.claw.phase = 'active';
    g.bus.emit('dragon.claw', { t: g.clock, pos: [20, 10, -30], hit: true, count: 2 });
  }]);
  a.push([20.4, (g) => (g.combat.claw.phase = 'none')]);
  a.push([20.6, (g) => building(g, 'collapse', 1, [30, 15, -40], 40000)]);
  a.push([22.7, (g) => (g.combat.tail.phase = 'windup')]);
  a.push([23, (g) => {
    g.combat.tail.phase = 'active';
    g.bus.emit('dragon.tail', { t: g.clock, pos: [-10, 8, 30], hit: true, count: 1 });
  }]);
  a.push([23.5, (g) => (g.combat.tail.phase = 'none')]);
  a.push([25, (g) => building(g, 'collapse', 2, [250, 20, -160], 90000, 'glass')]);
  a.push([27, (g) => (g.score.combo = 12)]);
  a.push([30, (g) => {
    g.score.rage = 100;
    g.score.rageFull = true;
    g.bus.emit('rage.full', { t: g.clock, value: 100 });
  }]);
  a.push([33, (g) => building(g, 'collapse', 3, [-40, 15, -50], 70000)]);
  a.push([38, (g) => (g.score.combo = 20)]);
  a.push([40, (g) => {
    g.score.rage = 0;
    g.score.rageFull = false;
    g.bus.emit('rage.release', { t: g.clock, kind: 'roar', value: 100 });
  }]);
  a.push([40.45, (g) => g.bus.emit('dragon.roar', { t: g.clock, pos: [0, 9.5, 0], dir: [0, 0, -1] })]);
  a.push([41, (g) => (g.score.combo = 0)]);
  a.push([45, (g) => building(g, 'collapse', 4, [60, 15, -20], 50000)]);
  for (const t of [48, 48.6, 49.2]) a.push([t, (g) => g.bus.emit('dragon.wingFlap', { t: g.clock, strength: 0.9, pos: [0, 30, 0] })]);
  a.push([50.5, (g) => g.bus.emit('dragon.land', { t: g.clock, pos: [0, 0, 0], impact: 0.9, speed: 60, dive: true })]);
  return a;
}

/** 続く音と細かい音の大きさ（曲は暴の段階）：ブレス 4〜10 秒、燃える街 1棟 12〜17 秒・8棟 17.5〜25.5 秒、全速の風 27〜33.5 秒、ひび 35〜39 秒。 */
function levels(): Action[] {
  const a: Action[] = [[0, start], [0.5, (g) => (g.score.combo = 6)]];
  a.push([4, (g) => g.bus.emit('dragon.breath.start', { t: g.clock, pos: [0, 14.5, -25], dir: [0, 0, -1] })]);
  a.push([10, (g) => g.bus.emit('dragon.breath.stop', { t: g.clock, pos: [0, 14.5, -25], dir: [0, 0, -1] })]);
  a.push([12, (g) => {
    g.fire.burning.add(1);
    g.fire.burn[1] = 1;
  }]);
  a.push([17.5, (g) => {
    for (let k = 2; k <= 8; k++) {
      g.fire.burning.add(k);
      g.fire.burn[k] = 1;
    }
  }]);
  a.push([25.5, (g) => g.fire.burning.clear()]);
  a.push([27, (g) => {
    g.body.grounded = false;
    g.body.speed = 60;
    g.body.mode = 'fly';
  }]);
  a.push([33.5, (g) => {
    g.body.grounded = true;
    g.body.speed = 0;
    g.body.mode = 'ground';
  }]);
  for (let k = 0; k < 5; k++) a.push([35 + k * 0.9, (g) => building(g, 'crack', 20 + k, [30, 14, 0], 40000)]);
  return a;
}

/** 一時停止：10 秒で止め、16 秒で戻す。曲の頭の時刻（止める前）を覚えておき、戻った後の位置と比べる。 */
let songStartBefore = 0;
function pause(): Action[] {
  return [
    [0, start],
    [0.5, (g) => (g.score.combo = 6)],
    [10, (g, a) => {
      songStartBefore = a.engine.music?.start ?? 0;
      g.session.phase = 'paused';
    }],
    [16, (g) => (g.session.phase = 'playing')],
  ];
}

/** 怪獣1体の声・足音（歩く・走る）・羽ばたき・重い着地・主砲・技・近い技を、決まった時刻に鳴らす（3体で同じ筋書き）。 */
function roster(monster: string): Action[] {
  const a: Action[] = [[0, start]];
  a.push([1, (g) => g.bus.emit('dragon.roar', { t: g.clock, pos: [0, 9.5, 0], dir: [0, 0, -1] })]);
  const feet = ['HL', 'FR', 'HR', 'FL'] as const;
  for (let k = 0; k < 8; k++) a.push([6 + k * 0.5, (g) => g.bus.emit('dragon.step', { t: g.clock, foot: feet[k % 4], pos: [k % 2 ? 4 : -4, 0, -2], speed: 4 })]);
  for (let k = 0; k < 8; k++) a.push([10.5 + k * 0.3, (g) => g.bus.emit('dragon.step', { t: g.clock, foot: feet[k % 4], pos: [k % 2 ? 4 : -4, 0, -2], speed: 14 })]);
  for (const t of [14, 14.6, 15.2]) a.push([t, (g) => g.bus.emit('dragon.wingFlap', { t: g.clock, strength: 0.9, pos: [0, 30, 0] })]);
  a.push([16.5, (g) => g.bus.emit('dragon.land', { t: g.clock, pos: [0, 0, 0], impact: 1, speed: 70, dive: true })]);
  a.push([21, (g) => g.bus.emit('dragon.breath.start', { t: g.clock, pos: [0, 14.5, -25], dir: [0, 0, -1] })]);
  a.push([22.2, (g, au) => au.engine.play('breathHit', [20, 0, -80], { ev: 'roster', t: g.clock })]);
  a.push([24, (g) => g.bus.emit('dragon.breath.stop', { t: g.clock, pos: [0, 14.5, -25], dir: [0, 0, -1] })]);
  // 技：跳ねる雷（雷翼）、押し倒す・地割れ・突進の地響き（焔角）。その怪獣に無い音は鳴らない
  for (const [t, p] of [[26, [30, 25, -60]], [26.6, [-40, 30, -90]], [27.3, [60, 20, -120]]] as [number, P3][]) a.push([t, (g, au) => au.engine.play('arc', p, { ev: 'roster', t: g.clock })]);
  a.push([26, (g, au) => au.engine.play('shove', [15, 20, -30], { ev: 'roster', t: g.clock })]);
  a.push([29.5, (g, au) => au.engine.play('fissure', [0, 0, -10], { ev: 'roster', t: g.clock })]);
  let charge: ReturnType<AudioEngine['loop']> = null;
  a.push([33, (_g, au) => {
    charge = au.engine.loop(au.engine.monsterBank('chargeLoop'), 0.1);
    if (charge?.start(au.ctx.currentTime, 1, 0)) charge.set(1, 0, 18000, 0.05);
  }]);
  a.push([36, (_g, au) => charge?.stop(au.ctx.currentTime, 0.3)]);
  // r05-audio：近い技（右クリックの振りと当たり・Q の振りと当たり）。振りは振りかぶりの始まりで鳴り、山が当たりの瞬間に来る（怪獣ごとの振りかぶりの秒数）
  const near: Record<string, [number, number]> = { dragon: [0.2, 0.3], raiyoku: [0.26, 0.24], homuratsuno: [0.3, 0.38] };
  const [cw, tw] = near[monster] ?? near.dragon;
  a.push([38, (g) => (g.combat.claw.phase = 'windup')]);
  a.push([38 + cw, (g) => {
    g.combat.claw.phase = 'active';
    g.bus.emit('dragon.claw', { t: g.clock, pos: [20, 10, -30], hit: true, count: 2 });
  }]);
  a.push([38.7, (g) => (g.combat.claw.phase = 'none')]);
  a.push([41, (g) => (g.combat.tail.phase = 'windup')]);
  a.push([41 + tw, (g) => {
    g.combat.tail.phase = 'active';
    g.bus.emit('dragon.tail', { t: g.clock, pos: [-10, 8, 30], hit: true, count: 2 });
  }]);
  a.push([41.8, (g) => (g.combat.tail.phase = 'none')]);
  return a;
}

/**
 * r05-audio：曲の終わり。遊びの時計を実時間の 0.97 倍で進め（ヒットストップで 3分に約 5.6 秒遅れる）、ゲーム内 180 秒で時間切れにする。
 * 曲は 63 小節目を繰り返して待ち、71 小節の大太鼓を時間切れに合わせるはず（tools/audio-render.mjs が書き出しから大太鼓の頭を探して確かめる）。
 */
function finale(): Action[] {
  return [
    [0, start],
    [0.5, (g) => (g.score.combo = 6)],
  ];
}

/**
 * r05-audio：重い効果音の間だけ曲の低い帯を空けるか。曲だけを書き出し、重い着地（10秒）・近い崩落（20秒）・咆哮（30秒）を出す。
 * lowduck_off は同じ筋書きで低い帯の引きだけを止めたもの。2つの差が、低い帯の引きだけの効き目になる（全帯域の引きは両方にある）。
 */
function lowduck(): Action[] {
  return [
    [0, start],
    [0.5, (g) => (g.score.combo = 6)],
    [10, (g) => g.bus.emit('dragon.land', { t: g.clock, pos: [0, 0, 0], impact: 1, speed: 40, dive: false, slam: true })],
    [20, (g) => building(g, 'collapse', 5, [30, 15, -40], 60000)],
    [30, (g) => g.bus.emit('dragon.roar', { t: g.clock, pos: [0, 9.5, 0], dir: [0, 0, -1] })],
  ];
}

/** r05-audio の低い帯の引き（保持と戻り、秒）。lowduck_replay_r05 で前の決まりを再現する */
const R05_LOW = {
  collapse: { attack: 0.03, hold: 2.6, release: 1.5 },
  landHeavy: { attack: 0.02, hold: 1.6, release: 1.2 },
  roar: { attack: 0.05, hold: 3.2, release: 1.5 },
  fissure: { attack: 0.03, hold: 3.4, release: 1.5 },
};
let replayRule: 'r05' | 'r06' = 'r06';

/** 前の決まりの低い帯の引きを、曲の系統の低い帯の節にそのまま掛ける（実行時の AudioMixer.lowDuck と同じ動き。r05 の数値） */
function r05LowDuck(a: GameAudio, kind: keyof typeof R05_LOW): void {
  const m = a.engine.mixer as unknown as { musicLow: BiquadFilterNode; lowUntil: number };
  const when = a.ctx.currentTime;
  const d = R05_LOW[kind];
  const active = when < m.lowUntil;
  const until = Math.max(when + d.attack + d.hold, active ? m.lowUntil : -Infinity);
  const p = m.musicLow.gain;
  p.cancelScheduledValues(when);
  p.setValueAtTime(p.value, when);
  p.linearRampToValueAtTime(LOW_DUCK.depthDb, when + d.attack);
  p.setValueAtTime(LOW_DUCK.depthDb, until);
  p.setTargetAtTime(0, until, d.release / 3);
  m.lowUntil = until;
  a.engine.log.duck(`low:${kind}`, when, undefined, until + d.release / 3);
}

interface ReplayEvent {
  at: number;
  kind: 'collapse' | 'landHeavy' | 'roarRelease' | 'roar' | 'fissure';
  volume?: number;
  near?: boolean;
}

/**
 * r06-audio：遊びの記録から切り出した重い出来事（崩落・重い着地・大技の咆哮・地割れ）を、記録と同じ間隔で出す（曲は暴の段階から）。
 * 前の決まり（r05）では、近い崩落のたびに・重い着地のたびに低い帯を引く。今の決まりは gameAudio.ts と mixer.ts の lowDuckFor のまま。
 */
function lowduckReplay(): Action[] {
  const a: Action[] = [[0, start], [0.5, (g) => (g.score.combo = 6)]];
  let id = 300;
  for (const e of (replay as { events: ReplayEvent[] }).events) {
    const t = 1 + e.at;
    const bid = id++;
    if (e.kind === 'collapse')
      a.push([t, (g, au) => {
        if (replayRule === 'r05' && e.near) r05LowDuck(au, 'collapse');
        building(g, 'collapse', bid, e.near ? [30, 15, -40] : [380, 15, -500], e.volume ?? 30000);
      }]);
    else if (e.kind === 'landHeavy')
      a.push([t, (g, au) => {
        if (replayRule === 'r05') r05LowDuck(au, 'landHeavy');
        g.bus.emit('dragon.land', { t: g.clock, pos: [0, 0, 0], impact: 1, speed: 40, dive: false, slam: true });
      }]);
    else if (e.kind === 'roarRelease')
      a.push([t, (g, au) => {
        if (replayRule === 'r05') r05LowDuck(au, 'roar');
        g.bus.emit('rage.release', { t: g.clock, kind: 'fissure', value: 100 });
      }]);
    else if (e.kind === 'roar')
      a.push([t, (g, au) => {
        if (replayRule === 'r05') r05LowDuck(au, 'roar');
        g.bus.emit('dragon.roar', { t: g.clock, pos: [0, 9.5, 0], dir: [0, 0, -1] });
      }]);
    else
      a.push([t, (g, au) => {
        if (replayRule === 'r05') r05LowDuck(au, 'fissure');
        g.bus.emit('fissure.start', { t: g.clock, creature: 'homuratsuno', id: bid, pos: [0, 0, -10], dir: [0, 0, -1], length: 120, segments: 8 });
      }]);
  }
  return a;
}

const SCENARIOS: Record<string, { seconds: number; actions: () => Action[]; volumes?: { volume: number; bgm: number; sfx: number }; monster?: string; clockRate?: number; noLowDuck?: boolean; lowDuckRule?: 'r05' | 'r06' }> = {
  stress: { seconds: 14, actions: stress },
  spatial: { seconds: 58, actions: spatial, volumes: { volume: 1, bgm: 0, sfx: 1 } },
  session: { seconds: 72, actions: session },
  session_music: { seconds: 72, actions: session, volumes: { volume: 1, bgm: 1, sfx: 0 } },
  levels: { seconds: 40, actions: levels, volumes: { volume: 1, bgm: 0, sfx: 1 } },
  levels_music: { seconds: 40, actions: levels, volumes: { volume: 1, bgm: 1, sfx: 0 } },
  pause: { seconds: 30, actions: pause, volumes: { volume: 1, bgm: 1, sfx: 0 } },
  ...Object.fromEntries(Object.keys(MONSTER_SOUNDS).map((m) => [`roster_${m}`, { seconds: 45, actions: () => roster(m), volumes: { volume: 1, bgm: 0, sfx: 1 }, monster: m }])),
  finale: { seconds: 194, actions: finale, volumes: { volume: 1, bgm: 1, sfx: 0 }, clockRate: 0.97 },
  // r06-audio：結果の音（UI）は効果音のつまみで鳴る。筋書きに効果音の出来事は無いので、鳴るのは曲と結果の音だけ
  finale_mix: { seconds: 194, actions: finale, volumes: { volume: 1, bgm: 1, sfx: 1 }, clockRate: 0.97 },
  lowduck: { seconds: 40, actions: lowduck, volumes: { volume: 1, bgm: 1, sfx: 0 } },
  lowduck_off: { seconds: 40, actions: lowduck, volumes: { volume: 1, bgm: 1, sfx: 0 }, noLowDuck: true },
  ...((replay as { events: ReplayEvent[] }).events.length
    ? {
        lowduck_replay: { seconds: Math.ceil((replay as { window: number[] }).window[1] - (replay as { window: number[] }).window[0]) + 6, actions: lowduckReplay, volumes: { volume: 1, bgm: 1, sfx: 0 }, monster: 'homuratsuno', lowDuckRule: 'r06' as const },
        lowduck_replay_r05: { seconds: Math.ceil((replay as { window: number[] }).window[1] - (replay as { window: number[] }).window[0]) + 6, actions: lowduckReplay, volumes: { volume: 1, bgm: 1, sfx: 0 }, monster: 'homuratsuno', lowDuckRule: 'r05' as const },
      }
    : {}),
};

function wav(buf: AudioBuffer): ArrayBuffer {
  const n = buf.length;
  const out = new ArrayBuffer(44 + n * 8);
  const v = new DataView(out);
  const s = (o: number, t: string): void => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF');
  v.setUint32(4, 36 + n * 8, true);
  s(8, 'WAVE');
  s(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 8, true);
  v.setUint16(32, 8, true);
  v.setUint16(34, 32, true);
  s(36, 'data');
  v.setUint32(40, n * 8, true);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    v.setFloat32(44 + i * 8, l[i], true);
    v.setFloat32(48 + i * 8, r[i], true);
  }
  return out;
}

async function render(name: string): Promise<unknown> {
  const sc = SCENARIOS[name];
  const ctx = new OfflineAudioContext(2, Math.ceil(sc.seconds * SR), SR);
  const engine = new AudioEngine(ctx, sc.monster ?? 'dragon', '/assets/audio/');
  await engine.load(true, '/assets/audio/manifest.json');
  // 書き出しは実時間より速く進むので、曲の塊は全部先に読み、捨てない
  const music = engine.manifest?.music;
  if (music) await engine.store.loadAll(music.stems.flatMap((s) => music.chunks[s]));
  engine.store.drop = () => undefined;
  const g = new FakeGame();
  const audio = new GameAudio(g, engine);
  audio.setVolumes(sc.volumes ?? { volume: 1, bgm: 1, sfx: 1 });
  // 比べるための書き出しだけ、低い帯の引きを止める（遊びには無い切り替え）
  if (sc.noLowDuck) engine.mixer.lowDuck = () => 0;
  // r06-audio：前の決まりで書き出すときは、今の決まりの引きを止めて、筋書きの側から r05 の引きを掛ける
  replayRule = sc.lowDuckRule ?? 'r06';
  if (replayRule === 'r05') engine.mixer.lowDuck = () => 0;
  const actions = sc.actions().sort((x, y) => x[0] - y[0]);
  let next = 0;
  for (let k = 0; k * STEP < sc.seconds - STEP; k++) {
    const t = k * STEP;
    void ctx.suspend(t).then(() => {
      g.clock = t * (sc.clockRate ?? 1);
      // r05-audio：遊んでいる間は残り時間を減らし、ゲーム内 180 秒で時間切れ（session.end）にする
      if (g.session.phase === 'playing') {
        g.session.timeLeft = Math.max(0, 180 - g.clock);
        if (g.session.timeLeft <= 0) {
          g.session.phase = 'result';
          g.bus.emit('session.end', { t: g.clock, yen: 0, destruction: 0, maxCombo: 0 });
        }
      }
      while (next < actions.length && actions[next][0] <= t + 1e-9) actions[next++][1](g, audio);
      audio.frame(CAMERA, false);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  await new Promise((r) => setTimeout(r, 150));
  await fetch(`/upload?name=${name}.wav`, { method: 'POST', body: wav(buf) });
  const log = audio.snapshot();
  return { name, seconds: sc.seconds, monster: engine.monster, songStartBefore, limiter: log.limiter, limiterMaxGrDb: log.limiterMaxGrDb, music: log.music, ducks: log.ducks, voices: log.voices, entries: log.entries.map(({ ev, sound, variant, t, start, prop, distance, gainDb, dropped }) => ({ ev, sound, variant, t, start, prop, distance, gainDb, dropped })) };
}

declare global {
  interface Window {
    __renderScenario?: (name: string) => Promise<unknown>;
    __scenarios?: string[];
  }
}

window.__renderScenario = render;
window.__scenarios = Object.keys(SCENARIOS);
