// OWNER: tests
// 街の純データのテスト。決定性・隣の組み合わせ・体積・道と建物の重なりを確かめる。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, type CityConfig } from '../../src/config/city';
import { generateCity } from '../../src/world/city';
import { roofVolume } from '../../src/world/buildingLook';
import { depth, overlaps, touches, width } from '../../src/world/geom';
import { CityIndex } from '../../src/world/query';
import { BUILDING_KINDS, type CityData } from '../../src/world/types';

const base = generateCity(CITY_CONFIG);
const withSeed = (seed: number): CityConfig => ({ ...CITY_CONFIG, seed });

describe('街の生成の決定性', () => {
  it('同じ設定なら同じ街になる', () => {
    const again = generateCity(CITY_CONFIG);
    expect(JSON.stringify(again)).toBe(JSON.stringify(base));
  });

  it('種が違えば建物の並びが変わる', () => {
    const other = generateCity(withSeed(CITY_CONFIG.seed + 1));
    const a = base.buildings.map((b) => b.signature).join('|');
    const b = other.buildings.map((b) => b.signature).join('|');
    expect(a).not.toBe(b);
  });

  it('見た目だけの設定（屋上の色見本）を変えても、地割りと建物の形は変わらない（乱数の系列が機能ごとに分かれている）', () => {
    const tweaked = generateCity({
      ...CITY_CONFIG,
      palettes: { ...CITY_CONFIG.palettes, flatRoof: [0x111111, 0x222222, 0x333333] },
    });
    expect(tweaked.buildings.length).toBe(base.buildings.length);
    const shape = (c: CityData): string =>
      JSON.stringify(c.buildings.map((b) => [b.kind, b.masses.map((m) => [m.rect, m.y0, m.y1])]));
    expect(shape(tweaked)).toBe(shape(base));
    // 色見本は実際に効いている（変化しないテストではない）
    expect(tweaked.buildings.map((b) => b.roof.color.join()).join()).not.toBe(base.buildings.map((b) => b.roof.color.join()).join());
  });
});

