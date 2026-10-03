// OWNER: tests
// 二次運動の規則（src/dragon/procedural.ts の SecondaryChainSim、r06-motion）：骨の列が体の動きに遅れて付いてくること。
// GLB を使わず、体（Group）と、後ろへ伸びる骨の列（尾の形）を組んで確かめる。
import { Bone, Group, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SecondaryChain } from '../../src/config/dragon';
import { SecondaryChainSim, softLimit, stepDamped, tipWeighted, type SecondaryInput } from '../../src/dragon/procedural';

const DT = 1 / 60;
const DEG = Math.PI / 180;

const SPEC: SecondaryChain = {
  lag: 0.2,
  followZeta: 0.7,
  swingHz: 0.9,
  swingZeta: 0.3,
  inertia: 4,
  brake: 0,
  turn: 0,
  step: { pitch: 0, yaw: 0 },
  maxDeg: 32,
  attackDamp: 0.8,
  airLag: 1,
};

/** 体と、体の後ろへ伸びる n 本の骨の列（1本 2m）。クリップの姿勢は「付け根が後ろを向き、残りはまっすぐ」。 */
function rig(n = 8): { body: Group; bones: Bone[]; pose(): void } {
  const body = new Group();
  const pelvis = new Bone();
  body.add(pelvis);
  const bones: Bone[] = [];
  let parent: Bone = pelvis;
  for (let i = 0; i < n; i++) {
    const b = new Bone();
    b.position.set(0, i === 0 ? 0 : 2, 0);
    parent.add(b);
    bones.push(b);
    parent = b;
  }
  // 骨の +y を体の後ろ（-z）へ向ける
  const back = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const pose = (): void => {
    bones.forEach((b, i) => b.quaternion.copy(i === 0 ? back : new Quaternion()));
    body.updateMatrixWorld(true);
  };
  pose();
  return { body, bones, pose };
}

const input = (body: Group, extra: Partial<SecondaryInput> = {}): SecondaryInput => ({
  dt: DT,
  bodyQuat: body.quaternion.clone(),
  accel: new Vector3(),
  turnDelta: 0,
  attack: 0,
  air: 0,
  speed: 0,
  hindStep: null,
  frontStep: null,
  ...extra,
});

/** 骨の +y（ワールド）が、クリップの姿勢（体と一緒に回った向き）から水平にどれだけ回っているか（rad、上から見て反時計回りが正）。 */
function yawOffset(body: Group, bone: Bone, rigid: Vector3): number {
  const d = new Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
  const r = rigid.clone().applyQuaternion(body.quaternion);
  return Math.atan2(r.x * d.z - r.z * d.x, r.x * d.x + r.z * d.z) * -1;
}

/** 体を角速度 omega（rad/s）で seconds 秒回し、各骨の遅れ（秒 = 回る向きと逆へのずれ ÷ 角速度）を返す。 */
function turnLags(spec: SecondaryChain, omega: number, seconds: number, attack = 0): number[] {
  const { body, bones, pose } = rig();
  const sim = new SecondaryChainSim(bones, spec, 'hind');
  sim.update(input(body));
  let yaw = 0;
  for (let t = 0; t < seconds; t += DT) {
    yaw += omega * DT;
    body.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    pose();
    sim.update(input(body, { attack }));
  }
  return bones.map((b) => -yawOffset(body, b, new Vector3(0, 0, -1)) / omega);
}

