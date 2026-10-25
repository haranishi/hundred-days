import { cp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
const source = fileURLToPath(new URL('..', import.meta.url));
const day = resolve(source, '..');
if (basename(day) !== 'day-076-henkan-desk') throw new Error('Unexpected release destination.');
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run','build'], {
  cwd:source,stdio:'inherit',env:{...process.env,VITE_CLIENT_ONLY:'true',VITE_BASE_PATH:'/day-076-henkan-desk/',VITE_PUBLIC_SITE_URL:'https://hundred-days.pages.dev/day-076-henkan-desk/'}
});
if(result.status !== 0) process.exit(result.status ?? 1);
const generated = ['assets','pdf-assets','licenses','shared','index.html','favicon.svg','ogp.png','legal.html','legal.css'];
const entries = new Set(await readdir(resolve(source,'dist')));
for(const name of generated){
 if(!entries.has(name)) continue;
 const target=resolve(day,name);
 if(['assets','pdf-assets','licenses','shared'].includes(name)) await rm(target,{recursive:true,force:true});
 await cp(resolve(source,'dist',name),target,{recursive:true});
}
console.log('Day076 static release updated. Metadata and README are preserved.');
