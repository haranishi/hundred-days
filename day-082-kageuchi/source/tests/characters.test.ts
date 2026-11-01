// OWNER: chars-art
// r06-chars: 布を変形した後の法線と、既存36骨への重みを実際の生成形状で検証する。
import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { kindAsset } from '../src/art/characters/asset';
import { CLOSE_COMBAT, SURF } from '../src/art/characters/config';
import { Animator } from '../src/art/characters/anim/animator';
import { MeshBuilder } from '../src/art/characters/mesh/builder';
import { boneSegments, hakama } from '../src/art/characters/mesh/parts';
import { B, BONE_COUNT, createBones } from '../src/art/characters/rig';
import type { CharacterKind, CharacterPose, CharacterSnap } from '../src/contract/snapshot';
import { MELEE } from '../src/config/rules';

describe('人物の形とスキニング', () => {
  it('袴の陰影が、ひだを付けた後の三角形の面に沿う', () => {
    const asset = kindAsset('ranmaru');
    const b = new MeshBuilder(boneSegments(asset.rest));
    hakama({ b, W: asset.rest, d: asset.dims }, { color: 0xffffff, surf: SURF.cloth }, {
      waistY: 1.04, hemY: 0.11, hip: 0.14, knee: 0.14, hem: 0.15, pleats: 5, pleatAmp: 0.008,
    });
    const g = b.build();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const sums = Array.from({ length: p.count }, () => new Vector3());
    const uses = new Uint8Array(p.count);
    const a = new Vector3();
    const ab = new Vector3();
    const ac = new Vector3();
    const indices = g.index!;
    for (let i = 0; i < indices.count; i += 3) {
      const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
      a.fromBufferAttribute(p, ids[0]);
      ab.fromBufferAttribute(p, ids[1]).sub(a);
      ac.fromBufferAttribute(p, ids[2]).sub(a);
      ab.cross(ac);
      for (const id of ids) { sums[id].add(ab); uses[id]++; }
    }
    let minAlignment = 1;
    let checked = 0;
    for (let i = 0; i < p.count; i++) {
      // 開口の縁とUVの継ぎ目は片側の面しか持たないため、内側の共有頂点を比較する。
      if (uses[i] < 5) continue;
      minAlignment = Math.min(minAlignment, a.fromBufferAttribute(n, i).dot(sums[i].normalize()));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    expect(minAlignment).toBeGreaterThan(0.999);
    g.dispose();
  });

  const kinds: CharacterKind[] = ['player', 'ashigaru', 'samurai', 'ranmaru', 'nobunaga'];
  it.each(kinds)('%s の頂点が有限で、既存の骨へ正規化された重みを持つ', (kind) => {
    const g = kindAsset(kind).geometry;
    for (const name of ['position', 'normal', 'uv', 'aDetail']) {
      expect(Array.from(g.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    }
    const indices = g.getAttribute('skinIndex');
    const weights = g.getAttribute('skinWeight');
    let maxSumError = 0;
    let minWeight = 1;
    let maxBone = 0;
    for (let i = 0; i < weights.count; i++) {
      const ws = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
      maxSumError = Math.max(maxSumError, Math.abs(ws.reduce((a, v) => a + v, 0) - 1));
      minWeight = Math.min(minWeight, ...ws);
      maxBone = Math.max(maxBone, indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i));
    }
    expect(maxSumError).toBeLessThan(1e-6);
    expect(minWeight).toBeGreaterThanOrEqual(0);
    expect(maxBone).toBeLessThan(BONE_COUNT);
    const detail = g.getAttribute('aDetail');
    expect(detail.count).toBe(g.getAttribute('position').count);
    expect(new Set(Array.from(detail.array))).toContain(1);
  });
});

// r07-chars: キーの定数を読むだけでなく、実際の層混合・腕／脚IK・骨の行列まで進める。
function rig(kind: CharacterKind) {
  const asset = kindAsset(kind);
  const bones = createBones(asset.offsets);
  const root = new Group();
  root.add(bones[0]);
  const anim = new Animator(asset, bones);
  const snap: CharacterSnap = { id: `test-${kind}`, kind, x: 0, z: 0, yaw: Math.PI / 2, pose: {
    speed: 0, stance: 'stand', awareness: 'calm', headYaw: 0, action: null, lantern: false,
    weapon: kind === 'ashigaru' ? 'spear' : 'katana',
  } };
  const step = (o: Partial<CharacterPose> = {}) => {
    Object.assign(snap.pose, o);
    anim.update(1 / 60, snap, root);
    root.updateMatrixWorld(true);
  };
  for (let i = 0; i < 60; i++) step();
  return { anim, asset, bones, snap, step };
}

describe('r07の近接動作と接地', () => {
  it.each(['stand', 'crouch'] as const)('%sの最遠距離F踏み込み中も、接地足が浮かない', (stance) => {
    const { anim, bones, snap, step } = rig('player');
    for (let i = 0; i < 60; i++) step({ stance });
    let maxLift = 0;
    let samples = 0;
    const frames = Math.round(MELEE.duration * 60);
    for (let frame = 0; frame <= frames + 30; frame++) {
      const seconds = frame / 60;
      const u = Math.min(seconds / MELEE.stepIn, 1);
      // simの固定stepToと同じ三次曲線。yaw=90°なので前方は+Z。
      snap.z = (MELEE.range - MELEE.reach) * u * u * (3 - 2 * u);
      step({ stance, action: seconds <= MELEE.duration ? { kind: 'melee', t: seconds / MELEE.duration } : null });
      for (let i = 0; i < 2; i++) {
        const c = anim.debug.contact[i];
        if (!c.planted) continue;
        const p = c.pivot.clone().applyMatrix4(bones[i === 0 ? B.footL : B.footR].matrixWorld);
        maxLift = Math.max(maxLift, Math.abs(p.y));
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(20);
    expect(maxLift).toBeLessThan(0.012);
  });

  it('t=.3の短い肘打ちが溜めより前へ出て、足の支点と関節長・納刀を保つ', () => {
    const { anim, asset, bones, step } = rig('player');
    const pivots = anim.debug.contact.map((c, i) => c.pivot.clone().applyMatrix4(bones[i === 0 ? B.footL : B.footR].matrixWorld));
    let windup = 0;
    let impact = 0;
    let maxSlip = 0;
    let maxJointError = 0;
    const frames = Math.round(CLOSE_COMBAT.duration * 60);
    for (let frame = 0; frame <= frames; frame++) {
      const t = frame / frames;
      step({ action: { kind: 'melee', t } });
      if (frame === Math.round(frames * 0.18)) windup = anim.G.p[B.foreArmR].z;
      if (frame === Math.round(frames * CLOSE_COMBAT.hitT)) impact = anim.G.p[B.foreArmR].z;
      maxJointError = Math.max(maxJointError,
        Math.abs(anim.G.p[B.upperArmR].distanceTo(anim.G.p[B.foreArmR]) - asset.dims.upperArm),
        Math.abs(anim.G.p[B.foreArmR].distanceTo(anim.G.p[B.handR]) - asset.dims.foreArm));
      for (const i of [0, 1]) {
        const p = anim.debug.contact[i].pivot.clone().applyMatrix4(bones[i === 0 ? B.footL : B.footR].matrixWorld);
        maxSlip = Math.max(maxSlip, Math.hypot(p.x - pivots[i].x, p.z - pivots[i].z));
      }
      expect(anim.arc).toBe(0);
      expect(bones[B.blade].scale.z).toBeLessThan(0.001);
    }
    expect(impact - windup).toBeGreaterThan(0.045);
    expect(maxJointError).toBeLessThan(1e-6);
    expect(maxSlip).toBeLessThan(0.012);
  });

  it.each(['ashigaru', 'samurai'] as const)('%sは1撃目で立ち直り、2撃目だけ倒れて終端でも起き直らない', (kind) => {
    const { anim, step } = rig(kind);
    const standY = anim.G.p[B.head].y;
    const frames = Math.round(CLOSE_COMBAT.staggerDuration * 60);
    for (let i = 0; i <= frames; i++) step({ stance: 'stand', action: { kind: 'stagger', t: i / frames } });
    for (let i = 0; i < 30; i++) step({ action: null });
    expect(anim.G.p[B.head].y).toBeGreaterThan(standY - 0.05);
    expect(anim.lying).toBe(0);
    let prev = anim.G.p[B.head].clone();
    let endPop = 0;
    for (let i = 0; i <= frames + 30; i++) {
      step({ stance: 'down', action: i <= frames ? { kind: 'stagger', t: i / frames } : null });
      const head = anim.G.p[B.head];
      if (i >= frames - 3) endPop = Math.max(endPop, head.distanceTo(prev));
      for (const q of anim.G.q) expect(q.toArray().every(Number.isFinite)).toBe(true);
      for (const p of anim.G.p) expect(p.toArray().every(Number.isFinite)).toBe(true);
      prev.copy(head);
    }
    expect(anim.G.p[B.head].y).toBeLessThan(0.45);
    expect(anim.lying).toBeGreaterThan(0.99);
    expect(endPop).toBeLessThan(0.025);
  });
});
