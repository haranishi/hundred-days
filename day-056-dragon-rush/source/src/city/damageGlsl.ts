// OWNER: city
// 壊れ方の見た目（GLSL）。外壁の材質（buildingMaterial.ts）と影の材質に差し込む。表の中身は damageTexture.ts。
// 頂点：傾き（根元の辺を支点に回す）と崩落（沈みながら押しつぶれる）。形は動かすが、窓や汚れの模様は元の位置に貼り付けたまま。
// 画素：ひびの線・外壁の剥がれ（中の躯体と窓の穴）・割れた窓・焦げ（すすの筋）・燃えている階の窓の火。
// ひびの線と窓ごとの割れは、画素より細かくなるほど平均へ寄せ、遠くでちらつかせない。
import { CAMERA_OCCLUSION } from '../config/camera';
import { COLLAPSE, FX } from '../config/fx';
import { PIECE } from './buildingGeometry';
import { DAMAGE_TEXELS_PER_BUILDING } from './damageTexture';

/** r06-camera2：網点の透かし方の定数（config/camera.ts の CAMERA_OCCLUSION。GLSL へは小数で埋め込む） */
const SIL_MAX_SEGS = CAMERA_OCCLUSION.silhouetteMax.segs;
const SIL_MAX_TRIS = CAMERA_OCCLUSION.silhouetteMax.tris;
const SPREAD_SOFT = CAMERA_OCCLUSION.spreadSoft.toFixed(4);
const SPREAD_FLOOR = CAMERA_OCCLUSION.spreadFloor.toFixed(4);
/** outline：形の縁をなだらかにする幅と、輪郭として全部抜く帯の幅（画面の高さの半分を 1 とする単位。0.008 は 900 画素の画面で約3.6画素） */
const OUTLINE_SOFT = (CAMERA_OCCLUSION.soft * 0.4).toFixed(4);
const OUTLINE_BAND = (0.008).toFixed(4);
/**
 * 形の外接矩形からこれより遠い画素では、線と三角形の距離を計算しない（形の中の網点と輪郭の帯はどちらもこの幅の内側でしか効かない）。
 * r06-camera2 の重さの確かめ（tools の r06camera2_cost.mjs）：すぐ前の壁を面全体へ透かす場面で、壁の全画素が線と三角形の距離を計算し、
 * 窓だけの透かし方より 1コマ約3ms 重かった
 */
const OUTLINE_FAR = (Math.max(CAMERA_OCCLUSION.soft * 0.4, 0.008 * 1.6) + 0.01).toFixed(4);
/** 形の外接矩形を書いた4つ組の位置（camera/occlusionRegion.ts の SIL_BOX_TEXEL と同じ並び） */
const SIL_BOX = 1 + SIL_MAX_SEGS * 2 + SIL_MAX_TRIS * 2;

/** 燃えている窓の明るさ（炎の胴の色の倍率、r03-fx）。7.5 では窓が白く飛んだ */
const DMG_WINDOW_GLOW = FX.windowGlow;
/**
 * r04-fx2：遠くで窓の炎の板をやめた分、窓の奥の火を明るくする倍率（FX.windowGlowFar）と、その距離（m。板が薄れ始めて消えるまで、
 * FX.windowFire.fadeNear〜fadeFar。fx/windowFire.ts の板の消え方と同じ範囲）
 */
const DMG_GLOW_FAR = FX.windowGlowFar;
const DMG_FADE = [FX.windowFire.fadeNear, FX.windowFire.fadeFar] as const;
/** r04-fx2：燃えた窓の上の煤の筋を、焦げが溜まる前から燃えの強さで描く割合（FX.sootFromBurn） */
const DMG_SOOT_FROM_BURN = FX.sootFromBurn;
/** r04-fx2：上の塊の板の数値（collapsePose.ts と同じ config） */
const SLAB = COLLAPSE.slabs;
const PIECE_UPPER = PIECE.upper.toFixed(4);
const PIECE_STEP = PIECE.slabStep.toFixed(4);

