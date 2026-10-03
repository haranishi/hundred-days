// OWNER: tests
// r05-camera：カメラを瓦礫の山の中へ入れない・視線をふさがせない規則（camera/clearance.ts）。体験の採点の B2。
// 山の形は fx/rubble.ts と同じ決め方（崩れ方の規則の moundHeight と盛り上がり）で、凸凹は上限で包む。照準の光線も同じ規則で上げる。
import { describe, expect, it } from 'vitest';
import { CameraClearance, heapEnvelope } from '../../src/camera/clearance';
import { CollapseShapes, moundHeight } from '../../src/city/collapsePose';
import { CITY_CONFIG } from '../../src/config/city';
import { CAMERA_CLEARANCE as K, DEFAULT_CAMERA_PROFILE, cameraProfileOf } from '../../src/config/camera';
import { CREATURE_CONFIG } from '../../src/config/creatures';
import { RubbleField, heapHeight } from '../../src/fx/rubble';
import { rubblePalette } from '../../src/fx/rubblePalette';
import { fixedCamera } from '../../src/gameplay/aim';
import { directionOf, vec3 } from '../../src/gameplay/math';
import type { MaterialKit } from '../../src/render/materials';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import type { Building } from '../../src/world/types';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const groundAt = (): number => city.groundLevel;
const N = city.buildings.length;

/** 建物 ids を「崩れ終わった（瓦礫）」にした壊れ方の表。 */
function rubbleOf(ids: number[], collapse = 1): { stage: Uint8Array; collapse: Float32Array; splitY: Float32Array; dirX: Float32Array; dirZ: Float32Array } {
  const d = { stage: new Uint8Array(N), collapse: new Float32Array(N), splitY: new Float32Array(N), dirX: new Float32Array(N), dirZ: new Float32Array(N).fill(1) };
  for (const id of ids) {
    const b = city.buildings[id];
    d.stage[id] = collapse >= 1 ? 5 : 4;
    d.collapse[id] = collapse;
    d.splitY[id] = b.masses[0].y0 + (b.height - b.masses[0].y0) * 0.45;
  }
  return d;
}

const center = (b: Building): { x: number; z: number } => ({ x: (b.footprint.x0 + b.footprint.x1) / 2, z: (b.footprint.z0 + b.footprint.z1) / 2 });
const tall = city.buildings.filter((b) => b.height > 45 && b.height < 120).slice(0, 12);

