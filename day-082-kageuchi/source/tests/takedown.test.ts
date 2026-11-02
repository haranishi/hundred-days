// OWNER: core
// 当て身：番兵の 1.6m 以内・真後ろの左右 60°（向きからの角が 120° 以上）・番兵が発見中でない。正面や横からはできない。
import { describe, expect, it } from 'vitest';
import { GUARD, TAKEDOWN } from '../src/config/rules';
import { wake } from '../src/sim/guards';
import { wrapAngle } from '../src/sim/math';
import { canTakedown } from '../src/sim/player';
import { DEG, makeSim, postGuard, seconds, stageWithGuards, stepN } from './helpers';
import { idleInput } from '../src/sim/types';

/** 東を向いた番兵 (-20, 8) から見て、角 angleDeg（0＝正面）・距離 d の位置。 */
function at(angleDeg: number, d: number): [number, number] {
  return [-20 + Math.cos(angleDeg * DEG) * d, 8 + Math.sin(angleDeg * DEG) * d];
}

function setup(extra: Parameters<typeof postGuard>[] = []) {
  const sim = makeSim({}, stageWithGuards([postGuard('g', -20, 8, 0), ...extra.map((a) => postGuard(...a))]));
  return { sim, g: sim.byId.get('g')! };
}

describe('当て身', () => {
  it('真後ろ（180°）1.2m ならできる', () => {
    const { sim, g } = setup();
    sim.teleport(...at(180, 1.2));
    expect(canTakedown(sim, g)).toBe(true);
    expect(sim.player.prompt).toEqual({ kind: 'takedown', targetId: 'g' });
  });

  it('正面・横・斜め前からはできない', () => {
    const { sim, g } = setup();
    for (const a of [0, 30, 60, 90, 115, -90, -115]) {
      sim.teleport(...at(a, 1.2));
      expect(canTakedown(sim, g), `角 ${a}°`).toBe(false);
    }
  });

  it('後ろ斜め（125°・−125°）ならできる。1.7m は遠い', () => {
    const { sim, g } = setup();
    sim.teleport(...at(125, 1.2));
    expect(canTakedown(sim, g)).toBe(true);
    sim.teleport(...at(-125, 1.2));
    expect(canTakedown(sim, g)).toBe(true);
    sim.teleport(...at(180, 1.7));
    expect(canTakedown(sim, g)).toBe(false);
  });

  it('追っている（発見中の）番兵にはできない', () => {
    const { sim, g } = setup();
    sim.teleport(...at(180, 1.2));
    g.mode = 'chase';
    expect(canTakedown(sim, g)).toBe(false);
  });

  it('E で 1.0 秒の動作のあと気絶する。当て身の数が 1 増え、3m の物音が出る', () => {
    const { sim, g } = setup();
    sim.teleport(...at(180, 1.2));
    stepN(sim, 1, { ...idleInput(), interact: true });
    expect(sim.player.action?.kind).toBe('takedown');
    expect(g.mode).toBe('victim');
    const ev = stepN(sim, seconds(1.05));
    expect(g.down).toBe(true);
    expect(sim.stats.takedowns).toBe(1);
    expect(ev.some((e) => e.type === 'takedown' && e.stage === 'done')).toBe(true);
    expect(sim.noises.some((n) => n.kind === 'takedown' && n.radius === 3)).toBe(true);
    expect(sim.player.action).toBeNull();
  });

  it('1.5m 離れて始めても、動作の初めの 0.2 秒で間合いを 0.7m まで詰める（足音は出さない）', () => {
    // r01-integrate: 人物の当て身の動作は「番兵が前 0.7m」で手を伸ばすので、間合いを詰めないと手が首に届かない
    const { sim, g } = setup();
    sim.teleport(...at(160, 1.5));
    stepN(sim, 1, { ...idleInput(), interact: true });
    expect(sim.player.action?.kind).toBe('takedown');
    const ev = stepN(sim, seconds(TAKEDOWN.stepIn));
    const d = Math.hypot(sim.player.x - g.x, sim.player.z - g.z);
    expect(d).toBeCloseTo(TAKEDOWN.reach, 2);
    // 近づく向きは変えない（始めた側から詰める）
    const ang = Math.atan2(sim.player.z - g.z, sim.player.x - g.x) / DEG;
    expect(Math.abs(Math.abs(ang) - 160)).toBeLessThan(0.5);
    expect(ev.some((e) => e.type === 'footstep')).toBe(false);
  });

  it('動作の最中に別の番兵に見られたら、その場で発見（理由：当て身を見られた）。約束 1 の 0.4 秒は守る', () => {
    // 南 3m から北を向いて見ている番兵 w
    const { sim, g } = setup([['w', -21.2, 11, 270]]);
    sim.teleport(...at(180, 1.2));
    expect(sim.byId.get('w')).toBeDefined();
    const ev = [...stepN(sim, 1, { ...idleInput(), interact: true }), ...stepN(sim, 50)];
    const d = ev.find((e) => e.type === 'discovered');
    expect(d && d.type === 'discovered' ? d.record.cause : null).toBe('takedown');
    const q = ev.find((e) => e.type === 'suspicious' && e.guardId === 'w');
    expect(d!.t - q!.t).toBeGreaterThanOrEqual(0.4 - 1e-9);
    expect(d!.t - q!.t).toBeLessThan(0.45);
    expect(sim.phase).toBe('alert');
    void g;
  });
});