describe('街の形', () => {
  it('約1.5km四方で、西側が湾になっている', () => {
    expect(width(base.bounds)).toBeCloseTo(1500, 0);
    expect(depth(base.bounds)).toBeCloseTo(1500, 0);
    const index = new CityIndex(base);
    expect(index.surfaceAt(-740, 0)).toBe('water');
    expect(index.surfaceAt(-600, 300)).not.toBe('outside');
    expect(['lot', 'sidewalk', 'road', 'intersection']).toContain(index.surfaceAt(600, 0));
  });

  it('車道・歩道・交差点・横断歩道のデータがある', () => {
    expect(base.segments.length).toBeGreaterThan(100);
    expect(base.intersections.length).toBeGreaterThan(50);
    expect(base.roadLines.some((l) => l.cls === 'avenue')).toBe(true);
    const withSidewalk = base.blocks.filter((b) => !b.isPier && Math.min(b.sidewalk.n, b.sidewalk.s, b.sidewalk.e, b.sidewalk.w) > 0);
    expect(withSidewalk.length).toBeGreaterThan(base.blocks.length * 0.5);
    expect(base.intersections.some((ix) => ix.crosswalks.n && ix.crosswalks.e)).toBe(true);
  });

  it('建物の種類が5種以上あり、どれも1棟以上ある', () => {
    const present = BUILDING_KINDS.filter((k) => base.stats.countByKind[k] > 0);
    expect(present.length).toBeGreaterThanOrEqual(5);
  });

  it('建物は1棟ずつ id・体積・種類を持ち、id は通し番号', () => {
    base.buildings.forEach((b, i) => {
      expect(b.id).toBe(i);
      expect(b.volume).toBeGreaterThan(0);
      expect(BUILDING_KINDS).toContain(b.kind);
      expect(base.lots[b.lotId].buildingId).toBe(b.id);
    });
  });

  it('建物は道（車道・交差点）に掛からず、湾の上にも建たない', () => {
    const index = new CityIndex(base);
    const roads = [...base.segments.map((s) => s.rect), ...base.intersections.map((i) => i.rect)];
    for (const b of base.buildings) {
      for (const m of b.masses) {
        for (const r of roads) expect(overlaps(m.rect, r), `building ${b.id}`).toBe(false);
        const cx = (m.rect.x0 + m.rect.x1) / 2;
        const cz = (m.rect.z0 + m.rect.z1) / 2;
        expect(['lot', 'pier'], `building ${b.id} center`).toContain(index.surfaceAt(cx, cz));
      }
    }
  });

  it('建物どうしが重ならない', () => {
    const rects = base.buildings.map((b) => b.footprint);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlaps(rects[i], rects[j])) throw new Error(`buildings ${i} and ${j} overlap`);
      }
    }
  });

  it('種類ごとの高さが実寸の範囲に収まる（10〜150m 級の街）', () => {
    const range = { glassTower: [60, 152], tileMidrise: [18, 55], zakkyo: [12, 36], apartment: [14, 46], house: [6, 13], warehouse: [9, 23] } as const;
    for (const b of base.buildings) {
      const [lo, hi] = range[b.kind];
      expect(b.height, `${b.kind} ${b.id}`).toBeGreaterThanOrEqual(lo);
      expect(b.height, `${b.kind} ${b.id}`).toBeLessThanOrEqual(hi);
    }
  });

  it('同じ種類の中でも高さ・幅・色・窓割りに個体差がある', () => {
    for (const kind of BUILDING_KINDS) {
      const list = base.buildings.filter((b) => b.kind === kind);
      if (list.length < 5) continue;
      const distinct = (f: (b: (typeof list)[number]) => string): number => new Set(list.map(f)).size;
      expect(distinct((b) => b.height.toFixed(1)), kind).toBeGreaterThan(Math.min(5, list.length / 2));
      expect(distinct((b) => width(b.footprint).toFixed(1)), kind).toBeGreaterThan(Math.min(5, list.length / 2));
      expect(distinct((b) => b.masses[0].wallColor.map((c) => c.toFixed(3)).join()), kind).toBeGreaterThan(Math.min(5, list.length / 2));
      expect(distinct((b) => b.facade.bayWidth.toFixed(2)), kind).toBeGreaterThan(Math.min(3, list.length / 3));
    }
  });
});

