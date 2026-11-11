/** Analytic heightfields matching mountain-world's public query shape. No world import. */
export function heightfield(evaluate, { half = 1e7, snow = {}, obstacles = [] } = {}) {
  const scratch = { h: 0, hx: 0, hz: 0, hxx: 0, hxz: 0, hzz: 0 };
  const cover = { depth: 1, packed: 1, powder: 0, ice: 0, rock: 0, wind: 0, rough: 0, ...snow };
  return {
    half,
    heightAt(x, z) { evaluate(x, z, scratch); return scratch.h; },
    sampleSurface(x, z, out) {
      evaluate(x, z, scratch);
      const d = Math.hypot(scratch.hx, 1, scratch.hz);
      out.h = scratch.h; out.nx = -scratch.hx / d; out.ny = 1 / d; out.nz = -scratch.hz / d;
      out.inBounds = Math.abs(x) <= half && Math.abs(z) <= half;
      return out;
    },
    curvatureAlong(x, z, dx, dz) {
      evaluate(x, z, scratch);
      const hd = scratch.hx * dx + scratch.hz * dz;
      const hdd = scratch.hxx * dx * dx + 2 * scratch.hxz * dx * dz + scratch.hzz * dz * dz;
      return hdd / ((1 + hd * hd) * Math.hypot(scratch.hx, 1, scratch.hz));
    },
    snowAt(x, z, out) { for (const key in cover) out[key] = cover[key]; return out; },
    obstaclesNear(x, z, radius, out) {
      out.length = 0;
      for (const obstacle of obstacles) if (Math.hypot(x - obstacle.x, z - obstacle.z) <= radius + obstacle.radius) out.push(obstacle);
      return out;
    },
  };
}
export function plane(angle = 0, heading = 0, options) {
  const hx = -Math.tan(angle) * Math.sin(heading), hz = Math.tan(angle) * Math.cos(heading);
  return heightfield((x, z, out) => { out.h = hx * x + hz * z; out.hx = hx; out.hz = hz; out.hxx = out.hxz = out.hzz = 0; }, options);
}
/** Circular X-section: exactly constant signed curvature in the X/Y plane. */
export function circular(curvature = -1 / 20, crossSlope = 0, options) {
  return heightfield((x, z, out) => {
    const q = Math.max(1e-6, 1 - (x * curvature) ** 2), root = Math.sqrt(q);
    out.h = curvature === 0 ? crossSlope * z : (1 - root) / curvature + crossSlope * z;
    out.hx = curvature * x / root; out.hz = crossSlope;
    out.hxx = curvature / q ** 1.5; out.hxz = out.hzz = 0;
  }, options);
}
export function parabola(curvature = 0.05, crossSlope = 0, options) {
  return heightfield((x, z, out) => {
    out.h = curvature * x * x / 2 + crossSlope * z; out.hx = curvature * x; out.hz = crossSlope;
    out.hxx = curvature; out.hxz = out.hzz = 0;
  }, options);
}
export function wave(amplitude = 0.4, wavelength = 18, slope = 0.1, options) {
  const k = 2 * Math.PI / wavelength;
  return heightfield((x, z, out) => {
    out.h = amplitude * Math.cos(k * x) * Math.cos(k * z) + slope * z;
    out.hx = -amplitude * k * Math.sin(k * x) * Math.cos(k * z);
    out.hz = -amplitude * k * Math.cos(k * x) * Math.sin(k * z) + slope;
    out.hxx = out.hzz = -amplitude * k * k * Math.cos(k * x) * Math.cos(k * z);
    out.hxz = amplitude * k * k * Math.sin(k * x) * Math.sin(k * z);
  }, options);
}
/** Compact C2 kicker/ridge, so the first crossing can lie before both tick endpoints. */
export function kicker(height = 1, width = 3, center = 0, options) {
  return heightfield((x, z, out) => {
    const u = (x - center) / width, q = Math.max(0, 1 - u * u);
    out.h = height * q ** 3; out.hx = -6 * height * u * q * q / width;
    out.hxx = q > 0 ? height * (-6 * q * q + 24 * u * u * q) / (width * width) : 0;
    out.hz = out.hxz = out.hzz = 0;
  }, options);
}