export const DAMAGE_VERTEX_PARS = /* glsl */ `
uniform highp sampler2D uDmgTex;
uniform float uDmgTexWidth;
// r05-camera：遊ぶカメラの投影×視点（網点の範囲を、どの描画でも遊ぶカメラの画面の上で決める）
uniform mat4 uOccViewProj;
attribute float aBid;
vec4 dmgTexel(float bid, int k) {
  int w = int(uDmgTexWidth);
  // r04-fx2（引き継ぎ）：建物番号は切り捨てで取る。四捨五入では、小数部が 0.5 以上の板（上の塊の3枚目から上）が
  // 隣の番号の建物の表を読み、崩れの間ずっと元の位置に浮いていた
  int idx = int(floor(bid + 1e-3)) * ${DAMAGE_TEXELS_PER_BUILDING} + k;
  return texelFetch(uDmgTex, ivec2(idx - (idx / w) * w, idx / w), 0);
}
vec3 dmgRotate(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}
// 回転の軸 = 上 × 倒れる向き。正の角度で上端が倒れる向きへ動く
vec3 dmgAxis(vec4 t2) { return normalize(vec3(t2.w, 0.0, -t2.z) + vec3(1e-6, 0.0, 0.0)); }
// r03-fx：部品の印（aBid の小数部）。0 = まとめたメッシュ、1 = 割れ目より下（詳しい形）、2 以上 = 割れ目より上。
// r04-fx2：上の塊は階ごとの板に分けた。2 + j が板 j（小数部 ${PIECE_UPPER} + j × ${PIECE_STEP}）
float dmgPiece(float bid) {
  float f = fract(bid + 1e-4);
  return f < 0.1 ? 0.0 : f < 0.31 ? 1.0 : 2.0 + floor((f - ${PIECE_UPPER}) / ${PIECE_STEP} + 0.5);
}
// r04-fx2：上の塊の板（collapsePose.ts の slabCrush・slabBottom と同じ式）。n = 板の数、F = 上の塊の階数、fh = 階高
float dmgSlabQ(float j, float n, float c) {
  float span = max(0.0, ${SLAB.to.toFixed(4)} - ${SLAB.from.toFixed(4)} - ${SLAB.each.toFixed(4)});
  float start = ${SLAB.from.toFixed(4)} + (n > 1.5 ? span * j / (n - 1.0) : span * 0.5);
  float t = clamp((c - start) / ${SLAB.each.toFixed(4)}, 0.0, 1.0);
  return t * t;
}
float dmgSlabBottom(float j, float n, float F, float fh, float split, float top) {
  if (j < 0.5) return split;
  if (j > n - 0.5) return top;
  return min(top, split + floor(j * F / n + 0.5) * fh);
}
// 板 j の傾き：上の塊の傾き＋潰れるときの揺らぎ（種は建物番号から、collapsePose.ts の seed と同じ式）
float dmgSlabTheta(float j, float q, float angle, float bid) {
  float seed = fract(floor(bid + 1e-3) * 0.618034);
  return angle + ${(SLAB.jitterDeg * Math.PI / 180).toFixed(5)} * sin(j * 2.39 + seed * 6.283) * q;
}
// 割れて崩れる形（collapsePose.ts の movePiece と同じ式）。c = 崩落の進み、t3.x = 屋上の高さ、t4.z = 上の塊の階高、
// t5 = (軸 x, 軸 z, 割れる高さ, 板の数 + 8 × 上の塊の階数)、t6 = (上の塊の傾き, 潰れの先端, 潰れた階の上端, 沈み)
vec3 dmgMovePiece(vec3 p, float piece, float c, float bid, vec4 t2, vec4 t3, vec4 t4, vec4 t5, vec4 t6) {
  if (piece < 1.5) {
    if (p.y > t6.y) p.y = t6.y + (p.y - t6.y) * ${COLLAPSE.squash.toFixed(4)};
    p.y -= t6.w;
    return p;
  }
  float j = piece - 2.0;
  float n = mod(t5.w, 8.0);
  float F = floor(t5.w / 8.0 + 1e-3);
  float along = 0.0;
  for (int i = 0; i < ${SLAB.max}; i++) {
    float fi = float(i);
    if (fi > j - 0.5) break;
    float h = dmgSlabBottom(fi + 1.0, n, F, t4.z, t5.z, t3.x) - dmgSlabBottom(fi, n, F, t4.z, t5.z, t3.x);
    along += h * (1.0 - ${(1 - SLAB.squash).toFixed(4)} * dmgSlabQ(fi, n, c));
  }
  float q = dmgSlabQ(j, n, c);
  float eta = (p.y - dmgSlabBottom(j, n, F, t4.z, t5.z, t3.x)) * (1.0 - ${(1 - SLAB.squash).toFixed(4)} * q);
  float theta = dmgSlabTheta(j, q, t6.x, bid);
  float seed = fract(floor(bid + 1e-3) * 0.618034);
  vec2 dir = t2.zw;
  vec2 r = p.xz - t5.xy;
  // d：倒れる向きの距離（潰れた板は少しずれる）、w：横（軸に沿った）距離
  float d = dot(r, dir) + ${SLAB.slide.toFixed(4)} * sin(j * 1.73 + seed * 4.1) * q;
  float w = -r.x * dir.y + r.y * dir.x;
  float ca = cos(t6.x);
  float sa = sin(t6.x);
  float ct = cos(theta);
  float st = sin(theta);
  float dd = along * sa + d * ct + eta * st;
  float yy = along * ca - d * st + eta * ct;
  return vec3(t5.x + dd * dir.x - w * dir.y, t6.z + yy - t6.w, t5.y + dd * dir.y + w * dir.x);
}
vec3 dmgMove(vec3 p, float piece, vec4 t1, vec4 t2, vec4 t3, vec4 t4, vec4 t5, vec4 t6) {
  // 詳しい形で描いている建物は、まとめたメッシュの側を1点に畳んで消す（地面のずっと下）
  if (piece < 0.5 && t4.w > 0.5) return vec3(t2.x, t3.y - 2000.0, t2.y);
  if (piece > 0.5) return dmgMovePiece(p, piece, t1.z, aBid, t2, t3, t4, t5, t6);
  if (t1.y > 0.0) {
    vec3 pivot = vec3(t2.x, t3.y, t2.y);
    p = pivot + dmgRotate(p - pivot, dmgAxis(t2), t1.y);
    // 支点の反対側の根元が浮かないよう、傾いた分だけ沈める（倒れる側の根元は地面にめり込む）
    p.y -= t4.y * sin(t1.y);
  }
  float c = t1.z;
  if (c > 0.0) {
    // 下の階からつぶれながら、落ちる速さで地面の下へ沈む（地面より下は見えない）
    float h = max(p.y - t3.y, 0.0);
    p.y = t3.y + h * (1.0 - 0.3 * c) - c * c * (t3.x + 8.0);
  }
  return p;
}
`;

