/** Allocation-free two-bone IK. Pole is a world point, not a direction.
 * Return <= 1 when reachable, > 1 when too far OR inside the folded reach.
 * For coincident endpoints, a deterministic downward axis resolves ambiguity.
 */
export function solveTwoBone(root, target, pole, lenA, lenB, outMid, outEnd) {
  const rx = root.x, ry = root.y, rz = root.z;
  let dx = target.x - rx, dy = target.y - ry, dz = target.z - rz;
  const requested = Math.hypot(dx, dy, dz);
  if (requested > 1e-12) { dx /= requested; dy /= requested; dz /= requested; }
  else { dx = 0; dy = -1; dz = 0; }
  const min = Math.abs(lenA - lenB), max = lenA + lenB;
  const d = Math.min(max, Math.max(min, requested));
  let px = pole.x - rx, py = pole.y - ry, pz = pole.z - rz;
  const dot = px * dx + py * dy + pz * dz;
  px -= dx * dot; py -= dy * dot; pz -= dz * dot;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-12) {
    // Choose the least aligned world axis before projecting it onto the bend plane.
    px = Math.abs(dx) <= Math.abs(dy) && Math.abs(dx) <= Math.abs(dz) ? 1 : 0;
    py = px === 0 && Math.abs(dy) <= Math.abs(dz) ? 1 : 0;
    pz = px === 0 && py === 0 ? 1 : 0;
    const p = px * dx + py * dy + pz * dz;
    px -= dx * p; py -= dy * p; pz -= dz * p; pl = Math.hypot(px, py, pz);
  }
  const along = d > 1e-12 ? (lenA * lenA - lenB * lenB + d * d) / (2 * d) : 0;
  const bend = Math.sqrt(Math.max(0, lenA * lenA - along * along)) / pl;
  outMid.x = rx + dx * along + px * bend;
  outMid.y = ry + dy * along + py * bend;
  outMid.z = rz + dz * along + pz * bend;
  outEnd.x = rx + dx * d; outEnd.y = ry + dy * d; outEnd.z = rz + dz * d;
  return requested > max ? requested / max : requested < min ? min / requested : 1;
}
