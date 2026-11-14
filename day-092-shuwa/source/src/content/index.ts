/**
 * sign-content の公開窓口。項目は種類ごとのファイルに分け、ここで1つの並びにまとめる。
 * 数字（num-*）と単語（word-*）を足すときは、numbers.ts・words.ts のようにファイルを分けて
 * 下の GROUPS に並べる（ID の重複・出典・見間違えやすい組の検査は tests/content がまとめて見る）。
 */
import { KANA_ITEMS, MODIFIER_ITEMS } from './kana';
import { NUMBERS } from './numbers';
import { WORDS } from './words';
import type { SignItem } from './types';

export type * from './types';

const GROUPS: SignItem[][] = [KANA_ITEMS, MODIFIER_ITEMS, NUMBERS, WORDS];

export const ITEMS: SignItem[] = GROUPS.flat();

export { VOCAB } from './vocab';

const byId = new Map(ITEMS.map((i) => [i.id, i]));
export function getItem(id: string): SignItem | undefined {
  return byId.get(id);
}
