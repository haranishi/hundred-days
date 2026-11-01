// OWNER: chars-art
// 連番（film）：1/60 秒の固定刻みで進め、撮影の道具が window.__filmStep() で1コマずつ進めて撮る。
// 足の滑りも測る：接地している足の支点（かかと・足裏・つま先）の、世界での水平の速さ。前のコマと今のコマで
// 「今の支点」を同じ足の骨から出して比べる（支点が地面に止まっていれば 0）。最大値を window.__footSlip に出す。
import { Matrix4, type PerspectiveCamera, Vector3 } from 'three';
import { B } from '../rig';
import { CLOSE_COMBAT, COMBAT_REVIEW as REVIEW } from '../config';
import { createCharacter } from '../character';
import { actor, pose, walker, type Actor } from './scenarios';
import { placeLabels, stepScenario } from './run';
import type { LabStage } from './stage';

const DT = 1 / 60;

interface FilmDef {
  actors: Actor[];
  /** 足の滑りを測る人物の番号。 */
  measure: number[];
  /** 撮り始める前に進める秒数。 */
  lead: number;
  camera(cam: PerspectiveCamera, t: number): void;
}

function look(cam: PerspectiveCamera, from: Vector3, to: Vector3, fov: number): void {
  cam.fov = fov;
  cam.position.copy(from);
  cam.lookAt(to);
  cam.updateProjectionMatrix();
}

/** 横から見る歩き：撮り始める時刻 lead に x=xs にいて、+X へ進む。 */
function crossing(kind: Parameters<typeof walker>[0], id: string, xs: number, z: number, v: number, lead: number, o: Parameters<typeof pose>[1], label: string): Actor {
  const a = walker(kind, id, xs - v * lead, z, 0, v, 1e9, o, label);
  return a;
}

