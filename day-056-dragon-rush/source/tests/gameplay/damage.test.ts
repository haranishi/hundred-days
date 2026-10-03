// OWNER: tests
// 壊れ方の段階：ひび → 剥がれ → 傾き → 崩落 → 瓦礫の順に1段ずつ進み、一撃で耐久を超えても段階を飛ばさない。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { STAGES } from '../../src/config/gameplay';
import { DamageState, STAGE, stageForFraction, type StageChange } from '../../src/gameplay/damage';
import { generateCity } from '../../src/world/city';

const city = generateCity(CITY_CONFIG);
const midrise = city.buildings.find((b) => b.kind === 'tileMidrise' && b.height > 25)!;

function run(state: DamageState, seconds: number, changes: StageChange[], dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) state.update(dt, changes);
}

const claw = (fromX: number, fromZ: number) => ({ cause: 'claw' as const, fromX, fromZ, y: 12, player: true });

describe('壊れ方の段階', () => {
  it('損傷の割合から段階が決まる（しきい値ちょうどで入る）', () => {
    const [a, b, c, d] = STAGES.thresholds;
    expect(stageForFraction(0)).toBe(STAGE.intact);
    expect(stageForFraction(a)).toBe(STAGE.crack);
    expect(stageForFraction(b - 1e-6)).toBe(STAGE.crack);
    expect(stageForFraction(b)).toBe(STAGE.peel);
    expect(stageForFraction(c)).toBe(STAGE.tilt);
    expect(stageForFraction(d)).toBe(STAGE.collapse);
    expect(stageForFraction(5)).toBe(STAGE.collapse);
  });

  it('一撃で耐久を超えても、4段階を順に最低の時間ずつ見せてから瓦礫になる', () => {
    const s = new DamageState(city);
    const changes: StageChange[] = [];
    s.hit(midrise.id, s.hp[midrise.id] * 3, claw(midrise.footprint.x0 - 30, midrise.footprint.z0));
    const times: number[] = [];
    let t = 0;
    const dt = 1 / 60;
    while (t < 20 && s.stage[midrise.id] !== STAGE.rubble) {
      const before = changes.length;
      s.update(dt, changes);
      t += dt;
      if (changes.length > before) times.push(t);
    }
    expect(changes.map((c) => c.stage)).toEqual([STAGE.crack, STAGE.peel, STAGE.tilt, STAGE.collapse]);
    expect(changes.every((c) => c.player && c.cause === 'claw')).toBe(true);
    // 段階の間隔は最低の見せる時間以上
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(STAGES.minDwell[0] - 1e-9);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(STAGES.minDwell[1] - 1e-9);
    expect(times[3] - times[2]).toBeGreaterThanOrEqual(STAGES.minDwell[2] - 1e-9);
    // 崩落は高さに応じた時間をかけて進む
    expect(t - times[3]).toBeGreaterThanOrEqual(s.collapseSeconds[midrise.id] - 0.05);
    expect(s.stage[midrise.id]).toBe(STAGE.rubble);
    expect(s.collapse[midrise.id]).toBe(1);
  });

  it('傾きは根元の辺を支点に、殴った側と反対へ倒れ、段階の中で少しずつ増える', () => {
    const s = new DamageState(city);
    const changes: StageChange[] = [];
    const f = midrise.footprint;
    // 西から殴る → 東（+x）へ倒れる
    s.hit(midrise.id, s.hp[midrise.id] * 0.8, claw(f.x0 - 40, (f.z0 + f.z1) / 2));
    run(s, 1.5, changes);
    expect(s.stage[midrise.id]).toBe(STAGE.tilt);
    expect(s.dirX[midrise.id]).toBeGreaterThan(0.9);
    expect(s.pivotX[midrise.id]).toBeCloseTo(f.x1, 3);
    const early = s.tilt[midrise.id];
    run(s, 2, changes);
    expect(s.tilt[midrise.id]).toBeGreaterThan(early);
    expect(s.tilt[midrise.id]).toBeLessThanOrEqual(STAGES.leanMax + 1e-6);
    expect(s.isStanding(midrise.id)).toBe(true);
  });

  it('炎だけの損傷は種類ごとの上限で止まり、中層ビルは焼け落ちない', () => {
    const s = new DamageState(city);
    const changes: StageChange[] = [];
    const fire = { cause: 'fire' as const, fromX: 0, fromZ: 0, y: 10, player: false };
    for (let i = 0; i < 200; i++) s.hit(midrise.id, s.hp[midrise.id] * 0.05, fire);
    run(s, 5, changes);
    expect(s.fraction(midrise.id)).toBeLessThan(1);
    expect(s.isStanding(midrise.id)).toBe(true);
    expect(changes.every((c) => !c.player)).toBe(true);
  });

  it('やり直しで全部の建物が無傷に戻る', () => {
    const s = new DamageState(city);
    const changes: StageChange[] = [];
    s.hit(midrise.id, s.hp[midrise.id] * 2, claw(0, 0));
    s.breakGlass(midrise.id, 1);
    run(s, 10, changes);
    s.reset();
    expect(s.tally()).toEqual({ intact: city.buildings.length, cracked: 0, peeled: 0, tilted: 0, collapsing: 0, collapsed: 0 });
    expect(Math.max(...s.glass, ...s.tilt, ...s.collapse, ...s.damage)).toBe(0);
  });
});
