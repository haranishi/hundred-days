import { initAirBasis, predictTricks, updateGrab } from './tricks.js';
import { set, cross, length, clamp, copy, headingOf } from './vec.js';
import { dragForce } from './aero.js';
import { emit } from './state.js';

export function prepareJump(ctx, dt) {
  const s = ctx.state, m = ctx.mem, p = ctx.p, c = ctx.controls;
  if (s.mode === 'air' && c.jump) m.jumpBlocked = true;
  if (s.mode !== 'air' && s.mode !== 'crash' && m.jumpBlocked) {
    m.held = 0; m.wasJump = false; if (!c.jump) m.jumpBlocked = false; return;
  }
  if (s.mode !== 'air' && s.mode !== 'crash') {
    if (c.jump) { m.held += dt; m.windup = (c.rawSteer ?? c.steer) * p.spinWindup * s.crouch; }
    else if (m.wasJump) {
      if (m.held + p.epsilon >= p.jumpHold) {
        m.popping = true;
        const charge = clamp((m.held - p.jumpHold) / (p.jumpChargeTime - p.jumpHold), 0, 1);
        m.popDepth = s.crouch * (p.popMinFraction + (1 - p.popMinFraction) * charge);
      }
      if (!m.popping) m.windup = 0;
      m.held = 0;
    }
  } else { m.held = 0; m.popping = false; }
  m.wasJump = c.jump;
}
export function extendPop(ctx, aN, dt) {
  const s = ctx.state, m = ctx.mem, p = ctx.p;
  m.legRate = p.popSpeed * m.popDepth;
  s.leg = Math.min(p.legStand, s.leg + m.legRate * dt);
  if (s.leg >= p.legStand || aN <= 0) {
    m.popping = false; ctx.takeoff(true, m.legRate); return 0;
  }
  const force = Math.max(0, p.mass * aN); s.load = force / (p.mass * p.gravity); return force;
}
/** Evaluate board position from ballistic COM and continuous internal leg/orientation motion. */
export function flightAt(ctx, t, out) {
  const s = ctx.state, p = ctx.p, f = ctx.flight;
  // 2026-11-11：低い姿勢を保っている間は、空中でも脚を伸ばさない。伸ばすと、縁を越えた直後に、板が落ちていく雪面を追いかけて
  // すぐ着地し直し、低い姿勢のままだと段で全く浮かなかった（体験の採点 1 周目。脚が 0.57 → 0.75 m へ伸びて、縁を吸収しきっていた）
  const relaxed = p.legAir + (p.legCrouch - p.legAir) * s.crouch;
  const targetLeg = ctx.mem.takeoffPop ? p.legAir : Math.max(s.leg, relaxed);
  const leg = targetLeg + (s.leg - targetLeg) * Math.exp(-t / p.crouchTime);
  predictTricks(ctx, t);
  set(out, s.com.x + s.vel.x * t + f.ax * t * t / 2 - f.ux * leg,
    s.com.y + s.vel.y * t + f.ay * t * t / 2 - f.uy * leg,
    s.com.z + s.vel.z * t + f.az * t * t / 2 - f.uz * leg);
  f.leg = leg;
  return out;
}
export function commitFlight(ctx, t) {
  const s = ctx.state, m = ctx.mem, p = ctx.p, f = ctx.flight;
  flightAt(ctx, t, ctx.temp);
  s.com.x += s.vel.x * t + f.ax * t * t / 2; s.com.y += s.vel.y * t + f.ay * t * t / 2; s.com.z += s.vel.z * t + f.az * t * t / 2;
  s.vel.x += f.ax * t; s.vel.y += f.ay * t; s.vel.z += f.az * t;
  copy(ctx.temp, s.pos); set(s.up, f.ux, f.uy, f.uz); set(s.fwd, f.fx, f.fy, f.fz); s.leg = f.leg;
  m.baseUX = f.bux; m.baseUY = f.buy; m.baseUZ = f.buz; m.baseFX = f.bfx; m.baseFY = f.bfy; m.baseFZ = f.bfz;
  m.spin = f.spinRate; m.flipRate = f.flipRate;
  cross(s.fwd, s.up, s.right);
  s.yawRate = t > p.epsilon ? f.yaw / t : 0; s.heading = headingOf(s.fwd); s.air.spin += f.yaw; s.air.flip = f.flip;
  updateGrab(ctx, t);
  s.air.time += t; s.air.apex = Math.max(s.air.apex, s.com.y); s.speed = length(s.vel);
  s.load = s.gLoad = 0; s.tele.edgeForce = s.tele.carveDrag = s.tele.skidPower = s.tele.spray = 0;
  if (!m.takeoffSent && s.air.time + p.epsilon >= p.airEventTime) {
    const e = emit(ctx, 'takeoff'); e.speed = m.takeoffSpeed; e.pop = m.takeoffPop; m.takeoffSent = true;
  }
}
export function airStep(ctx, dt) {
  const s = ctx.state, p = ctx.p, f = ctx.flight;
  if (!ctx.mem.airBasis) { initAirBasis(ctx); ctx.mem.seeded = ctx.mem.takeoffPop && ctx.mem.seedSide !== 0; }
  if (ctx.mem.seeded && ctx.controls.steer * ctx.mem.seedSide <= 0) ctx.mem.seeded = false;
  if (s.air.time + dt > p.trickDelay + p.epsilon &&
      ((ctx.controls.jump && (ctx.controls.steer !== 0 || ctx.controls.tuck !== ctx.controls.brake)) || ctx.mem.seeded)) ctx.mem.hadTrick = true;
  const speed = length(s.vel), drag = speed > p.epsilon ? dragForce(speed, s.crouch, p) / (p.mass * speed) : 0;
  f.ax = -drag * s.vel.x; f.ay = -p.gravity - drag * s.vel.y; f.az = -drag * s.vel.z;
  ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface);
  f.nx = ctx.surface.nx; f.ny = ctx.surface.ny; f.nz = ctx.surface.nz;
  if (ctx.findLanding) {
    const time = ctx.findLanding(dt);
    if (time >= 0) { commitFlight(ctx, time); ctx.land(); const remaining = dt - time; if (remaining > p.epsilon) ctx.groundedRemainder(remaining); return; }
  }
  commitFlight(ctx, dt);
}
