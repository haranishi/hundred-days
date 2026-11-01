// OWNER: world-art
// 地面：白砂（細かい粒の揺らぎ・掃き目の帯）・石畳（目地のある切石）・苔（濃い緑の斑）・土。
// 種類は worldMap の地図 A、接地の暗がり・水際・掃き目は地図 B から引き、模様はすべてシェーダーで描く（形を増やさない）。
// 細かい模様は画素の幅（fw）で弱め、遠くでは平均の色へ落ち着かせる（ちらつかせない）。
// r08-world-周2: 石畳には CC0 の岩の写真の明るさの比と法線を重ねる（photoTex.ts。白砂・苔・土は手続きのまま）。
import { Mesh, PlaneGeometry, Vector3, Vector4 } from 'three';
import type { StageDef } from '../../stage/types';
import { kgMaterial } from '../render/materials';
import { LOOK } from './look';
import { photoPatch } from './photoTex';

const G = LOOK.ground;
const PG = LOOK.photo.ground;
const f4 = (x: number): string => x.toFixed(4);

const FRAGMENT_PARS = /* glsl */ `
uniform vec4 uKgPond;
uniform vec3 uKgGravel;
uniform vec3 uKgStoneC;
uniform vec3 uKgMossDark;
uniform vec3 uKgMossLight;
uniform vec3 uKgDirt;
uniform vec4 uKgStreet;
uniform vec4 uKgTempleBox;
uniform vec4 uKgBamboo;   // 竹林の長方形 x0, z0, x1, z1
uniform float uKgPathX;   // 獣道の x
uniform vec4 uKgGroundWeather; // 砂紋の乱れ、湿りの暗さ、湿った粗さ、石の縁の高さ
float kgStoneRelief = 0.0;
#ifdef KG_TEX_GROUND
// r08-world-周2: 地面の xz の画面上の変化（材質の枝分かれの外で求め、石畳の写真のミップの選びに使う）
vec2 kgDxz = vec2(0.0);
vec2 kgDyz = vec2(0.0);
#endif

// 竹の落ち葉：細長い乾いた葉の斑（奥ほど厚く、獣道は踏まれて薄い）。白砂や苔の上に重ねる
// r01-world-周2: 指摘「竹林の床が青白い白砂のままで竹林らしくない」
float kgLitter(vec2 p, float fw, out vec3 col) {
  vec4 r = uKgBamboo;
  float inside = smoothstep(r.x - 0.6, r.x + 0.8, p.x) * (1.0 - smoothstep(r.z - 0.8, r.z + 0.9, p.x))
               * smoothstep(r.y - 0.6, r.y + 0.8, p.y) * (1.0 - smoothstep(r.w - 0.8, r.w + 1.2, p.y));
  if (inside <= 0.0) { col = vec3(0.0); return 0.0; }
  float path = 1.0 - smoothstep(0.35, 0.95, abs(p.x - (uKgPathX + sin(p.y * 0.35) * 0.35)));
  // 葉の形：格子ごとに向きを変えた細長い楕円を2層
  float leaves = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 q = p * (k == 0 ? 7.0 : 11.0) + float(k) * 13.7;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float a = kgHash12(cell) * 6.2831853;
    vec2 d = vec2(cos(a) * f.x + sin(a) * f.y, -sin(a) * f.x + cos(a) * f.y);
    float e = length(d * vec2(1.0, 4.5));
    leaves = max(leaves, (1.0 - smoothstep(0.32, 0.45, e)) * step(0.25, kgHash12(cell + 3.1)));
  }
  float fine = 1.0 - smoothstep(0.015, 0.05, fw);
  float cover = inside * (0.7 + 0.3 * kgFbm(p * 0.6, 3)) * (1.0 - 0.6 * path);
  // 落ち葉の層（ほぼ覆う）の上に、一枚ずつの葉の明暗
  col = mix(vec3(0.085, 0.075, 0.05), vec3(0.19, 0.16, 0.095), mix(0.45, leaves * kgHash12(floor(p * 9.0) + 0.5), fine));
  col = mix(col, uKgDirt * 0.8, path * 0.6);
  return clamp(cover * (0.82 + 0.18 * leaves), 0.0, 1.0);
}

// 白砂：2cm の粒・10cm の固まり・数 m の斑・黒い粒（雲母）。
// 砂紋：物（植え込み・松・灯り・石畳・建物・塀）のまわりの帯は、その縁に沿う筋（輪）。帯の外は東西の筋。
// 見回りの道（地図 C）は踏み荒らされて、筋が乱れ、少し暗く締まる。
// 物の形と帯は worldMap が距離の地図（uKgMapR）に焼いてある（画素ごとに物を数えない）
uniform vec3 uKgRake;               // 間隔, 深さ, 0

void kgGravel(vec2 p, float fw, float wear, out vec3 alb, out float rough, out vec2 grad) {
  float f1 = 1.0 - smoothstep(0.012, 0.045, fw);
  float f2 = 1.0 - smoothstep(0.06, 0.25, fw);
  vec3 n1 = kgNoiseD(p * 46.0);
  vec3 n2 = kgNoiseD(p * 8.5 + 3.7);
  float m = kgFbm(p * 0.32, 3) - 0.5;
  float sp = step(0.94, kgHash12(floor(p * 52.0))) * f1;
  alb = uKgGravel * (1.0 + 0.2 * (n1.x - 0.5) * f1 + 0.09 * (n2.x - 0.5) * f2 + 0.12 * m) * (1.0 - 0.5 * sp);
  grad = n1.yz * 46.0 * 0.0012 * f1 + n2.yz * 8.5 * 0.0045 * f2;
  rough = 0.86;
  // ---- 砂紋 ----
  vec4 rk = kgMapR(p);
  bool ring = rk.r < rk.a;
  float sp_ = uKgRake.x;
  float ph = ring ? max(rk.r, 0.0) / sp_ : p.y / sp_;
  vec2 dph = ring ? normalize(rk.gb + vec2(1e-5)) / sp_ : vec2(0.0, 1.0 / sp_);
  // 踏み荒らし：筋をゆがめ、弱める
  float wn = kgNoise(p * 2.3) - 0.5;
  ph += wear * wn * 3.0;
  float scuff = smoothstep(0.38, 0.7, kgNoise(p * 0.8 + 23.0)) * uKgGroundWeather.x;
  float intact = (1.0 - 0.8 * wear) * (1.0 - scuff);
  float fade = (1.0 - smoothstep(0.22, 0.55, fw / sp_)) * intact;
  float c = cos(6.2831853 * ph);
  float s = sin(6.2831853 * ph);
  // 山（c=1）は明るく、谷は暗い。傾きは高さ depth*(0.5+0.5c) の微分
  // r02-fix-visual: 指摘「遠目では砂紋が消えて一様な面」 溝の陰を濃く 0.075→0.1。細い筋が画素より細くなる所では、
  // 4本ごとの太い筋（熊手の運びの継ぎ目）と 12 本ごとの帯を重ね、遠目でも輪と筋の向きが残るようにする
  alb *= 1.0 + fade * (0.1 * c - 0.03);
  grad += -uKgRake.y * 0.5 * 6.2831853 * s * dph * fade;
  float wfar = intact * smoothstep(0.12, 0.4, fw / sp_);
  float f4 = (1.0 - smoothstep(0.2, 0.5, fw / (sp_ * 4.0))) * wfar;
  float f12 = (1.0 - smoothstep(0.2, 0.5, fw / (sp_ * 12.0))) * wfar;
  alb *= 1.0 + 0.085 * f4 * cos(6.2831853 * ph / 4.0) + 0.06 * f12 * cos(6.2831853 * ph / 12.0);
  // 踏まれた所：締まって少し暗く、足跡のくぼみの斑
  float prints = kgNoise(p * 4.5 + 17.0);
  alb *= 1.0 - wear * (0.1 + 0.12 * smoothstep(0.55, 0.8, prints));
}

// 石畳：通り道に沿った切石（幅 0.7m の列、長さ 0.95m、列ごとにずらす）。目地は暗く、石ごとに色と傾きを変える
void kgStone(vec2 p, float fw, out vec3 alb, out float rough, out vec2 grad) {
  float cw = 0.7;
  float col = floor((p.x + 1.4) / cw);
  float off = kgHash12(vec2(col, 3.1)) * 0.95;
  float len = 0.95 + 0.25 * kgHash12(vec2(col, 7.7));
  float rowi = floor((p.y + off) / len);
  vec2 cell = vec2(col, rowi);
  float lx = fract((p.x + 1.4) / cw);
  float lz = fract((p.y + off) / len);
  float chip = (kgNoise(p * 17.0 + cell) - 0.5) * 0.025 * (1.0 - smoothstep(0.04, 0.1, fw));
  float e = min(min(lx, 1.0 - lx) * cw, min(lz, 1.0 - lz) * len) + chip;
  float jw = 0.012;
  float joint = 1.0 - smoothstep(jw, jw + max(fw * 0.8, 0.008), e);
  float bevel = 1.0 - smoothstep(jw, jw + 0.05, e);
  float h = kgHash12(cell);
  float speck = (kgNoise(p * 38.0) - 0.5) * (1.0 - smoothstep(0.015, 0.05, fw));
  alb = uKgStoneC * (0.78 + 0.36 * h) * (1.0 + 0.1 * (kgNoise(p * 4.0 + h * 9.0) - 0.5) + 0.25 * speck);
  alb *= mix(1.0, 0.28, joint);
  alb *= 1.0 - 0.18 * bevel;
  float moss = joint * smoothstep(0.36, 0.7, kgNoise(p * 2.2 + 29.0));
  alb = mix(alb, uKgMossDark * 0.8, moss * 0.7);
  vec3 relief = kgNoiseD(p * 6.5 + h * 13.0);
  float fine = 1.0 - smoothstep(0.04, 0.12, fw);
  grad = (kgHash22(cell) - 0.5) * 0.035 + relief.yz * 0.028 * fine;
  kgStoneRelief = uKgGroundWeather.w * smoothstep(jw, jw + 0.06, e) * (1.0 - smoothstep(0.08, 0.2, fw));
  rough = mix(0.62 + 0.18 * h, 0.96, joint);
#ifdef KG_TEX_GROUND
  // r08-world-周2: 岩の写真（明るさの比と法線）。石ごとに写真の位置と向きを変える。写真の位置が飛ぶ所は目地の中
  // r08-world-周3: 指摘「石1つの中に写真の大きな明暗の境が出る」 石ごとに、明暗の境を含まない窓（KG_ROCK_PATH）を1つ選び、
  // 石の中の位置（左右・前後の裏返しつき）をその窓へ写す。比の分母はその窓の平均（石ごとの平均の比が 1）
  {
    vec3 win = KG_ROCK_PATH[min(int(kgHash12(cell + 17.3) * float(KG_ROCK_PATHS)), KG_ROCK_PATHS - 1)];
    vec2 hs = kgHash22(cell * 1.31 + 5.7);
    vec2 sg = vec2(hs.x < 0.5 ? -1.0 : 1.0, hs.y < 0.5 ? -1.0 : 1.0);
    float k = ${f4(1 / PG.tile)};
    vec2 l = vec2(lx * cw, lz * len) * k;
    vec2 pp = win.xy + vec2(sg.x > 0.0 ? l.x : KG_ROCK_PATH_SIZE.x - l.x, sg.y > 0.0 ? l.y : KG_ROCK_PATH_SIZE.y - l.y);
    vec2 dpx = sg * kgDxz * k;
    vec2 dpy = sg * kgDyz * k;
    float w = kgTexFade(dpx, dpy, vec2(${f4(PG.fade[0])}, ${f4(PG.fade[1])})) * uKgTexGate.w;
    if (w > 0.0) {
      float ratio = kgTexLum(textureGrad(uKgTexRockD, pp, dpx, dpy).rgb) / win.z;
      alb *= clamp(1.0 + ${f4(PG.strength)} * w * (ratio - 1.0), 0.4, 1.8);
      // 写真の傾きを世界の xz の傾きへ（pp は xz の裏返し ÷ tile なので、xz の傾き＝裏返し・写真の傾き）
      grad += w * ${f4(PG.normal)} * (kgTexSlope(textureGrad(uKgTexRockN, pp, dpx, dpy).rgb) * sg);
    }
  }
#endif
}

// 苔：濃い緑の斑（1m）と、こんもりした房（20cm）、細かい房、ところどころ土が出る。夜露で所々わずかに艶
void kgMoss(vec2 p, float fw, float wear, out vec3 alb, out float rough, out vec2 grad) {
  float f3 = 1.0 - smoothstep(0.02, 0.09, fw);
  float f2 = 1.0 - smoothstep(0.06, 0.2, fw);
  float m1 = kgFbm(p * 0.85, 4);
  float m2 = kgFbm(p * 3.6 + 7.0, 3);
  vec3 cush = kgNoiseD(p * 5.0 + 3.0);
  vec3 n3 = kgNoiseD(p * 21.0);
  vec3 a = mix(uKgMossDark, uKgMossLight, smoothstep(0.3, 0.75, m1));
  // 房の頂は明るく、間は暗い（こんもりした苔の起伏）
  a *= (0.72 + 0.5 * m2) * mix(1.0, 0.65 + 0.6 * cush.x, f2) * (1.0 + 0.3 * (n3.x - 0.5) * f3);
  float bare = smoothstep(0.64, 0.8, kgFbm(p * 0.5 + 31.0, 3));
  a = mix(a, uKgDirt * 0.7, bare * 0.75);
  alb = a;
  vec3 c = kgNoiseD(p * 1.7 + 11.0);
  grad = n3.yz * 21.0 * 0.0035 * f3 + c.yz * 1.7 * 0.03 + cush.yz * 5.0 * 0.012 * f2;
  float dew = smoothstep(0.6, 0.85, kgFbm(p * 1.3 + 51.0, 3));
  rough = mix(0.93, 0.55, dew * (1.0 - bare));
  // r01-world-周2: 指摘「苔の野原に起伏が無い」 2〜4m の塚（ゆるい傾き）を足す
  vec3 mound = kgNoiseD(p * 0.3 + 5.0);
  grad += mound.yz * 0.3 * 0.22;
  // 見回りの道は踏まれて苔が剥げ、土が出る
  alb = mix(alb, uKgDirt * (0.65 + 0.25 * kgNoise(p * 3.0)), wear * 0.75);
  rough = mix(rough, 0.9, wear);
}

// 土：踏み固めた土の斑と小石
void kgDirt(vec2 p, float fw, out vec3 alb, out float rough, out vec2 grad) {
  float f2 = 1.0 - smoothstep(0.03, 0.12, fw);
  float m = kgFbm(p * 0.55, 4);
  vec3 n2 = kgNoiseD(p * 13.0);
  float peb = step(0.965, kgHash12(floor(p * 18.0))) * f2;
  alb = uKgDirt * (0.76 + 0.42 * m + 0.16 * (n2.x - 0.5) * f2) * (1.0 + 0.6 * peb);
  grad = n2.yz * 13.0 * 0.004 * f2;
  rough = 0.9;
  // r03-fix-visual: 指摘「開始の画面の大半を占める通りが一様な面」 寺の土塀の外の通りだけ、大きな土のむら・轍・水たまりの湿り
  bool kgInTemple = p.x > uKgTempleBox.x && p.x < uKgTempleBox.z && p.y > uKgTempleBox.y && p.y < uKgTempleBox.w;
  if (!kgInTemple) {
    float dS = abs(p.y - uKgStreet.x);
    float dN = abs(p.y - uKgStreet.y);
    float dW = abs(p.x - uKgStreet.z);
    float dE = abs(p.x - uKgStreet.w);
    // いちばん近い通りの、横切る向きの座標と沿う向きの座標
    bool ew = min(dS, dN) < min(dW, dE);
    float across = ew ? p.y - (dS < dN ? uKgStreet.x : uKgStreet.y) : p.x - (dW < dE ? uKgStreet.z : uKgStreet.w);
    float along = ew ? p.x : p.y;
    float wob = (kgNoise(vec2(along * 0.06, 3.1)) - 0.5) * 1.1 + (kgNoise(vec2(along * 0.4, 8.3)) - 0.5) * 0.12;
    float ra = abs(abs(across + wob) - 0.78) / 0.14;
    float rut = exp(-ra * ra) * smoothstep(0.22, 0.5, kgNoise(vec2(along * 0.09, 7.7)));
    float big = kgFbm(p * 0.11 + vec2(11.0, 4.0), 3);
    float pud = smoothstep(0.64, 0.71, kgFbm(p * 0.32 + vec2(5.0, 1.0), 3) + 0.18 * rut);
    alb *= (0.8 + 0.4 * big) * (1.0 - 0.3 * rut) * (1.0 - 0.5 * pud);
    // 湿りは鏡にしない（低いカメラで東の白みを白い斑に映していた）
    rough = mix(rough, 0.38, pud);
    grad *= 1.0 - pud;
  }
}
`;

