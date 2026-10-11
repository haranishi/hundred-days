import { cp, mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';

const source = new URL('../', import.meta.url);
const app = new URL('../../', import.meta.url);
const output = new URL('dist/', source);
if (JSON.parse(await readFile(new URL('meta.json', app), 'utf8')).day !== 64) throw new Error('Release target must be Day64.');
const currentAssets = new Set(await readdir(new URL('assets/', output)));
for (const name of await readdir(new URL('assets/', app)).catch(() => [])) {
  if (/^[A-Za-z0-9_.]+-[A-Za-z0-9_-]+\.(js|css)$/.test(name) && !currentAssets.has(name)) await unlink(new URL(`assets/${name}`, app));
}
const allowed = new Set(['index.html', 'assets', 'data', 'licenses', 'engine', 'shared', 'favicon.svg', 'og.png', 'og-card.svg']);
for (const entry of await readdir(output, { withFileTypes: true })) {
  if (!allowed.has(entry.name)) throw new Error(`Unexpected build output: ${entry.name}`);
  await cp(new URL(entry.name, output), new URL(entry.name, app), { recursive: true });
}
await mkdir(new URL('licenses/', app), { recursive: true });
// Remove the superseded generated export, which exceeds the hosting limit.
await unlink(new URL('data/incidents.json', app)).catch(error => { if (error.code !== 'ENOENT') throw error; });
const license = await readFile(new URL('node_modules/three/LICENSE', source), 'utf8');
await writeFile(new URL('licenses/three-LICENSE.txt', app), license);
console.log('Day64 browser files and Three.js license copied. No publication performed.');