// r02-fix-play：RULES の r02 の変更「居眠り中は向きを変えない。居眠り中に限り角 90° 以上（横からでも）当て身できる」
// （体験の採点 3 位：居眠り番が眠りながら約 100° 揺れ、背後 1.3m・角 107° でも当て身の案内が出なかった）
describe('居眠り番', () => {
  /** 東を向いて眠る番兵。起きているときの見回しは本能寺の鐘楼の番と同じ 3 方向 */
  const dozer = () =>
    postGuard('d', -20, 8, 0, { dozing: true, seated: true, lookAround: [{ yawDeg: 0, hold: 3 }, { yawDeg: 90, hold: 2.5 }, { yawDeg: 300, hold: 2.5 }] });

  it('眠っている間は向きも頭も動かない（本能寺の鐘楼の番を 30 秒）', () => {
    const sim = makeSim();
    const g = sim.byId.get('shoro-doze')!;
    expect(g.dozing).toBe(true);
    const yaw0 = g.yaw;
    let maxDiff = 0;
    for (let i = 0; i < seconds(30); i++) {
      sim.step(idleInput());
      maxDiff = Math.max(maxDiff, Math.abs(wrapAngle(g.yaw - yaw0)), Math.abs(g.headYaw));
    }
    expect(g.dozing).toBe(true);
    expect(maxDiff).toBe(0);
  });

  it('眠っている番兵には横から（角 90°〜120°）でも当て身できる。正面寄り（90° 未満）はできない', () => {
    const sim = makeSim({}, stageWithGuards([dozer()]));
    const g = sim.byId.get('d')!;
    for (const a of [90, 95, 107, 120, 150, 180, -100]) {
      sim.teleport(-20 + Math.cos(a * DEG) * 1.3, 8 + Math.sin(a * DEG) * 1.3);
      expect(canTakedown(sim, g), `角 ${a}°`).toBe(true);
    }
    for (const a of [0, 45, 85, -80]) {
      sim.teleport(-20 + Math.cos(a * DEG) * 1.3, 8 + Math.sin(a * DEG) * 1.3);
      expect(canTakedown(sim, g), `角 ${a}°`).toBe(false);
    }
  });

  it('採点で当て身できなかった位置（1.3m・角 107°）で E を押すと当て身が始まる。起きている番兵にはできない', () => {
    const sim = makeSim({}, stageWithGuards([dozer()]));
    const g = sim.byId.get('d')!;
    sim.teleport(-20 + Math.cos(107 * DEG) * 1.3, 8 + Math.sin(107 * DEG) * 1.3);
    expect(sim.player.prompt).toEqual({ kind: 'takedown', targetId: 'd' });
    stepN(sim, 1, { ...idleInput(), interact: true });
    expect(sim.player.action?.kind).toBe('takedown');
    expect(g.mode).toBe('victim');
    // 同じ位置でも、起きている立ち番には横からはできない（角 120° のまま）
    const sim2 = makeSim({}, stageWithGuards([postGuard('w', -20, 8, 0)]));
    sim2.teleport(-20 + Math.cos(107 * DEG) * 1.3, 8 + Math.sin(107 * DEG) * 1.3);
    expect(canTakedown(sim2, sim2.byId.get('w')!)).toBe(false);
  });

  it('起きた居眠り番は、40 秒たつと持ち場の向きへ戻ってから眠り、眠っている間は向きを変えない', { timeout: 30_000 }, () => {
    const sim = makeSim({}, stageWithGuards([dozer()]));
    const g = sim.byId.get('d')!;
    sim.teleport(-40, -34);
    wake(sim, g);
    // 起きている間は見回す（持ち場の向き以外も向く）
    let turned = false;
    for (let i = 0; i < seconds(GUARD.redozeAfter - 1); i++) {
      sim.step(idleInput());
      if (Math.abs(wrapAngle(g.yaw)) > 30 * DEG) turned = true;
    }
    expect(turned).toBe(true);
    expect(g.dozing).toBe(false);
    stepN(sim, seconds(6));
    expect(g.dozing).toBe(true);
    expect(Math.abs(wrapAngle(g.yaw))).toBeLessThan(1e-3);
    const y = g.yaw;
    stepN(sim, seconds(20));
    expect(g.yaw).toBe(y);
  });
});
