// OWNER: tests
// 燃え広がりの規則：熱が 1 を超えると着火し、隣（隙間 neighborGap 以内）へ時間で燃え移り、車道の向こうへは移らない。
// 燃料が尽きると消え、焦げが残る。崩れた建物は燃え続けない。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { BUILDING_RULES, FIRE } from '../../src/config/gameplay';
import { DamageState, STAGE, type StageChange } from '../../src/gameplay/damage';
import { FireState, type Ignition } from '../../src/gameplay/fire';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);

function setup() {
  return { damage: new DamageState(city), fire: new FireState(city, index), ignitions: [] as Ignition[], changes: [] as StageChange[] };
}

function run(s: ReturnType<typeof setup>, seconds: number, dt = 0.1): void {
  for (let t = 0; t < seconds; t += dt) {
    s.fire.update(dt, s.damage, s.ignitions);
    s.damage.update(dt, s.changes);
  }
}

// 隙間のいちばん小さい住宅の組と、周りに燃え移り先が無い建物
const houses = city.buildings.filter((b) => b.kind === 'house');
const probe = new FireState(city, index);
const pair = houses
  .flatMap((b) => probe.neighborsOf(b.id).filter((n) => city.buildings[n.id].kind === 'house').map((n) => ({ b, n })))
  .sort((p, q) => p.n.gap - q.n.gap || p.b.id - q.b.id)[0];
const isolated = city.buildings.find((b) => probe.neighborsOf(b.id).length === 0 && b.kind !== 'glassTower')!;

describe('着火', () => {
  it('熱が 1 に届くまでは燃えず、届いた瞬間に1回だけ着火する', () => {
    const s = setup();
    const id = pair.b.id;
    const flam = BUILDING_RULES.house.flammability;
    s.fire.addHeat(id, 0.99 / flam, 3, s.damage, s.ignitions);
    expect(s.fire.burning.has(id)).toBe(false);
    s.fire.addHeat(id, 0.02 / flam, 3, s.damage, s.ignitions);
    s.fire.addHeat(id, 1, 3, s.damage, s.ignitions);
    expect(s.fire.burning.has(id)).toBe(true);
    expect(s.ignitions).toHaveLength(1);
    expect(s.ignitions[0]).toMatchObject({ id, from: null });
    expect(s.fire.burn[id]).toBeCloseTo(FIRE.igniteBurn, 6);
  });
});

describe('燃え広がり', () => {
  it('隙間の小さい隣の住宅へ、決まった時間のうちに燃え移る（同じ条件なら同じ時刻）', () => {
    const times: number[] = [];
    for (let k = 0; k < 2; k++) {
      const s = setup();
      s.fire.addHeat(pair.b.id, 5, 3, s.damage, s.ignitions);
      let t = 0;
      while (t < 60 && !s.fire.burning.has(pair.n.id)) {
        run(s, 0.1);
        t += 0.1;
      }
      times.push(t);
      const spread = s.ignitions.find((i) => i.id === pair.n.id);
      expect(spread?.from).not.toBeNull();
    }
    expect(times[0]).toBeLessThan(40);
    expect(times[0]).toBeGreaterThan(3);
    expect(times[1]).toBe(times[0]);
  });

  it('隙間が neighborGap より広い建物（車道の向こう）へは燃え移らない', () => {
    const s = setup();
    s.fire.addHeat(isolated.id, 5, 5, s.damage, s.ignitions);
    run(s, 120, 0.25);
    const others = s.ignitions.filter((i) => i.id !== isolated.id);
    expect(others).toEqual([]);
    for (const n of probe.neighborsOf(pair.b.id)) expect(n.gap).toBeLessThanOrEqual(FIRE.neighborGap);
  });

  it('燃料が尽きると消え、焦げが残る', () => {
    const s = setup();
    const id = isolated.id;
    s.fire.addHeat(id, 5, 5, s.damage, s.ignitions);
    run(s, BUILDING_RULES[isolated.kind].fuelSeconds * 2 + 30, 0.25);
    expect(s.fire.burning.has(id)).toBe(false);
    expect(s.fire.burn[id]).toBe(0);
    expect(s.damage.char[id]).toBeGreaterThan(0.5);
  });

  it('燃えている間、炎は当たった高さから上へ広がる', () => {
    const s = setup();
    const tall = city.buildings.find((b) => b.height > 40 && probe.neighborsOf(b.id).length === 0) ?? city.buildings.find((b) => b.height > 40)!;
    s.fire.addHeat(tall.id, 5, 10, s.damage, s.ignitions);
    const high0 = s.fire.fireHigh[tall.id];
    run(s, 8);
    expect(s.fire.fireHigh[tall.id]).toBeGreaterThan(high0 + 3);
    expect(s.fire.fireHigh[tall.id]).toBeLessThanOrEqual(tall.height);
  });

  it('崩れた建物は燃え続けない', () => {
    const s = setup();
    const id = pair.b.id;
    s.fire.addHeat(id, 5, 3, s.damage, s.ignitions);
    s.damage.hit(id, s.damage.hp[id] * 5, { cause: 'claw', fromX: 0, fromZ: 0, y: 3, player: true });
    run(s, 15);
    expect(s.damage.stage[id]).toBeGreaterThanOrEqual(STAGE.collapse);
    expect(s.fire.burning.has(id)).toBe(false);
  });

  it('やり直しで火は全部消え、燃料が戻る', () => {
    const s = setup();
    s.fire.addHeat(pair.b.id, 5, 3, s.damage, s.ignitions);
    run(s, 20);
    s.fire.reset();
    expect(s.fire.burning.size).toBe(0);
    expect(Math.max(...s.fire.burn, ...s.fire.heat)).toBe(0);
    expect(s.fire.fuel[pair.b.id]).toBe(BUILDING_RULES.house.fuelSeconds);
  });
});
