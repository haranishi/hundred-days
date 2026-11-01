// OWNER: world-art
// 空の関数。背景（空のドーム）・霧の色・半球光・環境マップ（PMREM）は、すべてここから色を取る（色の出どころを1つにする）。
// GLSL の kgSkyAbove と、CPU の skyAbove は同じ式。片方を直したらもう片方も直す。
// 高さで薄くなる霧を解析的に積分する式は、本人の dragon-rampage（src/render/shaders/atmosphereGlsl.ts）から写した。
import {
  BackSide,
  Color,
  LinearSRGBColorSpace,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FOG, SKY, type RGB } from './config';
import { FILTER_GLSL, NOISE_GLSL } from './glsl';

const rad = (d: number): number => (d * Math.PI) / 180;

/** 全材質が共有する空と霧の uniform（値を書き換えれば全部に効く）。 */
export const SKY_UNIFORMS = {
  uKgSkyZenith: { value: new Vector3(...SKY.zenith) },
  uKgSkyMid: { value: new Vector3(...SKY.mid) },
  uKgSkyHorizon: { value: new Vector3(...SKY.horizon) },
  uKgSkyGlow: { value: new Vector3(...SKY.glow) },
  uKgSkyGlowLow: { value: new Vector3(...SKY.glowLow) },
  uKgSkyGround: { value: new Vector3(...SKY.ground) },
  /** xy: 明るみの方角（x, z）、z: 方角の鋭さ、w: 仰角での減り方 */
  uKgSkyGlowDir: { value: new Vector4(Math.cos(rad(SKY.glowDeg)), Math.sin(rad(SKY.glowDeg)), SKY.glowSharpness, SKY.glowHeight) },
  /** x: 星の密度, y: 明るさ, z: 大きさ（画素）, w: 1 で描く（環境マップを焼くときは 0） */
  uKgStars: { value: new Vector4(SKY.stars.density, SKY.stars.brightness, SKY.stars.size, 1) },
  /** x: 東山の高さ, y: ほかの山並みの高さ, z: 霞, w: 未使用 */
  uKgMount: { value: new Vector4(SKY.mountains.east, SKY.mountains.other, SKY.mountains.haze, 0) },
  uKgMountRange: { value: new Vector2(rad(-70), rad(70)) },
  uKgMountColor: { value: new Vector3(...SKY.mountains.color) },
  /** x: 霧の濃さ, y: 高さの減衰, z: 始まりの距離, w: 色の倍率 */
  uKgFog: { value: new Vector4(FOG.density, FOG.heightFalloff, FOG.start, FOG.gain) },
  /** x: 靄の濃さ, y: 靄の高さ, z: 斑の細かさ, w: 流れ（時刻×速さ） */
  uKgMist: { value: new Vector4(FOG.mist.density, FOG.mist.height, FOG.mist.scale, 0) },
  /** 東ほど白む地表の靄（r02-fix-visual）：x 濃さの増し, y 色の増し, z 東の明るみの色を足す量, w 東の端（m） */
  uKgMistEast: { value: new Vector4(FOG.mist.east.density, FOG.mist.east.color, FOG.mist.east.glow, FOG.mist.east.x1) },
  uKgTime: { value: 0 },
  /** 霧に滲む灯り（空気の照り返し）：位置と強さ、色、数。world の灯りが毎コマ書く */
  uKgAir: { value: Array.from({ length: 12 }, () => new Vector4(0, -100, 0, 0)) },
  uKgAirC: { value: Array.from({ length: 12 }, () => new Vector3()) },
  uKgAirN: { value: 0 },
};

