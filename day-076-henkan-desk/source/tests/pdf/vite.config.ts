import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '127.0.0.1', hmr: false }, worker: { format: 'es' }, assetsInclude: ['**/*.wasm'], optimizeDeps: { entries: ['tests/pdf/harness.html'], include: ['pdf-lib', 'fflate', 'pdfjs-dist'], noDiscovery: true } });
