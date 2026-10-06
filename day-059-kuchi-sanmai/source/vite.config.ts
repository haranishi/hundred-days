import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// 100日チャレンジ版（Day59）：画面を dist に出し、tools/release.mjs が1つ上（day-059-kuchi-sanmai/）へ写す。
// 公開URLは /day-059-kuchi-sanmai/ なので、素材・見本・ライセンス表示は相対パス（base: './'）で読む。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
