// OWNER: tests
// 雷翼と焔角の GLB の報告（tools/blender/*-report.json。build_creature.py が GLB と一緒に書く）が、
// docs/CHARACTERS.md と指示書 r02-roster-models の約束（クリップの名前・区切り・歩幅・三角形の数・大きさ）を満たすか。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Clip {
  duration: number;
  loop: boolean;
  marks?: Record<string, [number, number]>;
  stride?: number;
  maxSlide?: number;
}
interface Report {
  blender: string;
  id: string;
  bones: number;
  clips: Record<string, Clip>;
  triangles: { lod0: number; lod1: number };
  dims: { length: number; span: number; height: number; shoulder: number };
}

const read = (name: string): Report => JSON.parse(readFileSync(new URL(`../../tools/blender/${name}-report.json`, import.meta.url), 'utf8')) as Report;
const raiyoku = read('raiyoku');
const homuratsuno = read('homuratsuno');

const EXPECTED = {
  raiyoku: ['idle', 'walk', 'run', 'takeoff', 'fly', 'glide', 'dive', 'land', 'breath', 'claw', 'tail', 'roar'],
  homuratsuno: ['idle', 'walk', 'run', 'jump', 'land', 'breath', 'claw', 'tail', 'roar', 'stomp'],
};

describe.each([
  ['raiyoku', raiyoku],
  ['homuratsuno', homuratsuno],
] as const)('%s の報告', (id, r) => {
  it('クリップの名前が指示書どおりで、歩き・走りは歩幅を持ち、足が滑らない', () => {
    expect(r.id).toBe(id);
    expect(Object.keys(r.clips).sort()).toEqual([...EXPECTED[id]].sort());
    for (const name of ['walk', 'run']) {
      const c = r.clips[name];
      expect(c.loop).toBe(true);
      expect(c.stride).toBeGreaterThan(5);
      expect(c.maxSlide).toBeLessThan(0.1);
    }
    expect(r.clips.run.stride!).toBeGreaterThan(r.clips.walk.stride!);
  });

  it('技のクリップの区切りは隙間なく並び、最後はクリップの長さで終わる', () => {
    for (const name of ['claw', 'tail', 'roar']) {
      const m = r.clips[name].marks!;
      expect(m.windup[0]).toBe(0);
      expect(m.windup[1]).toBe(m.active[0]);
      expect(m.active[1]).toBe(m.recovery[0]);
      expect(m.recovery[1]).toBeCloseTo(r.clips[name].duration, 5);
    }
    const b = r.clips.breath.marks!;
    expect(b.charge[1]).toBe(b.thrust[0]);
    expect(b.thrust[1]).toBe(b.loop[0]);
    expect(b.loop[1]).toBeCloseTo(r.clips.breath.duration, 5);
  });

  it('三角形の数：近景 6万〜10万、遠景は2万前後。Blender は 5.2', () => {
    expect(r.triangles.lod0).toBeGreaterThanOrEqual(60_000);
    expect(r.triangles.lod0).toBeLessThanOrEqual(100_000);
    expect(r.triangles.lod1).toBeGreaterThan(15_000);
    expect(r.triangles.lod1).toBeLessThanOrEqual(25_000);
    expect(r.blender).toMatch(/^5\.2/);
  });
});

describe('大きさ（休みの姿勢の測り）', () => {
  it('雷翼：全長およそ50m・翼を広げて95m', () => {
    expect(raiyoku.dims.length).toBeGreaterThan(45);
    expect(raiyoku.dims.length).toBeLessThan(56);
    expect(raiyoku.dims.span).toBeGreaterThan(90);
    expect(raiyoku.dims.span).toBeLessThan(100);
  });

  it('焔角：全長およそ55m・肩の高さ22m前後で、翼が無い（幅は胴と脚の分だけ）', () => {
    expect(homuratsuno.dims.length).toBeGreaterThan(50);
    expect(homuratsuno.dims.length).toBeLessThan(60);
    expect(homuratsuno.dims.shoulder).toBeGreaterThan(20);
    expect(homuratsuno.dims.shoulder).toBeLessThan(24.5);
    expect(homuratsuno.dims.span).toBeLessThan(20);
  });

  it('焔角は空を飛ばない（飛ぶクリップが無い）、雷翼は跳ばない（跳ぶクリップが無い）', () => {
    for (const name of ['takeoff', 'fly', 'glide', 'dive']) expect(homuratsuno.clips[name]).toBeUndefined();
    expect(raiyoku.clips.jump).toBeUndefined();
    expect(homuratsuno.clips.jump.marks!.crouch[0]).toBe(0);
    expect(homuratsuno.clips.stomp.marks!.active[0]).toBeGreaterThan(homuratsuno.clips.stomp.marks!.windup[0]);
  });
});
