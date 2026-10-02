// 食材の一覧と量の目安。自由入力にすると手に入らない食材や切れない細さの案が出るので、定番だけを持つ
import { hexToLab } from './color.js';

export const FAMILIES = {
  white: { name: '白', colors: ['#FFFFFF', '#F3EFE4'] },
  black: { name: '黒', colors: ['#141414', '#2E2E2E'] },
  gray: { name: '灰色', colors: ['#8C8C8C', '#BDBDBD'] },
  yellow: { name: '黄', colors: ['#FFD83D', '#F2C200', '#FFE680'] },
  orange: { name: 'オレンジ', colors: ['#FF9A2E', '#F57C00'] },
  red: { name: '赤', colors: ['#E53935', '#C62828'] },
  pink: { name: 'ピンク', colors: ['#F48FB1', '#FFC0CB', '#F06292'] },
  purple: { name: 'むらさき', colors: ['#8E44AD', '#B39DDB'] },
  blue: { name: '青', colors: ['#1E88E5', '#3F51B5'] },
  lightblue: { name: '水色', colors: ['#81D4FA', '#B3E5FC'] },
  green: { name: '緑', colors: ['#43A047', '#2E7D32'] },
  yellowgreen: { name: '黄緑', colors: ['#9CCC65', '#C5E1A5'] },
  brown: { name: '茶', colors: ['#795548', '#A1887F', '#5D4037'] },
  beige: { name: 'ベージュ', colors: ['#F5D0A9', '#FFE0BD', '#E8B98A'] },
};
for (const family of Object.values(FAMILIES)) family.labs = family.colors.map(hexToLab);

const RICE_HOWTO = '炊きたてか、しっかり温め直したものを使う';
const rice = (id, name, families, color, extra) => ({ id, name, kind: 'rice', families, color, allergens: [], related: [], ...extra });
const sheet = (id, name, families, color, extra) => ({ id, name, kind: 'sheet', families, color, allergens: [], related: [], ...extra });
const al = (name, level) => ({ name, level });

