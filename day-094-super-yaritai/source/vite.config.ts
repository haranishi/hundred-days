import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// 画面は dist/client に出し、Cloudflare Worker の静的配信（wrangler.jsonc の assets）から返す。
export default defineConfig({
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
})