const COLOR = /* glsl */ `
vec2 kgXZ = vKgWorld.xz;
{
  vec2 e = (kgXZ - uKgPond.xy) / uKgPond.zw;
  if (dot(e, e) < 1.0) discard;
}
vec4 kgA = kgMapA(kgXZ);
vec4 kgB = kgMapB(kgXZ);
vec4 kgC = kgMapC(kgXZ);
float kgWear = kgC.r;
float kgFw = length(fwidth(kgXZ));
#ifdef KG_TEX_GROUND
kgDxz = dFdx(kgXZ);
kgDyz = dFdy(kgXZ);
#endif
vec3 kgAlb = vec3(0.0);
float kgRough = 0.0;
vec2 kgGrad = vec2(0.0);
{
  vec3 a; float r; vec2 g;
  float wsum = 0.0;
  if (kgA.x > 0.004) { kgGravel(kgXZ, kgFw, kgWear, a, r, g); kgAlb += a * kgA.x; kgRough += r * kgA.x; kgGrad += g * kgA.x; wsum += kgA.x; }
  if (kgA.y > 0.004) { kgMoss(kgXZ, kgFw, kgWear, a, r, g); kgAlb += a * kgA.y; kgRough += r * kgA.y; kgGrad += g * kgA.y; wsum += kgA.y; }
  if (kgA.z > 0.004) { kgStone(kgXZ, kgFw, a, r, g); kgAlb += a * kgA.z; kgRough += r * kgA.z; kgGrad += g * kgA.z; wsum += kgA.z; }
  if (kgA.w > 0.004) { kgDirt(kgXZ, kgFw, a, r, g); kgAlb += a * kgA.w; kgRough += r * kgA.w; kgGrad += g * kgA.w; wsum += kgA.w; }
  wsum = max(wsum, 1e-3);
  kgAlb /= wsum; kgRough /= wsum; kgGrad /= wsum;
}
{
  vec3 lc;
  float lk = kgLitter(kgXZ, kgFw, lc);
  kgAlb = mix(kgAlb, lc, lk);
  kgRough = mix(kgRough, 0.9, lk);
  kgGrad *= 1.0 - 0.6 * lk;
}
// 壁際・建物の足元は汚れて暗い（泥はね）。水際は濡れて暗く、艶が出る
// r02-fix-visual: 指摘「白砂と塀・石の境が定規で引いたように切れる」 白砂の際は土色へ寄せる
kgAlb = mix(kgAlb, uKgDirt * 1.15, (1.0 - kgB.y) * 0.5 * kgA.x);
// r03-fix-visual: 指摘「塀と建物の足元に暗がりが無い」 足元の泥はねを濃く（0.72→0.5 倍まで）し、土色の汚れを全部の地面に寄せる
kgAlb = mix(kgAlb, uKgDirt * 0.6, (1.0 - kgB.y) * 0.35);
kgAlb *= mix(0.5, 1.0, kgB.y);
kgAlb *= 1.0 - 0.55 * kgB.w;
kgRough = mix(kgRough, 0.32, kgB.w * 0.85);
// 湿りの場所はステージから焼く。砂の中央や踏み石を鏡面の斑にしない。
float kgDamp = kgC.g * (0.45 + 0.55 * kgNoise(kgXZ * 1.3 + 41.0));
kgAlb *= 1.0 - uKgGroundWeather.y * kgDamp;
kgRough = mix(kgRough, uKgGroundWeather.z, kgDamp * (1.0 - kgA.y * 0.7));
diffuseColor.rgb = kgAlb;
`;

