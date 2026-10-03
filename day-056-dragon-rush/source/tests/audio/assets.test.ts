// OWNER: tests
// 音の素材：目録（public/assets/audio/manifest.json）と実行時の表が食い違わないこと、変化の数・ピーク・ファイルの実在、
// そして生成が同じ種で同じ出力になること（tools/audio の合成を直接呼ぶ）。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMON_MONSTER_SOUNDS, LOOPS, MONSTER_SOUNDS, SOUNDS, type MonsterSoundId } from '../../src/config/audio';
import { CREATURE_CONFIG } from '../../src/config/creatures';

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIO = path.join(ROOT, 'public', 'assets', 'audio');
const manifest = JSON.parse(readFileSync(path.join(AUDIO, 'manifest.json'), 'utf8')) as {
  seed: number;
  monsters: string[];
  ir: Record<string, { file: string }>;
  sfx: Record<string, { loop: boolean; variants: { file: string; truePeakDb: number; seconds: number }[] }>;
  music: {
    stems: string[];
    chunks: Record<string, string[]>;
    fills: string[];
    bars: number;
    barSeconds: number;
    chunkSeconds: number;
    length: number;
    hold?: { bars: number; holds: number; leadIn: number; seconds: number; chunks: Record<string, string> };
    sourceSha1?: Record<string, string[] | Record<string, string>>;
    report: { stages: Record<string, { lufs: number; truePeakDb: number }>; hold?: { stages: Record<string, { lufs: number; truePeakDb: number; perBarLufs: number[] }> } };
  };
};

/** 実行時が引く音の名前を全部並べる（怪獣の音は、怪獣ごとの表に書いてある分だけ）。 */
function referencedBanks(): string[] {
  const out = new Set<string>();
  for (const def of Object.values(SOUNDS)) if (!def.bank.startsWith('@')) out.add(def.bank);
  for (const table of Object.values(MONSTER_SOUNDS)) for (const bank of Object.values(table)) if (bank) out.add(bank);
  out.add(LOOPS.fire.nearBank);
  out.add(LOOPS.fire.farBank);
  out.add(LOOPS.wind.bank);
  return [...out];
}

describe('怪獣ごとの音', () => {
  it('3体（紅竜・雷翼・焔角）とも、目録にあり、咆哮・前足と後ろ足の足音・着地を持つ', () => {
    expect(Object.keys(MONSTER_SOUNDS).sort()).toEqual(['dragon', 'homuratsuno', 'raiyoku']);
    expect([...manifest.monsters].sort()).toEqual(Object.keys(MONSTER_SOUNDS).sort());
    for (const [m, table] of Object.entries(MONSTER_SOUNDS)) for (const k of COMMON_MONSTER_SOUNDS) expect(table[k], `${m} ${k}`).toBe(`${m}/${k}`);
  });

  it('怪獣の表の \'@\' の音は、どれか1体以上の怪獣が持っている（名前の書き間違いが無い）', () => {
    for (const [id, def] of Object.entries(SOUNDS)) {
      if (!def.bank.startsWith('@')) continue;
      const key = def.bank.slice(1) as MonsterSoundId;
      expect(Object.values(MONSTER_SOUNDS).some((t) => t[key] !== undefined), id).toBe(true);
    }
  });

  it('主砲の音は怪獣ごとに違う作り（炎・雷・溶岩）で、羽ばたきは翼のある怪獣だけ', () => {
    expect(MONSTER_SOUNDS.dragon.breathLoop).toBeDefined();
    expect(MONSTER_SOUNDS.raiyoku.arc).toBeDefined();
    expect(MONSTER_SOUNDS.homuratsuno.breathHit).toBeDefined();
    expect(MONSTER_SOUNDS.homuratsuno.flap).toBeUndefined();
    expect(MONSTER_SOUNDS.raiyoku.flap).toBeDefined();
  });
});