describe('瓦礫の山の形', () => {
  it('包む形は、fx/rubble.ts の山（凸凹を含む・4つの向き）より低くならない', () => {
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 60; j++) {
        const u = i / 60 - 0.5;
        const v = j / 60 - 0.5;
        for (const [a, b] of [[u, v], [-v, u], [-u, -v], [v, -u]]) expect(heapEnvelope(u, v)).toBeGreaterThanOrEqual(heapHeight(a, b) - 1e-12);
      }
    }
  });

  it('置いた山（fx と同じ寸法・同じ盛り上がり）の表面は、どこでもカメラの規則の山の上面より低い', () => {
    const kit = { patch: <T>(m: T): T => m } as unknown as MaterialKit;
    const field = new RubbleField(kit, 64);
    const shapes = new CollapseShapes(city.buildings);
    const ids = tall.map((b) => b.id);
    const d = rubbleOf(ids);
    const cl = new CameraClearance(city.buildings, index, groundAt);
    cl.refresh(d);
    expect(cl.count).toBe(ids.length);
    for (const id of ids) {
      const b = city.buildings[id];
      const shape = shapes.get(b, d.splitY[id], d.dirX[id], d.dirZ[id]);
      field.place(b, 1, city.groundLevel, moundHeight(shape), rubblePalette(b, 0));
    }
    let checked = 0;
    for (const b of tall) {
      const f = b.footprint;
      for (let i = -6; i <= 26; i++) {
        for (let j = -6; j <= 26; j++) {
          const x = f.x0 + ((f.x1 - f.x0) * i) / 20;
          const z = f.z0 + ((f.z1 - f.z0) * j) / 20;
          const real = field.heightAt(x, z);
          if (real === -Infinity) continue;
          expect(cl.heapTopAt(x, z)).toBeGreaterThanOrEqual(real - 1e-6);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('盛り上がりの途中は低く、崩れ始める前とやり直しの後は山が無い', () => {
    const b = tall[0];
    const c = center(b);
    const cl = new CameraClearance(city.buildings, index, groundAt);
    cl.refresh(rubbleOf([], 1));
    expect(cl.heapTopAt(c.x, c.z)).toBe(-Infinity);
    cl.refresh(rubbleOf([b.id], 0.2));
    const early = cl.heapTopAt(c.x, c.z);
    cl.refresh(rubbleOf([b.id], 1));
    const full = cl.heapTopAt(c.x, c.z);
    expect(full).toBeGreaterThan(city.groundLevel + 2);
    expect(early === -Infinity || early < full).toBe(true);
    cl.refresh(rubbleOf([], 1));
    expect(cl.heapTopAt(c.x, c.z)).toBe(-Infinity);
  });
});

describe('カメラと竜の間の山を網点で透かす（体が埋まっている山）', () => {
  it('視線が山の上面より下を通る山だけを集める', () => {
    const b = tall[1];
    const c = center(b);
    const cl = new CameraClearance(city.buildings, index, groundAt);
    cl.refresh(rubbleOf([b.id]));
    const top = cl.heapTopAt(c.x, c.z);
    const cam = vec3(c.x - 90, top + 30, c.z);
    const out = new Set<number>();
    // 山の中ほど（上面より下）を通る視線
    cl.heapsBlocking(cam, vec3(c.x, top - 4, c.z), out);
    expect(out.has(b.id)).toBe(true);
    // 山の上を越える視線
    const out2 = new Set<number>();
    cl.heapsBlocking(cam, vec3(c.x + 60, top + 25, c.z), out2);
    expect(out2.has(b.id)).toBe(false);
    // 山の無い向き
    const out3 = new Set<number>();
    cl.heapsBlocking(cam, vec3(c.x - 90, top, c.z + 200), out3);
    expect(out3.size).toBe(0);
  });
});

describe('カメラを山の上へ逃がす（照準の光線も同じ規則）', () => {
  it('決まった距離のカメラが山の中に入るなら、山の上面＋余裕まで上げる。視線の向きは変えない', () => {
    const p = DEFAULT_CAMERA_PROFILE;
    let lifted = 0;
    for (const b of tall) {
      const c = center(b);
      const cl = new CameraClearance(city.buildings, index, groundAt);
      cl.refresh(rubbleOf([b.id]));
      const top = cl.heapTopAt(c.x, c.z);
      // カメラが山の真上に来るように、体を山の中心から視線の向きへ距離だけ前に置き、見上げる（カメラは地面から minHeight まで下がる）
      const view = { yaw: 0.3, pitch: 10 * (Math.PI / 180) };
      const dd = directionOf(view.yaw, view.pitch);
      const dist = 74;
      const body = vec3(c.x + dd.x * dist * 0.95, city.groundLevel + 9.5, c.z + dd.z * dist * 0.95);
      const plain = fixedCamera(body, null, city.groundLevel, dist, view);
      const safe = fixedCamera(body, null, city.groundLevel, dist, view, vec3(), p, cl, false);
      const under = cl.heapTopAt(safe.x, safe.z);
      expect(safe.x).toBe(plain.x);
      expect(safe.z).toBe(plain.z);
      if (under > -Infinity) expect(safe.y).toBeGreaterThanOrEqual(under + K.rubbleClear - 1e-9);
      if (plain.y < under) lifted++;
      expect(top).toBeGreaterThan(-Infinity);
    }
    expect(lifted).toBeGreaterThan(0);
  });

  it('カメラと体の間の山を、視線が越えるまで上げる（上限は距離の sightLiftShare 倍）', () => {
    let tested = 0;
    for (const b of tall) {
      const c = center(b);
      const cl = new CameraClearance(city.buildings, index, groundAt);
      cl.refresh(rubbleOf([b.id]));
      // 山の向こう 50m に体、こちら 60m にカメラ（山の上面より低い所）
      const target = vec3(c.x + 50, city.groundLevel + 14, c.z);
      const cam = vec3(c.x - 60, city.groundLevel + 13, c.z);
      const cap = 1000;
      const lift = cl.sightLift(cam, target, cap, 0);
      expect(lift).toBeGreaterThan(0);
      // 上げた後の視線は、体のまわり（sightSkip）を除いて山の上面＋余裕を越える
      const L = Math.hypot(target.x - cam.x, target.z - cam.z);
      for (let s = 0; s <= 1 - K.sightSkip / L; s += 0.01) {
        const x = cam.x + (target.x - cam.x) * s;
        const y = cam.y + lift + (target.y - cam.y - lift) * s;
        const top = cl.heapTopAt(x, c.z);
        if (top > -Infinity) expect(y).toBeGreaterThanOrEqual(top + K.sightMargin - 0.6);
      }
      // 上限で止まる
      expect(cl.sightLift(cam, target, 3, 0)).toBeLessThanOrEqual(3);
      tested++;
    }
    expect(tested).toBeGreaterThan(5);
  });

  it('ビルを越える持ち上げは、飛んでいる雷翼だけ（紅竜・焔角・地上では上げない）', () => {
    const b = tall[2];
    const c = center(b);
    const cl = new CameraClearance(city.buildings, index, groundAt);
    cl.refresh(rubbleOf([]));
    const body = vec3(c.x + 60, city.groundLevel + 25, c.z);
    const view = { yaw: -Math.PI / 2, pitch: -5 * (Math.PI / 180) };
    const rai = cameraProfileOf(CREATURE_CONFIG.raiyoku.camera);
    const kur = DEFAULT_CAMERA_PROFILE;
    const flying = fixedCamera(body, null, city.groundLevel, rai.distanceAir, view, vec3(), rai, cl, true);
    const grounded = fixedCamera(body, null, city.groundLevel, rai.distanceAir, view, vec3(), rai, cl, false);
    const plain = fixedCamera(body, null, city.groundLevel, rai.distanceAir, view, vec3(), rai);
    expect(grounded.y).toBe(plain.y);
    expect(flying.y).toBeGreaterThanOrEqual(plain.y);
    expect(flying.y - plain.y).toBeLessThanOrEqual(rai.buildingLift + 1e-9);
    const kFly = fixedCamera(body, null, city.groundLevel, kur.distanceAir, view, vec3(), kur, cl, true);
    expect(kFly.y).toBe(fixedCamera(body, null, city.groundLevel, kur.distanceAir, view, vec3(), kur).y);
  });
});
