// OWNER: tests
// r04-fx2：瓦礫の山の色の取り方。指摘「瓦礫の山は崩れたビルの外壁の色と関係の無い灰茶の迷彩模様の丘」。
// 山の色は崩れたビルから取る：外壁のかけらの色は外壁の色（塊の体積の重みの平均）を暗くして土埃へ少し寄せたもの、
// ガラスはそのビルのガラスの色、割合は破片と同じ（外壁の材質ごとの DEBRIS.kindMix）。焦げた建物ほど黒い。同じ建物なら同じ色。
// 山の表面の高さ（破片が載る所）は、置いた山の形と同じ。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { DEBRIS, RUBBLE } from '../../src/config/fx';
import { BUILDING_RULES } from '../../src/config/gameplay';
import { RubbleField, heapHeight } from '../../src/fx/rubble';
import { rubblePalette, wallLinear } from '../../src/fx/rubblePalette';
import type { MaterialKit } from '../../src/render/materials';
import { generateCity } from '../../src/world/city';
import type { Building } from '../../src/world/types';

const city = generateCity(CITY_CONFIG);
const lum = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('瓦礫の山の色の取り方', () => {
  it('同じ建物・同じ焦げなら同じ色', () => {
    const b = city.buildings[10];
    expect(rubblePalette(b, 0.3)).toEqual(rubblePalette(b, 0.3));
  });

  it('外壁のかけらの色は、その建物の外壁の色から取る（明るい外壁ほど明るく、色合いも同じ向き）', () => {
    const list = city.buildings.slice(0, 400);
    const pairs = list.map((b) => ({ wall: wallLinear(b), rubble: rubblePalette(b, 0).facade }));
    // 明るさの順が、外壁と山でそろう（順位の相関）
    const byWall = [...pairs].sort((a, b) => lum(a.wall) - lum(b.wall));
    const rank = new Map(byWall.map((p, i) => [p, i]));
    const byRubble = [...pairs].sort((a, b) => lum(a.rubble) - lum(b.rubble));
    const n = pairs.length;
    const d2 = byRubble.reduce((s, p, i) => s + (i - rank.get(p)!) ** 2, 0);
    const spearman = 1 - (6 * d2) / (n * (n * n - 1));
    expect(spearman).toBeGreaterThan(0.95);
    // 赤みの強い外壁（煉瓦など）の山は、赤みが残る
    const reddest = [...pairs].sort((a, b) => b.wall[0] / Math.max(1e-4, b.wall[2]) - a.wall[0] / Math.max(1e-4, a.wall[2]))[0];
    expect(reddest.rubble[0]).toBeGreaterThan(reddest.rubble[2]);
    // 外壁より暗い（割れた面の影と土埃）
    for (const p of pairs) expect(lum(p.rubble)).toBeLessThan(Math.max(lum(p.wall), lum(RUBBLE.dust)) + 1e-9);
  });

  it('建物ごとに山の色が違う（どこでも同じ迷彩にしない）', () => {
    const colors = new Set(city.buildings.slice(0, 200).map((b) => rubblePalette(b, 0).facade.map((c) => c.toFixed(3)).join(',')));
    expect(colors.size).toBeGreaterThan(20);
  });

  it('塊の割合は破片と同じ（外壁の材質で決まる）。ガラスの高層はガラスの塊がいちばん多い', () => {
    for (const b of city.buildings.slice(0, 300)) {
      const p = rubblePalette(b, 0);
      const [c, f, g] = DEBRIS.kindMix[BUILDING_RULES[b.kind].material];
      const s = c + f + g;
      expect(p.weights[0]).toBeCloseTo(f / s, 9);
      expect(p.weights[1]).toBeCloseTo(c / s, 9);
      expect(p.weights[2]).toBeCloseTo(g / s, 9);
      expect(p.weights[0] + p.weights[1] + p.weights[2]).toBeCloseTo(1, 9);
    }
    const tower = city.buildings.find((b) => b.kind === 'glassTower')!;
    const house = city.buildings.find((b) => b.kind === 'house')!;
    expect(rubblePalette(tower, 0).weights[2]).toBeGreaterThan(rubblePalette(house, 0).weights[2]);
  });

  it('ガラスの色はその建物のガラス、焦げた建物ほど黒くなる割合が増える', () => {
    const b: Building = city.buildings.find((x) => x.kind === 'glassTower')!;
    const p = rubblePalette(b, 0);
    const g = b.facade.glassColor;
    const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    expect(p.glass[0]).toBeCloseTo(lin(g[0]) * RUBBLE.glassShade, 9);
    expect(rubblePalette(b, 0).soot).toBe(0);
    expect(rubblePalette(b, 0.5).soot).toBeGreaterThan(0);
    expect(rubblePalette(b, 1).soot).toBeGreaterThan(rubblePalette(b, 0.5).soot);
  });
});

describe('瓦礫の山の形と表面の高さ', () => {
  it('山は縁で 0、外形の上はほぼ平らに高い', () => {
    expect(heapHeight(0.5, 0.1)).toBeLessThan(0.02);
    expect(heapHeight(0, 0)).toBeGreaterThan(0.9);
    expect(heapHeight(0.25, 0.2)).toBeGreaterThan(0.6);
  });

  it('破片が載る山の表面の高さは、置いた山と同じ形（盛り上がりの途中でも）', () => {
    const kit = { patch: <T>(m: T): T => m } as unknown as MaterialKit;
    const field = new RubbleField(kit, 8);
    const b = city.buildings.find((x) => x.kind === 'tileMidrise')!;
    const f = b.footprint;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    expect(field.heightAt(cx, cz)).toBe(-Infinity);
    field.place(b, 0.5, 1, 8, rubblePalette(b, 0));
    expect(field.heightAt(cx, cz)).toBeCloseTo(1 + heapHeight(0, 0) * 4, 6);
    field.place(b, 1, 1, 8, rubblePalette(b, 0));
    expect(field.heightAt(cx, cz)).toBeCloseTo(1 + heapHeight(0, 0) * 8, 6);
    // 外形の外、山の広がりの外では山は無い
    expect(field.heightAt(f.x1 + (f.x1 - f.x0) * 0.4 + RUBBLE.pad, cz)).toBe(-Infinity);
    field.clear();
    expect(field.heightAt(cx, cz)).toBe(-Infinity);
  });
});
