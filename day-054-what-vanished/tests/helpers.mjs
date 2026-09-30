import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const appDir = fileURLToPath(new URL('../', import.meta.url));
export const manifest = JSON.parse(readFileSync(new URL('../data/models.json', import.meta.url), 'utf8'));

/** いつも同じ場所にある大きな物だけを置いた置き方（歩ける場所の基準に使う） */
export const DEDICATED = { armchair: 'L-armchair', 'rocking-chair': 'B-rocking', 'tall-plant': 'L-plant', 'grandfather-clock': 'H-clock', 'school-chair': 'S-chair', suitcase: 'B-suitcase' };
export const dedicatedArrangement = Object.fromEntries(Object.entries(DEDICATED).map(([id, slot]) => [id, { slot, yaw: 0 }]));
