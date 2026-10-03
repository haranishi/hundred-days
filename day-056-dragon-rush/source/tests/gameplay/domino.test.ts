// OWNER: tests
// 焔角のドミノ（r04-roster2、gameplay/domino.ts）：渡す向き・弱くなり方・3棟の上限・原因と怪獣の限定・決定性。
// 1列に並べた作りの街（同じ大きさの箱を東西に 3m おき）で規則を確かめ、最後に本物の街と遊びの本体で、焔角だけに起きることを確かめる。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { CREATURE_CONFIG } from '../../src/config/creatures';
import { DOMINO } from '../../src/config/creatures/homuratsuno';
import type { DominoSpec } from '../../src/config/creatures/types';
import { STAGES } from '../../src/config/gameplay';
import type { DamageCause } from '../../src/core/events';
import { DamageState, STAGE, type StageChange } from '../../src/gameplay/damage';
import { Domino, dominoReach, dominoTarget, passStrength, type BuildingQuery } from '../../src/gameplay/domino';
import { Game } from '../../src/gameplay/game';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import type { Building, CityData } from '../../src/world/types';

const DT = 1 / 60;

/** 箱1つの建物（中層のタイル張り。外形 x0..x1 × z0..z1、高さ h）。 */
function box(id: number, x0: number, z0: number, x1: number, z1: number, h: number): Building {
  const rect = { x0, z0, x1, z1 };
  const facade = { floorHeight: 3.5, bayWidth: 4, windowWidth: 0.5, windowHeight: 0.5, groundFloor: 4.5, trimColor: [0.5, 0.5, 0.5], glassColor: [0.2, 0.3, 0.4] } as Building['facade'];
  return {
    id,
    lotId: id,
    blockId: 0,
    kind: 'tileMidrise',
    footprint: rect,
    height: h,
    floors: Math.round(h / 3.5),
    masses: [{ rect, y0: 0, y1: h, facade: 'punched', wallColor: [0.6, 0.6, 0.6] }],
    roof: { kind: 'flat', pitchHeight: 0, ridgeAxis: 'x', parapet: 1, overhang: 0, color: [0.3, 0.3, 0.3], items: [] },
    facade,
    volume: (x1 - x0) * (z1 - z0) * h,
    seed: 0.5,
    variant: { palette: 0, facade: 0, roof: 0 },
    signature: String(id),
  };
}

/** 東へ n 棟（幅 20m・奥行き 20m・隙間 gap）。heights で高さを棟ごとに変えられる。北にも1棟（倒れる向きの外）。 */
function row(n: number, gap = 3, heights: number[] = []): Building[] {
  const out: Building[] = [];
  for (let i = 0; i < n; i++) out.push(box(i, i * (20 + gap), 0, i * (20 + gap) + 20, 20, heights[i] ?? 30));
  out.push(box(n, 0, -40, 20, -20, 30));
  return out;
}

function world(buildings: Building[]): { damage: DamageState; query: BuildingQuery } {
  const damage = new DamageState({ buildings } as unknown as CityData);
  const query: BuildingQuery = {
    buildingsNear: (x, z, r) =>
      buildings.filter((b) => {
        const f = b.footprint;
        return Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1)) <= r;
      }),
  };
  return { damage, query };
}

/** 西から原因 cause で建物 0 を傾きまで壊し（東へ倒れる）、seconds 秒進める。domino の update・damage.update・onChanges の順（遊びと同じ）。 */
function topple(buildings: Building[], spec: DominoSpec | null, cause: DamageCause, seconds = 8, fraction = STAGES.thresholds[2] + 0.03): { damage: DamageState; domino: Domino; changes: StageChange[] } {
  const { damage, query } = world(buildings);
  const domino = new Domino(spec);
  damage.hit(0, damage.hp[0] * fraction, { cause, fromX: -40, fromZ: 10, y: 12, player: true });
  const all: StageChange[] = [];
  let t = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    t += DT;
    const changes: StageChange[] = [];
    domino.update(t, damage, query);
    damage.update(DT, changes);
    domino.onChanges(t, changes);
    all.push(...changes);
  }
  return { damage, domino, changes: all };
}