/** 外壁の材質の頂点：法線を傾け、画素へ壊れ方を渡す（beginnormal_vertex の後に置く）。 */
export const DAMAGE_VERTEX_NORMAL = /* glsl */ `
vec4 dmgT1 = vec4(0.0);
vec4 dmgT2 = vec4(0.0);
vec4 dmgT3 = vec4(0.0);
vec4 dmgT4 = vec4(0.0);
vec4 dmgT5 = vec4(0.0);
vec4 dmgT6 = vec4(0.0);
float dmgPc = 0.0;
vDmg0 = vec4(0.0);
vDmg1 = vec4(0.0);
vDmg2 = vec4(0.0);
vDmgOccV = vec4(0.0);
if (aBid >= 0.0) {
  dmgPc = dmgPiece(aBid);
  vDmg0 = dmgTexel(aBid, 0);
  dmgT4 = dmgTexel(aBid, 4);
  vDmgOccV.w = dmgT4.x;
  dmgT1 = dmgTexel(aBid, 1);
  dmgT2 = dmgTexel(aBid, 2);
  dmgT3 = dmgTexel(aBid, 3);
  // 割れて崩れる形の値は詳しい形の頂点だけが使う（まとめたメッシュの頂点では引かない）
  if (dmgPc > 0.5) {
    dmgT5 = dmgTexel(aBid, 5);
    dmgT6 = dmgTexel(aBid, 6);
  }
  // 法線：まとめたメッシュは建物ごと傾け、詳しい形では上の塊の板だけ回す（下の階は潰れるだけで向きは変わらない）。
  // r04-fx2：板は板ごとの傾き（上の塊の傾き＋潰れるときの揺らぎ）で回す
  if (dmgPc > 1.5) {
    float dmgJ = dmgPc - 2.0;
    objectNormal = dmgRotate(objectNormal, dmgAxis(dmgT2), dmgSlabTheta(dmgJ, dmgSlabQ(dmgJ, mod(dmgT5.w, 8.0), dmgT1.z), dmgT6.x, aBid));
  } else if (dmgPc < 0.5 && dmgT1.y > 0.0) objectNormal = dmgRotate(objectNormal, dmgAxis(dmgT2), dmgT1.y);
  vDmg1 = dmgT1;
  vDmg2 = vec4(dmgT3.z, dmgT3.w, dmgT3.y, dmgT3.x);
}
`;