// seasoning は「前の晩に出しておく」に使う名前、prep は型紙で切る前の下ごしらえ
export const FOODS = {
  rice: rice('rice', 'ご飯', ['white'], '#FFFDF6', { howto: RICE_HOWTO }),
  turmeric_rice: rice('turmeric_rice', 'ターメリックご飯', ['yellow'], '#F2C94C', { seasoning: 'ターメリック', howto: 'ご飯100gにターメリック小さじ1/4と塩少々を混ぜる（カレー粉でもよい。カレー粉は商品により小麦を含むので表示を見る）' }),
  ketchup_rice: rice('ketchup_rice', 'ケチャップライス', ['orange', 'red'], '#E8773A', { seasoning: 'ケチャップ', howto: 'ご飯100gにケチャップ大さじ1を炒め合わせ、水気を飛ばして冷ます' }),
  denbu_rice: rice('denbu_rice', '桜でんぶご飯', ['pink'], '#F7A8B8', { seasoning: '桜でんぶ', howto: 'ご飯100gに桜でんぶ大さじ1を混ぜる' }),
  okaka_rice: rice('okaka_rice', 'おかかご飯', ['brown'], '#9C6B43', { seasoning: 'かつお節としょうゆ', howto: 'ご飯100gにかつお節1袋（2g）としょうゆ小さじ1/2を混ぜる', allergens: [al('小麦', 'always')], related: ['大豆'] }),
  aonori_rice: rice('aonori_rice', '青のりご飯', ['green', 'yellowgreen'], '#8DB255', { seasoning: '青のり', howto: 'ご飯100gに青のり小さじ1を混ぜる' }),
  yukari_rice: rice('yukari_rice', 'ゆかりご飯', ['purple'], '#9B6A9E', { seasoning: 'ゆかり', howto: 'ご飯100gにゆかり小さじ1を混ぜる' }),
  goma_rice: rice('goma_rice', '黒ごまご飯', ['gray'], '#9A968F', { seasoning: '黒すりごま', howto: 'ご飯100gに黒すりごま大さじ1を混ぜる', related: ['ごま'] }),
  butterfly_rice: rice('butterfly_rice', 'バタフライピーご飯', ['blue', 'lightblue'], '#6C8FD6', { seasoning: 'バタフライピー', howto: 'バタフライピーを煮出した液大さじ1〜2をご飯100gに混ぜる。手に入らなければ別の色に置き換える' }),
  hada_rice: rice('hada_rice', '肌色ご飯', ['beige'], '#F3C9A2', { seasoning: 'ケチャップ', howto: 'ご飯100gにケチャップ小さじ1/2を混ぜる' }),
  nori: sheet('nori', '焼きのり', ['black', 'gray'], '#1E2320', { howto: '前の晩に切って乾いた容器へ（湿気るとよれる）。朝の最後に貼る' }),
  cheese: sheet('cheese', 'スライスチーズ', ['white', 'yellow'], '#FBE7A1', { howto: 'ご飯が冷めてから乗せる（熱で溶けるため）', allergens: [al('乳', 'always')] }),
  cheddar: sheet('cheddar', 'チェダースライス', ['orange'], '#F4A53B', { howto: 'ご飯が冷めてから乗せる（熱で溶けるため）', allergens: [al('乳', 'always')] }),
  usuyaki: sheet('usuyaki', '薄焼き卵', ['yellow', 'beige'], '#F6D35B', { howto: '卵1個・片栗粉小さじ1/2（水小さじ1で溶く）・塩少々を混ぜ、薄く油をひいたフライパンで弱火で両面しっかり焼いて冷ます', allergens: [al('卵', 'always')] }),
  ham: sheet('ham', 'ハム', ['pink'], '#F4A7A7', { howto: 'そのまま型紙でなぞる', allergens: [al('乳', 'maybe'), al('卵', 'maybe')], related: ['豚肉', '大豆'] }),
  kanikama: sheet('kanikama', 'カニカマ（赤い部分）', ['red'], '#E0442E', { howto: '赤い膜をはがして使う', prep: '赤い膜をはがす', allergens: [al('卵', 'often'), al('かに', 'maybe'), al('小麦', 'maybe')] }),
  wiener: sheet('wiener', 'ウインナー', ['red', 'brown'], '#B5533C', { howto: 'ゆでるか焼いてから斜めに薄く切る', prep: 'ゆでるか焼いて冷まし、斜めに薄く切る', allergens: [al('乳', 'maybe'), al('卵', 'maybe'), al('小麦', 'maybe')], related: ['豚肉', '大豆'] }),
  carrot: sheet('carrot', 'にんじん（ゆで）', ['orange'], '#EE7B30', { howto: '2mm厚に切ってやわらかくゆで、冷ましてから切る', prep: '2mm厚に切ってやわらかくゆで、冷ます' }),
  cucumber: sheet('cucumber', 'きゅうり（皮）', ['green', 'yellowgreen'], '#3F7D3A', { howto: '皮を薄くむいて使う', prep: '皮を薄くむく' }),
  hanpen: sheet('hanpen', 'はんぺん', ['white'], '#FAF8F2', { howto: '5mm厚に切って型紙でなぞる', prep: '5mm厚に切る', allergens: [al('卵', 'often')], related: ['やまいも'] }),
};

// 系統ごとの候補。先頭が既定
export const CANDIDATES = {
  white: { sheet: ['cheese', 'hanpen'], rice: ['rice'] },
  black: { sheet: ['nori'], rice: ['goma_rice'] },
  gray: { sheet: ['nori'], rice: ['goma_rice'] },
  yellow: { sheet: ['usuyaki', 'cheese'], rice: ['turmeric_rice'] },
  orange: { sheet: ['cheddar', 'carrot'], rice: ['ketchup_rice'] },
  red: { sheet: ['kanikama', 'wiener'], rice: ['ketchup_rice'] },
  pink: { sheet: ['ham'], rice: ['denbu_rice'] },
  purple: { sheet: [], rice: ['yukari_rice'] },
  blue: { sheet: [], rice: ['butterfly_rice'] },
  lightblue: { sheet: [], rice: ['butterfly_rice'] },
  green: { sheet: ['cucumber'], rice: ['aonori_rice'] },
  yellowgreen: { sheet: ['cucumber'], rice: ['aonori_rice'] },
  brown: { sheet: ['wiener'], rice: ['okaka_rice'] },
  beige: { sheet: ['usuyaki'], rice: ['hada_rice'] },
};

export const defaultBaseFood = (family) => CANDIDATES[family]?.rice[0] ?? 'rice';
export const defaultFood = (family) => CANDIDATES[family]?.sheet[0] ?? CANDIDATES[family]?.rice[0] ?? 'rice';

