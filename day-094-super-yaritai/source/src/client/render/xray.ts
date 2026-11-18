/**
 * 透かし：キャラとカメラの間にある棚・冷凍ケース・壁・商品を、画面上でキャラの周りの円の中だけ薄くする（docs/04）。
 * 網目に間引く（ディザ）のはおもちゃの絵柄に合わない（見た目の採点）ので、round3 から半透明にした：
 * 円の中ほど薄く（22%）、縁へ向かってなめらかに元へ戻す。面ごとの陰影は残るので、物の形（輪郭）は見える。
 * 半透明の並べ替えは、円の外では不透明（α=1）なので深さで正しく決まり、円の中だけ近似になる。影を作る描画には効かせない（影は残る）。
 */
import * as THREE from 'three';

export const xrayUniforms = {
  /** 円の中心（描画バッファの画素。左下が原点） */
  uXrayCenter: { value: new THREE.Vector2(-1e4, -1e4) },
  uXrayRadius: { value: 0 },
  /** キャラまでのカメラからの距離（これより手前だけを抜く） */
  uXrayDepth: { value: 0 },
};

/** 円の真ん中の濃さ（0＝見えない、1＝そのまま） */
export const XRAY_CORE_ALPHA = 0.22;

const FRAG_HEAD = /* glsl */ `
varying float vXrayDepth;
uniform vec2 uXrayCenter;
uniform float uXrayRadius;
uniform float uXrayDepth;
`;

const FRAG_MAIN = /* glsl */ `
  float xrayAlpha = 1.0;
  if (uXrayRadius > 0.0 && vXrayDepth < uXrayDepth) {
    float xd = distance(gl_FragCoord.xy, uXrayCenter);
    // 円の中ほど薄く、縁はなめらかに元へ（そこに物があることは陰影で分かる）
    if (xd < uXrayRadius) xrayAlpha = mix(${XRAY_CORE_ALPHA.toFixed(2)}, 1.0, smoothstep(uXrayRadius * 0.55, uXrayRadius, xd));
  }
`;

const FRAG_ALPHA = /* glsl */ `
  gl_FragColor.a *= xrayAlpha;
`;

/** 材質に透かしの仕掛けを足す（同じ材質を何度渡してもよい） */
export function applyXray(material: THREE.Material): void {
  if (material.userData.xray) return;
  material.userData.xray = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, xrayUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vXrayDepth;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvXrayDepth = -mvPosition.z;');
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_HEAD}`).replace('void main() {', `void main() {\n${FRAG_MAIN}`);
    // 色を決めた直後に、透かしの濃さを掛ける（three の版で名前が違う）
    frag = frag.includes('#include <opaque_fragment>') ? frag.replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${FRAG_ALPHA}`) : frag.replace('#include <output_fragment>', `#include <output_fragment>\n${FRAG_ALPHA}`);
    shader.fragmentShader = frag;
  };
  // 半透明で描く（円の外は α=1 なので、見た目は不透明と同じ）
  material.transparent = true;
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${prevKey()}|xray`;
  material.needsUpdate = true;
}