export const DAMAGE_VARYINGS = /* glsl */ `
varying vec4 vDmg0;
varying vec4 vDmg1;
varying vec4 vDmg2;
// r05-camera：xyz = 遊ぶカメラの画面の座標（クリップの x, y, w）、w = 透かす度合い（T4.x）
varying vec4 vDmgOccV;
`;

/** 外壁の材質の頂点：位置を動かす（模様の座標を計算した後に置く）。 */
export const DAMAGE_VERTEX_POSITION = /* glsl */ `
if (aBid >= 0.0) transformed = dmgMove(transformed, dmgPc, dmgT1, dmgT2, dmgT3, dmgT4, dmgT5, dmgT6);
if (vDmgOccV.w > 0.0) {
  vec4 dmgOccClip = uOccViewProj * (modelMatrix * vec4(transformed, 1.0));
  vDmgOccV.xyz = vec3(dmgOccClip.xy, dmgOccClip.w);
}
`;

/** 影の材質の頂点：位置だけ動かす（begin_vertex の後に置く）。 */
export const DAMAGE_VERTEX_DEPTH = /* glsl */ `
if (aBid >= 0.0) {
  float dmgPcD = dmgPiece(aBid);
  vec4 dmgT5D = dmgPcD > 0.5 ? dmgTexel(aBid, 5) : vec4(0.0);
  vec4 dmgT6D = dmgPcD > 0.5 ? dmgTexel(aBid, 6) : vec4(0.0);
  transformed = dmgMove(transformed, dmgPcD, dmgTexel(aBid, 1), dmgTexel(aBid, 2), dmgTexel(aBid, 3), dmgTexel(aBid, 4), dmgT5D, dmgT6D);
}
`;

/**
 * r05-camera：網点（カメラと竜の間の物を間引いて透かす）の範囲と間引き。外壁（下の dmgOccluderDiscard）と瓦礫の山（fx/rubble.ts）が使う。
 * v = (遊ぶカメラのクリップの x, y, w, 透かす度合い)。範囲は遊ぶカメラの画面の上で、体の外接矩形（uOccBox）と照準の円の中は 1、
 * 外へ縁の幅で 0 へ薄める。距離は画面の高さの半分を 1 とする単位（横は縦横比を掛ける）。範囲を使わないとき（uOccAim.w = 0）は 1
 * （r04 までと同じく物ごと透かす）。camera/occlusionRegion.ts の occlusionMask が同じ式（テスト用）
 */
