/**
 * dress D4：こぼれた飲み物の水たまり。棚から床へ落ちたボトル・紙パックにだけ出て、1回だけ・広がって・残る。
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWorldStatic } from '../../src/shared/layout/store';
import type { WorldView } from '../../src/shared/view';
import { MAX_SPILLS, SpillsView, hasSpilled, spillRadius } from '../../src/client/render/spills';
import { PALETTE } from '../../src/client/render/palette';

describe('hasSpilled（こぼれたかどうか）', () => {
  const home = { x: 1, y: 1.27, z: -3 };
  it('棚から床へ落ちて家から離れたらこぼれる', () => {
    expect(hasSpilled(home, { x: 2.2, y: 0.08, z: -3 })).toBe(true);
  });
  it('棚の上で倒れただけ・床の近くまで落ちていない・すぐ足もと、ではこぼれない', () => {
    expect(hasSpilled(home, { x: 1.1, y: 1.27, z: -3 })).toBe(false);
    expect(hasSpilled(home, { x: 2.2, y: 0.6, z: -3 })).toBe(false);
    expect(hasSpilled({ x: 1, y: 0.4, z: -3 }, { x: 1.2, y: 0.05, z: -3 })).toBe(false);
  });
  it('はじめから床に置いてある物はこぼれない', () => {
    expect(hasSpilled({ x: 0, y: 0.001, z: 0 }, { x: 3, y: 0.05, z: 0 })).toBe(false);
  });
  it('大きな入れ物ほど広い（上限と下限つき）', () => {
    expect(spillRadius(0.55)).toBeGreaterThan(spillRadius(0.38));
    expect(spillRadius(5)).toBeLessThanOrEqual(0.72);
    expect(spillRadius(0)).toBeGreaterThanOrEqual(0.38);
  });
});

describe('SpillsView（水たまりの描画）', () => {
  const world = buildWorldStatic(11);
  const view = (t: number): WorldView => {
    const tr = new Float32Array(world.props.length * 7);
    for (const p of world.props) {
      const o = p.id * 7;
      tr.set([p.home.pos.x, p.home.pos.y, p.home.pos.z, 0, 0, 0, 1], o);
    }
    return { phase: 'playing', timeLeft: 120 - t, duration: 120, propTransforms: tr, propHidden: new Uint8Array(world.props.length) } as unknown as WorldView;
  };
  const water = world.props.find((p) => p.model === 'fk/soda-bottle' && p.home.pos.y > 1)!;
  const can = world.props.find((p) => p.model === 'fk/can' && p.kind === 'product')!;
  const milk = world.props.find((p) => p.model === 'fk/carton')!;
  const drop = (v: WorldView, id: number, dx: number): void => {
    const p = world.props[id]!;
    v.propTransforms.set([p.home.pos.x + dx, 0.07, p.home.pos.z], id * 7);
  };

  it('落ちた水のボトルに1つ、水色で出る。缶は出ない。何度更新しても増えない', () => {
    const s = new SpillsView(world);
    const v = view(10);
    s.update(v);
    expect(s.mesh.count).toBe(0);
    drop(v, water.id, 1.2);
    drop(v, can.id, 1.2);
    s.update(v);
    s.update(v);
    expect(s.mesh.count).toBe(1);
    const c = new THREE.Color();
    s.mesh.getColorAt(0, c);
    expect(c.getHexString()).toBe(new THREE.Color(PALETTE.spillWater).getHexString());
    s.dispose();
  });

  it('はじめは小さく、1秒ほどで広がりきる。その後に商品が動いても水たまりは動かない', () => {
    const s = new SpillsView(world);
    const v = view(30);
    drop(v, water.id, 1.2);
    s.update(v);
    const m = new THREE.Matrix4();
    const scale = (): number => {
      s.mesh.getMatrixAt(0, m);
      return new THREE.Vector3().setFromMatrixScale(m).x;
    };
    const pos = (): THREE.Vector3 => new THREE.Vector3().setFromMatrixPosition(m);
    const small = scale();
    const at = pos();
    const later = view(32);
    drop(later, water.id, 3.5);
    s.update(later);
    expect(scale()).toBeGreaterThan(small * 2);
    expect(scale()).toBeCloseTo(spillRadius(water.size.y), 3);
    expect(pos().distanceTo(at)).toBeLessThan(1e-6);
    s.dispose();
  });

  it('隠れた商品（食べた・片付けた）からは出ない。上限を超えない', () => {
    const s = new SpillsView(world);
    const v = view(5);
    drop(v, milk.id, 1.5);
    v.propHidden[milk.id] = 1;
    s.update(v);
    expect(s.mesh.count).toBe(0);
    // 全部の商品を床へ落としても、上限まで
    for (const p of world.props) if (p.home.pos.y > 0.3) drop(v, p.id, 1.0);
    v.propHidden.fill(0);
    s.update(v);
    expect(s.mesh.count).toBeGreaterThan(10);
    expect(s.mesh.count).toBeLessThanOrEqual(MAX_SPILLS);
    s.dispose();
  });
});
