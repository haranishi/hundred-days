import { describe, expect, it } from 'vitest';
import type { HandshapeSpec, SignSpec, Vec3 } from '../../../src/hand/types';
import { ITEMS, getItem } from '../../../src/content';
import { fingerspellTokens, tokenSpec } from '../../../src/content/spell';
import { WRIST_LIMITS, bendWrist, forearmDirection } from '../../../src/hand/core/forearm';
import { baseAngles, cameraPosition, selfAngles, signBounds } from '../../../src/hand/core/framing';
import { I3, colX, colY, colZ, cross, dot, normalize, sub, type M3 } from '../../../src/hand/core/math';
import { compileSign, handPointsInField, sampleSign } from '../../../src/hand/core/timeline';

const DEG = Math.PI / 180;

/** 手の座標での、まっすぐの前腕（−Y）からの曲げ（度）: x＝親指の側が＋、z＝手のひら側が＋ */
function bendOf(rot: M3, f: Vec3): { x: number; z: number } {
  const a = Math.acos(Math.max(-1, Math.min(1, -dot(f, colY(rot)))));
  const dx = dot(f, colX(rot)), dz = dot(f, colZ(rot));
  const s = Math.hypot(dx, dz) || 1;
  return { x: ((a * dx) / s) / DEG, z: ((a * dz) / s) / DEG };
}
const withinWrist = (b: { x: number; z: number }) =>
  (b.x / (b.x >= 0 ? WRIST_LIMITS.radial : WRIST_LIMITS.ulnar)) ** 2 + (b.z / (b.z >= 0 ? WRIST_LIMITS.flexion : WRIST_LIMITS.extension)) ** 2;

/** 手だけで描く項目（指文字・変化・数字）と、合成した ば・ぱ */
function handOnly(): Array<{ id: string; spec: SignSpec }> {
  const out = ITEMS.filter((i) => !i.sign.body).map((i) => ({ id: i.id, spec: i.sign }));
  for (const ch of ['ば', 'ぱ']) out.push({ id: `compose-${ch}`, spec: tokenSpec(fingerspellTokens(ch)[0]!)! });
  return out;
}

