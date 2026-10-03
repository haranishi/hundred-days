// OWNER: audio
// 同時に鳴る数の管理（Web Audio を使わない純粋な部品）。種類ごとの上限と全体の上限を持ち、足りなくなったら譲る声を選ぶ。
// r05-audio：指摘「重み（優先度×大きさ）が鳴り始めの値のまま減らず、余韻に入った古い崩落が新しい崩落の頭を押しのける」
//   声ごとに素材の包絡（ENVELOPE_STEP 秒ごとの dB）を持ち、重みは「今の大きさ」で比べる。
//   上限では、まず最も古い余韻（素材の最大から -20dB を過ぎて、もう戻らない声）を絞って新しい頭を通す。余韻が無ければ、今の重みの一番小さい声と比べる。
// 重なりの数（stack）は「今の大きさ」の和で返すので、余韻ばかりのときに新しい頭が必要以上に小さくならない（崩落が10棟同時でも割れない計算は前と同じ）。
import { VOICES, type VoiceCategory } from '../config/audio';

/** 素材の包絡の刻み（秒） */
export const ENVELOPE_STEP = 0.05;

export interface Envelope {
  /** ENVELOPE_STEP 秒ごとの大きさ（最大からの dB、0 以下） */
  db: Float32Array;
  /** 素材の最大から -20dB を最後に下回った時刻（秒、素材の時間で）。そこから先は余韻 */
  tail20: number;
}

export interface Slot {
  id: number;
  category: VoiceCategory;
  /** 優先度×鳴り始めの聞こえる大きさ */
  importance: number;
  /** 鳴り始めと鳴り終わり（コンテキストの秒、音速の遅れを含む） */
  start: number;
  end: number;
  /** 素材の包絡（無ければ鳴り終わりまで同じ大きさとみなす）と再生の速さ */
  env: Envelope | null;
  rate: number;
}

export interface Decision {
  accept: boolean;
  /** 止めて譲る声（無ければ null） */
  steal: number | null;
  /** 受け入れたとき、同じ種類で鳴っている声の「今の大きさ」の和（自分と、譲って止める声を含まない） */
  stack: number;
  /** 譲った理由（余韻を絞った・今の重みが小さかった） */
  reason?: 'tail' | 'weaker';
}

export interface SlotTiming {
  start?: number;
  env?: Envelope | null;
  rate?: number;
}

/** 余韻に入った声の重みの倍率（-20dB を過ぎた声は、今の大きさに加えてこれだけ軽く見る） */
const TAIL_WEIGHT = 0.3;

/** 素材の左右の配列から包絡を作る（ENVELOPE_STEP 秒ごとの実効値を最大からの dB にする）。 */
export function envelopeOf(channels: ArrayLike<number>[], sampleRate: number): Envelope {
  const hop = Math.max(1, Math.round(ENVELOPE_STEP * sampleRate));
  const n = channels[0]?.length ?? 0;
  const steps = Math.max(1, Math.ceil(n / hop));
  const ms = new Float64Array(steps);
  let max = 0;
  for (let k = 0; k < steps; k++) {
    let e = 0;
    const a = k * hop;
    const b = Math.min(n, a + hop);
    for (const ch of channels) for (let i = a; i < b; i++) e += ch[i] * ch[i];
    ms[k] = e / Math.max(1, (b - a) * channels.length);
    max = Math.max(max, ms[k]);
  }
  const db = new Float32Array(steps);
  let last = 0;
  for (let k = 0; k < steps; k++) {
    db[k] = Math.max(-90, 10 * Math.log10((ms[k] + 1e-20) / (max || 1)));
    if (db[k] > -20) last = k;
  }
  return { db, tail20: (last + 1) * ENVELOPE_STEP };
}

export class VoiceAllocator {
  private active: Slot[] = [];
  private nextId = 1;
  dropped = 0;
  stolen = 0;
  /** 余韻を絞って新しい頭を通した回数（stolen の内数） */
  stolenTails = 0;
  peak = 0;

  constructor(
    private readonly max: number = VOICES.max,
    private readonly categories: Record<VoiceCategory, { max: number; priority: number }> = VOICES.categories,
  ) {}

  importanceOf(category: VoiceCategory, loudness: number): number {
    return this.categories[category].priority * Math.max(1e-4, loudness);
  }