/** 空と霧の関数（uniform の宣言つき）。NOISE_GLSL と FILTER_GLSL の後に置く。 */
export const SKY_FUNCS_GLSL = /* glsl */ `
uniform vec3 uKgSkyZenith;
uniform vec3 uKgSkyMid;
uniform vec3 uKgSkyHorizon;
uniform vec3 uKgSkyGlow;
uniform vec3 uKgSkyGlowLow;
uniform vec3 uKgSkyGround;
uniform vec4 uKgSkyGlowDir;
uniform vec4 uKgStars;
uniform vec4 uKgMount;
uniform vec2 uKgMountRange;
uniform vec3 uKgMountColor;
uniform vec4 uKgFog;
uniform vec4 uKgMist;
uniform vec4 uKgMistEast;
uniform float uKgTime;
#define KG_AIR_N 12
uniform vec4 uKgAir[KG_AIR_N];
uniform vec3 uKgAirC[KG_AIR_N];
uniform int uKgAirN;

/**
 * 霧に滲む灯り：点光源の光が視線に沿って空気に散る量（逆二乗を解析的に積分）。
 * 芯は柔らかく（半径²を足す）、灯りの届く距離（w の符号の外の値）より遠い視線では弱める。
 */
vec3 kgAirlight(vec3 cam, vec3 dir, float L) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < KG_AIR_N; i++) {
    if (i >= uKgAirN) break;
    vec4 a = uKgAir[i];
    if (a.w <= 0.0) continue;
    vec3 cp = a.xyz - cam;
    float t0 = dot(cp, dir);
    float h2 = max(dot(cp, cp) - t0 * t0, 0.0);
    // 視線から 22m より遠い灯りは寄与が 1% 未満なので飛ばす。視線の終わりより十分奥の灯りも飛ばす
    if (h2 > 484.0 || t0 - L > 12.0) continue;
    float h = sqrt(h2 + 0.3);
    float I = (atan((L - t0) / h) - atan(-t0 / h)) / h;
    sum += uKgAirC[i] * a.w * I * exp(-sqrt(h2) * 0.22);
  }
  return sum;
}

/** 東の明るみの量（方角の広がり × 地平からの高さ）。星を消すのにも使う */
float kgGlowAmount(vec3 dir, out float lobe) {
  vec2 h = dir.xz;
  float hl = length(h);
  h = hl > 1e-5 ? h / hl : vec2(1.0, 0.0);
  float c = dot(h, uKgSkyGlowDir.xy);
  lobe = pow(max(0.5 + 0.5 * c, 0.0), uKgSkyGlowDir.z);
  float el = asin(clamp(dir.y, 0.0, 1.0));
  return lobe * exp(-el / uKgSkyGlowDir.w);
}

/** 地平線より上の空（星と山なし）。CPU の skyAbove と同じ式 */
vec3 kgSkyAbove(vec3 dir) {
  float el = asin(clamp(dir.y, 0.0, 1.0));
  float t1 = smoothstep(0.0, 0.45, el);
  float t2 = smoothstep(0.35, 1.45, el);
  vec3 col = mix(mix(uKgSkyHorizon, uKgSkyMid, t1), uKgSkyZenith, t2);
  float lobe;
  float glow = kgGlowAmount(dir, lobe);
  float lowest = lobe * exp(-el / (uKgSkyGlowDir.w * 0.3));
  return col + uKgSkyGlow * glow + uKgSkyGlowLow * lowest;
}

/** 地平線より下も含む空（遠くの地面の色へ移る）。環境マップの下半分 */
vec3 kgSkyBase(vec3 dir) {
  vec3 flat_ = normalize(vec3(dir.x, max(dir.y, 0.0), dir.z) + vec3(0.0, 1e-4, 0.0));
  vec3 above = kgSkyAbove(flat_);
  return mix(above, uKgSkyGround, smoothstep(0.0, -0.09, dir.y));
}

/** 山の稜線の仰角（ラジアン）。東は東山（高く）、ほかは低い山並み、南は開ける */
float kgRidge(float az) {
  float inEast = smoothstep(uKgMountRange.x - 0.14, uKgMountRange.x + 0.14, az) * (1.0 - smoothstep(uKgMountRange.y - 0.14, uKgMountRange.y + 0.14, az));
  vec2 cp = vec2(cos(az), sin(az));
  float n = kgFbm(cp * 2.6 + vec2(3.1, 7.7), 4);
  float fine = kgFbm(cp * 11.0 + vec2(1.3, 2.9), 3);
  float east = uKgMount.x * (0.5 + 0.55 * n + 0.12 * fine);
  // 負の底の pow は Metal で NaN になるので掛け算で（r01-world-周4）
  float sd = (az - 1.5708) / 0.7;
  float south = 1.0 - 0.75 * exp(-sd * sd);
  float other = uKgMount.y * (0.35 + 0.8 * n + 0.15 * fine) * south;
  return mix(other, east, inEast);
}

/** 星：空を格子に分け、格子ごとに確率で1つ。画素より小さくならないよう大きさを画素幅で決める */
float kgStars(vec3 dir) {
  vec3 p = dir * 150.0;
  vec3 cell = floor(p);
  float h = kgHash13(cell);
  if (h > uKgStars.x) return 0.0;
  vec3 jit = vec3(kgHash13(cell + 17.0), kgHash13(cell + 41.0), kgHash13(cell + 73.0)) * 0.5 + 0.25;
  vec3 sp = normalize(cell + jit);
  float d = length(dir - sp);
  float px = length(fwidth(dir));
  float r = max(px * uKgStars.z, 0.0004);
  float mag = pow(kgHash13(cell + 5.3), 5.0);
  float tw = 0.8 + 0.2 * sin(uKgTime * (1.7 + 4.0 * h) + h * 40.0);
  return exp(-d * d / (r * r)) * (0.12 + 2.6 * mag) * tw * uKgStars.y;
}

/** 空のドームに描く空：空＋山並み＋星 */
vec3 kgSkyFull(vec3 dir) {
  vec3 col = kgSkyBase(dir);
  float az = atan(dir.z, dir.x);
  float ridge = kgRidge(az);
  float y = asin(clamp(dir.y, -1.0, 1.0));
  float fw = max(fwidth(y), 1e-4);
  float mountain = 1.0 - smoothstep(-fw, fw, y - ridge);
  if (uKgStars.w > 0.5) {
    float lobe;
    float glow = kgGlowAmount(dir, lobe);
    // r03-fix-visual: 地平に近い空（仰角 2〜11°）と東の白みの側にも星を残す（低い角度の画面に星が無かった）。
    // 地平の空は天頂の約 3 倍明るく、同じ明るさの星は埋もれるので、低いほど星を明るくする（最大 3.5 倍）
    float vis = smoothstep(0.035, 0.2, dir.y) * (1.0 - clamp(glow * 4.0, 0.0, 0.7)) * (1.0 - mountain);
    if (vis > 0.0) {
      float s = kgStars(dir);
      vec3 tint = mix(vec3(0.75, 0.85, 1.15), vec3(1.15, 0.95, 0.8), kgHash13(floor(dir * 150.0) + 9.1));
      float low = 1.0 + 2.5 * (1.0 - smoothstep(0.08, 0.45, dir.y));
      col += s * vis * tint * 0.05 * low;
    }
  }
  if (mountain > 0.0 && dir.y > -0.12) {
    // 遠い山ほど霞む。稜線のすぐ上の明るみが、山の肩をわずかに照らす
    vec3 haze = kgSkyAbove(normalize(vec3(dir.x, 0.0001, dir.z)));
    float depth = clamp((ridge - y) / max(ridge, 1e-3), 0.0, 1.0);
    vec3 m = mix(uKgMountColor, haze, uKgMount.z * (1.0 - 0.55 * depth));
    col = mix(col, m, mountain);
  }
  return col;
}

/** 霧の色：その方角の地平の空（見下ろしても地平の色を使う） */
vec3 kgSkyHaze(vec3 dir) {
  vec3 d = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.4 + 0.015, dir.z));
  return kgSkyAbove(d) * uKgFog.w;
}

/** カメラ cam から点 p までの霧の光学的厚み（高さで指数的に薄くなる霧を解析的に積分） */
float kgFogDepth(vec3 cam, vec3 p) {
  vec3 d = p - cam;
  float dist = length(d);
  float s = max(dist - uKgFog.z, 0.0);
  if (s <= 0.0) return 0.0;
  vec3 dir = d / dist;
  float y0 = cam.y + dir.y * uKgFog.z;
  float b = uKgFog.y;
  float k = b * dir.y * s;
  float integral = abs(k) > 1e-4 ? (1.0 - exp(-k)) / (b * dir.y) : s;
  return uKgFog.x * exp(-b * max(y0, -20.0)) * integral;
}

/** 霧と、地面を這う靄（流れる斑）を掛ける。靄は東ほど濃く、白む（夜明けの明るみの側。r02-fix-visual） */
vec3 kgApplyFog(vec3 col, vec3 cam, vec3 p) {
  float od = kgFogDepth(cam, p);
  float dist = length(p - cam);
  float mn = kgFbm(p.xz * uKgMist.z + vec2(uKgMist.w, uKgMist.w * 0.55), 3);
  float east = smoothstep(-30.0, uKgMistEast.w, p.x);
  float mist = uKgMist.x * (1.0 + uKgMistEast.x * east) * min(dist, 90.0) * exp(-max(p.y, 0.0) / uKgMist.y) * smoothstep(0.3, 0.8, mn);
  float Tf = exp(-od);
  float Tm = exp(-mist);
  vec3 dir = (p - cam) / max(dist, 1e-4);
  vec3 haze = kgSkyHaze(dir);
  vec3 mistC = haze * (1.0 + uKgMistEast.y * east) + uKgSkyGlowLow * uKgMistEast.z * east;
  return (col * Tm + mistC * (1.0 - Tm)) * Tf + haze * (1.0 - Tf) + kgAirlight(cam, dir, dist);
}
`;

