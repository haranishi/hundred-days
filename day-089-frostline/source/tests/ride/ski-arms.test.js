// スキーの腕と棒の、見た目の決まり（2026-11-11・見た目の採点 3 周目の前に、実際の画面で確かめて決めた）。
// Codex の版は、棒を前腕から離すために、ひじを肩の高さまで横へ回していた。試験（すき間の数値）は通ったが、
// 実際の画面では、肩を怒らせた人形に見えた。ここでは、絵として守りたい形を、数値で押さえる。
import { it, expect } from 'vitest';
import { createPose, createPoseMemory, solvePose } from '../../src/render/ride/pose.js';
import { riding, distance, flat } from './fixtures.js';

const DEG = Math.PI / 180;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
/** 同じ状態を n コマ流した姿勢 */
function settle(extra = {}, frames = 60) {
  const state = riding({ gear: 'ski', ...extra }), p = createPose(), m = createPoseMemory();
  for (let i = 0; i < frames; i++) solvePose({ state, dt: 1 / 60, events: [], heightAt: flat }, m, p);
  return p;
}
/** 上腕が、真下から何度、開いているか（体の左右の向きへ） */
function flare(p, side) {
  const j = p.joints, arm = sub(j['elbow' + side], j['shoulder' + side]);
  return Math.atan2(Math.abs(dot(arm, p.skiSurface.right)), -dot(arm, p.skiSurface.up)) / DEG;
}

it.each([['まっすぐ', {}], ['空中', { mode: 'air' }]])('%s：ひじは肩より下で、横へ張り出さない（上腕の開きは 45° まで）', (_, extra) => {
  const p = settle(extra), j = p.joints;
  for (const side of ['L', 'R']) {
    expect(j['shoulder' + side].y - j['elbow' + side].y).toBeGreaterThan(0.18); // 肩の高さまで上げていたときは 0.11
    expect(flare(p, side)).toBeLessThan(45);                                    // 同じく 64°
  }
});
it.each([30, -30, 45, -45])('切る（%s°）：外側の手を、横へ伸ばしきらない。両手とも、胸の前。ひじは、肩より下', degrees => {
  const p = settle({ mode: 'carve', edge: degrees * DEG }), j = p.joints, outer = degrees > 0 ? 'L' : 'R';
  // 胸の左右の向き（外側が正）で、外側の手が、肩より 20 cm 以上、外へ出ない。
  // 胸から 60 cm 横へ置いていたときは 40 cm 出て、片腕だけ飛行機の翼のように見えた
  const across = sub(j['shoulder' + outer], j.chest), n = Math.hypot(across.x, across.y, across.z);
  expect(dot(sub(j['hand' + outer], j['shoulder' + outer]), across) / n).toBeLessThan(0.2);
  for (const side of ['L', 'R']) {
    expect(dot(sub(j['hand' + side], j.chest), p.chestFwd)).toBeGreaterThan(0.25);
    expect(dot(sub(j['shoulder' + side], j['elbow' + side]), p.chestUp)).toBeGreaterThan(0.12); // 体と一緒に傾くので、胸の上下の向きで測る
  }
});
it('切る：外側の棒は、傾いた体に沿う。内側の棒は、先が雪のすぐ上をかすめる', () => {
  const p = settle({ mode: 'carve', edge: 45 * DEG }), j = p.joints, b = p.board; // 右へ切る：外側は左
  // 外側：板の面（傾いた枠）で見て、下・後ろへ向き、横の成分は小さい。雪の面の枠で決めていたときは、背中を横切って内側へ逃げた
  const outer = p.poleDirs.L;
  expect(dot(outer, b.up)).toBeLessThan(-0.4);
  expect(Math.abs(dot(outer, b.right))).toBeLessThan(0.36);
  expect(dot(outer, b.fwd)).toBeLessThan(-0.5);
  // 内側：先は、雪から 3〜20 cm（手が雪に近いので、寝かせる）
  const tip = p.poleGrip.R.y + p.poleDirs.R.y * 1.16;
  expect(tip).toBeGreaterThan(0.03); expect(tip).toBeLessThan(0.2);
});
it('低い姿勢：頭が下がり、こぶしは胸の前。棒は、脇に挟んで、ほぼ水平に後ろへ（上へ立てない・頭の横を通さない）', () => {
  const stand = settle(), p = settle({ crouch: 1 }), j = p.joints;
  expect(j.head.y).toBeLessThan(stand.joints.head.y - 0.5); // 立つ姿勢より 50 cm 以上、低い（上半身 45° のときは 49 cm）
  expect(distance(j.handL, j.handR)).toBeLessThan(0.4);
  expect(p.poleHug).toBe(true);
  for (const side of ['L', 'R']) {
    expect(j['hand' + side].y).toBeLessThan(j['shoulder' + side].y);         // こぶしは、肩より下
    expect(j['shoulder' + side].y - j['elbow' + side].y).toBeGreaterThan(0.1); // ひじは、肩より下（ひざの前）
    const d = p.poleDirs[side];
    expect(d.z).toBeGreaterThan(0.9);          // 後ろ（前は −z）
    // ほぼ水平で、少しだけ上向き（前腕の上・脇の下を通る）。上へ 0.30 に立てていたときは、輪が頭より上へ出た。
    // 前腕と同じ向き（少し下向き）にしていたときは、握りから 30 cm が袖に隠れて、棒が腰から生えて見えた（見た目の採点 3 周目）
    expect(d.y).toBeGreaterThan(0.02); expect(d.y).toBeLessThan(0.2);
    expect(p.poleGrip[side].y + d.y * 1.16).toBeLessThan(j.head.y - 0.2); // 先は、頭より 20 cm 以上、低い
  }
});
it('低い姿勢への移りは、段をつけない（腕と棒が、1 コマで跳ばない）', () => {
  const state = riding({ gear: 'ski' }), p = createPose(), m = createPoseMemory();
  for (let i = 0; i < 30; i++) solvePose({ state, dt: 1 / 60, events: [], heightAt: flat }, m, p);
  // 胸から見た手の位置で測る（体ごと沈む動きは、数えない）
  const rel = () => sub(p.joints.handR, p.joints.chest);
  state.crouch = 1; let jump = 0, turn = 0, last = rel(), lastPole = { ...p.poleDirs.R };
  for (let i = 0; i < 40; i++) {
    solvePose({ state, dt: 1 / 60, events: [], heightAt: flat }, m, p);
    jump = Math.max(jump, distance(rel(), last)); turn = Math.max(turn, distance(p.poleDirs.R, lastPole));
    last = rel(); lastPole = { ...p.poleDirs.R };
  }
  expect(jump).toBeLessThan(0.08); // 1 コマに 8 cm まで（構えが 0.8 を越えた所で切り替えていたときは、1 コマで 20 cm 以上、跳んだ）
  expect(turn).toBeLessThan(0.3);
});

