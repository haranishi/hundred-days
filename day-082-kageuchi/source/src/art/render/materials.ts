// OWNER: world-art
// 世界の材質の差し替え口。世界の標準材質は必ず kgMaterial を通す。
// ・霧：three の霧の代わりに、空の関数から色を取る霧と靄（sky.ts）
// ・環境光の地図：暗い場所（stage.darkZones）と軒下の暗さを、その点の xz で引いて間接光に掛ける（worldMap.ts が焼く）
// ・透かし（seeThrough.ts）
// ・材質ごとの手続きの模様（色・粗さ・法線・発光）
// 材質の書き換えの考え方は、本人の dragon-rampage（src/render/materials.ts の MaterialKit）を手本にした。
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  MeshStandardMaterial,
  RGBAFormat,
  ShaderChunk,
  UnsignedByteType,
  Vector2,
  Vector4,
  type IUniform,
  type MeshStandardMaterialParameters,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { BUMP_GLSL } from './glsl';
import { SEE_GLSL, SEE_UNIFORMS } from './seeThrough';
import { SKY_PARS_GLSL, SKY_UNIFORMS } from './sky';

function placeholder(r: number, g: number, b: number, a: number): DataTexture {
  const t = new DataTexture(new Uint8Array([r, g, b, a]), 1, 1, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

/** 地面の地図（worldMap.ts が buildWorld の中で値を入れる）。A：白砂・苔・石畳・土の重み、B：環境光・接地の暗がり・掃き目・水際。 */
export const MAP_UNIFORMS = {
  uKgMapA: { value: placeholder(255, 0, 0, 0) as DataTexture },
  uKgMapB: { value: placeholder(255, 255, 0, 0) as DataTexture },
  /** C：R＝見回りの道の踏み荒らし、G＝軒の雨落ち・塀の根元・池の湿り */
  uKgMapC: { value: placeholder(0, 0, 0, 0) as DataTexture },
  /** 砂紋の地図（半精度）：R 最寄りの物までの距離（m）、GB その勾配、A その物の帯の幅 */
  uKgMapR: { value: placeholder(255, 0, 0, 0) as DataTexture },
  /** x0, z0, 1/幅, 1/奥行き */
  uKgMapRect: { value: new Vector4(-50, -50, 1 / 100, 1 / 100) },
};

/**
 * 炎上の明かり（燃えている建物の瓦の隙間・壁・障子が、内から橙に明滅する）。world が setFire で進みを書く。
 * 建物ごとに長方形（x0, z0, x1, z1）と、燃え始め・燃え盛りの進み、燃え始めの点（x, z）を持つ。
 */
export const BURN_UNIFORMS = {
  uKgBurn: { value: new Vector4(0, 0, 0, 0) },
  uKgBurnRect: { value: [new Vector4(1e5, 1e5, 1e5, 1e5), new Vector4(1e5, 1e5, 1e5, 1e5)] },
  uKgBurnSpan: { value: [new Vector4(2, 3, 0, 0), new Vector4(2, 3, 0, 0)] },
};

const BURN_GLSL = /* glsl */ `
uniform vec4 uKgBurn;
uniform vec4 uKgBurnRect[2];
uniform vec4 uKgBurnSpan[2];
float kgBurnAmount(vec3 p) {
  if (uKgBurn.x <= 0.0) return 0.0;
  float b = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 r = uKgBurnRect[i];
    vec4 sp = uKgBurnSpan[i];
    float inside = step(r.x, p.x) * step(p.x, r.z) * step(r.y, p.z) * step(p.z, r.w);
    float far_ = length(vec2(r.z - r.x, r.w - r.y));
    float d = length(p.xz - sp.zw) / max(far_, 1.0);
    float f0 = sp.x + (sp.y - sp.x) * 0.85 * d;
    b = max(b, inside * smoothstep(f0, f0 + 0.12, uKgBurn.x));
  }
  return b;
}
vec3 kgBurnGlow(vec3 p) {
  float b = kgBurnAmount(p);
  if (b <= 0.0) return vec3(0.0);
  float n = kgFbm(p.xz * 0.9 + vec2(0.0, p.y * 0.7) + uKgTime * vec2(0.15, -0.35), 3);
  float fl = 0.7 + 0.3 * sin(uKgTime * 7.0 + n * 12.0);
  float patches = smoothstep(0.42, 0.72, n);
  return vec3(1.0, 0.3, 0.06) * b * (0.15 + patches) * fl * 1.4;
}
`;

export function setupMapTexture(t: DataTexture): void {
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
}

const MAP_GLSL = /* glsl */ `
uniform sampler2D uKgMapA;
uniform sampler2D uKgMapB;
uniform sampler2D uKgMapC;
uniform sampler2D uKgMapR;
uniform vec4 uKgMapRect;
vec2 kgMapUv(vec2 xz) { return (xz - uKgMapRect.xy) * uKgMapRect.zw; }
vec4 kgMapA(vec2 xz) { return texture2D(uKgMapA, kgMapUv(xz)); }
vec4 kgMapB(vec2 xz) { return texture2D(uKgMapB, kgMapUv(xz)); }
vec4 kgMapC(vec2 xz) { return texture2D(uKgMapC, kgMapUv(xz)); }
vec4 kgMapR(vec2 xz) { return texture2D(uKgMapR, kgMapUv(xz)); }
`;

/** ?nanpink=1 のとき、NaN を赤紫で見せる（原因の切り分け用）。 */
const NAN_COLOR =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('nanpink') ? 'vec3(4.0, 0.0, 4.0)' : 'vec3(0.0)';

export interface KgPatch {
  /** シェーダーの種類ごとに一意の名前（three のプログラムのキャッシュを分ける） */
  key: string;
  /** 透かしの対象（屋根・壁・塀・木） */
  see?: boolean;
  /** 隠れている植え込みの抜き（kgSeeBush）を使う。r01-integrate 追加 */
  seeBush?: boolean;
  /** 環境光の地図を掛ける高さの範囲（h0 より下は全部、h1 より上は掛けない）。null で掛けない */
  amb?: [number, number] | null;
  /** 霧を掛けるか（既定は掛ける） */
  fog?: boolean;
  /** 頂点属性 aKg（vec4）を使う */
  attr?: boolean;
  /** インスタンスごとの属性 aKgInst（vec4）を使う */
  inst?: boolean;
  uniforms?: Record<string, IUniform>;
  vertexPars?: string;
  /** begin_vertex の後（transformed を物体の座標で動かす） */
  vertex?: string;
  fragmentPars?: string;
  /** color_fragment の後（diffuseColor を決める） */
  color?: string;
  /** roughnessmap_fragment の後（roughnessFactor を決める） */
  roughness?: string;
  /** metalnessmap_fragment の後（metalnessFactor を決める） */
  metalness?: string;
  /** normal_fragment_maps の後（normal＝視点空間の法線を傾ける） */
  normal?: string;
  /** emissivemap_fragment の後（totalEmissiveRadiance を決める） */
  emissive?: string;
  /** lights_fragment_end の後（reflectedLight を直す） */
  light?: string;
  /** 炎上の明かり（燃える建物の材質：瓦・木・漆喰・障子） */
  burn?: boolean;
  /** カメラからこの距離（m）より近い所を網点で抜く（目の前の葉が大きな三角に映るのを防ぐ） */
  nearFade?: number;
  /** 点光源（灯り）の光にだけ掛ける倍率の GLSL の式（r02-fix-visual：白砂の光だまりを、闇の砂を暗くした分だけ戻す） */
  pointGain?: string;
  /** 追加の #define（名前だけ。シェーダーのキャッシュの鍵にも入る）。r08-world 追加：写真の質感の有無（world/photoTex.ts） */
  defines?: string[];
}

const POINT_INFO = 'getPointLightInfo( pointLight, geometryPosition, directLight );';

function replaceOrThrow(src: string, target: string, replacement: string): string {
  if (!src.includes(target)) throw new Error(`kgMaterial: "${target}" が見つからない`);
  return src.replace(target, replacement);
}

/** 世界の標準材質を作る。 */
export function kgMaterial(params: MeshStandardMaterialParameters, patch: KgPatch): MeshStandardMaterial {
  const material = new MeshStandardMaterial(params);
  const fog = patch.fog ?? true;
  const amb = patch.amb === undefined ? ([2.5, 6] as [number, number]) : patch.amb;
  const ownUniforms: Record<string, IUniform> = {
    ...(patch.uniforms ?? {}),
    ...(amb ? { uKgAmbH: { value: new Vector2(amb[0], amb[1]) } } : {}),
  };
  const defines: string[] = [];
  if (patch.see) defines.push('#define KG_SEE');
  if (patch.seeBush) defines.push('#define KG_SEE_BUSH');
  if (amb) defines.push('#define KG_AMB');
  if (fog) defines.push('#define KG_FOG');
  if (patch.attr) defines.push('#define KG_ATTR');
  if (patch.inst) defines.push('#define KG_INST');
  if (patch.burn) defines.push('#define KG_BURN');
  if (patch.nearFade) defines.push(`#define KG_NEAR ${patch.nearFade.toFixed(2)}`);
  for (const d of patch.defines ?? []) defines.push(`#define ${d}`);
  const defs = defines.join('\n') + '\n';

  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, SKY_UNIFORMS, MAP_UNIFORMS, SEE_UNIFORMS, BURN_UNIFORMS, ownUniforms);
    let vs = shader.vertexShader;
    vs = replaceOrThrow(
      vs,
      '#include <common>',
      `#include <common>
${defs}
varying vec3 vKgWorld;
varying vec3 vKgObj;
varying vec2 vKgUv;
#ifdef KG_ATTR
attribute vec4 aKg;
varying vec4 vKg;
#endif
#ifdef KG_INST
attribute vec4 aKgInst;
varying vec4 vKgInst;
#endif
uniform float uKgTime;
${patch.vertexPars ?? ''}`,
    );
    vs = replaceOrThrow(vs, '#include <begin_vertex>', `#include <begin_vertex>\nvKgObj = transformed;\n${patch.vertex ?? ''}`);
    vs = replaceOrThrow(
      vs,
      '#include <fog_vertex>',
      `{
  vec4 kgWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    kgWp = instanceMatrix * kgWp;
  #endif
  vKgWorld = (modelMatrix * kgWp).xyz;
  vKgUv = uv;
  #ifdef KG_ATTR
    vKg = aKg;
  #endif
  #ifdef KG_INST
    vKgInst = aKgInst;
  #endif
}`,
    );

    let fs = shader.fragmentShader;
    fs = replaceOrThrow(
      fs,
      '#include <common>',
      `#include <common>
${defs}
varying vec3 vKgWorld;
varying vec3 vKgObj;
varying vec2 vKgUv;
#ifdef KG_ATTR
varying vec4 vKg;
#endif
#ifdef KG_INST
varying vec4 vKgInst;
#endif
${SKY_PARS_GLSL}
${BUMP_GLSL}
${MAP_GLSL}
${SEE_GLSL}
${BURN_GLSL}
#ifdef KG_AMB
uniform vec2 uKgAmbH;
#endif
${patch.fragmentPars ?? ''}`,
    );
    fs = replaceOrThrow(
      fs,
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
#ifdef KG_SEE
kgSeeThrough(vKgWorld);
#endif
#ifdef KG_SEE_BUSH
kgSeeBush(vKgWorld);
#endif
#ifdef KG_NEAR
if (smoothstep(KG_NEAR * 0.45, KG_NEAR, length(vKgWorld - cameraPosition)) < kgBayer4(gl_FragCoord.xy)) discard;
#endif`,
    );
    if (patch.color) fs = replaceOrThrow(fs, '#include <color_fragment>', `#include <color_fragment>\n${patch.color}`);
    if (patch.pointGain) {
      // 灯りの減衰の差し替え（lightCurve.ts）を済ませた後の中身を展開して、点光源の繰り返しだけに倍率を掛ける
      const begin = ShaderChunk.lights_fragment_begin;
      if (!begin.includes(POINT_INFO)) throw new Error('kgMaterial: 点光源の繰り返しが見つからない');
      fs = replaceOrThrow(fs, '#include <lights_fragment_begin>', begin.replace(POINT_INFO, `${POINT_INFO}\n\t\tdirectLight.color *= ${patch.pointGain};`));
    }
    if (patch.roughness) fs = replaceOrThrow(fs, '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${patch.roughness}`);
    if (patch.metalness) fs = replaceOrThrow(fs, '#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${patch.metalness}`);
    if (patch.normal) fs = replaceOrThrow(fs, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${patch.normal}`);
    const burn = patch.burn ? '\n#ifdef KG_BURN\ntotalEmissiveRadiance += kgBurnGlow(vKgWorld) * kgBurnScale;\n#endif' : '';
    if (patch.emissive || patch.burn)
      fs = replaceOrThrow(fs, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>\nfloat kgBurnScale = 1.0;\n${patch.emissive ?? ''}${burn}`);
    fs = replaceOrThrow(
      fs,
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
#ifdef KG_AMB
{
  float kgAmbF = kgMapB(vKgWorld.xz).r;
  kgAmbF = mix(kgAmbF, 1.0, smoothstep(uKgAmbH.x, uKgAmbH.y, vKgWorld.y));
  reflectedLight.indirectDiffuse *= kgAmbF;
  reflectedLight.indirectSpecular *= kgAmbF;
}
#endif
${patch.light ?? ''}`,
    );
    fs = replaceOrThrow(
      fs,
      '#include <fog_fragment>',
      `#ifdef KG_SEE
gl_FragColor.rgb *= kgSeeShade;
#endif
#ifdef KG_FOG
gl_FragColor.rgb = kgApplyFog(gl_FragColor.rgb, cameraPosition, vKgWorld);
#endif
// 保険：NaN・無限大は黒にする（1画素でも光のにじみの縮小で四角く広がるため）。調べるときは ?nanpink=1 で赤紫に
if (any(isnan(gl_FragColor.rgb)) || any(isinf(gl_FragColor.rgb))) gl_FragColor.rgb = ${NAN_COLOR};`,
    );
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = (): string => `kg|${patch.key}|${defines.join(',')}`;
  material.needsUpdate = true;
  return material;
}
