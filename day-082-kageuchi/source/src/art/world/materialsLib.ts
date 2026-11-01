// OWNER: world-art
// 世界で共有する材質。静的な物は材質ごとに1つのジオメトリへまとめるので、見た目の違いは頂点属性 aKg で切り替える
// （x＝部位の番号、y＝種、z と w は部位ごとの値）。模様はすべてシェーダーで描き、画素より細かくなったら平均の色へ落とす。
// r08-world: 木・漆喰・土・石には CC0 の写真の明るさの比と法線の凹凸を重ねる（photoTex.ts。形はシェーダーのまま）。
import { DoubleSide, Vector3, type MeshStandardMaterial } from 'three';
import { kgMaterial } from '../render/materials';
import type { RGB } from '../render/config';
import type { LampState } from './lampState';
import { LOOK } from './look';
import { PHOTO_MEAN, photoPatch } from './photoTex';

const f4 = (x: number): string => x.toFixed(4);
const fade2 = (r: [number, number]): string => `vec2(${f4(r[0])}, ${f4(r[1])})`;
const PH = LOOK.photo;

/** 材質の基本の色（線形の反射率）と粗さ。 */
export const MAT = {
  wood: [0.07, 0.048, 0.033] as RGB,
  woodLight: [0.16, 0.115, 0.075] as RGB,
  plaster: [0.66, 0.65, 0.61] as RGB,
  dobei: [0.4, 0.29, 0.15] as RGB,
  // r01-world-周1: 指摘「瓦屋根が空を映さず暗い一枚」 反射率 0.055→0.15 ＋ 金属の光沢 0.55（燻し瓦の銀色）
  tile: [0.15, 0.155, 0.17] as RGB,
  stone: [0.25, 0.245, 0.235] as RGB,
  iron: [0.035, 0.032, 0.03] as RGB,
  bronze: [0.06, 0.07, 0.055] as RGB,
  bark: [0.075, 0.05, 0.038] as RGB,
  // r01-world-周1: 指摘「松と植え込みが黒い塊」 反射率を上げる（松 0.045→0.07、植え込み 0.05→0.08 の緑）
  pine: [0.035, 0.07, 0.034] as RGB,
  bush: [0.04, 0.08, 0.036] as RGB,
  bamboo: [0.13, 0.17, 0.07] as RGB,
  bambooLeaf: [0.09, 0.13, 0.05] as RGB,
  paper: [0.62, 0.56, 0.44] as RGB,
  /** 障子・行灯・窓の紙の発光（線形、強さは aKg で掛ける） */
  glow: [1.0, 0.56, 0.24] as RGB,
};

/** 部位の番号（aKg.x）。 */
export const PART = {
  wood: { timber: 0, board: 1, lattice: 2, rafter: 3, floor: 4, grid: 5 },
  plaster: { white: 0, dobei: 1, namako: 2, town: 3 },
  tile: { roof: 0, ridge: 1, oni: 2, edge: 3 },
  stone: { cut: 0, rough: 1, wet: 2 },
  glow: { shoji: 0, window: 1, andon: 2, lantern: 3, dark: 4, townWindow: 5 },
  iron: { iron: 0, bronze: 1 },
};

const v3 = (c: RGB): Vector3 => new Vector3(c[0], c[1], c[2]);

// ---- 木：材ごとの色むら・木目・板の継ぎ目・格子・垂木 ----
const WOOD_PARS = /* glsl */ `
uniform vec3 uKgWood;
uniform vec3 uKgWoodLight;
`;
/**
 * r08-world: 杉板の写真。手続きの板 1 枚に、写真の板 1 枚の内側（継ぎ目から 7 画素空けた所）を当てる。板ごとに写真の板・裏表・
 * 上下・木目の向きの位置を種で選ぶ。明るさの比の分母はその写真の板の平均（板ごとの濃淡は手続きの値のまま）。
 * 板の境で写真の位置が飛ぶので、ミップの選びは飛ばない座標 g の変化から求める（textureGrad）。
 */
const WOOD_PHOTO = /* glsl */ `
#ifdef KG_TEX_WOOD
  {
    vec2 gdx = dFdx(g);
    vec2 gdy = dFdy(g);
    if (part == 1.0 || part == 4.0) {
      float bw = part == 4.0 ? 0.3 : 0.26; // 上の板（part 1）と床（part 4）の継ぎ目と同じ幅
      float s = g.y / bw;
      float bi = floor(s);
      float f = s - bi;
      vec2 h1 = kgHash22(vec2(bi, seed * 1.37 + 5.1));
      vec2 h2 = kgHash22(vec2(seed * 0.71 + 2.3, bi + 11.0));
      vec2 plank = KG_PLANK[min(int(h1.x * float(KG_PLANKS)), KG_PLANKS - 1)];
      float su = h1.y < 0.5 ? -1.0 : 1.0;
      float sv = h2.x < 0.5 ? -1.0 : 1.0;
      float ku = KG_PLANK_IW / bw;
      float kv = ku * ${f4(PH.wood.alongScale)};
      vec2 p = vec2(plank.x + KG_PLANK_IW * (su > 0.0 ? f : 1.0 - f), sv * g.x * kv + h2.y);
      vec2 dpx = vec2(su * ku * gdx.y, sv * kv * gdx.x);
      vec2 dpy = vec2(su * ku * gdy.y, sv * kv * gdy.x);
      float fade = kgTexFade(dpx, dpy, ${fade2(PH.wood.fade)}) * uKgTexGate.x;
      if (fade > 0.0) {
        float ratio = kgTexLum(textureGrad(uKgTexCedarD, p, dpx, dpy).rgb) / plank.y;
        c *= clamp(1.0 + ${f4(PH.wood.strength)} * fade * (ratio - 1.0), 0.35, 1.9);
        kgTexDh += fade * ${f4(PH.wood.normal)} * kgTexDhOf(textureGrad(uKgTexCedarN, p, dpx, dpy).rgb, dpx, dpy, 1.0 / ku);
      }
    }
  }
#endif
`;

