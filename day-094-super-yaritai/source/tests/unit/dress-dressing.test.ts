/**
 * dress D1〜D3・H1〜H3：動かない飾り（通路の色の板・ケースの中身・店の外・壁・奥の看板・レジ）。
 * 飾りには当たり判定がないので、店の中で人が歩く所に「見えるのに通り抜けられる物」を置いていないことを確かめる。
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { storeLayout, type Box3, type Fixture } from '../../src/shared/layout/store';
import { dressingSolid } from '../../src/client/render/dressing';
import { decorLayoutForTest } from '../../src/client/render/decor';
import { PALETTE } from '../../src/client/render/palette';

const layout = storeLayout();
const geo = dressingSolid(layout);
const pos = geo.getAttribute('position') as THREE.BufferAttribute;
const col = geo.getAttribute('color') as THREE.BufferAttribute;
const b = layout.bounds;

/** 箱の足もと（＋ゆとり）の中にある頂点の、色の集まり */
function colorsIn(boxes: Box3[], pad = 0.05): Set<string> {
  const out = new Set<string>();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y < 0.05) continue;
    if (!boxes.some((bx) => x >= bx.min.x - pad && x <= bx.max.x + pad && z >= bx.min.z - pad && z <= bx.max.z + pad)) continue;
    out.add(c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHexString());
  }
  return out;
}

describe('動かない飾り', () => {
  it('三角形の数は予算の中（1コマ30万のうち、飾りは5万まで）', () => {
    expect(pos.count / 3).toBeLessThan(50_000);
  });

  it('店の中の床より上の飾りは、置き物（当たり判定の箱）か壁の面に貼り付いている', () => {
    const boxes: Box3[] = layout.fixtures.flatMap((f) => f.colliders);
    // 端の棚の上の札や、立型のケースの上の縁は当たり判定の箱より高いので、高さは見ない（人の背より上は通路をふさがない）
    const inside = (x: number, y: number, z: number): boolean =>
      boxes.some((bx) => x >= bx.min.x - 0.08 && x <= bx.max.x + 0.08 && z >= bx.min.z - 0.08 && z <= bx.max.z + 0.08 && y >= bx.min.y - 0.05);
    const stray: string[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (y < 0.02) continue;
      if (!inside(x, y, z)) stray.push(`${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
    }
    expect(stray.slice(0, 8)).toEqual([]);
  });

  it('店の外の飾り（歩道・植え込み・のぼり旗）は南の壁の外側にある', () => {
    let outside = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > b.z1 + 1) outside++;
    expect(outside).toBeGreaterThan(1000);
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > b.z1 + 0.05) expect(pos.getZ(i)).toBeLessThan(b.z1 + 7);
    }
  });
});

describe('H1 壁の内側の面', () => {
  const { wallFaces, blocked, posterSpots } = decorLayoutForTest;

  it('西・東・北の壁に、窓・扉・壁ぎわの置き物を避けてポスターを3枚以上貼る', () => {
    for (const face of wallFaces(layout)) {
      const { openings, fixtures } = blocked(layout, face);
      const spots = posterSpots(face, [...openings, ...fixtures]);
      expect(spots.length, face.name).toBeGreaterThanOrEqual(3);
      // ふさがった区間（余白0.2m）にかからない
      for (const u of spots) for (const [a, z] of [...openings, ...fixtures]) expect(u + 0.43 <= a || u - 0.43 >= z, `${face.name} ${u}`).toBe(true);
    }
  });

  it('壁の面（腰の高さから光る帯の上まで）が無地ではない：腰板・ポスターの縁・ガーランドが並ぶ', () => {
    const near = { west: 0, east: 0, north: 0 };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y < 0.05 || y > 2.35) continue;
      if (Math.abs(x - b.x0) < 0.06 && z > b.z0 && z < b.z1) near.west++;
      if (Math.abs(x - b.x1) < 0.06 && z > b.z0 && z < b.z1) near.east++;
      if (Math.abs(z - b.z0) < 0.06 && x > b.x0 && x < b.x1) near.north++;
    }
    for (const [k, n] of Object.entries(near)) expect(n, k).toBeGreaterThan(600);
  });

  it('壁の上面は日よけの縞：正面（南の低い壁）も横も薄い赤と白（濃い赤は HUD の「蹴る」とぶつかる）', () => {
    const hex = (s: string): string => new THREE.Color(s).getHexString();
    const topColors = (y: number, pick: (x: number, z: number) => boolean): Set<string> => {
      const out = new Set<string>();
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getY(i) - y) > 0.002 || !pick(pos.getX(i), pos.getZ(i))) continue;
        out.add(c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHexString());
      }
      return out;
    };
    const southH = Math.max(...layout.fixtures.filter((f) => f.kind === 'wall' && f.pos.z > b.z1).map((f) => f.size.y));
    expect(topColors(southH + 0.004, (_x, z) => z > b.z1)).toEqual(new Set([hex(PALETTE.awningSoft), hex(PALETTE.white)]));
    expect(topColors(2.304, (x) => x < b.x0)).toEqual(new Set([hex(PALETTE.awningSoft), hex(PALETTE.white)]));
  });
});

describe('H2 奥の壁の上', () => {
  it('看板の帯が壁より1m以上高く立ち、壁の幅いっぱいにある', () => {
    let maxY = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i) - (b.z0 - 0.06)) > 0.1) continue;
      maxY = Math.max(maxY, pos.getY(i));
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
    const wallH = Math.max(...layout.fixtures.filter((f) => f.kind === 'wall').map((f) => f.size.y));
    expect(maxY).toBeGreaterThan(wallH + 1.0);
    expect(minX).toBeLessThanOrEqual(b.x0);
    expect(maxX).toBeGreaterThanOrEqual(b.x1);
  });

  it('時計とバッジは、帯の上から空へはみ出す（輪郭をにぎやかにする）', () => {
    const { BADGES, CLOCK } = decorLayoutForTest;
    expect(BADGES.length).toBeGreaterThanOrEqual(2);
    for (const bd of [...BADGES.map((x) => x.x), CLOCK.x]) {
      expect(bd).toBeGreaterThan(b.x0);
      expect(bd).toBeLessThan(b.x1);
    }
  });
});

describe('H3 レジ3台を見分けられる', () => {
  const lanes = decorLayoutForTest.lanes(layout);

  it('レジは3台で、3番だけ休止中', () => {
    expect(lanes.map((l) => l.no)).toEqual([1, 2, 3]);
    expect(lanes.map((l) => l.closed)).toEqual([false, false, true]);
  });

  it('台とベルトの上の飾りの色の組が、3台とも違う（休止中の灰色は3番だけ）', () => {
    const sets = lanes.map((l) => colorsIn([...l.reg.colliders, ...l.conv.colliders]));
    const key = (s: Set<string>): string => [...s].sort().join(',');
    expect(new Set(sets.map(key)).size).toBe(3);
    const off = new THREE.Color(PALETTE.laneOff).getHexString();
    expect(sets.map((s) => s.has(off))).toEqual([false, false, true]);
  });
});

describe('同じ物の繰り返しを減らす', () => {
  it('北の壁の冷凍ケース4台は、中の品の色の組がすべて違う', () => {
    const north = layout.fixtures.filter((f: Fixture) => f.kind === 'freezer-standing' && f.pos.z < b.z0 + 2);
    expect(north.length).toBe(4);
    const sets = north.map((f) => [...colorsIn(f.colliders, 0)].sort().join(','));
    expect(new Set(sets).size).toBe(4);
  });
});
