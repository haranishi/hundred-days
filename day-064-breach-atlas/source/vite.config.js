import { defineConfig } from 'vite';

export default defineConfig({
  base: '/day-064-breach-atlas/',
  build: { target: 'es2022', sourcemap: false },
  server: { host: '127.0.0.1', port: 5464, strictPort: true },
  preview: { host: '127.0.0.1', port: 5464, strictPort: true },
});