export const OCCLUSION_GLSL = /* glsl */ `
uniform vec4 uOccBox;
uniform vec4 uOccAim;
// r06-camera2：画素の側でも壊れ方の表を読む（怪獣の形は最後の行）。頂点の側の宣言とは別の段なので、ここでも宣言する
uniform highp sampler2D uDmgTex;
// r06-camera2：透かし方は uOccAim.w で切り替える（瓦礫の山の材質 fx/rubble.ts にも同じ uniform だけで届くように、新しい uniform を足さない）。
// 0＝範囲を使わない（建物ごと）、1〜2＝四角い窓（window）と、窓を壁全体へ広げる度合い（spread、w − 1）、3〜4＝怪獣の形（outline）と、
// 形のまわりから面全体へ広げる度合い（outlineSpread、w − 3）。
// 怪獣の形は壊れ方の表の最後の行（camera/occlusionRegion.ts が作り、city/damageTexture.ts が書く）：見出し (線の数, 三角形の数)、
// 線は2つ組 (ax, ay, bx, by)(太さ a, 太さ b)、三角形は2つ組 (ax, ay, bx, by)(cx, cy)、最後に形の外接矩形 (x0, y0, x1, y1)。
// 座標は (NDC の x × 縦横比, NDC の y)
float occSegD(vec2 p, vec2 a, vec2 b) {
  vec2 e = b - a;
  float t = clamp(dot(p - a, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
  return length(p - a - e * t);
}
float occSilhouette(vec2 q) {
  int row = textureSize(uDmgTex, 0).y - 1;
  vec4 head = texelFetch(uDmgTex, ivec2(0, row), 0);
  int ns = int(head.x + 0.5);
  int nt = int(head.y + 0.5);
  float d = 1e3;
  for (int i = 0; i < ${SIL_MAX_SEGS}; i++) {
    if (i >= ns) break;
    vec4 s0 = texelFetch(uDmgTex, ivec2(1 + i * 2, row), 0);
    vec4 s1 = texelFetch(uDmgTex, ivec2(2 + i * 2, row), 0);
    vec2 e = s0.zw - s0.xy;
    float t = clamp(dot(q - s0.xy, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
    d = min(d, length(q - s0.xy - e * t) - mix(s1.x, s1.y, t));
  }
  for (int i = 0; i < ${SIL_MAX_TRIS}; i++) {
    if (i >= nt) break;
    vec4 t0 = texelFetch(uDmgTex, ivec2(${1 + SIL_MAX_SEGS * 2} + i * 2, row), 0);
    vec4 t1 = texelFetch(uDmgTex, ivec2(${2 + SIL_MAX_SEGS * 2} + i * 2, row), 0);
    vec2 a = t0.xy;
    vec2 b = t0.zw;
    vec2 c = t1.xy;
    float e = min(min(occSegD(q, a, b), occSegD(q, b, c)), occSegD(q, c, a));
    float c0 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
    float c1 = (c.x - b.x) * (q.y - b.y) - (c.y - b.y) * (q.x - b.x);
    float c2 = (a.x - c.x) * (q.y - c.y) - (a.y - c.y) * (q.x - c.x);
    bool inside = (c0 >= 0.0 && c1 >= 0.0 && c2 >= 0.0) || (c0 <= 0.0 && c1 <= 0.0 && c2 <= 0.0);
    d = min(d, inside ? -e : e);
  }
  return d;
}
float occMask(vec4 v) {
  float mode = uOccAim.w;
  if (mode < 0.5) return 1.0;
  if (v.z <= 1e-3) return 0.0;
  vec2 p = v.xy / v.z;
  float dAim = length(vec2(p.x * uOccAim.x, p.y)) - uOccAim.y;
  if (mode > 2.5) {
    // 怪獣の形の中は網点で透かし、形の縁の細い帯は全部抜いて輪郭にする（壁のほかの所はそのまま）。
    // w − 3（0〜1）は、すぐ前の大きな面で網点を形のまわりから面全体へなだらかに広げる度合い
    // 形の外接矩形からの距離 dBB（形までの距離より短いか同じ）。遠い画素は線の距離を計算せず dBB で代える（中の網点と輪郭の帯は 0 のまま）。
    // 面全体へ広げる度合いは dBB で決める（形の距離と矩形の距離を切り替える境で網点の濃さが跳ねないように）
    vec2 qs = vec2(p.x * uOccAim.x, p.y);
    vec4 bb = texelFetch(uDmgTex, ivec2(${SIL_BOX}, textureSize(uDmgTex, 0).y - 1), 0);
    float dBB = length(max(max(bb.xy - qs, qs - bb.zw), 0.0));
    float dSil = dBB;
    if (dBB <= ${OUTLINE_FAR}) dSil = occSilhouette(qs);
    float inner = 1.0 - smoothstep(0.0, ${OUTLINE_SOFT}, min(dSil, dAim));
    float rim = 1.0 - smoothstep(${OUTLINE_BAND}, ${OUTLINE_BAND} * 1.6, abs(dSil));
    float m3 = max(inner, rim * 1.3);
    float spread3 = clamp(mode - 3.0, 0.0, 1.0);
    if (spread3 > 0.0) m3 = max(m3, spread3 * mix(${SPREAD_FLOOR}, 1.0, 1.0 - smoothstep(0.0, ${SPREAD_SOFT}, dBB)));
    return m3;
  }
  vec2 q = vec2((abs(p.x - uOccBox.x) - uOccBox.z) * uOccAim.x, abs(p.y - uOccBox.y) - uOccBox.w);
  float dBox = length(max(q, 0.0));
  float m = 1.0 - smoothstep(0.0, uOccAim.z, min(dBox, dAim));
  float spread = clamp(mode - 1.0, 0.0, 1.0);
  if (spread > 0.0) m = max(m, spread * mix(${SPREAD_FLOOR}, 1.0, 1.0 - smoothstep(0.0, ${SPREAD_SOFT}, dBox)));
  return m;
}
void occDiscard(vec4 v) {
  float occ = v.w;
  if (occ < 0.01) return;
  float m = occMask(v);
  if (m <= 0.0) return;
  const float bayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  ivec2 q = ivec2(mod(floor(gl_FragCoord.xy), 4.0));
  float th = (bayer[q.x + q.y * 4] + 0.5) / 16.0;
  if (th < occ * 0.82 * m) discard;
}
`;

