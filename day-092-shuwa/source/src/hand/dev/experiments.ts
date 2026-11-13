/**
 * 照合の途中で、形の候補を並べて比べるための置き場（開発用。dev-hands.html?set=kana&rows=exp）。
 * 本物のデータは src/content/kana.ts。ここで比べて決めた値を kana.ts に移し、ここは空に戻す。
 * 候補の書き方の例:
 *   { key: 'o2', label: 'お2', note: '深く丸める', spec: still({ fingers: {...}, thumb: { touch: 'index.tip' } }, { palm: 'viewerRight', fingers: 'up' }) }
 */
import type { HandshapeSpec, Orientation, SignSpec } from '../types';

export interface Experiment {
  key: string;
  label: string;
  note: string;
  spec: SignSpec;
}

export const still = (shape: HandshapeSpec, orient: Orientation): SignSpec => ({
  hands: { dominant: { keyframes: [{ t: 0, shape, orient, pos: { at: 'neutral' } }] } },
});

export const EXPERIMENTS: Experiment[] = [];
