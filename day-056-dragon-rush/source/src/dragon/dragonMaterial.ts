// OWNER: dragon
// 竜の材質。下地の色は GLB の頂点の色、細かい鱗・腹の板・膜の透け・喉の光はここのシェーダーで足す。
// 鱗は「休みの姿勢の物体空間」の3次元ボロノイ（セルが1枚の鱗）で、高さの勾配を解析的に求めて法線を傾ける。
// 骨で曲がっても模様が皮膚に貼り付くよう、勾配は頂点で求めた「休みの姿勢 → 視点」の回転（皮膚の変形込み）で運ぶ。
// 画素より細かくなった鱗は、画素の幅に応じて平らにならす（遠くでちらつかせない）。
// r02-roster：ほかの怪獣（雷翼・焔角）も同じ作りを使う。色の数値（DragonLook）と発光（EmitLook：細い筋・溶岩）を外から渡す。
// 何も渡さなければ紅竜のまま（シェーダーの文字列も r00c と同じ）。
import { DoubleSide, FrontSide, MeshStandardMaterial, ShaderChunk } from 'three';
import type { DragonLook, DragonMaterialOptions, EmitLook } from '../config/creatures/types';
import { DRAGON_LOOK as L } from '../config/dragon';
import { AMBIENT, MONSTER_LIGHT as ML } from '../config/render';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import { FILTER_GLSL } from '../render/shaders/filterGlsl';
import { HASH_GLSL } from '../render/shaders/hashGlsl';

/** 部位の番号（tools/blender/dragonlib/paint.py の PART_* と同じ） */
export const PART = { skin: 0, membrane: 1, horn: 2, claw: 3, tooth: 4, eye: 5, mouth: 6 } as const;

export interface DragonUniforms {
  /** 喉の光（0〜1）：炎を溜めると光り、吐いている間は光ったまま */
  uThroat: { value: number };
  uEyeGlow: { value: number };
  /** 発光の脈（秒）と強さの倍率。発光を持つ怪獣だけが使う */
  uTime: { value: number };
  uEmitGain: { value: number };
}

// r03-roster：材質の数値の型（DragonLook・EmitLook・DragonMaterialOptions）は config/creatures/types.ts へ移した。
// 遊びの側（src/gameplay）が怪獣の設定を読むとき、three を読むこのファイルを経由しないため（npm run metrics が見張る）
export type { DragonLook, DragonMaterialOptions, EmitLook } from '../config/creatures/types';

const EMIT_VERTEX_PARS = /* glsl */ `
attribute float aEmit;
attribute float aLine;
varying float vEmit;
varying float vLine;
`;

const EMIT_VERTEX = /* glsl */ `
vEmit = aEmit;
vLine = aLine;
`;

const EMIT_FRAGMENT_PARS = /* glsl */ `
varying float vEmit;
varying float vLine;
uniform float uTime;
uniform float uEmitGain;
`;

const VERTEX_PARS = /* glsl */ `
attribute float aPart;
attribute float aBelly;
attribute float aMemb;
attribute float aGlow;
attribute float aAlong;
attribute float aScale;
varying float vPart;
varying float vBelly;
varying float vMemb;
varying float vGlow;
varying float vAlong;
varying float vScale;
varying vec3 vRestPos;
varying vec3 vSkinX;
varying vec3 vSkinY;
varying vec3 vSkinZ;
`;

const VERTEX_SKIN = /* glsl */ `
#ifdef USE_SKINNING
  mat3 dragonSkin3 = mat3( skinMatrix );
#else
  mat3 dragonSkin3 = mat3( 1.0 );
#endif
vSkinX = normalMatrix * ( dragonSkin3 * vec3( 1.0, 0.0, 0.0 ) );
vSkinY = normalMatrix * ( dragonSkin3 * vec3( 0.0, 1.0, 0.0 ) );
vSkinZ = normalMatrix * ( dragonSkin3 * vec3( 0.0, 0.0, 1.0 ) );
vPart = aPart;
vBelly = aBelly;
vMemb = aMemb;
vGlow = aGlow;
vAlong = aAlong;
vScale = aScale;
vRestPos = position;
`;

