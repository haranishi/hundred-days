import { placeCom } from './pose.js';
import { set, dot, tangent, normalize, length, scale, clamp, transport, copy } from './vec.js';
import { emit } from './state.js';

export function contactStep(ctx, dt) {
  const s = ctx.state, p = ctx.p, start = ctx.beforePosition;
  const dx = s.pos.x - start.x, dz = s.pos.z - start.z, dist = Math.hypot(dx, dz);
  ctx.terrain.obstaclesNear((start.x + s.pos.x) / 2, (start.z + s.pos.z) / 2, dist / 2 + p.riderRadius, ctx.obstacles);
  let first = null, firstTime = 2;
  for (let i = 0; i < ctx.obstacles.length; i++) {
    const o = ctx.obstacles[i], radius = o.radius + p.riderRadius;
    const ox = start.x - o.x, oz = start.z - o.z, a = dx * dx + dz * dz;
    const b = ox * dx + oz * dz, c = ox * ox + oz * oz - radius * radius;
    let time = c <= 0 ? 0 : 2;
    if (c > 0 && a > p.epsilon) {
      const disc = b * b - a * c;
      if (disc >= 0) time = (-b - Math.sqrt(disc)) / a;
    }
    if (time < 0 || time > 1 || time >= firstTime) continue;
    const y = start.y + (s.pos.y - start.y) * time;
    if (y > o.y + o.height + p.riderRadius || y < o.y - p.riderRadius) continue;
    first = o; firstTime = time;
  }
  if (first !== null) {
    const hitX = start.x + dx * firstTime, hitZ = start.z + dz * firstTime;
    let nx = hitX - first.x, nz = hitZ - first.z, nlen = Math.hypot(nx, nz);
    if (nlen < p.epsilon) { nx = -s.vel.x; nz = -s.vel.z; nlen = Math.hypot(nx, nz); }
    if (nlen < p.epsilon) { nx = 1; nz = 0; nlen = 1; }
    nx /= nlen; nz /= nlen;
    set(ctx.temp2, nx, 0, nz);
    if (s.mode !== 'air') { tangent(ctx.temp2, s.up, ctx.temp2); normalize(ctx.temp2, ctx.temp2); }
    const incoming = Math.max(0, -dot(s.vel, ctx.temp2));
    const radius = first.radius + p.riderRadius + p.epsilon;
    s.pos.x = first.x + nx * radius; s.pos.z = first.z + nz * radius;
    if (incoming > p.epsilon) {
      if (incoming > p.collisionEventSpeed) { const e = emit(ctx, 'collision'); e.obstacleType = first.type; e.speed = incoming; }
      ctx.mem.safeTimer = 0;
      s.vel.x += (1 + p.restitution) * incoming * ctx.temp2.x;
      s.vel.y += (1 + p.restitution) * incoming * ctx.temp2.y;
      s.vel.z += (1 + p.restitution) * incoming * ctx.temp2.z;
      // 硬い物（岩・建物・リフトの柱）は、木より低い速さで転ぶ。理由は、ぶつかった物の種類で返す
      const hard = first.type === 'rock' || first.type === 'building' || first.type === 'tower';
      if (incoming > (hard ? p.rockCrashSpeed : p.treeCrashSpeed)) ctx.crash(hard ? first.type : 'tree');
    }
    // 遅い速さで木や岩に真正面から押しつけられると、重力と反力が釣り合って動けなくなる。
    // 接しているあいだ、谷へ向かう側の接線へ少しずつ滑らせて、回り込ませる
    if (s.mode !== 'air' && s.mode !== 'crash' && Math.hypot(s.vel.x, s.vel.z) < p.slideAroundSpeed) {
      const tx = -nz, tz = nx, side = tx * s.up.x + tz * s.up.z >= -p.epsilon ? 1 : -1;
      s.vel.x += tx * side * p.slideAroundSpeed; s.vel.z += tz * side * p.slideAroundSpeed;
    }
    const remaining = dt * (1 - firstTime);
    s.pos.x += s.vel.x * remaining; s.pos.z += s.vel.z * remaining;
    alignContact(ctx);
  }
  const margin = Math.min(p.boundsMargin, ctx.terrain.half);
  const near = Math.max(Math.abs(s.pos.x), Math.abs(s.pos.z)) >= ctx.terrain.half - margin;
  if (near) {
    if (!ctx.mem.atBounds) emit(ctx, 'bounds');
    const speed = length(s.vel), after = Math.max(0, speed - p.boundsDecel * dt);
    if (speed > p.epsilon) scale(s.vel, after / speed, s.vel);
    const limit = Math.max(0, ctx.terrain.half - p.riderRadius);
    if (Math.abs(s.pos.x) > limit || Math.abs(s.pos.z) > limit) {
      s.pos.x = clamp(s.pos.x, -limit, limit); s.pos.z = clamp(s.pos.z, -limit, limit); set(s.vel, 0, 0, 0);
    }
    alignContact(ctx);
  }
  ctx.mem.atBounds = near; s.speed = length(s.vel);
}
function alignContact(ctx) {
  const s = ctx.state;
  if (s.mode !== 'air') {
    ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface); set(ctx.normal, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz);
    transport(s.vel, s.up, ctx.normal, s.vel); transport(s.fwd, s.up, ctx.normal, s.fwd); copy(ctx.normal, s.up);
    s.pos.y = ctx.surface.h;
  }
  placeCom(ctx);
}
