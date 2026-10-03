// OWNER: tests
// 道の小物の配置：歩道の上に立ち、建物にめり込まず、同じ種なら同じ配置になる。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { generateCity } from '../../src/world/city';
import { generateProps } from '../../src/world/props';
import { CityIndex } from '../../src/world/query';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const props = generateProps(city);

describe('道の小物', () => {
  it('街路樹・街灯・信号がそれぞれ置かれている', () => {
    expect(props.trees.length).toBeGreaterThan(500);
    expect(props.lamps.length).toBeGreaterThan(50);
    expect(props.signals.length).toBeGreaterThan(50);
  });

  it('街路樹と街灯は歩道の上にあり、建物に掛からない', () => {
    for (const p of [...props.trees.filter((t) => t.pit), ...props.lamps]) {
      // r01-city：岸壁の遊歩道の並木も植え枡付き
      expect(['sidewalk', 'promenade'], `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toContain(index.surfaceAt(p.x, p.z));
      expect(index.buildingAt(p.x, p.z)).toBeNull();
    }
  });

  // r01-city：中庭の公園の木は、公園の区画の中（植え枡なし）
  it('公園の木は公園の区画の中にあり、植え枡を付けない', () => {
    const park = props.trees.filter((t) => !t.pit);
    expect(park.length).toBeGreaterThan(50);
    const parks = city.lots.filter((l) => l.courtyard === 'park');
    for (const t of park) {
      expect(parks.some((l) => t.x > l.rect.x0 && t.x < l.rect.x1 && t.z > l.rect.z0 && t.z < l.rect.z1), `(${t.x.toFixed(1)}, ${t.z.toFixed(1)})`).toBe(true);
      expect(index.buildingAt(t.x, t.z)).toBeNull();
    }
  });

  it('街路樹は通りごとに樹種がそろい、1本ずつ形・傾き・葉の色が違い、若木と欠けた木が混ざる', () => {
    const street = props.trees.filter((t) => t.pit);
    const forms = new Set(street.map((t) => t.form));
    expect([...forms].sort()).toEqual(['full', 'sparse', 'young']);
    expect(new Set(street.map((t) => t.species)).size).toBe(2);
    expect(new Set(street.map((t) => t.tint.toFixed(6))).size).toBeGreaterThan(street.length * 0.9);
    expect(street.some((t) => t.lean > 0.03)).toBe(true);
  });

  it('信号は交差点の角の歩道に立つ（車道の上には立たない）', () => {
    for (const s of props.signals) {
      expect(['sidewalk', 'promenade', 'lot']).toContain(index.surfaceAt(s.x, s.z));
      const near = city.intersections.some((ix) => s.x > ix.rect.x0 - 3 && s.x < ix.rect.x1 + 3 && s.z > ix.rect.z0 - 3 && s.z < ix.rect.z1 + 3);
      expect(near).toBe(true);
    }
  });

  it('同じ街からは同じ配置になる', () => {
    expect(JSON.stringify(generateProps(generateCity(CITY_CONFIG)))).toBe(JSON.stringify(props));
  });
});
