/**
 * 色と材質。輪郭線は「裏面を外へ少し太らせて暗い色で塗る」方式（教材のイラストに近づけるため）。
 * 太らせる量は画面上のピクセルでそろえる（小さな画像でも大きな表示でも同じ太さに見えるように）。
 */
import { BackSide, Color, MeshStandardMaterial, ShaderMaterial, Vector3, type Material } from 'three';

export const PALETTE = {
  skin: '#F4C7A6',
  skinShade: '#E7AE8B',
  nail: '#FCE8DF',
  outline: '#5B3A2E',
  sleeve: '#4C5FD5',
  sleeveRim: '#3D4FC4',
  sleeveOutline: '#262F7A',
  trail: '#4C5FD5',
  shirt: '#8FA3E8',
  hair: '#4A3A35',
  face: '#5B3A2E',
};

/** 輪郭線の幅（ピクセル）と、1ピクセルあたりの長さ（深さ1のとき）。描くたびに表示の大きさから更新する */
export const outlineUniforms = {
  uWidthPx: { value: 2.2 },
  uPixelScale: { value: 0.002 },
};

/**
 * 小さな画像で、袖・腕・胴・空中の跡が画像の縁に当たる所をぼかして消す（hand-r3）。
 * 小さな画像は白い札の中に置かれるので、縁で切れた袖が札の中の直線の切れ目に見えた（見た目の採点 第2周の指摘）。
 * 手（手のひら・指・手首）と頭は消さない（枠の内側に収めてあるので縁には当たらない）。
 * x=描く幅・y=高さ（実ピクセル。描く範囲の左下が原点）・z=消し切るまでの幅（ピクセル）。z が 0 なら何もしない（大きな表示）
 */
export const edgeFadeUniforms = {
  uEdgeFade: { value: new Vector3(0, 0, 0) },
};

/** 縁からの距離で塗りを薄くする。不透明の材質は混ぜずに書くので、色にも同じ割合を掛ける（描画面は掛け算済みの透明度で持つ） */
const edgeFadeChunk = /* glsl */ `
uniform vec3 uEdgeFade;
vec4 edgeFade(vec4 c) {
  if (uEdgeFade.z <= 0.0) return c;
  vec2 p = gl_FragCoord.xy;
  float d = min(min(p.x, uEdgeFade.x - p.x), min(p.y, uEdgeFade.y - p.y));
  float f = smoothstep(0.0, uEdgeFade.z, d);
#ifdef OPAQUE
  return c * f;
#else
  return vec4(c.rgb, c.a * f);
#endif
}
`;

/** 材質に、画像の縁でぼかして消す処理を足す（three.js の標準の材質用） */
export function fadeAtEdges<T extends Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeFade = edgeFadeUniforms.uEdgeFade;
    shader.fragmentShader =
      edgeFadeChunk + shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = edgeFade( gl_FragColor );');
  };
  m.customProgramCacheKey = () => 'tekotoba-edge-fade';
  return m;
}

const outlineVertex = /* glsl */ `
uniform float uWidthPx;
uniform float uPixelScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * (uWidthPx * uPixelScale * max(-mv.z, 0.0));
  gl_Position = projectionMatrix * mv;
}
`;
const outlineFragment = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}
`;
const outlineFragmentFaded = /* glsl */ `
uniform vec3 uColor;
${edgeFadeChunk}
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = edgeFade(gl_FragColor);
}
`;

/** 輪郭線の材質。fade＝画像の縁でぼかして消す（袖・腕・胴の輪郭線。手と頭の輪郭線は消さない） */
export function outlineMaterial(color: string, fade = false): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: fade
      ? { ...outlineUniforms, ...edgeFadeUniforms, uColor: { value: new Color(color) } }
      : { ...outlineUniforms, uColor: { value: new Color(color) } },
    vertexShader: outlineVertex,
    fragmentShader: fade ? outlineFragmentFaded : outlineFragment,
    side: BackSide,
  });
}

export interface Materials {
  skin: MeshStandardMaterial;
  nail: MeshStandardMaterial;
  /** 小さな画像で、休めている手（形を作る前の反対の手）を袖と同じく縁でぼかすための肌・爪・輪郭線（hand-r3） */
  skinFaded: MeshStandardMaterial;
  nailFaded: MeshStandardMaterial;
  outlineFaded: ShaderMaterial;
  sleeve: MeshStandardMaterial;
  sleeveRim: MeshStandardMaterial;
  shirt: MeshStandardMaterial;
  /** 自分から見る時の胴・首と頭・髪（薄く透かして、その向こうの手を見せる。奥行きは書き込まない） */
  shirtSeeThrough: MeshStandardMaterial;
  skinSeeThrough: MeshStandardMaterial;
  hairSeeThrough: MeshStandardMaterial;
  hair: MeshStandardMaterial;
  face: MeshStandardMaterial;
  outline: ShaderMaterial;
  sleeveOutline: ShaderMaterial;
}

let shared: Materials | null = null;

export function materials(): Materials {
  if (shared) return shared;
  // 袖・腕・胴（とその輪郭線）は、小さな画像の縁でぼかして消す（fadeAtEdges。大きな表示では何もしない）
  shared = {
    skin: new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.78, metalness: 0 }),
    nail: new MeshStandardMaterial({ color: PALETTE.nail, roughness: 0.4, metalness: 0 }),
    skinFaded: fadeAtEdges(new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.78, metalness: 0 })),
    nailFaded: fadeAtEdges(new MeshStandardMaterial({ color: PALETTE.nail, roughness: 0.4, metalness: 0 })),
    sleeve: fadeAtEdges(new MeshStandardMaterial({ color: PALETTE.sleeve, roughness: 0.85, metalness: 0 })),
    sleeveRim: fadeAtEdges(new MeshStandardMaterial({ color: PALETTE.sleeveRim, roughness: 0.85, metalness: 0 })),
    shirt: fadeAtEdges(new MeshStandardMaterial({ color: PALETTE.shirt, roughness: 0.9, metalness: 0 })),
    shirtSeeThrough: fadeAtEdges(
      new MeshStandardMaterial({ color: PALETTE.shirt, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false }),
    ),
    skinSeeThrough: new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.78, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false }),
    hairSeeThrough: new MeshStandardMaterial({ color: PALETTE.hair, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false }),
    hair: new MeshStandardMaterial({ color: PALETTE.hair, roughness: 0.9, metalness: 0 }),
    face: new MeshStandardMaterial({ color: PALETTE.face, roughness: 0.6, metalness: 0 }),
    outline: outlineMaterial(PALETTE.outline),
    sleeveOutline: outlineMaterial(PALETTE.sleeveOutline, true),
    outlineFaded: outlineMaterial(PALETTE.outline, true),
  };
  return shared;
}

export function disposeMaterials() {
  if (!shared) return;
  for (const m of Object.values(shared) as Material[]) m.dispose();
  shared = null;
}
