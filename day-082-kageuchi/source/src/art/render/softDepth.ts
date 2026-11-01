// OWNER: world-art
// 炎・煙・火の粉の「深さで縁を溶かす」描き方（ソフトパーティクル）。r03-fix-visual 追加。
// 指摘「炎上の終わりと結果画面で、手前の屋根の炎の板が半透明の膜に見え、屋根と水平の硬い線で交わる」
// 炎は縦に立てた板なので、傾いた屋根に刺さる所が深さの試験で一直線に切れていた。炎の類だけ別の層（FIRE_LAYER）に置き、
// 後処理の炎の段（post.ts の KgFirePass）で、場面の深さの画像と比べながら描く。場面の面に近づくほど薄くし、奥は描かない。
import { Vector4, type Texture } from 'three';

/** 炎・煙・火の粉を置く層。ふつうの場面の描画（層 0）には入らず、炎の段だけが描く。 */
export const FIRE_LAYER = 3;

export const SOFT_UNIFORMS = {
  /** 場面の深さ（後処理の合成器が配る、出力に使われない深さの画像） */
  uKgDepth: { value: null as Texture | null },
  /** x: 1/幅, y: 1/高さ（画素）, z: カメラの near, w: far */
  uKgDepthInfo: { value: new Vector4(1, 1, 0.1, 1000) },
};

/** 断片の視点空間の z（vKgViewZ、負の値）と、場面の面との距離で 0..1。soft（m）で 1 になる。 */
export const SOFT_GLSL = /* glsl */ `
uniform sampler2D uKgDepth;
uniform vec4 uKgDepthInfo;
varying float vKgViewZ;
float kgSoftDepth(float soft) {
  float d = texture2D(uKgDepth, gl_FragCoord.xy * uKgDepthInfo.xy).x;
  float n = uKgDepthInfo.z;
  float f = uKgDepthInfo.w;
  float sceneZ = (n * f) / ((f - n) * d - f);
  return smoothstep(0.0, soft, vKgViewZ - sceneZ);
}
`;
