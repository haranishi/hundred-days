import { defineConfig } from 'vitest/config';

// 単体試験は Node だけで動かす。描画は実ブラウザの検査（tools/shots）で確かめる。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 60000,
    pool: 'forks',
  },
});
