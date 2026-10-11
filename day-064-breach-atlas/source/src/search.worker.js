import { WasmEngine, referenceEngine } from './engine.mjs';
let engine, mode;
self.onmessage = async event => {
  const { type, id, records, filters, order } = event.data;
  try {
    if (type === 'init') {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}engine/search.wasm`);
        if (!response.ok) throw new Error('Wasm not available');
        const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {});
        engine = new WasmEngine(instance.exports, records); mode = 'rust-wasm-worker';
      } catch { engine = referenceEngine(records); mode = 'js-worker'; }
      self.postMessage({ id, type: 'ready', mode }); return;
    }
    const started = performance.now(), result = engine.query(filters, order);
    self.postMessage({ id, result, elapsed: performance.now() - started, mode });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
