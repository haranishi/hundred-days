// OWNER: tests
// 割れて崩れる形の規則。
// r03-fx：割れる高さは当たった高さに最も近い階の境目で、上の塊と下の階を最低限残す。崩落の間、上の塊は倒れ、下の階は上から順に潰れる。
// r04-fx2：上の塊は階ごとの板（1〜5枚、境目は階の境目）に分け、一番下の板から順に潰す（同じ建物なら同じ割り方と順番）。
//   地面の下へは沈めず、瓦礫の山が崩落の最後の 0.6〜1 秒で盛り上がって積み重なりを隠す。倒れる角度は、前の隣の建物に食い込まない所まで。
import { describe, expect, it } from 'vitest';
import { PIECE, newBuildingWriter, writeBuilding } from '../../src/city/buildingGeometry';
import { DAMAGE_VERTEX_PARS } from '../../src/city/damageGlsl';
import {
  clearanceAngle,
  collapseHinge,
  collapsePose,
  collapseShape,
  collapseShapeToward,
  moundHeight,
  moundProgress,
  moundSeconds,
  movePiece,
  pileHeight,
  poseZero,
  slabBottom,
  slabBounds,
  slabCrush,
  slabIndexAt,
  type CollapseShape,
} from '../../src/city/collapsePose';
import { CITY_CONFIG } from '../../src/config/city';
import { COLLAPSE, RUBBLE } from '../../src/config/fx';
import { heapHeight } from '../../src/fx/rubble';
import { STAGES } from '../../src/config/gameplay';
import { DamageState, STAGE, splitHeight, type StageChange } from '../../src/gameplay/damage';
import { generateCity } from '../../src/world/city';
import type { Building } from '../../src/world/types';

const city = generateCity(CITY_CONFIG);
const midrise = city.buildings.find((b) => b.kind === 'tileMidrise' && b.height > 35 && b.masses.length === 1)!;
const tower = city.buildings.find((b) => b.kind === 'glassTower' && b.masses.length > 1)!;
const DEG = Math.PI / 180;

describe('割れる高さ', () => {
  it('当たった高さに最も近い階の境目になり、同じ入力なら同じ高さ', () => {
    const b = midrise;
    const f = b.facade;
    const first = b.masses[0].y0 + f.groundFloor;
    for (const y of [8, 15.3, 22, 30]) {
      const s = splitHeight(b, y);
      expect(splitHeight(b, y)).toBe(s);
      const k = (s - first) / f.floorHeight;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
      expect(Math.abs(s - Math.min(Math.max(y, first), b.height))).toBeLessThanOrEqual(f.floorHeight / 2 + 1e-6);
    }
  });

  it('どの建物でも、上の塊は2階分（か高さの45%）、下は1階分（か高さの30%）より小さくならない', () => {
    for (const b of city.buildings) {
      const base = b.masses[0].y0;
      const h = b.height - base;
      for (const y of [base, base + h * 0.5, b.height]) {
        const s = splitHeight(b, y);
        expect(s).toBeGreaterThan(base);
        expect(s).toBeLessThan(b.height);
        expect(b.height - s).toBeGreaterThanOrEqual(Math.min(2 * b.facade.floorHeight, h * 0.45) - 1e-6);
        expect(s - base).toBeGreaterThanOrEqual(Math.min(b.facade.groundFloor, h * 0.3) - 1e-6);
      }
    }
  });

  it('ガラスの高層で塔の高さに当たったら、塔の根元から階高ごとの境目で割る', () => {
    const m = tower.masses[1];
    const s = splitHeight(tower, (m.y0 + tower.height) / 2);
    const k = (s - m.y0) / tower.facade.floorHeight;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
  });

  it('傾きに入った瞬間の当たった高さで決まり、その後の当たりでは変わらない。やり直しで 0 に戻る', () => {
    const s = new DamageState(city);
    const changes: StageChange[] = [];
    const id = midrise.id;
    const hit = (y: number, f: number): void => s.hit(id, s.hp[id] * f, { cause: 'claw', fromX: midrise.footprint.x0 - 30, fromZ: midrise.footprint.z0, y, player: true });
    hit(20, 0.8);
    for (let t = 0; t < 2 && s.stage[id] < STAGE.tilt; t += 1 / 60) s.update(1 / 60, changes);
    expect(s.stage[id]).toBe(STAGE.tilt);
    const at = s.splitY[id];
    expect(at).toBeCloseTo(splitHeight(midrise, s.impactY[id]), 4);
    hit(6, 0.01);
    s.update(1 / 60, changes);
    expect(s.splitY[id]).toBe(at);
    s.reset();
    expect(s.splitY[id]).toBe(0);
  });
});

