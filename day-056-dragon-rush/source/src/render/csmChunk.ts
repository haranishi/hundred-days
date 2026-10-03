// OWNER: render
// three r186 の落とし穴：examples の CSMShader.lights_fragment_begin は古い本体の写しで、
// r186 で本体に入った多重散乱の準備（material.dfg と multiScatteringCompensation の計算）を含まない。
// CSM はこの写しで ShaderChunk を丸ごと置き換えるため、全材質で環境反射（間接鏡面）が 0 になり、
// ガラスが真っ黒になっていた。本体の塊を土台にし、平行光源の部分だけを CSM の版に差し替える。
// r01-city：太陽が影を受けた後の入射光（色×強さ×影）を main の変数 csmSunIn に残す。
// 窓の奥の部屋に差し込む日だまり・葉の透過光のように、「その点に日が当たっているか」で光る材質が、
// lights_fragment_end の後でこれを読む（CSM の段の混ぜ方と同じ割合で混ぜるので、段の境目で跳ねない）。
import { ShaderChunk } from 'three';
import * as CSMShaderModule from 'three/examples/jsm/csm/CSMShader.js';

// @types/three は CSMShader を型（interface）としてしか宣言していないが、実行時は値として export されている
const CSMShader = (CSMShaderModule as unknown as { CSMShader: { lights_fragment_begin: string } }).CSMShader;

/** このモジュールを読み込んだ時点（CSM を作る前）の本体の塊。 */
const CORE_LIGHTS_BEGIN = ShaderChunk.lights_fragment_begin;

const DIR_START = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const RECT_START = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
const CSM_START = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && defined( USE_CSM ) && defined( CSM_CASCADES )';
const CSM_FALLBACK = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM ) && !defined( CSM_CASCADES )';

function indexOrThrow(src: string, target: string, from = 0): number {
  const i = src.indexOf(target, from);
  if (i < 0) throw new Error(`csmChunk: "${target}" が見つからない（three の版が変わった可能性）`);
  return i;
}

/** 文字列の target の直後に addition を差し込む（見つからなければ例外）。 */
function insertAfter(src: string, target: string, addition: string): string {
  const i = indexOrThrow(src, target);
  return src.slice(0, i + target.length) + addition + src.slice(i + target.length);
}

// 影を受けた後の太陽の入射光を csmSunIn に写す行
const CORE_DIR_RE_DIRECT = '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}';
const CSM_FADE_BLEND = 'float blendRatio = shouldBlend ? ratio : 1.0;';
const CSM_PLAIN_RE_DIRECT =
  'if(linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && (linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1)) RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const CSM_NO_SHADOW = 'getDirectionalLightInfo( directionalLights[0], directLight );';

/** 本体の塊の平行光源の部分を、USE_CSM のときだけ CSM の版にしたもの。 */
export function buildCsmLightsBegin(core: string = CORE_LIGHTS_BEGIN, csm: string = CSMShader.lights_fragment_begin): string {
  const dirStart = indexOrThrow(core, DIR_START);
  const rectStart = indexOrThrow(core, RECT_START, dirStart);
  const csmStart = indexOrThrow(csm, CSM_START);
  const csmEnd = indexOrThrow(csm, CSM_FALLBACK, csmStart);
  let coreDirectional = core.slice(dirStart, rectStart);
  let csmDirectional = csm.slice(csmStart, csmEnd);
  // 本体の版：影を掛けた直後の光の色（RE_Direct の直前の行の後）
  coreDirectional = coreDirectional.replace(CORE_DIR_RE_DIRECT, '\t\tcsmSunIn = directLight.color;\n' + CORE_DIR_RE_DIRECT);
  if (!coreDirectional.includes('csmSunIn')) throw new Error('csmChunk: 本体の平行光源の RE_Direct が見つからない（three の版が変わった可能性）');
  // CSM の版：段の混ぜ方と同じ割合で混ぜる／段が1つに決まる版／影の無い版
  csmDirectional = insertAfter(csmDirectional, CSM_FADE_BLEND, '\n\t\t\t\t\tcsmSunIn = mix( csmSunIn, directLight.color, blendRatio );');
  csmDirectional = insertAfter(
    csmDirectional,
    CSM_PLAIN_RE_DIRECT,
    '\n\t\t\t\tif(linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && (linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1)) csmSunIn = directLight.color;',
  );
  csmDirectional = insertAfter(csmDirectional, CSM_NO_SHADOW, '\n\t\tcsmSunIn = directLight.color;');
  return (
    core.slice(0, dirStart) +
    'vec3 csmSunIn = vec3( 0.0 );\n' +
    '#if defined( USE_CSM ) && defined( CSM_CASCADES )\n' +
    csmDirectional +
    '\n#else\n' +
    coreDirectional +
    '\n#endif\n' +
    core.slice(rectStart)
  );
}

/** CSM を作った後に呼ぶ（CSM のコンストラクタが塊を上書きするため）。 */
export function installCsmLightsBegin(): void {
  ShaderChunk.lights_fragment_begin = buildCsmLightsBegin();
}
