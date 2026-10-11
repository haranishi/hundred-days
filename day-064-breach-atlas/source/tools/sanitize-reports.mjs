// Run after Playwright's JSON reporter and before committing public evidence.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const repository = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const reports = new URL('../../../docs/day064/verification/', import.meta.url);
let changed = 0;
async function sanitize(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) { await sanitize(path); continue; }
    if (!/\.(json|md)$/.test(entry.name)) continue;
    const original = await readFile(path, 'utf8');
    const publicText = original.replaceAll(repository, '.').replaceAll(homedir(), '<home>');
    if (publicText !== original) {
      if (entry.name.endsWith('.json')) JSON.parse(publicText);
      await writeFile(path, publicText); changed++;
    }
  }
}
await sanitize(reports);
console.log(`Sanitized local paths in ${changed} public evidence files.`);