describe('ドミノの規則（1列の作りの街）', () => {
  it('倒れる向き（東）の、自分の幅の帯に入るいちばん手前のビルへ渡す。後ろ（西）と横（北）は巻き込まない', () => {
    // 番号は配列の位置と同じ（0〜2 が東へ1列、3 が北、4 が西）
    const b = row(3);
    const west = box(b.length, -23, 0, -3, 20, 30);
    const all = [...b, west];
    const { damage } = topple(all, DOMINO, 'charge', 1.5);
    expect(damage.dirX[0]).toBeGreaterThan(0.99);
    expect(damage.damage[1]).toBeGreaterThan(0);
    expect(damage.damage[4]).toBe(0);
    expect(damage.damage[3]).toBe(0);
    // 渡されたビルは、同じ向き（東）へ倒れる
    expect(damage.dirX[1]).toBeGreaterThan(0.99);
    // 選ぶ規則そのもの：東へ倒れるなら 1、西へ倒れるなら西の 4、北へ倒れるなら北の 3
    const none = (): boolean => false;
    expect(dominoTarget(all[0], 1, 0, all, 18, 2, none)?.id).toBe(1);
    expect(dominoTarget(all[0], -1, 0, all, 18, 2, none)?.id).toBe(4);
    expect(dominoTarget(all[0], 0, -1, all, 30, 2, none)?.id).toBe(3);
  });

  it('届く隙間は倒れるビルの高さで決まる（高さ 10m は 6m まで、30m は 18m まで）。帯と重なりが足りない隣は巻き込まない', () => {
    expect(dominoReach(DOMINO, 10)).toBeCloseTo(6, 6);
    expect(dominoReach(DOMINO, 30)).toBeCloseTo(18, 6);
    expect(dominoReach(DOMINO, 200)).toBe(DOMINO.maxReach);
    const low = row(2, 8, [10, 10]);
    expect(dominoTarget(low[0], 1, 0, low, dominoReach(DOMINO, 10), 2, () => false)).toBeNull();
    const high = row(2, 8, [30, 30]);
    expect(dominoTarget(high[0], 1, 0, high, dominoReach(DOMINO, 30), 2, () => false)?.id).toBe(1);
    // 南へ 19m ずらした隣：帯（z 0..20）との重なりは 1m で、minOverlap 2m に足りない
    const shifted = [box(0, 0, 0, 20, 20, 30), box(1, 23, 19, 43, 39, 30)];
    expect(dominoTarget(shifted[0], 1, 0, shifted, 18, 2, () => false)).toBeNull();
  });

  it('渡すたびに falloff 倍に弱くなり、1回の起点から3棟で止まる（4棟目から先は無傷）', () => {
    const { damage, domino } = topple(row(6), DOMINO, 'charge');
    const got = [1, 2, 3].map((id) => damage.damage[id] / damage.hp[id]);
    expect(got[0]).toBeCloseTo(passStrength(DOMINO, 1), 6);
    expect(got[1]).toBeCloseTo(passStrength(DOMINO, 2), 6);
    expect(got[2]).toBeCloseTo(passStrength(DOMINO, 3), 6);
    expect(got[1] / got[0]).toBeCloseTo(DOMINO.falloff, 6);
    expect(damage.damage[4]).toBe(0);
    expect(damage.damage[5]).toBe(0);
    // 1棟目は崩落まで、2・3棟目は傾きまで（同じ高さの無傷のビル）
    expect(damage.stage[1]).toBeGreaterThanOrEqual(STAGE.collapse);
    expect(damage.stage[2]).toBe(STAGE.tilt);
    expect(damage.stage[3]).toBe(STAGE.tilt);
    expect(domino.stats).toMatchObject({ dominoOrigins: 1, dominoPasses: 3, dominoMaxChain: 3, dominoTilts: 3, dominoCollapses: 1 });
  });

  it('自分より高いビルには高さの比でしか効かない（高さ 15m が 60m を押しても、傾きまで届かない）', () => {
    const { damage } = topple(row(2, 3, [15, 60]), DOMINO, 'charge', 3);
    expect(damage.damage[1] / damage.hp[1]).toBeCloseTo(passStrength(DOMINO, 1) * (15 / 60), 6);
    expect(damage.stage[1]).toBeLessThan(STAGE.tilt);
  });

  it('起点は突進・のしかかり・地割れだけ。ほかの原因と、ドミノを持たない怪獣では起こさない', () => {
    for (const cause of ['charge', 'slam', 'fissure'] as const) {
      expect(topple(row(4), DOMINO, cause).domino.stats.dominoPasses, cause).toBe(3);
    }
    for (const cause of ['claw', 'tail', 'breath', 'lava', 'lightning', 'roar', 'rageDive', 'dive', 'bump', 'trample'] as const) {
      const r = topple(row(3), DOMINO, cause);
      expect(r.domino.stats.dominoPasses, cause).toBe(0);
      expect(r.damage.damage[1], cause).toBe(0);
    }
    expect(CREATURE_CONFIG.kurenai.moves.domino).toBeNull();
    expect(CREATURE_CONFIG.raiyoku.moves.domino).toBeNull();
    expect(CREATURE_CONFIG.homuratsuno.moves.domino).toBe(DOMINO);
    const none = topple(row(3), CREATURE_CONFIG.raiyoku.moves.domino, 'charge');
    expect(none.domino.stats.dominoPasses).toBe(0);
    expect(none.damage.damage[1]).toBe(0);
  });

  it('同じ起点なら、何度流しても同じ結果（渡した量・段階・数え）', () => {
    const a = topple(row(6), DOMINO, 'slam', 8, 1.02);
    const b = topple(row(6), DOMINO, 'slam', 8, 1.02);
    expect(Array.from(b.damage.damage)).toEqual(Array.from(a.damage.damage));
    expect(Array.from(b.damage.stage)).toEqual(Array.from(a.damage.stage));
    expect(b.domino.stats).toEqual(a.domino.stats);
    expect(b.changes.map((c) => [c.id, c.stage, c.cause])).toEqual(a.changes.map((c) => [c.id, c.stage, c.cause]));
  });
});

