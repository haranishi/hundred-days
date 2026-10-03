// OWNER: fx
// 炎の光。点光源は数を絞って（画質ごとに3〜8個）作っておき、毎コマ「近くて強い火」へ割り当て直す。
// 数を変えるとシェーダーを作り直すので、使わない光は強さ 0 で置いておく。割り当てが変わる光はゆっくり明るさを移す。
import { PointLight, type Object3D, type Vector3 } from 'three';
import { FX } from '../config/fx';

export interface LightSource {
  /** 同じ火を続けて照らすための名前（建物の id や 'breath'） */
  key: string;
  x: number;
  y: number;
  z: number;
  /** 強さ（カンデラ相当） */
  intensity: number;
  distance: number;
  /** r04-fx2：光の色（線形。省くと建物の火の橙 FX.fireLight.color） */
  color?: readonly [number, number, number];
}

interface Slot {
  light: PointLight;
  key: string | null;
  level: number;
  /** r04-fx2：揺らぎの位相（光の番号）。three の物体の通し番号（light.id）は、ほかの物体を先に作ると変わり、撮影の明るさがずれた */
  phase: number;
}

export class FireLights {
  private readonly slots: Slot[] = [];

  constructor(parent: Object3D, count: number) {
    for (let i = 0; i < count; i++) {
      const light = new PointLight(0xffffff, 0, FX.fireLight.distance, 2);
      light.color.setRGB(...FX.fireLight.color);
      light.castShadow = false;
      light.name = `fire-light-${i}`;
      light.userData.target = 0;
      parent.add(light);
      this.slots.push({ light, key: null, level: 0, phase: i + 1 });
    }
  }

  update(sources: LightSource[], camera: Vector3, dt: number, time: number): void {
    const score = (s: LightSource): number => s.intensity / (1 + Math.hypot(s.x - camera.x, s.y - camera.y, s.z - camera.z) / 250);
    const chosen = [...sources].sort((a, b) => score(b) - score(a)).slice(0, this.slots.length);
    const wanted = new Map(chosen.map((s) => [s.key, s]));
    const free: Slot[] = [];
    for (const slot of this.slots) {
      if (slot.key !== null && wanted.has(slot.key)) {
        const s = wanted.get(slot.key)!;
        wanted.delete(slot.key);
        this.drive(slot, s, dt, time);
      } else {
        free.push(slot);
      }
    }
    for (const slot of free) {
      const next = wanted.values().next();
      if (!next.done && slot.level < 0.05) {
        wanted.delete(next.value.key);
        slot.key = next.value.key;
        this.drive(slot, next.value, dt, time);
      } else {
        // 割り当てが外れた光は消えてから付け替える
        slot.level = Math.max(0, slot.level - dt * 4);
        slot.light.intensity = slot.level * slot.light.userData.target;
        if (slot.level <= 0) slot.key = null;
      }
    }
  }

  private drive(slot: Slot, s: LightSource, dt: number, time: number): void {
    slot.level = Math.min(1, slot.level + dt * 3);
    const flicker = 0.8 + 0.2 * Math.sin(time * 11.3 + slot.phase) * Math.sin(time * 7.1 + slot.phase * 2.3);
    slot.light.userData.target = s.intensity;
    slot.light.intensity = s.intensity * slot.level * flicker;
    slot.light.distance = s.distance;
    slot.light.position.set(s.x, s.y, s.z);
    // r04-fx2：色は光ごと（吐く炎は芯の黄、建物の火は橙）。色は uniform なので、変えてもシェーダーは作り直さない
    const c = s.color ?? FX.fireLight.color;
    slot.light.color.setRGB(c[0], c[1], c[2]);
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.key = null;
      slot.level = 0;
      slot.light.intensity = 0;
    }
  }
}