  /** 声の今の大きさ（鳴り始めを 1 とした倍率）。まだ鳴り始めていない声（音速の遅れ）は 1。 */
  levelAt(s: Slot, now: number): number {
    if (!s.env || now <= s.start) return 1;
    const k = Math.floor(((now - s.start) * s.rate) / ENVELOPE_STEP);
    const db = k < s.env.db.length ? s.env.db[k] : -90;
    return 10 ** (db / 20);
  }

  /** 余韻に入っているか（素材の最大から -20dB を最後に下回った時刻を過ぎた）。 */
  inTail(s: Slot, now: number): boolean {
    return s.env !== null && now > s.start && (now - s.start) * s.rate >= s.env.tail20;
  }

  /** 今の重み：優先度×鳴り始めの大きさ×今の大きさ（余韻ならさらに軽く）。 */
  currentImportance(s: Slot, now: number): number {
    return s.importance * this.levelAt(s, now) * (this.inTail(s, now) ? TAIL_WEIGHT : 1);
  }

  /** 終わった声を片付ける。 */
  prune(now: number): void {
    if (this.active.length && this.active.some((s) => s.end <= now)) this.active = this.active.filter((s) => s.end > now);
  }

  get count(): number {
    return this.active.length;
  }

  countOf(category: VoiceCategory): number {
    let n = 0;
    for (const s of this.active) if (s.category === category) n++;
    return n;
  }

  /** 同じ種類の声の「今の大きさ」の和（except は数えない）。 */
  private stackOf(category: VoiceCategory, now: number, except: number | null): number {
    let sum = 0;
    for (const s of this.active) if (s.category === category && s.id !== except) sum += Math.min(1, this.levelAt(s, now));
    return sum;
  }

  /** 新しい声を鳴らしてよいか。loudness は聞く位置での倍率（0〜1 くらい）。 */
  request(category: VoiceCategory, loudness: number, now: number): Decision {
    this.prune(now);
    const imp = this.importanceOf(category, loudness);
    const same = this.active.filter((s) => s.category === category);
    let pool: Slot[] | null = null;
    if (same.length >= this.categories[category].max) pool = same;
    else if (this.active.length >= this.max) pool = this.active;
    if (!pool) return { accept: true, steal: null, stack: this.stackOf(category, now, null) };
    // 1) 余韻を譲る：同じ種類なら最も古い余韻を、全体の上限なら今の重みが新しい頭より小さい余韻のうち最も古いものを絞る
    let oldestTail: Slot | null = null;
    for (const s of pool) {
      if (!this.inTail(s, now)) continue;
      if (pool !== same && this.currentImportance(s, now) >= imp) continue;
      if (!oldestTail || s.start < oldestTail.start) oldestTail = s;
    }
    if (oldestTail) {
      this.stolen++;
      this.stolenTails++;
      return { accept: true, steal: oldestTail.id, stack: this.stackOf(category, now, oldestTail.id), reason: 'tail' };
    }
    // 2) 余韻が無ければ、今の重みの一番小さい声と比べる（新しい音のほうが小さければ鳴らさない）
    let weakest = pool[0];
    let weakestImp = this.currentImportance(weakest, now);
    for (const s of pool) {
      const c = this.currentImportance(s, now);
      if (c < weakestImp) {
        weakest = s;
        weakestImp = c;
      }
    }
    if (weakestImp >= imp) {
      this.dropped++;
      return { accept: false, steal: null, stack: this.stackOf(category, now, null) };
    }
    this.stolen++;
    return { accept: true, steal: weakest.id, stack: this.stackOf(category, now, weakest.id), reason: 'weaker' };
  }

  /** 受け入れた声を登録して番号を返す。timing が無ければ、今から鳴り終わりまで同じ大きさとみなす。 */
  add(category: VoiceCategory, loudness: number, end: number, timing: SlotTiming = {}): number {
    const id = this.nextId++;
    this.active.push({ id, category, importance: this.importanceOf(category, loudness), start: timing.start ?? -Infinity, end, env: timing.env ?? null, rate: timing.rate ?? 1 });
    this.peak = Math.max(this.peak, this.active.length);
    return id;
  }

  remove(id: number): void {
    const i = this.active.findIndex((s) => s.id === id);
    if (i >= 0) this.active.splice(i, 1);
  }

  clear(): void {
    this.active = [];
  }
}

/** 同じ種類が stack 個ぶん（今の大きさの和）鳴っているときの、新しい声の倍率。 */
export function stackGain(stack: number): number {
  return 1 / Math.sqrt(1 + VOICES.stackK * Math.max(0, stack));
}
