// プレイヤーの見分け方とキャラの顔、画面で使う小さな絵（SVG）。
// プレイヤーは 1P赤● 2P青▲ 3P黄■ 4P緑◆（docs/02 ⑤）。色だけに頼らず、形と番号でも区別する。

import { PLAYER_CHARACTERS } from '../../contracts';
import type { ModelKey } from '../../../shared/view';
import { PALETTE } from '../../render/palette';
import { h, s } from './dom';

export interface SlotLook {
  color: string;
  /** 色の上に載せる文字の色（黄と緑は明るいので濃い紺） */
  ink: string;
  shape: 'circle' | 'triangle' | 'square' | 'diamond';
  /** 読み上げ用 */
  colorName: string;
  shapeName: string;
}

// 色は render/palette.ts（色の出どころはここだけ。docs/04）
export const SLOT_LOOKS: readonly SlotLook[] = [
  { color: PALETTE.players[0], ink: PALETTE.white, shape: 'circle', colorName: '赤', shapeName: 'まる' },
  { color: PALETTE.players[1], ink: PALETTE.white, shape: 'triangle', colorName: '青', shapeName: 'さんかく' },
  { color: PALETTE.players[2], ink: PALETTE.ink, shape: 'square', colorName: '黄', shapeName: 'しかく' },
  { color: PALETTE.players[3], ink: PALETTE.ink, shape: 'diamond', colorName: '緑', shapeName: 'ひしがた' },
];

export function lookOf(slot: number): SlotLook {
  return SLOT_LOOKS[slot] ?? (SLOT_LOOKS[0] as SlotLook);
}

export function slotLabel(slot: number): string {
  return `${slot + 1}P`;
}

/** 形の印（SVG）。縁取りを濃くして、明るい黄色でもクリームの地から浮かせる */
export function shapeIcon(slot: number, size = 20): SVGSVGElement {
  const look = lookOf(slot);
  const shape = (() => {
    switch (look.shape) {
      case 'circle':
        return s('circle', { cx: 10, cy: 10, r: 8 });
      case 'triangle':
        return s('path', { d: 'M10 1.8 18.6 17.4H1.4Z' });
      case 'square':
        return s('rect', { x: 2.5, y: 2.5, width: 15, height: 15, rx: 1.5 });
      case 'diamond':
        return s('path', { d: 'M10 1 19 10 10 19 1 10Z' });
    }
  })();
  shape.setAttribute('fill', look.color);
  shape.setAttribute('stroke', PALETTE.ink);
  shape.setAttribute('stroke-width', '1.8');
  shape.setAttribute('stroke-linejoin', 'round');
  return s('svg', { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: 'sy-shape' }, shape);
}

/** 形の中に番号を入れた小さな印（狭い所で、色・形・番号を1つで見せる）。読み上げでは「1P 赤のまる」 */
export function slotMark(slot: number, size = 24): HTMLElement {
  const look = lookOf(slot);
  const svg = shapeIcon(slot, size);
  // 三角は重心が下にあるので、番号も下げて小さく
  const y = look.shape === 'triangle' ? 15.2 : 14.1;
  const fs = look.shape === 'triangle' ? 8.5 : 10.5;
  svg.appendChild(
    // 白い数字は、赤・青の地で読みやすいよう濃い縁を付ける（縁を先に塗る）
    s(
      'text',
      {
        x: 10,
        y,
        'text-anchor': 'middle',
        'font-size': fs,
        'font-weight': 900,
        fill: look.ink,
        stroke: look.ink === PALETTE.white ? PALETTE.ink : 'none',
        'stroke-width': look.ink === PALETTE.white ? 1.8 : 0,
        'paint-order': 'stroke',
        'font-family': 'system-ui, sans-serif',
      },
      String(slot + 1),
    ),
  );
  return h('span', { class: 'sy-slot-mark' }, svg, h('span', { class: 'sy-sr' }, `${slotLabel(slot)} ${look.colorName}の${look.shapeName}`));
}

/** 「●1P」の札。読み上げでは「1P 赤のまる」 */
export function slotBadge(slot: number, size: 'sm' | 'lg' = 'sm'): HTMLElement {
  const look = lookOf(slot);
  return h(
    'span',
    { class: `sy-slot sy-slot--${size}`, style: `--pc:${look.color};--pi:${look.ink}` },
    shapeIcon(slot, size === 'lg' ? 22 : 18),
    h('span', { 'aria-hidden': 'true' }, slotLabel(slot)),
    h('span', { class: 'sy-sr' }, `${slotLabel(slot)} ${look.colorName}の${look.shapeName}`),
  );
}

// ───────── キャラの顔 ─────────

/** public/ui/chars/ に写した顔の画像（Kenney Mini Characters の Previews・CC0） */
const FACE_FILES = new Set([
  'character-female-a',
  'character-female-b',
  'character-female-c',
  'character-female-d',
  'character-female-e',
  'character-female-f',
  'character-male-a',
  'character-male-b',
  'character-male-d',
  'character-male-e',
  'character-male-f',
]);

export function faceUrl(key: ModelKey): string | null {
  const file = key.startsWith('ch/') ? key.slice(3) : key;
  if (!FACE_FILES.has(file)) return null;
  return `${import.meta.env.BASE_URL}ui/chars/${file}.png`;
}

export function charLabel(key: ModelKey): string {
  return PLAYER_CHARACTERS.find((c) => c.key === key)?.label ?? '';
}

