// OWNER: tests
// 3体の強さをそろえる規則（r06-balance）：怪獣ごとの怒りの倍率の引き方・怒りのたまり方の式・大技の範囲と強さ・地割れが空振らないこと。
// 描画なしの遊びの本体で確かめる。人に近い遊び方で3分を通した数字は balance.measure.test.ts。
import { describe, expect, it } from 'vitest';
import { ROAR } from '../../src/config/attacks';
import { CITY_CONFIG } from '../../src/config/city';
import { CREATURE_CONFIG, CREATURE_IDS, type FissureSpec, type ThunderSpec } from '../../src/config/creatures';
import { BUILDING_RULES, RAGE } from '../../src/config/gameplay';
import { InputState } from '../../src/core/input';
import { emptyControls, readControls } from '../../src/gameplay/controls';
import { STAGE, buildingHp } from '../../src/gameplay/damage';
import { Game } from '../../src/gameplay/game';
import { DEG, vec3 } from '../../src/gameplay/math';
import { applyRing } from '../../src/gameplay/ring';
import { rageGain, rageSizeFactor } from '../../src/gameplay/score';
import { footprintCenter, footprintDistance } from '../../src/gameplay/shapes';
import { fissurePath } from '../../src/gameplay/techniques';
import { pressInput, releaseInput } from '../../src/harness/keys';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import type { Building } from '../../src/world/types';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const DT = 1 / 60;
const fissureSpec = (): FissureSpec => {
  const s = CREATURE_CONFIG.homuratsuno.moves.special.ground;
  if (s.kind !== 'fissure') throw new Error('焔角の E は地割れ');
  return s.spec;
};
const thunderSpec = (): ThunderSpec => {
  const s = CREATURE_CONFIG.raiyoku.moves.special.air;
  if (!s || s.kind !== 'thunderDive') throw new Error('雷翼の空中の E は落雷の輪');
  return s.thunder;
};

/** 地上に立たせる（向き yaw、視点も同じ向き・少し見下ろす）。 */
function standAt(game: Game, x: number, z: number, yaw: number): void {
  const b = game.body;
  const ground = game.groundAt(x, z);
  b.groundY = ground;
  b.pos.x = x;
  b.pos.z = z;
  b.pos.y = ground + b.bodyHeight;
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.mode = 'ground';
  b.speed = 0;
  b.yaw = yaw;
  game.view.yaw = yaw;
  game.view.pitch = -12 * DEG;
}

/** 怒りを満タンにして E を押し、seconds 秒（1/60 秒刻み）進める。押す前の破壊率（%）と、その後の破壊率（%）を返す。 */
function releaseSpecial(game: Game, input: InputState, seconds: number): { before: number; after: number } {
  game.score.rage = RAGE.max;
  game.score.rageFull = true;
  const before = game.score.destruction * 100;
  pressInput(input, 'e');
  game.step(DT, readControls(input));
  releaseInput(input, 'e');
  for (let i = 0; i < Math.round(seconds / DT); i++) game.step(DT, readControls(input));
  return { before, after: game.score.destruction * 100 };
}

const landGrid = (step: number): { x: number; z: number }[] => {
  const pts: { x: number; z: number }[] = [];
  for (let x = -700; x <= 700; x += step) {
    for (let z = -700; z <= 700; z += step) {
      const s = index.surfaceAt(x, z);
      if (s !== 'water' && s !== 'outside' && index.buildingsNear(x, z, 4).every((b) => footprintDistance(b, x, z) > 2)) pts.push({ x, z });
    }
  }
  return pts;
};

