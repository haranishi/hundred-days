// OWNER: world-art
// 灯り：空からの弱い冷たい主光（SunLight・2段の影）、空の環境光（半球光）、ステージの灯り（stage.lights）、
// 手提灯の枠（番兵の数）、炎上の枠（3つ）。灯りの数は最初に決めて変えない（途中で変えるとシェーダーが作り直しになる）。
// 使わない枠は強さ 0 にする（visible を切ると three は灯りの数が変わったとみなす）。
import { Color, Group, HemisphereLight, PointLight, Vector3, type PerspectiveCamera } from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import type { MovingLight } from '../../contract/snapshot';
import type { LightDef, LightKind, StageDef } from '../../stage/types';
import { AMBIENT, FIRE_LIGHT, FOG, KEY, POINT, SKY, type RGB } from '../render/config';
import { GAME_CURVE_DECAY } from '../render/lightCurve';
import { SKY_UNIFORMS, linearColor, skyAbove, skyHemisphereAverage } from '../render/sky';
import { seedOf } from './geometry';

const rad = (d: number): number => (d * Math.PI) / 180;
const _fwd = new Vector3();

/** 決まった揺らぎ（0 を中心に ±1 くらい）。種と時刻だけで決まる。 */
export function flicker(seed: number, t: number): number {
  const a = Math.sin(t * 7.3 + seed * 1.7) * 0.5 + Math.sin(t * 13.1 + seed * 3.1) * 0.3 + Math.sin(t * 23.7 + seed * 0.7) * 0.2;
  return a;
}

interface FixedLight {
  def: LightDef;
  light: PointLight;
  base: number;
  seed: number;
  amount: number;
  /** 揺れの大きさ（m）。篝火は炎と一緒に光の芯が揺れる */
  wobble: number;
  home: Vector3;
  disabled: boolean;
}

export class WorldLights {
  readonly group = new Group();
  readonly sun: SunLight;
  readonly hemi: HemisphereLight;
  private readonly fixed: FixedLight[] = [];
  private readonly lanterns: PointLight[] = [];
  private readonly lanternSeeds: number[] = [];
  readonly fires: PointLight[] = [];
  private moving: readonly MovingLight[] = [];
  private fire = 0;
  /** 炎上の光の置き場所（world/fire.ts が決める） */
  firePlaces: { pos: Vector3; from: number; to: number }[] = [];
  /** 霧に滲ませる灯り（篝火・灯籠・行灯と、炎上の枠）と、その濃さ */
  private readonly air: { light: PointLight; k: number }[] = [];

