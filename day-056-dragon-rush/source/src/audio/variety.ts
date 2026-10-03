// OWNER: audio
// 音の散らし（Web Audio を使わない純粋な部品）：変化を選ぶ（同じ変化を2回続けない）、高さ（±半音、一様）と音量（±dB）を散らす。
// 乱数は音の専用の系列（core/rng の stream(種, 'audio')）なので、ほかの機能の乱数の並びを変えない。
import { stream, type Rng } from '../core/rng';

export class Variety {
  private readonly last = new Map<string, number>();

  constructor(private readonly rng: Rng = stream(20260930, 'audio')) {}

  /** count 個の変化から1つ選ぶ。2個以上あれば、直前と同じ番号は選ばない。 */
  pick(bank: string, count: number): number {
    if (count <= 1) return 0;
    const prev = this.last.get(bank);
    let v = this.rng.int(0, count - 1);
    if (v === prev) v = (v + 1 + this.rng.int(0, count - 2)) % count;
    this.last.set(bank, v);
    return v;
  }

  /**
   * 高さの散らし（半音）。一様分布で ±range。
   * r02-audio：指摘「三角分布の ±0.9 半音では外れの平均が約 0.3 半音で、同じ音の連打に聞こえる」 三角分布→一様分布（幅は config/audio.ts の pitch）
   */
  semis(range: number): number {
    if (range <= 0) return 0;
    return (this.rng.next() * 2 - 1) * range;
  }

  /** 音量の散らし（dB）。 */
  jitterDb(range: number): number {
    if (range <= 0) return 0;
    return (this.rng.next() * 2 - 1) * range;
  }

  /** [0,1) の一様な値（繰り返しの音をどこから始めるか）。 */
  unit(): number {
    return this.rng.next();
  }

  reset(): void {
    this.last.clear();
  }
}