const FILMS: Record<string, (stage: LabStage) => FilmDef> = {
  // r07-chars: mainと同じ0.6秒・t=.3の打点。2撃目の怯み開始時点からstance=downを送る。
  melee: (stage) => {
    stage.warm[0].position.set(0.2, 1.7, 2.0);
    const action = (t: number) => {
      const start = REVIEW.starts.find((s) => t >= s && t <= s + CLOSE_COMBAT.duration);
      return start === undefined ? null : { kind: 'melee' as const, t: (t - start) / CLOSE_COMBAT.duration };
    };
    return {
      actors: [
        scripted('player', 'f-melee-p', -REVIEW.separation / 2, 0, (t) => ({ speed: 0, yawDeg: 0, o: { action: action(t) } }), '光秀：肘の短い正面攻撃'),
        scripted('samurai', 'f-melee-s', REVIEW.separation / 2, 0, (t) => ({ speed: 0, yawDeg: 180, o: reaction(t, CLOSE_COMBAT.duration * CLOSE_COMBAT.hitT) }), '侍：1撃目は回復、2撃目で気絶'),
      ],
      measure: [0], lead: REVIEW.lead,
      camera: (cam) => look(cam, new Vector3(...REVIEW.camera), new Vector3(...REVIEW.target), REVIEW.fov),
    };
  },
  stagger: (stage) => {
    stage.warm[0].position.set(0.2, 1.7, 2.0);
    return {
      actors: [
        scripted('ashigaru', 'f-stagger-a', REVIEW.guardsX[0], 0, (t) => ({ speed: 0, yawDeg: 90, o: reaction(t) }), '足軽：怯み→回復→気絶'),
        scripted('samurai', 'f-stagger-s', REVIEW.guardsX[1], 0, (t) => ({ speed: 0, yawDeg: 90, o: reaction(t) }), '侍：怯み→回復→気絶'),
      ],
      measure: [], lead: REVIEW.lead,
      camera: (cam) => look(cam, new Vector3(...REVIEW.camera), new Vector3(...REVIEW.target), REVIEW.fov),
    };
  },
  // 止まる・見回す・向きを変える・歩き出す（見回りの番兵の一連）。止まった足は位相の合う所で揃い、向きを変える時は踏み直す
  stopgo: (stage) => {
    stage.warm[0].position.set(0.5, 1.6, 2.2);
    return {
      actors: [
        scripted(
          'ashigaru',
          'f-stopgo',
          -2.2,
          0,
          (t) => {
            // 1.25 m/s で歩き、1.4 秒で止まる（減速 18 m/s² 相当でほぼ即座）。止まって左右を見る。3.2 秒で北へ向きを変え、3.6 秒から歩く
            const v = t < 1.4 ? 1.25 : t < 3.6 ? 0 : step(t, 0, 1.25, 3.6, 3.75);
            const yaw = t < 3.2 ? 0 : -90;
            const head = t > 1.6 && t < 3.0 ? 0.9 * Math.sin((t - 1.6) * 3.2) : 0;
            return { speed: v, yawDeg: yaw, o: { headYaw: head, lantern: true } };
          },
          '足軽：止まる→見回す→向きを変える→歩く',
        ),
      ],
      measure: [0],
      lead: 0.6,
      camera: (cam) => look(cam, new Vector3(-0.2, 1.3, 4.2), new Vector3(-0.4, 0.75, -0.4), 40),
    };
  },
  // 構えの切り替え：平常→不審→発見（刀を抜く）→平常。0.3 秒で層を重ねて混ぜる
  alert: (stage) => {
    stage.warm[0].position.set(0.2, 1.7, 2.0);
    const aw = (t: number) => (t < 0.5 ? 'calm' : t < 1.4 ? 'suspicious' : t < 2.6 ? 'alert' : 'calm') as 'calm' | 'suspicious' | 'alert';
    return {
      actors: [
        scripted('samurai', 'f-al-s', -0.55, 0, (t) => ({ speed: 0, yawDeg: 90, o: { awareness: aw(t) } }), '侍'),
        scripted('ashigaru', 'f-al-a', 0.6, 0, (t) => ({ speed: 0, yawDeg: 90, o: { awareness: aw(t) } }), '足軽'),
      ],
      measure: [0, 1],
      lead: 0.2,
      camera: (cam) => look(cam, new Vector3(1.6, 1.3, 3.6), new Vector3(0.05, 0.85, 0), 40),
    };
  },
  // しゃがむ→しゃがみ歩き→止まって立つ（光秀）
  crouchup: (stage) => {
    stage.warm[0].position.set(0.3, 1.5, 2.0);
    return {
      actors: [
        scripted(
          'player',
          'f-cu',
          -1.2,
          0,
          (t) => ({
            speed: t < 0.9 ? 0 : t < 2.4 ? step(t, 0, 1.5, 0.9, 1.0) : step(t, 1.5, 0, 2.4, 2.48),
            yawDeg: 0,
            o: { stance: t > 0.4 && t < 2.8 ? 'crouch' : 'stand' },
          }),
          '光秀：しゃがむ→歩く→立つ',
        ),
      ],
      measure: [0],
      lead: 0.2,
      camera: (cam) => look(cam, new Vector3(0.2, 0.9, 3.8), new Vector3(0.0, 0.6, 0), 40),
    };
  },
  // 捕まる：足軽の槍の突き・侍の斬り下ろし（strike）と、突かれて倒れる光秀（struck）。動作は 0.8 秒
  strike: (stage) => {
    stage.warm[0].position.set(0.2, 1.7, 2.0);
    return {
      actors: [
        actor('ashigaru', 'f-st-a', -1.2, 0, 0, 'strike', 0.3, 0.8, { awareness: 'alert' }, undefined, '足軽の突き'),
        actor('samurai', 'f-st-s', -1.2, -1.4, 0, 'strike', 0.3, 0.8, { awareness: 'alert' }, undefined, '侍の斬り下ろし'),
        actor('player', 'f-struck', 0.9, -0.4, 180, 'struck', 0.5, 1.0, {}, 'down', '光秀が倒れる'),
      ],
      measure: [],
      lead: 0.2,
      camera: (cam) => look(cam, new Vector3(0.0, 1.5, 4.3), new Vector3(-0.2, 0.7, -0.6), 44),
    };
  },
  // その場で向きを変える：ゲームの向きが1コマで 120° 跳んでも、体はばねで追い、足は一歩ずつ踏み直す
  turn: (stage) => {
    stage.warm[0].position.set(0.3, 1.6, 2.0);
    return {
      actors: [scripted('ashigaru', 'f-turn', 0, 0, (t) => ({ speed: 0, yawDeg: t < 0.4 ? 90 : t < 1.6 ? -30 : 210, o: { lantern: true } }), '足軽：その場で向きを変える')],
      measure: [0],
      lead: 0.2,
      camera: (cam) => look(cam, new Vector3(0.8, 1.6, 3.4), new Vector3(0, 0.7, 0), 40),
    };
  },
  // 歩き：見回りの足軽（1.25 m/s）と、歩く光秀（2.6 m/s）。固定のカメラで真横から（足が地面に対して止まって見えるか）
  walk: (stage) => {
    const lead = 1.6;
    stage.warm[0].position.set(0.5, 1.6, 2.2);
    // 左半分を足軽、右半分を光秀が横切る（真横から見て重ならないように）
    return {
      actors: [crossing('ashigaru', 'f-walk-a', -2.3, 0, 1.25, lead, {}, '足軽 1.25m/s'), crossing('player', 'f-walk-p', 0.0, 0, 2.6, lead, {}, '光秀 2.6m/s')],
      measure: [0, 1],
      lead,
      camera: (cam) => look(cam, new Vector3(0.0, 0.95, 4.4), new Vector3(0.0, 0.72, 0), 40),
    };
  },
  // 走り：光秀（5.2）と、発見して走る足軽（4.3）。カメラは光秀に付いて横へ流れる
  run: (stage) => {
    const lead = 1.4;
    stage.warm[0].position.set(0, 1.6, 2.5);
    // 足軽を 1.8m 先から走らせ、カメラは2人の真ん中に付いて流れる（光秀の方が速いので、近づくが重ならない）
    const a = [crossing('player', 'f-run-p', -0.9, 0, 5.2, lead, {}, '光秀 5.2m/s'), crossing('ashigaru', 'f-run-a', 0.9, 0, 4.3, lead, { awareness: 'alert' }, '足軽 4.3m/s（発見）')];
    return {
      actors: a,
      measure: [0, 1],
      lead,
      camera: (cam, t) => {
        const x = (t - lead) * 4.75;
        look(cam, new Vector3(x, 0.95, 4.6), new Vector3(x, 0.7, 0), 40);
      },
    };
  },
  // しゃがみ歩き：光秀（1.5 m/s）を斜め前から
  crouch: (stage) => {
    const lead = 1.6;
    stage.warm[0].position.set(0.5, 1.4, 1.8);
    return {
      actors: [crossing('player', 'f-crouch', -0.6, 0, 1.5, lead, { stance: 'crouch' }, '光秀 しゃがみ 1.5m/s')],
      measure: [0],
      lead,
      camera: (cam) => look(cam, new Vector3(0.15, 0.75, 3.6), new Vector3(0.15, 0.5, 0), 40),
    };
  },
  // 当て身：番兵の背後 0.7m から。動作は 1.0 秒、その後は倒れ／しゃがみ
  takedown: (stage) => {
    const lead = 0.4;
    stage.warm[0].position.set(0.2, 1.7, 1.9);
    return {
      actors: [
        actor('ashigaru', 'f-tdv', 0.35, 0, 0, 'takedownVictim', lead, 1.0, {}, 'down', '番兵'),
        actor('player', 'f-td', -0.35, 0, 0, 'takedown', lead, 1.0, { stance: 'crouch' }, 'crouch', '光秀'),
      ],
      measure: [],
      lead: 0.2,
      camera: (cam) => look(cam, new Vector3(0.6, 1.25, 3.4), new Vector3(0.1, 0.75, 0), 40),
    };
  },
  // 討ち取り：床几に座る信長の背後 0.62m から。動作は 1.6 秒
  assassinate: (stage) => {
    const lead = 0.4;
    stage.warm[0].position.set(1.2, 1.4, 1.6);
    return {
      actors: [
        actor('nobunaga', 'f-asv', 0.25, 0, 0, 'assassinateVictim', lead, 1.6, { stance: 'sit' }, 'down', '信長'),
        actor('player', 'f-as', -0.37, 0, 0, 'assassinate', lead, 1.6, { stance: 'crouch' }, 'crouch', '光秀'),
      ],
      measure: [],
      lead: 0.2,
      camera: (cam) => look(cam, new Vector3(0.9, 1.3, 3.5), new Vector3(0.2, 0.7, 0), 40),
    };
  },
};

