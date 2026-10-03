// OWNER: render
// 空のドーム。色は大気の表から取り、太陽の円盤と2枚の雲の層を重ねる。
// 環境マップを焼くときも同じドームを使うので、ガラスや水面に映る空も同じ色になる。
// r05-dusk：採点 r01・r03 の4位「目の高さの空に雲が無い」。高い薄い層に、低い層（ちぎれた積雲）を足した。
// 低い層は大きな塊に綿のようなこぶを足した形で、縁の幅は画素の大きさに合わせる（なめらかな fbm だけでは、ぼかした筋に見えた）。
// 雲の光は太陽の色（大気の透過率）と空の表から取る：太陽と反対を見ると日の当たる面が正面に来て桃色、
// 影の側は空の光だけで灰色。太陽を見ると縁の薄い所だけが透けて光る。遠い雲は空の色（地平の帯）へ溶かす。
import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3, Vector4 } from 'three';
import { CLOUDS, SUN } from '../config/render';
import type { Atmosphere } from './atmosphereGpu';
import { ATMOSPHERE_PARS } from './shaders/atmosphereGlsl';
import { NOISE_GLSL } from './shaders/noiseGlsl';

const vertexShader = /* glsl */ `
uniform float uRadius;
varying vec3 vDir;
void main() {
  vDir = position;
  vec3 wp = position * uRadius + cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  gl_Position.z = gl_Position.w * (1.0 - 1e-6); // 最遠に置く（何も描かれていない画素だけを埋める）
}
`;