describe('怒りのたまり方（怪獣ごと）', () => {
  it('式：段階の量 × 大きさの倍率 × 手柄（燃え広がりは fireFactor）× 怪獣の倍率', () => {
    expect(rageGain(4, 1, true, 1)).toBeCloseTo(RAGE.gainByStage[4]);
    expect(rageGain(3, 2, true, 1)).toBeCloseTo(RAGE.gainByStage[3] * 2);
    expect(rageGain(3, 1.5, false, 1)).toBeCloseTo(RAGE.gainByStage[3] * 1.5 * RAGE.fireFactor);
    expect(rageGain(2, 1, true, 1.8)).toBeCloseTo(RAGE.gainByStage[2] * 1.8);
    expect(rageGain(1, 0.5, false, 2)).toBeCloseTo(RAGE.gainByStage[1] * 0.5 * RAGE.fireFactor * 2);
  });

  it('大きさの倍率は (体積 / sizeRef)^sizeExponent を範囲に収める', () => {
    expect(rageSizeFactor(RAGE.sizeRef)).toBeCloseTo(1);
    expect(rageSizeFactor(RAGE.sizeRef * 2)).toBeCloseTo(2 ** RAGE.sizeExponent);
    expect(rageSizeFactor(1)).toBe(RAGE.sizeFactorRange[0]);
    expect(rageSizeFactor(1e9)).toBe(RAGE.sizeFactorRange[1]);
  });

  it('遊んでいる怪獣の倍率で点数の係がためる（1刻み進めると技の係が渡す）', () => {
    const b = city.buildings.find((x) => x.kind === 'tileMidrise') as Building;
    for (const id of CREATURE_IDS) {
      const game = new Game(city, index, undefined, id);
      game.start();
      game.step(DT, emptyControls());
      const scale = CREATURE_CONFIG[id].rage.gainScale;
      expect(game.score.rageScale, id).toBe(scale);
      const r0 = game.score.rage;
      game.score.onStage(b.id, 3, true, 'claw');
      expect(game.score.rage - r0, id).toBeCloseTo(rageGain(3, rageSizeFactor(b.volume), true, scale));
    }
  });

  it('怪獣を替えると、次の刻みから替えた怪獣の倍率になる', () => {
    const game = new Game(city, index, undefined, 'kurenai');
    game.setCreature('raiyoku');
    game.start();
    game.step(DT, emptyControls());
    expect(game.score.rageScale).toBe(CREATURE_CONFIG.raiyoku.rage.gainScale);
  });

  it('紅竜の倍率がいちばん大きい（炎の芯と爪は1回に1〜2棟しか段階を進めず、雷は跳ねて5棟を進める）', () => {
    const k = CREATURE_CONFIG.kurenai.rage.gainScale;
    expect(k).toBeGreaterThan(CREATURE_CONFIG.raiyoku.rage.gainScale);
    expect(k).toBeGreaterThan(CREATURE_CONFIG.homuratsuno.rage.gainScale);
  });

  it('大技で壊した分はたまらない（どの怪獣の倍率でも）', () => {
    const game = new Game(city, index, undefined, 'kurenai');
    game.start();
    game.step(DT, emptyControls());
    for (const cause of ['roar', 'rageDive', 'fissure'] as const) game.score.onStage(10, 3, true, cause);
    expect(game.score.rage).toBe(0);
  });
});