function reaction(t: number, delay = 0): Parameters<typeof pose>[1] {
  const start = REVIEW.starts.find((s) => t >= s + delay && t <= s + delay + CLOSE_COMBAT.staggerDuration);
  const down = t >= REVIEW.starts[1] + delay;
  return { stance: down ? 'down' : 'stand', action: start === undefined ? null : { kind: 'stagger', t: (t - start - delay) / CLOSE_COMBAT.staggerDuration } };
}

/** 台本どおりに動く人物：時刻ごとに速さ・向き・姿勢を決め、位置は速さを積分して進める（瞬間移動しない）。 */
function scripted(kind: Parameters<typeof walker>[0], id: string, x0: number, z0: number, script: (t: number) => { speed: number; yawDeg: number; o: Parameters<typeof pose>[1] }, label: string): Actor {
  const char = createCharacter(kind);
  let x = x0;
  let z = z0;
  let last = 0;
  return {
    char,
    label,
    drive: (t) => {
      const s = script(t);
      const dt = Math.max(0, t - last);
      last = t;
      const yaw = (s.yawDeg * Math.PI) / 180;
      x += Math.cos(yaw) * s.speed * dt;
      z += Math.sin(yaw) * s.speed * dt;
      return { id, kind, x, z, yaw, pose: pose(kind, { ...s.o, speed: s.speed }) };
    },
  };
}