const WOOD_COLOR = /* glsl */ `
float kgRoughW = 0.78;
float kgSurfaceHeight = 0.0;
#ifdef KG_TEX
vec2 kgTexDh = vec2(0.0);
#endif
{
  float part = floor(vKg.x + 0.5);
  float seed = vKg.y;
  vec2 uv = vKgUv;
  vec2 g = vKg.z > 0.5 ? uv : uv.yx;
  vec2 fwv = fwidth(uv);
  float fw = max(fwv.x, fwv.y);
  float fine = 1.0 - smoothstep(0.004, 0.02, fw);
  float grain = kgNoise(vec2(g.x * 0.7, g.y * 24.0) + seed * 13.0);
  float grain2 = kgNoise(vec2(g.x * 2.5, g.y * 80.0) + seed * 7.0);
  vec3 base = mix(uKgWood, uKgWoodLight, vKg.w);
  vec3 c = base * (0.72 + 0.56 * kgHash12(vec2(seed, 1.7))) * (0.8 + 0.3 * grain + 0.14 * (grain2 - 0.5) * fine);
  if (part == 1.0) {
    float s = g.y / 0.26;
    float seam = kgLine(s, 0.07, fwidth(s));
    c *= 0.8 + 0.4 * kgHash12(vec2(floor(s), seed));
    c *= 1.0 - 0.65 * seam;
  } else if (part == 2.0 || part == 5.0) {
    // 格子：縦の桟（町屋の格子）。5 は縦横の格子（本堂の蔀戸）
    // r01-world-周3: 指摘「本堂の正面が縦の棒の並び」 蔀戸は縦横の格子に
    float s = uv.x / 0.105;
    float slat = kgPulse(s, 0.58, fwidth(s));
    if (part == 5.0) {
      float t = uv.y / 0.15;
      slat = max(kgPulse(s * 0.7, 0.42, fwidth(s * 0.7)), kgPulse(t, 0.36, fwidth(t)));
    }
    // r03-fix-visual: 指摘「町屋の窓の格子が遠目で破線に見える」 上と下の面（厚み 3cm）に桟の縞が出て、見下ろすと点線になっていた。
    // 水平な面は縞の平均の色にする
    float kgFlatW = abs(normalize(cross(dFdx(vKgWorld), dFdy(vKgWorld))).y);
    slat = mix(slat, part == 5.0 ? 0.6 : 0.58, smoothstep(0.6, 0.9, kgFlatW));
    c = mix(uKgWood * 0.08, c * 1.15, slat);
    kgRoughW = mix(1.0, 0.75, slat);
  } else if (part == 3.0) {
    float s = uv.x / 0.42;
    float r = kgPulse(s, 0.4, fwidth(s));
    c = mix(c * 0.3, c * 1.05, r);
  } else if (part == 4.0) {
    float s = g.y / 0.3;
    float seam = kgLine(s, 0.05, fwidth(s));
    c *= 0.85 + 0.3 * kgHash12(vec2(floor(s), seed + 3.0));
    c *= 1.0 - 0.55 * seam;
    kgRoughW = 0.62;
  }
  // 足元の汚れと、角の摩耗
  c *= mix(0.62, 1.0, smoothstep(0.0, 0.55, vKgWorld.y));
${WOOD_PHOTO}
  // r07-world: 木目の色に法線と粗さを揃え、擦れた縁側と乾いた柱の反射を分ける。
  float relief = grain * 0.65 + grain2 * fine * 0.35;
  kgSurfaceHeight = relief * ${LOOK.weather.woodRelief.toFixed(4)};
  kgRoughW = clamp(kgRoughW + (grain - 0.5) * 0.12 + (1.0 - fine) * 0.04, 0.5, 0.96);
  diffuseColor.rgb = c;
}
`;

// ---- 漆喰：白壁・土塀（黄土色に5本の定規筋）・なまこ壁・町屋の二階 ----
const PLASTER_PARS = /* glsl */ `
uniform vec3 uKgPlaster;
uniform vec3 uKgDobei;
`;
/**
 * r08-world: 白漆喰の写真（白壁・町屋の二階）と土の写真（土塀）。壁ごと（種）に写真の位置と向きを変える。
 * r08-world-周2: 写真全体の平均との比を、大きさの比が整数でない2つの縮尺で重ねる（kgTexPair）。周1の高域（粗いミップとの差）は、
 * 遊ぶ距離で見える数cm〜1mのむらまで消していたのでやめた。2つの縮尺の繰り返しはずれるので、長い壁でも写真1枚ごとの繰り返しが出ない。
 * 土の鏝の跡は縦なので、土塀の向きは 0° か 180° だけ（白漆喰は任意の角度）。
 */
const PLASTER_PHOTO = /* glsl */ `
#if defined(KG_TEX_PLASTER) || defined(KG_TEX_DOBEI)
  {
    vec2 qdx = dFdx(uv);
    vec2 qdy = dFdy(uv);
#ifdef KG_TEX_PLASTER
    if (part == 0.0 || part == 3.0) {
      float a = kgHash12(vec2(seed, 2.3)) * 6.2832;
      vec3 t = kgTexPair(uKgTexPlasterD, uKgTexPlasterN, uv, qdx, qdy, vec2(a, a + 2.18), kgHash22(vec2(seed, 7.9)), kgHash22(vec2(seed, 3.4)),
        vec2(${f4(PH.plaster.tile)}, ${f4(PH.plaster.tile2)}), ${f4(PHOTO_MEAN.plaster)}, ${fade2(PH.plaster.fade)}) * uKgTexGate.y;
      float pick = fract(seed * 0.6180339 + 0.13);
      float town = part == 3.0 ? (pick >= 0.82 ? ${f4(PH.plaster.black)} : ${f4(PH.plaster.town)}) : 1.0;
      c *= clamp(1.0 + ${f4(PH.plaster.strength)} * town * t.x, 0.5, 1.6);
      kgTexDh += town * ${f4(PH.plaster.normal)} * t.yz;
    }
#endif
#ifdef KG_TEX_DOBEI
    if (part == 1.0) {
      float a = kgHash12(vec2(seed, 4.1)) < 0.5 ? 0.0 : 3.1416;
      vec3 t = kgTexPair(uKgTexClayD, uKgTexClayN, uv, qdx, qdy, vec2(a, 3.1416 - a), kgHash22(vec2(seed, 8.6)), kgHash22(vec2(seed, 1.2)),
        vec2(${f4(PH.dobei.tile)}, ${f4(PH.dobei.tile2)}), ${f4(PHOTO_MEAN.clay)}, ${fade2(PH.dobei.fade)}) * uKgTexGate.z;
      c *= clamp(1.0 + ${f4(PH.dobei.strength)} * t.x, 0.5, 1.6);
      kgTexDh += ${f4(PH.dobei.normal)} * t.yz;
    }
#endif
  }
#endif
`;

