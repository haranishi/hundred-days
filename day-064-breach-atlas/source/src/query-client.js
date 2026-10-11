import { referenceEngine } from './engine.mjs';
export class QueryClient {
  constructor(records) { this.records = records; this.pending = new Map(); this.sequence = 0; }
  async start() {
    try {
      this.worker = new Worker(new URL('./search.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id); clearTimeout(pending.timer);
        if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data);
      };
      this.worker.onerror = () => this.failWorker();
      const response = await this.send({ type: 'init', records: this.records }); this.mode = response.mode;
    } catch { this.useFallback(); }
    return this.mode;
  }
  useFallback() { this.worker?.terminate(); this.worker = null; this.fallback = referenceEngine(this.records); this.mode = 'js-main'; }
  failWorker() { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Worker unavailable')); } this.pending.clear(); }
  send(message) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Search timeout')); }, 6000);
      this.pending.set(id, { resolve, reject, timer }); this.worker.postMessage({ id, ...message });
    });
  }
  async query(filters, order) {
    if (this.worker) {
      try { return await this.send({ type: 'query', filters, order }); }
      catch { this.useFallback(); }
    }
    const start = performance.now(); return { result: this.fallback.query(filters, order), elapsed: performance.now() - start, mode: this.mode };
  }
}
