// OWNER: tests
// 通りの暮らしの配置（r01-city）：決定性、車は車道か駐車場に左側通行で、人と小物は歩ける所に置かれ、
// 壊れかけた建物と竜のまわりの人は避難して見えなくなる（人が傷つく描写を出さない規則）。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { EVACUATION } from '../../src/config/streetLife';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import { FURNITURE_KINDS, buildingDanger, evacuationZones, generateStreetLife, inDanger, isEvacuated } from '../../src/world/streetLife';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const life = generateStreetLife(city, index);

describe('通りの暮らしの配置', () => {
  it('同じ街からは同じ配置になり、種が違えば変わる（決定性）', () => {
    expect(JSON.stringify(generateStreetLife(generateCity(CITY_CONFIG)))).toBe(JSON.stringify(life));
    const other = generateStreetLife(generateCity({ ...CITY_CONFIG, seed: CITY_CONFIG.seed + 1 }));
    expect(JSON.stringify(other.cars.slice(0, 50))).not.toBe(JSON.stringify(life.cars.slice(0, 50)));
  });

  it('車・人・小物が十分な数あり、小物は全種類ある', () => {
    expect(life.cars.length).toBeGreaterThan(400);
    expect(life.people.length).toBeGreaterThan(800);
    for (const kind of FURNITURE_KINDS) expect(life.furniture.some((f) => f.kind === kind), kind).toBe(true);
    const states = new Set(life.cars.map((c) => c.state));
    expect([...states].sort()).toEqual(['moving', 'parked', 'queue']);
    const groups = new Set(life.people.map((p) => p.group));
    for (const g of ['shop', 'crossing', 'walk', 'promenade', 'busStop', 'park']) expect(groups.has(g as never), g).toBe(true);
  });

  it('車は車道・交差点・駐車場にあり、建物に掛からない', () => {
    // 街の縁の道は車道の半分が街の範囲の外に出るので、面の種類ではなく車道の矩形で確かめる
    const inRect = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    for (const c of life.cars) {
      const onRoad = city.segments.some((s) => inRect(s.rect, c.x, c.z)) || city.intersections.some((i) => inRect(i.rect, c.x, c.z));
      const inLot = city.lots.some((l) => !l.buildable && inRect(l.rect, c.x, c.z));
      expect(onRoad || inLot, `car at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`).toBe(true);
      expect(index.buildingAt(c.x, c.z)).toBeNull();
    }
  });

  it('走る車と信号待ちの車は左側通行（南北の道の西側は北行き、東西の道の南側は西行き）', () => {
    const ns = city.roadLines.filter((l) => l.axis === 'ns' && l.cls !== 'lane');
    let checked = 0;
    for (const c of life.cars) {
      if (c.state === 'parked') continue;
      const line = ns.find((l) => Math.abs(c.x - l.pos) < l.carriageWidth / 2 && index.surfaceAt(c.x, c.z) === 'road');
      if (!line) continue;
      const west = c.x < line.pos;
      // 北行きは -z を向く（yaw = π）
      expect(Math.abs(Math.cos(c.yaw) - (west ? -1 : 1)), `car at ${c.x.toFixed(1)}`).toBeLessThan(1e-6);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('人と小物は歩ける所（歩道・区画・遊歩道）にいて、車道と建物の中にはいない', () => {
    for (const p of [...life.people, ...life.furniture]) {
      expect(['sidewalk', 'lot', 'promenade', 'pier'], `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toContain(index.surfaceAt(p.x, p.z));
      expect(index.buildingAt(p.x, p.z)).toBeNull();
    }
  });
});

describe('避難の規則', () => {
  // 壊れかけた建物：5棟に1棟と、都心の大通りの交差点のまわり（撮影の構図の場所）
  const cross = index.intersectionNear(-150, 0, (_ix, ns, ew) => ns.cls === 'avenue' && ew.cls === 'avenue');
  const cx = city.roadLines[cross.nsLineId].pos;
  const cz = city.roadLines[cross.ewLineId].pos;
  const near = new Set(index.buildingsNear(cx, cz, 120).map((b) => b.id));
  const breaking = (id: number): boolean => id % 5 === 0 || near.has(id);

  it('壊れかけた建物の近くにいる人は見えなくなり、見えている人は誰も危ない範囲にいない', () => {
    const zones = evacuationZones(city, breaking);
    const visible = life.people.filter((p) => !isEvacuated(p, zones));
    const hidden = life.people.length - visible.length;
    expect(hidden).toBeGreaterThan(50);
    for (const b of city.buildings) {
      if (!breaking(b.id)) continue;
      const zone = buildingDanger(b);
      for (const p of visible) expect(inDanger(p.x, p.z, zone), `person near building ${b.id}`).toBe(false);
    }
    // 危ない範囲は建物の高さに比例して広い（高いビルほど遠くまで避難する）
    const tall = city.buildings.reduce((a, b) => (b.height > a.height ? b : a));
    expect(buildingDanger(tall).r).toBeCloseTo(EVACUATION.base + EVACUATION.perHeight * tall.height, 6);
  });

  it('壊れていなければ誰も消えない。竜のまわりの人は消える', () => {
    expect(life.people.filter((p) => isEvacuated(p, evacuationZones(city, () => false))).length).toBe(0);
    const zones = evacuationZones(city, () => false, { x: cx, z: cz });
    const visible = life.people.filter((p) => !isEvacuated(p, zones));
    expect(visible.length).toBeLessThan(life.people.length);
    for (const p of visible) expect(Math.hypot(p.x - cx, p.z - cz)).toBeGreaterThan(EVACUATION.dragonRadius);
  });
});