const PLASTER_COLOR = /* glsl */ `
float kgRoughP = 0.88;
float kgSurfaceHeight = 0.0;
#ifdef KG_TEX
vec2 kgTexDh = vec2(0.0);
#endif
{
  float part = floor(vKg.x + 0.5);
  float seed = vKg.y;
  float y0 = vKg.z;
  float y1 = vKg.w;
  vec2 uv = vKgUv;
  float y = vKgWorld.y;
  float hRel = clamp((y - y0) / max(y1 - y0, 0.01), 0.0, 1.0);
  vec2 fwv = fwidth(uv);
  float fw = max(fwv.x, fwv.y);
  float big = kgFbm(uv * vec2(0.35, 0.6) + seed * 5.0, 3);
  vec3 c = uKgPlaster;
  if (part == 1.0) {
    c = uKgDobei;
    // 定規筋：壁の上寄りに5本の白い筋
    float band = (y - (y0 + (y1 - y0) * 0.42)) / 0.17;
    float lines = kgLine(band, 0.24, fwidth(band)) * step(-0.5, band) * step(band, 4.5);
    c = mix(c, uKgPlaster * 0.95, lines);
  } else if (part == 3.0) {
    // r01-world-周2: 指摘「町屋の二階がどれも白い漆喰で、白い長屋の列に見える」 種で 白・灰・黄土・黒漆喰 を選ぶ
    float pick = fract(seed * 0.6180339 + 0.13);
    vec3 grey = vec3(0.3, 0.3, 0.29);
    vec3 clay = vec3(0.36, 0.27, 0.16);
    vec3 black = vec3(0.06, 0.06, 0.065);
    c = pick < 0.3 ? uKgPlaster * 0.92 : pick < 0.55 ? grey : pick < 0.82 ? clay : black;
    kgRoughP = pick >= 0.82 ? 0.45 : 0.88;
  } else if (part == 2.0) {
    // なまこ壁：45度の格子に黒い平瓦、白い目地の盛り上がり
    vec2 r = vec2(uv.x + uv.y, uv.x - uv.y) * 0.7071 / 0.2;
    vec2 fr = fwidth(r);
    float j = max(kgLine(r.x, 0.2, fr.x), kgLine(r.y, 0.2, fr.y));
    c = mix(vec3(0.03, 0.033, 0.038) * (0.8 + 0.4 * kgHash12(floor(r) + seed)), uKgPlaster * 0.9, j);
    kgRoughP = mix(0.5, 0.85, j);
  }
  // 汚れ：足元の泥はね、笠や軒の下から垂れる雨だれの筋（上ほど濃く、下へ薄れる）、大きな斑
  // r01-world-周2: 指摘「土塀の壁が単色の平面」 雨だれの筋を壁の上 55% から下 15% まで伸ばす
  float splash = 1.0 - smoothstep(0.0, 0.55, y - y0);
  float sx = uv.x * 7.0 + seed;
  float streakN = kgNoise(vec2(sx, 0.5)) * kgNoise(vec2(sx * 2.7, 3.1 + seed));
  float streak = smoothstep(0.15, 0.6, streakN) * smoothstep(0.15, 0.95, hRel);
  c *= (0.88 + 0.22 * big) * (1.0 - 0.38 * splash) * (1.0 - 0.28 * streak);
  float fine = 1.0 - smoothstep(0.02, 0.07, fw);
  float pores = kgNoise(uv * 27.0 + seed * 3.0);
  c *= 1.0 + (pores - 0.5) * 0.14 * fine;
${PLASTER_PHOTO}
  kgSurfaceHeight = pores * fine * ${LOOK.weather.plasterRelief.toFixed(4)};
  kgRoughP = clamp(kgRoughP + (big - 0.5) * 0.12 - streak * 0.1, 0.42, 0.97);
  diffuseColor.rgb = c;
}
`;

// ---- 瓦：本瓦の丸瓦と平瓦の凹凸（法線）、段の重なり、棟の熨斗瓦、鬼瓦、軒先の巴 ----
const TILE_PARS = /* glsl */ `
uniform vec3 uKgTile;
// 丸瓦と平瓦の断面（周期 1。0..0.42 が丸瓦の山、残りが平瓦の谷）
float kgTileProfile(float x) {
  x = fract(x);
  if (x < 0.42) {
    float t = x / 0.42 * 2.0 - 1.0;
    return 0.05 * pow(max(0.0, 1.0 - t * t), 0.6);
  }
  float t = (x - 0.42) / 0.58 * 2.0 - 1.0;
  return -0.014 * (1.0 - t * t);
}
`;
const TILE_COLOR = /* glsl */ `
float kgRoughT = 0.48;
float kgMetalT = 0.5;
vec2 kgTileGrad = vec2(0.0);
float kgTileFade = 0.0;
{
  float part = floor(vKg.x + 0.5);
  float seed = vKg.y;
  vec2 uv = vKgUv;
  vec3 c = uKgTile;
  if (part == 0.0 || part == 3.0) {
    float P = 0.27;
    float su = uv.x / P;
    float sv = uv.y / 0.3;
    float fu = fwidth(su);
    kgTileFade = 1.0 - smoothstep(0.18, 0.5, fu);
    float x = fract(su);
    float hgt = kgTileProfile(su);
    // r01-world-周1: 指摘「瓦が波板に見える（丸瓦の山の光る線が軒から棟まで途切れない）」
    // 丸瓦は 0.3m ごとに継ぎ目（重なりの段）で区切り、瓦ごとに色・艶・傾きを散らす
    float roundT = step(x, 0.42);
    vec2 cell = vec2(floor(su), floor(sv + roundT * 0.5));
    float tileVar = kgHash12(cell + seed);
    vec2 tilt = (kgHash22(cell + seed * 1.7) - 0.5) * 0.06;
    c *= 0.8 + 0.4 * tileVar;
    c *= mix(1.0, 0.7 + 0.42 * smoothstep(-0.014, 0.05, hgt), kgTileFade);
    // 平瓦の段の影と、丸瓦の継ぎ目
    float svr = sv + roundT * 0.5;
    float joint = kgLine(svr, roundT > 0.5 ? 0.07 : 0.12, fwidth(svr));
    c *= 1.0 - (roundT > 0.5 ? 0.45 : 0.35) * joint * kgTileFade;
    float e = 0.02;
    float dh = (kgTileProfile(su + e) - kgTileProfile(su - e)) / (2.0 * e * P);
    kgTileGrad = (vec2(dh, 0.0) + tilt) * kgTileFade;
    kgRoughT = mix(0.52, 0.3, smoothstep(0.0, 0.05, hgt) * kgTileFade) + 0.16 * tileVar + 0.25 * joint;
    if (part == 3.0) {
      // 軒先：丸瓦の端の巴（明るい丸と暗い芯）、平瓦の端の唐草（暗い帯）
      vec2 q = vec2((x - 0.21) / 0.21, (fract(-uv.y / 0.22) - 0.5) * 2.0);
      float r = length(q);
      float disc = (1.0 - smoothstep(0.85, 1.0, r)) * roundT;
      c = uKgTile * mix(0.55, 1.25 - 0.5 * smoothstep(0.35, 0.0, r), disc);
      kgRoughT = mix(0.6, 0.35, disc);
      kgTileGrad = vec2(0.0);
    }
  } else if (part == 1.0) {
    // 棟：熨斗瓦を積んだ段（高さの筋）。少し明るい銀色、上は冠瓦の丸み
    float s = vKgWorld.y / 0.07;
    float layer = kgPulse(s, 0.72, fwidth(s));
    c *= (0.95 + 0.45 * layer) * (0.9 + 0.2 * kgHash12(vec2(floor(s), seed)));
    kgRoughT = mix(0.55, 0.32, layer);
  } else if (part == 2.0) {
    c *= 1.05;
    kgRoughT = 0.3;
  }
  // 大きな色むら（古い瓦と新しい瓦）
  c *= 0.86 + 0.28 * kgFbm(vKgWorld.xz * 0.18 + seed, 3);
  // 瓦の谷と継ぎ目にだけ埃を溜める。銀色の頂は残し、屋根全面の光沢を均一にしない。
  float valley = part == 0.0 ? 1.0 - smoothstep(0.0, 0.04, kgTileProfile(uv.x / 0.27)) : 0.35;
  float dust = smoothstep(0.35, 0.7, kgNoise(uv * 1.8 + seed * 0.1)) * valley * ${LOOK.weather.tileDust.toFixed(3)};
  c = mix(c, uKgTile * vec3(0.76, 0.7, 0.57), dust);
  kgRoughT = min(0.95, kgRoughT + dust);
  kgMetalT *= 1.0 - dust;
  // r01-world-周2: 指摘「屋根がどれも同じ灰青」 建物（種）ごとに、青みの銀・茶がかった灰・明るい灰を少し振る
  float hue = fract(seed * 0.3819 + 0.27);
  c *= hue < 0.33 ? vec3(0.92, 0.97, 1.08) : hue < 0.66 ? vec3(1.06, 1.0, 0.92) : vec3(1.08, 1.08, 1.08);
  diffuseColor.rgb = c;
}
`;
const TILE_NORMAL = /* glsl */ `
if (kgTileFade > 0.0) {
  vec2 duvx = dFdx(vKgUv);
  vec2 duvy = dFdy(vKgUv);
  float dhdx = kgTileGrad.x * duvx.x + kgTileGrad.y * duvx.y;
  float dhdy = kgTileGrad.x * duvy.x + kgTileGrad.y * duvy.y;
  normal = kgBump(-vViewPosition, normal, dhdx, dhdy);
}
`;

