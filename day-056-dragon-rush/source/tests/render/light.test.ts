// OWNER: tests
// r06-light：光の色の置き所の規則（採点 r05 の1位「画面が琥珀ひと色」と3位「暗い谷間で怪獣が沈む」）。
// ・暖かい色は直射の光と地平の帯（と遠いもや）にだけ持たせ、日陰に回る補助光は空の上の青紫から取る
// ・もやの色は距離で決める（近いもやに帯の暖色を乗せない。遠いもやは空のドームと同じ地平の帯の色）
// ・怪獣は、太陽の届かない所で正面の補助光が強まり、同じ所の壁より明るさの下限を持つ
import { MeshStandardMaterial, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { AMBIENT, ATMOSPHERE, FOG, MONSTER_LIGHT, SUN } from '../../src/config/render';
import { MONSTER_LIGHT_GLSL, createDragonMaterials, monsterFill } from '../../src/dragon/dragonMaterial';
import {
  TransmittanceTable,
  ambientIrradianceDirect,
  ambientSH,
  buildSkyLut,
  duskBandColor,
  luminance,
  sampleSkyLut,
  shIrradiance,
  sunDirection,
  sunTransmittance,
  type RGB,
  type Vec3,
} from '../../src/render/atmosphere';
import { Atmosphere } from '../../src/render/atmosphereGpu';
import { IBL_IRRADIANCE_LINE, MaterialKit, ambientLightsFragmentMaps } from '../../src/render/materials';
import { ATMOSPHERE_PARS } from '../../src/render/shaders/atmosphereGlsl';

const table = new TransmittanceTable(ATMOSPHERE);
const sun = sunDirection(SUN.elevationDeg, SUN.azimuthDeg);
const lut = buildSkyLut(ATMOSPHERE, table, sun);
const sh = ambientSH(ATMOSPHERE, table, lut, sun, AMBIENT.sky);
const atm = new Atmosphere();

/** 太陽の方位から deg 度回した方位・仰角 el 度の方向。 */
function dirAt(deg: number, el: number): Vec3 {
  const a = ((SUN.azimuthDeg + deg) * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

/** 線形の色を sRGB に直してからの色相（度）と彩度（0..1）。 */
function hsOf(c: RGB): { hue: number; sat: number } {
  const m = Math.max(...c);
  const [r, g, b] = c.map((x) => {
    const v = Math.max(0, x) / m;
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  });
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d < 1e-6) return { hue: 0, sat: 0 };
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: h * 60, sat: d / mx };
}
const hueOf = (c: RGB): number => hsOf(c).hue;

/** 材質を差し替え口の onBeforeCompile に通した後の、標準材質のシェーダー（three の本体の ShaderLib から）。 */
function compiled(material: MeshStandardMaterial): { fragmentShader: string; uniforms: Record<string, unknown> } {
  const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, {} as WebGLRenderer);
  return shader;
}

