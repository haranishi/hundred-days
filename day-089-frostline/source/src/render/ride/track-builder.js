const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Capacity counts sections (two vertices each). Iterate from (head-count+capacity)%capacity. */
export function createTrackBuilder({ capacity, minStep = 0.25 }) {
  if (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(minStep) || minStep < 0) throw new RangeError('Invalid track capacity or minStep');
  let previous = false, lastX = 0, lastZ = 0, disconnected = true;
  const builder = {
    positions: new Float32Array(capacity * 6), attrs: new Float32Array(capacity * 4), breaks: new Uint8Array(capacity),
    head: 0, count: 0, version: 0,
    push(sample) {
      if (!sample.grounded) { disconnected = true; return; }
      let dx = sample.x - lastX, dz = sample.z - lastZ;
      const step = Math.hypot(dx, dz);
      if (previous && step < minStep) return;
      if (!previous || step < 1e-12) { dx = sample.fx; dz = sample.fz; }
      const length = Math.hypot(dx, dz);
      if (length < 1e-12) { dx = 0; dz = -1; } else { dx /= length; dz /= length; }
      // 幅は、呼ぶ側が渡せば（sample.width・m）それを使う。切るターンの細い溝を、板の幅より細く描くため
      const half = (Number.isFinite(sample.width) && sample.width > 0 ? sample.width : 0.26 + 1.3 * Math.abs(Math.sin(sample.slip))) / 2;
      const rx = -dz * half, rz = dx * half;
      const lx = sample.x - rx, lz = sample.z - rz, rightX = sample.x + rx, rightZ = sample.z + rz;
      const ly = sample.heightAt(lx, lz) + 0.03, ry = sample.heightAt(rightX, rightZ) + 0.03;
      // A bad terrain sample must not corrupt the ring or consume its minStep history.
      if (!Number.isFinite(lx + lz + rightX + rightZ + ly + ry + sample.slip + sample.load + sample.softness)) return;
      const i = builder.head, n = i * 6, a = i * 4, pos = builder.positions, attrs = builder.attrs;
      const density = clamp(sample.load, 0, 2) / 2 * (0.5 + 0.5 * clamp(sample.softness, 0, 1));
      pos[n] = lx; pos[n + 1] = ly; pos[n + 2] = lz; pos[n + 3] = rightX; pos[n + 4] = ry; pos[n + 5] = rightZ;
      attrs[a] = 0; attrs[a + 1] = density; attrs[a + 2] = 1; attrs[a + 3] = density;
      builder.breaks[i] = disconnected ? 1 : 0;
      builder.head = (i + 1) % capacity; builder.count = Math.min(capacity, builder.count + 1);
      // The oldest valid section has no valid predecessor after overwriting it.
      if (builder.count === capacity) builder.breaks[builder.head] = 1;
      builder.version++; lastX = sample.x; lastZ = sample.z; previous = true; disconnected = false;
    },
    clear() {
      builder.positions.fill(0); builder.attrs.fill(0); builder.breaks.fill(0);
      builder.head = 0; builder.count = 0; builder.version++; previous = false; disconnected = true;
    },
  };
  return builder;
}

/** Contact point under each ski boot; no simulation internals are needed. */
export function skiContact(pose,side,out){
 const a=pose.joints['ankle'+side],u=pose.board.up;
 out.x=a.x-u.x*.11;out.y=a.y-u.y*.11;out.z=a.z-u.z*.11;
 return out;
}
