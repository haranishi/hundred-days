import { describe, expect, it } from 'vitest';
import type { SignSpec, Vec3 } from '../../../src/hand/types';
import { ITEMS } from '../../../src/content';
import { fingerspellTokens, tokenSpec } from '../../../src/content/spell';
import { add, catmullRom, distance, mulMV } from '../../../src/hand/core/math';
import { PALM_CENTER } from '../../../src/hand/core/skeleton';
import { compileSign, sampleTrack, type CompiledTrack, type HandState } from '../../../src/hand/core/timeline';
import { resolvePosition } from '../../../src/hand/core/body';

/** 手のひらの中心（Keyframe の pos が指す点）。手のひらの長さ＝1 なので 0.01 が約1mm */
const anchorOf = (h: HandState): Vec3 => add(h.wrist, mulMV(h.rot, PALM_CENTER));
const MM = 0.01;

/** 濁音・半濁音・小さい字（合成して動く指文字） */
const COMPOSED = 'がぎぐげござじずぜぞだぢづでどばびぶべぼゔぱぴぷぺぽっゃゅょぁぃぅぇぉゎ';

/** 全単語・全数字・動く指文字（の・も・り・を・ん・のばす音・変化5種の例）と、合成した指文字 */
function movingSigns(): Array<{ id: string; spec: SignSpec }> {
  const out: Array<{ id: string; spec: SignSpec }> = [];
  for (const i of ITEMS) if (i.kind === 'word' || i.kind === 'number' || i.dynamic) out.push({ id: i.id, spec: i.sign });
  for (const ch of Array.from(COMPOSED)) {
    const tok = fingerspellTokens(ch)[0];
    const spec = tok && tokenSpec(tok);
    if (spec) out.push({ id: `compose-${ch}`, spec });
  }
  return out;
}

/** 止まる区間: 続く2つの Keyframe の位置（手のひらの中心）が同じで、時刻が進む区間 */
function holds(tr: CompiledTrack): Array<{ t0: number; t1: number; at: Vec3 }> {
  const out: Array<{ t0: number; t1: number; at: Vec3 }> = [];
  for (let i = 0; i + 1 < tr.keys.length; i++) {
    const a = tr.keys[i]!, b = tr.keys[i + 1]!;
    if (b.t > a.t && distance(a.anchor, b.anchor) < 1e-9) out.push({ t0: a.t, t1: b.t, at: a.anchor });
  }
  return out;
}

describe('止まる区間で位置が行き過ぎない（Keyframe の位置の補間）', () => {
  it('全単語・全数字・動く指文字を細かく刻んで再生し、止まる区間の位置からのずれが 1mm 以内', () => {
    const signs = movingSigns();
    expect(signs.filter((s) => s.id.startsWith('word-')).length).toBe(16);
    expect(signs.filter((s) => s.id.startsWith('num-')).length).toBe(13);
    let intervals = 0;
    let worst = { dev: 0, id: '' };
    for (const { id, spec } of signs) {
      const c = compileSign(spec);
      for (const tr of [c.dominant, c.nonDominant]) {
        if (!tr) continue;
        for (const h of holds(tr)) {
          intervals++;
          // 1ms ごと（短い区間でも 40 点以上）に刻む
          const n = Math.max(40, Math.ceil((h.t1 - h.t0) / 0.001));
          for (let k = 0; k <= n; k++) {
            const t = h.t0 + ((h.t1 - h.t0) * k) / n;
            const dev = distance(anchorOf(sampleTrack(tr, t)), h.at);
            if (dev > worst.dev) worst = { dev, id: `${id}（${tr.side}・${h.t0.toFixed(3)}〜${h.t1.toFixed(3)}秒・t=${t.toFixed(4)}）` };
          }
        }
      }
    }
    // 試験が空振りしていないこと（止まる区間がたくさんある）
    expect(intervals).toBeGreaterThan(150);
    expect(worst.dev, `いちばん大きいずれ: ${worst.id}`).toBeLessThanOrEqual(MM);
  });

  it('止まる区間の前後に Keyframe を足さなくても（EPS の短い区間なしで）、触れて止まる間は動かない', () => {
    const p = (z: number) => ({ at: 'neutral' as const, offset: [0, 0, z] as Vec3 });
    const spec: SignSpec = {
      hands: {
        dominant: {
          keyframes: [
            { t: 0, shape: { fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' }, thumb: 'alongside' }, orient: { palm: 'toSigner', fingers: 'up' }, pos: p(1) },
            { t: 0.5, pos: p(0) },
            { t: 1.0 }, // 触れたまま止まる
            { t: 1.5, pos: p(0.8) },
          ],
        },
      },
    };
    const c = compileSign(spec);
    const stop = resolvePosition(p(0));
    let worst = 0;
    for (let k = 0; k <= 500; k++) worst = Math.max(worst, distance(anchorOf(sampleTrack(c.dominant, 0.5 + (0.5 * k) / 500)), stop));
    expect(worst).toBeLessThan(1e-9);
    // 止まる区間に着く前・離れた後も、止まる位置より奥（体の側）へ行き過ぎない
    let deepest = Infinity;
    for (let k = 0; k <= 1500; k++) deepest = Math.min(deepest, anchorOf(sampleTrack(c.dominant, (1.5 * k) / 1500))[2]);
    expect(deepest).toBeGreaterThan(stop[2] - 1e-9);
  });

  it('止まる区間に接しない Keyframe の間は、今までどおりの曲線（Catmull-Rom）で通る', () => {
    const pts: Vec3[] = [[0, 0, 0], [1, 0.5, 0], [2, -0.2, 0.4], [3, 0.3, 0.1]];
    const spec: SignSpec = {
      hands: {
        dominant: {
          keyframes: pts.map((q, i) => ({ t: i, pos: q, ease: 'linear' as const, ...(i === 0 ? { orient: { palm: 'toViewer' as const, fingers: 'up' as const } } : {}) })),
        },
      },
    };
    const c = compileSign(spec);
    for (let i = 0; i < 3; i++) {
      for (const u of [0.25, 0.5, 0.75]) {
        const want = catmullRom(pts[i - 1] ?? pts[i]!, pts[i]!, pts[i + 1]!, pts[i + 2] ?? pts[i + 1]!, u);
        expect(distance(anchorOf(sampleTrack(c.dominant, i + u)), want)).toBeLessThan(1e-9);
      }
    }
  });
});
