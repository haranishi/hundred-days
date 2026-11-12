export const DURATION = 30_000;
export const MIN_INTERVAL = 500;
export const MAX_INTERVAL = 600;
const EPSILON = 0.000001;

export function classifyInterval(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'unknown';
  if (ms < MIN_INTERVAL - EPSILON) return 'fast';
  if (ms > MAX_INTERVAL + EPSILON) return 'slow';
  return 'in-range';
}

export function intervalsOf(times) {
  return times.slice(1).map((time, i) => time - times[i]);
}

export function summarize(times, start, end) {
  const valid = times.filter((t, i) => Number.isFinite(t) && t >= start && t < end && (i === 0 || t > times[i - 1]));
  const intervals = intervalsOf(valid);
  const span = valid.length > 1 ? valid.at(-1) - valid[0] : 0;
  const inRange = intervals.filter((ms) => classifyInterval(ms) === 'in-range').length;
  const gaps = valid.length ? [valid[0] - start, ...intervals, end - valid.at(-1)] : [end - start];
  return {
    taps: valid.length, intervals, inRange, intervalCount: intervals.length,
    averageBpm: span > 0 ? 60_000 * intervals.length / span : null,
    percent: intervals.length ? Math.round(100 * inRange / intervals.length) : null,
    longestGap: Math.max(0, ...gaps), span,
    enoughData: intervals.length >= 10 && span >= 5_000,
  };
}

export class Session {
  constructor(start, duration = DURATION) { this.start = start; this.end = start + duration; this.times = []; }
  record(time) {
    if (!Number.isFinite(time) || time < this.start || time >= this.end || (this.times.length && time <= this.times.at(-1))) return false;
    this.times.push(time); return true;
  }
  recent() {
    const values = intervalsOf(this.times).slice(-6);
    if (values.length < 3) return null;
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    return { bpm: 60_000 / average, classification: classifyInterval(average) };
  }
  result() { return summarize(this.times, this.start, this.end); }
}

// An acceleration pulse is a reference input, never a distance/depth measurement.
export class MotionDetector {
  constructor() { this.gravity = null; this.axis = null; this.armed = true; this.last = -Infinity; this.samples = 0; this.lastSample = null; }
  feed(event, now) {
    const dt = this.lastSample === null ? 10 : Math.max(1, Math.min(200, now - this.lastSample));
    this.lastSample = now;
    let value = event.acceleration;
    const good = (v) => v && ['x', 'y', 'z'].every((k) => Number.isFinite(v[k]));
    if (!good(value)) {
      const raw = event.accelerationIncludingGravity;
      if (!good(raw)) return { valid: false, pulse: false };
      if (!this.gravity) this.gravity = { ...raw };
      value = {};
      for (const k of ['x', 'y', 'z']) {
        this.gravity[k] += (1 - Math.exp(-dt / 600)) * (raw[k] - this.gravity[k]);
        value[k] = raw[k] - this.gravity[k];
      }
    }
    const magnitude = Math.hypot(value.x, value.y, value.z);
    this.samples += 1;
    if (!this.axis && this.samples > 3 && magnitude >= 3) {
      this.axis = { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
    }
    const directed = this.axis ? value.x * this.axis.x + value.y * this.axis.y + value.z * this.axis.z : 0;
    // Re-arm only on the opposite half-cycle: an up/down round trip counts once.
    if (directed < -1.2) this.armed = true;
    const pulse = this.samples > 3 && this.armed && directed >= 3 && now - this.last >= 280;
    if (pulse) { this.last = now; this.armed = false; }
    return { valid: true, pulse };
  }
}