const FRAGMENT_PARS = /* glsl */ `
varying float vPart;
varying float vBelly;
varying float vMemb;
varying float vGlow;
varying float vAlong;
varying float vScale;
varying vec3 vRestPos;
varying vec3 vSkinX;
varying vec3 vSkinY;
varying vec3 vSkinZ;
uniform float uThroat;
uniform float uEyeGlow;
vec3 dragonTrans = vec3( 0.0 );
${FILTER_GLSL}
${HASH_GLSL}

vec3 dragonHash3( vec3 p ) {
  return vec3(drHashScalar(p, 0u), drHashScalar(p, 17u), drHashScalar(p, 101u));
}

// 3次元ボロノイ：いちばん近い点と2番目の点への距離（d1, d2）と、そこへの向き（r1, r2 = 点 - p）、いちばん近いセルの乱数
// 鱗の大きさ sc を部位で変えるとき、p = 位置 / sc と直接割ると、大きさの変わる所で模様が引き伸ばされて潰れる。
// そこで大きさは 0.05m×2^n の段に丸め、隣り合う2段で模様を作って、粗い段のセルごとにどちらを使うかを決める（dragonScales）
void dragonVoronoi( vec3 p, out float d1, out float d2, out vec3 r1, out vec3 r2, out float cellRnd ) {
  vec3 ip = floor( p );
  vec3 fp = fract( p );
  d1 = 8.0; d2 = 8.0; r1 = vec3( 0.0 ); r2 = vec3( 0.0 ); cellRnd = 0.0;
  for ( int k = -1; k <= 1; k++ ) {
    for ( int j = -1; j <= 1; j++ ) {
      for ( int i = -1; i <= 1; i++ ) {
        vec3 o = vec3( float( i ), float( j ), float( k ) );
        vec3 h = dragonHash3( ip + o );
        vec3 r = o + 0.12 + 0.76 * h - fp;
        float d = length( r );
        if ( d < d1 ) { d2 = d1; r2 = r1; d1 = d; r1 = r; cellRnd = h.z; }
        else if ( d < d2 ) { d2 = d; r2 = r; }
      }
    }
  }
}

// 鱗の1段を選ぶ：sc（m）を 0.05m×2^n の段に丸め、粗い段（細かい段の2倍）のセルの乱数が段の間の割合 fr より小さければ
// 粗い段のセル、そうでなければ細かい段のセルを使う。大きさの境では、大きな鱗の間に小さな鱗が混ざる（模様は歪まない）。
// 段が1つ上がる所（fr が 1 → 次の段の 0）で、どちらも同じ段の模様になるので継ぎ目は出ない
void dragonScales( vec3 pos, float sc, out float d1, out float d2, out vec3 r1, out vec3 r2, out float rnd, out float cellSc ) {
  float lg = log2( max( sc, 0.03 ) / 0.05 );
  float lv = floor( lg );
  float fr = lg - lv;
  cellSc = 0.05 * exp2( lv + 1.0 );
  dragonVoronoi( pos / cellSc + vec3( 17.3, 5.1, 11.7 ) * ( lv + 1.0 ), d1, d2, r1, r2, rnd );
  if ( fract( rnd * 13.71 ) >= fr ) {
    cellSc *= 0.5;
    dragonVoronoi( pos / cellSc + vec3( 17.3, 5.1, 11.7 ) * lv, d1, d2, r1, r2, rnd );
  }
}

// 画面の微分から法線を傾ける（UV の無い面の凹凸。Mikkelsen の式）
vec3 dragonPerturb( vec3 surfPos, vec3 n, vec2 dHdxy, float faceDir ) {
  vec3 sx = dFdx( surfPos );
  vec3 sy = dFdy( surfPos );
  vec3 r1 = cross( sy, n );
  vec3 r2 = cross( n, sx );
  float det = dot( sx, r1 ) * faceDir;
  vec3 grad = sign( det ) * ( dHdxy.x * r1 + dHdxy.y * r2 );
  return normalize( abs( det ) * n - grad );
}
`;

