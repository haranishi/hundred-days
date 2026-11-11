import { createRide } from '../../src/sim/index.js';
import { plane, heightfield } from './terrains.js';
import { advance, airborne } from './helpers.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const DEG = Math.PI / 180, hz = 240;
export const skiStep = () => heightfield((x, z, out) => {
  const K = 0.08, L = 5;
  if (x <= 0) { out.h = out.hx = out.hxx = 0; }
  else if (x < L) { out.h = -K * x * x / 2; out.hx = -K * x; out.hxx = -K; }
  else { out.h = -K * L * L / 2 - K * L * (x - L); out.hx = -K * L; out.hxx = 0; }
  out.hz = out.hxz = out.hzz = 0;
});
function ride(gear, terrain = plane(), speed = 15, params) {
  const r = createRide(terrain, { gear, params });
  r.reset({ x: 0, z: 0, speed, heading: 0 }); return r;
}
// Remove longitudinal losses only: constant speed isolates the measured radius and edge response.
const fixedSpeed = { cdA: 0, cdATuck: 0, carveFriction: 0, snow: { packed: { mu: 0 } } };
export function radius(gear, speed, steer) {
  const r = ride(gear, plane(), speed, fixedSpeed);
  advance(r, 3, { steer }, hz);
  return r.state.speed / Math.abs(r.state.yawRate);
}
export function reversal(gear) {
  const r = ride(gear, plane(), 15, fixedSpeed); advance(r, 3, { steer: 1 }, hz);
  const edge = r.state.edge, force = r.state.tele.edgeForce;
  let zero = null, half = null;
  for (let i = 1; i <= hz * 2; i++) {
    r.step({ steer: -1 }, 1 / hz);
    if (zero === null && r.state.edge <= -0.05) zero = i / hz;
    if (r.state.tele.edgeForce <= -force / 2) { half = i / hz; break; }
  }
  return { zero, half, initialEdge: edge / DEG };
}
export function terminal(gear, degrees) {
  const r = ride(gear, plane(degrees * DEG));
  advance(r, 180, { tuck: 1 }, 120); const before = r.state.speed;
  advance(r, 10, { tuck: 1 }, 120);
  return { speed: r.state.speed, change: Math.abs(r.state.speed - before) };
}
export function stop(gear) {
  const r = ride(gear); let distance = 0;
  for (let i = 0; i < hz * 20; i++) {
    const p = { ...r.state.pos }; r.step({ brake: 1 }, 1 / hz);
    distance += Math.hypot(r.state.pos.x - p.x, r.state.pos.y - p.y, r.state.pos.z - p.z);
    if (r.state.speed < 0.05) return { distance, time: (i + 1) / hz };
  }
  return { distance, time: null };
}
export function push(gear) {
  const r = ride(gear, plane(), 0); advance(r, 20, { tuck: 1 }, hz); return r.state.speed;
}
export function stepAir(gear, controls) {
  const r = ride(gear, skiStep()); r.reset({ x: -14, z: 0, speed: 15, heading: Math.PI / 2 });
  let air = 0;
  for (let i = 0; i < hz * 4; i++) {
    r.step(controls, 1 / hz);
    for (const e of r.events) if (e.type === 'land') air = Math.max(air, e.air);
  }
  return air;
}
export function spin(gear) {
  const r = ride(gear); airborne(r, { height: 100, vz: -15 });
  advance(r, 0.6, { jump: true, steer: 1 }, hz); return r.state.yawRate / DEG;
}
export function measure() {
  const rows = [];
  const row = (label, fn) => rows.push({ label, board: fn('board'), ski: fn('ski') });
  for (const speed of [10, 15, 20]) for (const steer of [0.5, 1]) row(`半径 m（${speed} m/s・舵 ${steer}）`, g => radius(g, speed, steer));
  row('切り替え s（反対のエッジ -0.05 rad）', g => reversal(g).zero);
  row('切り替え s（反対の横力50%）', g => reversal(g).half);
  for (const degrees of [15, 25]) row(`低い姿勢の終端速度 m/s（${degrees}°）`, g => terminal(g, degrees).speed);
  row('制動停止距離 m（15 m/s・平面・0.05 m/s未満）', g => stop(g).distance);
  row('平面の押し m/s（20秒）', push);
  row('段の滞空 s（立つ）', g => stepAir(g, {}));
  row('段の滞空 s（低い姿勢）', g => stepAir(g, { tuck: 1 }));
  row('空中の旋回 °/s（構え＋舵1・0.6秒後）', spin);
  return rows;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = measure(), lines = ['# 道具の比較計測', '',
    '同じ圧雪平面・操作・240 Hz（終端速度のみ120 Hz）。半径と切り替えは縦方向の摩擦・抗力だけを無効にし、指定速度を保つ。横力・支持力・グリップ・旋回上限は実処理。',
    '切り替えは舵1を3秒保持後、舵-1。反対のエッジが0.05 radを超えた時刻と横力50%の時刻。終端速度は斜面190秒後。段はfeel-round5のstepと同じ式、x=-14 m・15 m/sから4秒。', '',
    '|測定|スノーボード|スキー|スキー／ボード|', '|---|---:|---:|---:|',
    ...rows.map(r => `|${r.label}|${r.board?.toFixed(4) ?? '未達'}|${r.ski?.toFixed(4) ?? '未達'}|${(r.ski / r.board).toFixed(4)}|`)];
  const dir = '.agent-harness/runs/sim/ski'; mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/measure.md`, lines.join('\n') + '\n');
  writeFileSync(`${dir}/measure.json`, JSON.stringify(rows, null, 2) + '\n');
  console.log(lines.join('\n'));
}
