import { describe, expect, it } from 'vitest';
import type { Handedness, Perspective, Vec3 } from '../../../src/hand/types';
import { add, cross, dot, mulMV, normalize, sub } from '../../../src/hand/core/math';
import { HAND_RADIUS_MIN, baseAngles, bodySelfAngles, cameraPosition, clampDrag, signBounds } from '../../../src/hand/core/framing';
import { compileSign, handPointsInField, sampleSign } from '../../../src/hand/core/timeline';
import { ITEMS } from '../../../src/content';
import { fingerspellTokens, tokenSpec } from '../../../src/content/spell';
import { BODY, elbowPosition, locationAnchor } from '../../../src/hand/core/body';
import { SAMPLES } from '../../../src/hand/dev/samples';

/** カメラから見た画面の横位置（右が＋）。three.js の lookAt と同じ考え方（上は +Y） */
function screenX(cam: Vec3, target: Vec3, p: Vec3): number {
  const fwd = normalize(sub(target, cam));
  const right = normalize(cross(fwd, [0, 1, 0]));
  return dot(sub(p, cam), right);
}

/** 描くときと同じく、左利きは場全体を X で反転する */
function viewOf(perspective: Perspective, dominant: Handedness) {
  const a = SAMPLES.find((s) => s.id === 'a')!;
  const c = compileSign(a.spec);
  const pts = handPointsInField(sampleSign(c, 0).dominant, false).map((p): Vec3 => (dominant === 'left' ? [-p[0], p[1], p[2]] : p));
  const b = signBounds(c, dominant, false);
  const ang = baseAngles(perspective, dominant);
  const cam = cameraPosition(b, ang.yaw, ang.pitch, 28);
  return { thumb: screenX(cam, b.center, pts[2]!), pinky: screenX(cam, b.center, pts[17]!), cam, b };
}

describe('視点', () => {
  it('相手から見る: 手のひらを相手へ向けた右手の親指は、画面の右', () => {
    const v = viewOf('viewer', 'right');
    expect(v.thumb).toBeGreaterThan(v.pinky);
    expect(v.cam[2]).toBeGreaterThan(v.b.center[2]);
  });

  it('自分から見る: 鏡写しにしない（自分の右手の親指は、自分から見て左＝画面の左）', () => {
    const v = viewOf('self', 'right');
    expect(v.thumb).toBeLessThan(v.pinky);
    // 表す人の側（後ろ・上）から見る
    expect(v.cam[2]).toBeLessThan(v.b.center[2]);
    expect(v.cam[1]).toBeGreaterThan(v.b.center[1]);
  });

  it('左利きは左右が反対（相手から: 親指は画面の左、自分から: 画面の右）', () => {
    const a = viewOf('viewer', 'left');
    expect(a.thumb).toBeLessThan(a.pinky);
    const b = viewOf('self', 'left');
    expect(b.thumb).toBeGreaterThan(b.pinky);
  });

  it('ドラッグで回せるのは左右 ±180°・上下 ±60°', () => {
    expect(clampDrag(250, 90)).toEqual({ yaw: 180, pitch: 60 });
    expect(clampDrag(-250, -90)).toEqual({ yaw: -180, pitch: -60 });
    expect(clampDrag(30, -20)).toEqual({ yaw: 30, pitch: -20 });
  });

  it('手だけの表示は、どの形も手の外形（指の太さ込み）が枠に収まる（相手から・自分から。hand-r2 で「半径を固定」から「形ごとに収める」へ変えた）', () => {
    const EDGE: Vec3[] = [[-0.41, 0.56, 0], [0.342, 0.62, 0], [0, -0.3, 0], [0.24, -0.22, 0], [-0.24, -0.22, 0]];
    const signs = [...ITEMS.filter((i) => !i.sign.body).map((i) => i.sign), ...Array.from('じがばぱっー').map((ch) => tokenSpec(fingerspellTokens(ch)[0]!)!)];
    let worst = 0;
    for (const spec of signs) {
      const c = compileSign(spec);
      const b = signBounds(c, 'right', false);
      expect(b.radius).toBeGreaterThanOrEqual(HAND_RADIUS_MIN);
      for (const p of ['viewer', 'self'] as const) {
        const a = baseAngles(p, 'right', c);
        const cam = cameraPosition(b, a.yaw, a.pitch, 28);
        const fwd = normalize(sub(b.center, cam));
        const right = normalize(cross(fwd, [0, 1, 0]));
        const up = cross(right, fwd);
        const t = Math.tan((14 * Math.PI) / 180);
        for (let i = 0; i <= (c.isStatic ? 0 : 20); i++) {
          const h = sampleSign(c, c.isStatic ? c.duration : (c.duration * i) / 20).dominant;
          const pts = [...handPointsInField(h, false), ...EDGE.map((e) => add(h.wrist, mulMV(h.rot, e)))];
          for (const q of pts) {
            const v = sub(q, cam), z = dot(v, fwd), pad = 0.12 / (z * t);
            worst = Math.max(worst, Math.abs(dot(v, right) / (z * t)) + pad, Math.abs(dot(v, up) / (z * t)) + pad);
          }
        }
      }
    }
    // 1 が枠の縁。直す前（半径 1.22 固定）は な・ま・す・ね など21項目が最大 1.17 まではみ出していた
    expect(worst).toBeLessThan(0.97);
  });
});