/** 鱗・腹の板・材質の種類ごとの粗さと色。normal（視点の空間）・diffuseColor・roughnessFactor を書き換える。 */
const surfaceGlsl = (L: DragonLook): string => /* glsl */ `
float dragonGroove = 1.0;
float dragonFade = 0.0;
{
  float part = floor( vPart + 0.5 );
  bool isSkin = part < 0.5;
  bool isMemb = abs( part - 1.0 ) < 0.5;
  float interior = smoothstep( 0.55, 0.9, vGlow );
  // 画面の微分は分岐の外で取る（部位の境の画素で、分岐の中の微分は値が定まらない）
  float fwRest = length( fwidth( vRestPos ) );
  float fwAlong = fwidth( vAlong );
  float plateU = vAlong / ${L.plateLength.toFixed(3)};
  float plateGroove = fpulse( plateU + 0.04, 0.08, fwAlong / ${L.plateLength.toFixed(3)} );
  vec2 plateSlope = vec2( dFdx( plateGroove ), dFdy( plateGroove ) );
  vec2 plateUSlope = vec2( dFdx( plateU ), dFdy( plateU ) );
  vec3 membQ = vRestPos * 0.32;
  float membN = dot( sin( membQ * vec3( 1.7, 2.3, 1.1 ) + sin( membQ.yzx * 2.9 ) ), vec3( 0.333 ) );
  float membFw = fwidth( membN );
  if ( isSkin ) {
    // r00c-竜：指摘「鱗の大きさが部位で変わらない」 位置 / 大きさ の1段 → 2段のモザイク（dragonScales）
    float d1, d2, rnd, sc;
    vec3 r1, r2;
    dragonScales( vRestPos, vScale, d1, d2, r1, r2, rnd, sc );
    float cellsPerPixel = fwRest / sc;
    dragonFade = ( 1.0 - smoothstep( 0.18, 0.5, cellsPerPixel ) ) * ( 1.0 - interior );
    // 1枚の鱗：縁の溝は低く、中ほどは少し盛り上がる。セルごとに高さと明るさを揺らす
    float e = d2 - d1;
    float w = 0.16;
    float g = smoothstep( 0.0, w, e );
    float x = clamp( e / w, 0.0, 1.0 );
    float gp = ( e > 0.0 && e < w ) ? 6.0 * x * ( 1.0 - x ) / w : 0.0;
    float dome = 1.0 - 0.55 * d1 * d1;
    float k = 0.8 + 0.4 * rnd;
    float base = 0.45 + 0.55 * dome;
    float dh1 = ( -gp * base + g * 0.55 * ( -1.1 * d1 ) ) * k;
    float dh2 = gp * base * k;
    vec3 gradP = dh1 * ( -r1 / max( d1, 1e-4 ) ) + dh2 * ( -r2 / max( d2, 1e-4 ) );
    vec3 gradRest = gradP / sc;
    vec3 G = vSkinX * gradRest.x + vSkinY * gradRest.y + vSkinZ * gradRest.z;
    float amp = ${L.scaleBump.toFixed(3)} * sc * dragonFade * ( 1.0 - vBelly );
    normal = normalize( normal - amp * ( G - dot( G, normal ) * normal ) );
    dragonGroove = mix( 1.0, g, dragonFade * ( 1.0 - vBelly ) );
    // 遠くで鱗が画素より細かくなっても、溝の暗さの平均（約0.84）は残す（遠いほど明るくのっぺりしないように）
    float scaleShade = mix( 0.84, ( 0.6 + 0.4 * g ) * ( 0.88 + 0.24 * rnd ), dragonFade );
    diffuseColor.rgb *= mix( 1.0, scaleShade, ( 1.0 - vBelly ) * ( 1.0 - interior ) );
    roughnessFactor = mix( roughnessFactor, mix( 0.82, 0.5 + 0.1 * rnd, g ), dragonFade * ( 1.0 - vBelly ) );
    // 大きなむら（数m〜十数m）：日焼け・汚れ・古傷の色の揺れ。遠景の一色を崩す
    vec3 mp = vRestPos * vec3( 0.21, 0.24, 0.21 );
    float macro = dot( sin( mp + sin( mp.zxy * 1.7 ) * 1.3 ), vec3( 0.333 ) ) * 0.5 + 0.5;
    float macro2 = dot( sin( vRestPos * 0.07 + 1.3 + sin( vRestPos.zxy * 0.11 ) ), vec3( 0.333 ) ) * 0.5 + 0.5;
    diffuseColor.rgb *= mix( 0.8, 1.14, macro ) * mix( 0.88, 1.08, macro2 );
    roughnessFactor = clamp( roughnessFactor + ( macro - 0.5 ) * 0.14, 0.3, 0.95 );
    // 腹の板：体の長さの向きに並ぶ横長の板と、その間の溝（溝の値と傾きは分岐の外で求めてある）。
    // r00c-竜：指摘「腹の板が一色の蛇腹のホースに見える」 板ごとに色と艶を揺らし、板の中ほどを丸く盛り上げる（前 0 → 高さ ${L.plateBulge.toFixed(2)}m）
    float plateX = clamp( ( fract( plateU + 0.04 ) - 0.08 ) / 0.92, 0.0, 1.0 );
    float plateRnd = dragonHash3( vec3( floor( plateU + 0.04 ), 7.13, 3.71 ) ).x;
    float bulgeSlope = ${L.plateBulge.toFixed(3)} * 4.0 * ( 1.0 - 2.0 * plateX ) / 0.92;
    vec2 dHdxy = ( -plateSlope * ${L.plateBump.toFixed(3)} + plateUSlope * bulgeSlope * ( 1.0 - plateGroove ) ) * vBelly * ( 1.0 - interior );
    normal = dragonPerturb( -vViewPosition, normal, dHdxy, faceDirection );
    diffuseColor.rgb *= ( 1.0 - 0.32 * plateGroove * vBelly ) * mix( 1.0, 0.88 + 0.2 * plateRnd, vBelly );
    roughnessFactor = mix( roughnessFactor, mix( 0.4 + 0.14 * plateRnd, 0.7, plateGroove ), vBelly * ( 1.0 - interior ) );
    dragonGroove = mix( dragonGroove, 1.0 - plateGroove, vBelly );
    // 口の中：鱗の無い、濡れた面
    roughnessFactor = mix( roughnessFactor, 0.26, interior );
  } else if ( isMemb ) {
    // 膜：指の骨から伸びる細い血管と、薄い皮のしわ
    float vein = 1.0 - smoothstep( 0.0, 0.06 + membFw * 1.5, abs( membN ) );
    diffuseColor.rgb *= 1.0 - 0.35 * vein;
    roughnessFactor = 0.62;
    dragonTrans = vec3( ${L.membraneTransmission.map((c) => c.toFixed(3)).join(', ')} ) * vMemb * ${L.membraneStrength.toFixed(3)} * ( 1.0 - 0.6 * vein );
  } else if ( abs( part - 2.0 ) < 0.5 ) {
    // 角・背のとげ：根元からの距離（vAlong、m）に沿った細い成長線と、艶のむら。画素より細かい線は平均の色へならす
    // r00c-竜：旧＝世界の位置の正弦（角の向きと関係ない縞）→ 角に沿った線
    float lines = fpulse( vAlong / ${L.hornLine.toFixed(3)}, 0.28, fwAlong / ${L.hornLine.toFixed(3)} );
    diffuseColor.rgb *= 1.0 - 0.12 * lines;
    roughnessFactor = mix( 0.5, 0.66, lines );
  } else if ( abs( part - 3.0 ) < 0.5 ) {
    roughnessFactor = 0.3;
  } else if ( abs( part - 4.0 ) < 0.5 ) {
    roughnessFactor = 0.24;
  } else if ( abs( part - 5.0 ) < 0.5 ) {
    roughnessFactor = 0.06;
  }
}
`;

