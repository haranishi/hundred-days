import { placeCom } from './pose.js';
import { set, copy, length, scale, transport, headingVector, cross, headingOf } from './vec.js';
import { dragForce } from './aero.js';
import { emit } from './state.js';
import { effectiveRock } from './snow.js';

export function crash(ctx, reason) {
  if (ctx.state.mode === 'crash') return;
  ctx.state.mode = 'crash'; ctx.mem.stopped = ctx.mem.safeTimer = ctx.mem.crashTime = 0;
  ctx.mem.popping = false; ctx.mem.held = 0;
  ctx.mem.inWater = reason === 'water';
  emit(ctx, 'crash').reason = reason;
}
/** 水が見えている所（湖の氷の無い所）へ接地したまま入ったら、落ちる */
export function updateWater(ctx) {
  const s = ctx.state;
  if (s.mode === 'air' || s.mode === 'crash' || !ctx.terrain.waterAt) return;
  if (ctx.terrain.waterAt(s.pos.x, s.pos.z)) crash(ctx, 'water');
}
function waterNear(ctx, x, z, radius) {
  if (!ctx.terrain.waterAt) return false;
  if (ctx.terrain.waterAt(x, z)) return true;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (ctx.terrain.waterAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) return true; }
  return false;
}
export function crashStep(ctx, dt) {
  const s = ctx.state, p = ctx.p, m = ctx.mem;
  ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface); set(ctx.normal, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz);
  // Crashes may originate in the air; remove the normal impact velocity once.
  const vn = s.vel.x * ctx.normal.x + s.vel.y * ctx.normal.y + s.vel.z * ctx.normal.z;
  s.vel.x -= vn * ctx.normal.x; s.vel.y -= vn * ctx.normal.y; s.vel.z -= vn * ctx.normal.z;
  transport(s.fwd, s.up, ctx.normal, s.fwd); copy(ctx.normal, s.up); cross(s.fwd, s.up, s.right);
  s.vel.x += p.gravity * s.up.y * s.up.x * dt;
  s.vel.y += (-p.gravity + p.gravity * s.up.y * s.up.y) * dt;
  s.vel.z += p.gravity * s.up.y * s.up.z * dt;
  // 転んだ体は、時間とともに強く雪をつかむ。一定の摩擦だと、tan(斜度) が摩擦を超える急斜面で止まらず、立ち上がれない
  m.crashTime += dt;
  const grip = Math.min(p.crashFrictionMax, p.crashFriction + p.crashGrip * m.crashTime);
  const before = length(s.vel), after = Math.max(0, before - (grip * p.gravity * s.up.y + dragForce(before, s.crouch, p) / p.mass) * dt) * (m.inWater ? Math.exp(-p.waterDrag * dt) : 1);
  if (before > p.epsilon) scale(s.vel, after / before, s.vel);
  s.pos.x += s.vel.x * dt; s.pos.z += s.vel.z * dt;
  ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface); set(ctx.normal, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz);
  transport(s.vel, s.up, ctx.normal, s.vel); transport(s.fwd, s.up, ctx.normal, s.fwd); copy(ctx.normal, s.up); cross(s.fwd, s.up, s.right); s.heading = headingOf(s.fwd);
  s.pos.y = ctx.surface.h; s.speed = length(s.vel);
  s.load = s.up.y; s.gLoad = s.load; s.tele.edgeForce = s.tele.carveDrag = s.tele.skidPower = s.tele.spray = 0;
  placeCom(ctx, dt);
  m.stopped = s.speed < p.recoverSpeed ? m.stopped + dt : 0;
  if (m.stopped + p.epsilon >= p.recoverSettle + p.recoverDelay) {
    // 水の中では立ち上がれない。直前の安全な地点（岸や氷の上）へ戻す
    if (m.inWater && ctx.placeSafe) { ctx.placeSafe(); emit(ctx, 'recover'); return; }
    const downhillX = s.up.x, downhillZ = s.up.z;
    s.heading = Math.hypot(downhillX, downhillZ) > p.epsilon ? Math.atan2(downhillX, -downhillZ) : s.heading;
    // 木や岩のすぐ山側で立ち上がると、重力で押しつけられて動けなくなる。
    // 谷の向きの先（4 m 以内）に障害物があれば、横へずれて、まっすぐ下っても当たらない位置に立たせる
    const dirX = Math.sin(s.heading), dirZ = -Math.cos(s.heading), sideX = -dirZ, sideZ = dirX;
    ctx.terrain.obstaclesNear(s.pos.x, s.pos.z, 4 + p.recoverClear, ctx.obstacles);
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < ctx.obstacles.length; i++) {
        const o = ctx.obstacles[i], rx = o.x - s.pos.x, rz = o.z - s.pos.z;
        const ahead = rx * dirX + rz * dirZ, lateral = rx * sideX + rz * sideZ, need = o.radius + p.riderRadius + p.recoverClear;
        if (ahead < -need || ahead > 4 || Math.abs(lateral) >= need) continue;
        // 障害物が右にあれば左へ、左にあれば右へ。真正面なら右へ
        const shift = (need - Math.abs(lateral)) * (lateral > 0 ? -1 : 1);
        s.pos.x += sideX * shift; s.pos.z += sideZ * shift; moved = true;
      }
      if (!moved) break;
    }
    ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface); set(ctx.normal, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz);
    copy(ctx.normal, s.up); s.pos.y = ctx.surface.h;
    headingVector(s.heading, s.up, s.fwd); cross(s.fwd, s.up, s.right);
    set(s.vel, 0, 0, 0); s.speed = s.yawRate = s.edge = s.slip = 0; s.switch = false;
    s.mode = 'carve'; m.low = true; m.legRate = m.lateral = m.lateralRate = m.stopped = m.sketch = m.windup = 0;
    emit(ctx, 'recover');
  }
}
export function updateSafe(ctx, dt) {
  const s = ctx.state, m = ctx.mem, p = ctx.p;
  // 2026-11-11：制動（横滑り）で下っている間も、戻り先を覚える。切って滑っている間だけだと、急な斜面を制動で下りた人は、
  // 復帰のキーで、出発地点まで（200 m 上まで）戻された（体験の採点 2 周目）
  const riding = s.mode === 'carve' ? Math.abs(s.slip) < p.safeSlip : s.mode === 'skid' && ctx.controls.brake > 0;
  const stable = riding && s.speed >= p.safeMinSpeed && effectiveRock(s.snow.rock) === 0 && s.load > p.lightLoad &&
    m.sketch <= 0 && !m.atBounds && !m.popping && !ctx.controls.jump;
  // 条件が欠けた間は、数えた時間を「減らす」（0 へ戻さない）。小さな浮き（0.6 秒まで）の間は、止めておく。
  // 急な斜面を制動で下ると、荷重がこぶで抜けたり、岩の縁をかすめたりして、3 秒続けて安定することが無い（山頂で測って、最長 2.0 秒）。
  // 0 へ戻す決まりでは、175 m 下っても、戻り先が出発地点のままだった（体験の採点 3 周目）。覚えるのは、条件を満たしているコマだけ
  const hop = s.mode === 'air' && s.air.time < p.safeHopTime;
  m.safeTimer = stable ? m.safeTimer + dt : hop ? m.safeTimer : s.mode === 'crash' || s.mode === 'air' || m.atBounds ? 0 : Math.max(0, m.safeTimer - dt);
  // 水のそばは、復帰地点にしない（戻った直後にまた落ちる）。次の機会を待つ
  if (m.safeTimer >= p.safeInterval && waterNear(ctx, s.pos.x, s.pos.z, p.waterClear)) m.safeTimer = 0;
  if (stable && m.safeTimer >= p.safeInterval) {
    // 向きは、進んでいる向き（横滑り中は、板が横を向いている）
    const along = s.mode === 'skid' && Math.hypot(s.vel.x, s.vel.z) > p.epsilon ? Math.atan2(s.vel.x, -s.vel.z) : s.heading;
    ctx.safe.x = s.pos.x; ctx.safe.z = s.pos.z; ctx.safe.heading = along; ctx.safe.speed = 0; m.safeTimer = 0;
  }
}
export function updateRock(ctx, dt) {
  const s = ctx.state, m = ctx.mem, p = ctx.p;
  const rock = effectiveRock(s.snow.rock);
  m.rockTimer = s.mode !== 'air' && rock > 0 && s.speed > p.rockSpeed ? m.rockTimer + dt * rock : 0;
  if (m.rockTimer + p.epsilon >= p.rockTime) crash(ctx, 'rock');
}
