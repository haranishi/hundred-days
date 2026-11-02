// OWNER: core
// ステージのデータの検査：形の約束（範囲・向き）と、当たり・灯り・植え込み・水抜き穴の置き方。
import { describe, expect, it } from 'vitest';
import { GUARD, MOVE, PHASE } from '../src/config/rules';
import { getQuery } from '../src/sim/query';
import { STAGE_LIST, getStage } from '../src/stage';
import { HONNOJI } from './helpers';

const q = getQuery(HONNOJI);
const inBounds = (x: number, z: number) => x > HONNOJI.bounds.x0 && x < HONNOJI.bounds.x1 && z > HONNOJI.bounds.z0 && z < HONNOJI.bounds.z1;

describe('ステージのデータ', () => {
  it('一覧は年表の順で、遊べるのは本能寺だけ', () => {
    expect(STAGE_LIST.map((s) => s.id)).toEqual(['okehazama', 'honnoji', 'sekigahara']);
    expect(STAGE_LIST.filter((s) => s.playable).map((s) => s.id)).toEqual(['honnoji']);
    expect(getStage('honnoji')).toBe(HONNOJI);
    expect(() => getStage('okehazama')).toThrow();
  });

  it('長方形は x0<x1・z0<z1、壁は太さと高さが正', () => {
    const rects = [HONNOJI.bounds, ...HONNOJI.surfaces.map((s) => s.rect), ...HONNOJI.buildings.map((b) => b.footprint), ...HONNOJI.darkZones.map((d) => d.rect), ...HONNOJI.bamboo.map((b) => b.rect)];
    for (const r of rects) {
      expect(r.x0).toBeLessThan(r.x1);
      expect(r.z0).toBeLessThan(r.z1);
    }
    for (const w of HONNOJI.walls) {
      expect(w.thickness).toBeGreaterThan(0);
      expect(w.height).toBeGreaterThan(SIGHT_EYE);
    }
  });

  it('id は重ならない', () => {
    const groups = [HONNOJI.walls, HONNOJI.buildings, HONNOJI.props, HONNOJI.lights, HONNOJI.hides, HONNOJI.guards, HONNOJI.gates];
    for (const g of groups) {
      const ids = g.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('灯り・植え込み・開始地点は範囲の中。開始地点は当たりに重ならない', () => {
    for (const l of HONNOJI.lights) expect(inBounds(l.pos.x, l.pos.z), l.id).toBe(true);
    for (const h of HONNOJI.hides) expect(inBounds(h.center.x, h.center.z), h.id).toBe(true);
    const st = HONNOJI.player.start;
    expect(inBounds(st.x, st.z)).toBe(true);
    expect(q.overlaps(st.x, st.z, MOVE.radius, false)).toBe(false);
  });

  it('植え込みの真ん中は歩いて入れる（建物や塀の中に置いていない）', () => {
    for (const h of HONNOJI.hides) expect(q.overlaps(h.center.x, h.center.z, MOVE.radius, false), h.id).toBe(false);
  });

  it('灯りの小物（篝火・石灯籠・行灯）は、同じ id の明かりと同じ位置にある', () => {
    for (const p of HONNOJI.props) {
      if (p.kind !== 'brazier' && p.kind !== 'stoneLantern' && p.kind !== 'andon') continue;
      const l = HONNOJI.lights.find((x) => x.id === p.id);
      expect(l, p.id).toBeDefined();
      expect(l!.pos).toEqual(p.pos);
    }
  });

  it('見回りの道順は、立ち番の位置と最初の点がそろっている。速さは発見中の走り（3.6）より遅い', () => {
    for (const g of HONNOJI.guards) {
      if (!g.route) continue;
      expect(Math.hypot(g.route[0].pos.x - g.start.x, g.route[0].pos.z - g.start.z), g.id).toBeLessThan(0.3);
      expect(g.speed ?? GUARD.defaultSpeed).toBeLessThan(PHASE.chaseSpeed);
      expect(g.routeMode === 'loop' || g.routeMode === 'pingpong').toBe(true);
    }
  });

  it('水抜き穴はしゃがめば通れ、立っては通れない。視線は通さない', () => {
    const hole = HONNOJI.walls.find((w) => w.crawl)!;
    const x = hole.a.x;
    const z = (hole.a.z + hole.b.z) / 2;
    expect(q.overlaps(x, z, MOVE.radius, true)).toBe(false);
    expect(q.overlaps(x, z, MOVE.radius, false)).toBe(true);
    expect(q.blocked(x - 3, z, x + 3, z)).toBe(true);
  });

  it('門の切れ目は、立ったまま通れる（表門・裏門・中門）', () => {
    for (const g of HONNOJI.gates) {
      expect(q.overlaps(g.center.x, g.center.z, MOVE.radius, false), g.id).toBe(false);
      expect(q.blocked(g.center.x - 1, g.center.z - 1, g.center.x + 1, g.center.z + 1), g.id).toBe(false);
    }
  });

  it('信長は池（西）を向いて座り、蘭丸が東に立つ', () => {
    const nb = HONNOJI.guards.find((g) => g.role === 'target')!;
    const rm = HONNOJI.guards.find((g) => g.kind === 'ranmaru')!;
    expect(nb.seated).toBe(true);
    expect(nb.facingDeg).toBe(180);
    expect(rm.start.x).toBeGreaterThan(nb.start.x);
  });
});

const SIGHT_EYE = 1.6;