/** 顔の画像。画像が無いキャラ（店員など）は丸い影絵 */
export function faceImg(key: ModelKey, size = 64): HTMLElement {
  const url = faceUrl(key);
  if (!url) {
    return h(
      'span',
      { class: 'sy-face sy-face--none', style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true' },
      s(
        'svg',
        { viewBox: '0 0 24 24', width: size * 0.6, height: size * 0.6, focusable: 'false' },
        s('circle', { cx: 12, cy: 8, r: 4.5, fill: 'currentColor' }),
        s('path', { d: 'M3.5 21c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z', fill: 'currentColor' }),
      ),
    );
  }
  return h('img', { class: 'sy-face', src: url, width: size, height: size, alt: '', decoding: 'async', draggable: 'false' });
}

// ───────── 小さな絵 ─────────

type IconName =
  | 'cart'
  | 'friends'
  | 'dice'
  | 'help'
  | 'sound-on'
  | 'sound-off'
  | 'back'
  | 'play'
  | 'door'
  | 'crown'
  | 'star'
  | 'alert'
  | 'pause';

const ICONS: Record<IconName, { d: string[]; fill?: boolean }> = {
  cart: { d: ['M2.5 4h2.6l2.4 10.5h10.2L20.5 8H6.4', 'M9.5 19.2h.01', 'M17 19.2h.01'] },
  friends: { d: ['M9 4.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z', 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6', 'M16.2 6.6a2.6 2.6 0 1 1 1 5', 'M17 14.3c2.3.5 4 2.6 4 5.2'] },
  dice: { d: ['M6.5 3.5h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3z', 'M8.5 8.5h.01', 'M15.5 8.5h.01', 'M12 12h.01', 'M8.5 15.5h.01', 'M15.5 15.5h.01'] },
  help: { d: ['M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z', 'M9.2 9.2a2.9 2.9 0 1 1 4 2.7c-.8.4-1.2 1-1.2 1.8v.5', 'M12 17.3h.01'] },
  'sound-on': { d: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M15.5 9a4.2 4.2 0 0 1 0 6', 'M18.2 6.3a8 8 0 0 1 0 11.4'] },
  'sound-off': { d: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M16 9.5l5 5', 'M21 9.5l-5 5'] },
  back: { d: ['M14.5 5.5 8 12l6.5 6.5'] },
  play: { d: ['M8 5.5v13l10-6.5z'], fill: true },
  door: { d: ['M13.5 4h5v16h-5', 'M9.5 8l-4 4 4 4', 'M5.5 12h9'] },
  crown: { d: ['M3.5 8.5l4.3 4 4.2-6.5 4.2 6.5 4.3-4-1.8 10H5.3z'] },
  star: { d: ['M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.1 6-.8z'], fill: true },
  alert: { d: ['M12 3.5 21.5 20h-19z', 'M12 10v4.5', 'M12 17.2h.01'] },
  pause: { d: ['M8.5 5.5v13', 'M15.5 5.5v13'] },
};

export function icon(name: IconName, size = 24): SVGSVGElement {
  const spec = ICONS[name];
  return s(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      'aria-hidden': 'true',
      focusable: 'false',
      class: `sy-icon sy-icon--${name}`,
      fill: spec.fill ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': spec.fill ? 1.5 : 2.4,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    ...spec.d.map((d) => s('path', { d })),
  );
}

// ───────── 「済」のハンコ ─────────

/** ハンコごとの傾き（度）。どれも同じ向きだと機械で押したように見えるので、少しずつ変える */
const HANKO_TILT = [-14, -8, -18, -11, -16, -6, -12, -19, -9, -15];

/**
 * 「済」のハンコ（二重の丸に明朝の「済」）。インクのかすれは #sy-kasure のフィルタで付ける。
 * 色は currentColor（CSS で濃い赤）。読み上げでは隣の「達成」を読むので、絵は隠す
 */
export function hanko(index: number): SVGSVGElement {
  const tilt = HANKO_TILT[index % HANKO_TILT.length] ?? -12;
  return s(
    'svg',
    { class: 'sy-hanko', viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false', style: `--tilt:${tilt}deg` },
    s(
      'g',
      { filter: 'url(#sy-kasure)' },
      s('circle', { cx: 32, cy: 32, r: 28.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 4.6 }),
      s('circle', { cx: 32, cy: 32, r: 22.8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
      s(
        'text',
        {
          x: 32,
          y: 42.6,
          'text-anchor': 'middle',
          'font-size': 29,
          'font-weight': 900,
          fill: 'currentColor',
          'font-family': "'Hiragino Mincho ProN', 'Yu Mincho', 'YuMincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif",
        },
        '済',
      ),
    ),
  );
}

/**
 * かすれのフィルタ（文書に1つだけ置く）。細かい雑音で朱肉の抜けを作り、粗い雑音で縁を少しゆがめる。
 * 抜けは雑音の山だけ（色の行列の「−9, 6.4」：雑音が 0.7 を超えた所だけを透かす）。強くすると字が欠けて読めない
 */
export function inkDefs(): SVGSVGElement {
  return s(
    'svg',
    { class: 'sy-defs', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' },
    s(
      'defs',
      null,
      s(
        'filter',
        { id: 'sy-kasure', x: '-8%', y: '-8%', width: '116%', height: '116%' },
        s('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.45, numOctaves: 2, seed: 7, result: 'grain' }),
        s('feColorMatrix', { in: 'grain', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 6.4', result: 'holes' }),
        s('feComposite', { in: 'SourceGraphic', in2: 'holes', operator: 'in', result: 'ink' }),
        s('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.05, numOctaves: 1, seed: 3, result: 'wave' }),
        s('feDisplacementMap', { in: 'ink', in2: 'wave', scale: 1.6, xChannelSelector: 'R', yChannelSelector: 'G' }),
      ),
    ),
  );
}
