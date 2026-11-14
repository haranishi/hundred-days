/**
 * 小さな画像を描く時点（three.js に依存しない）。
 * at を省いた時は、上半身つき（body: true）の単語は「最初の止まる区間の真ん中」、それ以外は最後の形（hand-r2 で変更）。
 * 単語は最後が同じ形の語がある（おはよう・こんにちは・こんばんは はどれも「あいさつ」で終わる）ので、最後の形では見分けられない。
 * 最初の止まる区間は、その語の最初の部分の形（朝のこぶし・昼の2本指・夜の開いた手）を見せている所。
 */
import type { SignSpec, ThumbnailOptions } from '../types';
import { clamp, distance } from './math';
import type { CompiledSign, CompiledTrack } from './timeline';

type Key = CompiledTrack['keys'][number];

function samePose(a: Key['pose'], b: Key['pose']): boolean {
  if (a === b) return true;
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
    const x = a[f] as unknown as Record<string, number>, y = b[f] as unknown as Record<string, number>;
    for (const k of Object.keys(x)) if (Math.abs(x[k]! - y[k]!) > 1e-9) return false;
  }
  return true;
}

/** 2つの Keyframe で、手の位置・向き・形が同じか */
function sameKey(a: Key, b: Key): boolean {
  const qd = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3];
  return distance(a.anchor, b.anchor) < 1e-6 && Math.abs(qd) > 1 - 1e-9 && samePose(a.pose, b.pose);
}

/** 時刻 m（区間の中ほど）で、この手が止まっているか */
function stillAt(tr: CompiledTrack, m: number): boolean {
  const k = tr.keys;
  if (k.length <= 1 || m <= k[0]!.t || m >= k[k.length - 1]!.t) return true;
  let i = 0;
  while (i < k.length - 2 && m >= k[i + 1]!.t) i++;
  return sameKey(k[i]!, k[i + 1]!);
}

/**
 * 最初の止まる区間: どの手も位置・向き・形が変わらない区間のうち、いちばん早いもの（止まる Keyframe が続く間はつなげる）。
 * 空中に字を書く間は止まっていない。無ければ null
 */
export function firstHold(c: CompiledSign): { t0: number; t1: number } | null {
  const tracks = [c.dominant, c.nonDominant].filter((x): x is CompiledTrack => !!x);
  const set = new Set<number>([0, c.duration]);
  for (const tr of tracks) for (const k of tr.keys) set.add(clamp(k.t, 0, c.duration));
  if (c.trace) set.add(c.trace.tStart).add(c.trace.tEnd);
  const ts = [...set].sort((a, b) => a - b);
  let start: number | null = null;
  let end = 0;
  for (let j = 0; j + 1 < ts.length; j++) {
    const a = ts[j]!, b = ts[j + 1]!;
    if (b - a < 1e-9) continue;
    const m = (a + b) / 2;
    const writing = !!c.trace && m > c.trace.tStart && m < c.trace.tEnd;
    if (!writing && tracks.every((tr) => stillAt(tr, m))) {
      if (start === null) start = a;
      end = b;
    } else if (start !== null) break;
  }
  return start === null ? null : { t0: start, t1: end };
}

/** 小さな画像を描く時刻（秒） */
export function thumbnailTime(spec: SignSpec, c: CompiledSign, at: ThumbnailOptions['at']): number {
  if (at === 'start') return 0;
  if (at === 'end') return c.duration;
  if (typeof at === 'number') return clamp(at, 0, c.duration);
  if (!spec.body) return c.duration;
  const h = firstHold(c);
  return h ? (h.t0 + h.t1) / 2 : c.duration;
}

/** at を省いた時の既定（キャッシュの鍵に使う名前）。上半身つきは 'firstHold'、それ以外は 'end' */
export function defaultThumbnailAt(spec: SignSpec): 'firstHold' | 'end' {
  return spec.body ? 'firstHold' : 'end';
}