/**
 * 画素：外壁の模様を描いた後に dmgApplySurface で壊れ方を重ねる。
 * gDmg* は外壁の部分（buildingSurfaceBase）が書く：窓の割合・窓の区画・模様の座標（m）・細かさ。
 * 前提：vFacPos（元の位置のワールド座標）・hash12・vnoise・fbm2・fpulse が先に定義されていること。
 */
export const DAMAGE_FRAGMENT_PARS = /* glsl */ `
uniform float uDmgTime;
${DAMAGE_VARYINGS}
${OCCLUSION_GLSL}

// カメラと竜の間にある建物は、網点状に間引いて透かす（影は残る）。
// r00b：竜より手前の画素だけを間引くと、同じ建物の奥の縁だけが宙に浮いて見えたので、奥行きでは切らない。
// r05-camera：建物ごと同じ割合で間引くのをやめ、画面の上の範囲（体と照準のまわり）だけ間引く。範囲の外の部分は不透明に戻る
float dmgOccluderMask() {
  return occMask(vDmgOccV);
}
void dmgOccluderDiscard() {
  occDiscard(vDmgOccV);
}

float gDmgWall = 0.0;
float gDmgWin = 0.0;
vec2 gDmgCell = vec2(0.0);
vec2 gDmgUv = vec2(0.0);
vec2 gDmgFw = vec2(1.0);
float gDmgDetail = 0.0;
float gDmgSeed = 0.0;
// r01-city：窓が割れた・外壁が剥がれた・すすが付いた所では 0 に近づく（部屋の日だまりと開口の影を消すのに外壁の側が使う）
float gDmgKeep = 1.0;
// r03-fx：窓の形（幅・高さの割合、区画の中の窓の中心、1階の高さ m）と区画の大きさ（柱間・階高 m）。窓の無い面は x < 0
vec4 gDmgWinGeom = vec4(-1.0);
vec2 gDmgCellM = vec2(1.0);

// r03-fx：燃えた窓の上の外壁に残る煤の筋。指摘「燃えている棟の外壁に煤の筋が見当たらない」。
// 窓ごとに、燃えたか（焦げの量が多いほど多くの窓）・筋の高さ（1.1〜2.3階）・揺れを決め、窓の上端から上へ広がりながら薄れる。
// 下の3段の窓を見て、いちばん濃い筋を取る。遠く（窓が数画素）では平均の濃さに寄せる
float dmgSootPlumes(vec2 p, float y, float seed, float charA, float fireLow, float fireHigh) {
  if (gDmgWinGeom.x < 0.0) return 0.0;
  vec2 cm = gDmgCellM;
  float gh = gDmgWinGeom.w;
  float base = y - p.y;
  vec2 cell = vec2(p.x / cm.x, (p.y - gh) / cm.y);
  float col = floor(cell.x);
  float fx = (fract(cell.x) - 0.5) * cm.x;
  float best = 0.0;
  for (int k = 0; k <= 2; k++) {
    float row = floor(cell.y) - float(k);
    if (row < 0.0) break;
    vec2 wid = vec2(col, row);
    float cy = base + gh + (row + gDmgWinGeom.z) * cm.y;
    float inZone = step(fireLow - 1.0, cy) * step(cy, fireHigh + 1.0);
    float h1 = hash12(wid * 1.37 + seed * 7.1);
    float burnt = inZone * step(h1, 0.3 + 0.7 * charA);
    if (burnt < 0.5) continue;
    float topV = gh + (row + gDmgWinGeom.z + 0.5 * gDmgWinGeom.y) * cm.y;
    float dy = p.y - topV;
    if (dy < -0.12 * cm.y) continue;
    float h2 = hash12(wid * 2.11 + seed * 3.3);
    float H = cm.y * (1.1 + 1.2 * h2);
    float rise = clamp(dy / H, 0.0, 1.0);
    float hw = 0.5 * gDmgWinGeom.x * cm.x * (0.8 + 0.7 * rise);
    float sway = (vnoise(vec2(p.y * 0.55, col * 3.1 + seed * 5.0)) - 0.5) * 0.9 * rise * cm.x * 0.25;
    float edgeN = (vnoise(vec2(p.y * 1.7 + seed, col * 7.3)) - 0.5) * 0.35 * hw;
    float across = 1.0 - smoothstep(hw * 0.5, hw * 1.05, abs(fx - sway) + edgeN);
    float up = 1.0 - smoothstep(0.35, 1.0, rise);
    float tex = 0.62 + 0.38 * vnoise(vec2(fx * 2.4 + col * 1.7, p.y * 0.32 + seed * 9.0));
    best = max(best, across * up * tex * (0.55 + 0.45 * h2) * clamp(charA * 2.2, 0.0, 1.0));
  }
  return mix(clamp(charA * 1.4, 0.0, 1.0) * 0.32, best, gDmgDetail);
}

// 外壁の点 p（m）でのひびの線（0〜1）。ボロノイの境目をゆがめて、枝分かれした割れ目にする
float dmgCrackLines(vec2 p, float seed, vec2 fw) {
  vec2 q = p / 4.2 + seed * 13.1;
  q += 0.45 * (vec2(vnoise(q * 1.9), vnoise(q * 1.9 + 7.3)) - 0.5);
  vec2 i = floor(q);
  vec2 f = fract(q);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash12(i + g), hash12(i + g + 17.3));
      float d = length(g + o - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float px = max(fw.x, fw.y) / 4.2;
  float line = 1.0 - smoothstep(0.012, 0.012 + px * 1.5, d2 - d1);
  // 境目をところどころで途切れさせ、網目ではなく枝分かれした割れ目に見せる
  line *= smoothstep(0.38, 0.62, vnoise(p * 0.3 + seed * 3.3));
  return mix(0.05, line, 1.0 - smoothstep(0.05, 0.25, px));
}

void dmgApplySurface(inout vec3 albedo, inout float rough, inout float metal, inout vec3 emissive) {
  float crack = vDmg0.x;
  float peel = vDmg0.y;
  float glassB = vDmg0.z;
  float charA = vDmg0.w;
  float burn = vDmg1.x;
  if (crack + peel + glassB + charA + burn < 1e-4) return;
  float y = vFacPos.y;
  float fireLow = vDmg2.x;
  float fireHigh = vDmg2.y;
  if (gDmgWall < 0.5) {
    // 屋根と屋上の設備：燃えが上まで届いたら煤ける
    float top = smoothstep(vDmg2.w - 25.0, vDmg2.w - 2.0, fireHigh);
    float soot = charA * top * (0.6 + 0.4 * fbm2(vFacPos.xz * 0.15, 2));
    albedo = mix(albedo, vec3(0.03, 0.028, 0.026), soot * 0.9);
    rough = mix(rough, 1.0, soot);
    metal *= 1.0 - soot;
    return;
  }
  vec2 p = gDmgUv;
  float seed = gDmgSeed;
  float near = exp(-abs(y - vDmg1.w) / 16.0);

  // 割れた窓：窓ごとに割れるかを決め、遠くでは割合で平均する
  float cellBroken = step(hash12(gDmgCell * 1.37 + seed * 41.0), glassB);
  float broken = mix(glassB, cellBroken, gDmgDetail) * gDmgWin;
  albedo = mix(albedo, vec3(0.014, 0.012, 0.011), broken);
  rough = mix(rough, 0.9, broken);
  metal = mix(metal, 0.0, broken);
  emissive *= 1.0 - broken;

  // 外壁の剥がれ：当たった高さのまわりからまだらに剥がれ、中の躯体と窓の穴が見える
  float pn = fbm2(p * vec2(0.085, 0.11) + seed * 23.0, 3);
  float peelAmt = peel * (0.45 + 0.55 * near);
  float th = 1.0 - 0.62 * peelAmt;
  float pw = max(fwidth(pn), 1e-3);
  float pmask = peel > 0.0 ? smoothstep(th, th + pw + 0.02, pn) : 0.0;
  float rim = peel > 0.0 ? smoothstep(th - 0.05, th, pn) * (1.0 - pmask) : 0.0;
  vec3 core = vec3(0.26, 0.25, 0.235) * (0.72 + 0.5 * vnoise(p * 1.3 + seed));
  core *= 1.0 - 0.4 * fpulse(p.y / 3.4, 0.14, gDmgFw.y / 3.4);
  core = mix(core, vec3(0.012), gDmgWin);
  albedo = mix(albedo, core, pmask);
  albedo *= 1.0 - 0.45 * rim;
  rough = mix(rough, 0.95, pmask);
  metal = mix(metal, 0.0, pmask);
  emissive *= 1.0 - pmask;

  // ひび：当たった高さのまわりから広がる割れ目
  float spread = crack * (0.15 + 0.85 * near);
  float cmask = smoothstep(0.35, 0.7, spread + (vnoise(p * 0.08 + seed * 5.0) - 0.5) * 0.8);
  albedo *= 1.0 - 0.6 * cmask * dmgCrackLines(p, seed, gDmgFw) * (1.0 - pmask);

  // 焦げ：燃えた窓の上へ窓ごとの煤の筋（r03-fx）。燃えた階の全体には薄いすすのむらだけを残す。
  // r04-fx2：指摘「燃えた窓の上に煤の筋が無い」。焦げ（char）は燃えてから溜まるので、燃えている間は燃えの強さからも筋を描く
  float zone = smoothstep(fireLow - 4.0, fireLow, y) * (1.0 - smoothstep(fireHigh + 4.0, fireHigh + 18.0, y));
  float streak = fbm2(vec2(p.x * 0.35, p.y * 0.05) + seed * 3.0, 3);
  float charS = max(charA, burn * ${DMG_SOOT_FROM_BURN.toFixed(3)});
  float plumes = charS > 0.02 ? dmgSootPlumes(p, y, seed, charS, fireLow, fireHigh) : 0.0;
  float haze = charA * zone * smoothstep(0.35, 0.8, streak + charA * 0.3) * 0.5;
  float soot = max(max(plumes, haze), charA * zone * gDmgWin * 0.85);
  albedo = mix(albedo, vec3(0.028, 0.026, 0.024), soot * 0.95);
  rough = mix(rough, 1.0, soot);
  metal *= 1.0 - soot;
  gDmgKeep = (1.0 - broken) * (1.0 - pmask) * (1.0 - soot);

  // 燃えている階：窓（と剥がれた穴）の奥で火がゆらめく。
  // r03-fx：強さ 7.5 の一色では窓が白く飛び、同じ明るさの格子に見えた。窓ごとに強さ（0.35〜1）・揺れの速さを変え、
  // 窓の上の方ほど明るく（炎がまぐさを舐める）、明るさは炎の胴の色（sRGB で 250 未満）までにした
  float inFire = smoothstep(fireLow - 1.0, fireLow + 1.5, y) * (1.0 - smoothstep(fireHigh - 1.5, fireHigh + 1.0, y));
  float hw1 = hash12(gDmgCell * 2.1 + seed * 5.0);
  float hw2 = hash12(gDmgCell * 3.7 + seed * 1.3);
  float flick = 0.55 + 0.45 * vnoise(vec2(uDmgTime * (1.8 + 1.6 * hw2) + gDmgCell.x * 3.1 + seed * 11.0, gDmgCell.y * 1.9 + uDmgTime * 0.7));
  float lit = mix(0.62, mix(0.35, 1.0, hw1) * step(0.18, hw1), gDmgDetail);
  float fyw = gDmgWinGeom.x > 0.0 ? clamp((fract((p.y - gDmgWinGeom.w) / gDmgCellM.y) - (gDmgWinGeom.z - 0.5 * gDmgWinGeom.y)) / max(gDmgWinGeom.y, 0.05), 0.0, 1.0) : 0.5;
  float grad = mix(1.0, mix(0.55, 1.12, fyw), gDmgDetail);
  float openings = max(gDmgWin, pmask * 0.6);
  vec3 fireC = mix(vec3(1.0, 0.24, 0.045), vec3(1.0, 0.36, 0.08), fyw);
  // r04-fx2：遠くでは窓の炎の板が消えるので、その分だけ窓の奥の火を明るくして、燃えている階を窓の赤い光で読ませる
  float farGlow = mix(1.0, ${DMG_GLOW_FAR.toFixed(3)}, smoothstep(${DMG_FADE[0].toFixed(1)}, ${DMG_FADE[1].toFixed(1)}, distance(vFacPos, cameraPosition)));
  emissive += fireC * ${DMG_WINDOW_GLOW.toFixed(3)} * farGlow * burn * inFire * openings * lit * grad * (0.45 + 0.55 * flick);
}
`;
