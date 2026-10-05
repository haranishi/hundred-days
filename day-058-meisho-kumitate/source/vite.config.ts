import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// 100日チャレンジ版（Day58）：画面を dist に出し、tools/release.mjs が1つ上（day-058-meisho-kumitate/）へ写す。
// 公開URLは /day-058-meisho-kumitate/ なので、素材は相対パス（base: './'）で読む。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
})
