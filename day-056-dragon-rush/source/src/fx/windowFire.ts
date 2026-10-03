// OWNER: fx
// 窓の炎（r03-fx）。指摘「aftermath の火は同じ涙形の小さな板が壁一面に散り、瞬くだけ」。
// 燃えている階の窓（windowSlots.ts の順）から、窓ごとに幅・高さ・揺れの速さ・煤の多さの違う炎を出す。
// 炎は窓の下端から立ち、窓の上の外壁を舐めて上がり、上ほど風下へ傾く。形は時間で上へ流れるノイズで作り、窓ごとに位相が違う。
// 1枚の板を縦の軸のまわりだけカメラへ向け（縦長の炎のまま）、前掛けの合成で描く（重なっても炎の色の上限を超えない）。
// r04-fx2：指摘「breath の壁の炎は板が壁と交わる所に四角い直線の縁が出る」「遠目には白い芯の同じ三角が並ぶ切り紙」。
// ・板を壁から離し、視線に沿って板の点から奥の壁までが近い所ほど透かす。濃い所は今までどおり深さを書き（1回目の描画）、
//   壁の近くの透かす所と炎の輪郭の薄い所を深さを書かずに滑らかに描く（2回目。深さを書くと、薄い縁が奥の煙を切り抜く）
// ・形を4種（舌・横に広がる・二股・くすぶり）にし、窓の中の炎は窓の開口の幅に収める。板の縁（左右・上下）では必ず消す
// ・遠くでは炎を窓の中へ縮めて消し（板をやめる）、外壁のシェーダーの窓の赤い光（damageGlsl.ts）に任せる
import {
  BufferAttribute,
  CustomBlending,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { FLAME, FX, WIND } from '../config/fx';
import { FX_LAYER, SOFT_GLSL, SOFT_UNIFORMS } from '../render/softParticles';
import type { Atmosphere } from '../render/atmosphereGpu';
import { ATMOSPHERE_PARS } from '../render/shaders/atmosphereGlsl';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';
import { FLAME_GLSL, flameUniforms } from './flameGlsl';
import type { WallPoint } from './buildingPoints';
import type { WindowSlot } from './windowSlots';

const VERT = /* glsl */ `
${ATMOSPHERE_PARS}
attribute vec3 iPos;
attribute vec4 iDir;
attribute vec4 iShape;
attribute vec2 iMore;
uniform vec3 uWind;
uniform float uWallOffset;
uniform vec2 uFadeDist;
varying vec2 vUv;
varying vec4 vShape;
varying float vWinFrac;
varying float vFlameFrac;
varying float vAspect;
varying float vWinW;
varying float vFar;
varying vec3 vWorld;
varying vec3 vWallP;
varying vec3 vWallN;
varying vec3 vFogT;
varying vec3 vInscatter;
varying vec3 vAmbient;
varying float vViewZ;
void main() {
  vec3 n = vec3(iDir.x, 0.0, iDir.y);
  float winH = iDir.w;
  float flameH = iShape.x;
  // 板の上の方は、炎の上から外壁を這い上がる煙（炎の高さの 0.9 倍）
  float total = winH + flameH * 1.9;
  // r04-fx2：板を壁から uWallOffset 離す（正面から見ても壁の近くの透かしが掛からない距離）
  vec3 base = iPos - vec3(0.0, 0.5 * winH, 0.0) + n * uWallOffset;
  vec3 toCam = cameraPosition - base;
  float dist = length(toCam);
  // 遠いほど幅を広げて隣の窓の炎とつなげ、燃えている階を1本の炎の帯として読ませる（遠くの細い白い棘にしない）
  float width = iDir.z * mix(1.0, 1.8, smoothstep(120.0, 480.0, dist));
  vec3 right = cross(vec3(0.0, 1.0, 0.0), toCam);
  float rl = length(right);
  // 真上から見るときは壁の向きに並べる
  right = rl > 1e-3 * length(toCam) ? right / rl : vec3(-n.z, 0.0, n.x);
  float side = abs(dot(right, n));
  // 煙の所は上へ広がる
  float h = position.y * total;
  float spread = 1.0 + 0.8 * smoothstep(winH + flameH * 0.7, total, h);
  vec3 p = base + right * position.x * width * spread + vec3(0.0, h, 0.0);
  // 横から見たときに板の半分が壁に埋まらないよう外へ出す
  p += n * (0.5 * width * side);
  // 窓の上：外壁を舐めて上がり、上ほど風下へ傾く
  float above = max(0.0, h - winH);
  p += uWind * (above * above / max(total, 1.0)) * 0.1;
  p -= n * min(above * 0.2, 1.1) * (1.0 - side);
  vUv = vec2(position.x * 2.0, position.y);
  vShape = iShape;
  vWinFrac = winH / total;
  vFlameFrac = (winH + flameH) / total;
  vAspect = total / max(width, 0.5);
  // 窓の開口の幅（板の幅に対する割合）。遠くで板を広げた分だけ狭くなる
  vWinW = clamp(iMore.x * iDir.z / max(width, 1e-3), 0.12, 1.0);
  // r04-fx2：遠くでは炎を窓の中へ縮めて消す（板をやめ、窓の赤い光に任せる）
  vFar = 1.0 - smoothstep(uFadeDist.x, uFadeDist.y, dist);
  vWorld = p;
  vWallP = iPos;
  vWallN = n;
  vec3 d = p - cameraPosition;
  vFogT = exp(-atmoOpticalDepth(cameraPosition, p) * uAtmoFogTint);
  vInscatter = atmoSky(normalize(d)) * uAtmoFog.w * (1.0 - vFogT);
  vAmbient = atmoSky(vec3(0.0, 1.0, 0.0)) * 0.6;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * pass 1：濃い所（壁から離れた所）を深さを書いて描く。pass 2：壁の近くの透かす所と、形の縁の薄い所を、深さを書かずに描く。
 * r04-fx2（引き継ぎ）：薄い縁（濃さ 0.3 未満）を捨てていたので、炎の輪郭が切り紙のような硬い線になっていた。縁は2回目で描く
 */
function fragment(pass: 1 | 2): string {
  return /* glsl */ `
${NOISE_GLSL}
${FLAME_GLSL}
${SOFT_GLSL}
uniform float uTime;
uniform float uFireAlpha;
uniform float uSootAlpha;
uniform float uWallFade;
varying vec2 vUv;
varying vec4 vShape;
varying float vWinFrac;
varying float vFlameFrac;
varying float vAspect;
varying float vWinW;
varying float vFar;
varying vec3 vWorld;
varying vec3 vWallP;
varying vec3 vWallN;
varying vec3 vFogT;
varying vec3 vInscatter;
varying vec3 vAmbient;
varying float vViewZ;
void main() {
  // 壁の外にだけ描く。視線に沿って、この点から奥の壁の面までの距離が uWallFade より近いほど透かす
  if (dot(vWorld - vWallP, vWallN) < 0.0) discard;
  vec3 V = vWorld - cameraPosition;
  float tf = length(V);
  vec3 u = V / max(tf, 1e-3);
  float un = dot(u, vWallN);
  float dview = un < -1e-3 ? dot(vWallP - cameraPosition, vWallN) / un - tf : 1e4;
  // r04-fx2（引き継ぎ）：奥の不透明な物（壁・ひさし・隣のビル）に近い所も透かす（render/softParticles.ts）
  float wallK = smoothstep(0.0, uWallFade, dview) * softFade(vViewZ, uWallFade);
  ${pass === 1 ? 'if (wallK < 0.995) discard;' : 'if (wallK < 0.004) discard;'}
  float x = vUv.x;
  float y = vUv.y;
  float seed = vShape.y;
  float I = vShape.z * mix(0.0, 1.0, vFar);
  // 形の種類：0 舌（細く高い）・1 横に広がる（窓の上を舐める）・2 二股・3 くすぶり（低い炎と濃い煙）
  float kind = floor(vShape.w * 4.0);
  float t = uTime * mix(0.85, 1.45, fract(seed * 7.31)) + seed * 23.0;
  float yw = vWinFrac;
  float yf = vFlameFrac;
  // ya：窓の上端から炎の先まで 0〜1。ys：窓の上端から板の上端（煙の先）まで 0〜1
  float ya = clamp((y - yw) / max(yf - yw, 1e-3), 0.0, 1.0);
  float ys = clamp((y - yw) / max(1.0 - yw, 1e-3), 0.0, 1.0);
  float yy = y * vAspect;
  float n1 = fbm2(vec2(x * 1.35 + seed * 9.0, yy * 0.9 - t * 1.7), 3);
  float n2 = vnoise(vec2(x * 3.4 + seed * 3.0, yy * 2.1 - t * 3.1));
  // 種類ごとの細り方・横への広がり・舌の数・煙の多さ・温度
  float pw = kind < 0.5 ? 0.7 : kind < 1.5 ? 1.9 : kind < 2.5 ? 1.1 : 1.4;
  float xw = kind < 0.5 ? 0.95 : kind < 1.5 ? 0.5 : kind < 2.5 ? 0.72 : 0.8;
  float lobeK = kind < 0.5 ? 0.12 : kind < 1.5 ? 0.3 : kind < 2.5 ? 0.62 : 0.25;
  float smokeK = kind < 0.5 ? 0.7 : kind < 1.5 ? 1.0 : kind < 2.5 ? 0.85 : 1.45;
  float heatK = kind < 0.5 ? 1.05 : kind < 1.5 ? 0.97 : kind < 2.5 ? 1.0 : 0.8;
  // 窓の中は開口の幅に収め、窓の上で板の幅まで広がって丸く細る。
  // r04-fx2（引き継ぎ）：開口の縁は揺らして広く移す（狭い移りと濃さ 0.3 で切る描き方の組み合わせで、窓の形の四角が浮いて見えた）
  float inWin = 1.0 - smoothstep(vWinW * 0.45, vWinW * 1.1, abs(x) + (n2 - 0.5) * 0.4 * vWinW);
  float widen = mix(vWinW, 1.0, smoothstep(0.0, 0.35, ya));
  float prof = y < yw ? 0.9 * inWin - 0.35 * (1.0 - inWin) : (y > yf ? -1.0 : 1.0 - pow(ya, pw + 0.8 * fract(seed * 3.7)));
  float lobes = 0.5 + 0.5 * sin(x * (4.0 + 3.0 * fract(seed * 5.9)) + seed * 13.0 + n1 * 3.0);
  float shape = prof - abs(x) / max(widen, 0.2) * xw * (y < yw ? 0.2 : 0.85) + (n1 - 0.5) * 0.95 + (n2 - 0.5) * 0.4 - (1.0 - lobes) * lobeK * ya;
  float breathe = 0.72 + 0.28 * vnoise(vec2(t * 0.9, seed * 31.0));
  // 板の縁（左右・下・上）では必ず消す（四角い縁を出さない）
  float border = (1.0 - smoothstep(0.8, 1.0, abs(x))) * smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.9, 1.0, y));
  // r04-fx2（引き継ぎ）：窓の下半分は部屋の奥の火（外壁のシェーダーの窓の光）に任せ、板の炎は窓の中ほどから立ち上がる
  // （板は壁から離してあるので、窓の下端から描くと、斜めに見たとき窓の外に炎の四角い底が浮いた）
  float lowFade = smoothstep(0.2, 0.85, y / max(yw, 1e-3) + (n1 - 0.5) * 0.3);
  float flame = smoothstep(0.02, 0.26, shape) * I * breathe * border * lowFade;
  // 煙：炎の中ほどから上へ、外壁を這い上がりながら広がって薄れる（くすぶりの窓ほど濃い）
  float n3 = fbm2(vec2(x * 0.8 + seed * 5.0, yy * 0.42 - t * 0.55), 3);
  float plume = 0.62 - abs(x) * (0.95 - 0.35 * ys) + (n3 - 0.5) * 1.15;
  float smoke = smoothstep(0.05, 0.35, plume) * smoothstep(0.25, 0.55, ya) * (1.0 - smoothstep(0.7, 1.0, ys));
  smoke *= I * smokeK * border;
  if (flame + smoke < 0.004) discard;
  // 温度：根元（窓の中）が熱く、上ほど冷えて赤から煤へ。くすぶりの窓は冷たい。
  // r03-fx（見直し）：根元 0.98 では窓ごとに白い蝋燭の炎が並んで見えたので、根元を胴の橙と芯の黄の間に下げた
  float T = (0.8 - 0.62 * ya) * (0.66 + 0.4 * smoothstep(0.0, 0.8, flame)) + (n2 - 0.5) * 0.22;
  T *= heatK * mix(0.8, 1.0, I);
  float fireA = min(1.0, flame * uFireAlpha * 2.2) * flameFire(T);
  float sootA = min(1.0, (flame * (1.0 - flameFire(T)) + smoke) * uSootAlpha);
  vec3 soot = uFlameSoot * vAmbient * 2.0;
  // 炎を煙の上に重ねる（前掛けの合成）
  vec3 col = flameColor(T) * fireA + soot * sootA * (1.0 - fireA);
  float a = fireA + sootA * (1.0 - fireA);
  // 濃い所（0.3 以上）は1回目で深さを書き、煙との前後を深さで決める。薄い縁と壁の近くは2回目で、深さを書かずに描く
  ${pass === 1 ? 'if (a < 0.3) discard;' : 'if (wallK >= 0.995 && a >= 0.3) discard;\n  if (a < 0.004) discard;'}
  a *= wallK;
  col *= wallK;
  gl_FragColor = vec4(col * vFogT + vInscatter * a, a);
}
`;
}

/** 窓の炎の一覧をまとめて描く（インスタンス1回 × 2 通り）。毎コマ、燃えている建物から書き直す。 */
export class WindowFire {
  /** 1回目（濃い所・深さを書く）と2回目（壁の近くの透かす所・深さを書かない）。形は共有 */
  readonly group = new Group();
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly meshNearWall: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly pos: InstancedBufferAttribute;
  private readonly dir: InstancedBufferAttribute;
  private readonly shape: InstancedBufferAttribute;
  private readonly more: InstancedBufferAttribute;
  private readonly uniforms: Record<string, { value: unknown }>;
  private count = 0;

  constructor(
    private readonly capacity: number,
    atmosphere: Atmosphere,
  ) {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const make = (n: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.pos = make(3);
    this.dir = make(4);
    this.shape = make(4);
    this.more = make(2);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iDir', this.dir);
    g.setAttribute('iShape', this.shape);
    g.setAttribute('iMore', this.more);
    g.instanceCount = 0;
    const W = FX.windowFire;
    this.uniforms = {
      ...atmosphere.uniforms,
      ...flameUniforms(),
      uTime: { value: 0 },
      uWind: { value: new Vector3(WIND.x, 0, WIND.z) },
      uFireAlpha: { value: FLAME.fireAlpha },
      uSootAlpha: { value: FLAME.sootAlpha },
      uWallOffset: { value: W.wallOffset },
      uWallFade: { value: W.wallFade },
      uFadeDist: { value: new Vector2(W.fadeNear, W.fadeFar) },
      ...SOFT_UNIFORMS,
    };
    const material = (pass: 1 | 2): ShaderMaterial =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: fragment(pass),
        uniforms: this.uniforms,
        transparent: true,
        // r03-fx：炎は煙より先に描き、濃い所だけ深さを書く。手前の煙は炎を隠し、奥の煙は炎の所で隠れる（遠くの炎が手前の煙の上に浮かない）。
        // r04-fx2：壁の近くの透かす所（2回目）は深さを書かない（薄い所が奥の物を切り抜かないように）
        depthWrite: pass === 1,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
      });
    const m1 = material(1);
    m1.name = 'WindowFire';
    const m2 = material(2);
    m2.name = 'WindowFireNearWall';
    this.mesh = new Mesh(g, m1);
    this.meshNearWall = new Mesh(g, m2);
    for (const [mesh, order, name] of [
      [this.mesh, 9.5, 'window-fire'],
      [this.meshNearWall, 9.6, 'window-fire-near-wall'],
    ] as const) {
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      mesh.name = name;
      // r04-fx2（引き継ぎ）：粒子と同じく、不透明な物の後の別のパス（FxPass）で描く
      mesh.layers.set(FX_LAYER);
      this.group.add(mesh);
    }
  }

  get instances(): number {
    return this.count;
  }

  begin(time: number): void {
    this.count = 0;
    this.uniforms.uTime.value = time;
  }

  /**
   * 1棟分：燃えている範囲 [lo, hi]（m）の窓のうち、順番の小さいものから、燃えの強さ burn で決まる割合・上限 cap 個まで炎を出す。
   * 炎の高さは窓ごとに階の 0.7〜2.4 倍（形の種類で変える）、燃え広がりの上端に近い窓ほど小さい（燃え始め）。
   */
  addBuilding(
    slots: readonly WindowSlot[],
    lo: number,
    hi: number,
    burn: number,
    cap: number,
    move: ((s: WindowSlot, out: WallPoint) => WallPoint) | null,
    tmp: WallPoint,
  ): number {
    const W = FX.windowFire;
    const density = W.density * (0.45 + 0.55 * burn);
    let added = 0;
    for (const s of slots) {
      if (s.rank > density || added >= cap || this.count >= this.capacity) break;
      if (s.y < lo - 0.5 || s.y > hi + 0.5) continue;
      // 燃え広がりの縁（上端・下端）に近いほど小さく弱い
      const edge = Math.min(1, Math.max(0, Math.min(s.y - (lo - 0.5), hi + 0.5 - s.y) / Math.max(1, s.floorH * 1.5)));
      const grow = 0.35 + 0.65 * edge;
      const k = s.seed;
      // r04-fx2：形の種類（0〜3）。燃え始め（縁）と弱い火ほど、くすぶり（3）が多い
      const kindU = (k * 17.3) % 1;
      const kind = grow < 0.6 && ((k * 29.1) % 1) < 0.55 ? 3 : Math.floor(kindU * 3);
      const big = k > 0.82 ? 1.45 : 1;
      const flameH =
        s.floorH * (W.heightFloors[0] + (W.heightFloors[1] - W.heightFloors[0]) * ((k * 5.13) % 1)) * grow * big * (0.6 + 0.4 * burn) * W.kinds.height[kind];
      const width = s.w * (W.widthScale[0] + (W.widthScale[1] - W.widthScale[0]) * ((k * 11.7) % 1)) * (big > 1 ? 1.3 : 1) * W.kinds.width[kind];
      const i = this.count++;
      const p = this.pos.array as Float32Array;
      const d = this.dir.array as Float32Array;
      const sh = this.shape.array as Float32Array;
      const mo = this.more.array as Float32Array;
      // 傾いた建物では、窓の位置を外壁と同じ式で動かす
      const at = move ? move(s, tmp) : s;
      p[i * 3] = at.x;
      p[i * 3 + 1] = at.y;
      p[i * 3 + 2] = at.z;
      d[i * 4] = s.nx;
      d[i * 4 + 1] = s.nz;
      d[i * 4 + 2] = width;
      d[i * 4 + 3] = s.h;
      sh[i * 4] = flameH;
      sh[i * 4 + 1] = k;
      sh[i * 4 + 2] = Math.min(1, (0.55 + 0.45 * burn) * grow);
      // 種類は 0〜1 の小数に入れる（シェーダーで floor(x × 4)）
      sh[i * 4 + 3] = (kind + 0.5) / 4;
      mo[i * 2] = Math.min(1, s.w / width);
      mo[i * 2 + 1] = 0;
      added++;
    }
    return added;
  }

  end(): void {
    for (const a of [this.pos, this.dir, this.shape, this.more]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, this.count) * a.itemSize);
      a.needsUpdate = true;
    }
    this.mesh.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    this.meshNearWall.visible = this.count > 0;
  }

  clear(): void {
    this.count = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
    this.meshNearWall.visible = false;
  }

  /** シェーダーを先に作らせるため、1個だけ見える状態にする。 */
  prime(on: boolean): void {
    this.mesh.visible = on || this.count > 0;
    this.meshNearWall.visible = this.mesh.visible;
    this.mesh.geometry.instanceCount = on ? Math.max(1, this.count) : this.count;
  }
}