/** 1コマだけ上下の速さを dv（m/s）変えたときの、先の骨の向きのずれの最大（度）と、そのときの高さの向き（下がったら負）。 */
function landingPeak(spec: SecondaryChain, dv: number, attack = 0): { peakDeg: number; tipDownward: boolean } {
  const { body, bones, pose } = rig();
  const sim = new SecondaryChainSim(bones, spec, 'hind');
  sim.update(input(body));
  const tip = bones[bones.length - 1];
  let peak = 0;
  let downward = false;
  for (let k = 0; k < 90; k++) {
    pose();
    sim.update(input(body, { accel: new Vector3(0, k === 0 ? dv / DT : 0, 0), attack }));
    const d = new Vector3(0, 1, 0).applyQuaternion(tip.getWorldQuaternion(new Quaternion()));
    const a = Math.acos(Math.max(-1, Math.min(1, d.dot(new Vector3(0, 0, -1))))) / DEG;
    if (a > peak) {
      peak = a;
      downward = d.y < 0;
    }
  }
  return { peakDeg: peak, tipDownward: downward };
}

describe('二次運動の部品', () => {
  it('遅れとしなりの配り方は先の骨ほど大きく、合計が 1', () => {
    const w = tipWeighted(6);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1]);
  });

  it('減衰振動の厳密な一歩は、細かい刻みで積んだ値と合う', () => {
    const y = new Vector3(1, -0.5, 0.2);
    const v = new Vector3(0, 2, -1);
    const y2 = y.clone();
    const v2 = v.clone();
    stepDamped(y, v, 6, 0.3, 0.25);
    const h = 1e-4;
    for (let t = 0; t < 0.25 - 1e-9; t += h) {
      const a = y2.clone().multiplyScalar(-36).addScaledVector(v2, -2 * 0.3 * 6);
      v2.addScaledVector(a, h);
      y2.addScaledVector(v2, h);
    }
    expect(y.distanceTo(y2)).toBeLessThan(2e-3);
    expect(v.distanceTo(v2)).toBeLessThan(1e-2);
  });

  it('上限は柔らかく頭打ち（6割までは素通し、超えても上限を超えない）', () => {
    expect(softLimit(0.5, 1)).toBe(0.5);
    expect(softLimit(0.8, 1)).toBeGreaterThan(0.7);
    expect(softLimit(0.8, 1)).toBeLessThan(0.8);
    expect(softLimit(50, 1)).toBeLessThanOrEqual(1);
  });
});

describe('遅れは付け根から先へ増える', () => {
  it('体が回り続けると、骨ごとの遅れは付け根から先へ増え、先の骨で lag 秒（0.1〜0.3秒）になる', () => {
    const lags = turnLags(SPEC, 1, 1.5);
    for (let i = 1; i < lags.length; i++) expect(lags[i]).toBeGreaterThan(lags[i - 1]);
    expect(lags[0]).toBeGreaterThan(0);
    const tip = lags[lags.length - 1];
    expect(tip).toBeGreaterThan(0.1);
    expect(tip).toBeLessThan(0.3);
    expect(tip).toBeCloseTo(SPEC.lag, 1);
  });

  it('遅れは体の回る向きと逆（尾は体より先へ回らない）', () => {
    const left = turnLags(SPEC, 1.5, 1);
    const right = turnLags(SPEC, -1.5, 1);
    expect(left[left.length - 1]).toBeGreaterThan(0);
    expect(right[right.length - 1]).toBeGreaterThan(0);
  });

  it('回るのをやめると、先の骨も追いついて遅れが消える', () => {
    const { body, bones, pose } = rig();
    const sim = new SecondaryChainSim(bones, SPEC, 'hind');
    sim.update(input(body));
    let yaw = 0;
    for (let t = 0; t < 1; t += DT) {
      yaw += 2 * DT;
      body.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      pose();
      sim.update(input(body));
    }
    const during = Math.abs(yawOffset(body, bones[bones.length - 1], new Vector3(0, 0, -1)));
    for (let t = 0; t < 2; t += DT) {
      pose();
      sim.update(input(body));
    }
    const after = Math.abs(yawOffset(body, bones[bones.length - 1], new Vector3(0, 0, -1)));
    expect(during).toBeGreaterThan(10 * DEG);
    expect(after).toBeLessThan(0.5 * DEG);
  });
});

