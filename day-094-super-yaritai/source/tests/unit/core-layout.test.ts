import { describe, expect, it } from 'vitest';
import { PROP_BUDGET, buildWorldStatic, faceOfProp, storeLayout, type Box3 } from '../../src/shared/layout/store';
import { NavGrid } from '../../src/game/sim/nav/grid';
import { MISDEEDS } from '../../src/shared/rules/misdeeds';
import { PYRAMID } from '../../src/shared/rules/tuning';

const overlap = (a: Box3, b: Box3, eps = 0.005): boolean =>
  a.min.x < b.max.x - eps && a.max.x > b.min.x + eps && a.min.y < b.max.y - eps && a.max.y > b.min.y + eps && a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;

describe('店のデータ', () => {
  const layout = storeLayout();

  it('置き物どうしの当たり判定が重ならない（同じ置き物の中と外周の壁は除く）', () => {
    const solids = layout.fixtures.filter((f) => f.kind !== 'wall' && f.colliders.length > 0);
    const bad: string[] = [];
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i]!;
        const b = solids[j]!;
        // 同じ列の棚（列ぜんたいの当たり判定）と、その列の台は重なってよい
        if (a.kind === 'shelf' && b.kind === 'shelf' && a.pos.x === b.pos.x) continue;
        for (const ca of a.colliders) for (const cb of b.colliders) if (overlap(ca, cb)) bad.push(`${a.kind}#${a.id} × ${b.kind}#${b.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('置き物はすべて店の内側（壁は外側）', () => {
    const b = layout.bounds;
    for (const f of layout.fixtures) {
      if (f.kind === 'wall' || f.kind === 'door-post' || f.kind === 'lintel') continue;
      expect(f.pos.x, `${f.kind}#${f.id}`).toBeGreaterThan(b.x0);
      expect(f.pos.x, `${f.kind}#${f.id}`).toBeLessThan(b.x1);
      expect(f.pos.z, `${f.kind}#${f.id}`).toBeGreaterThan(b.z0);
      expect(f.pos.z, `${f.kind}#${f.id}`).toBeLessThan(b.z1);
    }
  });

  it('悪事ごとに注意書きの札が立っている', () => {
    for (const m of MISDEEDS) expect(layout.signs.some((s) => s.misdeed === m.id && s.text === m.sign), m.id).toBe(true);
  });

  it('全部の場所に、出発点から格子で歩いて行ける', () => {
    const grid = NavGrid.fromLayout(layout);
    const start = layout.spawns[0]!;
    const targets: [string, { x: number; z: number }][] = Object.entries(layout.places).map(([k, p]) => [k, p]);
    for (const face of layout.faces) targets.push([`face${face.id}`, { x: face.x + face.nx * 1.0, z: face.z + face.nz * 1.0 }]);
    for (const s of layout.spawns) targets.push(['spawn', s]);
    const unreachable: string[] = [];
    for (const [name, p] of targets) {
      const goal = grid.nearestFree(p.x, p.z, 8);
      const path = goal ? grid.findPath(start, goal) : null;
      if (!path) unreachable.push(name);
      // 場所の近く（場所の半径＋1マス）まで行けること
      else if (Math.hypot(path[path.length - 1]!.x - p.x, path[path.length - 1]!.z - p.z) > ('r' in p ? (p as { r: number }).r : 1.2) + 0.5) unreachable.push(`${name}(遠い)`);
    }
    expect(unreachable).toEqual([]);
  });

  it('通路は人が通れる幅がある（棚と棚の間の通路の真ん中は歩ける）', () => {
    const grid = NavGrid.fromLayout(layout);
    for (let i = 0; i < layout.rowXs.length - 1; i++) {
      const x = (layout.rowXs[i]! + layout.rowXs[i + 1]!) / 2;
      for (let z = -7.5; z < 1; z += 0.5) expect(grid.isFree(x, z), `aisle ${i} z=${z}`).toBe(true);
    }
  });
});

describe('buildWorldStatic', () => {
  it('同じ seed なら同じ、違う seed なら品ぞろえが変わる', () => {
    const a = buildWorldStatic(1);
    const b = buildWorldStatic(1);
    const c = buildWorldStatic(2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.props.map((p) => p.model).join()).not.toBe(c.props.map((p) => p.model).join());
  });

  it('商品は予算以内で、番号が通し番号になっている', () => {
    const w = buildWorldStatic(123);
    expect(w.props.length).toBeLessThanOrEqual(PROP_BUDGET);
    expect(w.props.length).toBeGreaterThan(250);
    w.props.forEach((p, i) => expect(p.id).toBe(i));
    expect(w.carts.length).toBe(6);
  });

  it('缶ピラミッドは30個（下から8・7・6・5・4）', () => {
    const cans = buildWorldStatic(5).props.filter((p) => p.kind === 'can');
    expect(cans.length).toBe(PYRAMID.rows.reduce((a, b) => a + b, 0));
    const layers = new Map<number, number>();
    for (const c of cans) layers.set(Math.round(c.home.pos.y * 100), (layers.get(Math.round(c.home.pos.y * 100)) ?? 0) + 1);
    expect([...layers.values()]).toEqual([8, 7, 6, 5, 4]);
  });

  it('通路ごとに商品の種類が違う', () => {
    const w = buildWorldStatic(9);
    const byAisle = new Map<string, Set<string>>();
    for (const p of w.props) {
      const face = faceOfProp(p);
      if (!face) continue;
      const set = byAisle.get(face.aisle) ?? new Set<string>();
      set.add(p.model);
      byAisle.set(face.aisle, set);
    }
    expect(byAisle.size).toBeGreaterThanOrEqual(5);
    const snack = byAisle.get('snack')!;
    const daily = byAisle.get('daily')!;
    for (const m of snack) expect(daily.has(m), m).toBe(false);
  });

  it('商品どうしが置いた時点で重ならず、動かない物にも埋まっていない', () => {
    const w = buildWorldStatic(77);
    const layout = storeLayout();
    const boxOf = (p: (typeof w.props)[number]): Box3 => {
      // 向きは90度前後なので、幅と奥行きの大きい方で正方形にして調べる（少し厳しめ）
      const r = Math.max(p.size.x, p.size.z) / 2;
      const yawAligned = Math.abs(Math.sin(p.home.yaw)) > 0.7;
      const hx = p.shape === 'box' ? (yawAligned ? p.size.z : p.size.x) / 2 : r;
      const hz = p.shape === 'box' ? (yawAligned ? p.size.x : p.size.z) / 2 : r;
      return { min: { x: p.home.pos.x - hx, y: p.home.pos.y, z: p.home.pos.z - hz }, max: { x: p.home.pos.x + hx, y: p.home.pos.y + p.size.y, z: p.home.pos.z + hz } };
    };
    const boxes = w.props.map(boxOf);
    const bad: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i]!, boxes[j]!, 0.03)) bad.push(`${w.props[i]!.model}#${i} × ${w.props[j]!.model}#${j}`);
      for (const f of layout.fixtures) for (const c of f.colliders) if (overlap(boxes[i]!, c, 0.03)) bad.push(`${w.props[i]!.model}#${i} in ${f.kind}#${f.id}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