describe('上半身つきの枠と視点（hand-r2）', () => {
  it('両手と頭（顔）が入る球に寄せ、胴の下・肩・休めている手は入れない（どの単語も半径 3.6 以下。直す前は 4.4〜5.8）', () => {
    for (const w of ITEMS.filter((i) => i.sign.body)) {
      const c = compileSign(w.sign);
      const b = signBounds(c, 'right', true);
      expect(b.radius, w.id).toBeLessThan(3.6);
      // 頭（顔）は枠の中
      const hc = BODY.headCenter;
      for (const p of [[hc[0], hc[1] + 1.05, hc[2]], [hc[0] - 0.8, hc[1], hc[2]], [hc[0] + 0.8, hc[1], hc[2]], [hc[0], hc[1] - 1.05, hc[2]]] as Vec3[]) {
        expect(Math.hypot(p[0] - b.center[0], p[1] - b.center[1], p[2] - b.center[2]), w.id).toBeLessThan(b.radius);
      }
      // 利き手はどの時刻でも枠の中
      for (let i = 0; i <= 20; i++) {
        for (const p of handPointsInField(sampleSign(c, (c.duration * i) / 20).dominant, false)) {
          expect(Math.hypot(p[0] - b.center[0], p[1] - b.center[1], p[2] - b.center[2]), w.id).toBeLessThan(b.radius);
        }
      }
    }
  });

  it('自分から見る視点は、利き手の肩の後ろ上（真後ろから利き手の側へ 20°・上 28°）。左利きは反対の肩', () => {
    expect(bodySelfAngles('right')).toEqual({ yaw: -160, pitch: 28 });
    expect(bodySelfAngles('left')).toEqual({ yaw: 160, pitch: 28 });
    // 右利き: カメラは表す人の後ろ（−Z）・右（−X）・上
    const b = { center: [0, 2, 1] as Vec3, radius: 3 };
    const cam = cameraPosition(b, -160, 28, 28);
    expect(cam[2]).toBeLessThan(b.center[2]);
    expect(cam[0]).toBeLessThan(b.center[0]);
    expect(cam[1]).toBeGreaterThan(b.center[1]);
  });
});

describe('上半身', () => {
  it('ひじの位置: 上腕と前腕の長さを保つ（届く範囲）', () => {
    const wrist = locationAnchor('chest');
    const e = elbowPosition(BODY.shoulderR, wrist, [-0.45, -1, -0.35], BODY.upperArm, BODY.forearm);
    const d = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(d(BODY.shoulderR, e)).toBeCloseTo(BODY.upperArm, 6);
    expect(d(e, wrist)).toBeCloseTo(BODY.forearm, 6);
    expect(e[1]).toBeLessThan(BODY.shoulderR[1]); // ひじは肩より下
  });

  it('体の位置の名前: 利き手でない手は左右のある部位だけ反対側', () => {
    expect(locationAnchor('neutral', 'dominant')[0]).toBeLessThan(0); // 表す人の右＝相手から見て左
    expect(locationAnchor('neutral', 'nonDominant')[0]).toBeGreaterThan(0);
    expect(locationAnchor('chin', 'nonDominant')).toEqual(locationAnchor('chin', 'dominant'));
    expect(locationAnchor('forehead')[1]).toBeGreaterThan(locationAnchor('chin')[1]);
    expect(locationAnchor('chest')[1]).toBeGreaterThan(locationAnchor('belly')[1]);
  });
});
