// OWNER: tests
// 竜のクリップ選び（src/dragon/animState.ts）の純粋な計算：意図から、どのクリップがどの重み・時刻で見えるか。
// クリップの長さ・区切り・歩幅は、Blender のスクリプトが GLB と一緒に書く報告（tools/blender/dragon-report.json）から読む。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAGON_CLIPS, type DragonClipName } from '../../src/config/dragon';
import { AnimState, actionClipTime, type ClipTable } from '../../src/dragon/animState';
import { createIntent, type DragonIntent } from '../../src/dragon/intent';

const report = JSON.parse(readFileSync(new URL('../../tools/blender/dragon-report.json', import.meta.url), 'utf8')) as {
  clips: ClipTable;
  triangles: { lod0: number; lod1: number };
};
const CLIPS = report.clips;
const DT = 1 / 60;

/** dt 刻みで seconds 秒ぶん同じ意図を流し、1コマでいちばん大きく変わった重みを返す。 */
function run(state: AnimState, it: DragonIntent, seconds: number): number {
  let maxStep = 0;
  const prev = Object.fromEntries(DRAGON_CLIPS.map((n) => [n, state.clip[n].weight])) as Record<DragonClipName, number>;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    state.update(it, DT);
    for (const n of DRAGON_CLIPS) {
      maxStep = Math.max(maxStep, Math.abs(state.clip[n].weight - prev[n]));
      prev[n] = state.clip[n].weight;
    }
  }
  return maxStep;
}

function grounded(speed = 0): DragonIntent {
  const it = createIntent();
  it.mode = 'ground';
  it.grounded = true;
  it.speed = speed;
  it.gait = speed > 11 ? 'run' : speed > 0.5 ? 'walk' : 'idle';
  return it;
}

describe('GLB のクリップの報告', () => {
  it('12本のクリップが実行時の名前と同じで、歩き・走りは歩幅を持ち、足が滑らない', () => {
    expect(Object.keys(CLIPS).sort()).toEqual([...DRAGON_CLIPS].sort());
    for (const name of ['walk', 'run'] as const) {
      const c = CLIPS[name] as ClipTable['walk'] & { maxSlide: number };
      expect(c.stride).toBeGreaterThan(5);
      expect(c.maxSlide).toBeLessThan(0.1);
    }
    expect(CLIPS.run.stride!).toBeGreaterThan(CLIPS.walk.stride!);
    for (const name of ['claw', 'tail', 'roar'] as const) {
      const m = CLIPS[name].marks!;
      expect(m.windup[1]).toBe(m.active[0]);
      expect(m.active[1]).toBe(m.recovery[0]);
      expect(m.recovery[1]).toBeCloseTo(CLIPS[name].duration, 5);
    }
  });

  it('三角形の数：近景 6万〜12万、遠景は2万前後', () => {
    expect(report.triangles.lod0).toBeGreaterThanOrEqual(60_000);
    expect(report.triangles.lod0).toBeLessThanOrEqual(120_000);
    expect(report.triangles.lod1).toBeGreaterThan(15_000);
    expect(report.triangles.lod1).toBeLessThan(25_000);
  });
});

