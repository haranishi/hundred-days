// OWNER: chars-art
// 人物に添える2つの小さな効果：
//   ・接地の暗がり：足もとの地面に、柔らかい暗がりを掛け算で重ねる。world の灯り（PointLight）は影を落とさないので、
//     篝火や提灯のそばでも人物が浮いて見えないようにする。立てば丸く、倒れれば体に沿って細長くなる
//   ・一閃の光の弧：討ち取りで脇差を振り抜く間だけ、刀身の軌跡に細い光の帯を残す（血は描かない）
import {
  AdditiveBlending,
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SrcColorFactor,
  Vector3,
  ZeroFactor,
} from 'three';

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHADOW_FRAG = /* glsl */ `
uniform float uStrength;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  // 広く薄い暗がりと、真下の濃い芯。板の縁で必ず 0 になるようにする
  float m = (0.62 * exp(-3.2 * r2) + 0.38 * exp(-10.0 * r2)) * (1.0 - smoothstep(0.55, 1.0, r2));
  gl_FragColor = vec4(vec3(1.0 - m * uStrength), 1.0);
}
`;

export interface ContactShadow {
  mesh: Mesh;
  /** 中心（base から見た x, z）、長い向き（x, z の単位ベクトル）、長さと幅（m）。 */
  place(cx: number, cz: number, dx: number, dz: number, len: number, wid: number, strength: number): void;
  dispose(): void;
}

export function createContactShadow(): ContactShadow {
  const material = new ShaderMaterial({
    uniforms: { uStrength: { value: 0.55 } },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    depthWrite: false,
    // 透明の扱い（並べ替えの重い道）にしないため transparent は false のまま、描く順だけ後ろへ回す
    transparent: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: ZeroFactor,
    blendDst: SrcColorFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
  });
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'chars-contact-shadow';
  mesh.renderOrder = 10;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return {
    mesh,
    place(cx, cz, dx, dz, len, wid, strength) {
      mesh.position.set(cx, 0.012, cz);
      mesh.rotation.set(0, Math.atan2(dx, dz), 0);
      mesh.scale.set(wid, 1, len);
      material.uniforms.uStrength.value = strength;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

const ARC_VERT = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
varying float vEdge;
attribute float aEdge;
void main() {
  vAlpha = aAlpha;
  vEdge = aEdge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ARC_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
varying float vEdge;
void main() {
  // 刃先の側（vEdge=1）ほど明るく、根元の側は消える細い帯
  float a = vAlpha * smoothstep(0.0, 1.0, vEdge);
  gl_FragColor = vec4(uColor * a, a);
}
`;

const ARC_SAMPLES = 14;
const ARC_SUB = 4;
const ARC_LIFE = 0.26;

export interface SlashArc {
  mesh: Mesh;
  /** 刀身の根元と先（親から見た位置）を、強さ k（0→1）で記録する。dt で古い記録を薄める。 */
  push(base: Vector3, tip: Vector3, k: number, dt: number): void;
  /** 記録が残っているか（無ければ更新を省ける）。 */
  active(): boolean;
  dispose(): void;
}

export function createSlashArc(): SlashArc {
  const n = ARC_SAMPLES;
  const pts = (ARC_SAMPLES - 1) * ARC_SUB + 1;
  const pos = new Float32Array(pts * 2 * 3);
  const alpha = new Float32Array(pts * 2);
  const edge = new Float32Array(pts * 2);
  const idx: number[] = [];
  for (let i = 0; i < pts - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let i = 0; i < pts; i++) {
    edge[i * 2] = 0;
    edge[i * 2 + 1] = 1;
  }
  const geometry = new BufferGeometry();
  const pa = new BufferAttribute(pos, 3);
  pa.setUsage(DynamicDrawUsage);
  const aa = new BufferAttribute(alpha, 1);
  aa.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', pa);
  geometry.setAttribute('aAlpha', aa);
  geometry.setAttribute('aEdge', new BufferAttribute(edge, 1));
  geometry.setIndex(idx);
  const material = new ShaderMaterial({
    uniforms: { uColor: { value: new Vector3(1.9, 2.2, 2.6) } },
    vertexShader: ARC_VERT,
    fragmentShader: ARC_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'chars-slash-arc';
  mesh.frustumCulled = false;
  mesh.visible = false;
  // 記録：根元と先、年齢、強さ
  const rec = Array.from({ length: n }, () => ({ b: new Vector3(), t: new Vector3(), age: 1e3, k: 0 }));
  let head = 0;
  let count = 0;
  const tmpB = new Vector3();
  const tmpT = new Vector3();
  const cr = (p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, u: number, out: Vector3) => {
    const u2 = u * u;
    const u3 = u2 * u;
    return out.set(
      0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
      0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3),
    );
  };
  return {
    mesh,
    push(base, tip, k, dt) {
      for (const r of rec) r.age += dt;
      if (k > 0.01) {
        const r = rec[head];
        r.b.copy(base);
        r.t.copy(tip);
        r.age = 0;
        r.k = k;
        head = (head + 1) % n;
        count = Math.min(n, count + 1);
      }
      // 古い順に並べ、記録の間を Catmull-Rom で細かく補う（速い一振りでも弧が角張らない）
      const order: number[] = [];
      for (let i = 0; i < count; i++) order.push((head - count + i + n) % n);
      let any = false;
      let w = 0;
      for (let s = 0; s < order.length; s++) {
        const r1 = rec[order[s]];
        const r0 = rec[order[Math.max(0, s - 1)]];
        const r2 = rec[order[Math.min(order.length - 1, s + 1)]];
        const r3 = rec[order[Math.min(order.length - 1, s + 2)]];
        const steps = s === order.length - 1 ? 1 : ARC_SUB;
        for (let j = 0; j < steps && w < pts; j++) {
          const u = j / ARC_SUB;
          cr(r0.b, r1.b, r2.b, r3.b, u, tmpB);
          cr(r0.t, r1.t, r2.t, r3.t, u, tmpT);
          const age = r1.age + (r2.age - r1.age) * u;
          const a = Math.max(0, 1 - age / ARC_LIFE) * (r1.k + (r2.k - r1.k) * u);
          if (a > 0.003) any = true;
          pos.set([tmpB.x, tmpB.y, tmpB.z, tmpT.x, tmpT.y, tmpT.z], w * 6);
          alpha[w * 2] = a;
          alpha[w * 2 + 1] = a;
          w++;
        }
      }
      // 使わない残りは最後の点に重ねて消す
      for (let i = w; i < pts; i++) {
        if (w > 0) pos.copyWithin(i * 6, (w - 1) * 6, w * 6);
        alpha[i * 2] = 0;
        alpha[i * 2 + 1] = 0;
      }
      pa.needsUpdate = true;
      aa.needsUpdate = true;
      mesh.visible = any;
      if (!any) count = 0;
    },
    active() {
      return mesh.visible || count > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