// 物理は、平らな所で、秒速 4.5 m ちょうどまで押し続ける。「4.5 より遅い」だけで決めていたときは、押して進んでいる間じゅう、
// 押す姿勢にならずに、低い姿勢のまま滑って見えた（見た目の採点 2 周目「押す姿勢が、低い姿勢と同じ絵」）
function pushCycle(speed, seconds = 2) {
  const state = riding({ gear: 'ski', speed, crouch: 1 }), p = createPose(), m = createPoseMemory(), frames = [];
  for (let i = 0; i < seconds * 60; i++) { solvePose({ state, dt: 1 / 60, events: [], heightAt: flat }, m, p); frames.push({ hand: { ...p.joints.handR }, grip: { ...p.poleGrip.R }, pole: { ...p.poleDirs.R }, head: p.joints.head.y }); }
  return frames;
}
const travel = frames => Math.max(...frames.map(f => f.hand.z)) - Math.min(...frames.map(f => f.hand.z));
it.each([2, 4.5])('平らな所を秒速 %s m で押す：手が前後に 40 cm 以上、動く（押す姿勢になる）', speed => {
  const frames = pushCycle(speed);
  expect(travel(frames)).toBeGreaterThan(0.4);
  expect(Math.min(...frames.map(f => f.head))).toBeGreaterThan(1.4); // しゃがまない（低い姿勢の頭は 1.1 m）
});
it('秒速 5.2 m では、押さない（低い姿勢で滑る）', () => {
  expect(travel(pushCycle(5.2).slice(30))).toBeLessThan(0.02);
});
it('押すのをやめる速さと、始める速さを分ける（境目で、1 コマごとに入れ替わらない）', () => {
  const state = riding({ gear: 'ski', speed: 4.5, crouch: 1 }), p = createPose(), m = createPoseMemory();
  const step = () => { solvePose({ state, dt: 1 / 60, events: [], heightAt: flat }, m, p); return p.joints.head.y; };
  for (let i = 0; i < 30; i++) step();
  state.speed = 4.8; for (let i = 0; i < 30; i++) expect(step()).toBeGreaterThan(1.4); // 押している途中に 4.8 へ上がっても、押し続ける
  state.speed = 5.2; for (let i = 0; i < 40; i++) step(); expect(step()).toBeLessThan(1.25); // 5.0 を越えたら、低い姿勢へ
  state.speed = 4.8; for (let i = 0; i < 40; i++) step(); expect(step()).toBeLessThan(1.25); // 4.6 より遅くなるまで、押す姿勢へ戻らない
});
it('押す棒：先は、いつも手より後ろ。向きが、1 コマで裏返らない。突く位置は、足のすぐ前', () => {
  const frames = pushCycle(2, 3); let turn = 0, front = -9;
  for (let i = 1; i < frames.length; i++) {
    const { pole, grip } = frames[i];
    expect(pole.z).toBeGreaterThan(0);                          // 後ろ（前は −z）。突き始めに前へ向けていたときは、ここが負
    turn = Math.max(turn, distance(pole, frames[i - 1].pole));
    const tipY = grip.y + pole.y * 1.16, tipZ = grip.z + pole.z * 1.16;
    if (tipY < 0.02) front = Math.max(front, -tipZ);            // 雪に着いている先の、いちばん前の位置（足は z=0）
  }
  expect(turn).toBeLessThan(0.3);     // 途中で裏返っていたときは 1.0 を超えた
  expect(front).toBeGreaterThan(-0.1); expect(front).toBeLessThan(0.3); // 足の 1 m 先を突いていたときは 1.05
});

