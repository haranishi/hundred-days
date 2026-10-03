// OWNER: city
// 街路樹の描画（r01-city）。形は treeGeometry.ts、配置は world/props.ts、距離の帯の切り替えは lodPool.ts。
// ・葉のカードは画像の α で抜く。遠くでミップマップの α が薄まって葉が痩せないよう、ミップの段に合わせて α を持ち上げる
// ・葉の色は木ごとに変え（インスタンスの色は葉だけに掛ける）、樹皮は変えない
// ・逆光で葉が透ける：影を受けた後の太陽の光（csmSunIn）を、視線が太陽へ向くほど強く足す（ビルの影の中では透けない）
// ・中景・遠景の葉の塊は、ワールド座標のノイズでまだらにする（塊の平らさを隠す）
import { Color, DoubleSide, Group, MeshDepthMaterial, MeshStandardMaterial, type DataTexture, type Vector3 } from 'three';
import { AMBIENT } from '../config/render';
import { TREE_ARCHETYPES, TREE_LOOK } from '../config/trees';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';
import type { TreePlacement } from '../world/props';
import { LodPool, type PoolItem } from './lodPool';
import { buildTreeFar, buildTreeMid, buildTreeNear, createLeafTexture, growTree } from './treeGeometry';

const f = (x: number): string => (Number.isInteger(x) ? `${x}.0` : `${x}`);

function createTreeMaterial(kit: MaterialKit, leafTex: DataTexture): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: DoubleSide, envMapIntensity: AMBIENT.envIntensity });
  m.name = 'Trees';
  return kit.patch(m, {
    key: 'trees',
    uniforms: { uLeafTex: { value: leafTex } },
    vertex: (src) => {
      let s = replaceOrThrow(src, '#include <common>', '#include <common>\nattribute float aLeaf;\nattribute vec2 aLeafUv;\nvarying float vLeaf;\nvarying vec2 vLeafUv;\nvarying vec3 vTreePos;');
      // インスタンスの色（葉の色）は葉だけに掛ける
      s = replaceOrThrow(s, '#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb = mix(color.rgb, vColor.rgb, step(0.25, aLeaf));\n#endif');
      s = replaceOrThrow(
        s,
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLeaf = aLeaf;
vLeafUv = aLeafUv;
{
  vec4 tp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    tp = instanceMatrix * tp;
  #endif
  vTreePos = (modelMatrix * tp).xyz;
}`,
      );
      return s;
    },
    fragment: (src) => {
      let s = replaceOrThrow(
        src,
        '#include <common>',
        `#include <common>
uniform sampler2D uLeafTex;
varying float vLeaf;
varying vec2 vLeafUv;
varying vec3 vTreePos;
vec3 atmoSunDirection();
${NOISE_GLSL}`,
      );
      s = replaceOrThrow(
        s,
        '#include <color_fragment>',
        `#include <color_fragment>
if (vLeaf > 0.75) {
  vec4 lt = texture2D(uLeafTex, vLeafUv);
  vec2 dx = dFdx(vLeafUv * vec2(256.0, 128.0));
  vec2 dy = dFdy(vLeafUv * vec2(256.0, 128.0));
  float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8));
  if (lt.a * (1.0 + max(lod, 0.0) * 0.32) < 0.5) discard;
  diffuseColor.rgb *= lt.rgb * 1.22;
} else if (vLeaf > 0.25) {
  float n = fbm2(vTreePos.xz * 2.2 + vTreePos.y * 1.7, 3);
  float fine = vnoise(vTreePos.xz * 6.0 + vTreePos.y * 5.0);
  diffuseColor.rgb *= 0.55 + 0.7 * n + 0.2 * (fine - 0.5);
}`,
      );
      // 両面の葉は、裏から見ても塊の外向きの法線のまま光を受ける
      s = replaceOrThrow(s, '#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nif (vLeaf > 0.25) normal = normalize(vNormal);');
      s = replaceOrThrow(
        s,
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
if (vLeaf > 0.25) {
  vec3 tL = atmoSunDirection();
  vec3 tV = normalize(cameraPosition - vTreePos);
  vec3 tN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float back = pow(clamp(dot(-tV, tL), 0.0, 1.0), 3.0);
  // 透けるのは太陽と反対を向いた面だけ。r01-city：上から逆光で見下ろす overview で、日を直に受ける樹冠の上面まで
  // 黄緑に光っていたので、上面（太陽とほぼ直角）の分を 0.39→0.09 に絞った（0.5-0.5·N·L → 0.25-0.75·N·L）
  float away = clamp(0.25 - 0.75 * dot(tN, tL), 0.0, 1.0);
  // 塊の向こう側の葉（外向きの法線がカメラから離れる向き）は、日の当たる表ではなく裏を見ている。
  // r01-city：逆光の landing で、向こう側の日なたの葉が表の直射と艶のまま写り、クリーム色に白く飛んだ。裏から見る葉は直射を3割・艶を1割に落とす
  float seen = smoothstep(-0.35, 0.35, dot(tN, tV));
  reflectedLight.directDiffuse *= mix(0.3, 1.0, seen);
  reflectedLight.directSpecular *= mix(0.1, 0.6, seen);
  // 葉を通った光は葉の色でもう一度こされる（葉緑素が赤と青を吸う）ので、葉の色の3倍（上限1）を掛けて緑を濃くする
  totalEmissiveRadiance += diffuseColor.rgb * min(diffuseColor.rgb * 3.0, vec3(1.0)) * csmSunIn * (${f(TREE_LOOK.translucencyBase)} + ${f(TREE_LOOK.translucency)} * back) * away;
}`,
      );
      return s;
    },
  });
}

