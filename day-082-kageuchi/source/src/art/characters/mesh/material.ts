// OWNER: chars-art
// 人物の材質。物理ベース（MeshStandardMaterial）に、頂点ごとの粗さ・金属らしさ・発光（aSurf）を差し込む。
// 布は粗く、漆は艶、刃は金属、提灯の紙は内から光る──を1つの材質で描き分け、1人1回の描画命令に収める。
// 発光は「貼り絵と頂点色を掛けた色 × aSurf.z × uGlow」なので、紙に描いた黒い紋は光らない。
// 人物ごとに材質は別の物を作るが、シェーダーの中身と customProgramCacheKey が同じなので、プログラムは1つを共有する。
import { MeshStandardMaterial, ShaderChunk, Vector2, Vector4, type Texture } from 'three';
import { MATERIAL_DETAIL as DETAIL, PLAYER_OUTFIT, RIM, SURF } from '../config';
import { region } from './atlas';

export interface CharacterMaterial {
  material: MeshStandardMaterial;
  /** 提灯の紙の明るさ（揺らぎ）。 */
  glow: { value: number };
  /**
   * 縁の光（xyz 色、w 強さ 0..1）。プレイヤーは常に 1（r02-fix-visual）。当て身を受ける番兵は動作の間だけ上げる
   * （r03-fix-visual：w を 0/1 の切り替えから強さに変えた）。プログラムは全員で共有のまま
   */
  rim: { value: Vector4 };
  /**
   * 足元の暗さ（r01-integrate）。x＝環境光（空の環境マップと半球光）の倍率、y＝主光（空からの平行光）の倍率。
   * 竹林・軒下・蔵の陰の暗さは世界の材質に焼き込まれているので、人物にも同じ暗さを掛けて周りから浮かないようにする。
   * 灯り（点光源）は下げない：暗がりでも提灯や篝火の光は人物に当たる。
   */
  shade: { value: Vector2 };
}

const SUN_INFO = 'getSunLightInfo( sunLight, directLight );';
const DIR_INFO = 'getDirectionalLightInfo( directionalLight, directLight );';

const glsl = (n: number) => n.toFixed(8);
const face = region('facePlayer');
// r07-chars: 三次元の休み座標なので皮膚変形・歩行で柄が泳がない。2方向の細い糸と低周波の染めむらを
// 別々に扱い、布だけ色・法線へ、漆と金属は主に粗さへ。遠景は微分で平均化する。
const DETAIL_GLSL = `
varying vec3 vKgRest;
varying float vKgDetail;
float kgFilteredWave(float phase) {
  return sin(phase) * (1.0 - smoothstep(${glsl(DETAIL.filter[0])}, ${glsl(DETAIL.filter[1])}, fwidth(phase)));
}
float kgCloth() {
  vec3 p = vKgRest * ${glsl(2 * Math.PI / DETAIL.clothPitch)};
  return kgFilteredWave(p.x + p.z) * kgFilteredWave(p.y);
}
float kgGrain() {
  vec3 p = vKgRest * ${glsl(2 * Math.PI / DETAIL.grainPitch)};
  return kgFilteredWave(p.y + 0.17 * p.z) * kgFilteredWave(p.x - 0.23 * p.z);
}
float kgDye() {
  vec3 p = vKgRest * ${glsl(2 * Math.PI / DETAIL.dyePitch)};
  return sin(p.y + 0.8 * sin(p.x)) * sin(p.x + p.z);
}
`;
const DETAIL_MAP = `#include <map_fragment>
float kgClothMask = 1.0 - step(0.25, abs(vKgDetail - 1.0));
float kgHoodMask = 1.0 - step(0.25, abs(vKgDetail - 4.0));
float kgSkinOpening = 0.0;
#ifdef USE_MAP
vec2 kgFaceUv = (vMapUv - vec2(${glsl(face.u0)}, ${glsl(face.v0)})) / vec2(${glsl(face.u1 - face.u0)}, ${glsl(face.v1 - face.v0)});
vec2 kgEyeDist = (kgFaceUv - vec2(0.5)) / vec2(${glsl(PLAYER_OUTFIT.eyes.openingW)}, ${glsl(PLAYER_OUTFIT.eyes.openingH)});
kgSkinOpening = kgHoodMask * (1.0 - smoothstep(${glsl(DETAIL.openingBlend[0])}, ${glsl(DETAIL.openingBlend[1])}, dot(kgEyeDist, kgEyeDist)));
#endif
kgClothMask += kgHoodMask - kgSkinOpening;
float kgLacquerMask = 1.0 - step(0.25, abs(vKgDetail - 2.0));
float kgMetalMask = 1.0 - step(0.25, abs(vKgDetail - 3.0));
float kgWeave = kgCloth();
float kgSurfaceGrain = kgGrain();
float kgDyeNoise = kgDye();
diffuseColor.rgb *= 1.0 + kgClothMask * kgDyeNoise * ${glsl(DETAIL.clothDye)};
`;
const DETAIL_NORMAL = `#include <normal_fragment_maps>
// 画面の微分から曲面の接線を求める。接線UVを追加せず、既存のスキニング法線を保持。
float kgHeight = kgClothMask * kgWeave * ${glsl(DETAIL.clothBump)}
  + kgLacquerMask * kgSurfaceGrain * ${glsl(DETAIL.lacquerBump)}
  + kgMetalMask * kgSurfaceGrain * ${glsl(DETAIL.metalBump)};
vec3 kgDx = dFdx(-vViewPosition), kgDy = dFdy(-vViewPosition);
vec3 kgRx = cross(kgDy, normal), kgRy = cross(normal, kgDx);
float kgDet = dot(kgDx, kgRx);
if (abs(kgDet) > 1e-12) {
  normal = normalize(abs(kgDet) * normal - sign(kgDet) *
    (dFdx(kgHeight) * kgRx + dFdy(kgHeight) * kgRy));
}
`;