// 体を隠すかどうかは、カメラがいま頭の近くにあるかだけで決める。「選んでいる視点が一人称」も条件に入れていたときは、
// 三人称へ戻した直後（カメラがまだ頭の位置にある間）に体を描いて、頭と腕の内側が映った（スキーの滑りの採点 2 周目）
it('視点を切り替える途中：カメラが頭の近くにある間だけ、体を隠す（近すぎる絵も、下半身だけの絵も出さない）', async () => {
  const { createRideFeedback } = await import('../../src/render/ride/index.js');
  const THREE = await import('three/webgpu');
  let controller = null;
  const view = { addSystem() {}, setCameraController(c) { controller = c; } };
  const feedback = createRideFeedback({ view, world: { heightAt: flat, obstaclesNear() {} } });
  const camera = new THREE.PerspectiveCamera(), state = riding({ gear: 'ski', speed: 12 });
  // 本体と同じ順（姿勢 → カメラ）で 1 コマずつ進める。描かれる絵は、その後のカメラの位置で撮られる
  const run = (mode, frames) => {
    let nearestShown = Infinity, farthestHidden = 0, seenHidden = false, seenShown = false;
    for (let i = 0; i < frames; i++) {
      const frame = { state, frameDt: 1 / 60, look: { yaw: 0, pitch: 0, camera: mode }, time: i / 60 };
      feedback.system.update(frame); controller.update(frame, camera, {});
      const d = feedback.debug(), gap = distance(camera.position, d.pose.joints.head);
      if (d.bodyHidden) { seenHidden = true; farthestHidden = Math.max(farthestHidden, gap); } else { seenShown = true; nearestShown = Math.min(nearestShown, gap); }
    }
    return { nearestShown, farthestHidden, seenHidden, seenShown };
  };
  run('third', 60);
  const toFirst = run('first', 120), toThird = run('third', 120);
  expect(toFirst.seenHidden).toBe(true);
  expect(toThird.seenShown).toBe(true);
  for (const r of [toFirst, toThird]) {
    expect(r.nearestShown).toBeGreaterThan(1.0);   // 体を描いているコマでは、カメラは、頭から 1 m より遠い（頭の内側を映さない）
    expect(r.farthestHidden).toBeLessThan(2.4);    // 体を隠しているコマでは、カメラは、頭から 2.4 m より近い（下半身だけの絵を、長く見せない）
  }
  feedback.system.dispose();
});
