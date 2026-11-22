// 魚の皮・うろこ・ぜいご・切り込み・身（筋節・血合い）・断面・骨・内臓・目・ヒレの GLSL 断片。
// Three.js r186（WebGL2 / MeshPhysicalMaterial・MeshStandardMaterial）の onBeforeCompile に差し込みます。

export const MAX_INCISIONS = 12;
export const MAX_INCISION_POINTS = 32;

const VERT_PARS = /* glsl */ `
attribute float aSeg;
varying vec3 vFlfPos;
varying vec3 vFlfNormal;
varying float vSeg;
varying vec2 vRawUv;
varying vec3 vNm0;
varying vec3 vNm1;
varying vec3 vNm2;
`;

const VERT_BODY = /* glsl */ `
#ifdef USE_INSTANCING
  vFlfPos = ( instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
  vFlfNormal = normalize( mat3( instanceMatrix ) * objectNormal );
#else
  vFlfPos = transformed;
  vFlfNormal = normalize( objectNormal );
#endif
vSeg = aSeg;
vRawUv = uv;
vNm0 = normalMatrix * vec3( 1.0, 0.0, 0.0 );
vNm1 = normalMatrix * vec3( 0.0, 1.0, 0.0 );
vNm2 = normalMatrix * vec3( 0.0, 0.0, 1.0 );
`;

const FRAG_COMMON_PARS = /* glsl */ `
varying vec3 vFlfPos;
varying vec3 vFlfNormal;
varying float vSeg;
varying vec2 vRawUv;
varying vec3 vNm0;
varying vec3 vNm1;
varying vec3 vNm2;

uniform float uSL;
uniform float uMaxDepth;
uniform float uHeadLen;
uniform float uCavityEnd;
uniform float uXray;
uniform float uSlitOpen;
uniform float uTime;
uniform float uIsFlat;
uniform sampler2D uProfileTex;
uniform sampler2D uFleshTex;

// 64×2 の RGBA32F LUT を手動線形補間します（拡張不要で全 WebGL2 端末で動作）。
void sbSampleProfile( float s, out vec4 row0, out vec4 row1 ) {
  float idx = clamp( s, 0.0, 1.0 ) * 63.0;
  float i0 = floor( idx );
  float i1 = min( i0 + 1.0, 63.0 );
  float f = idx - i0;
  float u0 = ( i0 + 0.5 ) / 64.0;
  float u1 = ( i1 + 0.5 ) / 64.0;
  row0 = mix( texture2D( uProfileTex, vec2( u0, 0.25 ) ), texture2D( uProfileTex, vec2( u1, 0.25 ) ), f );
  row1 = mix( texture2D( uProfileTex, vec2( u0, 0.75 ) ), texture2D( uProfileTex, vec2( u1, 0.75 ) ), f );
}

float sbHash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

vec2 sbHash22( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}

float sbNoise3( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float n000 = sbHash21( i.xy + i.z * 37.0 );
  float n100 = sbHash21( i.xy + vec2( 1.0, 0.0 ) + i.z * 37.0 );
  float n010 = sbHash21( i.xy + vec2( 0.0, 1.0 ) + i.z * 37.0 );
  float n110 = sbHash21( i.xy + vec2( 1.0, 1.0 ) + i.z * 37.0 );
  float n001 = sbHash21( i.xy + ( i.z + 1.0 ) * 37.0 );
  float n101 = sbHash21( i.xy + vec2( 1.0, 0.0 ) + ( i.z + 1.0 ) * 37.0 );
  float n011 = sbHash21( i.xy + vec2( 0.0, 1.0 ) + ( i.z + 1.0 ) * 37.0 );
  float n111 = sbHash21( i.xy + vec2( 1.0, 1.0 ) + ( i.z + 1.0 ) * 37.0 );
  float nx00 = mix( n000, n100, f.x );
  float nx10 = mix( n010, n110, f.x );
  float nx01 = mix( n001, n101, f.x );
  float nx11 = mix( n011, n111, f.x );
  return mix( mix( nx00, nx10, f.y ), mix( nx01, nx11, f.y ), f.z );
}
`;

const FRAG_INCISION_PARS = /* glsl */ `
uniform sampler2D uIncisionTex;
uniform vec4 uIncisionMeta[ ${MAX_INCISIONS} ];
uniform vec4 uIncisionSphere[ ${MAX_INCISIONS} ];
uniform int uIncisionCount;

// 1本の切り込み折れ線への最短距離と接線ベクトルを返します（xyz=最近点からの接線差, w=距離）。
vec4 sbDistToIncision( int idx, int count, float prog, vec3 p, vec3 nFlf, bool isOuterFlesh, out float outTaper ) {
  float vRow = ( float( idx ) + 0.5 ) / ${MAX_INCISIONS}.0;
  vec4 prev = texture2D( uIncisionTex, vec2( 0.5 / ${MAX_INCISION_POINTS}.0, vRow ) );
  float minDist = 1e6;
  vec3 bestDiff = vec3( 0.0 );
  outTaper = 1.0;

  for ( int j = 1; j < ${MAX_INCISION_POINTS}; j++ ) {
    if ( j >= count ) break;
    vec4 curr = texture2D( uIncisionTex, vec2( ( float( j ) + 0.5 ) / ${MAX_INCISION_POINTS}.0, vRow ) );
    float u0 = prev.w;
    float u1 = curr.w;
    if ( u0 >= prog ) break;

    vec3 a = prev.xyz;
    vec3 b = curr.xyz;
    float segEndU = u1;
    if ( u1 > prog && u1 > u0 + 1e-6 ) {
      float frac = clamp( ( prog - u0 ) / ( u1 - u0 ), 0.0, 1.0 );
      b = mix( a, b, frac );
      segEndU = prog;
    }

    vec3 ab = b - a;
    float ab2 = dot( ab, ab );
    float t = ab2 > 1e-10 ? clamp( dot( p - a, ab ) / ab2, 0.0, 1.0 ) : 0.0;
    vec3 diff = p - ( a + ab * t );

    // 法線方向のズレを分離し、反対側の体側への裏抜けを防ぎつつ皮下の身にも溝を通します。
    float nSigned = dot( diff, nFlf );
    vec3 tVec = diff - nFlf * nSigned;
    float tDist = length( tVec );
    float nExcess = isOuterFlesh
      ? max( 0.0, max( nSigned - 0.04, -0.14 - nSigned ) )
      : max( 0.0, max( nSigned - 0.06, -0.10 - nSigned ) );
    float d = length( vec2( tDist, nExcess * 4.0 ) );

    if ( d < minDist ) {
      minDist = d;
      bestDiff = tVec;
      float uHit = mix( u0, segEndU, t );
      float headTaper = smoothstep( 0.0, 0.035, uHit );
      float tipTaper = smoothstep( prog, max( 0.0, prog - 0.045 ), uHit );
      outTaper = headTaper * mix( 0.45, 1.0, tipTaper );
    }
    prev = curr;
  }
  return vec4( bestDiff, minDist );
}

// 切り込み折れ線への距離・溝の深さ・縁の唇・法線傾き（FLF空間）を返します。
void sbEvalIncisions( vec3 p, vec3 nFlf, float pxCm, bool isOuterFlesh, out float outGroove, out float outLip, out vec3 outGrad ) {
  outGroove = 0.0;
  outLip = 0.0;
  outGrad = vec3( 0.0 );
  if ( uIncisionCount <= 0 ) return;

  float bestGroove = 0.0;
  float bestLip = 0.0;
  vec3 bestGrad = vec3( 0.0 );

  for ( int i = 0; i < ${MAX_INCISIONS}; i++ ) {
    if ( i >= uIncisionCount ) break;
    vec4 meta = uIncisionMeta[ i ];
    int count = int( meta.x + 0.5 );
    float prog = meta.y;
    if ( count < 2 || prog <= 0.001 ) continue;

    vec4 sph = uIncisionSphere[ i ];
    if ( distance( p, sph.xyz ) > sph.w ) continue;

    float endTaper = 1.0;
    vec4 hit = sbDistToIncision( i, count, prog, p, nFlf, isOuterFlesh, endTaper );
    float minDist = hit.w;
    float halfW = meta.w * 0.5 * mix( 0.72, 1.0, endTaper );
    if ( minDist < halfW * 3.4 ) {
      float aa = max( pxCm, 0.004 );
      float groove = ( 1.0 - smoothstep( halfW * 0.38, halfW + aa, minDist ) ) * endTaper;
      float lip = smoothstep( halfW * 0.65, halfW * 1.15, minDist )
        * ( 1.0 - smoothstep( halfW * 1.35, halfW * 2.8 + aa, minDist ) ) * endTaper;
      float slope = ( smoothstep( 0.0, halfW * 0.6, minDist )
        * ( 1.0 - smoothstep( halfW * 0.75, halfW * 2.1 + aa, minDist ) ) ) * endTaper;

      if ( groove > bestGroove ) {
        bestGroove = groove;
        vec3 dir = length( hit.xyz ) > 1e-5 ? normalize( hit.xyz ) : vec3( 0.0 );
        bestGrad = -dir * slope * ( 0.68 + 0.25 * meta.z );
      } else if ( slope > 0.01 && bestGroove < 0.05 ) {
        vec3 dir = length( hit.xyz ) > 1e-5 ? normalize( hit.xyz ) : vec3( 0.0 );
        bestGrad += -dir * slope * 0.55;
      }
      bestLip = max( bestLip, lip );
    }
  }

  outGroove = clamp( bestGroove, 0.0, 1.0 );
  outLip = clamp( bestLip, 0.0, 1.0 );
  outGrad = bestGrad;
}
`;