const NORMAL = /* glsl */ `
{
  vec3 kgNw = normalize(vec3(-kgGrad.x, 1.0, -kgGrad.y));
  normal = normalize((viewMatrix * vec4(kgNw, 0.0)).xyz);
  normal = kgBump(-vViewPosition, normal, dFdx(kgStoneRelief * kgA.z), dFdy(kgStoneRelief * kgA.z));
}
`;

const LIGHT = /* glsl */ `
// 接地の暗がりは間接光にだけ掛ける（灯りの光だまりは壁際でも明るい）
reflectedLight.indirectDiffuse *= kgB.y;
reflectedLight.indirectSpecular *= kgB.y;
`;

/** 寺の土塀の外形（x0, z0, x1, z1。塀の厚みの外側まで）。r03-fix-visual */
function templeBox(stage: StageDef): Vector4 {
  const ws = stage.walls.filter((w) => w.kind === 'dobei');
  if (ws.length === 0) return new Vector4(1e5, 1e5, -1e5, -1e5);
  const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
  const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
  const t = Math.max(...ws.map((w) => w.thickness)) / 2;
  return new Vector4(Math.min(...xs) - t, Math.min(...zs) - t, Math.max(...xs) + t, Math.max(...zs) + t);
}

/** 寺のまわりの通りの中心線（南の z、北の z、西の x、東の x）。土塀と町屋の線の中ほど。r03-fix-visual */
function streetLines(stage: StageDef): Vector4 {
  const tb = templeBox(stage);
  const ts = stage.walls.filter((w) => w.kind === 'town');
  if (ts.length === 0) return new Vector4(1e5, 1e5, 1e5, 1e5);
  const xs = ts.flatMap((w) => [w.a.x, w.b.x]);
  const zs = ts.flatMap((w) => [w.a.z, w.b.z]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return new Vector4((tb.w + z1) / 2, (tb.y + z0) / 2, (tb.x + x0) / 2, (tb.z + x1) / 2);
}

export function createGround(stage: StageDef): Mesh {
  const pond = stage.ponds[0];
  const bb = stage.bamboo[0];
  const bambooU = bb ? new Vector4(bb.rect.x0, bb.rect.z0, bb.rect.x1, bb.rect.z1) : new Vector4(1e5, 1e5, 1e5, 1e5);
  const pondU = pond
    ? new Vector4(pond.center.x, pond.center.z, pond.rx * G.pondCut, pond.rz * G.pondCut)
    : new Vector4(1e5, 1e5, 1, 1);
  // r08-world-周2: 石畳だけに岩の写真（?tex=0・?tex= に ground が無いときは空で、周1までと同じシェーダー）
  const photo = photoPatch(['ground']);
  const material = kgMaterial(
    { color: 0xffffff, roughness: 0.85, metalness: 0 },
    {
      key: 'ground',
      amb: [100, 101],
      defines: photo.defines,
      uniforms: {
        ...photo.uniforms,
        uKgPond: { value: pondU },
        uKgGravel: { value: new Vector3(...G.gravel) },
        uKgStoneC: { value: new Vector3(...G.stone) },
        uKgMossDark: { value: new Vector3(...G.mossDark) },
        uKgMossLight: { value: new Vector3(...G.mossLight) },
        uKgDirt: { value: new Vector3(...G.dirt) },
        uKgRake: { value: new Vector3(G.rake.spacing, G.rake.depth, 0) },
        uKgBamboo: { value: bambooU },
        uKgPathX: { value: -33 },
        uKgStreet: { value: streetLines(stage) },
        uKgTempleBox: { value: templeBox(stage) },
        uKgGroundWeather: { value: new Vector4(G.weather.rakeBreakup, G.weather.dampDarken, G.weather.dampRoughness, G.weather.stoneBevel) },
      },
      fragmentPars: photo.pars + FRAGMENT_PARS,
      color: COLOR,
      roughness: 'roughnessFactor = kgRough;',
      normal: NORMAL,
      light: LIGHT,
      // r02-fix-visual: 白砂の反射率を下げた（闇の砂を約 0.7 倍に）ので、灯りの光だまりだけ倍率を掛けて前の明るさへ戻す
      // 炎上の光（届く距離 34m）には掛けない（燃える書院の前の白砂が白く飛ぶため）
      pointGain: `mix(1.0, pointLight.distance < 20.0 ? ${G.poolGain.toFixed(3)} : 1.0, kgA.x)`,
    },
  );
  const geometry = new PlaneGeometry(G.size, G.size, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'ground';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
