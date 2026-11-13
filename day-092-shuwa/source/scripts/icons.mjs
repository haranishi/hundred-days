/** 既存のSVGからPWA用PNGを作る。rsvg-convert（librsvg）が必要。 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../public/favicon.svg', import.meta.url);
const output = new URL('../public/icons/', import.meta.url);
mkdirSync(output, { recursive: true });
for (const size of [192, 512]) {
  execFileSync('rsvg-convert', ['--width', String(size), '--height', String(size), '--output',
    fileURLToPath(new URL(`icon-${size}.png`, output)), fileURLToPath(source)]);
}
// マスカブル版は不透明の背景を敷き、顔を中央の安全範囲に収める。
const svg = readFileSync(source, 'utf8').replace('<svg ', '<svg x="64" y="64" width="384" height="384" ');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#4C5FD5"/>${svg}</svg>`;
execFileSync('rsvg-convert', ['--width', '512', '--height', '512', '--output',
  fileURLToPath(new URL('maskable-512.png', output))], { input: maskable });
console.log('PWAアイコンを3点生成しました');
