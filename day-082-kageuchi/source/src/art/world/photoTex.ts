// OWNER: world-art
// r08-world：CC0 の写真の質感（src/art/textures/、出どころは docs/CREDITS.md）を読み、手続きの材質へ渡す口。
// 写真の色そのものは使わず、明るさの比（輝度 ÷ 平均の輝度）と法線の細かい凹凸だけを材質（materialsLib.ts）が掛ける。
//   ?tex=0            写真の質感を切る（シェーダーから写真の行を外す。r07 までと同じ絵。見比べ用）
//   ?tex=wood,stone   その材質だけ写真を使う（wood・plaster・dobei・stone・ground。1つずつの見比べ用）。既定は全部
// 配る画像は tools/art/texture-derive.mjs が原本から作った派生（色は白黒の輝度、法線は 512px）。原本は来歴のためだけに残す（r08-world-周2）。
// 読み込みが終わるまでは、写真の効き（uKgTexGate）が 0 のまま＝写真なしで描く。warmUp が読み込みを待ってから先作りするので、
// 撮影（?shot=）は写真の入った絵で撮る。
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  Vector4,
  type ColorSpace,
  type IUniform,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { PHOTO_STATS } from '../textures/photoStats';
import { LOOK } from './look';

/** URL の ?tex= で切り替える単位（材質の側の名前）。ground＝地面の石畳（r08-world-周2 追加）。 */
export type PhotoUse = 'wood' | 'plaster' | 'dobei' | 'stone' | 'ground';
/** 写真の名前。 */
export type PhotoId = 'cedar' | 'plaster' | 'clay' | 'rock';

const USES: PhotoUse[] = ['wood', 'plaster', 'dobei', 'stone', 'ground'];
const PHOTO_OF: Record<PhotoUse, PhotoId> = { wood: 'cedar', plaster: 'plaster', dobei: 'clay', stone: 'rock', ground: 'rock' };
/** uKgTexGate の成分の番号（x・y・z・w）。 */
const GATE_INDEX: Record<PhotoId, number> = { cedar: 0, plaster: 1, clay: 2, rock: 3 };

// Vite がビルドに含めるよう、URL は1つずつ書く（new URL の第1引数は文字列のまま）。参照するのは派生だけ（原本はビルドに入らない）
const FILES: Record<PhotoId, { diff: string; nor: string }> = {
  cedar: {
    diff: new URL('../textures/japanese_cedar_planks/japanese_cedar_planks_lum_1k.jpg', import.meta.url).href,
    nor: new URL('../textures/japanese_cedar_planks/japanese_cedar_planks_nor_gl_512.jpg', import.meta.url).href,
  },
  plaster: {
    diff: new URL('../textures/white_plaster_02/white_plaster_02_lum_1k.jpg', import.meta.url).href,
    nor: new URL('../textures/white_plaster_02/white_plaster_02_nor_gl_512.jpg', import.meta.url).href,
  },
  clay: {
    diff: new URL('../textures/clay_plaster/clay_plaster_lum_1k.jpg', import.meta.url).href,
    nor: new URL('../textures/clay_plaster/clay_plaster_nor_gl_512.jpg', import.meta.url).href,
  },
  rock: {
    diff: new URL('../textures/rock_surface/rock_surface_lum_1k.jpg', import.meta.url).href,
    nor: new URL('../textures/rock_surface/rock_surface_nor_gl_512.jpg', import.meta.url).href,
  },
};

function parseTexParam(): Record<PhotoUse, boolean> {
  const raw = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('tex') : null;
  const all = (on: boolean): Record<PhotoUse, boolean> => ({ wood: on, plaster: on, dobei: on, stone: on, ground: on });
  if (raw === null || raw === '' || raw === '1') return all(true);
  if (raw === '0') return all(false);
  const want = new Set(raw.split(',').map((s) => s.trim()));
  return { wood: want.has('wood'), plaster: want.has('plaster'), dobei: want.has('dobei'), stone: want.has('stone'), ground: want.has('ground') };
}

/** 材質ごとに写真を使うか（URL の ?tex= から決める。ページを開いている間は変えない）。 */
export const PHOTO_ON: Readonly<Record<PhotoUse, boolean>> = parseTexParam();

