/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { applySiteTokens } from './src/config/site.ts'

/** index.html の title・canonical・OGP を src/config/site.ts から差し込む */
function siteMeta(): Plugin {
  return {
    name: 'kumimae-site-meta',
    transformIndexHtml: { order: 'pre', handler: (html) => applySiteTokens(html) },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), siteMeta()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