const FRAG_SKIN_HELPERS = /* glsl */ `
uniform float uScale;
uniform float uScutes;
uniform float uHasScutes;
uniform float uScaleCols;
uniform float uScaleRows;
uniform float uScaleGloss;
uniform vec3 uSkinInnerColor;

// 画素幅で積分した六角・円鱗の法線と輝きを返します。
// outRes: x=リム影, y=鱗の輝き(細かい粒光), z=法線X傾き(尾方向), w=法線Y傾き(周方向)
vec4 sbEvalHexScales( vec2 uv, vec2 dUvX, vec2 dUvY, float strength, bool simpleNormal, bool colorOnly ) {
  if ( strength <= 0.001 ) return vec4( 0.0 );

  vec2 grid = vec2( uScaleCols, uScaleRows );
  vec2 st = uv * grid;
  vec2 dx = dUvX * grid;
  vec2 dy = dUvY * grid;
  float footprint = max( length( dx ), length( dy ) );
  // 近景で六角・円鱗の繊細な縁が見え、引くと銀面の粒光へ滑らかに溶ける積分減衰
  float detailFade = 1.0 - smoothstep( 0.14, 0.56, footprint );
  float sheenFade = 1.0 - smoothstep( 0.35, 1.40, footprint );
  if ( sheenFade <= 0.001 ) return vec4( 0.0 );

  float bestMask = 0.0;
  float baseCol = floor( st.x );
  float winnerDepth = -1e5;
  vec2 winnerLocal = vec2( 0.0 );
  vec2 winnerCell = vec2( 0.0 );

  for ( int ox = -1; ox <= 0; ox++ ) {
    float cx = baseCol + float( ox );
    float rowShift = mod( cx, 2.0 ) * 0.5;
    float cy = floor( st.y - rowShift );
    for ( int oy = 0; oy <= 1; oy++ ) {
      float ry = cy + float( oy );
      vec2 center = vec2( cx + 0.5, ry + rowShift + 0.5 );
      vec2 d = st - center;
      vec2 q = abs( d * vec2( 0.90, 1.06 ) );
      float hexD = max( q.x * 0.866025 + q.y * 0.5, q.y );
      float circD = length( d * vec2( 0.86, 1.02 ) );
      float dist = mix( hexD, circD, 0.36 );
      if ( dist < 0.62 ) {
        float layer = -cx + ( 0.62 - dist ) * 0.25;
        if ( layer > winnerDepth ) {
          winnerDepth = layer;
          winnerLocal = d;
          winnerCell = vec2( cx, mod( ry, uScaleRows ) );
          bestMask = 1.0 - smoothstep( 0.47, 0.60, dist );
        }
      }
    }
  }

  vec2 h = sbHash22( winnerCell + vec2( 17.3, 9.1 ) );
  vec2 qW = abs( winnerLocal * vec2( 0.90, 1.06 ) );
  float hexW = max( qW.x * 0.866025 + qW.y * 0.5, qW.y );
  float circW = length( winnerLocal * vec2( 0.86, 1.02 ) );
  float distW = mix( hexW, circW, 0.36 );

  // 魚鱗は「暗い格子」ではなく、後縁（尾側）の繊細な三日月状の重なり影と銀の縁光が主役
  float edgeBand = smoothstep( 0.40, 0.52, distW ) * ( 1.0 - smoothstep( 0.53, 0.61, distW ) );
  float rearArc = smoothstep( -0.08, 0.40, winnerLocal.x );
  float rimShadow = edgeBand * ( 0.14 + 0.86 * rearArc ) * detailFade * strength;

  // 各鱗の微小な傾き差による「細かい光の粒」（ランダムにキラリと光る鱗を混ぜる）
  float facet = smoothstep( 0.56, 0.10, distW );
  float glintCell = smoothstep( 0.56, 0.96, h.x );
  float grain = ( h.x - 0.48 ) * 0.62 + glintCell * 0.65;
  float crescentRim = smoothstep( 0.24, 0.47, distW ) * ( 1.0 - smoothstep( 0.48, 0.58, distW ) ) * rearArc;
  float sparkle = ( grain * facet * 0.52 + crescentRim * ( 0.45 + 0.55 * h.y ) ) * sheenFade * strength;

  vec2 normSlope = vec2( 0.0 );
  if ( !colorOnly && detailFade > 0.001 ) {
    float scaleAmp = ( simpleNormal ? 0.17 : 0.28 ) * detailFade * strength * bestMask;
    vec2 dome = -winnerLocal * 0.92;
    vec2 randTilt = ( h - 0.5 ) * ( simpleNormal ? 0.45 : 0.78 );
    float lipPush = smoothstep( 0.36, 0.52, distW ) * rearArc * ( simpleNormal ? 0.28 : 0.55 );
    normSlope = ( dome + randTilt + vec2( lipPush, 0.0 ) ) * scaleAmp;
  }

  return vec4( rimShadow, sparkle, normSlope.x, normSlope.y );
}

// 側線後半の硬い稜鱗（ぜいご）の列を評価します。
// 重なり合うくさび形の硬い板＋板間の溝影＋中央の稜（キール）を立体的に描きます。
// 返り値: x=板のマスク(0..1), y=ハイライト-溝影(-1..1), z=法線X傾き, w=法線Y傾き
vec4 sbEvalScutes( float s, float yNorm, float latRatio, float scuteMask, float strength ) {
  float mask = scuteMask * uHasScutes * strength;
  if ( mask <= 0.001 ) return vec4( 0.0 );

  // 側線直走部に沿って、体高比でおよそ ±0.115 の幅を持つ縦長の硬い板
  float halfH = mix( 0.075, 0.118, smoothstep( 0.50, 0.76, s ) );
  float dy = ( yNorm - latRatio ) / halfH;
  if ( abs( dy ) > 1.35 ) return vec4( 0.0 );

  // 尾柄にかけて44枚相当の明瞭なくさび形プレート
  float count = 46.0;
  float sx = s * count;
  float fx = fract( sx ) - 0.5;

  // 各板が後ろへ「く」の字（シェブロン）に重なる形
  float chevronX = fx - abs( dy ) * 0.42;
  float plateBody = smoothstep( -0.46, -0.22, chevronX ) * ( 1.0 - smoothstep( 0.22, 0.44, chevronX ) );
  float plateY = 1.0 - smoothstep( 0.62, 1.08, abs( dy ) );
  float plate = plateBody * plateY * mask;

  // 板の後縁（次の板との重なり目）の暗い刻み溝
  float seamGroove = smoothstep( 0.20, 0.36, chevronX ) * ( 1.0 - smoothstep( 0.38, 0.52, chevronX ) ) * plateY * mask;
  // 中央のわずかに隆起した稜（キール）：白い点線にならず滑らかな金属稜線に
  float keel = exp( -dy * dy * 5.2 ) * plate * ( 0.65 + 0.35 * smoothstep( -0.3, 0.25, chevronX ) );
  float plateBevel = smoothstep( -0.25, 0.18, chevronX ) * plate;

  float aa = max( fwidth( sx ), 0.01 );
  float fade = 1.0 - smoothstep( 0.55, 1.45, aa );

  float nx = ( -chevronX * 0.65 + seamGroove * 0.95 ) * ( plate + seamGroove ) * fade;
  float ny = ( -sign( dy ) * exp( -abs( dy ) * 1.9 ) * 0.85 ) * plate * fade;

  return vec4( plate * fade, ( keel * 0.42 + plateBevel * 0.18 - seamGroove * 0.65 ) * fade, nx, ny );
}
`;