describe('振れ幅は出来事の大きさで決まる', () => {
  it('着地の上下の速さの変わりが2倍なら、先の振れも約2倍（頭打ちの手前）。先は下がる', () => {
    const small = landingPeak(SPEC, 6);
    const big = landingPeak(SPEC, 12);
    expect(small.peakDeg).toBeGreaterThan(2);
    expect(big.peakDeg / small.peakDeg).toBeGreaterThan(1.8);
    expect(big.peakDeg / small.peakDeg).toBeLessThan(2.2);
    expect(small.tipDownward).toBe(true);
  });

  it('大きな出来事でも、振れは上限（しなり＋追いかけ）の中に収まる', () => {
    const huge = landingPeak(SPEC, 200);
    expect(huge.peakDeg).toBeLessThan(2 * SPEC.maxDeg);
    expect(Number.isFinite(huge.peakDeg)).toBe(true);
  });

  it('旋回の始まりと終わりの衝撃も、速さの変わりに比例する', () => {
    const spec = { ...SPEC, turn: 20, lag: 0.001 };
    const peakAfterStop = (omega: number): number => {
      const { body, bones, pose } = rig();
      const sim = new SecondaryChainSim(bones, spec, 'hind');
      sim.update(input(body));
      sim.update(input(body, { turnDelta: omega }));
      let peak = 0;
      for (let k = 0; k < 60; k++) {
        pose();
        sim.update(input(body));
        peak = Math.max(peak, Math.abs(yawOffset(body, bones[bones.length - 1], new Vector3(0, 0, -1))));
      }
      return peak;
    };
    const a = peakAfterStop(1);
    const b = peakAfterStop(2);
    expect(a).toBeGreaterThan(1 * DEG);
    expect(b / a).toBeGreaterThan(1.8);
    expect(b / a).toBeLessThan(2.2);
  });
});

describe('技の最中は絞る', () => {
  it('技の重みが 1 なら、着地の振れは attackDamp の分だけ小さく、旋回の遅れも短い', () => {
    const free = landingPeak(SPEC, 12);
    const busy = landingPeak(SPEC, 12, 1);
    expect(busy.peakDeg).toBeLessThan(free.peakDeg * 0.4);
    const lagFree = turnLags(SPEC, 1, 1.5);
    const lagBusy = turnLags(SPEC, 1, 1.5, 1);
    expect(lagBusy[lagBusy.length - 1]).toBeLessThan(lagFree[lagFree.length - 1] * 0.4);
  });
});

describe('刻みに強い', () => {
  it('刻み 0 では状態を進めず、同じ姿勢を掛け直す（一時停止で二次運動が消えない）', () => {
    const { body, bones, pose } = rig();
    const sim = new SecondaryChainSim(bones, SPEC, 'hind');
    sim.update(input(body));
    for (let k = 0; k < 20; k++) {
      body.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), k * 0.05);
      pose();
      sim.update(input(body));
    }
    const before = bones.map((b) => b.quaternion.clone());
    pose();
    sim.update(input(body, { dt: 0 }));
    bones.forEach((b, i) => expect(b.quaternion.angleTo(before[i])).toBeLessThan(1e-6));
  });

  it('大きな刻み（早回しの 0.5 秒）でも発散しない', () => {
    const { body, bones, pose } = rig();
    const sim = new SecondaryChainSim(bones, { ...SPEC, turn: 30 }, 'hind');
    sim.update(input(body));
    let yaw = 0;
    for (let k = 0; k < 20; k++) {
      yaw += 3 * 0.5;
      body.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      pose();
      sim.update(input(body, { dt: 0.5, turnDelta: k === 0 ? 3 : 0, accel: new Vector3(0, k % 3 === 0 ? 80 : 0, -30) }));
      for (const b of bones) expect(Number.isFinite(b.quaternion.w)).toBe(true);
    }
    const tip = Math.abs(yawOffset(body, bones[bones.length - 1], new Vector3(0, 0, -1)));
    expect(tip).toBeLessThan(2 * SPEC.maxDeg * DEG);
  });
});
