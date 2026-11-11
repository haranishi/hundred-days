import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRide } from '../../src/sim/index.js';
import { readDelivered } from './verify-valley.mjs';
import { localPoint } from './lib/feature-rides.js';

// Same lip crossing and flight selection as feature-rides; the shared board helper stays untouched.
export function skiFeatureRide(world, feature, initial, entryOnly = false) {
  const r = createRide(world, { gear: 'ski' }), dt = 1 / 240, flights = [];
  r.reset({ ...feature.approach, speed: initial });
  let edge = null, active = null, crash = null, flight = null, elapsed = 0;
  for (let tick = 0; tick < 80 * 240; tick++) {
    const before = localPoint(feature, r.state.pos.x, r.state.pos.z).s, speed = r.state.speed;
    r.step({}, dt); elapsed = (tick + 1) * dt;
    const s = r.state, at = localPoint(feature, s.pos.x, s.pos.z);
    if (before < 0 && at.s >= 0 && edge === null) edge = speed + (s.speed - speed) * -before / (at.s - before);
    if (s.mode === 'air' && !active) active = { s: at.s, t: at.t, speed: s.speed };
    for (const e of r.events) {
      if (e.type === 'land') {
        const landed = { ...active, time: elapsed, air: e.air, impact: e.efh, quality: e.quality };
        flights.push(landed);
        if (active && active.s >= -18 && active.s <= 18 && Math.abs(active.t) < feature.width / 2 && (!flight || landed.air > flight.air)) flight = landed;
        active = null;
      }
      if (e.type === 'crash') crash = { reason: e.reason, time: elapsed };
    }
    if (s.mode !== 'air') active = null;
    if (s.mode === 'crash' && !crash) crash = { reason: 'crash', time: elapsed };
    if (crash || (entryOnly && edge !== null) || (flight && elapsed >= flight.time + 12)) break;
    if (!flight && (Math.abs(at.t) > feature.width / 2 + 20 || at.s > feature.length + 25 || at.s < -85 || (tick > 1200 && s.speed < 0.2))) break;
  }
  return { initial, edge, flight, flights, crash, elapsed, followed: flight ? elapsed - flight.time : 0 };
}
function centralRide(world, feature) {
  const target = (feature.speed[0] + feature.speed[1]) / 2;
  let lo = 0, hi = 45, best = null;
  for (let k = 0; k < 13; k++) {
    const initial = k === 0 ? 0 : (lo + hi) / 2, run = skiFeatureRide(world, feature, initial, true);
    const error = Math.abs((run.edge ?? -100) - target);
    if (!best || error < best.error) best = { initial, error };
    if (k === 0 && run.edge !== null && run.edge > target) break;
    if (run.edge === null || run.edge < target) lo = initial; else hi = initial;
  }
  const result = skiFeatureRide(world, feature, best.initial);
  return { id: feature.id, name: feature.name, kind: feature.kind, target, error: best.error, ...result,
    pass: best.error < 0.15 && !!result.flight && result.flight.air >= 0.08 && !result.crash && result.followed >= 12 - 1e-6 }; // 時刻の引き算の端数（11.999999999999998）で落ちたことがある
}
export function verifyGear() {
  const world = readDelivered(), features = world.meta.features.map(f => centralRide(world, f));
  const fmt = n => Number.isFinite(n) ? n.toFixed(3) : '—';
  const lines = ['# スキー：現地形の仕掛け検査', '',
    'public/world の実データをSHA照合して読み、gear=ski・無操作・240 Hz。approach座標から、縁で speed 範囲の中央になるよう初速を二分探索（誤差0.15 m/s未満）。地形・雪・着地判定の値は変更しない。',
    'feature-rides と同じく、離雪開始が縁の前後18 m・幅内の飛びを選ぶ。主な着地の後12秒まで追跡し、その間の転倒も報告。うねりは全飛行をJSONに残す。', '',
    '|仕掛け|中央 m/s|助走初速 m/s|縁 m/s|滞空 s|EFH m|着地の質|転倒|合否|', '|---|---:|---:|---:|---:|---:|---|---|---|',
    ...features.map(f => `|${f.name} (${f.id})|${fmt(f.target)}|${fmt(f.initial)}|${fmt(f.edge)}|${fmt(f.flight?.air)}|${fmt(f.flight?.impact)}|${f.flight?.quality ?? '未着地'}|${f.crash ? f.crash.reason + '@' + fmt(f.crash.time) + 's' : 'なし'}|${f.pass ? '○' : '未達'}|`), '',
    `結果：${features.filter(f => f.pass).length}/${features.length} 合格。`];
  const simulationHashes = Object.fromEntries(readdirSync('src/sim').filter(f => f.endsWith('.js')).sort().map(f => [f, createHash('sha256').update(readFileSync('src/sim/' + f)).digest('hex')]));
  const result = { worldHashes: world.meta.hashes, simulationHashes, features, pass: features.length === 15 && features.every(f => f.pass) };
  const dir = '.agent-harness/runs/sim/ski'; mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/features.md`, lines.join('\n') + '\n');
  writeFileSync(`${dir}/features.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(lines.join('\n')); return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!verifyGear().pass) process.exitCode = 1;
}
