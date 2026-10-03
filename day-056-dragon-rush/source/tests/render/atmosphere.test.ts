// OWNER: tests
// 大気の計算：空の表が直接の積分と一致すること、夕方の色の向き（太陽は暖かく天頂は青い）、
// 表の座標の往復、窓の格子に使う「画素の幅で積分したパルス」が平均へ収束すること。
// r05-dusk：夕方の規則（地平の帯・高い空の紫）が太陽の向きと高さで決まること、空と霧が同じ関数から色を取ること。
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, FOG, SUN } from '../../src/config/render';
import {
  TransmittanceTable,
  buildSkyLut,
  duskBand,
  duskBandColor,
  duskWeight,
  luminance,
  sampleSkyLut,
  scatteredRadiance,
  skyLutDirection,
  skyLutUv,
  skyRadiance,
  sunDirection,
  sunTransmittance,
  type RGB,
  type Vec3,
} from '../../src/render/atmosphere';
import { Atmosphere } from '../../src/render/atmosphereGpu';
import { fpulse, fpulseC } from '../../src/render/filterMath';
import { ATMOSPHERE_PARS } from '../../src/render/shaders/atmosphereGlsl';

const table = new TransmittanceTable(ATMOSPHERE);
const sun = sunDirection(SUN.elevationDeg, SUN.azimuthDeg);
const lut = buildSkyLut(ATMOSPHERE, table, sun);
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe('大気', () => {
  it('太陽の向きは仰角と方位角のとおり（x=東、z=南）', () => {
    const s = sunDirection(0, 90);
    expect(s[0]).toBeCloseTo(1, 6);
    expect(s[1]).toBeCloseTo(0, 6);
    const west = sunDirection(10, 270);
    expect(west[0]).toBeLessThan(-0.9);
    expect(west[1]).toBeCloseTo(Math.sin((10 * Math.PI) / 180), 6);
  });

  it('夕方の太陽の光は暖色（赤 > 緑 > 青）で、太陽が高いほど白に近づく', () => {
    const low = sunTransmittance(ATMOSPHERE, table, sunDirection(8, 270));
    const high = sunTransmittance(ATMOSPHERE, table, sunDirection(60, 270));
    expect(low[0]).toBeGreaterThan(low[1]);
    expect(low[1]).toBeGreaterThan(low[2]);
    expect(high[2] / high[0]).toBeGreaterThan(low[2] / low[0]);
    expect(luminance(high)).toBeGreaterThan(luminance(low));
  });

  it('天頂は地平線より青く、太陽側の地平線は反対側より明るい', () => {
    const zenith = sampleSkyLut(lut, [0, 1, 0], sun);
    const towards = sampleSkyLut(lut, norm([sun[0], 0.05, sun[2]]), sun);
    const away = sampleSkyLut(lut, norm([-sun[0], 0.05, -sun[2]]), sun);
    expect(zenith[2] / zenith[0]).toBeGreaterThan(towards[2] / towards[0]);
    expect(luminance(towards)).toBeGreaterThan(luminance(away) * 2);
  });

  it('空の表は、太陽から離れた方向で直接の積分と 3% 以内で一致する', () => {
    const dirs: Vec3[] = [
      [0, 1, 0],
      norm([-sun[0], 0.3, -sun[2]]),
      norm([sun[2], 0.1, -sun[0]]),
      norm([0.3, 0.6, 0.4]),
    ];
    for (const d of dirs) {
      const direct = skyRadiance(ATMOSPHERE, table, d, sun);
      const fromLut = sampleSkyLut(lut, d, sun);
      for (let c = 0; c < 3; c++) expect(Math.abs(fromLut[c] - direct[c]) / direct[c]).toBeLessThan(0.03);
    }
  });

  it('表の座標と方向は往復して元に戻る', () => {
    for (const [u, v] of [
      [0.1, 0.2],
      [0.5, 0.5],
      [0.9, 0.85],
    ]) {
      const d = skyLutDirection(u, v, sun);
      const [u2, v2] = skyLutUv(d, sun);
      expect(u2).toBeCloseTo(u, 5);
      expect(v2).toBeCloseTo(v, 5);
    }
  });
});