/** 空と霧を使うシェーダーの共通の前置き（ノイズ・縞・空）。 */
export const SKY_PARS_GLSL = NOISE_GLSL + FILTER_GLSL + SKY_FUNCS_GLSL;

// ---- CPU 版（GLSL の kgSkyAbove と同じ式） ----

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 地平線より上の空の色（線形）。dir は単位ベクトル（x 東、y 上、z 南）。 */
export function skyAbove(dir: [number, number, number]): RGB {
  const el = Math.asin(Math.min(1, Math.max(0, dir[1])));
  const t1 = smoothstep(0, 0.45, el);
  const t2 = smoothstep(0.35, 1.45, el);
  let col = mix3(mix3(SKY.horizon, SKY.mid, t1), SKY.zenith, t2);
  const hl = Math.hypot(dir[0], dir[2]);
  const hx = hl > 1e-5 ? dir[0] / hl : 1;
  const hz = hl > 1e-5 ? dir[2] / hl : 0;
  const c = hx * Math.cos(rad(SKY.glowDeg)) + hz * Math.sin(rad(SKY.glowDeg));
  const lobe = Math.pow(Math.max(0, 0.5 + 0.5 * c), SKY.glowSharpness);
  const glow = lobe * Math.exp(-el / SKY.glowHeight);
  const lowest = lobe * Math.exp(-el / (SKY.glowHeight * 0.3));
  col = [
    col[0] + SKY.glow[0] * glow + SKY.glowLow[0] * lowest,
    col[1] + SKY.glow[1] * glow + SKY.glowLow[1] * lowest,
    col[2] + SKY.glow[2] * glow + SKY.glowLow[2] * lowest,
  ];
  return col;
}