describe('音の目録', () => {
  it('実行時の表が引く音は、すべて目録にあり、ファイルが実在する', () => {
    for (const bank of referencedBanks()) {
      const b = manifest.sfx[bank];
      expect(b, bank).toBeDefined();
      for (const v of b.variants) expect(existsSync(path.join(AUDIO, v.file)), v.file).toBe(true);
    }
    for (const ir of Object.values(manifest.ir)) expect(existsSync(path.join(AUDIO, ir.file))).toBe(true);
  });

  it('一発の効果音は1種につき3〜8個の変化を持つ（UI の知らせと繰り返しの下地は除く）', () => {
    for (const [name, b] of Object.entries(manifest.sfx)) {
      if (b.loop || name.startsWith('ui/')) continue;
      expect(b.variants.length, name).toBeGreaterThanOrEqual(3);
      expect(b.variants.length, name).toBeLessThanOrEqual(8);
    }
    // r05-audio：3分で百回前後鳴る音（ひび・ガラス・跳ねる雷・溶岩の着弾・焔角の足音）は 8 個
    // r06-audio：近い崩落も 8 個（崩れ方の型4つ）、焔角の短い咆哮は 6 個（うなり・鼻息・短い吠え）
    for (const name of ['building/crack', 'building/glass', 'raiyoku/arc', 'homuratsuno/breathHit', 'homuratsuno/stepFront', 'homuratsuno/stepHind', 'building/collapseNear']) expect(manifest.sfx[name].variants.length, name).toBe(8);
    expect(manifest.sfx['homuratsuno/roarShort'].variants.length).toBe(6);
  });

  it('効果音はクリップしない（エンコード前の真のピークが -1dBTP 以下）', () => {
    for (const [name, b] of Object.entries(manifest.sfx)) for (const v of b.variants) expect(v.truePeakDb, `${name} ${v.file}`).toBeLessThanOrEqual(-1);
  });

  it('BGM は 3分・72小節で、3つの層の塊がそろい、各段階が -18〜-14 LUFS・真のピーク -1dBTP 以下', () => {
    const m = manifest.music;
    expect(m.length).toBeCloseTo(180, 6);
    expect(m.bars * m.barSeconds).toBeCloseTo(m.length, 6);
    const counts = m.stems.map((s) => m.chunks[s].length);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0] * m.chunkSeconds).toBeCloseTo(m.length, 6);
    for (const s of m.stems) for (const f of m.chunks[s]) expect(existsSync(path.join(AUDIO, f)), f).toBe(true);
    for (const f of m.fills) expect(existsSync(path.join(AUDIO, f))).toBe(true);
    for (const [k, st] of Object.entries(m.report.stages)) {
      expect(st.lufs, k).toBeGreaterThanOrEqual(-18);
      expect(st.lufs, k).toBeLessThanOrEqual(-14);
      expect(st.truePeakDb, k).toBeLessThanOrEqual(-1);
    }
  });
});