describe('隣に同じ組み合わせを置かない', () => {
  // テストの側で隣り合いを総当たりで数え直す（生成側の判定をそのまま信じない）
  const lotsWithBuilding = base.lots.filter((l) => l.buildingId !== null);
  const pairs: [number, number][] = [];
  for (let i = 0; i < lotsWithBuilding.length; i++) {
    for (let j = i + 1; j < lotsWithBuilding.length; j++) {
      if (touches(lotsWithBuilding[i].rect, lotsWithBuilding[j].rect, 1, 2)) {
        pairs.push([lotsWithBuilding[i].buildingId!, lotsWithBuilding[j].buildingId!]);
      }
    }
  }

  it('隣り合う組が十分な数ある（判定が空振りしていない）', () => {
    expect(pairs.length).toBeGreaterThan(base.buildings.length * 0.6);
    expect(base.neighborPairs.length).toBe(pairs.length);
  });

  it('どの隣どうしも、種類・色見本・窓割り・屋根の組み合わせが違う', () => {
    const same = pairs.filter(([a, b]) => base.buildings[a].signature === base.buildings[b].signature);
    expect(same).toEqual([]);
  });

  it('別の種でも成り立つ', () => {
    for (const seed of [1, 7, 12345]) {
      const city = generateCity(withSeed(seed));
      const same = city.neighborPairs.filter(([a, b]) => city.buildings[a].signature === city.buildings[b].signature);
      expect(same, `seed ${seed}`).toEqual([]);
    }
  });

  // r01-city：判定を強めた（採点 r00a の改善5位「空から見た街の同じを減らす」）
  it('接して並ぶ同じ種類の建物は、色見本も違う', () => {
    const samePalette = pairs.filter(([a, b]) => {
      const A = base.buildings[a];
      const B = base.buildings[b];
      return A.kind === B.kind && A.variant.palette === B.variant.palette;
    });
    expect(samePalette).toEqual([]);
  });

  it('通りを挟んで向かい合う建物どうしも、組み合わせが違う（テストの側で向かいを数え直す）', () => {
    const facing: [number, number][] = [];
    for (const a of base.lots) {
      if (a.buildingId === null || a.front !== 'n') continue;
      for (const b of base.lots) {
        if (b.buildingId === null || b.front !== 's') continue;
        const gap = a.rect.z0 - b.rect.z1;
        const overlap = Math.min(a.rect.x1, b.rect.x1) - Math.max(a.rect.x0, b.rect.x0);
        if (gap > 0 && gap <= 45 && overlap >= 4) facing.push([a.buildingId, b.buildingId]);
      }
    }
    for (const a of base.lots) {
      if (a.buildingId === null || a.front !== 'w') continue;
      for (const b of base.lots) {
        if (b.buildingId === null || b.front !== 'e') continue;
        const gap = a.rect.x0 - b.rect.x1;
        const overlap = Math.min(a.rect.z1, b.rect.z1) - Math.max(a.rect.z0, b.rect.z0);
        if (gap > 0 && gap <= 45 && overlap >= 4) facing.push([a.buildingId, b.buildingId]);
      }
    }
    expect(facing.length).toBeGreaterThan(base.buildings.length * 0.2);
    expect(base.facingPairs.length).toBe(facing.length);
    const same = facing.filter(([a, b]) => base.buildings[a].signature === base.buildings[b].signature);
    expect(same).toEqual([]);
  });

  it('向かいの判定を入れても、隣の判定は崩れない（別の種でも）', () => {
    for (const seed of [3, 99]) {
      const city = generateCity(withSeed(seed));
      expect(city.neighborPairs.filter(([a, b]) => city.buildings[a].signature === city.buildings[b].signature)).toEqual([]);
      expect(city.facingPairs.filter(([a, b]) => city.buildings[a].signature === city.buildings[b].signature)).toEqual([]);
    }
  });
});

describe('体積', () => {
  it('建物の体積は、塊の体積と勾配屋根の体積の和', () => {
    for (const b of base.buildings) {
      const masses = b.masses.reduce((s, m) => s + width(m.rect) * depth(m.rect) * (m.y1 - m.y0), 0);
      const top = b.masses.reduce((a, m) => (m.y1 > a.y1 ? m : a), b.masses[0]);
      const roof = roofVolume(b.roof.kind, width(top.rect), depth(top.rect), b.roof.pitchHeight);
      expect(b.volume).toBeCloseTo(masses + roof, 6);
    }
  });

  it('街全体の体積は各棟の合計と一致し、種類別の合計とも一致する', () => {
    const sum = base.buildings.reduce((s, b) => s + b.volume, 0);
    expect(base.stats.totalVolume).toBeCloseTo(sum, 3);
    const byKind = Object.values(base.stats.volumeByKind).reduce((s, v) => s + v, 0);
    expect(byKind).toBeCloseTo(sum, 3);
  });

  it('街全体の体積が、1.5km四方の都市として妥当な範囲（500万〜4000万 m³）', () => {
    expect(base.stats.totalVolume).toBeGreaterThan(5e6);
    expect(base.stats.totalVolume).toBeLessThan(4e7);
  });

  it('寄棟屋根の体積は、同じ寸法の切妻より小さく四角錐より大きい', () => {
    const gable = roofVolume('gable', 10, 8, 3);
    const hip = roofVolume('hip', 10, 8, 3);
    expect(hip).toBeLessThan(gable);
    expect(hip).toBeGreaterThan((10 * 8 * 3) / 3);
    expect(roofVolume('flat', 10, 8, 3)).toBe(0);
  });
});
