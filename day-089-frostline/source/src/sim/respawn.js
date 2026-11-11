function headingAt(surface, saved, p) {
  return surface.ny <= Math.cos(p.respawnSlope) + p.epsilon ? Math.atan2(surface.nx, -surface.nz) : saved;
}

/** Choose a clear lateral corridor, or the least obstructed candidate if none is clear.
 * Respawning is infrequent, so candidates can be solved from obstacle interval boundaries. */
export function respawnTarget(ctx, target) {
  const p = ctx.p, surface = ctx.surface;
  ctx.terrain.sampleSurface(target.x, target.z, surface);
  const heading = headingAt(surface, target.heading, p);
  const dx = Math.sin(heading), dz = -Math.cos(heading), sx = -dz, sz = dx;
  const reach = Math.hypot(p.respawnAhead, p.respawnHalfWidth) + p.respawnSideMax + p.riderRadius;
  ctx.terrain.obstaclesNear(target.x, target.z, reach, ctx.obstacles);
  const intervals = [], candidates = [0, -p.respawnSideMax, p.respawnSideMax];
  for (const o of ctx.obstacles) {
    const rx = o.x - target.x, rz = o.z - target.z, ahead = rx * dx + rz * dz;
    const radius = o.radius + p.riderRadius;
    if (ahead < -radius || ahead > p.respawnAhead + radius) continue;
    const lateral = rx * sx + rz * sz, need = p.respawnHalfWidth + radius;
    const lo = lateral - need - p.epsilon, hi = lateral + need + p.epsilon;
    intervals.push({ lateral, need, lo, hi }); candidates.push(lo, hi);
  }
  // When all corridors overlap obstacles, the maximin clearance can lie in an interior gap.
  for (const a of intervals) for (const b of intervals) {
    if (a.lateral < b.lateral) candidates.push((a.hi + b.lo) / 2);
  }
  let offset = 0, bestHeading = heading, bestClear = false, bestScore = -Infinity;
  for (const candidate of candidates) {
    if (Math.abs(candidate) > p.respawnSideMax) continue;
    const x = target.x + sx * candidate, z = target.z + sz * candidate;
    ctx.terrain.sampleSurface(x, z, surface);
    if (!surface.inBounds) continue;
    // A sideways move can change the local fall line: score the corridor we will actually face.
    const localHeading = headingAt(surface, target.heading, p), localX = Math.sin(localHeading), localZ = -Math.cos(localHeading);
    let score = Infinity;
    for (const o of ctx.obstacles) {
      const rx = o.x - x, rz = o.z - z, radius = o.radius + p.riderRadius;
      const ahead = rx * localX + rz * localZ;
      if (ahead < -radius || ahead > p.respawnAhead + radius) continue;
      score = Math.min(score, Math.abs(-rx * localZ + rz * localX) - p.respawnHalfWidth - radius);
    }
    const clear = score >= 0;
    if ((clear && !bestClear) || (clear && bestClear && Math.abs(candidate) < Math.abs(offset)) ||
        (!clear && !bestClear && score > bestScore)) {
      offset = candidate; bestHeading = localHeading; bestClear = clear; bestScore = score;
    }
  }
  return { ...target, x: target.x + sx * offset, z: target.z + sz * offset, heading: bestHeading };
}