const emissiveGlsl = (L: DragonLook): string => /* glsl */ `
{
  float part = floor( vPart + 0.5 );
  vec3 throatCol = vec3( ${L.throatColor.map((c) => c.toFixed(3)).join(', ')} ) * ${L.throatStrength.toFixed(2)};
  // 喉の光：首の腹側は鱗の溝から、口の中は面全体が光る（炎の直前に内側から）
  float seams = 0.25 + 0.75 * ( 1.0 - dragonGroove );
  float inner = smoothstep( 0.55, 0.95, vGlow );
  totalEmissiveRadiance += throatCol * uThroat * ( vGlow * ( 1.0 - inner ) * seams * 0.6 + inner * 1.6 );
  if ( abs( part - 5.0 ) < 0.5 ) totalEmissiveRadiance += vColor.rgb * uEyeGlow;
}
`;

const vec3Glsl = (c: [number, number, number]): string => `vec3( ${c.map((v) => v.toFixed(3)).join(', ')} )`;

/** 発光の筋・溶岩（EmitLook）。紅竜には付けない。 */
const emitGlsl = (E: EmitLook): string =>
  E.kind === 'stripes'
    ? /* glsl */ `
{
  // 細い筋：_LINE の 0 を中心に幅 ±width（m）。画素より細くなると、覆う割合の平均へ落ちる（fband）。にじみは筋の外へ指数で弱まる
  float fl = max( fwidth( vLine ), 1e-4 );
  float core = fband( vLine, -${E.width.toFixed(3)}, ${E.width.toFixed(3)}, fl );
  float halo = exp( -abs( vLine ) / ${(E.width * 3.0).toFixed(3)} ) * 0.22;
  // 体に沿って走る明るさの波と、小刻みなまたたき（雷）
  float crawl = 0.62 + 0.38 * sin( vAlong * ${E.flow.toFixed(3)} - uTime * ${(E.pulseHz * 2.0 * Math.PI).toFixed(3)} );
  float flicker = 0.85 + 0.15 * sin( uTime * 37.0 + vAlong * 1.7 ) * sin( uTime * 23.0 - vAlong * 0.9 );
  vec3 stripeCol = mix( ${vec3Glsl(E.colorB)}, ${vec3Glsl(E.colorA)}, core );
  totalEmissiveRadiance += stripeCol * ( core + halo ) * vEmit * crawl * flicker * uEmitGain * ${E.strength.toFixed(3)};
}
`
    : /* glsl */ `
{
  // 溶岩：鱗の溝（割れ目）ほど強く、面の上はほのかに。体に沿った波で、橙と赤の間を脈打つ
  float crack = 1.0 - dragonGroove;
  float beat = 0.5 + 0.5 * sin( uTime * ${(E.pulseHz * 2.0 * Math.PI).toFixed(3)} - vAlong * ${E.flow.toFixed(3)} );
  float heat = vEmit * ( 0.08 + 0.92 * crack * crack );
  vec3 lavaCol = mix( ${vec3Glsl(E.colorB)}, ${vec3Glsl(E.colorA)}, beat * ( 0.35 + 0.65 * crack ) );
  totalEmissiveRadiance += lavaCol * heat * ( 0.55 + 0.45 * beat ) * uEmitGain * ${E.strength.toFixed(3)};
}
`;