// ---- 石：切石（目地）と自然石の粒 ----
const STONE_PARS = /* glsl */ `
uniform vec3 uKgStone;
#ifdef KG_TEX_STONE
// r08-world: 岩の写真を1回読む。x＝明るさの比 − 1、yz＝画面の1画素あたりの高さの変化（scale＝写真1枚の大きさ m）
// r08-world-周3: 比は粗いミップ（約15cm のテクセル）との差 ÷ 平均にする。写真の大きな斑（約30cm より大きい明暗）が、
// 切った石1つの中に斜めの境として出ないように（差の平均は 0 なので、平均の反射率は変わらない）
vec3 kgRock(vec2 p, vec2 dpx, vec2 dpy, float scale) {
  float lf = kgTexLum(textureGrad(uKgTexRockD, p, dpx, dpy).rgb);
  float lc = kgTexLum(textureLod(uKgTexRockD, p, ${PH.stone.coarseLod.toFixed(1)}).rgb);
  float r = (lf - lc) / ${f4(PHOTO_MEAN.rock)};
  return vec3(r, kgTexDhOf(textureGrad(uKgTexRockN, p, dpx, dpy).rgb, dpx, dpy, scale));
}
#endif
`;

/**
 * r08-world: 岩の写真。切石（cut）は目地で区切った石ごとに、溝の底（wet）は塀ごとに写真の位置と向き（90° 刻み）を変える。
 * 写真の継ぎ目は目地の中に入る。自然石（rough）の uv は球の割り付けで継ぎ目があるので、世界の座標の三面投影にする
 * （面の向きで重みを付け、斜めの投影は引き伸ばされて画素あたりのテクセルが増えるので、自然に効きが落ちる）。
 * r08-world-周3: 切石は、明暗の境を含まない窓を石ごとに選ぶ（石の中に写真の大きな斑の境が出ない）。自然石と溝の底は kgRock の高域。
 */
