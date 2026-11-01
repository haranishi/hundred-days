// OWNER: core
// 画面の重ねと HUD の部品（r03-fix-play 追加）：
// 平常の扇はプレイヤーから扇までの距離で濃さを変える（見た目の採点 4 位「白い細線が何本も交わって網に見える」）。
// レーダーは水抜き穴に 12m まで近づくと印を出す（体験の採点 3 位「水抜き穴はレーダーにも出ない」）。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SIGHT } from '../src/config/rules';
import { CONE_STYLE, RADAR } from '../src/config/view';
import type { Awareness, ConeSnap } from '../src/contract/snapshot';
import { nearHoles } from '../src/ui/radar';
import { calmEmphasis, coneDistance } from '../src/view/overlays/coneFocus';
import { ConeLayer } from '../src/view/overlays/cones';
import { HONNOJI } from './helpers';

const N = SIGHT.coneRays + 1;

/** 目 (ex, ez) から向き yaw（ラジアン）へ、半角 55°・長さ len の扇。 */
function fan(id: string, ex: number, ez: number, yaw: number, len: number, awareness: Awareness): ConeSnap {
  const poly = new Float32Array(N * 2);
  poly[0] = ex;
  poly[1] = ez;
  const half = (55 * Math.PI) / 180;
  for (let i = 1; i < N; i++) {
    const a = yaw - half + (2 * half * (i - 1)) / (N - 2);
    poly[i * 2] = ex + Math.cos(a) * len;
    poly[i * 2 + 1] = ez + Math.sin(a) * len;
  }
  return { id, poly, bands: new Float32Array(0), awareness, fill: 0 };
}

interface ConeVisLike {
  mesh: THREE.Mesh;
  line: THREE.Line;
  lineCol: THREE.BufferAttribute;
}

function layerWith(cones: ConeSnap[], player: { x: number; z: number } | null): Map<string, ConeVisLike> {
  const layer = new ConeLayer(new THREE.Group());
  layer.update(cones, player);
  return (layer as unknown as { cones: Map<string, ConeVisLike> }).cones;
}

describe('平常の扇の濃さ（プレイヤーから扇までの距離）', () => {
  it('扇の中にいれば 0、外なら辺までの距離', () => {
    const c = fan('a', 0, 0, 0, 8, 'calm');
    expect(coneDistance(c.poly, N, 3, 0)).toBe(0);
    expect(coneDistance(c.poly, N, -2, 0)).toBeCloseTo(2, 6);
    expect(coneDistance(c.poly, N, 12, 0)).toBeCloseTo(4, 1);
  });

  it('5m より近いと 1.6 倍、22m で 0（描かない）、その間は遠いほど薄い', () => {
    expect(calmEmphasis(0)).toBe(CONE_STYLE.calmFocus.nearMul);
    expect(calmEmphasis(5)).toBe(CONE_STYLE.calmFocus.nearMul);
    expect(calmEmphasis(22)).toBe(0);
    expect(calmEmphasis(40)).toBe(0);
    let prev = Infinity;
    for (let d = 5; d <= 22; d += 0.5) {
      expect(calmEmphasis(d)).toBeLessThanOrEqual(prev);
      prev = calmEmphasis(d);
    }
    expect(calmEmphasis(11.4)).toBeCloseTo(1, 1);
  });

  it('扇の層：遠い平常の扇は描かず、中に立っている平常の扇は濃く、不審・発見の扇は遠くても今の濃さのまま', () => {
    const cones = [
      fan('far', 40, 0, 0, 8, 'calm'), // 背を向けた遠い番兵
      fan('near', 4, 0, Math.PI, 8, 'calm'), // こちらを向き、扇の中にプレイヤーがいる
      fan('sus', 40, 0, 0, 8, 'suspicious'),
      fan('alert', 40, 5, 0, 8, 'alert'),
    ];
    const v = layerWith(cones, { x: 0, z: 0 });
    expect(v.get('far')?.line.visible ?? false).toBe(false);
    expect(v.get('far')?.mesh.visible ?? false).toBe(false);
    const near = v.get('near')!;
    expect(near.line.visible).toBe(true);
    // 縁の線の濃さ（目の所）：平常 0.2 の 1.6 倍
    expect(near.lineCol.getW(0)).toBeCloseTo(CONE_STYLE.calm.lineEye * CONE_STYLE.calmFocus.nearMul, 5);
    expect(v.get('sus')!.line.visible).toBe(true);
    expect(v.get('sus')!.lineCol.getW(0)).toBeCloseTo(CONE_STYLE.suspicious.lineEye, 5);
    expect(v.get('alert')!.lineCol.getW(0)).toBeCloseTo(CONE_STYLE.alert.lineEye, 5);
  });

  it('プレイヤーがいない（タイトルの背景）ときは、平常の扇も今の濃さで描く', () => {
    const v = layerWith([fan('far', 40, 0, 0, 8, 'calm')], null);
    expect(v.get('far')!.line.visible).toBe(true);
    expect(v.get('far')!.lineCol.getW(0)).toBeCloseTo(CONE_STYLE.calm.lineEye, 5);
  });
});

describe('レーダーの水抜き穴の印', () => {
  it('北東の塀の水抜き穴に 12m まで近づくと出て、それより遠いと出ない', () => {
    const hole = HONNOJI.walls.find((w) => w.crawl)!;
    const hx = (hole.a.x + hole.b.x) / 2;
    const hz = (hole.a.z + hole.b.z) / 2;
    expect(RADAR.holeRange).toBe(12);
    // 東の小路（穴の前 4m）・寺の中（穴の内 11.9m）
    expect(nearHoles(HONNOJI, hx + 4, hz)).toEqual([{ x: hx, z: hz }]);
    expect(nearHoles(HONNOJI, hx - 11.9, hz)).toHaveLength(1);
    expect(nearHoles(HONNOJI, hx - 12.5, hz)).toHaveLength(0);
    // 開始地点からは出ない
    expect(nearHoles(HONNOJI, HONNOJI.player.start.x, HONNOJI.player.start.z)).toHaveLength(0);
  });
});
