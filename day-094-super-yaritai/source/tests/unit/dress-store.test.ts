/**
 * dress（店の作り込み）の試験：店の地図の直し（D1 品ぞろえ・D2 ケースの向き・D3 出発点・D5 行き止まり）と、棚の枠の取り出し。
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PROP_BUDGET, buildWorldStatic, faceOfProp, storeLayout } from '../../src/shared/layout/store';
import { NavGrid } from '../../src/game/sim/nav/grid';
import { CPU_PLAN } from '../../src/shared/rules/tuning';
import { FRAME_ONLY } from '../../src/client/render/store3d';
import { cellShare, loadGlb, meshGeometry, meshNames } from './dress-glb';

const layout = storeLayout();

describe('D1 通路ごとの品ぞろえ', () => {
  /** 通路ごとに使ってよい形（主役の色と形を1つに絞った結果） */
  const ALLOWED: Record<string, string[]> = {
    snack: ['fk/bag', 'mm/shelf-bags/bag', 'mm/shelf-boxes/box'],
    drink: ['pc/water-pack', 'fk/soda-bottle', 'fk/soda-can', 'fk/carton', 'mm/shelf-boxes/carton'],
    canned: ['pc/can-tray', 'fk/can', 'fk/can-small', 'fk/bottle-ketchup'],
    daily: ['pc/toilet-pack', 'mm/shelf-end/bottle'],
  };

  it('お菓子・飲料・缶詰・日用品の棚には、その通路の形だけが並ぶ（どの seed でも）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = buildWorldStatic(seed);
      for (const p of w.props) {
        const aisle = faceOfProp(p)?.aisle;
        if (!aisle || !ALLOWED[aisle]) continue;
        expect(ALLOWED[aisle], `seed ${seed} ${aisle} ${p.model}`).toContain(p.model);
      }
    }
  });

  it('商品の数は予算以内（細い品に変えても、見えない北の端の下の段を空けて収める）', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const n = buildWorldStatic(seed).props.length;
      expect(n, `seed ${seed}`).toBeLessThanOrEqual(PROP_BUDGET);
      expect(n).toBeGreaterThan(300);
    }
  });

  it('ポテチの袋は90度回して、広い面を通路へ向ける', () => {
    const w = buildWorldStatic(20261006);
    const bags = w.props.filter((p) => p.model === 'fk/bag' && faceOfProp(p)?.nx !== 0);
    expect(bags.length).toBeGreaterThan(10);
    for (const b of bags) {
      // 袋の広い面はローカルの x を向く。回したあとは x が通路（ワールドの x）に沿わず、向き（yaw）は 0 か π の近く
      expect(Math.abs(Math.sin(b.home.yaw)), `bag ${b.id}`).toBeLessThan(0.2);
    }
  });
});

describe('D2 壁ぎわのケース', () => {
  it('立型の冷凍ケースはガラス戸（ローカルの +z）を店の内側へ向ける', () => {
    const cases = layout.fixtures.filter((f) => f.kind === 'freezer-standing');
    expect(cases.length).toBe(10);
    for (const f of cases) {
      const front = { x: Math.sin(f.yaw), z: Math.cos(f.yaw) };
      const toCenter = { x: -f.pos.x, z: -f.pos.z };
      expect(front.x * toCenter.x + front.z * toCenter.z, `case at ${f.pos.x},${f.pos.z}`).toBeGreaterThan(0);
    }
  });

  it('GLB のガラス戸は本当に +z 側にある（+z を向く面は明るい升が多く、-z を向く面は灰色）', async () => {
    const g = meshGeometry(await loadGlb('mm/freezers-standing'), null);
    // Mini Market の色の表：帯3の色4が白、帯3の色1が灰色
    const front = cellShare(g, new THREE.Vector3(0, 0, 1));
    const back = cellShare(g, new THREE.Vector3(0, 0, -1));
    expect(front.get('b3h4') ?? 0).toBeGreaterThan(0.2);
    expect(back.get('b3h4') ?? 0).toBeLessThan(0.05);
  });
});