const fragmentShader = /* glsl */ `
${ATMOSPHERE_PARS}
${NOISE_GLSL}
uniform float uDrawSun;
uniform float uSunCosOuter;
uniform float uSunCosInner;
uniform float uSunDiscRadiance;
uniform float uCloudCover;
uniform float uTime;
uniform vec4 uLowCloud;   // x: 高さ(m), y: 模様の大きさ(m), z: 覆う割合, w: fbm の段数
uniform vec3 uCloudLight; // x: 日の当たる面, y: 縁の透け, z: 空からの光
uniform float uCloudHaze; // 雲が空の色へ溶ける距離（m）
uniform float uCloudBand; // r06-light：雲の陰の面を照らす低い空の光に入れる地平の帯の割合
varying vec3 vDir;

float hgPhase(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * ATMO_PI * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}

// 雲の明るさ。lit は日の当たる側か（0..1）、edge は縁の薄さ（0..1）
vec3 cloudShade(vec3 dir, float lit, float edge) {
  float c = dot(dir, uAtmoSunDir);
  vec3 sunL = uAtmoSunColor * uAtmoRadiance;
  // 空からの光：真上の空と、その方位の低い空。r06-light：低い空の地平の帯は uCloudBand の割合だけ（陰の面は灰青に残す）
  vec3 skyL = atmoSky(vec3(0.0, 1.0, 0.0)) * 0.6 + atmoSkyBand(normalize(vec3(dir.x, 0.08, dir.z)), uCloudBand) * 0.4;
  float away = 0.5 - 0.5 * c;
  // 日の当たる面：太陽と反対を見るほど正面に来る（桃色）。太陽の側では面の端しか見えない
  vec3 front = sunL * uCloudLight.x * lit * (0.2 + 0.8 * away);
  // 縁の透け：太陽の方を見たとき、薄い所だけが前方散乱で光る
  vec3 rim = sunL * uCloudLight.y * hgPhase(c, 0.7) * edge * (0.4 + 0.6 * lit);
  return skyL * uCloudLight.z * (0.55 + 0.45 * lit) + front + rim;
}

// 高度 2.4km の薄い雲の層（カメラについて動く）。形はノイズ
vec4 highClouds(vec3 dir) {
  if (dir.y < 0.012) return vec4(0.0);
  float t = 2400.0 / dir.y;
  vec2 p = dir.xz * t;
  vec2 uv = p / 5200.0 + vec2(uTime * 0.0015, 0.0);
  float n = fbm2(uv * vec2(1.0, 1.7), 5);
  float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.22, n);
  if (cov <= 0.0) return vec4(0.0);
  vec2 toSun = normalize(uAtmoSunDir.xz + 1e-5);
  float n2 = fbm2((uv + toSun * 0.045) * vec2(1.0, 1.7), 4);
  float lit = clamp((n2 - n) * 3.0 + 0.55, 0.0, 1.0);
  vec3 col = cloudShade(dir, lit, 1.0 - cov);
  // 遠い雲は地平のもやに溶かす
  float fade = exp(-t / 26000.0) * smoothstep(0.012, 0.09, dir.y);
  return vec4(col, cov * fade * 0.92);
}

// 綿のようにふくらんだ模様（ノイズの山と谷を折り返し、丸いこぶの集まりにする）
float billow2(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int o = 0; o < 6; o++) {
    if (o >= octaves) break;
    sum += amp * (1.0 - abs(2.0 * vnoise(p) - 1.0));
    norm += amp;
    amp *= 0.5;
    p = p * 2.03 + vec2(17.1, 9.7);
  }
  return sum / norm;
}

// 低い雲の形：大きな塊（どこに雲があるか。0 より大きい所が雲）と、縁の丸いこぶ
float lowCloudBig(vec2 q) {
  return fbm2(q * 0.7, 3) - (1.0 - uLowCloud.z);
}
float lowCloudPuff(vec2 q, int octaves) {
  return 0.24 * (billow2(q * 2.6, octaves) - 0.55);
}

// 低い雲の層（世界に固定。飛ぶと動いて見える）。ちぎれた積雲で、目の高さから地平の上に見える
vec4 lowClouds(vec3 dir) {
  float h = uLowCloud.x - cameraPosition.y;
  if (dir.y < 0.003 || h <= 0.0) return vec4(0.0);
  float t = h / dir.y;
  vec2 p = cameraPosition.xz + dir.xz * t;
  vec2 uv = p / uLowCloud.y + vec2(uTime * 0.004, 0.0);
  int octaves = int(uLowCloud.w);
  // 形を少しゆがめて、塊どうしがつながった形にする
  vec2 warp = vec2(fbm2(uv * 0.6 + vec2(3.1, 7.7), 3), fbm2(uv * 0.6 + vec2(-5.3, 1.9), 3)) - 0.5;
  vec2 q = uv * vec2(1.0, 1.4) + warp * 0.7;
  float big = lowCloudBig(q);
  float puff = lowCloudPuff(q, octaves);
  float shape = big + puff;
  // 縁の幅は画素の大きさに合わせる（遠い小さな雲の縁がちらつかない。近い雲の縁は締まる）
  float w = max(fwidth(shape), 0.012);
  float density = smoothstep(-w, w + 0.05, shape);
  if (density <= 0.0) return vec4(0.0);
  vec2 toSun = normalize(uAtmoSunDir.xz + 1e-5);
  // 太陽の方へ形が薄くなる所が、日の当たる面。陰影は大きな塊で決め、こぶは縁を少し照らすだけ（内側をまだらにしない）
  vec2 qs = q + toSun * 0.06;
  float lit = clamp(0.5 + (big - lowCloudBig(qs)) * 6.0 + (puff - lowCloudPuff(qs, max(octaves - 2, 2))) * 1.5, 0.0, 1.0);
  // 厚い所（塊の内側）ほど自分の影で暗く、縁ほど薄く光を通す
  float thick = smoothstep(0.0, 0.3, big);
  lit *= mix(1.0, 0.6, thick);
  vec3 col = cloudShade(dir, lit, 1.0 - thick);
  // 遠い雲ほど空の色（地平の帯）へ寄せる。霧と同じく、色の出どころは空の表
  float haze = 1.0 - exp(-t / uCloudHaze);
  col = mix(col, atmoSky(dir), haze);
  float alpha = density * 0.96 * (1.0 - 0.75 * haze) * smoothstep(0.003, 0.04, dir.y);
  return vec4(col, alpha);
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = atmoSky(dir);
  vec4 hi = highClouds(dir);
  col = mix(col, hi.rgb, hi.a);
  vec4 lo = lowClouds(dir);
  col = mix(col, lo.rgb, lo.a);
  float cover = 1.0 - (1.0 - hi.a) * (1.0 - lo.a);
  if (uDrawSun > 0.5) {
    float c = dot(dir, uAtmoSunDir);
    float disc = smoothstep(uSunCosOuter, uSunCosInner, c);
    if (disc > 0.0) {
      float r = clamp((1.0 - c) / (1.0 - uSunCosOuter), 0.0, 1.0);
      float limb = 1.0 - 0.45 * r * r;
      col += uAtmoSunColor * uSunDiscRadiance * limb * disc * (1.0 - cover * 0.9);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkyDome {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

  constructor(atmosphere: Atmosphere, radius: number) {
    const outer = (SUN.discRadiusDeg * Math.PI) / 180;
    const L = CLOUDS.low;
    const material = new ShaderMaterial({
      name: 'SkyDome',
      vertexShader,
      fragmentShader,
      uniforms: {
        ...atmosphere.uniforms,
        uRadius: { value: radius },
        uDrawSun: { value: 1 },
        uSunCosOuter: { value: Math.cos(outer) },
        uSunCosInner: { value: Math.cos(outer * 0.8) },
        uSunDiscRadiance: { value: SUN.discMaxRadiance },
        uCloudCover: { value: CLOUDS.highCover },
        uTime: { value: 0 },
        uLowCloud: { value: new Vector4(L.height, L.scale, L.cover, L.octaves) },
        uCloudLight: { value: new Vector3(CLOUDS.light.front, CLOUDS.light.rim, CLOUDS.light.sky) },
        uCloudHaze: { value: CLOUDS.hazeDistance },
        uCloudBand: { value: CLOUDS.ambientBand },
      },
      side: BackSide,
      depthWrite: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 64, 40), material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000; // 不透明物の後に描いて、空いた画素だけを塗る
  }

  set time(t: number) {
    this.mesh.material.uniforms.uTime.value = t;
  }

  /** 環境マップを焼くときは太陽の円盤を消す（太陽は平行光源が受け持つ）。 */
  set drawSun(on: boolean) {
    this.mesh.material.uniforms.uDrawSun.value = on ? 1 : 0;
  }
}