const STONE_PHOTO = /* glsl */ `
#ifdef KG_TEX_STONE
  {
    vec2 qdx = dFdx(uv);
    vec2 qdy = dFdy(uv);
    vec3 wdx = dFdx(vKgWorld);
    vec3 wdy = dFdy(vKgWorld);
    vec2 fr = ${fade2(PH.stone.fade)};
    vec3 acc = vec3(0.0);
    if (part == 1.0) {
      vec3 wa = pow(abs(wn), vec3(4.0));
      wa /= max(wa.x + wa.y + wa.z, 1e-4);
      vec3 o = vec3(kgHash22(vec2(seed, 1.9)), kgHash12(vec2(seed, 6.1))) * 5.0;
      float k = ${f4(1 / PH.stone.rockTile)};
      if (wa.x > 0.02) {
        vec2 dpx = wdx.zy * k;
        vec2 dpy = wdy.zy * k;
        float w = wa.x * kgTexFade(dpx, dpy, fr);
        if (w > 0.0) acc += w * kgRock((vKgWorld.zy + o.xy) * k, dpx, dpy, ${f4(PH.stone.rockTile)});
      }
      if (wa.y > 0.02) {
        vec2 dpx = wdx.xz * k;
        vec2 dpy = wdy.xz * k;
        float w = wa.y * kgTexFade(dpx, dpy, fr);
        if (w > 0.0) acc += w * kgRock((vKgWorld.xz + o.yz) * k, dpx, dpy, ${f4(PH.stone.rockTile)});
      }
      if (wa.z > 0.02) {
        vec2 dpx = wdx.xy * k;
        vec2 dpy = wdy.xy * k;
        float w = wa.z * kgTexFade(dpx, dpy, fr);
        if (w > 0.0) acc += w * kgRock((vKgWorld.xy + o.zx) * k, dpx, dpy, ${f4(PH.stone.rockTile)});
      }
    } else if (part == 0.0) {
      // r08-world-周3: 切石は、明暗の境を含まない窓（KG_ROCK_CUT）を石ごとに1つ選び、石の中の位置（左右・上下の裏返しつき）を
      // その窓へ写す。比の分母はその窓の平均（石ごとの平均の比が 1）。写真の位置が飛ぶのは目地の所だけ
      vec3 win = KG_ROCK_CUT[min(int(kgHash12(kgCell + seed * 1.7 + 0.3) * float(KG_ROCK_CUTS)), KG_ROCK_CUTS - 1)];
      vec2 hs = kgHash22(kgCell + seed + 9.0);
      vec2 sg = vec2(hs.x < 0.5 ? -1.0 : 1.0, hs.y < 0.5 ? -1.0 : 1.0);
      float k = ${f4(1 / PH.stone.tile)};
      vec2 l = kgCellLocal * k;
      vec2 p = win.xy + vec2(sg.x > 0.0 ? l.x : KG_ROCK_CUT_SIZE.x - l.x, sg.y > 0.0 ? l.y : KG_ROCK_CUT_SIZE.y - l.y);
      vec2 dpx = sg * qdx * k;
      vec2 dpy = sg * qdy * k;
      float w = kgTexFade(dpx, dpy, fr);
      if (w > 0.0) {
        float r = kgTexLum(textureGrad(uKgTexRockD, p, dpx, dpy).rgb) / win.z - 1.0;
        acc = w * vec3(r, kgTexDhOf(textureGrad(uKgTexRockN, p, dpx, dpy).rgb, dpx, dpy, ${f4(PH.stone.tile)}));
      }
    } else {
      // 溝の底（暗い泥）：塀ごとに写真の位置と向き（90° 刻み）を変える
      mat2 R = kgTexRot(floor(kgHash12(vec2(seed, 9.0)) * 4.0) * 1.5708);
      float k = ${f4(1 / PH.stone.rockTile)};
      vec2 p = R * uv * k + kgHash22(vec2(seed * 1.7, 0.3));
      vec2 dpx = R * qdx * k;
      vec2 dpy = R * qdy * k;
      float w = kgTexFade(dpx, dpy, fr);
      if (w > 0.0) acc = w * kgRock(p, dpx, dpy, ${f4(PH.stone.rockTile)});
    }
    float wet = part == 2.0 ? 1.0 : 0.0;
    c *= clamp(1.0 + uKgTexGate.w * mix(${f4(PH.stone.strength)}, ${f4(PH.stone.strength * PH.stone.wet)}, wet) * acc.x, 0.4, 1.8);
    kgTexDh += uKgTexGate.w * mix(${f4(PH.stone.normal)}, ${f4(PH.stone.wetNormal)}, wet) * acc.yz;
  }
#endif
`;

const STONE_COLOR = /* glsl */ `
float kgRoughS = 0.82;
float kgSurfaceHeight = 0.0;
#ifdef KG_TEX
vec2 kgTexDh = vec2(0.0);
#endif
{
  float part = floor(vKg.x + 0.5);
  float seed = vKg.y;
  vec2 uv = vKgUv;
  vec2 fwv = fwidth(uv);
  float fw = max(fwv.x, fwv.y);
  float speck = (kgNoise(uv * 40.0 + seed) - 0.5) * (1.0 - smoothstep(0.01, 0.04, fw));
  float blot = kgFbm(uv * 1.3 + seed * 3.0, 3);
  vec3 c = uKgStone * (0.75 + 0.4 * blot + 0.35 * speck);
  float cutHeight = 1.0;
#ifdef KG_TEX_STONE
  vec2 kgCell = vec2(0.0);
  vec2 kgCellLocal = vec2(0.0);
#endif
  if (part == 0.0) {
    vec2 bs = vec2(max(vKg.z, 0.2), max(vKg.w, 0.2));
    float rowi = floor(uv.y / bs.y);
    float shift = mod(rowi, 2.0) * 0.5;
    vec2 q = vec2(uv.x / bs.x + shift, uv.y / bs.y);
    vec2 cell = floor(q);
    vec2 f = fract(q);
#ifdef KG_TEX_STONE
    kgCell = cell;
    kgCellLocal = f * bs;
#endif
    float e = min(min(f.x, 1.0 - f.x) * bs.x, min(f.y, 1.0 - f.y) * bs.y);
    float joint = 1.0 - smoothstep(0.01, 0.01 + max(fw, 0.008), e);
    c *= 0.82 + 0.36 * kgHash12(cell + seed);
    c *= mix(1.0, 0.3, joint);
    cutHeight = smoothstep(0.01, 0.05, e);
  }
  // 汚れ（下ほど）と、上向きの面の苔（自然石は多め）
  c *= mix(0.7, 1.0, smoothstep(0.0, 0.6, vKgWorld.y));
  vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
  float mossN = kgFbm(vKgWorld.xz * 1.7 + seed, 3);
  float mossK = smoothstep(0.45, 0.9, wn.y) * smoothstep(0.35, 0.65, mossN) * (part == 1.0 ? 0.85 : 0.35);
  c = mix(c, vec3(0.03, 0.055, 0.022) * (0.7 + 0.6 * mossN), mossK);
  if (part == 1.0) c *= 0.62 + 0.3 * kgHash12(vec2(seed, 9.1));
  if (part == 2.0) {
    // 溝の底：濡れた泥（暗く、艶で空を映す）
    c = vec3(0.022, 0.024, 0.026) * (0.8 + 0.4 * blot);
    // r01-world-周2: 指摘「溝の底が塀の向こうの篝火を照り返して光る点になる」 0.22→0.5
    kgRoughS = 0.5;
  }
${STONE_PHOTO}
  float fine = 1.0 - smoothstep(0.025, 0.1, fw);
  kgSurfaceHeight = (blot * 0.5 + speck * 0.25 + cutHeight * 0.5) * fine * ${LOOK.weather.stoneRelief.toFixed(4)};
  kgRoughS = clamp(kgRoughS + (blot - 0.5) * 0.1 + mossK * 0.1, 0.45, 0.97);
  diffuseColor.rgb = c;
}
`;

// r08-world: 写真の法線の凹凸（kgTexDh＝画面の1画素あたりの高さの変化）を、手続きの凹凸に足す
const SURFACE_NORMAL = /* glsl */ `
#ifdef KG_TEX
normal = kgBump(-vViewPosition, normal, dFdx(kgSurfaceHeight) + kgTexDh.x, dFdy(kgSurfaceHeight) + kgTexDh.y);
#else
normal = kgBump(-vViewPosition, normal, dFdx(kgSurfaceHeight), dFdy(kgSurfaceHeight));
#endif
`;