// 画面の select に並べる順：同じ系統の候補 → ほかの食材。土台はご飯の仲間だけ
export function foodOptions(family, isBase) {
  const cand = CANDIDATES[family] ?? { sheet: [], rice: [] };
  const same = isBase ? [...cand.rice] : [...cand.sheet, ...cand.rice];
  const all = Object.values(FOODS).filter((food) => !isBase || food.kind === 'rice').map((food) => food.id);
  return { same, other: all.filter((id) => !same.includes(id)) };
}

// 表示義務のある特定原材料（2026-04-01から9品目）。並びは表示の順
export const ALLERGENS = ['えび', 'かに', 'くるみ', '小麦', 'そば', '卵', '乳', '落花生', 'カシューナッツ'];
export const LEVEL_RANK = { maybe: 1, often: 2, always: 3 };
export function allergenLabel(name, level) {
  if (level === 'often') return `${name}（多くの商品）`;
  if (level === 'maybe') return `${name}（商品による）`;
  return name;
}

// 弁当箱の内寸（mm）。キャラは縦横比を保って内寸の75%に収める
export const BOXES = {
  kid: { id: 'kid', name: '幼児用', w: 130, h: 90 },
  school: { id: 'school', name: '小学生', w: 160, h: 110 },
  adult: { id: 'adult', name: '大人', w: 180, h: 120 },
};
export function fitScale(widthPx, heightPx, boxId = 'school') {
  const box = BOXES[boxId] ?? BOXES.school;
  const mmPerPx = Math.min((box.w * 0.75) / Math.max(1, widthPx), (box.h * 0.75) / Math.max(1, heightPx));
  return { box, mmPerPx };
}

// ご飯の重さ。炊いたご飯の密度をおよそ 0.85g/cm³ とみる
export const RICE_THICKNESS = { base: 20, part: 8 };
export const riceGrams = (areaMm2, thicknessMm) => areaMm2 * thicknessMm * 0.00085;
export const ceil10 = (g) => Math.max(10, Math.ceil(g / 10) * 10);

function eighths(n8) {
  const whole = Math.floor(n8 / 8);
  let num = n8 % 8;
  let den = 8;
  while (num && num % 2 === 0 && den > 1) {
    num /= 2;
    den /= 2;
  }
  const frac = num ? `${num}/${den}` : '';
  if (whole && frac) return `${whole}と${frac}`;
  return whole ? String(whole) : frac;
}
function halves(n2) {
  const whole = Math.floor(n2 / 2);
  const half = n2 % 2 ? '1/2' : '';
  if (whole && half) return `${whole}と1/2`;
  return whole ? String(whole) : half;
}

// シート食材の量の目安。切りくずが出るので、面積にゆとり（1.3〜1.5倍）を掛けてから数える
export function sheetAmount(foodId, areaMm2) {
  const cm2 = areaMm2 / 100;
  const count = (per, margin) => Math.max(1, Math.ceil((cm2 * margin) / per));
  switch (foodId) {
    case 'nori': {
      const n8 = Math.max(1, Math.ceil(((cm2 * 1.5) / (21 * 19)) * 8));
      return { qty: n8 / 8, unit: '枚', text: `全形${eighths(n8)}枚` };
    }
    case 'cheese':
    case 'cheddar': {
      const n = count(8.5 * 8.5, 1.3);
      return { qty: n, unit: '枚', text: `${n}枚` };
    }
    case 'usuyaki': {
      const n = count(280, 1.4);
      return { qty: n, unit: '個', text: `卵${n}個` };
    }
    case 'ham': {
      const n = count(Math.PI * 4.5 * 4.5, 1.3);
      return { qty: n, unit: '枚', text: `${n}枚` };
    }
    case 'kanikama': {
      const n = count(7, 1.3);
      return { qty: n, unit: '本', text: `${n}本` };
    }
    case 'wiener': {
      const n = count(4, 1.3);
      return { qty: n, unit: '本', text: `${n}本` };
    }
    case 'carrot':
      return cm2 > 15 ? { qty: 0.5, unit: '本', text: '1/2本' } : { qty: 0.25, unit: '本', text: '1/4本' };
    case 'cucumber':
      return { qty: 1 / 3, unit: '本', text: '1/3本' };
    case 'hanpen': {
      const n2 = Math.max(1, Math.ceil(((cm2 * 1.3) / (9.5 * 9.5)) * 2));
      return { qty: n2 / 2, unit: '枚', text: `${halves(n2)}枚` };
    }
    default:
      return { qty: 1, unit: '', text: '少し' };
  }
}
