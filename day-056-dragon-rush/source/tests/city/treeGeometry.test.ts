// OWNER: tests
// 街路樹の形（r01-city）：同じ型からは同じ形ができ、距離の帯ごとの三角形の数が予算に収まる。
import { describe, expect, it } from 'vitest';
import { TREE_ARCHETYPES } from '../../src/config/trees';
import { buildTreeFar, buildTreeMid, buildTreeNear, growTree } from '../../src/city/treeGeometry';

const tris = (g: { getAttribute(n: string): { count: number } }): number => g.getAttribute('position').count / 3;

describe('街路樹の形', () => {
  it('同じ型からは同じ形ができる（決定的）', () => {
    for (const a of TREE_ARCHETYPES) {
      const p1 = buildTreeNear(a, growTree(a)).getAttribute('position').array;
      const p2 = buildTreeNear(a, growTree(a)).getAttribute('position').array;
      expect(Array.from(p1)).toEqual(Array.from(p2));
    }
  });

  it('距離の帯ごとの三角形の数が予算に収まる（近景 1400・中景 450・遠景 60）', () => {
    const rows = TREE_ARCHETYPES.map((a) => {
      const g = growTree(a);
      return { name: a.name, near: tris(buildTreeNear(a, g)), mid: tris(buildTreeMid(a, g)), far: tris(buildTreeFar(a, g)), clumps: g.clumps.length };
    });
    console.table(rows);
    for (const r of rows) {
      expect(r.near, r.name).toBeLessThanOrEqual(1400);
      expect(r.mid, r.name).toBeLessThanOrEqual(450);
      expect(r.far, r.name).toBeLessThanOrEqual(60);
    }
  });

  it('枝の塊（冠）は幹より上にあり、木の高さは街路樹の実寸（4〜14m）', () => {
    for (const a of TREE_ARCHETYPES) {
      const g = growTree(a);
      expect(g.bottom, a.name).toBeGreaterThan(1.2);
      expect(g.top, a.name).toBeGreaterThan(3.5);
      expect(g.top, a.name).toBeLessThan(14);
    }
  });
});