const step = (t: number, a: number, b: number, t0: number, t1: number) => (t <= t0 ? a : t >= t1 ? b : a + ((b - a) * (t - t0)) / (t1 - t0));

/** 足の支点の、世界での位置。 */
function pivotWorld(a: Actor, foot: 0 | 1, out: Vector3): Vector3 {
  const bone = a.char.animator.bones[foot === 0 ? B.footL : B.footR];
  return out.copy(a.char.animator.debug.contact[foot].pivot).applyMatrix4(bone.matrixWorld);
}

export function runFilm(stage: LabStage, name: string, frames: number, ui: HTMLElement): void {
  const def = FILMS[name]?.(stage);
  if (!def) throw new Error(`知らない連番: ${name}`);
  const sc = { actors: def.actors, warmup: 0, camera: def.camera };
  (window as unknown as { __lab: unknown }).__lab = { sc, stage };
  for (const a of def.actors) stage.scene.add(a.char.root);
  stage.focusShadow(new Vector3(0, 0, 0), 6);
  stage.reviewLight(new URLSearchParams(location.search).get('review') !== '0');
  let t = 0;
  const leadFrames = Math.round(def.lead * 60);
  for (let i = 0; i < leadFrames; i++) {
    stepScenario(sc, t, DT);
    t += DT;
  }
  // 足の滑りの測り：前のコマの足の骨の行列と、接地していたか
  const prevM = def.measure.map(() => [new Matrix4(), new Matrix4()]);
  const prevPlanted = def.measure.map(() => [false, false]);
  let maxSlip = 0;
  let sumSlip = 0;
  let samples = 0;
  const per = def.measure.map(() => ({ max: 0, samples: 0 }));
  const a0 = new Vector3();
  const a1 = new Vector3();
  const snapshot = (first: boolean) => {
    def.measure.forEach((ai, k) => {
      const a = def.actors[ai];
      a.char.root.updateMatrixWorld(true);
      const dbg = a.char.animator.debug;
      for (const f of [0, 1] as const) {
        const bone = a.char.animator.bones[f === 0 ? B.footL : B.footR];
        const planted = dbg.contact[f].planted && dbg.plantW > 0.999;
        if (!first && planted && prevPlanted[k][f]) {
          pivotWorld(a, f, a1);
          a0.copy(dbg.contact[f].pivot).applyMatrix4(prevM[k][f]);
          const v = Math.hypot(a1.x - a0.x, a1.z - a0.z) / DT;
          maxSlip = Math.max(maxSlip, v);
          per[k].max = Math.max(per[k].max, v);
          per[k].samples++;
          sumSlip += v;
          samples++;
        }
        prevM[k][f].copy(bone.matrixWorld);
        prevPlanted[k][f] = planted;
      }
    });
  };
  snapshot(true);
  def.camera(stage.camera, t);
  stage.render();
  placeLabels(stage, sc, ui);
  let frame = 0;
  window.__filmStep = () => {
    stepScenario(sc, t, DT);
    t += DT;
    snapshot(false);
    def.camera(stage.camera, t);
    stage.render();
    placeLabels(stage, sc, ui);
    window.__footSlip = maxSlip;
    window.__footSlipInfo = { mean: samples ? sumSlip / samples : 0, samples, perActor: per.map((p, k) => ({ id: def.actors[def.measure[k]].label, ...p })) };
    return frame++;
  };
  window.__footSlip = 0;
  window.__filmReady = true;
  void frames;
}
