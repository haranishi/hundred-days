// OWNER: render
// 湾の水面。反射は「鏡像（街・空・竜）＋空の表」を波の法線でゆがめて混ぜ、太陽のきらめきを足す。
// 細かい波は画素に対する大きさで弱め、遠くでちらつかせない。霧は同じ空気遠近の関数を通す。
import { Matrix4, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type Texture } from 'three';
import { WATER } from '../config/render';
import type { Atmosphere } from './atmosphereGpu';
import { ATMOSPHERE_PARS } from './shaders/atmosphereGlsl';
import { NOISE_GLSL } from './shaders/noiseGlsl';

const vertexShader = /* glsl */ `
uniform mat4 uMirrorMatrix;
varying vec3 vWorld;
varying vec4 vMirrorUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vMirrorUv = uMirrorMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
${ATMOSPHERE_PARS}
${NOISE_GLSL}
uniform sampler2D uMirror;
uniform float uHasMirror;
uniform float uTime;
uniform vec3 uDeepColor;
uniform float uWaveStrength;
uniform float uDistortion;
uniform float uGlitterRough;
uniform float uGlitterMax;
varying vec3 vWorld;
varying vec4 vMirrorUv;

// 波の高さ場の傾き：風向きのまわりに散らした方向波の和（波長 28m〜0.8m）。
// 各波は、画素の大きさに対して細かすぎるほど弱める（遠くでちらつかせない）
vec2 waveSlope(vec2 p, float footprint) {
  vec2 slope = vec2(0.0);
  const vec2 wind = vec2(0.8, 0.6);
  float wavelength = 28.0;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float k = 6.2831853 / wavelength;
    float fade = 1.0 - smoothstep(0.25, 1.0, footprint * k / 6.2831853 * 2.0);
    if (fade > 0.001) {
      float ang = (hash12(vec2(fi, 3.7)) - 0.5) * 1.9;
      vec2 d = vec2(wind.x * cos(ang) - wind.y * sin(ang), wind.x * sin(ang) + wind.y * cos(ang));
      float omega = sqrt(9.81 * k);
      float phase = dot(d, p) * k - omega * uTime + hash12(vec2(fi, 9.1)) * 6.2831853;
      // 振幅は波長に比例（急峻さ一定）
      float a = 0.035 * wavelength / 6.2831853;
      slope += d * (a * k * cos(phase)) * fade;
    }
    wavelength *= 0.76;
  }
  // 規則性を崩す、ゆっくり動くむら
  float fn = 1.0 - smoothstep(0.1, 0.6, footprint * 0.05);
  vec2 q = p * 0.05 + vec2(uTime * 0.02, 0.0);
  float n0 = vnoise(q);
  slope += vec2(vnoise(q + vec2(0.3, 0.0)) - n0, vnoise(q + vec2(0.0, 0.3)) - n0) * 0.35 * fn;
  return slope;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float footprint = length(fwidth(vWorld.xz));
  vec2 s = waveSlope(vWorld.xz, footprint) * uWaveStrength;
  vec3 n = normalize(vec3(-s.x, 1.0, -s.y));

  float cosV = clamp(dot(n, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
  vec3 R = reflect(-V, n);
  vec3 refl = atmoSky(R);
  if (uHasMirror > 0.5) {
    vec2 uv = vMirrorUv.xy / vMirrorUv.w + n.xz * uDistortion;
    // r01-city：水面の映り込みは縦に少しにじむ（小さな波で上下に揺れた像が重なる）。縦に3点で平均する
    float smear = 0.0025 + 0.004 * clamp(footprint * 0.02, 0.0, 1.0);
    vec3 mirror = texture2D(uMirror, clamp(uv, vec2(0.001), vec2(0.999))).rgb * 0.5;
    mirror += texture2D(uMirror, clamp(uv + vec2(0.0, smear), vec2(0.001), vec2(0.999))).rgb * 0.25;
    mirror += texture2D(uMirror, clamp(uv - vec2(0.0, smear), vec2(0.001), vec2(0.999))).rgb * 0.25;
    refl = mirror;
  }

  // 太陽のきらめき（GGX）
  vec3 L = uAtmoSunDir;
  vec3 H = normalize(V + L);
  float NdotH = max(dot(n, H), 0.0);
  float NdotL = max(dot(n, L), 0.0);
  float a = uGlitterRough * uGlitterRough;
  float a2 = a * a;
  float dd = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D = a2 / (ATMO_PI * dd * dd);
  float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 sun = uAtmoSunColor * uAtmoRadiance * D * Fs * NdotL / max(4.0 * cosV * NdotL, 1e-3);
  // 上限へなめらかに近づける（どこで切れたか分かる段を作らない）
  sun = uGlitterMax * (1.0 - exp(-sun / uGlitterMax));

  // 水の中で散乱して戻る光（空と太陽に照らされた濃い青緑）
  vec3 irradiance = atmoSky(vec3(0.0, 1.0, 0.0)) * 3.14159 + uAtmoSunColor * uAtmoRadiance * max(uAtmoSunDir.y, 0.0);
  vec3 body = uDeepColor * irradiance;

  vec3 col = mix(body, refl, F) + sun;
  col = atmoApplyFog(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Water {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor(atmosphere: Atmosphere, level: number, x0: number, x1: number, zHalf: number) {
    const material = new ShaderMaterial({
      name: 'Water',
      vertexShader,
      fragmentShader,
      uniforms: {
        ...atmosphere.uniforms,
        uMirror: { value: null },
        uMirrorMatrix: { value: new Matrix4() },
        uHasMirror: { value: 0 },
        uTime: { value: 0 },
        uDeepColor: { value: new Vector3(...WATER.deepColor) },
        uWaveStrength: { value: WATER.waveStrength },
        uDistortion: { value: WATER.distortion },
        uGlitterRough: { value: WATER.sunGlitterRoughness },
        uGlitterMax: { value: WATER.glitterMax },
      },
    });
    const geometry = new PlaneGeometry(x1 - x0, zHalf * 2, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.set((x0 + x1) / 2, level, 0);
    this.mesh.name = 'water';
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
  }

  setMirror(texture: Texture | null, matrix: Matrix4 | null): void {
    const u = this.mesh.material.uniforms;
    u.uMirror.value = texture;
    if (matrix) u.uMirrorMatrix.value = matrix;
    u.uHasMirror.value = texture ? 1 : 0;
  }

  set time(t: number) {
    this.mesh.material.uniforms.uTime.value = t;
  }
}
