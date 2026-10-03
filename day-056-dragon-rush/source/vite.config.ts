// OWNER: build
import { defineConfig } from 'vitest/config';

// ポートは 5301〜5309 の範囲だけを使う（4173・5173・5199 は他のプロジェクトが使用中）。
export default defineConfig({
  base: './',
  publicDir: 'public',
  server: { port: 5301, strictPort: true },
  preview: { port: 5302, strictPort: true },
  build: {
    outDir: '../game',
    emptyOutDir: false,
    copyPublicDir: false,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // 小さいworkletでもdata:へ埋め込まず、CSPのscript-src selfで読み込む。
    assetsInlineLimit: (filePath) => filePath.endsWith('.worklet.js') ? false : undefined,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 街を作るテスト（world/city・fx/collapse・world/streetLife）は静かな機械で1〜3秒だが、別の重い処理と重なると
    // 9〜65秒かかり、既定の5秒で時間切れになる（r05 の関門で負荷の平均 11〜60）。中身の誤りと見分けるため長めに取る
    testTimeout: 90_000,
  },
});
