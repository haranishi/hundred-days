// OWNER: tests
// 箱の差し替えで外形・面の向き・材質・底面の省略を変えない。
import { describe, expect, it } from 'vitest';
import { Color, Vector3 } from 'three';
import { LifeSoup } from '../../src/city/lifeSoup';

describe('箱の外形と描画属性', () => {
  it.each([false, true])('底面 %s: 移動・非一様な拡大後も外向きの面と正しい面積を保つ', bottom => {
    const soup = new LifeSoup().set(new Color(0.2, 0.4, 0.6), 2, 0.35, 0.8, 0.45);
    soup.box([-3, 2, 7], [1, 8, 15], bottom);
    const g = soup.geometry();
    const p = g.getAttribute('position');
    const normals = g.getAttribute('normal');
    expect(soup.triangleCount).toBe(bottom ? 12 : 10);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.toArray()).toEqual([-3, 2, 7]);
    expect(g.boundingBox!.max.toArray()).toEqual([1, 8, 15]);
    let area = 0;
    let bottomTriangles = 0;
    const center = new Vector3(-1, 5, 11);
    for (let i = 0; i < p.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(p, i);
      const b = new Vector3().fromBufferAttribute(p, i + 1);
      const c = new Vector3().fromBufferAttribute(p, i + 2);
      const cross = b.clone().sub(a).cross(c.clone().sub(a));
      const n = new Vector3().fromBufferAttribute(normals, i);
      expect(n.length()).toBeCloseTo(1);
      expect(cross.dot(n)).toBeGreaterThan(0);
      expect(a.clone().add(b).add(c).divideScalar(3).sub(center).dot(n)).toBeGreaterThan(0);
      area += cross.length() / 2;
      if (n.y < 0) bottomTriangles++;
    }
    expect(area).toBeCloseTo(2 * (4 * 6 + 4 * 8 + 6 * 8) - (bottom ? 0 : 4 * 8));
    expect(bottomTriangles).toBe(bottom ? 2 : 0);
    for (let i = 0; i < p.count; i++) {
      expect(g.getAttribute('aPaint').getX(i)).toBe(2);
      expect(g.getAttribute('aSurf').getX(i)).toBeCloseTo(0.35);
      expect(g.getAttribute('aSurf').getY(i)).toBeCloseTo(0.8);
      expect(g.getAttribute('aEmit').getX(i)).toBeCloseTo(0.45);
      expect(g.getAttribute('color').getX(i)).toBeCloseTo(0.2);
      expect(g.getAttribute('color').getY(i)).toBeCloseTo(0.4);
      expect(g.getAttribute('color').getZ(i)).toBeCloseTo(0.6);
    }
  });

  it('共通の箱を使っても、後の部品の位置・材質で前の部品を書き換えない', () => {
    const soup = new LifeSoup().set(new Color(1, 0, 0), 1);
    soup.box([0, 0, 0], [1, 1, 1]);
    const before = soup.geometry();
    soup.set(new Color(0, 1, 0), 2).box([10, 20, 30], [11, 22, 33], true);
    const after = soup.geometry();
    for (const name of ['position', 'normal', 'color', 'aPaint', 'aSurf', 'aEmit']) {
      const prefix = Array.from(after.getAttribute(name).array).slice(0, before.getAttribute(name).array.length);
      expect(prefix).toEqual(Array.from(before.getAttribute(name).array));
    }
    expect(soup.triangleCount).toBe(22);
  });
});
