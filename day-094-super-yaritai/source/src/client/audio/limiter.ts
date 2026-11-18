// 同じ音が一度に何十回も呼ばれても割れないよう、同時に鳴る数を絞る（純粋な計算。単体試験で確かめる）。
// 棚を崩すと「ゴトッ」が1フレームに20回以上来る。全部鳴らすと音が割れるうえ、重さも増える。
// 同じ名前の音が重なるほど、あとから来た音を小さくする（2つ目は1/√2、3つ目は1/√3…）。

import type { SfxName } from '../../shared/view';

/** 名前ごとに同時に鳴らしてよい数（書いていない音は DEFAULT_LIMIT） */
export const VOICE_LIMITS: Partial<Record<SfxName, number>> = {
  knock: 6,
  can: 6,
  pin: 5,
  score: 4,
  roll: 2,
  crash: 2,
  eat: 2,
  bell: 3,
  'combo-up': 2,
  achieve: 2,
  complete: 1,
  'pa-chime': 1,
  'time-up': 1,
  countdown: 1,
  go: 1,
};
export const DEFAULT_LIMIT = 3;
/** 全部の音を合わせた上限 */
export const TOTAL_LIMIT = 28;
/** 同じ名前の音どうしの最短の間隔（秒）。これより近いと、同時の扱いで数える */
export const SAME_FRAME = 0.012;

interface Voice {
  name: SfxName;
  end: number;
}

export class VoiceLimiter {
  private voices: Voice[] = [];

  /**
   * 鳴らしてよければ音量の倍率（0 より大きい）、だめなら 0 を返す。
   * now は AudioContext の時刻、dur はその音の長さ（秒）。
   */
  allow(name: SfxName, now: number, dur: number): number {
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= TOTAL_LIMIT) return 0;
    const same = this.voices.filter((v) => v.name === name);
    const limit = VOICE_LIMITS[name] ?? DEFAULT_LIMIT;
    if (same.length >= limit) return 0;
    // 再生中の同種ボイス数に応じて少しずつ小さく（少しずれた連打も滑らかに減衰）
    const crowd = same.length + 1;
    this.voices.push({ name, end: now + dur });
    return 1 / Math.sqrt(crowd);
  }

  /** いま鳴っている数（試験用） */
  active(now: number, name?: SfxName): number {
    return this.voices.filter((v) => v.end > now && (name === undefined || v.name === name)).length;
  }
}
