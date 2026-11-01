// OWNER: core
// テストの道具：sim を作る・入力を作る・刻みを進める・出来事を集める。
import { TICK } from '../src/config/rules';
import { DEG } from '../src/sim/math';
import { Sim, type SimOptions } from '../src/sim/sim';
import { idleInput, type SimEvent, type SimInput } from '../src/sim/types';
import { HONNOJI } from '../src/stage/honnoji';
import type { GuardDef, StageDef } from '../src/stage/types';

export { HONNOJI, TICK, DEG };

export function makeSim(opts: Partial<SimOptions> = {}, stage: StageDef = HONNOJI): Sim {
  return new Sim(stage, { seed: 1, ...opts });
}

/** 世界の向き（度）へ歩く入力。カメラをその向きに向けて W を押すのと同じ。 */
export function walkInput(yawDeg: number, extra: Partial<SimInput> = {}): SimInput {
  return { ...idleInput(yawDeg * DEG), moveY: 1, ...extra };
}

export function stepN(sim: Sim, n: number, input: SimInput | ((i: number) => SimInput) = idleInput()): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    sim.step(typeof input === 'function' ? input(i) : input);
    all.push(...sim.drainEvents());
  }
  return all;
}

export function seconds(s: number): number {
  return Math.round(s / TICK);
}

/** 番兵を一人だけのステージ（当たりと灯りは本能寺のまま）。 */
export function stageWithGuards(guards: GuardDef[], patch: Partial<StageDef> = {}): StageDef {
  return { ...HONNOJI, guards, ...patch };
}

/** 立ち番を一人：位置・向き。見回しはしない（その向きを保つ）。 */
export function postGuard(id: string, x: number, z: number, facingDeg: number, extra: Partial<GuardDef> = {}): GuardDef {
  return { id, name: id, kind: 'ashigaru', role: 'guard', weapon: 'spear', start: { x, z }, facingDeg, ...extra };
}