describe('画素の幅で積分したパルス（窓・目地・標示）', () => {
  it('フィルタの幅が0に近いと、元のパルス（0 か 1）になる', () => {
    expect(fpulse(0.2, 0.5, 1e-6)).toBeCloseTo(1, 4);
    expect(fpulse(0.7, 0.5, 1e-6)).toBeCloseTo(0, 4);
    expect(fpulseC(0.5, 0.4, 1e-6)).toBeCloseTo(1, 4);
    expect(fpulseC(0.05, 0.4, 1e-6)).toBeCloseTo(0, 4);
  });

  it('フィルタが周期より広いと、どこで見ても平均（デューティ比）に収束する（遠くでちらつかない）', () => {
    for (const w of [0.2, 0.55, 0.9]) {
      for (let x = 0; x < 3; x += 0.137) {
        expect(Math.abs(fpulse(x, w, 8) - w)).toBeLessThan(w / 8 + 1e-6);
        expect(Math.abs(fpulse(x, w, 40) - w)).toBeLessThan(w / 40 + 1e-6);
      }
    }
  });

  it('値は常に 0〜1 に収まる', () => {
    for (let x = -2; x < 2; x += 0.071) {
      for (const fw of [0.01, 0.3, 1.7]) {
        const v = fpulseC(x, 0.6, fw);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

/** 太陽の方位から deg 度回した方位・仰角 el 度の方向。 */
function dirAt(deg: number, el: number): Vec3 {
  const a = ((SUN.azimuthDeg + deg) * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

/** 線形の色を sRGB に直してからの色相（度）。 */
function hueOf(c: RGB): number {
  const [r, g, b] = c.map((x) => {
    const v = Math.max(0, x) / Math.max(...c);
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  });
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

describe('夕方の規則（r05-dusk）', () => {
  it('太陽と反対の方位でも、地平は橙・その上は紫がかった青になる（物理の散乱だけでは 10° がもう青い）', () => {
    const horizon = sampleSkyLut(lut, dirAt(180, 1), sun);
    const high = sampleSkyLut(lut, dirAt(180, 50), sun);
    expect(hueOf(horizon)).toBeGreaterThan(10);
    expect(hueOf(horizon)).toBeLessThan(50);
    expect(horizon[0] / horizon[2]).toBeGreaterThan(1.5);
    expect(hueOf(high)).toBeGreaterThan(222);
    expect(hueOf(high)).toBeLessThan(260);
    // 物理だけの空（規則なし）より、10° の空が暖かい
    const physical = scatteredRadiance(ATMOSPHERE, table, dirAt(180, 10), sun);
    const withDusk = skyRadiance(ATMOSPHERE, table, dirAt(180, 10), sun);
    expect(withDusk[0] / withDusk[2]).toBeGreaterThan((physical[0] / physical[2]) * 1.3);
  });

  it('地平の帯の色は太陽の高さで決まる：低いほど赤く、40° を超えると消える（昼の空に戻る）', () => {
    const at = (el: number): RGB => duskBandColor(ATMOSPHERE, table, sunDirection(el, SUN.azimuthDeg));
    const [c5, c12, c25, c45] = [at(5), at(SUN.elevationDeg), at(25), at(45)];
    expect(c5[0] / c5[1]).toBeGreaterThan(c12[0] / c12[1]);
    expect(c12[0] / c12[1]).toBeGreaterThan(c25[0] / c25[1]);
    expect(c12[0]).toBeGreaterThan(c12[1]);
    expect(c12[1]).toBeGreaterThan(c12[2]);
    expect(duskWeight(ATMOSPHERE, sun)).toBe(1);
    expect(c45).toEqual([0, 0, 0]);
    // 太陽が高い日の空には、帯も紫も掛からない（物理の散乱と一致する）
    const noon = sunDirection(60, SUN.azimuthDeg);
    const d: Vec3 = dirAt(180, 20);
    const a = skyRadiance(ATMOSPHERE, table, d, noon);
    const b = scatteredRadiance(ATMOSPHERE, table, d, noon);
    for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k], 9);
  });

  it('地平の帯は太陽の方位で決まる：太陽と反対の側がいちばん強く、左右は対称', () => {
    const band = (deg: number): RGB => duskBand(ATMOSPHERE, table, dirAt(deg, 2), sun);
    expect(luminance(band(180))).toBeGreaterThan(luminance(band(0)) * 2);
    const [l, r] = [band(90), band(-90)];
    for (let k = 0; k < 3; k++) expect(l[k]).toBeCloseTo(r[k], 9);
    // 仰角が上がるほど薄れる
    expect(luminance(duskBand(ATMOSPHERE, table, dirAt(180, 25), sun))).toBeLessThan(luminance(band(180)) * 0.25);
  });

  it('空と霧の色は同じ関数から出る：霧の散乱光は空の表の色で、太陽と反対の遠い地平では帯の暖色になる', () => {
    // 霧（atmoApplyFog）の散乱光は、空のドームと同じ空の表を引く。r06-light：色は距離で決め（atmoHazeColor）、遠いもやは atmoSky そのもの
    expect(ATMOSPHERE_PARS).toMatch(/vec3 inscatter = atmoHazeColor\(d \/ max\(dist, 1e-3\), dist\) \* uAtmoFog\.w;/);
    // CPU 側の skyAt は GLSL の atmoSky と同じ表・同じ式（地平より下は地平の値）
    const atm = new Atmosphere();
    for (const d of [dirAt(180, 0), dirAt(180, 30), dirAt(60, 5), dirAt(180, -10)]) {
      const fromAtm = atm.skyAt(d);
      const fromLut = sampleSkyLut(lut, [d[0], Math.max(0, d[1]), d[2]], sun).map((x) => x * SUN.illuminance);
      for (let k = 0; k < 3; k++) expect(Math.abs(fromAtm[k] - fromLut[k]) / fromLut[k]).toBeLessThan(1e-6);
    }
    const fog = atm.hazeAt(dirAt(180, 0), FOG.bandDistance[1]).map((x) => x * FOG.inscatter) as RGB;
    expect(hueOf(fog)).toBeGreaterThan(10);
    expect(hueOf(fog)).toBeLessThan(50);
    // 遠い霧にも地平の帯が入る：夕方の規則を外した空の表から取った霧より、赤が強く明るい
    const plain = sampleSkyLut(buildSkyLut({ ...ATMOSPHERE, dusk: undefined }, table, sun), dirAt(180, 0), sun).map((x) => x * SUN.illuminance) as RGB;
    expect(fog[0] / fog[2]).toBeGreaterThan((plain[0] / plain[2]) * 1.1);
    expect(luminance(fog)).toBeGreaterThan(luminance(plain) * 1.2);
  });
});