describe('上の塊の板の割り方と順番（r04-fx2）', () => {
  it('板の境目は階の境目で、割れ目から屋上まで下から順に並ぶ。板の数は上の塊の階数（上限5）', () => {
    for (const b of city.buildings) {
      const split = splitHeight(b, b.height * 0.55);
      const s = collapseShape(b, split, 1, 0, null);
      expect(s.slabs).toBe(Math.min(COLLAPSE.slabs.max, s.floors));
      expect(slabBottom(s, 0)).toBe(split);
      expect(slabBottom(s, s.slabs)).toBe(b.height);
      for (let j = 0; j < s.slabs; j++) {
        const lo = slabBottom(s, j);
        const hi = slabBottom(s, j + 1);
        expect(hi).toBeGreaterThan(lo);
        const k = (lo - split) / s.floorH;
        if (j > 0) expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
      }
    }
  });

  it('3階以上ある上の塊は3〜5枚に割る（中層ビルの割り方の例）', () => {
    const split = splitHeight(midrise, midrise.height * 0.55);
    const s = collapseShape(midrise, split, 1, 0, null);
    expect(s.floors).toBeGreaterThanOrEqual(3);
    expect(s.slabs).toBeGreaterThanOrEqual(3);
    expect(s.slabs).toBeLessThanOrEqual(5);
    let many = 0;
    for (const b of city.buildings) {
      const sh = collapseShape(b, splitHeight(b, b.height * 0.55), 0, 1, null);
      if (sh.floors >= 3) {
        expect(sh.slabs).toBeGreaterThanOrEqual(3);
        many++;
      }
    }
    expect(many).toBeGreaterThan(50);
  });

  it('同じ建物・同じ割れる高さなら、同じ割り方（倒れる向きによらない）と同じ順番', () => {
    const split = splitHeight(tower, tower.height * 0.6);
    const a = collapseShape(tower, split, 1, 0, city.buildings);
    const b = collapseShape(tower, split, 0, -1, city.buildings);
    expect(slabBounds(a)).toEqual(slabBounds(b));
    expect(slabBounds(collapseShape(tower, split, 1, 0, null))).toEqual(slabBounds(a));
    expect(a.seed).toBe(b.seed);
  });

  it('板は一番下から順に潰れ始め、どれも最後は潰れきる。潰れる速さは落ちる加速で増す', () => {
    for (const n of [1, 2, 3, 5]) {
      const starts: number[] = [];
      for (let j = 0; j < n; j++) {
        let first = -1;
        let last = 0;
        for (let c = 0; c <= 1.0001; c += 0.005) {
          const q = slabCrush(j, n, c);
          expect(q).toBeGreaterThanOrEqual(last - 1e-12);
          if (first < 0 && q > 0) first = c;
          last = q;
        }
        expect(last).toBeCloseTo(1, 9);
        starts.push(first);
      }
      for (let j = 1; j < n; j++) expect(starts[j]).toBeGreaterThan(starts[j - 1]);
    }
    // 1枚の潰れ：前半より後半の方が多く進む（加速）
    const S = COLLAPSE.slabs;
    const mid = slabCrush(0, 3, S.from + S.each / 2);
    expect(mid).toBeLessThan(0.3);
  });

  it('板の印（aBid の小数部）は、表を引く建物番号を変えず、シェーダーで板の番号に戻せる', () => {
    // 引き継ぎで見つけた不具合：シェーダーが建物番号を四捨五入で取っていて、小数部 0.5 以上の板（3枚目から上）が
    // 隣の建物の表を読み、崩れの間ずっと元の位置に浮いていた。番号は切り捨てで取る
    expect(DAMAGE_VERTEX_PARS).toContain('int(floor(bid + 1e-3))');
    expect(DAMAGE_VERTEX_PARS).not.toContain('int(bid + 0.5)');
    const fract = (x: number): number => x - Math.floor(x);
    for (let j = 0; j < COLLAPSE.slabs.max; j++) {
      const f = PIECE.upper + j * PIECE.slabStep;
      expect(f).toBeLessThan(1);
      for (const id of [0, 7, 253, 1999, 4095]) {
        const bid = Math.fround(id + f);
        // 建物番号（dmgTexel と同じ式）
        expect(Math.floor(bid + 1e-3)).toBe(id);
        // 板の番号（dmgPiece と同じ式）
        const g = fract(bid + 1e-4);
        expect(2 + Math.floor((g - PIECE.upper) / PIECE.slabStep + 0.5) - 2).toBe(j);
      }
    }
  });

  it('詳しい形の頂点は、動く前の高さが入る板の印を持つ（割れ目より上は板ごと、下は下の部品）', () => {
    const b = midrise;
    const split = splitHeight(b, b.height * 0.55);
    const shape = collapseShape(b, split, 1, 0, null);
    const w = newBuildingWriter();
    writeBuilding(w, b, city.curbHeight, 0.5, city.lots[b.lotId].front, { split, bounds: slabBounds(shape) });
    const g = w.toGeometry();
    const bid = g.getAttribute('aBid').array as Float32Array;
    const pos = g.getAttribute('position').array as Float32Array;
    const seen = new Set<number>();
    let checked = 0;
    for (let i = 0; i < bid.length; i++) {
      const f = Math.round((bid[i] - b.id) * 10000) / 10000;
      const y = pos[i * 3 + 1];
      if (f === PIECE.lower) {
        expect(y).toBeLessThanOrEqual(split + 1e-3);
        continue;
      }
      const j = Math.round((f - PIECE.upper) / PIECE.slabStep);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(shape.slabs);
      seen.add(j);
      // 壁の帯と屋根：頂点の高さはその板の範囲（蓋の凹凸は境目から1m以内）
      expect(y).toBeGreaterThanOrEqual(slabBottom(shape, j) - 1.01);
      if (j < shape.slabs - 1) expect(y).toBeLessThanOrEqual(slabBottom(shape, j + 1) + 1.01);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(seen.size).toBe(shape.slabs);
  });
});

describe('崩れる形（collapsePose）', () => {
  const b = midrise;
  const base = b.masses[0].y0;
  const split = splitHeight(b, b.height * 0.55);
  const shape = collapseShape(b, split, 1, 0, null);

  it('傾きの段階では上の塊が傾くだけで、下の階も板も潰れず、沈まず、山は無い', () => {
    const p = collapsePose(STAGES.leanMax * 0.6, 0, shape, poseZero());
    expect(p.angle).toBeCloseTo(STAGES.leanMax * 0.6, 9);
    expect(p.front).toBe(split);
    expect(p.stackTop).toBe(split);
    expect(p.sink).toBe(0);
    expect(p.mound).toBe(0);
    for (const q of p.crush) expect(q).toBe(0);
  });

  it('崩落の間、潰れの先端は上から下へ降り（落ちる加速で速くなる）、最後に根元に着く', () => {
    let last = collapsePose(STAGES.leanMax, 0, shape, poseZero());
    let lastSpeed = 0;
    let accelerating = 0;
    for (let c = 0.01; c <= 1.0001; c += 0.01) {
      const p = collapsePose(STAGES.leanMax, c, shape, poseZero());
      expect(p.front).toBeLessThanOrEqual(last.front + 1e-9);
      expect(p.stackTop).toBeGreaterThanOrEqual(p.front - 1e-9);
      const speed = last.front - p.front;
      if (speed > lastSpeed + 1e-9) accelerating++;
      lastSpeed = speed;
      last = p;
    }
    expect(last.front).toBeCloseTo(base, 6);
    expect(accelerating).toBeGreaterThan(20);
  });

  it('地面の下へは沈めない：潰れた階と板の積み重なりは、最後まで根元より上にあり、沈みは積み重なりの一部だけ', () => {
    const hinge = collapseHinge(b, 1, 0, split);
    const f = b.footprint;
    const corners = [
      [f.x0, f.z0],
      [f.x1, f.z0],
      [f.x0, f.z1],
      [f.x1, f.z1],
    ];
    for (let c = 0; c <= 1.0001; c += 0.02) {
      const p = collapsePose(STAGES.leanMax + STAGES.collapseLean * c, c, shape, poseZero());
      expect(p.sink).toBeLessThanOrEqual(Math.min(COLLAPSE.sinkMax, pileHeight(shape) * COLLAPSE.sinkShare) + 1e-9);
      expect(p.sink).toBeLessThanOrEqual((split - base) * COLLAPSE.squash + 1e-9);
      // 上の塊の一番下の板の底の4つの角
      for (const [x, z] of corners) {
        const q = { x, y: split + 1e-3, z };
        movePiece(q, 0, p, hinge, shape, 1, 0);
        expect(q.y).toBeGreaterThan(base - 1e-6);
      }
      expect(p.stackTop - p.sink).toBeGreaterThan(base);
    }
  });

  it('上の塊は、崩落の終わりには傾きを戻して瓦礫の上に平らに近く載る', () => {
    const p = collapsePose(STAGES.leanMax + STAGES.collapseLean, 1, shape, poseZero());
    expect(p.angle).toBeCloseTo(COLLAPSE.settleDeg * DEG, 6);
    const mid = collapsePose(STAGES.leanMax + STAGES.collapseLean * 0.4, 0.4, shape, poseZero());
    expect(mid.angle).toBeGreaterThan(p.angle);
  });

  it('上の塊の点は、潰れる前は軸のまわりを回るだけ（軸からの距離が変わらない）。潰れると板の厚みが減る', () => {
    const h = collapseHinge(b, 1, 0, split);
    const pose = collapsePose(0.4, 0, shape, poseZero());
    const p = { x: b.footprint.x0, y: b.height - 1, z: (b.footprint.z0 + b.footprint.z1) / 2 };
    const before = Math.hypot(p.x - h.x, p.y - split, p.z - h.z);
    movePiece(p, slabIndexAt(shape, p.y), pose, h, shape, 1, 0);
    expect(Math.hypot(p.x - h.x, p.y - pose.stackTop, p.z - h.z)).toBeCloseTo(before, 6);
    // 倒れる向き（+x）へ動く
    expect(p.x).toBeGreaterThan(b.footprint.x0);
    // 板がすべて潰れた後は、屋上の点が割れ目の近くまで降りる
    const done = collapsePose(0, 1, shape, poseZero());
    const top = { x: h.x, y: b.height - 0.01, z: h.z };
    movePiece(top, slabIndexAt(shape, top.y), done, h, shape, 1, 0);
    expect(top.y - done.stackTop + done.sink).toBeLessThan((b.height - split) * (COLLAPSE.slabs.squash + 0.02));
    // 下の階の点は先端より上だけ潰れる
    const crush = collapsePose(0.4, 0.5, shape, poseZero());
    const low = { x: 0, y: crush.front - 1, z: 0 };
    movePiece(low, -1, crush, h, shape, 1, 0);
    expect(low.y).toBeCloseTo(crush.front - 1 - crush.sink, 9);
    const hi = { x: 0, y: split, z: 0 };
    movePiece(hi, -1, crush, h, shape, 1, 0);
    expect(hi.y).toBeCloseTo(crush.stackTop - crush.sink, 9);
  });
});

describe('瓦礫の山の盛り上がり（r04-fx2）', () => {
  it('崩落の最後の 0.6〜1 秒で 0 から 1 へ盛り上がる（約0.1秒で差し替えない）', () => {
    for (const b of [midrise, tower, city.buildings.find((x) => x.kind === 'house')!]) {
      const shape = collapseShape(b, splitHeight(b, b.height * 0.5), 1, 0, null);
      const secs = moundSeconds(shape);
      expect(secs).toBeGreaterThanOrEqual(COLLAPSE.mound.seconds[0] - 1e-9);
      expect(secs).toBeLessThanOrEqual(COLLAPSE.mound.seconds[1] + 1e-9);
      // 崩落の秒数で刻んで、盛り上がりが 0.05 から 0.95 になるまでの秒数
      const T = shape.seconds;
      let t05 = -1;
      let t95 = -1;
      for (let t = 0; t <= T + 1e-9; t += 1 / 120) {
        const m = moundProgress(shape, t / T);
        if (t05 < 0 && m >= 0.05) t05 = t;
        if (t95 < 0 && m >= 0.95) t95 = t;
      }
      expect(t95 - t05).toBeGreaterThan(0.4);
      expect(moundProgress(shape, 1)).toBeCloseTo(1, 9);
      expect(moundProgress(shape, 1 - secs / T - 0.01)).toBe(0);
    }
  });

  it('山の高さは、沈んだ後の積み重なりを隠す高さ（山は崩れた建物の外形の角でも頂の7割ほど）', () => {
    for (const b of city.buildings) {
      const shape = collapseShape(b, splitHeight(b, b.height * 0.55), 1, 0, null);
      const end = collapsePose(0, 1, shape, poseZero());
      expect(moundHeight(shape) * 0.7).toBeGreaterThanOrEqual(Math.min(pileHeight(shape) - end.sink, 22 * 0.7) - 0.35);
    }
    // 外形の角での山の高さ（外形の幅 20m の建物、山の広がり 1.22 倍 + 4m）
    const u = 10 / (20 * RUBBLE.spread + RUBBLE.pad);
    expect(heapHeight(u, u)).toBeGreaterThan(0.66);
    expect(heapHeight(0.5, 0)).toBeLessThan(0.02);
  });
});

describe('隣に食い込まない倒れ方（r04-fx2）', () => {
  /** 上の塊の前の面（軸から倒れる向きへ）を線分で刻み、隣の外形の中で屋上より低い所に入らないかを調べる。 */
  function penetrates(b: Building, shape: CollapseShape, dirX: number, dirZ: number, c: number, tilt: number): boolean {
    const pose = collapsePose(tilt, c, shape, poseZero());
    const h = collapseHinge(b, dirX, dirZ, shape.split);
    for (let k = 0; k <= 20; k++) {
      const y = shape.split + (shape.height - shape.split) * (k / 20) - 1e-3;
      const p = { x: h.x, y, z: h.z };
      movePiece(p, slabIndexAt(shape, y), pose, h, shape, dirX, dirZ);
      for (const o of city.buildings) {
        if (o.id === b.id) continue;
        const f = o.footprint;
        if (p.x > f.x0 + 0.3 && p.x < f.x1 - 0.3 && p.z > f.z0 + 0.3 && p.z < f.z1 - 0.3 && p.y < o.height - 0.3) return true;
      }
    }
    return false;
  }

  it('前に隣がある建物では、隣に届く角度を超えて倒さない（見た目の倒れる向きで）', () => {
    let tested = 0;
    for (const b of city.buildings) {
      if (b.height < 25 || tested >= 25) continue;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const split = splitHeight(b, b.height * 0.55);
        const shape = collapseShape(b, split, dx, dz, city.buildings);
        if (shape.gaps.length === 0) continue;
        tested++;
        for (let c = 0; c <= 1.0001; c += 0.05) expect(penetrates(b, shape, shape.dirX, shape.dirZ, c, STAGES.leanMax + STAGES.collapseLean * c)).toBe(false);
      }
    }
    expect(tested).toBeGreaterThan(5);
  });

  it('遊びの向きの前に隣が接していて倒せないときは、見た目だけ倒せる向きへ替える。前が空いていれば遊びの向きのまま', () => {
    const min = COLLAPSE.minLeanDeg * DEG;
    let blocked = 0;
    let open = 0;
    for (const b of city.buildings) {
      if (b.height < 20) continue;
      const split = splitHeight(b, b.height * 0.55);
      for (const [dx, dz] of [
        [1, 0],
        [0, -1],
        [0.97, 0.23],
      ] as const) {
        const l = Math.hypot(dx, dz);
        // 遊びの向きのままの寸法（隣を見る）
        const straight = collapseShapeToward(b, split, dx / l, dz / l, city.buildings);
        const shape = collapseShape(b, split, dx, dz, city.buildings);
        // 同じ入力なら同じ向き
        const again = collapseShape(b, split, dx, dz, city.buildings);
        expect([again.dirX, again.dirZ]).toEqual([shape.dirX, shape.dirZ]);
        if (clearanceAngle(straight, split) >= min - 1e-9) {
          expect(shape.dirX).toBeCloseTo(dx / l, 9);
          expect(shape.dirZ).toBeCloseTo(dz / l, 9);
          open++;
        } else {
          // 替えた向きは、遊びの向きより小さくは倒せない。外形の4辺の向きのどれかで minLeanDeg まで倒せるなら、その角度まで倒せる向きを選ぶ
          const lim = clearanceAngle(shape, split);
          expect(lim).toBeGreaterThanOrEqual(clearanceAngle(straight, split) - 1e-9);
          const axes = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].map(([ax, az]) => clearanceAngle(collapseShapeToward(b, split, ax, az, city.buildings), split));
          if (Math.max(...axes) >= min - 1e-9) {
            expect(lim).toBeGreaterThanOrEqual(min - 1e-9);
            blocked++;
          }
        }
      }
    }
    expect(open).toBeGreaterThan(50);
    expect(blocked).toBeGreaterThan(20);
  });

  it('上限の角度：隙間が広いほど、隣が低いほど大きく倒せる。接していれば倒さない', () => {
    const b = midrise;
    const split = splitHeight(b, b.height * 0.55);
    const base = collapseShape(b, split, 1, 0, null);
    const at = (gap: number, top: number): number => clearanceAngle({ ...base, gaps: [gap], tops: [top] }, split);
    expect(at(30, split + 20)).toBeGreaterThan(at(8, split + 20));
    expect(at(8, split + 5)).toBeGreaterThan(at(8, split + 30));
    expect(at(0.5, split + 30)).toBe(0);
    // 隣の屋上が軸より低ければ、その隣では止めない
    expect(at(3, split - 2)).toBe(COLLAPSE.toppleMaxDeg * DEG);
  });
});