describe('D3 出発点', () => {
  it('入口から約4m奥（アーチがキャラにかぶらない）で、歩ける所にいる', () => {
    const grid = NavGrid.fromLayout(layout);
    for (const s of layout.spawns) {
      expect(layout.bounds.z1 - s.z).toBeGreaterThanOrEqual(4);
      expect(layout.bounds.z1 - s.z).toBeLessThanOrEqual(5);
      expect(grid.isFree(s.x, s.z), `spawn ${s.x}`).toBe(true);
    }
  });

  it('ベルはすぐそこ（最初の成功が数秒で取れる）、缶ピラミッドは CPU が「遠い」と見る距離のまま', () => {
    const bell = layout.places.bell;
    const py = layout.places.pyramid;
    for (const s of layout.spawns) {
      expect(Math.hypot(bell.x - s.x, bell.z - s.z)).toBeLessThan(6);
      // cpu.ts は缶ピラミッドの立ち位置（z を 0.25 手前）までの距離で見込みを下げる
      expect(Math.hypot(py.x - s.x, py.z - 0.25 - s.z)).toBeGreaterThan(CPU_PLAN.pyramidNear);
    }
  });
});

describe('D5 冷凍ケースの裏は行き止まりではない', () => {
  it('平台の冷凍ケースと立型のケースの間に、人が通れる1m以上のすき間がある', () => {
    const flats = layout.fixtures.filter((f) => f.kind === 'freezer');
    const flatEast = Math.max(...flats.flatMap((f) => f.colliders.map((c) => c.max.x)));
    const north = layout.fixtures.filter((f) => f.kind === 'freezer-standing' && f.pos.z < layout.bounds.z0 + 2);
    const standWest = Math.min(...north.flatMap((f) => f.colliders.map((c) => c.min.x)));
    expect(standWest - flatEast).toBeGreaterThan(1.0);
  });

  it('裏の通路の東の端から、西へ回らずに抜けられる（経路が短い）', () => {
    const grid = NavGrid.fromLayout(layout);
    const from = { x: 3.0, z: -13.3 };
    const to = { x: 7.5, z: -10.6 };
    expect(grid.isFree(from.x, from.z)).toBe(true);
    const path = grid.findPath(from, to);
    expect(path).not.toBeNull();
    let len = 0;
    for (let i = 1; i < path!.length; i++) len += Math.hypot(path![i]!.x - path![i - 1]!.x, path![i]!.z - path![i - 1]!.z);
    // 東へ抜ければ約6m。西の端を回ると15m以上
    expect(len).toBeLessThan(8);
  });
});

describe('棚の枠だけを描く（GLB に入っている飾りの商品を描かない）', () => {
  it('枠の部品の名前が three で読んだ名前と合い、外形は元のモデルと同じ（置き方が変わらない）', async () => {
    for (const [model, spec] of Object.entries(FRAME_ONLY)) {
      const gltf = await loadGlb(model);
      const names = meshNames(gltf);
      const frameName = spec.frame.split('/').pop()!;
      expect(names, model).toContain(frameName);
      // 同じ名前の商品の部品は2つ目から '_1' が付く。枠だけを取れば、それらは入らない
      expect(names.filter((n) => /^(carton|box|bag|bottle|bread)_\d+$/.test(n)).length, model).toBeGreaterThan(0);
      const whole = new THREE.Box3().setFromObject(gltf.scene);
      const frame = meshGeometry(gltf, frameName);
      frame.computeBoundingBox();
      const fb = frame.boundingBox!;
      expect(fb.min.x, model).toBeCloseTo(whole.min.x, 2);
      expect(fb.max.x, model).toBeCloseTo(whole.max.x, 2);
      expect(fb.min.z, model).toBeCloseTo(whole.min.z, 2);
      expect(fb.max.z, model).toBeCloseTo(whole.max.z, 2);
      expect(fb.min.y, model).toBeCloseTo(whole.min.y, 2);
      if (spec.extra) {
        // 端の棚の上の札：単独で読んだ形の原点（底面の中心）から、元の位置へ戻す量
        const extra = meshGeometry(gltf, spec.extra.node.split('/').pop()!);
        extra.computeBoundingBox();
        const eb = extra.boundingBox!;
        const fc = fb.getCenter(new THREE.Vector3());
        const ec = eb.getCenter(new THREE.Vector3());
        expect(ec.x - fc.x).toBeCloseTo(spec.extra.offset[0], 2);
        expect(eb.min.y - fb.min.y).toBeCloseTo(spec.extra.offset[1], 2);
        expect(ec.z - fc.z).toBeCloseTo(spec.extra.offset[2], 2);
      }
    }
  });
});