// ---- 発光：障子（桟）・窓（格子）・行灯・灯籠の火袋。紙は内から橙に光る ----
const GLOW_PARS = /* glsl */ `
uniform sampler2D uKgLampState;
uniform float uKgLampInverseWidth;
varying float vKgLight;
uniform vec3 uKgPaper;
uniform vec3 uKgGlowC;
uniform vec3 uKgWoodG;
`;
const GLOW_COLOR = /* glsl */ `
vec3 kgEmit = vec3(0.0);
float kgRoughG = 0.85;
{
  float part = floor(vKg.x + 0.5);
  float seed = vKg.y;
  float power = vKg.z;
  vec2 uv = vKgUv;
  vec3 c = uKgPaper;
  float lit = 1.0;
  if (part == 0.0) {
    // 障子：縦の桟 0.3m・横の桟 0.27m、0.9m ごとに太い框。灯りのむら（奥の灯の位置）
    vec2 s = vec2(uv.x / 0.3, uv.y / 0.27);
    vec2 fs = fwidth(s);
    float kumiko = max(kgLine(s.x, 0.09, fs.x), kgLine(s.y, 0.1, fs.y));
    float fr = uv.x / 0.9;
    float frame = kgLine(fr, 0.07, fwidth(fr));
    float bar = max(kumiko, frame);
    // r01-world-周4: 指摘「障子が柱間ごとに真っ黒」 負の底の pow(…, 2.0) は Metal で NaN（保険が黒にしていた） → 掛け算に
    float lampD = (fract(uv.x / 6.0 + seed) - 0.5) * 3.2;
    float lamp = 0.55 + 0.6 * exp(-lampD * lampD) * smoothstep(0.0, 1.2, uv.y - vKg.w);
    // r01-world-周2: 指摘「障子が全部同じ明るさの板」 柱間（1.82m）ごとに明るさを変え、ところどころに中の屏風と灯台の影
    float bay = floor(uv.x / 1.82 + 0.5);
    float bayK = 0.55 + 0.6 * kgHash12(vec2(bay, seed * 7.0));
    float hy = uv.y - vKg.w;
    float screen = step(0.72, kgHash12(vec2(bay, 3.3))) * smoothstep(1.05, 0.95, hy) * 0.55;
    float stand = step(0.8, kgHash12(vec2(bay, 9.1))) * (1.0 - smoothstep(0.03, 0.06, abs(fract(uv.x / 1.82 + 0.5) - 0.4))) * step(hy, 1.35) * 0.7;
    lit = (1.0 - bar) * lamp * bayK * (1.0 - screen) * (1.0 - stand);
    c = mix(c, uKgWoodG, bar);
  } else if (part == 1.0 || part == 5.0) {
    // 窓：縦格子越しの灯り（町屋の窓は暗めでむらがある）
    float s = uv.x / 0.09;
    float bar = kgPulse(s, 0.45, fwidth(s));
    lit = (1.0 - bar) * (part == 5.0 ? 0.55 + 0.45 * kgNoise(uv * 3.0 + seed) : 1.0);
    // r03-fix-visual: 窓の灯りの箱の上と下の面（奥行き 4cm）は光らせない（見下ろすと格子越しの灯りが点線に見えていた）
    float kgFlatG = smoothstep(0.6, 0.9, abs(normalize(cross(dFdx(vKgWorld), dFdy(vKgWorld))).y));
    lit *= 1.0 - kgFlatG;
    bar = mix(bar, 1.0, kgFlatG);
    c = mix(c * 0.6, uKgWoodG, bar);
  } else if (part == 2.0) {
    // 行灯：紙の箱。角の木枠
    float fx = min(fract(uv.x / 0.32), 1.0 - fract(uv.x / 0.32)) * 0.32;
    float frame = 1.0 - smoothstep(0.012, 0.022, fx);
    lit = 1.0 - frame;
    c = mix(c, uKgWoodG, frame);
  } else if (part == 3.0) {
    lit = 0.85 + 0.15 * kgNoise(uv * 8.0 + seed);
  } else if (part == 4.0) {
    lit = 0.0;
    c = uKgWoodG * 0.6;
  }
  float lampOn = vKgLight < -0.5 ? 1.0 : texture2D(uKgLampState, vec2((vKgLight + 0.5) * uKgLampInverseWidth, 0.5)).r;
  kgEmit = uKgGlowC * power * lit * lampOn;
  diffuseColor.rgb = c * mix(1.0, 0.35, lit * lampOn);
}
`;

// ---- 鉄と青銅 ----
const IRON_COLOR = /* glsl */ `
{
  float part = floor(vKg.x + 0.5);
  vec3 c = part == 1.0 ? vec3(0.07, 0.085, 0.065) : vec3(0.035, 0.032, 0.03);
  c *= 0.8 + 0.4 * kgFbm(vKgUv * 3.0 + vKg.y, 3);
  diffuseColor.rgb = c;
}
`;

// ---- 樹皮（松の亀甲状の皮） ----
const BARK_COLOR = /* glsl */ `
{
  vec2 uv = vKgUv;
  vec2 q = vec2(uv.x / 0.09, uv.y / 0.14);
  q.x += 0.5 * floor(q.y);
  vec2 f = fract(q);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  vec2 fq = fwidth(q);
  float crack = (1.0 - smoothstep(0.04, 0.04 + max(fq.x, fq.y) + 0.06, e));
  vec3 c = vec3(0.08, 0.052, 0.04) * (0.75 + 0.5 * kgHash12(floor(q) + vKg.y));
  c *= 1.0 - 0.7 * crack;
  diffuseColor.rgb = c;
}
`;