/**
 * r06-light：怪獣を浮かせる光（config/render.ts の MONSTER_LIGHT）。採点 r05 の3位「高層の谷間で、暗赤の紅竜と黒い焔角が陰の壁と同じ明るさに沈む」。
 * 光を1つ足すと全材質の組み直しになり（docs/PITFALLS.md）、街まで照らしてしまうので、怪獣の材質の中で足す。
 * ・正面の補助光：カメラの側（少し上）から。直射を受けていない面ほど強い＝影の中と逆光の明るさの下限。
 *   直射の割合は「影（csmSunIn が影の無い太陽より暗い分）」×「面が太陽を向く度合い（fillLitNdl 以上で日なた）」。影だけで決めた版では、
 *   逆光の谷間（紅竜 t090：カメラが太陽の方を向き、見える面は太陽と反対を向く）で補助光がほとんど入らなかった
 * ・縁の光：太陽の側を向いた輪郭に、太陽の色で。拡散（体の色）と、細い艶の両方に足す。日の当たる所では、順光ほど rimInSun の割合に
 *   弱め（逆光では残す）、カメラのすぐ近く（rimFadeM より近い寄りの画）では消す
 */
/**
 * 正面の補助光の強さ（影の無い太陽の照度に対する割合）。direct はその面が受ける直射の割合
 * （影の無い所＝1 × 面が太陽を向く度合い。影の中や太陽と反対を向く面は 0）。GLSL の mFill と同じ式。
 */
