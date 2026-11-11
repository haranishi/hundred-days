// 視点（world.json の views）だけを作り直す。山のデータを作り直さずに、構図を合わせ直すための道具。
// node tools/worldgen/update-views.mjs [public/world/]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorld } from '../../src/world/index.js';
import { FILES } from '../../src/world/format.js';
import { makeViews } from './lib/valley-objects.js';
const dir = process.argv[2] ?? 'public/world/';
const meta = JSON.parse(readFileSync(resolve(dir, 'world.json'), 'utf8'));
const buffers = {};
for (const [key, file] of Object.entries(FILES)) { const b = readFileSync(resolve(dir, file)); buffers[key] = file.endsWith('.f32') ? new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength); }
meta.views = makeViews(createWorld(meta, buffers));
writeFileSync(resolve(dir, 'world.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(meta.views.map(v => `${v.id} ${v.pos.map(Math.round).join(',')}`).join(' / '));