// ---- 葉（松の葉の塊・植え込み）：針葉の細かいむら、内側と下側は暗い（aKg.z ＝ 露出） ----
const LEAF_PARS = /* glsl */ `
uniform vec3 uKgLeafC;
`;
const LEAF_COLOR = /* glsl */ `
float kgLeafRough = 0.9;
{
  vec3 p = vKgObj;
  float n1 = kgNoise(p.xz * 9.0 + p.y * 5.0);
  float n2 = kgNoise(p.xz * 31.0 + p.y * 17.0);
  float fw = length(fwidth(p));
  float fine = 1.0 - smoothstep(0.01, 0.04, fw);
  #ifdef KG_INST
  float tint = vKgInst.y;
  #else
  float tint = 0.5;
  #endif
  // r01-world-周1: 指摘「葉の塊がのっぺりした黒い玉」 針葉の房（11cm）の明暗を強くし、房の間を暗くする
  float tuft = smoothstep(0.25, 0.75, n1);
  vec3 c = uKgLeafC * (0.75 + 0.5 * tint) * (0.5 + 0.85 * tuft + 0.3 * (n2 - 0.5) * fine);
  // 露出：塊の上と外は明るく、下と内は暗い
  float expo = clamp(vKg.z, 0.0, 1.0);
  c *= mix(0.32, 1.25, expo);
  c.g *= 1.0 + 0.15 * (n1 - 0.5);
  diffuseColor.rgb = c;
  kgLeafRough = mix(0.95, 0.62, expo * tuft);
}
`;
const LEAF_NORMAL = /* glsl */ `
{
  float h = kgNoise(vKgObj.xz * 24.0 + vKgObj.y * 13.0) * 0.03;
  normal = kgBump(-vViewPosition, normal, dFdx(h), dFdy(h));
}
`;

// ---- 竹：節（輪）と縦の筋。上ほど細い。風で揺れる ----
const BAMBOO_COLOR = /* glsl */ `
{
  float yy = vKgWorld.y / 0.34 + vKgInst.x * 3.0;
  float node = kgLine(yy, 0.06, fwidth(yy));
  vec3 c = uKgBambooC * (0.7 + 0.6 * vKgInst.y);
  c *= 0.85 + 0.25 * kgNoise(vec2(vKgUv.x * 40.0, vKgWorld.y * 1.5) + vKgInst.x * 9.0);
  c *= 1.0 - 0.4 * node;
  c *= mix(0.55, 1.0, smoothstep(0.0, 1.2, vKgWorld.y));
  diffuseColor.rgb = c;
}
`;
/**
 * 揺れ：その点のワールドの高さの二乗に比例して、ゆっくりした全体の揺れと速い震えを重ねる。
 * aKgInst：竹の幹は（種, 色, 半径, 高さ）で物体の座標が 0..1、葉の房は（種, 色, 1, 付け根の高さ）で物体の座標が m。
 * インスタンスの拡大で揺れの量が縮まないよう、物体の座標での量は拡大率で割る。
 */
// r02-fix-visual: 指摘「竹が揺れない（1.2 秒離れた2枚で変わらない）」 揺れの量 0.0016→0.0034（高さ 9m の先で約 0.28m）。
// 位相は乱数の種でなく場所（インスタンスの位置）から取る：葉の房と幹が同じ向きに揺れ、風の波が林を渡る。
// ゆっくりした煽り（数秒ごとに強まる）と、葉だけの速い震えを足した
const SWAY_VERTEX = /* glsl */ `
#ifdef KG_INST
{
  bool culm = aKgInst.z < 0.5;
  float wh = culm ? transformed.y * aKgInst.w : aKgInst.w + transformed.y;
  float sc = culm ? aKgInst.z : 1.0;
  vec2 ip = instanceMatrix[3].xz;
  float ph = dot(ip, vec2(0.23, 0.11));
  float gust = 0.55 + 0.45 * sin(uKgTime * 0.27 - ph * 0.6 + 1.3);
  float k = max(wh, 0.0) * max(wh, 0.0) * 0.0034 * gust / sc;
  transformed.x += k * (sin(uKgTime * 0.9 - ph) + 0.35 * sin(uKgTime * 2.7 - ph * 1.7));
  transformed.z += k * 0.6 * sin(uKgTime * 0.7 - ph * 1.3);
  if (!culm) {
    transformed += vec3(sin(uKgTime * 6.1 + position.x * 9.0 + ph * 3.0), 0.5 * sin(uKgTime * 5.3 + position.z * 8.0), cos(uKgTime * 5.7 + position.y * 7.0)) * 0.022 * gust;
  }
}
#endif
`;
/** 松の葉の塊の揺れ（r02-fix-visual）：枝先ほど、高い所ほど、わずかに。物体の座標での量はインスタンスの拡大で割る */
const PINE_SWAY = /* glsl */ `
#ifdef USE_INSTANCING
{
  vec3 ip = instanceMatrix[3].xyz;
  vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  float ph = dot(ip.xz, vec2(0.23, 0.11));
  float gust = 0.55 + 0.45 * sin(uKgTime * 0.27 - ph * 0.6 + 1.3);
  float edge = clamp(length(transformed.xz), 0.0, 1.2);
  float k = (0.02 + 0.0011 * ip.y * ip.y) * gust * (0.45 + 0.55 * edge);
  transformed.x += k * sin(uKgTime * 1.1 - ph) / isc.x;
  transformed.z += k * 0.7 * cos(uKgTime * 0.83 - ph * 1.3) / isc.z;
  transformed.y += 0.012 * edge * gust * sin(uKgTime * 2.3 - ph * 2.0 + transformed.x * 2.0) / max(isc.y, 0.05);
}
#endif
`;

export interface WorldMaterials {
  wood: MeshStandardMaterial;
  plaster: MeshStandardMaterial;
  tile: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  glow: MeshStandardMaterial;
  iron: MeshStandardMaterial;
  bark: MeshStandardMaterial;
  pine: MeshStandardMaterial;
  bush: MeshStandardMaterial;
  bamboo: MeshStandardMaterial;
  bambooLeaf: MeshStandardMaterial;
  /** 透かしの対象にしない木（地面に近い物：縁側・柱の下など） */
  woodLow: MeshStandardMaterial;
  /** 雑草の株 */
  grass: MeshStandardMaterial;
  stoneLow: MeshStandardMaterial;
}

