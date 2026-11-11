/** Mix into a caller-owned record. Rock exposure overrides the snow mixture. */
export function effectiveRock(exposure) { return Math.min(1, Math.max(0, (exposure - 0.5) / 0.5)); }
export function mixSnow(snow, table, out) {
  const rock = effectiveRock(snow.rock || 0);
  const total = snow.packed + snow.powder + snow.ice;
  const a = total > 0 ? snow.packed / total : 1;
  const b = total > 0 ? snow.powder / total : 0;
  const c = total > 0 ? snow.ice / total : 0;
  out.mu = (a * table.packed.mu + b * table.powder.mu + c * table.ice.mu) * (1 - rock) + rock * table.rock.mu;
  out.lambda = (a * table.packed.lambda + b * table.powder.lambda + c * table.ice.lambda) * (1 - rock) + rock * table.rock.lambda;
  out.kz = (a * table.packed.kz + b * table.powder.kz + c * table.ice.kz) * (1 - rock) + rock * table.rock.kz;
  out.q = (a * table.packed.q + b * table.powder.q + c * table.ice.q) * (1 - rock) + rock * table.rock.q;
  out.powder = b * (1 - rock);
  return out;
}
/** Support force in N, as proposed in R2 §2.6. */
export function snowSupport(depth, speed, kz, p) {
  return p.area * (kz * depth + 0.5 * p.snowDensity * p.snowLift * speed * speed * Math.min(depth / p.submerge, 1));
}
/** Exact inverse of the two linear branches of snowSupport. */
export function updateSink(state, force, material, p) {
  if (material.powder <= 0 || material.kz <= 0) { state.sink = 0; return 0; }
  const lift = 0.5 * p.snowDensity * p.snowLift * state.speed ** 2;
  let depth = force / (p.area * (material.kz + lift / p.submerge));
  if (depth > p.submerge) depth = (force / p.area - lift) / material.kz;
  state.sink = Math.max(0, Math.min(depth, p.sinkMax, state.snow.depth)) * material.powder;
  return material.q * state.sink ** 2 * Math.tanh(state.speed / p.plowRegularSpeed);
}
