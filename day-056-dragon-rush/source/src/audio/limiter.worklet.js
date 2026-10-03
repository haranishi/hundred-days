// 独自実装の先読みリミッター。AudioWorkletGlobalScopeで動く。
class DrLimiter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.ceil = o.ceil;
    this.L = o.lookahead;
    this.att = 1 - Math.exp(-4 / this.L);
    this.rel = 1 - Math.exp(-1 / o.release);
    const W = this.L + 1;
    this.W = W;
    this.dl = new Float32Array(W);
    this.dr = new Float32Array(W);
    this.w = 0;
    // 窓は「いま出す標本（W 標本前に入った音）」から「いま入った音」までの W+1 個
    this.qv = new Float32Array(W + 2);
    this.qi = new Float64Array(W + 2);
    this.qh = 0;
    this.qt = 0;
    this.qn = 0;
    this.n = 0;
    this.g = 1;
    this.minG = 1;
    this.blocks = 0;
  }
  process(inputs, outputs) {
    const inp = inputs[0];
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const il = inp && inp[0] ? inp[0] : null;
    const ir = inp && inp[1] ? inp[1] : il;
    const ol = out[0];
    const or = out[1] || out[0];
    const size = this.W + 2;
    for (let i = 0; i < ol.length; i++) {
      const x = il ? il[i] : 0;
      const y = ir ? ir[i] : 0;
      const p = Math.max(Math.abs(x), Math.abs(y));
      const req = p > this.ceil ? this.ceil / p : 1;
      // 先読みの窓（今入った音から W 標本前まで）の最小を、単調な両端キューで保つ
      while (this.qn > 0 && this.qv[(this.qt - 1 + size) % size] >= req) { this.qt = (this.qt - 1 + size) % size; this.qn--; }
      this.qv[this.qt] = req; this.qi[this.qt] = this.n; this.qt = (this.qt + 1) % size; this.qn++;
      while (this.qi[this.qh] < this.n - this.W) { this.qh = (this.qh + 1) % size; this.qn--; }
      const target = this.qv[this.qh];
      this.g += (target - this.g) * (target < this.g ? this.att : this.rel);
      const dx = this.dl[this.w];
      const dy = this.dr[this.w];
      this.dl[this.w] = x;
      this.dr[this.w] = y;
      this.w = (this.w + 1) % this.W;
      let a = dx * this.g;
      let b = dy * this.g;
      if (a > this.ceil) a = this.ceil; else if (a < -this.ceil) a = -this.ceil;
      if (b > this.ceil) b = this.ceil; else if (b < -this.ceil) b = -this.ceil;
      ol[i] = a;
      if (or !== ol) or[i] = b;
      if (this.g < this.minG) this.minG = this.g;
      this.n++;
    }
    if (++this.blocks >= 96) {
      this.port.postMessage(this.minG);
      this.minG = 1;
      this.blocks = 0;
    }
    return true;
  }
}
registerProcessor('dr-limiter', DrLimiter);