export function createWorldMaterials(lamps: LampState): WorldMaterials {
  // r08-world: 写真の質感の口（?tex=0 では全部が空で、r07 と同じシェーダーになる）
  const woodPhoto = photoPatch(['wood']);
  const stonePhoto = photoPatch(['stone']);
  const plasterPhoto = photoPatch(['plaster', 'dobei']);
  const woodPatch = (key: string, see: boolean) =>
    kgMaterial(
      { color: 0xffffff, roughness: 0.78, metalness: 0 },
      {
        key,
        see,
        attr: true,
        burn: true,
        defines: woodPhoto.defines,
        uniforms: { uKgWood: { value: v3(MAT.wood) }, uKgWoodLight: { value: v3(MAT.woodLight) }, ...woodPhoto.uniforms },
        fragmentPars: woodPhoto.pars + WOOD_PARS,
        color: WOOD_COLOR,
        roughness: 'roughnessFactor = kgRoughW;',
        normal: SURFACE_NORMAL,
      },
    );
  const stonePatch = (key: string, see: boolean) =>
    kgMaterial(
      { color: 0xffffff, roughness: 0.82, metalness: 0 },
      {
        key,
        see,
        attr: true,
        amb: [1.5, 4],
        defines: stonePhoto.defines,
        uniforms: { uKgStone: { value: v3(MAT.stone) }, ...stonePhoto.uniforms },
        fragmentPars: stonePhoto.pars + STONE_PARS,
        color: STONE_COLOR,
        roughness: 'roughnessFactor = kgRoughS;',
        normal: SURFACE_NORMAL,
      },
    );
  const wood = woodPatch('wood', true);
  const woodLow = woodPatch('woodLow', false);
  const stone = stonePatch('stone', true);
  const stoneLow = stonePatch('stoneLow', false);
  const plaster = kgMaterial(
    { color: 0xffffff, roughness: 0.88, metalness: 0 },
    {
      key: 'plaster',
      see: true,
      attr: true,
      burn: true,
      defines: plasterPhoto.defines,
      uniforms: { uKgPlaster: { value: v3(MAT.plaster) }, uKgDobei: { value: v3(MAT.dobei) }, ...plasterPhoto.uniforms },
      fragmentPars: plasterPhoto.pars + PLASTER_PARS,
      color: PLASTER_COLOR,
      roughness: 'roughnessFactor = kgRoughP;',
      normal: SURFACE_NORMAL,
    },
  );
  const tile = kgMaterial(
    { color: 0xffffff, roughness: 0.48, metalness: 0.0 },
    {
      key: 'tile',
      see: true,
      attr: true,
      burn: true,
      amb: [4, 9],
      uniforms: { uKgTile: { value: v3(MAT.tile) } },
      fragmentPars: TILE_PARS,
      color: TILE_COLOR,
      roughness: 'roughnessFactor = kgRoughT;',
      metalness: 'metalnessFactor = kgMetalT;',
      normal: TILE_NORMAL,
      // r01-world-周1: 指摘「燃える屋根が瓦ごと橙のまだら（迷彩）」 瓦の燃える光は谷と継ぎ目に絞り 0.25 倍
      emissive: 'kgBurnScale = 0.25 * (1.0 - kgTileFade * 0.6);',
    },
  );
  const glow = kgMaterial(
    { color: 0xffffff, roughness: 0.85, metalness: 0, emissive: 0xffffff },
    {
      key: 'glow',
      see: true,
      attr: true,
      burn: true,
      uniforms: {
        uKgPaper: { value: v3(MAT.paper) }, uKgGlowC: { value: v3(MAT.glow) }, uKgWoodG: { value: v3(MAT.wood) },
        uKgLampState: { value: lamps.texture }, uKgLampInverseWidth: { value: lamps.inverseWidth },
      },
      vertexPars: 'attribute float aKgLight; varying float vKgLight;',
      vertex: 'vKgLight = aKgLight;',
      fragmentPars: GLOW_PARS,
      color: GLOW_COLOR,
      roughness: 'roughnessFactor = kgRoughG;',
      emissive: 'totalEmissiveRadiance = kgEmit;',
    },
  );
  const iron = kgMaterial(
    { color: 0xffffff, roughness: 0.55, metalness: 0.55 },
    // r02-fix-visual: 指摘「鐘楼の居眠り番が梵鐘に隠れる」 鉄・青銅も透かしの対象に false→true
    { key: 'iron', attr: true, see: true, color: IRON_COLOR },
  );
  const bark = kgMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }, { key: 'bark', see: true, attr: true, color: BARK_COLOR });
  const leaf = (key: string, c: RGB, see: boolean, seeBush = false, vertex?: string) =>
    kgMaterial(
      { color: 0xffffff, roughness: 0.9, metalness: 0 },
      {
        key,
        see,
        seeBush,
        attr: true,
        inst: true,
        amb: [1.5, 7],
        nearFade: 2.6,
        vertex,
        uniforms: { uKgLeafC: { value: v3(c) } },
        fragmentPars: LEAF_PARS,
        color: LEAF_COLOR,
        roughness: 'roughnessFactor = kgLeafRough;',
        normal: LEAF_NORMAL,
        // r01-world-周2: 指摘「松の塊の輪郭が背景に溶ける」 縁（視線に対して寝た面）に空の光を足し、形を読ませる
        light: `{
  float kgRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * kgSkyHaze(vec3(0.0, 0.3, 1.0)) * kgRim * 9.0;
}`,
      },
    );
  const pine = leaf('pine', MAT.pine, true, false, PINE_SWAY);
  // r01-integrate: 指摘「植え込みでしゃがむと、自分の姿が植え込みに埋もれて見えない」 植え込みも透かしの対象に false→true
  const bush = leaf('bush', MAT.bush, true, true);
  const grass = kgMaterial(
    { color: 0xffffff, roughness: 0.85, metalness: 0, side: DoubleSide },
    {
      key: 'grass',
      attr: true,
      inst: true,
      amb: [100, 101],
      nearFade: 1.2,
      uniforms: { uKgLeafC: { value: v3([0.05, 0.075, 0.03]) } },
      fragmentPars: LEAF_PARS,
      color: LEAF_COLOR,
    },
  );
  // r01-world-周1: 指摘「竹林が黒い棒と棘」 暗い場所の倍率を地面の近く（〜2.5m）だけにする [100,101]→[1.5,5.5]、幹に艶 0.55→0.32
  const bamboo = kgMaterial(
    { color: 0xffffff, roughness: 0.32, metalness: 0 },
    {
      key: 'bamboo',
      see: true,
      attr: true,
      inst: true,
      amb: [1.5, 5.5],
      nearFade: 1.6,
      vertex: SWAY_VERTEX,
      uniforms: { uKgBambooC: { value: v3(MAT.bamboo) } },
      fragmentPars: 'uniform vec3 uKgBambooC;',
      color: BAMBOO_COLOR,
    },
  );
  const bambooLeaf = kgMaterial(
    { color: 0xffffff, roughness: 0.8, metalness: 0, side: DoubleSide },
    {
      key: 'bambooLeaf',
      see: true,
      attr: true,
      inst: true,
      amb: [1.5, 5.5],
      nearFade: 3.2,
      vertex: SWAY_VERTEX,
      uniforms: { uKgLeafC: { value: v3(MAT.bambooLeaf) } },
      fragmentPars: LEAF_PARS,
      color: LEAF_COLOR,
    },
  );
  return { wood, plaster, tile, stone, glow, iron, bark, pine, bush, bamboo, bambooLeaf, woodLow, stoneLow, grass };
}