describe('大技の範囲と強さ', () => {
  it('咆哮の輪：半径の6割にある、耐久が中央値のタイルの中層は1回で崩れる', () => {
    const mids = city.buildings.filter((b) => b.kind === 'tileMidrise').sort((a, b) => buildingHp(a) - buildingHp(b));
    const b = mids[mids.length >> 1];
    const game = new Game(city, index, undefined, 'kurenai');
    game.start();
    const c = footprintCenter(b);
    const halfX = (b.footprint.x1 - b.footprint.x0) / 2;
    // 外形の東の縁から 0.6 × 半径 だけ離れた点で吠える
    const d = ROAR.ring.radius * 0.6;
    applyRing(game.world, game.clock, c.x + halfX + d, c.z, ROAR.ring, 'roar');
    for (let i = 0; i < Math.round(3 / DT); i++) game.advanceWorld(DT);
    expect(game.damage.stage[b.id]).toBeGreaterThanOrEqual(STAGE.collapse);
  });

  it('咆哮を街なかで使うと、3秒で破壊率が1.5%以上伸びる（体験の採点 r05 は1回で +1.0〜1.2%）', () => {
    const game = new Game(city, index, undefined, 'kurenai');
    const input = new InputState();
    game.start();
    standAt(game, -150, -20, 90 * DEG);
    const { before, after } = releaseSpecial(game, input, 3);
    expect(game.bus.count('dragon.roar')).toBe(1);
    expect(after - before).toBeGreaterThanOrEqual(1.5);
  });

  it('咆哮の炎：輪の外側（from〜to m）の近い数棟に火が付き、まわりで燃えている建物からは隣へ燃え移る', () => {
    const game = new Game(city, index, undefined, 'kurenai');
    const input = new InputState();
    game.start();
    standAt(game, -150, -20, 90 * DEG);
    // 吠える前に、近くの建物を1棟燃やしておく（咆哮の熱で燃え移る燃えやすさの隣を持つ建物）
    const catches = (id: number): boolean => BUILDING_RULES[city.buildings[id].kind].flammability * ROAR.fan.heat >= 1;
    const burning = index
      .buildingsNear(-150, -20, 60)
      .filter((b) => game.fire.neighborsOf(b.id).some((n) => catches(n.id)))
      .sort((p, q) => p.id - q.id)[0];
    expect(burning).toBeDefined();
    game.ignite(burning.id, 10);
    const ignites: { id: number; from: number | null }[] = [];
    game.bus.on('fire.ignite', (e) => ignites.push({ id: e.id, from: null }));
    game.bus.on('fire.spread', (e) => ignites.push({ id: e.id, from: e.from }));
    releaseSpecial(game, input, ROAR.windup + 0.1);
    const rim = ignites.filter((e) => e.from === null).map((e) => city.buildings[e.id]);
    expect(rim.length).toBe(ROAR.rim.count);
    for (const b of rim) {
      const d = footprintDistance(b, game.body.pos.x, game.body.pos.z);
      expect(d).toBeGreaterThanOrEqual(ROAR.rim.from - 1e-6);
      expect(d).toBeLessThanOrEqual(ROAR.rim.to + 1e-6);
    }
    expect(ignites.some((e) => e.from === burning.id)).toBe(true);
  });

  it('落雷の輪の1本は、落ちる点のまわり seekRadius の中でいちばん高い立っている建物の真上に落ちる', () => {
    const spec = thunderSpec();
    expect(spec.seekRadius).toBeGreaterThan(0);
    const game = new Game(city, index, undefined, 'raiyoku');
    game.start();
    const bolts: [number, number, number][] = [];
    game.bus.on('lightning.bolt', (e) => bolts.push(e.pos));
    const cx = -150;
    const cz = -20;
    game.combat.techniques.thunderRing(game.clock, cx, cz, game.groundAt(cx, cz), spec, 'roar', 'raiyoku');
    for (let i = 0; i < 60; i++) game.advanceWorld(DT);
    expect(bolts.length).toBe(spec.count);
    // 1本目は、まだ何も崩れていないので、輪の上の点のまわりでいちばん高い建物に落ちる
    const a = 0.35;
    const px = cx + Math.cos(a) * spec.ringRadius;
    const pz = cz + Math.sin(a) * spec.ringRadius;
    const near = index.buildingsNear(px, pz, spec.seekRadius).filter((b) => footprintDistance(b, px, pz) <= spec.seekRadius);
    const tallest = near.sort((p, q) => q.height - p.height || p.id - q.id)[0];
    expect(tallest).toBeDefined();
    const c = footprintCenter(tallest);
    expect(bolts[0][0]).toBeCloseTo(c.x);
    expect(bolts[0][2]).toBeCloseTo(c.z);
    expect(bolts[0][1]).toBeCloseTo(tallest.height);
  });
});