describe('遊びの本体では焔角だけに起きる（本物の街）', () => {
  const city = generateCity(CITY_CONFIG);
  const index = new CityIndex(city);
  // 東隣（倒れる向き）に同じ街区のビルがある中層を1つ選ぶ
  const origin = city.buildings.find((b) => {
    if (b.kind !== 'tileMidrise' || b.height < 20) return false;
    const near = index.buildingsNear((b.footprint.x0 + b.footprint.x1) / 2, (b.footprint.z0 + b.footprint.z1) / 2, 60).sort((p, q) => p.id - q.id);
    return dominoTarget(b, 1, 0, near, dominoReach(DOMINO, b.height), DOMINO.minOverlap, () => false) !== null;
  })!;

  function shove(id: 'kurenai' | 'homuratsuno'): Game {
    const game = new Game(city, index, undefined, id);
    const f = origin.footprint;
    game.damage.hit(origin.id, game.damage.hp[origin.id] * (STAGES.thresholds[2] + 0.03), { cause: 'charge', fromX: f.x0 - 30, fromZ: (f.z0 + f.z1) / 2, y: 10, player: true });
    for (let i = 0; i < 6 / DT; i++) game.advanceWorld(DT);
    return game;
  }

  it('突進で押し倒したビルが東隣を巻き込む（焔角）。紅竜では同じ損傷でも隣は無傷', () => {
    const homura = shove('homuratsuno');
    const kurenai = shove('kurenai');
    expect(homura.stats.dominoPasses).toBeGreaterThan(0);
    expect(homura.stats.dominoTilts).toBeGreaterThan(0);
    expect(kurenai.stats.dominoPasses).toBe(0);
    expect(kurenai.stats.dominoTilts).toBe(0);
    expect(homura.damage.tally().tilted + homura.damage.tally().collapsing + homura.damage.tally().collapsed).toBeGreaterThan(
      kurenai.damage.tally().tilted + kurenai.damage.tally().collapsing + kurenai.damage.tally().collapsed,
    );
  });
});