export function createCharacterMaterial(map: Texture): CharacterMaterial {
  const glow = { value: 1 };
  const shade = { value: new Vector2(1, 1) };
  const rim = { value: new Vector4(RIM.color[0], RIM.color[1], RIM.color[2], 0) };
  const rimP = { value: new Vector4(RIM.width, RIM.inLight, RIM.lit[0], RIM.lit[1]) };
  const material = new MeshStandardMaterial({ vertexColors: true, map, roughness: 1, metalness: 0 });
  material.name = 'kage-character';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = glow;
    shader.uniforms.uKgShade = shade;
    shader.uniforms.uKgRim = rim;
    shader.uniforms.uKgRimP = rimP;
    // 主光の繰り返しだけに倍率を掛ける（ShaderChunk は世界が灯りの減衰を差し替えた後の物を、コンパイルの時に読む）
    const begin = ShaderChunk.lights_fragment_begin
      .replace(SUN_INFO, `${SUN_INFO}\n\t\tdirectLight.color *= uKgShade.y;`)
      .replace(DIR_INFO, `${DIR_INFO}\n\t\tdirectLight.color *= uKgShade.y;`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSurf;\nattribute float aDetail;\nvarying vec3 vSurf;\nvarying vec3 vKgRest;\nvarying float vKgDetail;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSurf = aSurf;\n\tvKgRest = position;\n\tvKgDetail = aDetail;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;\nuniform float uGlow;\nuniform vec2 uKgShade;\nuniform vec4 uKgRim;\nuniform vec4 uKgRimP;\n' + DETAIL_GLSL)
      .replace('#include <map_fragment>', DETAIL_MAP)
      .replace('#include <normal_fragment_maps>', DETAIL_NORMAL)
      .replace('#include <lights_fragment_begin>', begin)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
	reflectedLight.indirectDiffuse *= uKgShade.x;
	reflectedLight.indirectSpecular *= uKgShade.x;
	// 縁の光（プレイヤーと、当て身を受けている番兵）：輪郭の細い帯に、上と横から来る空の寒色を足す。いま受けている光が少ない（闇の）ほど強い
	if (uKgRim.w > 0.0) {
		float kgNv = saturate( dot( normal, normalize( vViewPosition ) ) );
		float kgEdge = smoothstep( uKgRimP.x, 1.0, 1.0 - kgNv );
		vec3 kgWn = inverseTransformDirection( normal, viewMatrix );
		float kgUp = 0.45 + 0.55 * saturate( kgWn.y * 0.8 + 0.5 );
		float kgLit = dot( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.02 );
		float kgDark = 1.0 - smoothstep( uKgRimP.z, uKgRimP.w, kgLit );
		reflectedLight.directSpecular += uKgRim.rgb * kgEdge * kgEdge * kgUp * mix( uKgRimP.y, 1.0, kgDark ) * uKgRim.w;
	}`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(mix(vSurf.x, ${glsl(SURF.skin.r)}, kgSkinOpening)
        + kgClothMask * kgWeave * ${glsl(DETAIL.clothRough)}
        + kgLacquerMask * kgSurfaceGrain * ${glsl(DETAIL.lacquerRough)}
        + kgMetalMask * kgSurfaceGrain * ${glsl(DETAIL.metalRough)}, 0.05, 1.0);`)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * vSurf.z * uGlow;',
      );
  };
  material.customProgramCacheKey = () => 'kage-character-v5-r07-detail';
  return { material, glow, shade, rim };
}
