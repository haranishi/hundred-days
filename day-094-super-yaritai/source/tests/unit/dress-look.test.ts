/**
 * dress D1：商品の塗り替え（色の表の升をずらす）と、通路の色の掛け合わせ。
 * 実物の GLB を読んで、塗り替えた後に「通路の主役の色」以外の升が残っていないことを確かめる。
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWorldStatic, faceOfProp, storeLayout } from '../../src/shared/layout/store';
import type { PropDef } from '../../src/shared/view';
import { lookOf, recolorGeometry, spillColorOf, tintOf } from '../../src/client/render/productLook';
import { PALETTE } from '../../src/client/render/palette';
import { splitVariants } from '../../src/client/render/store3d';
import { cellShare, loadGlb, meshGeometry } from './dress-glb';

const SEED = 20261006;
const world = buildWorldStatic(SEED);
const firstOf = (model: string): PropDef => {
  const p = world.props.find((x) => x.model === model);
  if (!p) throw new Error(`no prop ${model}`);
  return p;
};

describe('塗り替え（recolorGeometry）', () => {
  it('指定した升の三角形だけを、陰影の位置を保ったまま別の升へずらす。元の形は変えない', () => {
    // 1つ目の三角形は 帯2・色2（u 0.25〜0.375、v 0.5〜0.75）、2つ目は 帯3・色0
    const uv = new Float32Array([0.27, 0.55, 0.3, 0.6, 0.29, 0.7, 0.01, 0.8, 0.05, 0.9, 0.03, 0.85]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv.slice(), 2));
    const out = recolorGeometry(g, [{ from: [2, 2], to: [3, 7] }]);
    const o = out.getAttribute('uv') as THREE.BufferAttribute;
    expect(o.getX(0)).toBeCloseTo(0.27 + 5 / 8, 5);
    expect(o.getY(0)).toBeCloseTo(0.55 + 1 / 4, 5);
    expect(o.getX(3)).toBeCloseTo(0.01, 5);
    // 元の形の UV はそのまま
    expect((g.getAttribute('uv') as THREE.BufferAttribute).getX(0)).toBeCloseTo(0.27, 5);
  });

  /** 塗り替えた後の升の割合 */
  const after = async (model: string, node: string | null): Promise<Map<string, number>> => {
    const [file] = model.split('/').length > 2 ? [model.split('/').slice(0, 2).join('/')] : [model];
    const g = meshGeometry(await loadGlb(file!), node);
    return cellShare(recolorGeometry(g, lookOf(firstOf(model)).shifts));
  };

  it('お菓子の袋（肌色1色）は白になり、黄とピンクを掛ける', async () => {
    const c = await after('fk/bag', null);
    expect(c.get('b3h7')).toBeCloseTo(1, 5);
    const bags = world.props.filter((p) => p.model === 'fk/bag');
    const tints = new Set(bags.map((p) => tintOf(p, SEED)));
    for (const t of tints) expect([PALETTE.snackYellow, PALETTE.snackPink]).toContain(t);
    expect(tints.size).toBe(2);
  });

  it('飲料：コーラの瓶は茶と赤が消えて、白（透明）と青のラベルに。缶は赤が青に、紙パックは紫が青に', async () => {
    const bottle = await after('fk/soda-bottle', null);
    expect(bottle.get('b2h1') ?? 0).toBe(0);
    expect(bottle.get('b2h7') ?? 0).toBe(0);
    expect((bottle.get('b3h7') ?? 0) + (bottle.get('b1h0') ?? 0)).toBeCloseTo(1, 5);
    const can = await after('fk/soda-can', null);
    expect(can.get('b2h7') ?? 0).toBe(0);
    expect(can.get('b1h0') ?? 0).toBeGreaterThan(0.5);
    const carton = await after('fk/carton', null);
    expect(carton.get('b1h2') ?? 0).toBe(0);
    expect(carton.get('b1h0') ?? 0).toBeGreaterThan(0.4);
  });

  it('缶詰：小さな缶の紫は赤に（大きな缶は元から赤）', async () => {
    const small = await after('fk/can-small', null);
    expect(small.get('b1h2') ?? 0).toBe(0);
    expect(small.get('b2h7') ?? 0).toBeGreaterThan(0.15);
  });

  it('日用品：水色のボトルは白にして、淡い色を掛ける（同じ棚の同じ段は同じ色）', async () => {
    const c = await after('mm/shelf-end/bottle', 'bottle');
    expect(c.get('b2h6') ?? 0).toBe(0);
    const daily = world.props.filter((p) => p.model === 'mm/shelf-end/bottle' && faceOfProp(p)?.aisle === 'daily');
    const pastels: string[] = [PALETTE.pastelMint, PALETTE.pastelLavender, PALETTE.pastelPink, PALETTE.pastelLemon, PALETTE.pastelSky];
    const byGroup = new Map<string, Set<string>>();
    for (const p of daily) {
      const t = tintOf(p, SEED);
      expect(pastels).toContain(t);
      const k = `${p.fixtureId}|${Math.round(p.home.pos.y * 4)}`;
      byGroup.set(k, (byGroup.get(k) ?? new Set()).add(t));
    }
    for (const set of byGroup.values()) expect(set.size).toBe(1);
  });

  it('お菓子の箱だけピンクに塗り、同じ形の朝ごはんのシリアルの箱は元の色のまま', () => {
    const boxes = world.props.filter((p) => p.model === 'mm/shelf-boxes/box');
    const looks = new Set(boxes.map((p) => `${faceOfProp(p)?.aisle}:${lookOf(p).name}`));
    for (const l of looks) expect(['snack:snack-box', 'breakfast:']).toContain(l);
  });

  it('色は seed と番号だけで決まる（主と参加者で同じ）', () => {
    const again = buildWorldStatic(SEED);
    for (const p of world.props) expect(tintOf(again.props[p.id]!, SEED)).toBe(tintOf(p, SEED));
  });

  it('こぼれる色：水は水色・牛乳は白・ケチャップは赤。缶と袋はこぼれない', () => {
    expect(spillColorOf(firstOf('fk/soda-bottle'), SEED)).toBe(PALETTE.spillWater);
    expect(spillColorOf(firstOf('fk/carton'), SEED)).toBe(PALETTE.spillMilk);
    expect(spillColorOf(firstOf('fk/bottle-ketchup'), SEED)).toBe(PALETTE.spillRed);
    expect(spillColorOf(firstOf('fk/can'), SEED)).toBeNull();
    expect(spillColorOf(firstOf('fk/bag'), SEED)).toBeNull();
  });

  it('青果のかご4つは、トマト2つ・オレンジ・青りんごに描き分ける（塗り替えたかごに果物の赤が残らない）', async () => {
    const fruits = storeLayout().fixtures.filter((f) => f.model === 'mm/display-fruit');
    const groups = splitVariants('mm/display-fruit', fruits);
    expect(groups.map((g) => g.list.length).sort()).toEqual([1, 1, 2]);
    const g = meshGeometry(await loadGlb('mm/display-fruit'), null);
    // Mini Market の色の表：帯2の色4が赤（トマト）
    expect(cellShare(g).get('b2h4') ?? 0).toBeGreaterThan(0.3);
    for (const gr of groups) {
      if (!gr.shifts) continue;
      expect(cellShare(recolorGeometry(g, gr.shifts)).get('b2h4') ?? 0).toBe(0);
    }
  });
});