describe('移動のクリップ（重みの和は1）', () => {
  it('地上で止まると idle、歩きの速さで walk、走りの速さで run が目立ち、切り替えは瞬間ではない', () => {
    const s = new AnimState(CLIPS);
    run(s, grounded(0), 1);
    expect(s.dominant()).toBe('idle');
    const it = grounded(7);
    s.update(it, DT);
    expect(s.clip.walk.weight).toBeLessThan(0.3);
    const step = run(s, it, 2);
    expect(s.dominant()).toBe('walk');
    expect(step).toBeLessThan(0.1);
    run(s, grounded(22), 2);
    expect(s.dominant()).toBe('run');
    const sum = (['idle', 'walk', 'run', 'fly', 'glide', 'dive'] as const).reduce((a, n) => a + s.clip[n].weight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('歩きの位相は「速さ÷歩幅」で進む（遊びの側の位相と同じ速さなら、2秒で 速さ×2÷歩幅 周）', () => {
    const s = new AnimState(CLIPS);
    const it = grounded(7.5);
    const stride = CLIPS.walk.stride!;
    s.update(it, DT);
    const start = s.gaitPhase;
    let total = 0;
    for (let k = 0; k < 120; k++) {
      it.gaitPhase = (it.gaitPhase + (DT * it.speed) / stride) % 1;
      const before = s.gaitPhase;
      s.update(it, DT);
      total += (s.gaitPhase - before + 1) % 1;
    }
    expect(total).toBeCloseTo((2 * 7.5) / stride, 1);
    expect(s.clip.walk.time).toBeCloseTo(s.gaitPhase * CLIPS.walk.duration, 6);
    expect(start).toBeGreaterThanOrEqual(0);
  });

  it('空中：羽ばたきが強いと fly、弱いと glide、急降下は dive。羽ばたきの時刻は遊びの側の位相', () => {
    const s = new AnimState(CLIPS);
    const it = createIntent();
    it.flapStrength = 1;
    it.flapPhase = 0.25;
    run(s, it, 2);
    expect(s.dominant()).toBe('fly');
    expect(s.clip.fly.time).toBeCloseTo(0.25 * CLIPS.fly.duration, 6);
    it.flapStrength = 0;
    run(s, it, 2);
    expect(s.dominant()).toBe('glide');
    it.mode = 'dive';
    run(s, it, 2);
    expect(s.dominant()).toBe('dive');
  });
});

describe('一度きりのクリップ（離陸・着地）', () => {
  it('地面を離れた瞬間に takeoff、着いた瞬間に land が1回ずつ流れ、長さが過ぎると消える', () => {
    const s = new AnimState(CLIPS);
    run(s, grounded(0), 0.5);
    const air = createIntent();
    let step = run(s, air, 0.3);
    expect(s.starts.takeoff).toBe(1);
    expect(s.clip.takeoff.weight).toBeGreaterThan(0.5);
    step = Math.max(step, run(s, air, 2));
    expect(s.clip.takeoff.weight).toBeLessThan(0.01);
    const down = grounded(0);
    down.landingImpact = 1;
    step = Math.max(step, run(s, down, 0.2));
    expect(s.starts.land).toBe(1);
    expect(s.clip.land.weight).toBeGreaterThan(0.5);
    expect(s.landImpact).toBe(1);
    step = Math.max(step, run(s, down, 2));
    expect(s.clip.land.weight).toBeLessThan(0.01);
    // 60コマ/秒で、1コマの重みの変化は 0.4 まで（瞬間の切り替えなら 1 になる）
    expect(step).toBeLessThan(0.4);
  });
});

describe('技のクリップ', () => {
  it('遊びの側の段階（振りかぶり・当たり・戻り）を、クリップの区切りの中の時刻に写す', () => {
    const marks = CLIPS.claw.marks!;
    expect(actionClipTime({ phase: 'none', time: 0, duration: 0 }, marks, 0.123)).toBe(0.123);
    expect(actionClipTime({ phase: 'windup', time: 0.1, duration: 0.2 }, marks, 0)).toBeCloseTo(marks.windup[0] + 0.5 * (marks.windup[1] - marks.windup[0]), 6);
    expect(actionClipTime({ phase: 'active', time: 1, duration: 0.1 }, marks, 0)).toBeCloseTo(marks.active[1], 6);
    expect(actionClipTime({ phase: 'recovery', time: 0, duration: 0.3 }, marks, 0)).toBeCloseTo(marks.recovery[0], 6);
  });

  it('爪・尾・咆哮は段階が始まると重みが上がり、終わると下がる。始まった回数を数える', () => {
    for (const name of ['claw', 'tail', 'roar'] as const) {
      const s = new AnimState(CLIPS);
      const it = grounded(0);
      run(s, it, 0.5);
      it[name] = { phase: 'windup', time: 0, duration: 0.3 };
      let step = 0;
      for (let k = 0; k < 18; k++) {
        it[name].time += DT;
        step = Math.max(step, run(s, it, DT));
      }
      expect(s.clip[name].weight).toBeGreaterThan(0.9);
      expect(s.starts[name]).toBe(1);
      expect(s.dominant()).toBe(name);
      it[name] = { phase: 'none', time: 0, duration: 0 };
      step = Math.max(step, run(s, it, 1.5));
      expect(s.clip[name].weight).toBeLessThan(0.01);
      expect(step).toBeLessThan(0.4);
    }
  });

  it('炎：溜めの間は charge の区切り、吐き始めると loop の区切りの中を回り続ける', () => {
    const s = new AnimState(CLIPS);
    const it = grounded(0);
    const m = CLIPS.breath.marks!;
    it.breath.charge = 0.5;
    run(s, it, 0.2);
    expect(s.clip.breath.time).toBeCloseTo(0.5 * m.charge[1], 6);
    it.breath.active = true;
    run(s, it, 5);
    expect(s.starts.breath).toBe(1);
    expect(s.clip.breath.time).toBeGreaterThanOrEqual(m.loop[0]);
    expect(s.clip.breath.time).toBeLessThanOrEqual(m.loop[1]);
    expect(s.dominant()).toBe('breath');
  });
});