describe('前腕（袖）の向き（手だけの表示）', () => {
  it('手首の曲がる範囲の中なら、ひじの方へそのまま向ける', () => {
    const d = normalize([0.2, -1, -0.3]);
    const f = bendWrist({ rot: I3 }, d, false);
    expect(Math.hypot(f[0] - d[0], f[1] - d[1], f[2] - d[2])).toBeLessThan(1e-9);
  });

  it('範囲の外なら縁まで曲げる（手のひら側70°・甲の側60°・親指の側20°・小指の側35°）', () => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      // 決まった並びの向き（乱数を使わない）
      const th = i * 2.39996, ph = Math.acos(1 - (2 * (i + 0.5)) / 400);
      const d: Vec3 = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      const f = bendWrist({ rot: I3 }, d, false);
      expect(withinWrist(bendOf(I3, f))).toBeLessThan(1 + 1e-6);
      if (withinWrist(bendOf(I3, d)) > 1) n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  it('全部の指文字・数字の全時刻で、前腕は表す人の側（後ろ）へ向かい、手首の範囲に収まる', () => {
    for (const { id, spec } of handOnly()) {
      const c = compileSign(spec);
      for (let k = 0; k <= 20; k++) {
        const h = sampleSign(c, (c.duration * k) / 20).dominant;
        const f = forearmDirection(h, 'dominant');
        expect(f[2], id).toBeLessThan(0);
        expect(withinWrist(bendOf(h.rot, f)), id).toBeLessThan(1 + 1e-6);
      }
    }
  });

  it('指先が下を向く形（す・な・ね・ふ・へ・ま）は、袖が手首から上・表す人の右・後ろへ伸びる（相手から見て左上に切り口。神奈川県の表の図と同じ）', () => {
    for (const id of ['kana-su', 'kana-na', 'kana-ne', 'kana-fu', 'kana-he', 'kana-ma']) {
      const h = sampleSign(compileSign(getItem(id)!.sign), 0).dominant;
      const f = forearmDirection(h, 'dominant');
      expect(f[1], id).toBeGreaterThan(0.3);
      expect(f[0], id).toBeLessThan(-0.2);
    }
  });

  it('指先が上を向く形（あ）は、袖が下・表す人の右・後ろへ伸びる（ひじは肩の下・外）', () => {
    const h = sampleSign(compileSign(getItem('kana-a')!.sign), 0).dominant;
    const f = forearmDirection(h, 'dominant');
    expect(f[1]).toBeLessThan(-0.5);
    expect(f[0]).toBeLessThan(-0.2);
    expect(f[2]).toBeLessThan(-0.3);
  });
});

/* ───────── 自分から見る視点 ───────── */

const FOV = 28;
const FIN = { index: [5, 8], middle: [9, 12], ring: [13, 16], pinky: [17, 20] } as const;

/** 最後の形を、自分から見る視点のカメラで見たときの値 */
function selfView(spec: SignSpec) {
  const c = compileSign(spec);
  const pts = handPointsInField(sampleSign(c, c.duration).dominant, false);
  const b = signBounds(c, 'right', false);
  const a = baseAngles('self', 'right', c);
  const cam = cameraPosition(b, a.yaw, a.pitch, FOV);
  const shape = [...spec.hands.dominant.keyframes].reverse().find((k) => k.shape)!.shape as HandshapeSpec;
  return { c, pts, b, cam, shape };
}

describe('自分から見る視点（手だけの表示）', () => {
  it('基本は手の真後ろ・上40°。指先が相手の方へ向く形（そ・は・ぱ・ば・のばす音）だけ、目の側（体の中心の側）へ回り込む', () => {
    expect(selfAngles('right')).toEqual({ yaw: 180, pitch: 40 });
    const yaw = (id: string) => baseAngles('self', 'right', compileSign(handOnly().find((x) => x.id === id)!.spec)).yaw;
    for (const id of ['kana-so', 'kana-ha', 'mod-handakuon', 'compose-ば', 'compose-ぱ', 'mod-chouon']) expect(yaw(id), id).toBeLessThan(150);
    // 指先が上・下・横を向く形は真後ろから（め の3本が重ならない向き）
    for (const id of ['kana-me', 'kana-a', 'kana-su', 'kana-na', 'kana-ku', 'num-6']) expect(yaw(id), id).toBe(180);
    // 左利きは左右が反対（目の側＝体の中心の側が −X になる）
    const so = compileSign(getItem('kana-so')!.sign);
    expect(baseAngles('self', 'left', so).yaw).toBeCloseTo(0 - baseAngles('self', 'right', so).yaw, 9);
  });

  it('全部の指文字・数字で、伸ばした指が視線と 15° 以上ずれる（相手の方を指す指が、こぶしの向こうに隠れない）', () => {
    let worst = { ang: 180, id: '' };
    for (const { id, spec } of handOnly()) {
      const { pts, cam, shape } = selfView(spec);
      for (const [f, [m, t]] of Object.entries(FIN) as Array<[keyof typeof FIN, readonly [number, number]]>) {
        if (shape.fingers[f] !== 'extended') continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, dot(normalize(sub(pts[t]!, pts[m]!)), normalize(sub(pts[t]!, cam)))))) / DEG;
        if (ang < worst.ang) worst = { ang, id: `${id}（${f}）` };
      }
    }
    expect(worst.ang, `いちばん視線に近い指: ${worst.id}`).toBeGreaterThan(15);
  });

  it('伸ばした指をそろえない形では、となり合う指先が画面の上で 0.15 以上離れる（め の3本が1本に重ならない）', () => {
    let worst = { gap: Infinity, id: '' };
    for (const { id, spec } of handOnly()) {
      const { pts, b, cam, shape } = selfView(spec);
      if (shape.spread === 'together' || shape.cross) continue;
      const fwd = normalize(sub(b.center, cam));
      const right = normalize(cross(fwd, [0, 1, 0]));
      const up = cross(right, fwd);
      const depth = dot(sub(b.center, cam), fwd);
      const proj = (p: Vec3) => {
        const v = sub(p, cam), z = dot(v, fwd);
        return [(dot(v, right) / z) * depth, (dot(v, up) / z) * depth] as const;
      };
      const ext = (['index', 'middle', 'ring', 'pinky'] as const).filter((f) => shape.fingers[f] === 'extended');
      for (let i = 0; i + 1 < ext.length; i++) {
        const p = proj(pts[FIN[ext[i]!][1]]!), q = proj(pts[FIN[ext[i + 1]!][1]]!);
        const gap = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (gap < worst.gap) worst = { gap, id };
      }
    }
    expect(worst.gap, `いちばん狭い: ${worst.id}`).toBeGreaterThan(0.15);
  });
});
