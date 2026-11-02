// OWNER: build
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// ポートは 5401〜5409 だけを使う（5199・5301〜5309 は他のプロジェクトが使用中）。
// 並行で dev サーバーを立てるときは VITE_CACHE_DIR を担当ごとに分ける（依存の事前変換が同じフォルダで衝突するため）。
// KAGE_PAGES で、ビルドするページを絞れる（例：KAGE_PAGES=index）。並行作業中に他の担当の作りかけで落ちないようにするため。
const ALL = { index: 'index.html', art: 'art.html', chars: 'chars.html' } as const;
type Page = keyof typeof ALL;
const pages = (process.env.KAGE_PAGES ?? 'index,art,chars')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is Page => s in ALL);

export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
  server: { port: 5401, strictPort: true },
  preview: { port: 5402, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, fileURLToPath(new URL(ALL[p], import.meta.url))])),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