/** 上半球の空を余弦の重みで平均した色（半球光の空の側）。 */
export function skyHemisphereAverage(): RGB {
  const out: RGB = [0, 0, 0];
  let wsum = 0;
  const N = 24;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N * 2; j++) {
      const el = ((i + 0.5) / N) * (Math.PI / 2);
      const az = ((j + 0.5) / (N * 2)) * Math.PI * 2;
      const d: [number, number, number] = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      const w = Math.sin(el) * Math.cos(el);
      const c = skyAbove(d);
      out[0] += c[0] * w;
      out[1] += c[1] * w;
      out[2] += c[2] * w;
      wsum += w;
    }
  }
  return [out[0] / wsum, out[1] / wsum, out[2] / wsum];
}

/** 線形の RGB から three の Color（色空間の変換をしない）。 */
export function linearColor(c: RGB, scale = 1): Color {
  return new Color().setRGB(c[0] * scale, c[1] * scale, c[2] * scale, LinearSRGBColorSpace);
}

// ---- 空のドーム ----

const domeVertex = /* glsl */ `
varying vec3 vKgDir;
void main() {
  vKgDir = position;
  vec3 wp = position * 400.0 + cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  gl_Position.z = gl_Position.w * (1.0 - 1e-6);
}
`;

const domeFragment = /* glsl */ `
${SKY_PARS_GLSL}
varying vec3 vKgDir;
void main() {
  vec3 dir = normalize(vKgDir);
  gl_FragColor = vec4(kgSkyFull(dir) + kgAirlight(cameraPosition, dir, 400.0), 1.0);
}
`;

/** 空のドーム。不透明な物の後に描き、空いた画素だけを塗る。 */
export function createSkyDome(): Mesh<SphereGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    name: 'kg-sky',
    uniforms: SKY_UNIFORMS,
    vertexShader: domeVertex,
    fragmentShader: domeFragment,
    side: BackSide,
    depthWrite: false,
  });
  const mesh = new Mesh(new SphereGeometry(1, 48, 32), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** 空のドームから環境マップ（PMREM）を焼く。星は消す（ぼかすと濁るだけなので）。 */
export function bakeSkyEnvironment(renderer: WebGLRenderer, dome: Mesh): Texture {
  const scene = new Scene();
  const parent = dome.parent;
  scene.add(dome);
  const stars = SKY_UNIFORMS.uKgStars.value.w;
  SKY_UNIFORMS.uKgStars.value.w = 0;
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0, 0.1, 1000);
  pmrem.dispose();
  SKY_UNIFORMS.uKgStars.value.w = stars;
  scene.remove(dome);
  parent?.add(dome);
  return target.texture;
}