/** 影：葉のカードは画像の α で抜く（樹皮は抜かない）。 */
function createTreeDepthMaterial(leafTex: DataTexture): MeshDepthMaterial {
  const m = new MeshDepthMaterial();
  m.name = 'TreesDepth';
  m.onBeforeCompile = (shader): void => {
    shader.uniforms.uLeafTex = { value: leafTex };
    shader.vertexShader = replaceOrThrow(shader.vertexShader, '#include <common>', '#include <common>\nattribute float aLeaf;\nattribute vec2 aLeafUv;\nvarying float vLeaf;\nvarying vec2 vLeafUv;');
    shader.vertexShader = replaceOrThrow(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvLeaf = aLeaf;\nvLeafUv = aLeafUv;');
    shader.fragmentShader = replaceOrThrow(shader.fragmentShader, '#include <common>', '#include <common>\nuniform sampler2D uLeafTex;\nvarying float vLeaf;\nvarying vec2 vLeafUv;');
    shader.fragmentShader = replaceOrThrow(
      shader.fragmentShader,
      '#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\nif (vLeaf > 0.75 && texture2D(uLeafTex, vLeafUv).a < 0.45) discard;',
    );
  };
  m.customProgramCacheKey = (): string => 'trees-depth-leaf';
  return m;
}

/** 木の配置から、描画の1本ぶん（位置・型・大きさ・傾き・葉の色）を作る。 */
function poolItem(t: TreePlacement, groundY: number): PoolItem {
  const [c0, c1] = TREE_LOOK.leaf[t.species];
  const color = new Color().setHex(c0).lerp(new Color().setHex(c1), t.tint);
  return { x: t.x, y: groundY, z: t.z, kind: t.variant, yaw: t.yaw, sx: t.scale, sy: t.scale, sz: t.scale, lean: t.lean, leanYaw: t.leanYaw, color };
}

export class TreeView {
  readonly group = new Group();
  private readonly pool: LodPool;

  constructor(trees: readonly TreePlacement[], kit: MaterialKit, lod: { near: number; shadow: number; mid: number; far: number }, groundY: number) {
    this.group.name = 'trees';
    const leafTex = createLeafTexture();
    const material = createTreeMaterial(kit, leafTex);
    const depth = createTreeDepthMaterial(leafTex);
    const growth = TREE_ARCHETYPES.map((a) => growTree(a));
    const near = TREE_ARCHETYPES.map((a, i) => buildTreeNear(a, growth[i]));
    const mid = TREE_ARCHETYPES.map((a, i) => buildTreeMid(a, growth[i]));
    const far = TREE_ARCHETYPES.map((a, i) => buildTreeFar(a, growth[i]));
    this.pool = new LodPool(
      trees.map((t) => poolItem(t, groundY)),
      [
        { maxDist: lod.near, geometries: near, material, customDepthMaterial: depth, castShadow: true },
        // 中景の手前側だけ影を落とす（遠い木の影は画面で小さく、影の段ごとに描く三角形が増えるだけなので）
        { maxDist: lod.shadow, geometries: mid, material, customDepthMaterial: depth, castShadow: true },
        { maxDist: lod.mid, geometries: mid, material, castShadow: false },
        { maxDist: lod.far, geometries: far, material, castShadow: false },
      ],
      6,
      'trees',
    );
    for (const m of this.pool.meshes) this.group.add(m);
  }

  update(camera: Vector3): void {
    this.pool.update(camera);
  }
}
