// ページのCSSの全部（親の担当・まとめ役）。編集画面の中と、書き出す1ファイルの両方で、同じ文字列を使う。
import { BASE_CSS } from './page-base.js';
import { THEME_CSS } from './page-themes.js';
import { BLOCK_RENDERERS } from './blocks/index.js';
import { BLOCK_TYPES } from './contract.js';

export const PAGE_CSS = [BASE_CSS, THEME_CSS, ...BLOCK_TYPES.map((type) => BLOCK_RENDERERS[type].css)].join('\n');
