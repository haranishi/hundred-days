/**
 * 悪事の登録所（ここだけに足す）。並びは「同じ優先度のときに先に見る順」。
 * 案内の優先度の目安：乗っている・持っている物の使い道 60〜100 ＞ その場の悪事 35〜45 ＞ 棚 20 ＞ 缶 15 ＞ 駄々 5 ＞ 蹴る 0。
 * 店員と客はここではなく ai/npcs.ts。
 */
import type { MisdeedSystem } from '../types';
import { bananaSystem } from './banana';
import { bellSystem } from './bell';
import { bowlingSystem } from './bowling';
import { cartSystem } from './cart';
import { freezerSystem } from './freezer';
import { kickSystem } from './kick';
import { paSystem } from './pa';
import { pyramidSystem } from './pyramid';
import { samplesSystem } from './samples';
import { sweepSystem } from './sweep';
import { tantrumSystem } from './tantrum';

export function createSystems(): MisdeedSystem[] {
  return [cartSystem, freezerSystem, bananaSystem, bowlingSystem, paSystem, bellSystem, samplesSystem, sweepSystem, pyramidSystem, tantrumSystem, kickSystem];
}
