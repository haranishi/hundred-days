// OWNER: render
// 標準材質の差し替え口。街・竜の材質は必ずここを通す。
// ・CSM（段の分かれた影）の設定：通さないと、段の数だけ太陽が重なって明るくなりすぎる
// ・霧：three の霧の代わりに、空の表から色を取る空気遠近を入れる
// ・r06-light：補助光の拡散の分（three の getIBLIrradiance）を、空の表から作る球面調和（atmoAmbient）に替える。
//   鏡面（ガラス・水の映り込み）は環境マップのまま。日陰に地平の帯と琥珀の街の色が回らないようにするため（config/render.ts の AMBIENT.sky）
// ・材質ごとのシェーダーの書き換え（外壁の窓割り・路面の標示など）
import { ShaderChunk, type Material, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import type { CSM } from 'three/examples/jsm/csm/CSM.js';
import type { Atmosphere } from './atmosphereGpu';
import { ATMOSPHERE_FRAGMENT_PARS, ATMOSPHERE_VERTEX, ATMOSPHERE_VERTEX_PARS } from './shaders/atmosphereGlsl';

export interface PatchOptions {
  /** シェーダーの種類ごとに一意の名前（three のプログラムのキャッシュを分けるため） */
  key: string;
  vertex?: (src: string) => string;
  fragment?: (src: string) => string;
  uniforms?: Record<string, { value: unknown }>;
  /** 空気遠近を掛けるか（既定は掛ける） */
  fog?: boolean;
  /** 影を受けるか（既定は受ける）。受けない材質でも CSM の太陽は1つ分だけ当たる */
  csm?: boolean;
}

/** 文字列置換。対象が無ければ例外にする（three の更新で黙って効かなくなるのを防ぐ）。 */
export function replaceOrThrow(src: string, target: string, replacement: string): string {
  if (!src.includes(target)) throw new Error(`shader patch: "${target}" が見つからない`);
  return src.replace(target, replacement);
}

/** three の間接光の塊のうち、拡散の補助光の1行（r186）。 */
export const IBL_IRRADIANCE_LINE = 'iblIrradiance += getIBLIrradiance( geometryNormal );';

/** 拡散の補助光を空の球面調和に替えた lights_fragment_maps（法線を視点の空間からワールドへ戻して引く）。 */
export function ambientLightsFragmentMaps(chunk: string = ShaderChunk.lights_fragment_maps): string {
  return replaceOrThrow(chunk, IBL_IRRADIANCE_LINE, 'iblIrradiance += atmoAmbient( transformNormalByInverseViewMatrix( geometryNormal, viewMatrix ) );');
}

export class MaterialKit {
  constructor(
    private readonly atmosphere: Atmosphere,
    private readonly csm: CSM | null,
  ) {}

  patch<T extends Material>(material: T, options: PatchOptions): T {
    const fog = options.fog ?? true;
    const useCsm = (options.csm ?? true) && this.csm !== null;
    if (useCsm) this.csm!.setupMaterial(material);
    const csmHook = useCsm ? material.onBeforeCompile : null;
    const atmoUniforms = this.atmosphere.uniforms;

    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
      if (csmHook) csmHook.call(material, shader, renderer);
      if (fog) {
        Object.assign(shader.uniforms, atmoUniforms);
        shader.vertexShader = replaceOrThrow(shader.vertexShader, '#include <fog_pars_vertex>', ATMOSPHERE_VERTEX_PARS);
        shader.vertexShader = replaceOrThrow(shader.vertexShader, '#include <fog_vertex>', ATMOSPHERE_VERTEX);
        shader.fragmentShader = replaceOrThrow(shader.fragmentShader, '#include <fog_pars_fragment>', ATMOSPHERE_FRAGMENT_PARS);
        shader.fragmentShader = replaceOrThrow(
          shader.fragmentShader,
          '#include <fog_fragment>',
          'gl_FragColor.rgb = atmoApplyFog(gl_FragColor.rgb, cameraPosition, vAtmoWorld);',
        );
        shader.fragmentShader = replaceOrThrow(shader.fragmentShader, '#include <lights_fragment_maps>', ambientLightsFragmentMaps());
      }
      if (options.uniforms) Object.assign(shader.uniforms, options.uniforms);
      if (options.vertex) shader.vertexShader = options.vertex(shader.vertexShader);
      if (options.fragment) shader.fragmentShader = options.fragment(shader.fragmentShader);
    };
    const cascades = useCsm ? this.csm!.cascades : 0;
    material.customProgramCacheKey = (): string => `${options.key}|csm${cascades}|fog${fog ? 1 : 0}`;
    material.needsUpdate = true;
    return material;
  }
}
