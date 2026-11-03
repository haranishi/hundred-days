// OWNER: core
// タッチの攻撃の補助（meleeAssistYaw）：間合いの中の最も近い番兵へ向ける。標的の条件は sim の meleeTarget と同じ（向きの制限だけ外す）。
import { describe, expect, it } from 'vitest';
import { MELEE } from '../src/config/rules';
import { meleeAssistYaw, type AssistGuard } from '../src/input/touchAssist';

const g = (x: number, z: number, o: Partial<AssistGuard> = {}): AssistGuard => ({ x, z, role: 'guard', down: false, mode: 'base', ...o });
const free = (): boolean => false;
const P = { x: 0, z: 0 };

describe('タッチの攻撃の補助（meleeAssistYaw）', () => {
  it('番兵がいなければ null（カメラの向きのまま）', () => {
    expect(meleeAssistYaw(P, [], MELEE.range, free)).toBeNull();
  });

  it('間合いの中の番兵の方角（0＝東・π/2＝南）を返す。後ろにいても向く', () => {
    expect(meleeAssistYaw(P, [g(1, 0)], MELEE.range, free)).toBeCloseTo(0, 6); // 東
    expect(meleeAssistYaw(P, [g(0, 1.2)], MELEE.range, free)).toBeCloseTo(Math.PI / 2, 6); // 南
    expect(meleeAssistYaw(P, [g(-1.2, 0)], MELEE.range, free)).toBeCloseTo(Math.PI, 6); // 西（背後）
    expect(meleeAssistYaw(P, [g(0, -1.5)], MELEE.range, free)).toBeCloseTo(-Math.PI / 2, 6); // 北
  });

  it('間合い（MELEE.range）ちょうどは向き、超えたら null（距離の規則は sim のまま）', () => {
    expect(meleeAssistYaw(P, [g(MELEE.range, 0)], MELEE.range, free)).toBeCloseTo(0, 6);
    expect(meleeAssistYaw(P, [g(MELEE.range + 0.01, 0)], MELEE.range, free)).toBeNull();
    expect(meleeAssistYaw(P, [g(1.8, 0)], MELEE.range, free)).toBeNull(); // 体験評価で空振りした約1.8mは、間合いの外
  });

  it('いちばん近い番兵を選ぶ', () => {
    expect(meleeAssistYaw(P, [g(1.5, 0), g(0, 0.8), g(-1.0, 0)], MELEE.range, free)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('倒れた番兵・信長（role が target）・やられ役（victim）・突き（strike）は対象にしない', () => {
    expect(meleeAssistYaw(P, [g(1, 0, { down: true })], MELEE.range, free)).toBeNull();
    expect(meleeAssistYaw(P, [g(1, 0, { role: 'target' })], MELEE.range, free)).toBeNull();
    expect(meleeAssistYaw(P, [g(1, 0, { mode: 'victim' })], MELEE.range, free)).toBeNull();
    expect(meleeAssistYaw(P, [g(1, 0, { mode: 'strike' })], MELEE.range, free)).toBeNull();
    // 対象外の番兵が近くにいても、その外側の対象を選ぶ
    expect(meleeAssistYaw(P, [g(0.5, 0, { down: true }), g(0, 1.4)], MELEE.range, free)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('壁などで遮られた番兵へは向けない', () => {
    const wall = (_x0: number, _z0: number, x1: number): boolean => x1 > 0; // 東側は遮られる
    expect(meleeAssistYaw(P, [g(1, 0)], MELEE.range, wall)).toBeNull();
    expect(meleeAssistYaw(P, [g(1, 0), g(-1.4, 0)], MELEE.range, wall)).toBeCloseTo(Math.PI, 6);
  });
});
