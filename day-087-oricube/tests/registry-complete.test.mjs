import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

// The directory run only executes what tests/index.mjs imports. A test file that is not imported there is
// silently skipped (three model test files were missed this way). Every *.test.mjs must be imported.
const dir=dirname(fileURLToPath(import.meta.url));
test('every test file in tests/ is imported by tests/index.mjs',()=>{
  const index=readFileSync(join(dir,'index.mjs'),'utf8');
  const imported=new Set([...index.matchAll(/import\s+['"]\.\/([^'"]+\.test\.mjs)['"]/g)].map(m=>m[1]));
  const missing=readdirSync(dir).filter(f=>f.endsWith('.test.mjs')&&!imported.has(f));
  assert.deepEqual(missing,[],`not imported by index.mjs: ${missing.join(', ')}`);
});
