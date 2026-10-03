// OWNER: tests
// r05-audio：曲の終わりを時間切れに合わせる仕組み（src/audio/music.ts）を、作り物の音の土台の上で3分ぶん進めて確かめる。
// 遊びの時計はヒットストップで実時間より遅れる（ここでは速さ 0.96〜0.98）。曲は 63 小節目の後に小節を足して待ち、71 小節の大太鼓を時間切れに合わせる。
// r06-audio：足す小節は溜めの塊（目録の music.hold）の小節を頭から順に。端数の拍は溜めの塊の最後（長胴のつなぎ）の終わりの拍。
import { describe, expect, it } from 'vitest';
import type { MusicInfo } from '../../src/audio/assets';
import { MusicPlayer, holdIndexFor } from '../../src/audio/music';
import { MUSIC_END } from '../../src/config/audio';

class FakeParam {
  value = 1;
  cancelScheduledValues(): void {}
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  setTargetAtTime(): void {}
}

class FakeNode {
  gain = new FakeParam();
  connect<T>(n?: T): T | this {
    return n ?? this;
  }
  disconnect(): void {}
}

interface Played {
  file: string;
  at: number;
  offset: number;
  stopAt: number;
}

function makeWorld({ hold = true } = {}) {
  const played: Played[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => new FakeNode(),
    createBufferSource: () => {
      const node = new FakeNode() as FakeNode & { buffer: { file: string } | null; loop: boolean; loopStart: number; loopEnd: number; onended: (() => void) | null; start: (when: number, offset?: number) => void; stop: (when?: number) => void };
      let rec: Played | null = null;
      node.buffer = null;
      node.loop = false;
      node.loopStart = 0;
      node.loopEnd = 0;
      node.onended = null;
      node.start = (when: number, offset = 0) => {
        rec = { file: node.buffer?.file ?? '?', at: when, offset, stopAt: Infinity };
        played.push(rec);
      };
      node.stop = (when = 0) => {
        if (rec) rec.stopAt = when;
      };
      return node;
    },
  };
  const chunks = (s: string): string[] => Array.from({ length: 18 }, (_, k) => `music/${s}_${String(k + 1).padStart(2, '0')}.ogg`);
  const info: MusicInfo = {
    bpm: 96,
    beatsPerBar: 4,
    bars: 72,
    barSeconds: 2.5,
    beatSeconds: 0.625,
    length: 180,
    chunkSeconds: 10,
    pad: 0.1,
    stems: ['calm', 'rampage', 'peak'],
    chunks: { calm: chunks('calm'), rampage: chunks('rampage'), peak: chunks('peak') },
    fills: [],
    fillLead: 0.625,
    sections: [],
    ...(hold ? { hold: { bars: 5, holds: 4, leadIn: 4, seconds: 12.5, chunks: { calm: 'music/calm_hold.ogg', rampage: 'music/rampage_hold.ogg', peak: 'music/peak_hold.ogg' } } } : {}),
  };
  const store = { get: (file: string) => ({ file, duration: 10.2 }), has: () => true, load: async () => null, drop: () => undefined, loadAll: async () => undefined };
  const mixer = { ctx, musicIn: new FakeNode() };
  // 作り物の土台は型の一部しか持たないので、ここだけ型を外して渡す
  const m = new MusicPlayer(mixer as never, store as never, info);
  return { ctx, m, played };
}

/** 曲を songAt に始め、遊びの時計を rate の速さで進めて、時間切れ（ゲーム内 180 秒）を受けるまで回す。 */
function runSession(rate: number, songAt: number, opts: { hold?: boolean; onFrame?: (m: MusicPlayer, t: number) => void } = {}) {
  const w = makeWorld({ hold: opts.hold ?? true });
  let clock = 0;
  let started = false;
  let end: ReturnType<MusicPlayer['endSession']> = null;
  let songStartBefore = 0;
  for (let t = 0; t < 200; t += 1 / 60) {
    w.ctx.currentTime = t;
    if (!started && t >= songAt) {
      w.m.play(t, 0);
      started = true;
    }
    const playing = clock < 180;
    if (playing) clock = Math.min(180, clock + rate / 60);
    if (started) {
      w.m.setGame(t, clock, 180 - clock, clock < 180);
      w.m.update(t);
      opts.onFrame?.(w.m, t);
      if (!end && clock >= 180) {
        songStartBefore = w.m.start;
        end = w.m.endSession(t);
      }
    }
  }
  return { ...w, end, songStartBefore };
}

