// OWNER: tests
// 車と人の形（r01-city）：型の数が配置の番号とそろい、同じ型からは同じ形ができ、距離の帯ごとの三角形の数が予算に収まる。
// 法線は外を向き、大きさ1の箱（インスタンスで実寸へ伸ばす）にほぼ収まる。
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { CAR_TYPES } from '../../src/config/streetLife';
import { PERSON_VARIANTS, carFarShapes, carMidShapes, carShapes, personFarShapes, personShapes } from '../../src/city/lifeGeometry';

const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;

function bounds(g: BufferGeometry): { min: number[]; max: number[] } {
  const p = g.getAttribute('position');
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = p.getComponent(i, k);
      min[k] = Math.min(min[k], v);
      max[k] = Math.max(max[k], v);
    }
  }
  return { min, max };
}

/** 法線が面の中心から外を向いている三角形の割合（形の中心から見て）。 */
function outwardShare(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const b = bounds(g);
  const c = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2);
  let out = 0;
  for (let i = 0; i < p.count; i += 3) {
    let d = 0;
    for (let k = 0; k < 3; k++) {
      const fc = (p.getComponent(i, k) + p.getComponent(i + 1, k) + p.getComponent(i + 2, k)) / 3;
      const fn = n.getComponent(i, k) + n.getComponent(i + 1, k) + n.getComponent(i + 2, k);
      d += (fc - c[k]) * fn;
    }
    if (d > 0) out++;
  }
  return out / (p.count / 3);
}

describe('車の形', () => {
  it('どの車の型の番号にも、3つの距離の帯すべてに形がある', () => {
    const shapes = [carShapes(), carMidShapes(), carFarShapes()];
    for (const [type, spec] of Object.entries(CAR_TYPES)) for (const level of shapes) expect(level[spec.shape], type).toBeDefined();
  });

  it('同じ型からは同じ形ができる（決定的）', () => {
    const a = carShapes().map((g) => Array.from(g.getAttribute('position').array));
    const b = carShapes().map((g) => Array.from(g.getAttribute('position').array));
    expect(a).toEqual(b);
  });

  it('三角形の数が予算に収まる（近景 1400・中景 600・遠景 24）', () => {
    const rows = carShapes().map((g, i) => ({ shape: i, near: tris(g), mid: tris(carMidShapes()[i]), far: tris(carFarShapes()[i]) }));
    console.table(rows);
    for (const r of rows) {
      expect(r.near).toBeLessThanOrEqual(1400);
      expect(r.mid).toBeLessThanOrEqual(600);
      expect(r.far).toBeLessThanOrEqual(24);
    }
  });

  it('大きさ1の箱に収まり、面は外を向く', () => {
    for (const g of [...carShapes(), ...carMidShapes()]) {
      const b = bounds(g);
      expect(b.min[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(b.max[1]).toBeLessThan(1.12);
      // ドアミラーの分だけ横にはみ出す
      expect(b.min[0]).toBeGreaterThan(-0.6);
      expect(b.max[0]).toBeLessThan(0.6);
      expect(b.min[2]).toBeGreaterThan(-0.51);
      expect(b.max[2]).toBeLessThan(0.51);
      // タイヤの踏み面の半分と床下の板は車の中心の側を向くので、全体の8割弱が外向きなら法線の向きは正しい
      expect(outwardShare(g)).toBeGreaterThan(0.75);
    }
  });
});

describe('人の形', () => {
  it('姿勢2つ×型の数の形があり、背の高さ1に収まる', () => {
    const near = personShapes();
    const far = personFarShapes();
    expect(near.length).toBe(2 * PERSON_VARIANTS);
    expect(far.length).toBe(2 * PERSON_VARIANTS);
    for (const g of near) {
      const b = bounds(g);
      expect(b.min[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(b.max[1]).toBeLessThan(1.02);
      expect(b.max[1]).toBeGreaterThan(0.98);
      // 腕と脚の内側の面は体の中心を向くので、車より低い割合でよい
      expect(outwardShare(g)).toBeGreaterThan(0.65);
    }
  });

  it('三角形の数が予算に収まる（近景 900・遠景 120）', () => {
    const near = personShapes().map(tris);
    const far = personFarShapes().map(tris);
    console.log('人の三角形（近景）', near, '（遠景）', far);
    for (const t of near) expect(t).toBeLessThanOrEqual(900);
    for (const t of far) expect(t).toBeLessThanOrEqual(120);
  });
});
