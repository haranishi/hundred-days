import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Return {file, line, value} for references that escape a mounted dist. */
export function findRootRelativeRefs(distDir) {
  const entries = readdirSync(distDir, { withFileTypes: true });
  const names = new Set(entries.flatMap(entry => entry.name.endsWith('.html')
    ? [entry.name, entry.name.slice(0, -5)] : [entry.name]));
  const excluded = new Set(entries.filter(entry => {
    if (!entry.isDirectory() || !/^day-\d{3}-/.test(entry.name)) return false;
    const meta = join(distDir, entry.name, 'meta.json');
    return existsSync(meta) && JSON.parse(readFileSync(meta, 'utf8')).mount === false;
  }).map(entry => entry.name));
  const extensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest']);
  const violations = [];
  function walk(dir, parts = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['vendor', 'tools'].includes(entry.name) || (!parts.length && excluded.has(entry.name))) continue;
      const path = join(dir, entry.name);
      const next = [...parts, entry.name];
      if (entry.isDirectory()) walk(path, next);
      else if (entry.isFile() && extensions.has(extname(entry.name))) {
        const source = readFileSync(path, 'utf8');
        // Quoted strings/attributes, unquoted attributes, and CSS url(). Match at
        // the start of a value, not arbitrary slashes inside an external URL.
        const refs = /["'`]\s*(\/[^\s"'`<>]*)|\burl\(\s*(\/[^\s)"']*)|=\s*(\/[^\s>"'`]*)/gi;
        // サイトのルート（href="/"）は、1段下の配信では別のサイト（ライラックのホーム）を指す。JS内の "/" は対象にしない。
        if (extname(entry.name) === '.html') {
          for (const match of source.matchAll(/\b(?:href|src|action)\s*=\s*(["'])\/\1/gi)) {
            violations.push({ file: next.join('/'), line: source.slice(0, match.index).split('\n').length, value: '/' });
          }
        }
        for (const match of source.matchAll(refs)) {
          const value = match[1] ?? match[2] ?? match[3];
          if (value.startsWith('//') || /^\/api\/day-\d{3}\//.test(value)) continue;
          const name = value.slice(1).split(/[/?#)]/)[0];
          if (!names.has(name)) continue;
          violations.push({ file: next.join('/'), line: source.slice(0, match.index).split('\n').length, value });
        }
      }
    }
  }
  walk(distDir);
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const refs = findRootRelativeRefs(resolve(process.argv[2] || 'dist'));
  for (const ref of refs) console.error(`${ref.file}:${ref.line}: ${ref.value}`);
  if (refs.length) process.exitCode = 1;
}
