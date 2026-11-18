import { defineConfig } from 'vitest/config'

// シミュレーション（src/game）は DOM を使わないので、Node のまま Rapier を回して試せる。
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
})