const FRAG_FLESH_HELPERS = /* glsl */ `
uniform vec3 uFleshBase;
uniform vec3 uFleshDeep;
uniform vec3 uChiaiColor;
uniform float uChiaiStrength;
uniform float uMyoPitch;
`;

function replaceOnce(src, anchor, insertion, mode = 'after') {
  if (!src.includes(anchor)) return src;
  if (mode === 'replace') return src.replace(anchor, insertion);
  if (mode === 'before') return src.replace(anchor, `${insertion}\n${anchor}`);
  return src.replace(anchor, `${anchor}\n${insertion}`);
}

/** 皮材質のシェーダー差し込み（色テクスチャ・六角うろこ・ぜいご・切り込み・裏側・透視）。 */
export function patchSkinShader(shader, { quality = 'standard', uniforms }) {
  Object.assign(shader.uniforms, uniforms);
  const isLight = quality === 'light';
  const isStandard = quality === 'standard';

  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', VERT_PARS);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', VERT_BODY);

  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <common>',
    `${FRAG_COMMON_PARS}\n${FRAG_INCISION_PARS}\n${FRAG_SKIN_HELPERS}`,
  );

  // UVジャンプ（鰓蓋Lなど）の影響を受けず、FLF座標から連続な (s, phi/2π) で皮テクスチャを読む
  const skinMapAndFx = /* glsl */ `
  vec3 sbPerturbFlf = vec3( 0.0 );
  vec3 sbCoatPerturbFlf = vec3( 0.0 );
  float sbRoughDelta = 0.0;
  float sbMetalDelta = 0.0;
  vec3 sbEmissiveAdd = vec3( 0.0 );
  float sbAlphaScale = 1.0;

  vec4 sbProf0, sbProf1;
  float sbS = clamp( vFlfPos.x / max( uSL, 1e-4 ), 0.0, 1.0 );
  sbSampleProfile( sbS, sbProf0, sbProf1 );

  float sbDy = vFlfPos.y - sbProf0.w;
  float sbYNorm = clamp( sbDy / max( sbDy >= 0.0 ? sbProf0.x : sbProf0.y, 1e-4 ), -1.15, 1.15 );
  float sbZNorm = clamp( vFlfPos.z / max( sbProf0.z, 1e-4 ), -1.15, 1.15 );
  float sbPhiA = atan( sbYNorm, sbZNorm );
  float sbPhiB = 3.14159265359 - atan( sbYNorm, -sbZNorm );
  float sbVA = sbPhiA / 6.28318530718;
  float sbVB = sbPhiB / 6.28318530718;
  vec2 sbSkinUv = vec2( sbS, fract( sbVA ) );
  vec2 sbDUvX = vec2( dFdx( sbS ), sbZNorm >= 0.0 ? dFdx( sbVA ) : dFdx( sbVB ) );
  vec2 sbDUvY = vec2( dFdy( sbS ), sbZNorm >= 0.0 ? dFdy( sbVA ) : dFdy( sbVB ) );

  #ifdef USE_MAP
    vec4 sampledDiffuseColor = textureGrad( map, sbSkinUv, sbDUvX, sbDUvY );
    diffuseColor *= sampledDiffuseColor;
  #endif

  if ( !gl_FrontFacing ) {
    // 剥いだ皮の裏側：真珠がかった淡い銀桃色
    vec4 fMicro = texture2D( uFleshTex, vFlfPos.xy * 0.22 );
    diffuseColor.rgb = uSkinInnerColor * ( 0.92 + 0.14 * fMicro.b );
    sbRoughDelta = 0.10;
    sbMetalDelta = -0.22;
  } else if ( vSeg > 2.5 ) {
    // 切り口に返された皮の厚みの縁
    diffuseColor.rgb = mix( uSkinInnerColor, vec3( 0.85, 0.88, 0.90 ), 0.45 );
    sbRoughDelta = 0.08;
    sbMetalDelta = -0.25;
  } else {
    float sbSinP = sin( sbPhiA );
    float sbFlankMask = 1.0 - smoothstep( 0.18, 0.86, abs( sbSinP ) );
    float sbDorsalMask = smoothstep( 0.12, 0.78, sbSinP );
    float sbBellyMask = smoothstep( -0.15, -0.78, sbSinP );

    // 背は深い色素＋濡れ艶、体側は生銀の反射、腹は柔らかい真珠白（金属ののっぺり感を抑える）
    vec4 sbSkinMicro = texture2D( uFleshTex, vec2( sbS * 9.0, sbSkinUv.y * 6.0 ) );
    if ( uIsFlat > 0.5 ) {
      float eyed = smoothstep( -0.1, 0.1, sbZNorm );
      sbMetalDelta += mix( -0.18, -0.26, eyed );
      sbRoughDelta += mix( 0.02, 0.14, eyed ) + ( sbSkinMicro.a - 0.5 ) * 0.06;
    } else {
      sbMetalDelta += sbFlankMask * 0.18 - sbDorsalMask * 0.20 - sbBellyMask * 0.16;
      sbRoughDelta += -sbFlankMask * 0.05 + sbDorsalMask * 0.06 + sbBellyMask * 0.02 + ( sbSkinMicro.a - 0.5 ) * 0.05;
    }

    // 頭部（吻〜眼）は無鱗、鰓蓋は控えめ、胴体全体に繊細なうろこ
    float sbScaleRegion = smoothstep( uHeadLen * 0.88, uHeadLen * 1.04, sbS ) * ( 1.0 - smoothstep( 0.95, 1.0, sbS ) );
    float sbCheekScale = smoothstep( uHeadLen * 0.58, uHeadLen * 0.80, sbS )
      * ( 1.0 - smoothstep( uHeadLen * 0.92, uHeadLen * 1.02, sbS ) ) * 0.16;
    float sbScaleAmt = clamp( sbScaleRegion + sbCheekScale, 0.0, 1.0 ) * uScale;

    vec4 sc = sbEvalHexScales( sbSkinUv, sbDUvX, sbDUvY, sbScaleAmt, ${isStandard ? 'true' : 'false'}, ${isLight ? 'true' : 'false'} );
    // 鱗の縁の控えめな重なり影＋繊細な銀の粒光
    diffuseColor.rgb *= ( 1.0 - sc.x * ( 0.14 + 0.10 * sbDorsalMask ) );
    vec3 silverGlint = mix( vec3( 0.72, 0.86, 0.92 ), vec3( 0.95, 0.98, 1.0 ), sbFlankMask );
    diffuseColor.rgb += silverGlint * sc.y * uScaleGloss * ( 0.14 + 0.20 * sbFlankMask );
    sbRoughDelta += -clamp( sc.y, -0.4, 0.9 ) * 0.08 * sbScaleAmt;
    sbMetalDelta += clamp( sc.y, 0.0, 1.0 ) * 0.14 * sbScaleAmt;

    // 鱗法線用の接線フレーム（FLF空間：尾方向 +x、周方向 tC）
    vec3 nFlf = normalize( vFlfNormal );
    vec3 tS = vec3( 1.0, 0.0, 0.0 ) - nFlf * nFlf.x;
    tS = length( tS ) > 1e-4 ? normalize( tS ) : vec3( 0.0, 1.0, 0.0 );
    vec3 tC = normalize( cross( nFlf, tS ) );
    // 素肌にも極微細な皮の揺らぎを入れてプラスチック・クローム感を防ぐ
    sbPerturbFlf += ( tS * ( sbSkinMicro.r - 0.5 ) + tC * ( sbSkinMicro.g - 0.5 ) ) * 0.04;
    sbPerturbFlf += ( tS * sc.z + tC * sc.w ) * 0.48;
    sbCoatPerturbFlf += ( tS * sc.z + tC * sc.w ) * 0.09;

    // ぜいご（側線後半の硬い稜鱗：重なり合うくさび形の硬い板）
    vec4 z = sbEvalScutes( sbS, sbYNorm, sbProf1.y, sbProf1.z, uScutes );
    if ( z.x > 0.001 || abs( z.y ) > 0.001 ) {
      vec3 scuteCol = mix( diffuseColor.rgb * 1.06, vec3( 0.78, 0.82, 0.81 ), 0.46 );
      diffuseColor.rgb = mix( diffuseColor.rgb, scuteCol, z.x * 0.74 );
      // 正の z.y は稜の銀光、負の z.y は板と板の重なり溝の暗い陰影
      diffuseColor.rgb += vec3( 0.18, 0.21, 0.21 ) * max( z.y, 0.0 );
      diffuseColor.rgb *= ( 1.0 - max( -z.y, 0.0 ) * 0.42 );
      sbRoughDelta += z.x * 0.06 - max( z.y, 0.0 ) * 0.08;
      sbMetalDelta += z.x * 0.12;
      sbPerturbFlf += ( tS * z.z + tC * z.w ) * 0.72;
      sbCoatPerturbFlf += ( tS * z.z + tC * z.w ) * 0.34;
    }

    // 腹の切り開き時のわずかな折り目影
    if ( uSlitOpen > 0.001 ) {
      float bellyCrease = smoothstep( -0.88, -0.99, sbSinP ) * sbProf1.w * uSlitOpen;
      diffuseColor.rgb *= ( 1.0 - bellyCrease * 0.28 );
    }

    // 切り込み（暗い赤の溝＋縁の薄い明るい唇＋凹み法線）
    if ( uIncisionCount > 0 ) {
      float incGroove, incLip;
      vec3 incGrad;
      float pxCm = max( length( fwidth( vFlfPos ) ), 0.004 );
      sbEvalIncisions( vFlfPos, nFlf, pxCm, false, incGroove, incLip, incGrad );
      if ( incGroove > 0.001 || incLip > 0.001 ) {
        vec3 lipCol = mix( diffuseColor.rgb * 1.14 + vec3( 0.04, 0.03, 0.025 ), vec3( 0.84, 0.72, 0.68 ), 0.26 );
        vec3 grooveCol = vec3( 0.13, 0.020, 0.024 );
        diffuseColor.rgb = mix( diffuseColor.rgb, lipCol, incLip * 0.38 );
        diffuseColor.rgb = mix( diffuseColor.rgb, grooveCol, incGroove * 0.93 );
        sbRoughDelta += incGroove * 0.26 - incLip * 0.08;
        sbMetalDelta -= incGroove * 0.45;
        sbPerturbFlf += incGrad * 0.85;
        sbCoatPerturbFlf += incGrad * 0.68;
      }
    }
  }
  `;

  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <map_fragment>', skinMapAndFx, 'replace');

  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <roughnessmap_fragment>',
    'roughnessFactor = clamp( roughnessFactor + sbRoughDelta, 0.06, 0.95 );',
  );
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <metalnessmap_fragment>',
    'metalnessFactor = clamp( metalnessFactor + sbMetalDelta, 0.0, 0.88 );',
  );

  // FLF空間の法線傾きをビュー空間へ変換して normal / clearcoatNormal に適用
  const applySkinNormal = /* glsl */ `
  mat3 sbNm = mat3( vNm0, vNm1, vNm2 );
  if ( dot( sbPerturbFlf, sbPerturbFlf ) > 1e-8 ) {
    vec3 sbViewP = sbNm * sbPerturbFlf;
    sbViewP -= normal * dot( sbViewP, normal );
    normal = normalize( normal + sbViewP );
  }
  // 視線角度に応じた生魚の真珠干渉（金属ののっぺり感を防ぎ濡れた銀艶に）
  vec3 sbViewDir = normalize( vViewPosition );
  float sbNdotV = clamp( abs( dot( normal, sbViewDir ) ), 0.0, 1.0 );
  float sbFresnel = pow( 1.0 - sbNdotV, 3.0 );
  if ( gl_FrontFacing && vSeg < 2.5 && uIsFlat < 0.5 ) {
    float sbSinF = sin( sbPhiA );
    float sbBand = 1.0 - smoothstep( 0.25, 0.92, abs( sbSinF ) );
    vec3 sbPearl = mix( vec3( 0.14, 0.28, 0.34 ), vec3( 0.26, 0.30, 0.34 ), smoothstep( -0.3, 0.4, sbSinF ) );
    sbEmissiveAdd += sbPearl * sbFresnel * ( 0.10 + 0.12 * sbBand ) * ( 1.0 - uXray * 0.7 );
  }
  // 透視モード：最小不透明度 0.18 ＋ 縁に淡い輪郭
  if ( uXray > 0.001 ) {
    float rim = pow( 1.0 - sbNdotV, 2.2 );
    float minAlpha = mix( 1.0, 0.18, uXray );
    float rimAlpha = mix( 0.0, 0.36 * rim, uXray );
    diffuseColor.a *= clamp( minAlpha + rimAlpha, 0.18, 1.0 );
    sbEmissiveAdd += vec3( 0.16, 0.28, 0.36 ) * rim * uXray * 0.65;
  }
  `;

  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <normal_fragment_maps>', applySkinNormal);

  const applyCoatNormal = /* glsl */ `
  #ifdef USE_CLEARCOAT
    if ( dot( sbCoatPerturbFlf, sbCoatPerturbFlf ) > 1e-8 ) {
      vec3 sbCoatP = sbNm * sbCoatPerturbFlf;
      sbCoatP -= clearcoatNormal * dot( sbCoatP, clearcoatNormal );
      clearcoatNormal = normalize( clearcoatNormal + sbCoatP );
    }
  #endif
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <clearcoat_normal_fragment_maps>', applyCoatNormal);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <emissivemap_fragment>', 'totalEmissiveRadiance += sbEmissiveAdd;');
}

/** 身（S面・H面・外側の身）と切り口キャップ（椎体・脊髄・血合い・筋節の輪）のシェーダー差し込み。 */
export function patchFleshShader(shader, { quality = 'standard', isCap = false, uniforms }) {
  Object.assign(shader.uniforms, uniforms);
  const isLight = quality === 'light';

  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', VERT_PARS);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', VERT_BODY);

  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <common>',
    isCap
      ? `${FRAG_COMMON_PARS}\n${FRAG_FLESH_HELPERS}`
      : `${FRAG_COMMON_PARS}\n${FRAG_INCISION_PARS}\n${FRAG_FLESH_HELPERS}`,
  );

  const fleshFx = /* glsl */ `
  vec3 sbPerturbFlf = vec3( 0.0 );
  float sbRoughDelta = 0.0;
  float sbMetalDelta = 0.0;
  vec3 sbEmissiveAdd = vec3( 0.0 );

  vec4 sbProf0, sbProf1;
  float sbS = clamp( vFlfPos.x / max( uSL, 1e-4 ), 0.0, 1.0 );
  sbSampleProfile( sbS, sbProf0, sbProf1 );

  float sbDy = vFlfPos.y - sbProf0.w;
  float sbDepth = sbDy >= 0.0 ? sbProf0.x : sbProf0.y;
  float sbYNorm = clamp( sbDy / max( sbDepth, 1e-4 ), -1.2, 1.2 );
  float sbZNorm = clamp( abs( vFlfPos.z ) / max( sbProf0.z, 1e-4 ), 0.0, 1.2 );
  float sbSpineR = sbProf1.x;
  float sbLatRatio = sbProf1.y;
  float sbPitch = max( uMyoPitch, 0.14 );

  // 純JSの微細筋繊維・コラーゲン詳細テクスチャをFLF座標からサンプリング
  vec4 sbDetS = texture2D( uFleshTex, vec2( vFlfPos.x * 0.28, sbDy * 0.42 ) );
  vec4 sbDetC = texture2D( uFleshTex, vec2( sbDy * 0.45, vFlfPos.z * 0.45 ) );
  float sbFiber = mix( sbDetS.r, sbDetC.r, ${isCap ? '0.85' : '0.20'} );
  float sbMottle = sbDetS.b;
  float sbCollagen = sbDetS.g;

  vec3 sbCol = mix( uFleshBase, uFleshDeep, clamp( ( sbMottle - 0.32 ) * 0.85, 0.0, 1.0 ) );
  sbCol *= ( 0.93 + 0.14 * sbFiber );
  vec3 sbSeptaCol = mix( uFleshBase * 1.18 + vec3( 0.10, 0.09, 0.08 ), vec3( 0.94, 0.89, 0.86 ), 0.45 );

  vec3 nFlf = normalize( vFlfNormal );

  ${isCap ? /* glsl */ `
  // === 断面キャップ（aSeg == 3）：身の輪＋中央の白い椎体＋脊髄の点＋下の血合い ===
  float sbRadSpine = length( vec2( sbDy, vFlfPos.z ) );
  float sbOuterR = length( vec2( sbYNorm, sbZNorm ) );

  // 同心状の筋節リング（身の輪）
  float sbRingCoord = ( sbOuterR * 4.6 + ( sbCollagen - 0.5 ) * 0.24 );
  float sbRingPhase = fract( sbRingCoord );
  float sbRingLine = smoothstep( 0.0, 0.11, sbRingPhase ) * ( 1.0 - smoothstep( 0.11, 0.24, sbRingPhase ) );
  sbCol = mix( sbCol, sbSeptaCol, sbRingLine * 0.48 * smoothstep( 0.18, 0.35, sbOuterR ) );

  // 側線下の血合い（左右のくさび帯）
  float sbLatDist = abs( sbYNorm - sbLatRatio * 0.72 );
  float sbChiaiSide = exp( -( sbLatDist * sbLatDist ) / ( 0.032 + 0.025 * uChiaiStrength ) )
    * smoothstep( 0.32, 0.92, sbZNorm ) * uChiaiStrength;
  float sbChiaiSpine = exp( -pow( ( sbRadSpine - sbSpineR * 1.25 ) / max( sbSpineR * 1.1, 0.08 ), 2.0 ) )
    * 0.45 * uChiaiStrength;
  float sbChiaiMask = clamp( sbChiaiSide * 0.95 + sbChiaiSpine, 0.0, 1.0 );
  sbCol = mix( sbCol, uChiaiColor, sbChiaiMask * 0.86 );

  // 頭側の切断面では腹腔の位置にほのかな深い陰影
  if ( sbS < uHeadLen + 0.08 && sbDy < -sbSpineR * 1.35 ) {
    float cavZone = ( 1.0 - smoothstep( 0.30, 0.62, sbZNorm ) ) * smoothstep( -0.18, -0.45, sbYNorm ) * ( 1.0 - smoothstep( -0.78, -0.96, sbYNorm ) );
    sbCol = mix( sbCol, vec3( 0.14, 0.06, 0.06 ), cavZone * 0.52 );
  }

  // 下の血合い（背大動脈・血道弓の暗い赤点）
  float sbBloodDot = 1.0 - smoothstep( sbSpineR * 0.28, sbSpineR * 0.68, length( vec2( sbDy + sbSpineR * 1.28, vFlfPos.z * 1.15 ) ) );
  sbCol = mix( sbCol, vec3( 0.16, 0.022, 0.028 ), sbBloodDot * 0.94 );

  // 脊髄の小さな点（椎体のすぐ上）
  float sbCordDot = 1.0 - smoothstep( sbSpineR * 0.14, sbSpineR * 0.36, length( vec2( sbDy - sbSpineR * 1.18, vFlfPos.z * 1.25 ) ) );
  sbCol = mix( sbCol, vec3( 0.18, 0.14, 0.14 ), sbCordDot * 0.85 );
  float sbCordCenter = 1.0 - smoothstep( sbSpineR * 0.05, sbSpineR * 0.18, length( vec2( sbDy - sbSpineR * 1.18, vFlfPos.z * 1.25 ) ) );
  sbCol = mix( sbCol, vec3( 0.88, 0.84, 0.78 ), sbCordCenter * 0.70 );

  // 中央の白い椎体の円（象牙色＋年輪状の中心）
  float sbVertRing = 1.0 - smoothstep( sbSpineR * 0.82, sbSpineR * 1.02, sbRadSpine );
  float sbVertRim = smoothstep( sbSpineR * 0.72, sbSpineR * 0.92, sbRadSpine ) * ( 1.0 - smoothstep( sbSpineR * 0.94, sbSpineR * 1.12, sbRadSpine ) );
  float sbVertCore = 1.0 - smoothstep( 0.0, sbSpineR * 0.38, sbRadSpine );
  vec3 sbBoneCol = mix( vec3( 0.86, 0.81, 0.69 ), vec3( 0.74, 0.68, 0.56 ), sbVertCore * 0.55 );
  sbCol = mix( sbCol, sbBoneCol * 0.75, sbVertRim * 0.55 );
  sbCol = mix( sbCol, sbBoneCol, sbVertRing * 0.96 );
  sbRoughDelta += sbVertRing * 0.18;

  // 外周の皮ぎわの薄い白縁
  float sbSkinRim = smoothstep( 0.90, 0.99, sbOuterR );
  sbCol = mix( sbCol, vec3( 0.86, 0.88, 0.90 ), sbSkinRim * 0.35 );

  // 微細凹凸
  sbPerturbFlf = vec3( 0.0, ( sbDetC.a - 0.5 ) * 0.14, ( sbDetS.a - 0.5 ) * 0.14 );
  ` : /* glsl */ `
  // === 身（vSeg 1:S面, 2:H面, 4:外側の身） ===
  if ( vSeg < 1.5 ) {
    // S面（背骨沿いの垂直切り口）：くの字 / W字の筋節縞＋背骨際の厚い血合い
    float ay = abs( sbYNorm );
    float chevron = uMaxDepth * ( 0.30 * ay - 0.11 * sin( ay * 3.14159265 ) - 0.07 * ay * ay );
    float warp = ( sbCollagen - 0.5 ) * sbPitch * 0.28 + ( sbFiber - 0.5 ) * sbPitch * 0.10;
    float phase = fract( ( vFlfPos.x - chevron + warp ) / sbPitch );
    float aa = clamp( fwidth( vFlfPos.x / sbPitch ), 0.015, 0.26 );
    float septaW = 0.08 + 0.05 * sbCollagen;
    float septa = smoothstep( 0.0, septaW + aa, phase ) * ( 1.0 - smoothstep( septaW + 0.02, septaW * 2.3 + aa, phase ) );
    // 筋節ブロック内の生身らしい微細な色勾配と繊維感
    float blockShade = 0.91 + 0.14 * smoothstep( 0.12, 0.88, phase );
    sbCol *= blockShade;
    sbCol = mix( sbCol, sbSeptaCol, septa * ( 0.34 + 0.14 * sbFiber ) );

    // 血合い（側線の高さ・背骨のそばで厚い暗い赤の帯）
    float distLat = abs( sbYNorm - sbLatRatio * 0.42 );
    float spineBand = exp( -( sbYNorm * sbYNorm ) / ( 0.055 + 0.040 * uChiaiStrength ) );
    float latBand = exp( -( distLat * distLat ) / ( 0.042 + 0.028 * uChiaiStrength ) );
    float chiaiNoise = 0.74 + 0.44 * sbDetS.r;
    float chiai = clamp( max( spineBand * 0.96, latBand * 0.80 ) * chiaiNoise * uChiaiStrength, 0.0, 1.0 );
    chiai = clamp( chiai * mix( 0.85, 1.20, smoothstep( 0.35, 0.88, sbS ) ), 0.0, 0.96 );
    sbCol = mix( sbCol, uChiaiColor, chiai * 0.90 );
    sbCol = mix( sbCol, mix( uChiaiColor, sbSeptaCol, 0.36 ), septa * chiai * 0.28 );

    // 筋節のわずかな立体凹凸
    float grooveSlope = ( smoothstep( 0.0, 0.10, phase ) - smoothstep( 0.10, 0.25, phase ) ) * 0.24;
    sbPerturbFlf = vec3( grooveSlope, ( sbDetS.a - 0.5 ) * 0.14, 0.0 );
    sbRoughDelta = -0.06 + septa * 0.05;
  } else if ( vSeg < 2.5 ) {
    // H面（背と腹を分ける水平切り口）：弧を描く筋節＋血合い帯
    float arc = uMaxDepth * 0.24 * ( 1.0 - sbZNorm * sbZNorm );
    float warp = ( sbCollagen - 0.5 ) * sbPitch * 0.24;
    float phase = fract( ( vFlfPos.x - arc + warp ) / sbPitch );
    float aa = clamp( fwidth( vFlfPos.x / sbPitch ), 0.015, 0.26 );
    float septa = smoothstep( 0.0, 0.09 + aa, phase ) * ( 1.0 - smoothstep( 0.11, 0.24 + aa, phase ) );
    sbCol *= ( 0.92 + 0.12 * smoothstep( 0.12, 0.88, phase ) );
    sbCol = mix( sbCol, sbSeptaCol, septa * ( 0.32 + 0.12 * sbFiber ) );

    // 皮ぎわの血合いくさび＋背骨寄りの血合い
    float outerChiai = smoothstep( 0.50, 0.92, sbZNorm ) * uChiaiStrength;
    float innerChiai = ( 1.0 - smoothstep( 0.10, 0.38, sbZNorm ) ) * 0.68 * uChiaiStrength;
    float chiai = clamp( max( outerChiai, innerChiai ) * ( 0.78 + 0.32 * sbFiber ), 0.0, 0.95 );
    sbCol = mix( sbCol, uChiaiColor, chiai * 0.88 );

    float grooveSlope = ( smoothstep( 0.0, 0.10, phase ) - smoothstep( 0.10, 0.25, phase ) ) * 0.20;
    sbPerturbFlf = vec3( grooveSlope, 0.0, ( sbDetS.a - 0.5 ) * 0.12 );
    sbRoughDelta = -0.05;
  } else {
    // 外側の身（aSeg == 4、皮を引いた面）：滑らかな生の艶＋体側中央の血合いと銀皮
    float ay = abs( sbYNorm );
    float chevron = uMaxDepth * ( 0.26 * ay - 0.08 * sin( ay * 3.14159265 ) );
    float phase = fract( ( vFlfPos.x - chevron + ( sbCollagen - 0.5 ) * sbPitch * 0.2 ) / sbPitch );
    float faintSepta = smoothstep( 0.0, 0.11, phase ) * ( 1.0 - smoothstep( 0.13, 0.28, phase ) );
    sbCol = mix( sbCol, sbSeptaCol, faintSepta * 0.18 );

    // 表層血合いの帯（側線付近）＋皮引き後に残る繊細な銀皮の艶
    float latDist = abs( sbYNorm - sbLatRatio * 0.58 );
    float chiaiBand = exp( -( latDist * latDist ) / ( 0.044 + 0.032 * uChiaiStrength ) ) * uChiaiStrength;
    sbCol = mix( sbCol, uChiaiColor * 1.10, clamp( chiaiBand * ( 0.82 + 0.28 * sbFiber ), 0.0, 0.92 ) * 0.84 );

    float silverMembrane = exp( -( latDist * latDist ) / 0.080 ) * ( 0.28 + 0.18 * smoothstep( 0.2, 0.8, sbCollagen ) );
    sbCol = mix( sbCol, vec3( 0.76, 0.80, 0.82 ), silverMembrane * 0.55 );
    sbMetalDelta += silverMembrane * 0.38;
    sbRoughDelta = -0.10 - silverMembrane * 0.06;
    sbPerturbFlf = vec3( 0.0, ( sbDetS.a - 0.5 ) * 0.06, ( sbDetC.a - 0.5 ) * 0.06 );

    // 外側の身にも切り込みを描く（皮を引いた後や深い切り）
    if ( uIncisionCount > 0 ) {
      float incGroove, incLip;
      vec3 incGrad;
      float pxCm = max( length( fwidth( vFlfPos ) ), 0.004 );
      sbEvalIncisions( vFlfPos, nFlf, pxCm, true, incGroove, incLip, incGrad );
      if ( incGroove > 0.001 || incLip > 0.001 ) {
        vec3 lipCol = sbCol * 1.14 + vec3( 0.04, 0.025, 0.02 );
        vec3 grooveCol = vec3( 0.16, 0.022, 0.026 );
        sbCol = mix( sbCol, lipCol, incLip * 0.36 );
        sbCol = mix( sbCol, grooveCol, incGroove * 0.88 );
        sbRoughDelta += incGroove * 0.22;
        sbPerturbFlf += incGrad * 0.75;
      }
    }
  }
  `}

  diffuseColor.rgb = sbCol;
  `;

  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', fleshFx);
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <roughnessmap_fragment>',
    'roughnessFactor = clamp( roughnessFactor + sbRoughDelta, 0.08, 0.92 );',
  );
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <metalnessmap_fragment>',
    'metalnessFactor = clamp( metalnessFactor + sbMetalDelta, 0.0, 0.55 );',
  );

  const applyFleshNormalAndSss = /* glsl */ `
  mat3 sbNm = mat3( vNm0, vNm1, vNm2 );
  if ( dot( sbPerturbFlf, sbPerturbFlf ) > 1e-8 ) {
    vec3 sbViewP = sbNm * sbPerturbFlf;
    sbViewP -= normal * dot( sbViewP, normal );
    normal = normalize( normal + sbViewP );
  }
  vec3 sbViewDir = normalize( vViewPosition );
  float sbNdotV = clamp( abs( dot( normal, sbViewDir ) ), 0.0, 1.0 );
  float sbRim = pow( 1.0 - sbNdotV, 2.3 );
  ${isLight ? '' : `
  // 生身のうっすらとした透け（縁の柔らかい暖色散乱）
  vec3 sbSssTint = mix( uFleshBase, vec3( 0.95, 0.48, 0.40 ), 0.35 );
  sbEmissiveAdd += sbSssTint * sbRim * 0.11 * ( 1.0 - uXray * 0.6 );
  `}
  if ( uXray > 0.001 ) {
    float alphaX = mix( 1.0, 0.13 + 0.14 * sbRim, uXray );
    diffuseColor.a *= alphaX;
    sbEmissiveAdd += uFleshBase * sbRim * uXray * 0.18;
  }
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <normal_fragment_maps>', applyFleshNormalAndSss);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <emissivemap_fragment>', 'totalEmissiveRadiance += sbEmissiveAdd;');
}

