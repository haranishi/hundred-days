// OWNER: tests
// 標本の口（?specimen=）の引数の読み取りと、怪獣の一覧（src/creatures/roster.ts）が GLB の報告と食い違っていないか。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAGON_LOOK } from '../../src/config/dragon';
import { CREATURES, CREATURE_IDS } from '../../src/creatures/roster';
import { parseSpecimenParams, showcaseTime } from '../../src/creatures/specimenParams';

const REPORTS: Record<string, string> = { kurenai: 'dragon', raiyoku: 'raiyoku', homuratsuno: 'homuratsuno' };
const clipsOf = (id: string): Record<string, { duration: number }> =>
  (JSON.parse(readFileSync(new URL(`../../tools/blender/${REPORTS[id]}-report.json`, import.meta.url), 'utf8')) as { clips: Record<string, { duration: number }> }).clips;

describe('?specimen= の引数', () => {
  it('無ければ null（ふだんの撮影と遊び）', () => {
    expect(parseSpecimenParams('?shot=street')).toBeNull();
    expect(parseSpecimenParams('')).toBeNull();
  });

  it('怪獣・クリップ・時刻・刻みを読む。クリップを省くと idle、時刻を省くと null（見せる時刻）', () => {
    expect(parseSpecimenParams('?specimen=raiyoku&clip=walk&shot=street')).toEqual({ target: 'raiyoku', clip: 'walk', time: null, step: 1 / 60, matte: false });
    expect(parseSpecimenParams('?specimen=kurenai&shot=profile&matte=1')!.matte).toBe(true);
    expect(parseSpecimenParams('?specimen=homuratsuno&clip=stomp&t=0.62&shot=closeup')).toMatchObject({ target: 'homuratsuno', clip: 'stomp', time: 0.62 });
    expect(parseSpecimenParams('?specimen=lineup&shot=profile')).toMatchObject({ target: 'lineup', clip: 'idle' });
    expect(parseSpecimenParams('?specimen=raiyoku&film=profile&step=0.05')!.step).toBeCloseTo(0.05, 6);
  });

  it('刻みは 1/240〜0.5 秒に収め、知らない名前と数でない時刻は起動エラーにする', () => {
    expect(parseSpecimenParams('?specimen=raiyoku&step=9')!.step).toBe(0.5);
    expect(parseSpecimenParams('?specimen=raiyoku&step=0')!.step).toBeCloseTo(1 / 240, 9);
    expect(() => parseSpecimenParams('?specimen=gold3heads')).toThrow('未知の標本');
    expect(() => parseSpecimenParams('?specimen=raiyoku&t=abc')).toThrow('数ではない');
  });
});

describe('怪獣の一覧', () => {
  it('3体の順と名前（CHARACTERS.md）', () => {
    expect([...CREATURE_IDS]).toEqual(['kurenai', 'raiyoku', 'homuratsuno']);
    expect(CREATURE_IDS.map((id) => CREATURES[id].name)).toEqual(['紅竜', '雷翼', '溶背']);
  });

  it('紅竜は r00c の材質のまま（数値も発光も足さない）', () => {
    expect(CREATURES.kurenai.material.key).toBe('dragon');
    expect(CREATURES.kurenai.material.look).toBe(DRAGON_LOOK);
    expect(CREATURES.kurenai.material.emit).toBeUndefined();
    expect(CREATURES.kurenai.url).toBe('assets/dragon.glb');
  });

  it('雷翼は発光の筋、焔角は溶岩を持つ', () => {
    expect(CREATURES.raiyoku.material.emit?.kind).toBe('stripes');
    expect(CREATURES.homuratsuno.material.emit?.kind).toBe('lava');
  });

  it.each([...CREATURE_IDS])('%s：見せる時刻と空中のクリップは、GLB にあるクリップの中にある', (id) => {
    const clips = clipsOf(id);
    for (const [name, t] of Object.entries(CREATURES[id].showcase)) {
      expect(clips[name], `${id} のクリップ ${name}`).toBeDefined();
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(clips[name].duration);
    }
    for (const name of CREATURES[id].airClips) expect(clips[name]).toBeDefined();
    expect(showcaseTime(id, 'no-such-clip')).toBe(0);
  });
});
