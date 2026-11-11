export class FakeAudioParam {
  constructor(ctx, value = 0) { this.ctx = ctx; this.initial = value; this.calls = []; this.events = []; }
  get value() { return this.valueAtTime(this.ctx.currentTime); }
  set value(value) { this.initial = value; }
  record(method, value, time, extra) {
    if (![value, time, ...(extra === undefined ? [] : [extra])].every(Number.isFinite)) throw Error('非数の予約');
    this.calls.push({ method, value, time, ...(extra === undefined ? {} : { timeConstant: extra }) });
    this.events.push({ method, value, time, extra }); this.events.sort((a, b) => a.time - b.time);
    return this;
  }
  setValueAtTime(value, time) { return this.record('setValueAtTime', value, time); }
  setTargetAtTime(value, time, tau) { return this.record('setTargetAtTime', value, time, tau); }
  linearRampToValueAtTime(value, time) { return this.record('linearRampToValueAtTime', value, time); }
  exponentialRampToValueAtTime(value, time) { return this.record('exponentialRampToValueAtTime', value, time); }
  cancelScheduledValues(time) {
    this.calls.push({ method: 'cancelScheduledValues', time }); this.events = this.events.filter(e => e.time < time); return this;
  }
  cancelAndHoldAtTime(time) {
    const value = this.valueAtTime(time);
    this.calls.push({ method: 'cancelAndHoldAtTime', time });
    this.events = this.events.filter(e => e.time < time);
    this.events.push({ method: 'setValueAtTime', value, time });
    return this;
  }
  valueAtTime(at) {
    let value = this.initial, cursor = 0, goal;
    const advance = time => {
      if (goal) value = goal.value + (value - goal.value) * Math.exp(-(time - cursor) / goal.extra);
      cursor = time;
    };
    for (const event of this.events) {
      if (event.method.includes('Ramp')) {
        const fraction = Math.min(1, (at - cursor) / (event.time - cursor || 1));
        const interpolated = event.method.startsWith('exponential') && value > 0
          ? value * (event.value / value) ** fraction : value + (event.value - value) * fraction;
        if (event.time > at) return interpolated;
        value = event.value; cursor = event.time; goal = undefined;
      } else {
        if (event.time > at) break;
        advance(event.time);
        if (event.method === 'setTargetAtTime') goal = event;
        else { value = event.value; goal = undefined; }
      }
    }
    advance(at); return value;
  }
}

class FakeNode {
  constructor(ctx, kind, params = {}) {
    this.ctx = ctx; this.kind = kind; this.connections = []; this.disconnects = 0;
    for (const [name, value] of Object.entries(params)) this[name] = new FakeAudioParam(ctx, value);
    ctx.nodes.push(this);
  }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnects++; this.connections.length = 0; }
}

class FakeSource extends FakeNode {
  constructor(ctx, kind, params) { super(ctx, kind, params); this.starts = []; this.stops = []; this.onended = null; this.ended = false; }
  start(when = 0, offset = 0) {
    if (this.starts.length) throw Error('同じ音源を再利用した');
    this.starts.push({ when, offset });
  }
  stop(when = 0) {
    if (!this.starts.length || this.ended) throw Error('終了済みか開始前');
    this.stops.push(when); this.stopTime = when;
  }
  finish() { if (this.ended) return; this.ended = true; this.onended?.(); }
}

export class FakeAudioContext {
  constructor({ sampleRate = 48000, state = 'suspended' } = {}) {
    this.sampleRate = sampleRate; this.currentTime = 0; this.state = state; this.nodes = []; this.buffers = [];
    this.destination = new FakeNode(this, 'destination'); this.resumeCalls = 0; this.closeCalls = 0;
  }
  createGain() { return new FakeNode(this, 'gain', { gain: 1 }); }
  createBiquadFilter() { return new FakeNode(this, 'biquad', { frequency: 350, Q: 1 }); }
  createStereoPanner() { return new FakeNode(this, 'panner', { pan: 0 }); }
  createDynamicsCompressor() { return new FakeNode(this, 'compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }); }
  createBufferSource() { return new FakeSource(this, 'buffer-source'); }
  createOscillator() { return new FakeSource(this, 'oscillator', { frequency: 440 }); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    const buffer = { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] };
    this.buffers.push(buffer); return buffer;
  }
  resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
  advance(seconds) {
    this.currentTime += seconds;
    for (const node of this.nodes) if (node.stopTime <= this.currentTime) node.finish();
  }
}

export function fakeClock() {
  let milliseconds = 0, nextId = 0;
  const intervals = new Map();
  return { intervals, now: () => milliseconds,
    setInterval(fn, ms) { const id = ++nextId; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    advance(ms) { milliseconds += ms; },
    tick() { for (const { fn } of intervals.values()) fn(); },
  };
}