/** 骨のシェーダー差し込み（象牙色の繊細な雑音・わずかな透け・透視時の明るい強調）。 */
export function patchBoneShader(shader, { quality = 'standard', uniforms }) {
  Object.assign(shader.uniforms, uniforms);
  const isLight = quality === 'light';

  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', VERT_PARS);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', VERT_BODY);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', FRAG_COMMON_PARS);

  const boneFx = /* glsl */ `
  ${isLight ? `
  float sbGrain = 0.5 + 0.08 * sin( vFlfPos.x * 9.0 + vFlfPos.y * 5.0 );
  ` : `
  float sbGrain = sbNoise3( vFlfPos * vec3( 2.8, 7.5, 7.5 ) );
  float sbFine = sbNoise3( vFlfPos * 16.0 );
  sbGrain = mix( sbGrain, sbFine, 0.35 );
  `}
  // 椎体・棘の繊細な象牙色むら（軟骨の先端ほどわずかに白み）
  diffuseColor.rgb *= ( 0.92 + 0.16 * sbGrain );
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', boneFx);

  const boneRim = /* glsl */ `
  vec3 sbViewDir = normalize( vViewPosition );
  float sbRim = pow( 1.0 - clamp( abs( dot( normal, sbViewDir ) ), 0.0, 1.0 ), 2.2 );
  // 骨のわずかな透け感＋透視モード時のくっきりした象牙色の浮き上がり
  totalEmissiveRadiance += diffuseColor.rgb * ( 0.06 * sbRim + uXray * ( 0.24 + 0.20 * sbRim ) );
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <emissivemap_fragment>', boneRim);
}