describe('地割れ（焔角の E）', () => {
  it('E を押した瞬間の照準のまわりへ走り、溜めの間に体も照準へ向き直る（尾で背を向けた直後でも）', () => {
    const spec = fissureSpec();
    const game = new Game(city, index, undefined, 'homuratsuno');
    const input = new InputState();
    game.start();
    // 体は東（+x）を向き、照準は西（体の真後ろ）
    standAt(game, -150, -20, 90 * DEG);
    game.view.yaw = -90 * DEG;
    game.step(DT, readControls(input));
    let dir: [number, number, number] | null = null;
    game.bus.on('fissure.start', (e) => (dir = e.dir));
    releaseSpecial(game, input, spec.windup + 0.2);
    expect(dir).not.toBeNull();
    const d = dir as unknown as [number, number, number];
    const toAim = Math.atan2(game.aimPoint.x - game.body.pos.x, game.aimPoint.z - game.body.pos.z);
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(d[0], d[2]) - toAim), Math.cos(Math.atan2(d[0], d[2]) - toAim)));
    expect(off / DEG).toBeLessThanOrEqual(spec.seek.searchDeg + 1e-6);
    expect(Math.abs(Math.atan2(Math.sin(game.body.yaw - toAim), Math.cos(game.body.yaw - toAim))) / DEG).toBeLessThan(3);
  });

  it('照準のまわりに建物が無い（湾を向いた）ときは、届く範囲の建物の側へ向け直して裂く', () => {
    const spec = fissureSpec();
    const x = city.coast.coastX + 40;
    const z = -20;
    const game = new Game(city, index, undefined, 'homuratsuno');
    game.start();
    const hits: number[] = [];
    let dir: [number, number, number] | null = null;
    game.bus.on('fissure.crack', (e) => hits.push(e.hits));
    game.bus.on('fissure.start', (e) => (dir = e.dir));
    // 照準は西（-90°）＝湾の側。湾（x < coastX）へは走らず、陸の側（東寄り）へ向け直す
    game.combat.techniques.fissure(game.clock, vec3(x, game.groundAt(x, z), z), -90 * DEG, spec, game.world, 'homuratsuno');
    for (let i = 0; i < 180; i++) game.advanceWorld(DT);
    expect((dir as unknown as [number, number, number])[0]).toBeGreaterThan(0);
    expect(hits.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const t = game.damage.tally();
    expect(t.tilted + t.collapsing + t.collapsed).toBeGreaterThan(0);
  });

  it('湾の水の上と街の外では止まる（向きを選ばないとき、湾へ向けた道筋は裂け目の数より短い）', () => {
    const spec = fissureSpec();
    const straight: FissureSpec = { ...spec, seek: { ...spec.seek, stepDeg: 0 } };
    const x = city.coast.coastX + 40;
    const path = fissurePath({ x, z: -20 }, -90 * DEG, straight, { index, isStanding: () => true, remaining: () => 1 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.length).toBeLessThan(spec.segments);
    for (const p of path) expect(['water', 'outside']).not.toContain(index.surfaceAt(p.x, p.z));
  });

  it('街のどこで使っても空振らない：陸の上の格子の点から照準を4方向へ向けて使うと、どれも3秒で1棟以上が傾くか崩れる', () => {
    const spec = fissureSpec();
    const pts = landGrid(150);
    expect(pts.length).toBeGreaterThan(20);
    const misses: string[] = [];
    for (const p of pts) {
      for (const deg of [0, 90, 180, 270]) {
        const game = new Game(city, index, undefined, 'homuratsuno');
        const y = game.groundAt(p.x, p.z);
        game.combat.techniques.fissure(game.clock, vec3(p.x, y, p.z), deg * DEG, spec, game.world, 'homuratsuno');
        for (let i = 0; i < Math.round(3 / DT); i++) game.advanceWorld(DT);
        const t = game.damage.tally();
        if (t.tilted + t.collapsing + t.collapsed === 0) misses.push(`(${p.x},${p.z}) ${deg}°`);
      }
    }
    expect(misses).toEqual([]);
  });
});