describe('暖色は直射と地平にだけ（r06-light）', () => {
  it('直射の光と地平の帯は暖色（色相 10〜45°）', () => {
    expect(hueOf(sunTransmittance(ATMOSPHERE, table, sun))).toBeGreaterThan(15);
    expect(hueOf(sunTransmittance(ATMOSPHERE, table, sun))).toBeLessThan(45);
    expect(hueOf(duskBandColor(ATMOSPHERE, table, sun))).toBeGreaterThan(10);
    expect(hueOf(duskBandColor(ATMOSPHERE, table, sun))).toBeLessThan(45);
    const horizon = sampleSkyLut(lut, dirAt(180, 1), sun);
    expect(hueOf(horizon)).toBeGreaterThan(10);
    expect(hueOf(horizon)).toBeLessThan(50);
  });

  it('日陰に回る補助光は空の上の青紫：上・横・太陽の反対と側を向いた面は青（色相 190〜250°、青 > 赤）', () => {
    for (const n of [[0, 1, 0] as Vec3, dirAt(90, 0), dirAt(180, 0), dirAt(0, 0), dirAt(180, 45)]) {
      const e = shIrradiance(sh, n);
      expect(e[2]).toBeGreaterThan(e[0]);
      expect(hueOf(e)).toBeGreaterThan(190);
      expect(hueOf(e)).toBeLessThan(250);
    }
    // 上を向いた面の補助光は、空の上（仰角 50°）の色に近い
    expect(Math.abs(hueOf(shIrradiance(sh, [0, 1, 0])) - hueOf(sampleSkyLut(lut, dirAt(180, 50), sun)))).toBeLessThan(25);
  });

  it('地平の帯と日の当たった照り返しを全部入れた補助光なら暖色になる（規則が日陰の琥珀を止めている）', () => {
    const full = ambientSH(ATMOSPHERE, table, lut, sun, { ...AMBIENT.sky, bandWeight: 1, cityHorizonDeg: 0, sunlitFraction: 1 });
    for (const n of [dirAt(90, 0), dirAt(180, 0)]) {
      const warm = shIrradiance(full, n);
      expect(warm[0]).toBeGreaterThan(warm[2]);
      expect(hueOf(warm)).toBeLessThan(60);
    }
  });

  it('補助光に入れる帯はわずか：帯を外しても、横向きの面の補助光の明るさは 10% 未満しか変わらない', () => {
    const none = ambientSH(ATMOSPHERE, table, lut, sun, { ...AMBIENT.sky, bandWeight: 0 });
    for (const n of [dirAt(90, 0), dirAt(180, 0)]) {
      const a = luminance(shIrradiance(sh, n));
      const b = luminance(shIrradiance(none, n));
      expect(Math.abs(a - b) / a).toBeLessThan(0.1);
    }
  });

  it('球面調和の補助光は、直接の積分と明るさ 8% 以内・色相 8° 以内で一致する', () => {
    for (const n of [[0, 1, 0] as Vec3, [0, -1, 0] as Vec3, dirAt(90, 0), dirAt(180, 0), dirAt(0, 0), dirAt(30, 40)]) {
      const fromSh = shIrradiance(sh, n);
      const direct = ambientIrradianceDirect(ATMOSPHERE, table, lut, sun, AMBIENT.sky, n);
      expect(Math.abs(luminance(fromSh) - luminance(direct)) / luminance(direct)).toBeLessThan(0.08);
      const dh = Math.abs(hueOf(fromSh) - hueOf(direct));
      expect(Math.min(dh, 360 - dh)).toBeLessThan(8);
    }
  });

  it('GPU の補助光は CPU と同じ係数で、three の拡散の補助光の1行だけを差し替える（鏡面の環境マップは残す）', () => {
    const k = SUN.illuminance * AMBIENT.skyIntensity;
    for (const n of [[0, 1, 0] as Vec3, dirAt(90, 0)]) {
      const g = atm.ambientAt(n);
      const c = shIrradiance(sh, n);
      for (let i = 0; i < 3; i++) expect(g[i]).toBeCloseTo(c[i] * k, 6);
    }
    // GPU に渡す mat3（赤・緑・青）の要素の並びで、GLSL の atmoAmbient と同じ式（Σ 重み i × 要素 i）を計算すると CPU と一致する
    const u = atm.uniforms;
    for (const n of [[0, 1, 0] as Vec3, dirAt(90, 0), dirAt(0, -30)]) {
      const [x, y, z] = n;
      const w = [0.886227, 2 * 0.511664 * y, 2 * 0.511664 * z, 2 * 0.511664 * x, 2 * 0.429043 * x * y, 2 * 0.429043 * y * z, 0.743125 * z * z - 0.247708, 2 * 0.429043 * x * z, 0.429043 * (x * x - y * y)];
      const fromMat = [u.uAtmoAmbientR, u.uAtmoAmbientG, u.uAtmoAmbientB].map((m) => Math.max(0, w.reduce((acc, wi, i) => acc + wi * m.value.elements[i], 0)));
      const cpu = atm.ambientAt(n);
      for (let i = 0; i < 3; i++) expect(fromMat[i]).toBeCloseTo(cpu[i], 5);
    }
    const chunk = ambientLightsFragmentMaps();
    expect(chunk).not.toContain(IBL_IRRADIANCE_LINE);
    expect(chunk).toMatch(/iblIrradiance \+= atmoAmbient\(/);
    expect(chunk).toContain('getIBLRadiance');
    expect(ATMOSPHERE_PARS).toMatch(/vec3 atmoAmbient\(vec3 n\)/);
  });

  it('差し替え口を通った材質は、拡散の補助光が空の球面調和になる（街・怪獣・瓦礫・粒以外の全部の標準材質）', () => {
    const kit = new MaterialKit(atm, null);
    const s = compiled(kit.patch(new MeshStandardMaterial(), { key: 'light-test' }));
    expect(s.fragmentShader).toContain('iblIrradiance += atmoAmbient( transformNormalByInverseViewMatrix( geometryNormal, viewMatrix ) );');
    expect(s.fragmentShader).not.toContain('#include <lights_fragment_maps>');
    expect(s.uniforms).toHaveProperty('uAtmoAmbientR');
  });
});

describe('もやは距離で付く（r06-light）', () => {
  const down = (deg: number): Vec3 => dirAt(deg, -20);

  it('遠いもやは地平の帯の色（空のドームと同じ atmoSky）、近いもやには帯の暖色が乗らない', () => {
    for (const deg of [90, 180]) {
      const far = atm.hazeAt(down(deg), FOG.bandDistance[1] + 1000);
      const sky = atm.skyAt(down(deg));
      for (let i = 0; i < 3; i++) expect(Math.abs(far[i] - sky[i]) / sky[i]).toBeLessThan(1e-6);
      expect(hueOf(far)).toBeLessThan(50);
      const near = atm.hazeAt(down(deg), 600);
      expect(near[0] / near[2]).toBeLessThan((far[0] / far[2]) * 0.6);
      expect(hsOf(near).sat).toBeLessThan(hsOf(far).sat);
      // 近いもやは中立から冷たい側（赤が青を上回らない）。手前の街と煙を琥珀にしない
      expect(near[0]).toBeLessThan(near[2]);
    }
  });

  it('帯の色は距離とともに増え（暖かさが単調に増す）、帯が入り始める距離までは近いもやのまま', () => {
    const d = down(180);
    let last = -1;
    for (const dist of [300, FOG.bandDistance[0], (FOG.bandDistance[0] + FOG.bandDistance[1]) / 2, FOG.bandDistance[1]]) {
      const c = atm.hazeAt(d, dist);
      const warmth = c[0] / c[2];
      expect(warmth).toBeGreaterThanOrEqual(last - 1e-9);
      last = warmth;
    }
    const a = atm.hazeAt(d, 300);
    const b = atm.hazeAt(d, FOG.bandDistance[0]);
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 9);
  });

  it('面と粒の霧は、距離で色を決める関数を通る', () => {
    expect(ATMOSPHERE_PARS).toMatch(/vec3 inscatter = atmoHazeColor\(/);
    // 近いもや（持ち上げた仰角・帯は uAtmoHazeBand.w の割合）から、遠いもや（空のドームと同じ atmoSky）へ距離で移る
    expect(ATMOSPHERE_PARS).toMatch(/float far = smoothstep\(uAtmoHazeBand\.x, uAtmoHazeBand\.y, dist\);/);
    expect(ATMOSPHERE_PARS).toMatch(/vec3 farColor = far > 0\.0 \? atmoSky\(dir\) : vec3\(0\.0\);/);
    expect(ATMOSPHERE_PARS).toMatch(/return mix\(atmoSkyBand\(lifted, uAtmoHazeBand\.w\), farColor, far\);/);
  });
});

describe('怪獣を浮かせる光（r06-light）', () => {
  const sunLum = luminance([atm.sunColor.r, atm.sunColor.g, atm.sunColor.b]) * SUN.illuminance;

  it('正面の補助光は直射を受けない面（影の中・逆光で太陽と反対を向く面）で強く、日なたではわずか（夕方の日なたの色味を崩さない）', () => {
    expect(monsterFill(0)).toBeGreaterThan(monsterFill(1) * 4);
    expect(monsterFill(0.5)).toBeGreaterThan(monsterFill(1));
    expect(monsterFill(0.5)).toBeLessThan(monsterFill(0));
    expect(monsterFill(1)).toBeLessThan(0.05);
    expect(monsterFill(1)).toBeGreaterThanOrEqual(0);
  });

  it('影の中の怪獣が受ける光は、同じ所の壁が受ける補助光の 1.6 倍以上（明るさの下限。sRGB でおよそ 1.25 倍）', () => {
    for (const n of [dirAt(90, 0), dirAt(180, 0), dirAt(0, 0)]) {
      const wall = luminance(atm.ambientAt(n));
      const monster = wall + monsterFill(0) * sunLum;
      expect(monster / wall).toBeGreaterThan(1.6);
    }
  });

  it('怪獣の材質（紅竜・雷翼・焔角と標本が共有）は、光の計算の後に怪獣の光を足す', () => {
    const kit = new MaterialKit(atm, null);
    const mats = createDragonMaterials(kit);
    for (const m of [mats.skin, mats.membrane]) {
      const s = compiled(m);
      expect(s.fragmentShader).toContain(MONSTER_LIGHT_GLSL);
      expect(s.fragmentShader.indexOf(MONSTER_LIGHT_GLSL)).toBeGreaterThan(s.fragmentShader.indexOf('#include <lights_fragment_end>'));
    }
  });

  it('材質のシェーダーは、影を受けた後の太陽（csmSunIn）と面の向き（太陽を向く度合い）で補助光を強め、縁の光は太陽の向き（uAtmoSunDir）から取る', () => {
    expect(MONSTER_LIGHT_GLSL).toContain('csmSunIn');
    expect(MONSTER_LIGHT_GLSL).toContain('uAtmoSunDir');
    expect(MONSTER_LIGHT_GLSL).toMatch(/mDirect = mSunVis \* smoothstep\( 0\.0, [0-9.]+, dot\( normal, mSunV \) \)/);
    expect(MONSTER_LIGHT_GLSL).toMatch(/\* \( 1\.0 - mDirect \)/);
    expect(MONSTER_LIGHT_GLSL).toContain(MONSTER_LIGHT.fillShade.toFixed(4));
    expect(MONSTER_LIGHT_GLSL).toContain(MONSTER_LIGHT.rim.toFixed(4));
    expect(MONSTER_LIGHT_GLSL).toContain(MONSTER_LIGHT.rimSheen.toFixed(4));
    // 縁の光は、日なたでは順光ほど弱め（rimInSun）、逆光（太陽がカメラの向こう）と影の中では強い
    expect(MONSTER_LIGHT_GLSL).toMatch(/mBack = saturate\( -dot\( mV, mSunV \) \)/);
    expect(MONSTER_LIGHT_GLSL).toContain(`mix( 1.0, mix( ${MONSTER_LIGHT.rimInSun.toFixed(3)}, 1.0, mBack ), mSunVis )`);
    expect(MONSTER_LIGHT.rimInSun).toBeLessThan(0.5);
  });
});
