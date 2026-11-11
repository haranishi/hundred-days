import { set } from './vec.js';
/** Preserve the COM at landing, then absorb the residual body lean continuously.
 * Aligning the board to a new support normal must not teleport the rider's mass. */
export function placeCom(ctx, dt = 0) {
  const s = ctx.state, m = ctx.mem, decay = Math.exp(-dt / ctx.p.comSettleTime);
  m.comOffsetX *= decay; m.comOffsetY *= decay; m.comOffsetZ *= decay;
  set(s.com, s.pos.x + s.up.x * s.leg + m.comOffsetX,
    s.pos.y + s.up.y * s.leg + m.comOffsetY, s.pos.z + s.up.z * s.leg + m.comOffsetZ);
}
