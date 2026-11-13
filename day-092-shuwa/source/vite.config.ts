import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { cpSync, mkdirSync, createReadStream, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * MediaPipe の wasm を、開発時もビルド時も文書相対の mediapipe/wasm で配る。
 * 配るのは SIMD 版（vision_wasm_internal）だけ。FilesetResolver.forVisionTasks(path) は、SIMD に対応したブラウザ
 * （Chrome 91・Safari 16.4・Firefox 89 以降）ではこれを使う。モジュール版（14MB）は使っておらず、非SIMD版（12MB）は
 * 古いブラウザ向けで、無くても読み込みに失敗するだけ（画面は「手本を見て自分でやってみる」に切り替わる）。
 * 100日のリポジトリに置くので、使わない 26MB を配らない。
 */
const WASM_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
function mediapipeWasm(): Plugin {
  let wasmDir = '', outDir = '', building = false;
  return {
    name: 'tekotoba-mediapipe-wasm',
    configResolved(config) {
      building = config.command === 'build';
      wasmDir = resolve(config.root, 'node_modules/@mediapipe/tasks-vision/wasm');
      outDir = resolve(config.root, config.build.outDir, 'mediapipe/wasm');
    },
    configureServer(server) {
      const files = new Set(readdirSync(wasmDir).filter((name) => WASM_FILES.includes(name)));
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        const name = /\/mediapipe\/wasm\/([^/]+)$/.exec(path)?.[1];
        if (!name || !files.has(name)) { next(); return; }
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8');
        createReadStream(resolve(wasmDir, name)).on('error', next).pipe(res);
      });
    },
    closeBundle() {
      if (!building) return;
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      for (const name of WASM_FILES) cpSync(resolve(wasmDir, name), resolve(outDir, name));
    },
  };
}

// 住所はすべて文書相対（100日チャレンジの /100days/day-092-…/ の下に置くため）
export default defineConfig({
  base: './',
  plugins: [preact(), mediapipeWasm(), {
    // 元HTMLは保持し、PWAプラグインが生成するmanifestリンクに一本化する。
    name: 'tekotoba-manifest-link',
    transformIndexHtml: { order: 'pre', handler: html => html.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi, '') },
  }, VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    includeManifestIcons: false,
    scope: './',
    manifest: {
      name: 'てことば', short_name: 'てことば', lang: 'ja',
      description: '指文字・数字・あいさつを、少しずつ学ぶ手話入門',
      start_url: './', scope: './', display: 'standalone',
      theme_color: '#FFF9F0', background_color: '#FFF9F0',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,json,webmanifest,woff2,svg,png,txt}'],
      globIgnores: ['**/mediapipe/**'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      runtimeCaching: [{
        urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/mediapipe\//.test(url.pathname),
        handler: 'CacheFirst',
        options: {
          cacheName: 'tekotoba-mediapipe-v1',
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      }],
    },
  })],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/content/**/*.test.ts'],
    environment: 'node',
  },
});