export function monsterFill(direct: number): number {
  return ML.fillBase + ML.fillShade * (1 - Math.min(1, Math.max(0, direct)));
}

export const MONSTER_LIGHT_GLSL = /* glsl */ `
{
  const vec3 mLuma = vec3( 0.2126, 0.7152, 0.0722 );
  vec3 mV = normalize( vViewPosition );
  vec3 mSunFull = uAtmoSunColor * uAtmoRadiance;
  float mSunLum = max( dot( mSunFull, mLuma ), 1e-4 );
  float mSunVis = clamp( dot( csmSunIn, mLuma ) / mSunLum, 0.0, 1.0 );
  vec3 mSunV = normalize( ( viewMatrix * vec4( uAtmoSunDir, 0.0 ) ).xyz );
  // この面が受ける直射の割合（影 × 太陽を向く度合い）。低い日をかすめて受ける面（向きが fillLitNdl まで）も日なたとして数える
  // （かすめる面まで補助光を足すと、順光の標本で黒い焔角の背と肩が茶色に浮き、日なたの陰影が平らになった）
  float mDirect = mSunVis * smoothstep( 0.0, ${ML.fillLitNdl.toFixed(3)}, dot( normal, mSunV ) );
  // 正面の補助光：太陽の色を灰色へ寄せ、明るさを太陽にそろえた色
  vec3 mFillCol = mix( mSunFull, vec3( mSunLum ), ${ML.fillNeutral.toFixed(3)} );
  vec3 mFillDir = normalize( mV + vec3( 0.0, ${ML.fillLift.toFixed(3)}, 0.0 ) );
  float mFill = ${ML.fillBase.toFixed(4)} + ${ML.fillShade.toFixed(4)} * ( 1.0 - mDirect );
  reflectedLight.directDiffuse += mFillCol * mFill * saturate( dot( normal, mFillDir ) ) * BRDF_Lambert( material.diffuseContribution );
  // 縁の光：輪郭ほど強く、太陽の側を向いた輪郭だけ
  float mEdge = pow( 1.0 - saturate( dot( normal, mV ) ), ${ML.rimPower.toFixed(2)} );
  float mSide = saturate( dot( normal, mSunV ) * 0.6 + 0.4 );
  // 日の当たる所では、順光（太陽がカメラの側）ほど縁の光を弱め、逆光（太陽がカメラの向こう）では残す。影の中では強い。
  // 順光でも強くした版は、ごつごつした焔角の起伏の縁ごとに艶が乗り、黒い体が茶色に浮いた（標本 street で体の平均 35→46）。
  // カメラのすぐ近く（寄りの画）では消す（頭の上の広い面がかすめる向きになり、白っぽく粉をふいたように見えた）
  float mBack = saturate( -dot( mV, mSunV ) );
  float mNear = smoothstep( ${ML.rimFadeM[0].toFixed(1)}, ${ML.rimFadeM[1].toFixed(1)}, length( vViewPosition ) );
  vec3 mRim = mSunFull * mEdge * mSide * mSide * mix( 1.0, mix( ${ML.rimInSun.toFixed(3)}, 1.0, mBack ), mSunVis ) * mNear;
  reflectedLight.directDiffuse += mRim * ${ML.rim.toFixed(4)} * BRDF_Lambert( material.diffuseContribution );
  // 艶の分は体の色に染まらない（低い日がかすめる面の照り返し）。赤や黒の体でも輪郭が明るく読める
  reflectedLight.directSpecular += mRim * ${ML.rimSheen.toFixed(4)};
}
`;