function placeholder(r: number, g: number, b: number): DataTexture {
  const t = new DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

/**
 * 写真の uniform（全部の材質で共有する）。読み込みの前は 1 画素の仮の画像で、uKgTexGate が 0（写真の効きなし）。
 * 読み込んだら value を差し替え、その写真の成分を 1 にする（シェーダーは作り直さない）。
 */
export const PHOTO_UNIFORMS = {
  uKgTexGate: { value: new Vector4(0, 0, 0, 0) },
  uKgTexCedarD: { value: placeholder(128, 128, 128) as Texture },
  uKgTexCedarN: { value: placeholder(128, 128, 255) as Texture },
  uKgTexPlasterD: { value: placeholder(128, 128, 128) as Texture },
  uKgTexPlasterN: { value: placeholder(128, 128, 255) as Texture },
  uKgTexClayD: { value: placeholder(128, 128, 128) as Texture },
  uKgTexClayN: { value: placeholder(128, 128, 255) as Texture },
  uKgTexRockD: { value: placeholder(128, 128, 128) as Texture },
  uKgTexRockN: { value: placeholder(128, 128, 255) as Texture },
};

const SAMPLER: Record<PhotoId, { d: keyof typeof PHOTO_UNIFORMS; n: keyof typeof PHOTO_UNIFORMS }> = {
  cedar: { d: 'uKgTexCedarD', n: 'uKgTexCedarN' },
  plaster: { d: 'uKgTexPlasterD', n: 'uKgTexPlasterN' },
  clay: { d: 'uKgTexClayD', n: 'uKgTexClayN' },
  rock: { d: 'uKgTexRockD', n: 'uKgTexRockN' },
};

/** その材質の uses のうち、写真を使うもの。 */
function activeUses(uses: PhotoUse[]): PhotoUse[] {
  return uses.filter((u) => PHOTO_ON[u]);
}

/**
 * 材質に渡す #define と uniform と GLSL の宣言。写真を使わない材質（?tex=0 など）では全部が空になり、シェーダーは r07 と同じになる。
 * 追加のテクスチャの参照は、その材質が使う写真の分だけ（木＝杉板、漆喰＝白漆喰と土、石と地面の石畳＝岩）。
 */
export function photoPatch(uses: PhotoUse[]): { defines: string[]; uniforms: Record<string, IUniform>; pars: string } {
  const act = activeUses(uses);
  if (act.length === 0) return { defines: [], uniforms: {}, pars: '' };
  const defines = ['KG_TEX', ...act.map((u) => `KG_TEX_${u.toUpperCase()}`)];
  const uniforms: Record<string, IUniform> = { uKgTexGate: PHOTO_UNIFORMS.uKgTexGate };
  let samplers = '';
  for (const id of new Set(act.map((u) => PHOTO_OF[u]))) {
    const s = SAMPLER[id];
    uniforms[s.d] = PHOTO_UNIFORMS[s.d];
    uniforms[s.n] = PHOTO_UNIFORMS[s.n];
    samplers += `uniform sampler2D ${s.d};\nuniform sampler2D ${s.n};\n`;
  }
  const extra = (act.includes('wood') ? PLANK_GLSL : '') + (act.includes('stone') ? ROCK_CUT_GLSL : '') + (act.includes('ground') ? ROCK_PATH_GLSL : '');
  return { defines, uniforms, pars: PHOTO_GLSL + samplers + extra };
}

const f4 = (x: number): string => x.toFixed(4);

/** 共通の関数。写真は sRGB の画像として読む（GPU が線形へ戻し、ミップも線形で平均する）。 */
const PHOTO_GLSL = /* glsl */ `
#define KG_TEX_SIZE ${PHOTO_STATS.cedar.size.toFixed(1)}
uniform vec4 uKgTexGate;
float kgTexLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// 法線の写真（OpenGL 式：+v が画像の上）から、写真の uv あたりの高さの傾き
vec2 kgTexSlope(vec3 n) {
  n = n * 2.0 - 1.0;
  return -n.xy / max(n.z, 0.35);
}
// 写真の効き：画素あたりのテクセル数（長い方の軸）が range.x を超えたら弱め、range.y で 0（遠くで平均＝係数 1 へ戻す）
float kgTexFade(vec2 dpx, vec2 dpy, vec2 range) {
  float tp = max(length(dpx), length(dpy)) * KG_TEX_SIZE;
  return 1.0 - smoothstep(range.x, range.y, tp);
}
mat2 kgTexRot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}
// 写真の高さの傾き（slope）を、画面の1画素あたりの高さの変化へ（dp＝写真の uv の画面上の変化、scale＝写真1枚の大きさ m）
vec2 kgTexDhOf(vec3 nTex, vec2 dpx, vec2 dpy, float scale) {
  vec2 s = kgTexSlope(nTex);
  return scale * vec2(dot(s, dpx), dot(s, dpy));
}
// r08-world-周2：長い壁の繰り返しを消す。大きさの比が整数でない2つの縮尺（t.x・t.y m）と向き（ang.x・ang.y）、位置（o1・o2）で
// 写真を2回読み、x＝明るさの比−1、yz＝画面の1画素あたりの高さの変化を足す。2つは独立なので、ばらつきをそろえるため 1/√2 を掛ける
// （平均は 0 のまま）。fr は画素あたりのテクセル数での弱め方（写真1枚が数画素になる所でだけ効く）
vec3 kgTexPair(sampler2D dTex, sampler2D nTex, vec2 uv, vec2 qdx, vec2 qdy, vec2 ang, vec2 o1, vec2 o2, vec2 t, float mean, vec2 fr) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float ti = i == 0 ? t.x : t.y;
    mat2 R = kgTexRot(i == 0 ? ang.x : ang.y);
    vec2 p = R * uv / ti + (i == 0 ? o1 : o2);
    vec2 dpx = R * qdx / ti;
    vec2 dpy = R * qdy / ti;
    float w = kgTexFade(dpx, dpy, fr);
    if (w > 0.0) {
      float r = kgTexLum(textureGrad(dTex, p, dpx, dpy).rgb) / mean - 1.0;
      acc += w * vec3(r, kgTexDhOf(textureGrad(nTex, p, dpx, dpy).rgb, dpx, dpy, ti));
    }
  }
  return acc * 0.7071;
}
`;

const P = PHOTO_STATS.cedar.planks;
/** 杉板の写真の、使う板の内側の始まり（u）と、その板の平均の輝度。 */
const PLANK_GLSL = /* glsl */ `
#define KG_PLANKS ${P.use.length}
const float KG_PLANK_IW = ${f4(P.width - 2 * P.margin)};
const vec2 KG_PLANK[${P.use.length}] = vec2[${P.use.length}](${P.use
  .map((k, i) => `vec2(${f4(P.u0 + P.width * k + P.margin)}, ${f4(P.means[i])})`)
  .join(', ')});
`;

/**
 * r08-world-周3：岩の写真の中で、大きな明暗の境を含まない窓（tools/art/texture-stats.mjs が選ぶ）。石1つに窓1つを当て、
 * その窓の平均で割る。xy＝窓の左下の uv（v は画像の下から）、z＝窓の平均の輝度。SIZE は uv での窓の大きさ。
 */
function windowGlsl(name: string, win: { size: readonly number[]; list: readonly (readonly number[])[] }): string {
  const n = win.list.length;
  return `
#define KG_ROCK_${name}S ${n}
const vec2 KG_ROCK_${name}_SIZE = vec2(${f4(win.size[0])}, ${f4(win.size[1])});
const vec3 KG_ROCK_${name}[${n}] = vec3[${n}](${win.list.map((w) => `vec3(${f4(w[0])}, ${f4(w[1])}, ${f4(w[2])})`).join(', ')});
`;
}
const ROCK_CUT_GLSL = windowGlsl('CUT', PHOTO_STATS.rock.windows.cut);
const ROCK_PATH_GLSL = windowGlsl('PATH', PHOTO_STATS.rock.windows.path);

/** 写真の平均の輝度（比の分母）。 */
export const PHOTO_MEAN: Record<PhotoId, number> = {
  cedar: PHOTO_STATS.cedar.mean,
  plaster: PHOTO_STATS.plaster.mean,
  clay: PHOTO_STATS.clay.mean,
  rock: PHOTO_STATS.rock.mean,
};

let loading: Promise<void> | null = null;

function setup(t: Texture, colorSpace: ColorSpace, anisotropy: number): void {
  t.colorSpace = colorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
}

/**
 * 使う写真を読み始める（buildWorld の頭で呼ぶ。形を組む間に読み込みを進める）。何度呼んでも1回だけ読む。
 * 読めなかった写真は効きを 0 のままにし、警告だけ出す（ゲームは写真なしで動く）。
 */
export function loadPhotoTextures(renderer: WebGLRenderer): Promise<void> {
  if (loading) return loading;
  const ids = [...new Set(activeUses(USES).map((u) => PHOTO_OF[u]))];
  if (ids.length === 0 || typeof document === 'undefined') {
    loading = Promise.resolve();
    return loading;
  }
  const loader = new TextureLoader();
  const anisotropy = Math.max(1, Math.min(LOOK.photo.anisotropy, renderer.capabilities.getMaxAnisotropy()));
  const one = async (id: PhotoId): Promise<void> => {
    try {
      const [d, n] = await Promise.all([loader.loadAsync(FILES[id].diff), loader.loadAsync(FILES[id].nor)]);
      d.name = `${id}-diff`;
      n.name = `${id}-nor`;
      setup(d, SRGBColorSpace, anisotropy);
      setup(n, NoColorSpace, anisotropy);
      // 先に GPU へ送っておく（初めて描くコマで画像の展開とミップ作りに止まらない）
      renderer.initTexture(d);
      renderer.initTexture(n);
      PHOTO_UNIFORMS[SAMPLER[id].d].value = d;
      PHOTO_UNIFORMS[SAMPLER[id].n].value = n;
      PHOTO_UNIFORMS.uKgTexGate.value.setComponent(GATE_INDEX[id], 1);
    } catch (e) {
      console.warn(`写真の質感（${id}）を読めなかったので、写真なしで描く`, e);
    }
  };
  loading = Promise.all(ids.map(one)).then(() => undefined);
  return loading;
}

/** 写真の読み込みを待つ（上限 LOOK.photo.waitMs。過ぎたら写真なしで先へ進み、届いた所で重ねる）。 */
export function photoTexturesReady(): Promise<void> {
  if (!loading) return Promise.resolve();
  const done = loading;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`写真の質感の読み込みが ${LOOK.photo.waitMs}ms で終わらないので、写真なしで先へ進む`);
      resolve();
    }, LOOK.photo.waitMs);
    void done.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
