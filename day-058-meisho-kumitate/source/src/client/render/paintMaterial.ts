// 部品と地面の材質。段階1〜3は白い粘土（#F3EFE7・つや消し）で、色塗りの区間に下から上へ本当の色へ塗り替わる。
// 本当の色・金属らしさ・ざらつきは頂点ごとに持たせてあり（kit.ts の aTrue / aFinish）、ここで粘土と混ぜる。
import { Color, MeshStandardMaterial } from 'three'

/** 白い粘土の色（docs の指定） */
export const CLAY_COLOR = '#F3EFE7'
export const CLAY_ROUGHNESS = 0.9
/** 地面の白。部品の白よりわずかに沈ませ、白い部品の輪郭が地面に溶けないようにする（色の手がかりにはならない差） */
export const GROUND_CLAY_COLOR = '#E4DED2'

export interface PaintUniforms {
  uClay: { value: Color }
  uClayRough: { value: number }
  /** 塗り終わった高さ（ワールドの y）。これより下は本当の色 */
  uPaintLevel: { value: number }
  /** 塗り境のぼかし幅 */
  uPaintBand: { value: number }
  /** 金属の映り込みの倍率と下限（palette.ts の metalReflect・metalFloor） */
  uMetalReflect: { value: number }
  uMetalFloor: { value: Color }
  [name: string]: { value: unknown }
}

export function createPaintUniforms(metal?: { reflect: number; floor: Color }): PaintUniforms {
  return {
    uClay: { value: new Color(CLAY_COLOR) },
    uClayRough: { value: CLAY_ROUGHNESS },
    uPaintLevel: { value: -100 },
    uPaintBand: { value: 1 },
    uMetalReflect: { value: metal?.reflect ?? 1 },
    uMetalFloor: { value: metal?.floor.clone() ?? new Color(0, 0, 0) },
  }
}

/** 地面用。塗りの高さとぼかし幅は部品と同じものを共有し、粘土の色だけを地面の白にする */
export function groundUniforms(parts: PaintUniforms): PaintUniforms {
  return { ...parts, uClay: { value: new Color(GROUND_CLAY_COLOR) } }
}

/**
 * 粘土から本当の色へ塗り替える材質。部品用（BatchedMesh）と地面用（ふつうの Mesh）で別の物を作り、
 * 同じ uniforms を共有させる（1つの材質を両方に使うと、描くたびにシェーダーの切り替えが起きるため）。
 */
export function createPaintMaterial(uniforms: PaintUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aTrue;
attribute vec3 aFinish;
varying vec3 vTrue;
varying vec3 vFinish;
varying float vPaintY;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vTrue = aTrue;
vFinish = aFinish;
vec4 paintPos = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  paintPos = batchingMatrix * paintPos;
#endif
vPaintY = ( modelMatrix * paintPos ).y;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uClay;
uniform float uClayRough;
uniform float uPaintLevel;
uniform float uPaintBand;
uniform float uMetalReflect;
uniform vec3 uMetalFloor;
varying vec3 vTrue;
varying vec3 vFinish;
varying float vPaintY;`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
// 講評r1：金がくすんだ黄土色に見えた → 金属だけ、映り込み（空の画像）を強め（1倍→2倍）、下限を霞の明るさにする（なし→霞の約1.1倍）。
// metalnessFactor は粘土と金属でない部品では 0 なので、白い粘土・水・朱は変わらない
radiance = mix( radiance, max( radiance * uMetalReflect, uMetalFloor ), metalnessFactor );
#endif`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float paintK = max( vFinish.z, smoothstep( 0.0, 1.0, ( uPaintLevel - vPaintY ) / uPaintBand ) );
diffuseColor.rgb = mix( uClay, vTrue, paintK );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix( uClayRough, vFinish.y, paintK );`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = vFinish.x * paintK;`,
      )
  }
  material.customProgramCacheKey = () => 'meisho-paint-2'
  return material
}

/** 色塗りの度合い（0〜1）から、塗り終わった高さを決める。地面から始まり、模型のてっぺんを越えて終わる */
export function paintLevel(paint: number, groundY: number, height: number, band: number): number {
  return groundY - band + (height + 2 * band) * paint
}