/** 膜：夕日や炎の光が裏から当たると透ける（光の向きの影も効く）。 */
const TRANSLUCENT_TARGET = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const TRANSLUCENT = /* glsl */ `
	{
		float dragonBack = saturate( dot( -geometryNormal, directLight.direction ) );
		float dragonForward = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 3.0 );
		reflectedLight.directDiffuse += directLight.color * dragonTrans * dragonBack * ( 0.35 + 1.8 * dragonForward ) * RECIPROCAL_PI;
	}
`;

function patchFor(membrane: boolean, uniforms: DragonUniforms, options: DragonMaterialOptions) {
  const { look: L, emit: E } = options;
  return {
    key: `${options.key}-${membrane ? 'membrane' : 'skin'}`,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    vertex: (src: string): string => {
      let s = replaceOrThrow(src, '#include <common>', `#include <common>\n${VERTEX_PARS}${E ? EMIT_VERTEX_PARS : ''}`);
      s = replaceOrThrow(s, '#include <skinnormal_vertex>', `#include <skinnormal_vertex>\n${VERTEX_SKIN}${E ? EMIT_VERTEX : ''}`);
      return s;
    },
    fragment: (src: string): string => {
      let s = replaceOrThrow(src, '#include <common>', `#include <common>\n${FRAGMENT_PARS}${E ? EMIT_FRAGMENT_PARS : ''}`);
      s = replaceOrThrow(s, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${surfaceGlsl(L)}`);
      s = replaceOrThrow(s, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissiveGlsl(L)}${E ? emitGlsl(E) : ''}`);
      s = replaceOrThrow(s, '#include <lights_fragment_end>', `#include <lights_fragment_end>\n${MONSTER_LIGHT_GLSL}`);
      if (membrane) {
        const chunk = replaceOrThrow(ShaderChunk.lights_physical_pars_fragment, TRANSLUCENT_TARGET, `${TRANSLUCENT_TARGET}\n${TRANSLUCENT}`);
        s = replaceOrThrow(s, '#include <lights_physical_pars_fragment>', chunk);
      }
      return s;
    },
  };
}

const DRAGON_OPTIONS: DragonMaterialOptions = { key: 'dragon', look: L };

export function createDragonMaterials(
  kit: MaterialKit,
  options: DragonMaterialOptions = DRAGON_OPTIONS,
): { skin: MeshStandardMaterial; membrane: MeshStandardMaterial; uniforms: DragonUniforms } {
  const uniforms: DragonUniforms = { uThroat: { value: 0 }, uEyeGlow: { value: options.look.eyeGlow }, uTime: { value: 0 }, uEmitGain: { value: 1 } };
  const make = (membrane: boolean): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({
      vertexColors: true,
      roughness: options.look.roughness,
      metalness: 0,
      side: membrane ? DoubleSide : FrontSide,
      envMapIntensity: AMBIENT.envIntensity,
    });
    m.name = membrane ? 'DragonMembrane' : 'DragonSkin';
    kit.patch(m, patchFor(membrane, uniforms, options));
    return m;
  };
  return { skin: make(false), membrane: make(true), uniforms };
}
