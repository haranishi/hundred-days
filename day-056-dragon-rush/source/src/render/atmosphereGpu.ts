// OWNER: render
// 大気の計算結果を GPU に渡す。空の表のテクスチャと、全材質で共有する uniform を持つ。
import { ClampToEdgeWrapping, Color, DataTexture, DataUtils, HalfFloatType, LinearFilter, Matrix3, RGBAFormat, Vector3, Vector4 } from 'three';
import { AMBIENT, ATMOSPHERE, FOG, SUN } from '../config/render';
import {
  SKY_LUT,
  TransmittanceTable,
  ambientSH,
  buildSkyLut,
  duskBandColor,
  hazeColor,
  sampleSkyLut,
  shIrradiance,
  sunDirection,
  sunTransmittance,
  type RGB,
  type Vec3,
} from './atmosphere';

export interface AtmosphereUniforms {
  uAtmoLut: { value: DataTexture };
  uAtmoSunDir: { value: Vector3 };
  uAtmoSunColor: { value: Color };
  uAtmoRadiance: { value: number };
  uAtmoFog: { value: Vector4 };
  uAtmoFogTint: { value: Vector3 };
  /** 遠いほど濃くなる霞（x: 足す光学的厚み, y: 始まりの距離, z: 満ちる距離）。r01-city */
  uAtmoHaze: { value: Vector3 };
  /** r06-light：地平の帯の色（大気の上端の太陽照度 1 あたり）。空の表の A（帯の重み）に掛ける */
  uAtmoBand: { value: Vector3 };
  /** r06-light：霧に帯の色が入り始める距離と、全部入る距離（m）、近い霧の色を取る仰角の下限（sin）、近い霧に残す帯の割合 */
  uAtmoHazeBand: { value: Vector4 };
  /**
   * r06-light：補助光の球面調和（9個の係数、画面の単位）を赤・緑・青ごとに mat3 の要素（列の順）に入れたもの。
   * vec3 の配列にしない（three は配列の uniform を描画命令ごとに送り直し、WebKit で closeup が1コマ約 7ms 重くなった）
   */
  uAtmoAmbientR: { value: Matrix3 };
  uAtmoAmbientG: { value: Matrix3 };
  uAtmoAmbientB: { value: Matrix3 };
}

export class Atmosphere {
  readonly sunDir = new Vector3();
  /** 直射光の色（大気の透過率、線形） */
  readonly sunColor = new Color();
  readonly sunIlluminance = SUN.illuminance;
  readonly uniforms: AtmosphereUniforms;
  private readonly table = new TransmittanceTable(ATMOSPHERE);
  private lut: Float32Array = new Float32Array(0);
  private ambient: RGB[] = [];
  private readonly texture: DataTexture;

  constructor() {
    const { width, height } = SKY_LUT;
    this.texture = new DataTexture(new Uint16Array(width * height * 4), width, height, RGBAFormat, HalfFloatType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.uniforms = {
      uAtmoLut: { value: this.texture },
      uAtmoSunDir: { value: this.sunDir },
      uAtmoSunColor: { value: this.sunColor },
      uAtmoRadiance: { value: SUN.illuminance },
      uAtmoFog: { value: new Vector4(FOG.density, FOG.heightFalloff, FOG.startDistance, FOG.inscatter) },
      uAtmoFogTint: { value: new Vector3(...FOG.extinctionTint) },
      uAtmoHaze: { value: new Vector3(FOG.urbanHaze.depth, FOG.urbanHaze.from, FOG.urbanHaze.to) },
      uAtmoBand: { value: new Vector3() },
      uAtmoHazeBand: { value: new Vector4(FOG.bandDistance[0], FOG.bandDistance[1], Math.sin((FOG.nearLiftDeg * Math.PI) / 180), FOG.nearBand) },
      uAtmoAmbientR: { value: new Matrix3() },
      uAtmoAmbientG: { value: new Matrix3() },
      uAtmoAmbientB: { value: new Matrix3() },
    };
    this.setSun(SUN.elevationDeg, SUN.azimuthDeg);
  }

  /** 太陽を動かしたら表を作り直す（CPU で数十 ms）。 */
  setSun(elevationDeg: number, azimuthDeg: number): void {
    const dir = sunDirection(elevationDeg, azimuthDeg);
    this.sunDir.set(dir[0], dir[1], dir[2]);
    const t = sunTransmittance(ATMOSPHERE, this.table, dir);
    this.sunColor.setRGB(t[0], t[1], t[2]);
    this.lut = buildSkyLut(ATMOSPHERE, this.table, dir);
    const data = this.texture.image.data as Uint16Array;
    for (let i = 0; i < this.lut.length; i++) data[i] = DataUtils.toHalfFloat(this.lut[i]);
    this.texture.needsUpdate = true;
    const band = duskBandColor(ATMOSPHERE, this.table, dir);
    this.uniforms.uAtmoBand.value.set(band[0], band[1], band[2]);
    // r06-light：補助光は空の表から作る（空の上は帯を減らした空、低い所と下は街と地面の照り返し）
    this.ambient = ambientSH(ATMOSPHERE, this.table, this.lut, dir, AMBIENT.sky);
    const k = this.sunIlluminance * AMBIENT.skyIntensity;
    const channels = [this.uniforms.uAtmoAmbientR.value, this.uniforms.uAtmoAmbientG.value, this.uniforms.uAtmoAmbientB.value];
    channels.forEach((m, c) => this.ambient.forEach((coef, i) => (m.elements[i] = coef[c] * k)));
  }

  /** r06-light：方向 dir・距離 dist（m）のもやの色（画面の単位）。GPU の atmoHazeColor と同じ。 */
  hazeAt(dir: Vec3, dist: number): RGB {
    const b = this.uniforms.uAtmoBand.value;
    const sun: Vec3 = [this.sunDir.x, this.sunDir.y, this.sunDir.z];
    const c = hazeColor(this.lut, [b.x, b.y, b.z], dir, dist, sun, FOG);
    return [c[0] * this.sunIlluminance, c[1] * this.sunIlluminance, c[2] * this.sunIlluminance];
  }

  /** r06-light：法線 n（ワールド）の面が受ける補助光の放射照度（画面の単位）。GPU の atmoAmbient と同じ。 */
  ambientAt(n: Vec3): RGB {
    const e = shIrradiance(this.ambient, n);
    const k = this.sunIlluminance * AMBIENT.skyIntensity;
    return [e[0] * k, e[1] * k, e[2] * k];
  }

  /** 方向 dir の空の色（画面の単位）。GPU と同じ表を CPU で引く。 */
  skyAt(dir: Vec3): RGB {
    const d: Vec3 = [dir[0], Math.max(0, dir[1]), dir[2]];
    const s = sampleSkyLut(this.lut, d, [this.sunDir.x, this.sunDir.y, this.sunDir.z]);
    return [s[0] * this.sunIlluminance, s[1] * this.sunIlluminance, s[2] * this.sunIlluminance];
  }
}
