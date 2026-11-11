import { placeCom } from './pose.js';
import { extendPop } from './air.js';
import { copy, set, cross, length, headingOf, transport } from './vec.js';
import { mixSnow, updateSink } from './snow.js';
import { emit } from './state.js';
import { accelerateGround } from './forces.js';

/** Unilateral spring: a shortened target may unload, but cannot pull the body down.
 * Semi-implicit integration at <=1/240s keeps that constraint explicit. */
/**
 * 雪面を離れる。構えたまま（ジャンプを押したまま）縁を越えたときは、その場で踏み切ったことにする。
 * 2026-11-11：離しそびれると、構えで沈んだぶんだけ滞空が半分になった（台で 0.83 → 0.44 秒：体験の採点 2 周目）。
 * 台の縁で離すのは、狭いタイミング。押したままでも、台の勢いに構えのぶんが乗るようにする
 */
function leave(ctx) {
  const s = ctx.state, m = ctx.mem, p = ctx.p;
  if (ctx.controls.jump && !m.jumpBlocked && m.held + p.epsilon >= p.jumpHold) {
    const charge = Math.min(1, Math.max(0, (m.held - p.jumpHold) / (p.jumpChargeTime - p.jumpHold)));
    m.popDepth = s.crouch * (p.popMinFraction + (1 - p.popMinFraction) * charge);
    m.held = 0; m.popping = false;
    ctx.takeoff(true, p.popSpeed * m.popDepth);
  } else ctx.takeoff(false);
}
export function updateLeg(ctx, aN, dt) {
  const s = ctx.state, m = ctx.mem, p = ctx.p;
  // 構えている最中に、雪面がはっきり落ちはじめたら（台や段の縁）、沈み込みの途中でも、そこで踏み切る
  if (aN < -p.lipPop && ctx.controls.jump && !m.jumpBlocked && m.held + p.epsilon >= p.jumpHold) { leave(ctx); return 0; }
  const target = p.legStand + (p.legCrouch - p.legStand) * s.crouch;
  const rest = target + p.mass * p.gravity * s.up.y / p.spring;
  const c = m.legRate < 0 ? p.dampingCompress : p.dampingExtend;
  const force = Math.max(0, p.spring * (rest - s.leg) - c * m.legRate);
  // Crouching can shorten an unloaded leg while the board stays on snow.
  // Passive unloading must detach even if a returning surface has begun shortening the leg.
  const crouchShortening = m.legRate < 0 && (ctx.controls.jump || ctx.controls.tuck > 0);
  m.unloadedTime = force === 0 && !crouchShortening ? (m.unloadedTime ?? 0) + dt : 0;
  if (m.unloadedTime + p.epsilon >= p.unloadTime) { leave(ctx); return 0; }
  if (aN <= 0 && s.leg >= p.legMax) { leave(ctx); return 0; }
  m.legRate += (force / p.mass - aN) * dt;
  s.leg += m.legRate * dt;
  if (s.leg < p.legMin) {
    if (m.legRate < 0) emit(ctx, 'bottomOut').impulse = -m.legRate * p.mass;
    s.leg = p.legMin; m.legRate = 0;
  }
  if (s.leg >= p.legMax && m.legRate > 0) {
    s.leg = p.legMax; leave(ctx); return 0;
  }
  s.leg = Math.min(s.leg, p.legMax);
  s.load = force / (p.mass * p.gravity);
  return force;
}

export function groundStep(ctx, dt) {
  const s = ctx.state, p = ctx.p, m = ctx.mem;
  ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface);
  set(ctx.normal, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz);
  transport(s.vel, s.up, ctx.normal, s.vel); transport(s.fwd, s.up, ctx.normal, s.fwd); copy(ctx.normal, s.up);
  ctx.terrain.snowAt(s.pos.x, s.pos.z, s.snow); mixSnow(s.snow, p.snow, ctx.material);
  s.speed = length(s.vel);
  const horizontal = Math.hypot(s.vel.x, s.vel.z);
  const dx = horizontal > p.epsilon ? s.vel.x / horizontal : Math.sin(s.heading);
  const dz = horizontal > p.epsilon ? s.vel.z / horizontal : -Math.cos(s.heading);
  const curvature = ctx.terrain.curvatureAlong(s.pos.x, s.pos.z, dx, dz);
  const aN = p.gravity * s.up.y + s.speed * s.speed * curvature;
  const force = m.popping ? extendPop(ctx, aN, dt) : updateLeg(ctx, aN, dt);
  if (s.mode === 'air') return;
  const plow = updateSink(s, force, ctx.material, p);
  accelerateGround(ctx, force, plow, dt);
  if (ctx.controls.tuck > 0 && ctx.controls.brake === 0 && !ctx.controls.jump && !m.popping) {
    const kick = Math.min(p.kickAcceleration * ctx.controls.tuck * dt, Math.max(0, p.kickMaxSpeed - length(s.vel)));
    s.vel.x += s.fwd.x * kick; s.vel.y += s.fwd.y * kick; s.vel.z += s.fwd.z * kick;
  }
  s.pos.x += s.vel.x * dt; s.pos.z += s.vel.z * dt;
  ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface);
  set(ctx.normal, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz);
  transport(s.vel, s.up, ctx.normal, s.vel); transport(s.fwd, s.up, ctx.normal, s.fwd); copy(ctx.normal, s.up);
  s.pos.y = ctx.surface.h;
  s.speed = length(s.vel); s.heading = headingOf(s.fwd); cross(s.fwd, s.up, s.right);
  placeCom(ctx, dt);
  s.gLoad = Math.hypot(force, s.tele.edgeForce) / (p.mass * p.gravity);
}
