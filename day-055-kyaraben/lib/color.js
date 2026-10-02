// 色の計算。背景の見分けと食材の割り当ては「人の目に近い差」で比べたいので、sRGB を CIE Lab（D65）にして ΔE76 で測る
const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
// 画素ごとに何万回も呼ぶので、整数の入力は表で引く
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) LINEAR[i] = toLinear(i);
const lin = (c) => (Number.isInteger(c) && c >= 0 && c <= 255 ? LINEAR[c] : toLinear(c));
const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

// out[o..o+2] に書き込む版。配列を作らないので、画素全体の変換に使う
export function rgbToLabInto(r, g, b, out, o = 0) {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN);
  const fy = f((0.2126729 * R + 0.7151522 * G + 0.072175 * B) / YN);
  const fz = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / ZN);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
  return out;
}

export const rgbToLab = (r, g, b) => rgbToLabInto(r, g, b, [0, 0, 0]);

export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);
  const x = inv(fx) * XN;
  const y = (L > KAPPA * EPS ? fy ** 3 : L / KAPPA) * YN;
  const z = inv(fz) * ZN;
  const gamma = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [
    gamma(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    gamma(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    gamma(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
export const hexToLab = (hex) => rgbToLab(...hexToRgb(hex));
export const labToHex = (lab) => rgbToHex(labToRgb(lab[0], lab[1], lab[2]));

export function deltaE(p, q) {
  const dl = p[0] - q[0];
  const da = p[1] - q[1];
  const db = p[2] - q[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

export const chroma = (lab) => Math.hypot(lab[1], lab[2]);

// 型紙の淡い塗りと濃い線、模様の明暗に使う。見た目の手ざわりだけなので sRGB のまま混ぜる
export function mixHex(a, b, t) {
  const p = hexToRgb(a);
  const q = hexToRgb(b);
  return rgbToHex(p.map((v, i) => v + (q[i] - v) * t));
}
