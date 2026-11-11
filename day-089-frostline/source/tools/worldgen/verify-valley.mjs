import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setPistes,RESERVED} from './lib/valley-layout.js';
import {createWorld} from '../../src/world/index.js';
import {FILES} from '../../src/world/format.js';
import {sha256} from './generate.mjs';
import {auditValley,valleyMarkdown} from './lib/valley-audit.js';
export function readDelivered(out='public/world'){
 const meta=JSON.parse(readFileSync(`${out}/world.json`)),buffers={};
 for(const [key,file]of Object.entries(FILES)){if(key==='lake'&&!meta.lake)continue;const raw=readFileSync(`${out}/${file}`);if(sha256(raw)!==meta.hashes[file])throw new Error(file+': SHA mismatch');buffers[key]=key==='height'||key==='tileA'?Float32Array.from({length:raw.length/4},(_,i)=>raw.readFloatLE(i*4)):new Uint8Array(raw);}
 setPistes(meta.pistes??[]);if(meta.reserved?.[0])Object.assign(RESERVED,meta.reserved[0]);return createWorld(meta,buffers);
}
export function verifyDelivered(out='public/world',dir='.agent-harness/runs/worldgen/features'){
 const world=readDelivered(out);if(world.meta.grid!==2048||world.meta.cell!==2)throw new Error('本番2048/2mのみで受入判定する');
 const v=auditValley(world);v.simulationHashes=Object.fromEntries(readdirSync('src/sim').filter(p=>p.endsWith('.js')).sort().map(p=>[p,sha256(readFileSync('src/sim/'+p))]));mkdirSync(dir,{recursive:true});
 writeFileSync(`${dir}/verify-valley.json`,JSON.stringify(v,null,2)+'\n');writeFileSync(`${dir}/verify-valley.md`,valleyMarkdown(v));writeFileSync(`${dir}/stats.json`,JSON.stringify(v,null,2)+'\n');return v;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const v=verifyDelivered(process.argv[2],process.argv[3]);console.log(JSON.stringify(v.checks));if(!v.pass)process.exitCode=1;}
