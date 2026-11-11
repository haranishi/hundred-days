import { edgeGrip } from './params.js';
import { dot, cross, scale, length, clamp, turn } from './vec.js';
import { dragForce } from './aero.js';
import { emit } from './state.js';

export function carveForces(ctx, force, plow, dt) {
  const s = ctx.state, m = ctx.mem, p = ctx.p, mat = ctx.material;
  const speed = length(s.vel);
  if (speed <= p.epsilon) return;
  scale(s.vel, 1 / speed, ctx.direction); cross(ctx.direction, s.up, ctx.lateralDirection);
  const edgeMax = p.edgeMax + (p.edgeTuck - p.edgeMax) * s.crouch;
  // Command edge force, leaving gravity free to pull a neutral board downhill.
  // Lean uses steady support so transient unloading cannot flip a neutral edge.
  const gSide = dot(ctx.gravity, ctx.lateralDirection);
  const capacity = p.lateralReserve * mat.lambda * edgeGrip(edgeMax, p) * p.gravity * s.up.y;
  const yawCommand = clamp(speed / (p.sidecut * Math.cos(edgeMax)), p.turnYawMin, p.turnYawMax);
  const maxAccel = Math.min(speed * yawCommand, capacity);
  const command = ctx.controls.steer * (m.sketch > 0 ? p.sketchControl : 1) * maxAccel;
  const omega = p.lateralOmega * (s.load < p.lightLoad ? p.lightResponse : 1);
  const error = m.lateral - command, b = m.lateralRate + omega * error, decay = Math.exp(-omega * dt);
  m.lateral = command + (error + b * dt) * decay; m.lateralRate = (m.lateralRate - omega * b * dt) * decay;
  const request = p.mass * m.lateral;
  s.edge = clamp(Math.atan2(request, p.mass * p.gravity * s.up.y), -p.edgeMax, p.edgeMax);
  const maxForce = mat.lambda * force * edgeGrip(s.edge, p) * (s.mode === 'skid' ? p.skidTurnGrip : 1);
  const edge = clamp(request, -maxForce, maxForce);
  s.tele.edgeForce = edge; s.tele.carveDrag = p.carveFriction * Math.abs(edge);
  // 止まっている間は、角度がほぼ 0 のまま符号だけが細かく入れ替わる。角度と速さに下限を置いて、切り替えと数えない
  const side = Math.abs(s.edge) > p.edgeSwitchAngle ? Math.sign(s.edge) : 0;
  if (side !== 0 && side !== m.edgeSide) {
    if (m.edgeSide !== 0 && s.speed > p.edgeSwitchSpeed) emit(ctx, 'edgeSwitch').side = side;
    m.edgeSide = side;
  }
  m.breakTimer = s.mode === 'carve' && (Math.abs(request) > maxForce * p.breakRatio + p.epsilon || (speed > p.skidSpeed && Math.abs(ctx.controls.steer) >= p.skidSteer)) ? m.breakTimer + dt : 0;
  if (m.breakTimer >= p.breakTime) {
    s.mode = 'skid'; m.recapture = 0; m.breakTimer = 0;
    emit(ctx, 'carveBreak').cause = s.load < p.lightLoad ? 'unloaded' : 'grip';
  }
  const drift = s.mode === 'skid';
  const slip = s.slip;
  if (drift) {
    m.recapture += dt;
    // Follow the achieved force through a reversal: the slipping board must use its uphill edge.
    s.slip = p.skidTurnAngle * clamp(edge / Math.max(maxForce, p.epsilon), -1, 1) * (1 - Math.exp(-p.skidOmega * m.recapture));
    s.edge = Math.sign(s.slip) * (s.switch ? -1 : 1) * Math.abs(s.edge);
  } else s.slip *= Math.exp(-p.skidOmega * dt);
  const scrape = drift ? p.skidTurnDrag * Math.abs(edge) * Math.abs(Math.sin(s.slip)) : 0;
  s.tele.skidPower = scrape * speed; s.tele.spray = clamp(s.tele.skidPower / p.sprayPower, 0, 1);
  const alongGravity = dot(ctx.gravity, ctx.direction);
  const accelerated = Math.max(0, speed + alongGravity * dt);
  // 低い姿勢の滑りのよさ（道具ごと。スノーボードは 1 倍＝これまでと 1 ビットも変わらない）
  const glide = 1 - (1 - p.tuckGlide) * s.crouch;
  const endSpeed = Math.max(0, accelerated - (mat.mu * force * glide + s.tele.carveDrag + scrape + plow + dragForce(accelerated, s.crouch, p)) / p.mass * dt);
  const lateralAccel = edge / p.mass + gSide;
  s.yawRate = clamp(lateralAccel / speed, -p.turnYawMax, p.turnYawMax);
  // Rotating an arc preserves work-free lateral forces; Euler addition injects energy.
  turn(ctx.direction, s.up, s.yawRate * dt, ctx.direction); scale(ctx.direction, endSpeed, s.vel);
  scale(ctx.direction, s.switch ? -1 : 1, s.fwd); turn(s.fwd, s.up, s.slip, s.fwd); cross(s.fwd, s.up, s.right);
  s.yawRate += (s.slip - slip) / dt;
}