describe('r06-audio：63 小節目の後に足す溜めの小節と、継ぎ目を比べる WAV の指紋', () => {
  it('溜めの塊は3つの層にそろい（溜め4小節＋つなぎ1小節、前後に糊しろ）、ファイルが実在する', () => {
    const h = manifest.music.hold;
    expect(h).toBeDefined();
    expect(h!.holds).toBe(4);
    expect(h!.leadIn).toBe(4);
    expect(h!.bars).toBe(5);
    expect(h!.seconds).toBeCloseTo(h!.bars * manifest.music.barSeconds, 6);
    expect(Object.keys(h!.chunks).sort()).toEqual([...manifest.music.stems].sort());
    for (const f of Object.values(h!.chunks)) expect(existsSync(path.join(AUDIO, f)), f).toBe(true);
  });

  it('溜めの塊の段階ごとの大きさは曲と同じ範囲（-18〜-14 LUFS・真のピーク -1dBTP 以下）で、溜めの小節は1回ごとに大きくなりすぎない', () => {
    const st = manifest.music.report.hold!.stages;
    for (const [k, v] of Object.entries(st)) {
      expect(v.lufs, k).toBeGreaterThanOrEqual(-18);
      expect(v.lufs, k).toBeLessThanOrEqual(-14);
      expect(v.truePeakDb, k).toBeLessThanOrEqual(-1);
      // 溜め4小節で上がるのは 3dB まで（盛り上がりは刻みの細かさで出し、64 小節目へ解ける所で萎ませない）
      expect(Math.max(...v.perBarLufs.slice(0, 4)) - v.perBarLufs[0], k).toBeLessThanOrEqual(3);
    }
  });

  it('曲の塊の WAV（エンコード前）の指紋が目録にある（tools/audio-render.mjs が継ぎ目を今の版の WAV と比べるため）', () => {
    const sha = manifest.music.sourceSha1!;
    for (const s of manifest.music.stems) {
      expect((sha[s] as string[]).length, s).toBe(manifest.music.chunks[s].length);
      for (const x of sha[s] as string[]) expect(x).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe('r05-audio：近い技の音は怪獣ごと', () => {
  it('振りの山の秒数（tools/audio/monsters.mjs）が、その怪獣の振りかぶりの秒数（src/config/creatures）と合う', async () => {
    const { MONSTERS } = (await import(/* @vite-ignore */ path.join(ROOT, 'tools', 'audio', 'monsters.mjs'))) as { MONSTERS: Record<string, { melee: { claw: { peak: number }; tail: { peak: number } } }> };
    for (const c of Object.values(CREATURE_CONFIG)) {
      const M = MONSTERS[c.sound];
      expect(M, c.id).toBeDefined();
      expect(Math.abs(M.melee.claw.peak - c.moves.near.windup), `${c.id} 右クリック`).toBeLessThanOrEqual(0.012);
      expect(Math.abs(M.melee.tail.peak - c.moves.sweep.windup), `${c.id} Q`).toBeLessThanOrEqual(0.012);
    }
  });

  it('紅竜の爪と尾は r04 までの attack/ の音と同じ作り（乱数の系列も前の名前から取る）、雷翼と焔角は別の作り', async () => {
    const { BANKS } = (await import(/* @vite-ignore */ path.join(ROOT, 'tools', 'audio', 'banks.mjs'))) as { BANKS: { name: string; seedName?: string }[] };
    for (const k of ['clawSwing', 'clawHit', 'tailSwing', 'tailHit']) {
      expect(BANKS.find((b) => b.name === `dragon/${k}`)?.seedName, k).toBe(`attack/${k}`);
      for (const m of ['raiyoku', 'homuratsuno']) expect(BANKS.find((b) => b.name === `${m}/${k}`)?.seedName, `${m} ${k}`).toBeUndefined();
      expect(manifest.sfx[`attack/${k}`], k).toBeUndefined();
    }
  });
});

describe('音の生成', () => {
  it('咆哮と足音（r02-audio で作り直した音）も、同じ種なら同じ出力になる', async () => {
    const lib = (p: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ path.join(ROOT, 'tools', 'audio', p));
    const { rngFor } = (await lib('lib/rng.mjs')) as { rngFor: (s: number, n: string, v: number) => unknown };
    const { BANKS } = (await lib('banks.mjs')) as { BANKS: { name: string; make: (r: unknown, c: unknown, v: number) => { audio: { l: Float32Array } } }[] };
    const { makeIR, IR_SPECS } = (await lib('lib/reverb.mjs')) as { makeIR: (r: unknown, s: unknown) => unknown; IR_SPECS: Record<string, unknown> };
    const ir = Object.fromEntries(['near', 'mid', 'far'].map((k) => [k, makeIR(rngFor(1, `ir.${k}`, 0), IR_SPECS[k])]));
    for (const name of ['raiyoku/stepFront', 'homuratsuno/roarShort', 'building/collapseNear']) {
      const B = BANKS.find((b) => b.name === name);
      expect(B, name).toBeDefined();
      const a = B!.make(rngFor(20260930, name, 1), { ir }, 1).audio.l;
      const b = B!.make(rngFor(20260930, name, 1), { ir }, 1).audio.l;
      expect(a.length, name).toBe(b.length);
      let same = true;
      for (let i = 0; i < a.length; i += 7) if (a[i] !== b[i]) same = false;
      expect(same, name).toBe(true);
    }
  }, 60_000);

  it('同じ種なら同じ音、違う種なら違う音になる', async () => {
    // tools は型の無い .mjs なので、パスを変数にして読み込む（型検査の対象から外す）
    const lib = (p: string): Promise<Record<string, (...a: unknown[]) => unknown>> => import(/* @vite-ignore */ path.join(ROOT, 'tools', 'audio', p));
    const { rngFor } = await lib('lib/rng.mjs');
    const { crack } = await lib('sfx/building.mjs');
    const make = (seed: number): Float32Array => (crack(rngFor(seed, 'building/crack', 1)) as { audio: { l: Float32Array } }).audio.l;
    const a = make(20260930);
    const b = make(20260930);
    const c = make(7);
    expect(a.length).toBe(b.length);
    let same = true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) same = false;
    expect(same).toBe(true);
    let diff = 0;
    for (let i = 0; i < Math.min(a.length, c.length); i++) diff += Math.abs(a[i] - c[i]);
    expect(diff).toBeGreaterThan(1);
  });
});