/** 内臓・背わたのシェーダー差し込み（湿潤な有機むら・血管ニュアンス・透視時の明るさ）。単一プログラムで共有。 */
export function patchOrganShader(shader, { quality = 'standard', organMode = 0, uniforms }) {
  Object.assign(shader.uniforms, uniforms);
  shader.uniforms.uOrganMode = { value: organMode };
  const isLight = quality === 'light';

  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', VERT_PARS);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', VERT_BODY);
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <common>',
    `${FRAG_COMMON_PARS}\nuniform float uOrganMode;`,
  );

  const organFx = /* glsl */ `
  float sbOrgN = ${isLight ? '0.5' : 'sbNoise3( vFlfPos * 4.5 )'};
  float sbOrgVein = ${isLight ? '0.0' : 'smoothstep( 0.62, 0.80, sbNoise3( vFlfPos * vec3( 7.0, 14.0, 10.0 ) ) )'};
  if ( uOrganMode > 1.5 ) {
    // 背わた
    diffuseColor.rgb *= ( 0.80 + 0.36 * sbOrgN );
  } else if ( uOrganMode > 0.5 ) {
    // 鰾（真珠銀）
    diffuseColor.rgb *= ( 0.93 + 0.14 * sbOrgN );
  } else {
    // 腸・胃・肝臓
    diffuseColor.rgb *= ( 0.88 + 0.22 * sbOrgN );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.72, 0.48, 0.50 ), sbOrgVein * 0.32 );
  }
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', organFx);

  const organRim = /* glsl */ `
  vec3 sbViewDir = normalize( vViewPosition );
  float sbRim = pow( 1.0 - clamp( abs( dot( normal, sbViewDir ) ), 0.0, 1.0 ), 2.2 );
  if ( uOrganMode > 0.5 && uOrganMode < 1.5 ) {
    totalEmissiveRadiance += vec3( 0.12, 0.15, 0.17 ) * sbRim + diffuseColor.rgb * uXray * 0.24;
  } else {
    totalEmissiveRadiance += diffuseColor.rgb * ( 0.06 * sbRim + uXray * ( 0.20 + 0.16 * sbRim ) );
  }
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <emissivemap_fragment>', organRim);
}

