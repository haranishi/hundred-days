// OWNER: tests
// 1階の店の区切り（r01-city）：柱間を1〜3つずつ1軒にまとめ、面の端から端まで隙間なく並べる。同じ建物からは同じ区切りになる。
// 外壁のシェーダー（看板）とひさし（形）が同じ区切りを読むので、区切りの規則そのものを確かめる。
import { describe, expect, it } from 'vitest';
import { shopBayWidth, shopStartBits, shopsFromBits } from '../../src/city/buildingGeometry';
import { CITY_CONFIG } from '../../src/config/city';
import { generateCity } from '../../src/world/city';
import { hasShopFront } from '../../src/world/streetLife';

const city = generateCity(CITY_CONFIG);
const shops = city.buildings.filter(hasShopFront);

function faces(b: (typeof shops)[number]): number[] {
  const r = b.masses[0].rect;
  return [r.x1 - r.x0, r.x1 - r.x0, r.z1 - r.z0, r.z1 - r.z0];
}

describe('1階の店の区切り', () => {
  it('店のある建物が十分にある', () => {
    expect(shops.length).toBeGreaterThan(200);
  });

  it('どの面でも、店は1〜3柱間で、最初の柱間から最後の柱間まで隙間なく並ぶ', () => {
    for (const b of shops) {
      faces(b).forEach((len, face) => {
        const full = Math.floor(len / shopBayWidth(len, b.facade.bayWidth) + 1e-3);
        const list = shopsFromBits(shopStartBits(b.id, face, len, b.facade.bayWidth), full);
        let next = 0;
        for (const s of list) {
          expect(s.start).toBe(next);
          expect(s.count).toBeGreaterThanOrEqual(1);
          expect(s.count).toBeLessThanOrEqual(3);
          next += s.count;
        }
        expect(next).toBe(full);
      });
    }
  });

  it('同じ建物・同じ面からは同じ区切りになる（決定性）', () => {
    for (const b of shops.slice(0, 80)) {
      faces(b).forEach((len, face) => {
        expect(shopStartBits(b.id, face, len, b.facade.bayWidth)).toBe(shopStartBits(b.id, face, len, b.facade.bayWidth));
      });
    }
  });

  it('1柱間の店と、2〜3柱間にまたがる店が混ざる（看板が同じ調子で並ばない）', () => {
    const counts = [0, 0, 0, 0];
    for (const b of shops) {
      faces(b).forEach((len, face) => {
        const full = Math.floor(len / shopBayWidth(len, b.facade.bayWidth) + 1e-3);
        for (const s of shopsFromBits(shopStartBits(b.id, face, len, b.facade.bayWidth), full)) counts[s.count]++;
      });
    }
    const total = counts[1] + counts[2] + counts[3];
    expect(counts[1] / total).toBeGreaterThan(0.3);
    expect((counts[2] + counts[3]) / total).toBeGreaterThan(0.25);
  });
});