describe('曲の終わりを時間切れに合わせる（MusicPlayer）', () => {
  for (const rate of [0.96, 0.975, 0.99]) {
    it(`遊びの時計の速さ ${rate}：63 小節目を繰り返して待ち、71 小節の大太鼓が時間切れから 0.5 秒以内に鳴る`, () => {
      const { end, m, played } = runSession(rate, 0.05);
      expect(end).not.toBeNull();
      const e = end!;
      expect(e.extensionBars).toBeGreaterThan(0);
      expect(Math.abs((e.finalAt as number) - e.sessionEndAt)).toBeLessThanOrEqual(0.5);
      // 71 小節の頭（塊 18 の中の 0.1 + 5 秒の所）が、その時刻に鳴る区間がある（跳んだときは、そこから始まる区間）
      const at71 = (p: Played): number => p.at + (0.1 + 2 * 2.5 - p.offset);
      const finalSrc = played.find((p) => p.file === 'music/calm_18.ogg' && p.offset <= 0.1 + 2 * 2.5 + 1e-6 && p.stopAt > at71(p) && Math.abs(at71(p) - (e.finalAt as number)) < 0.02);
      expect(finalSrc).toBeDefined();
      expect(m.finalAt).toBeCloseTo(e.finalAt as number, 6);
    });
  }

  it('r06-audio：足す小節は溜めの小節を頭から順に鳴らし（同じ波形を続けない）、端数の拍はつなぎの小節の終わりの拍。拍の並びは崩れない', () => {
    const { m, played, end } = runSession(0.97, 0.05);
    const first = played.find((p) => p.file === 'music/calm_01.ogg');
    const origin = (first as Played).at - ((first as Played).offset - 0.1);
    const x = MUSIC_END.crossfadeSeconds;
    const holds = played.filter((p) => p.file === 'music/calm_hold.ogg').sort((a, b) => a.at - b.at);
    const full = Math.floor(m.extensionBars);
    const beats = Math.round((m.extensionBars - full) * 4);
    expect(full).toBeGreaterThan(0);
    // 溜めの小節の頭（塊の中の 0.1 + k×2.5 秒、最初の1つは 20ms 前から重ねて入る）が、0 番から順に並ぶ
    const holdBars = holds.filter((p) => p.stopAt - p.at > 2).map((p) => Math.round((p.offset - 0.1) / 2.5) + 0);
    expect(holdBars).toEqual(Array.from({ length: full }, (_, k) => holdIndexFor(k, 4)));
    for (let k = 1; k < holdBars.length; k++) expect(holdBars[k]).not.toBe(holdBars[k - 1]);
    // 63 小節目（塊 16 の3小節目）は1回しか鳴らない（同じ小節の繰り返しにしない）
    const bar63 = played.filter((p) => p.file === 'music/calm_16.ogg' && p.offset <= 0.1 + 2 * 2.5 + 1e-6 && p.offset + (p.stopAt - p.at) > 0.1 + 3 * 2.5 - 1e-6 && p.at < (end as NonNullable<typeof end>).sessionEndAt);
    expect(bar63.length).toBe(1);
    // 端数の拍：つなぎの小節（溜めの塊の 4 番）の終わりの beats 拍
    if (beats > 0) {
      // つなぎの小節（塊の 0.1 + 4×2.5 秒から）の中から始まる区間がちょうど1つ。始まりは終わりから beats 拍前（20ms 前から重ねて入る）
      const partials = holds.filter((p) => p.offset > 0.1 + 4 * 2.5 - x - 1e-6);
      expect(partials.length).toBe(1);
      const tailStart = 0.1 + 5 * 2.5 - beats * 0.625;
      expect(Math.min(Math.abs(partials[0].offset - tailStart), Math.abs(partials[0].offset - (tailStart - x)))).toBeLessThan(1e-6);
      // 64 小節目へ重ねて戻る：つなぎは 64 小節目の頭の 5ms 後に止まる
      expect(partials[0].stopAt - partials[0].at).toBeLessThan(beats * 0.625 + x + 0.0051);
    }
    // どの区間も、拍の頭（重ねてつなぐ所は 20ms 前）から鳴り始める
    const until = end!.cut ? end!.sessionEndAt : m.finalAt! - 1;
    for (const p of played.filter((q) => q.at > 1 && q.at < until)) {
      const k = (p.at - origin) / 0.625;
      const kx = (p.at + x - origin) / 0.625;
      expect(Math.min(Math.abs(k - Math.round(k)), Math.abs(kx - Math.round(kx)))).toBeLessThan(1e-6);
    }
  });

  it('溜めの塊が無い古い素材では、r05 と同じく 63 小節目を繰り返し、端数の拍は 63 小節目の終わりの拍', () => {
    const { m, played, end } = runSession(0.97, 0.05, { hold: false });
    expect(Math.abs((end!.finalAt as number) - end!.sessionEndAt)).toBeLessThanOrEqual(0.5);
    const repeats = played.filter((p) => p.file === 'music/calm_16.ogg' && Math.abs(p.offset - (0.1 + 2 * 2.5 - MUSIC_END.crossfadeSeconds)) < 0.002);
    expect(repeats.length).toBe(Math.floor(m.extensionBars));
    expect(played.some((p) => p.file.includes('hold'))).toBe(false);
  });

  it('r06-audio：小節の頭の並びの記録（grid）。端数の拍の後は新しい並び、その前に求めた段階の切り替えは前の並びの頭に置く', () => {
    const seenBeats = new Set<number>();
    for (const rate of [0.955, 0.96, 0.965, 0.97, 0.975, 0.98, 0.985]) {
      const req: { at: number }[] = [];
      let asked = false;
      const { m } = runSession(rate, 0.05, {
        onFrame: (mp, t) => {
          const a = mp.grid.find((g) => g.why === 'partial');
          // 端数の拍を並べた直後（その拍が始まる前）に段階を求める
          if (a && !asked && t < a.from - 0.7) {
            asked = true;
            const c = mp.requestStage(mp.stage === 2 ? 1 : 2, t);
            if (c) req.push({ at: c.at });
          }
        },
      });
      const i = m.grid.findIndex((g) => g.why === 'partial');
      if (i < 0) continue;
      const pa = m.grid[i];
      const old = m.grid[i - 1];
      seenBeats.add(Math.round((m.extensionBars % 1) * 4));
      expect(req.length).toBe(1);
      const on = (t: number, s0: number): boolean => Math.abs((t - s0) / 2.5 - Math.round((t - s0) / 2.5)) < 1e-6;
      // 新しい並びの頭（64 小節目の頭以降）か、前の並びの頭（端数の拍の前）のどちらか。端数の拍の途中や、溜めの小節の途中には置かない
      for (const r of req) expect((on(r.at, pa.songStart) && r.at >= pa.from - 1e-6) || (on(r.at, old.songStart) && r.at < pa.from), `rate ${rate}`).toBe(true);
    }
    // 2拍以上の端数（前の作りでは切り替えが前の小節の途中に落ちた）を少なくとも1回は確かめている
    expect([...seenBeats].some((b) => b >= 2)).toBe(true);
  });

  it('曲が遅れて始まり時間切れが先に来たら、71 小節目へ跳んで大太鼓を時間切れに合わせる', () => {
    const { end } = runSession(1, 8);
    expect(end).not.toBeNull();
    expect(end!.cut).toBe(true);
    expect(end!.extensionBars).toBe(0);
    expect(Math.abs((end!.finalAt as number) - end!.sessionEndAt)).toBeLessThanOrEqual(0.1);
  });
});
