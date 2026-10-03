// OWNER: city
// 建物の材質。外壁の窓割り・目地・店先・屋根の瓦や継ぎ目を、頂点属性とシェーダーで描く。
// 窓や目地は画素の幅で積分したパルス（fpulse）で描き、遠くでは平均の色に落ち着かせる。
// 窓ごとの乱数の変化も、窓が画素より小さくなるほど平均へ寄せ、ちらつきを消す。
// 壊れ方（傾き・崩落・ひび・剥がれ・割れた窓・焦げ・窓の火）は damageGlsl.ts を最後に重ねる。
//
// r01-city：窓は形にせず、画素ごとに「壁の厚みぶん奥にある開口」へ視線を通して描く（視差）。
// ・開口の側面・上面（まぐさの下）・下面（窓台）に当たれば、その面の向きで光を受け、開口の縁が落とす日の影も付く
// ・奥のガラスは斜めから見るほど空を映し（フレネル）、透けた先に窓ごとに違う部屋（奥行き・壁と床の色・家具・照明・
//   ブラインドの高さ・カーテン）を、部屋の箱へ視線を通して描く。夕日が差す面では、部屋の床や壁に日だまりができる
// ・部屋の日だまりは、太陽が影を受けた後の光（csmSunIn、render/csmChunk.ts）で光らせるので、他のビルの影に入れば消える
// ・窓が画面で小さくなるほど、視差と部屋の描き分けを平均の見た目へ寄せる（遠くのモアレとちらつきを出さない）
import { MeshDepthMaterial, MeshStandardMaterial } from 'three';
import { AMBIENT } from '../config/render';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import { FILTER_GLSL } from '../render/shaders/filterGlsl';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';
import { DAMAGE_FRAGMENT_PARS, DAMAGE_VARYINGS, DAMAGE_VERTEX_DEPTH, DAMAGE_VERTEX_NORMAL, DAMAGE_VERTEX_PARS, DAMAGE_VERTEX_POSITION } from './damageGlsl';
import type { DamageUniforms } from './damageTexture';
import { FACADE_GLSL } from './facadeGlsl';
import { styleDefines } from './styles';

const VERTEX_PARS = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aColor;
attribute vec4 aFac;
attribute vec4 aFac2;
attribute vec4 aFac3;
attribute vec3 aTrim;
attribute vec3 aGlass;
attribute float aShop;
varying vec2 vFacUv;
varying vec3 vFacColor;
varying vec4 vFac;
varying vec4 vFac2;
varying vec4 vFac3;
varying vec3 vTrim;
varying vec3 vGlass;
varying vec3 vFacNormal;
varying vec3 vFacPos;
varying float vShop;
${DAMAGE_VERTEX_PARS}
${DAMAGE_VARYINGS}
`;

// 模様の座標は、壊れて動く前の位置で取る（傾いても窓や汚れが壁の上を滑らない）
const VERTEX_MAIN = /* glsl */ `
vFacUv = aUv;
vFacColor = aColor;
vFac = aFac;
vFac2 = aFac2;
vFac3 = aFac3;
vTrim = aTrim;
vGlass = aGlass;
vShop = aShop;
vFacNormal = normalize(mat3(modelMatrix) * normal);
vFacPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_PARS = /* glsl */ `
${styleDefines()}
varying vec2 vFacUv;
varying vec3 vFacColor;
varying vec4 vFac;
varying vec4 vFac2;
varying vec4 vFac3;
varying vec3 vTrim;
varying vec3 vGlass;
varying vec3 vFacNormal;
varying vec3 vFacPos;
varying float vShop;
${NOISE_GLSL}
${FILTER_GLSL}
${DAMAGE_FRAGMENT_PARS}
${FACADE_GLSL}
`;

export function createBuildingMaterial(kit: MaterialKit, damage: DamageUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: AMBIENT.envIntensity });
  material.name = 'Building';
  return kit.patch(material, {
    key: 'building',
    uniforms: { ...damage },
    vertex: (src) => {
      let s = replaceOrThrow(src, '#include <common>', `#include <common>\n${VERTEX_PARS}`);
      s = replaceOrThrow(s, '#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${DAMAGE_VERTEX_NORMAL}`);
      s = replaceOrThrow(s, '#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_MAIN}\n${DAMAGE_VERTEX_POSITION}`);
      return s;
    },
    fragment: (src) => {
      let s = replaceOrThrow(src, '#include <common>', `#include <common>\n${FRAGMENT_PARS}`);
      s = replaceOrThrow(s, '#include <color_fragment>', '#include <color_fragment>\nSurf surf = buildingSurface();\ndiffuseColor.rgb = surf.albedo;');
      s = replaceOrThrow(s, '#include <roughnessmap_fragment>', 'float roughnessFactor = surf.rough;');
      s = replaceOrThrow(s, '#include <metalnessmap_fragment>', 'float metalnessFactor = surf.metal;');
      s = replaceOrThrow(s, '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix * vec4(surf.nOffset, 0.0)).xyz);');
      s = replaceOrThrow(s, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += surf.emissive;');
      // 開口の縁が落とす影は直射だけに掛ける。部屋の日だまりは、影を受けた後の太陽の光（csmSunIn）で光らせる
      s = replaceOrThrow(
        s,
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
reflectedLight.directDiffuse *= surf.direct;
reflectedLight.directSpecular *= surf.direct;
reflectedLight.indirectDiffuse *= surf.ao;
reflectedLight.indirectSpecular *= mix(1.0, surf.ao, 0.6);
totalEmissiveRadiance += surf.sunEmit * csmSunIn;`,
      );
      return s;
    },
  });
}

/** 影を描く材質。外壁と同じく傾き・崩落で頂点を動かす（動かさないと、倒れたビルの影が立ったまま残る）。 */
export function createBuildingDepthMaterial(damage: DamageUniforms): MeshDepthMaterial {
  const material = new MeshDepthMaterial();
  material.name = 'BuildingDepth';
  material.onBeforeCompile = (shader): void => {
    Object.assign(shader.uniforms, damage);
    shader.vertexShader = replaceOrThrow(shader.vertexShader, '#include <common>', `#include <common>\n${DAMAGE_VERTEX_PARS}`);
    shader.vertexShader = replaceOrThrow(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>\n${DAMAGE_VERTEX_DEPTH}`);
  };
  material.customProgramCacheKey = (): string => 'building-depth-damage';
  return material;
}