/** 虹彩（iris）のシェーダー差し込み（放射状の金銀繊維・外周の暗い輪・生鮮な輝き）。 */
export function patchIrisShader(shader, { uniforms }) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', VERT_PARS);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', VERT_BODY);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', FRAG_COMMON_PARS);

  const irisFx = /* glsl */ `
  // 眼球の側面法線から中心（±z）と外縁（リム）を測る
  vec3 sbN = normalize( vFlfNormal );
  float sbFront = clamp( abs( sbN.z ), 0.0, 1.0 );
  float sbAng = atan( sbN.y, sbN.x );
  float sbRadRays = 0.5 + 0.5 * sin( sbAng * 32.0 + sin( sbAng * 9.0 ) * 1.6 );
  // 内側に温かみのある金銀の虹彩環、外周に引き締まった暗色リム（眼窩との境）
  float sbGoldRing = smoothstep( 0.46, 0.86, sbFront );
  float sbOuterLimb = 1.0 - smoothstep( 0.14, 0.52, sbFront );
  vec3 sbWarmGold = mix( diffuseColor.rgb, vec3( 0.88, 0.76, 0.46 ), 0.48 );
  diffuseColor.rgb = mix( diffuseColor.rgb * 0.86, sbWarmGold, sbGoldRing * ( 0.62 + 0.38 * sbRadRays ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.08, 0.12, 0.15 ), sbOuterLimb * 0.76 );
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', irisFx);
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    '#include <emissivemap_fragment>',
    'totalEmissiveRadiance += diffuseColor.rgb * 0.12;',
  );
}

/** ヒレ膜（fin）のシェーダー差し込み（放射状のすじ・根元から先への半透明グラデ・透視減衰）。 */
export function patchFinShader(shader, { quality = 'standard', uniforms }) {
  Object.assign(shader.uniforms, uniforms);
  const isLight = quality === 'light';

  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', VERT_PARS);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', VERT_BODY);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', FRAG_COMMON_PARS);

  const finFx = /* glsl */ `
  // fins.js の loft UV: vRawUv.x = 鰭条に沿った並び(0..1), vRawUv.y = 断面(0,0.75:根元 / 0.25,0.5:先端)
  float sbTip = smoothstep( 0.06, 0.36, sin( vRawUv.y * 3.14159265 ) );
  float sbRayWave = 0.5 + 0.5 * cos( vRawUv.x * 165.0 );
  float sbRaySharp = pow( sbRayWave, 2.4 );
  ${isLight ? '' : `
  float sbFineRay = 0.5 + 0.5 * cos( vRawUv.x * 330.0 + sbTip * 1.2 );
  sbRaySharp = mix( sbRaySharp, sbFineRay, 0.25 );
  `}
  // 根元はやや不透明で体色になじみ、先端は繊細に透け、放射状のすじが浮かぶ
  vec3 sbRayCol = diffuseColor.rgb * 0.72;
  vec3 sbWebCol = mix( diffuseColor.rgb * 1.12, vec3( 0.86, 0.89, 0.86 ), 0.22 * sbTip );
  diffuseColor.rgb = mix( sbWebCol, sbRayCol, sbRaySharp * ( 0.42 + 0.22 * ( 1.0 - sbTip ) ) );
  // 先端にほんのわずかな暗い縁取り
  float sbEdgeDark = smoothstep( 0.78, 0.98, sbTip );
  diffuseColor.rgb *= ( 1.0 - sbEdgeDark * 0.14 );

  float sbBaseAlpha = mix( 0.86, 0.54, sbTip ) + sbRaySharp * 0.16;
  diffuseColor.a *= clamp( sbBaseAlpha, 0.35, 0.94 ) * mix( 1.0, 0.34, uXray );
  `;
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', finFx);
}