  constructor(stage: StageDef) {
    this.group.name = 'lights';
    // 主光：東寄りの高い所から。色は空の明るみ（地平の少し上）から取り、白へ半分寄せる
    const el = rad(KEY.elevDeg);
    const az = rad(KEY.azDeg);
    const dir: [number, number, number] = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const glowDir: [number, number, number] = [Math.cos(rad(SKY.glowDeg)) * 0.985, 0.17, Math.sin(rad(SKY.glowDeg)) * 0.985];
    const g = skyAbove(glowDir);
    const gl = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
    const keyColor: RGB = [0.5 + (0.5 * g[0]) / gl, 0.5 + (0.5 * g[1]) / gl, 0.5 + (0.5 * g[2]) / gl];
    this.sun = new SunLight(linearColor(keyColor), KEY.intensity);
    this.sun.position.set(dir[0] * 100, dir[1] * 100, dir[2] * 100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(KEY.shadow.mapSize, KEY.shadow.mapSize);
    this.sun.shadow.radius = KEY.shadow.radius;
    this.sun.shadow.bias = KEY.shadow.bias;
    this.sun.shadow.normalBias = KEY.shadow.normalBias;
    this.sun.shadow.intensity = KEY.shadow.intensity;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 60;
    this.sun.name = 'key';
    this.group.add(this.sun);

    // 半球光：空側は空の平均、地側は白砂の照り返し（空の明るさ×反射率）
    const avg = skyHemisphereAverage();
    const skyC = linearColor(avg, AMBIENT.hemiSkyGain * Math.PI);
    const groundC = linearColor(avg, AMBIENT.hemiGroundAlbedo * Math.PI);
    this.hemi = new HemisphereLight(skyC, groundC, AMBIENT.hemiIntensity);
    this.hemi.name = 'skyFill';
    this.group.add(this.hemi);

    // ステージの灯り
    for (const def of stage.lights) {
      const light = new PointLight(linearColor(def.color), 0, Math.hypot(def.radius, def.height), GAME_CURVE_DECAY);
      light.position.set(def.pos.x, def.height, def.pos.z);
      light.castShadow = false;
      light.name = `light-${def.id}`;
      const base = def.intensity * POINT.gain[def.kind];
      light.intensity = base;
      this.group.add(light);
      this.fixed.push({
        def,
        light,
        base,
        seed: (seedOf(def.id) % 1000) / 10,
        amount: POINT.flicker[def.kind as LightKind],
        wobble: def.kind === 'brazier' ? 0.12 : 0,
        home: light.position.clone(),
        disabled: false,
      });
    }

    // 手提灯の枠（番兵の数）
    for (let i = 0; i < stage.guards.length; i++) {
      const light = new PointLight(new Color(), 0, 5, GAME_CURVE_DECAY);
      light.color.copy(linearColor([1.0, 0.7, 0.4]));
      light.castShadow = false;
      light.name = `lantern-${i}`;
      light.position.set(0, -50, 0);
      this.group.add(light);
      this.lanterns.push(light);
      this.lanternSeeds.push(i * 3.7 + 1.3);
    }

    // 炎上の枠（3つ）
    for (let i = 0; i < 3; i++) {
      const light = new PointLight(linearColor(FIRE_LIGHT.color), 0, FIRE_LIGHT.radius, GAME_CURVE_DECAY);
      light.castShadow = false;
      light.name = `fire-${i}`;
      light.position.set(0, -50, 0);
      this.group.add(light);
      this.fires.push(light);
    }

    // 霧に滲ませる灯り（12 まで）
    for (const f of this.fixed) {
      const k = f.def.kind === 'brazier' ? FOG.air.brazier : f.def.kind === 'stoneLantern' ? FOG.air.stoneLantern : f.def.kind === 'andon' ? FOG.air.andon : 0;
      if (k > 0) this.air.push({ light: f.light, k });
    }
    for (const l of this.fires) this.air.push({ light: l, k: FOG.air.fire });
    this.air.splice(12);
    SKY_UNIFORMS.uKgAirN.value = this.air.length;
  }

  get lanternSlots(): number {
    return this.lanterns.length;
  }

  setMovingLights(lights: readonly MovingLight[]): void {
    this.moving = lights;
  }

  setDisabledLights(ids: readonly string[]): void {
    for (const f of this.fixed) {
      f.disabled = ids.includes(f.def.id);
      if (f.disabled) f.light.intensity = 0;
    }
    this.syncAir();
  }

  setFire(progress: number): void {
    this.fire = Math.min(1, Math.max(0, progress));
  }

  update(t: number): void {
    for (const f of this.fixed) {
      const k = 1 + f.amount * flicker(f.seed, t);
      f.light.intensity = f.disabled ? 0 : f.base * k;
      if (f.wobble > 0) {
        f.light.position.set(
          f.home.x + f.wobble * flicker(f.seed + 5, t * 0.8),
          f.home.y + f.wobble * 0.5 * flicker(f.seed + 9, t),
          f.home.z + f.wobble * flicker(f.seed + 13, t * 0.8),
        );
      }
    }
    for (let i = 0; i < this.lanterns.length; i++) {
      const light = this.lanterns[i];
      const m = this.moving[i];
      if (!m) {
        light.intensity = 0;
        light.position.set(0, -50, 0);
        continue;
      }
      light.position.set(m.x, m.y, m.z);
      light.distance = Math.hypot(m.radius, m.y);
      light.intensity = m.intensity * POINT.gain.lantern * (1 + POINT.flicker.lantern * flicker(this.lanternSeeds[i], t));
    }
    // 炎上：枠ごとに燃え始めと燃え盛りの進みを持ち、強さを上げる
    for (let i = 0; i < this.fires.length; i++) {
      const light = this.fires[i];
      const place = this.firePlaces[i];
      if (!place || this.fire <= place.from) {
        light.intensity = 0;
        light.position.set(0, -50, 0);
        continue;
      }
      const k = Math.min(1, (this.fire - place.from) / Math.max(1e-3, place.to - place.from));
      const ft = t * FIRE_LIGHT.flickerSpeed;
      light.position.set(place.pos.x + 0.7 * flicker(i * 7, ft), place.pos.y + 0.4 * flicker(i * 11, ft), place.pos.z + 0.7 * flicker(i * 5, ft * 0.9));
      light.intensity = FIRE_LIGHT.intensity * k * (0.75 + 0.25 * this.fire) * (1 + FIRE_LIGHT.flicker * flicker(i * 3 + 1, ft));
    }
    this.syncAir();
  }

  private syncAir(): void {
    const pos = SKY_UNIFORMS.uKgAir.value;
    const col = SKY_UNIFORMS.uKgAirC.value;
    this.air.forEach((a, i) => {
      pos[i].set(a.light.position.x, a.light.position.y, a.light.position.z, a.light.intensity * a.k);
      col[i].set(a.light.color.r, a.light.color.g, a.light.color.b);
    });
  }

  /** 影の届く距離を、カメラの注視の距離に合わせる（遊ぶ角度では手前を細かく、全景では寺全体を覆う）。 */
  updateForCamera(camera: PerspectiveCamera): void {
    camera.getWorldDirection(_fwd);
    const R = KEY.shadowRange;
    let focus = 60;
    if (_fwd.y < -0.04) focus = Math.min(400, camera.position.y / -_fwd.y);
    const range = Math.min(R.max, Math.max(R.min, focus * R.k + R.add));
    if (Math.abs(this.sun.shadow.camera.far - range) > 0.5) this.sun.shadow.camera.far = range;
  }

  dispose(): void {
    this.sun.dispose();
    this.hemi.dispose();
    for (const f of this.fixed) f.light.dispose();
    for (const l of this.lanterns) l.dispose();
    for (const l of this.fires) l.dispose();
  }
}
