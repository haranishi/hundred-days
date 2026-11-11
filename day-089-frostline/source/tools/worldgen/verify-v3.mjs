import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorld} from '../../src/world/index.js';
import {FILES} from '../../src/world/format.js';
import {worldStats,statsMarkdown} from './lib/stats.js';
import {checkDrop} from './lib/drops.js';
import {sha256} from './generate.mjs';
import {verifyFeatures,verificationMarkdown} from './lib/verify-features.js';
export function verifyDelivered(out='public/world',preview='.agent-harness/runs/worldgen'){
  const meta=JSON.parse(readFileSync(`${out}/world.json`)),buffers={};
  if(meta.grid!==2048||meta.cell!==3)throw new Error('本番の2048/3m格子が必要です');
  for(const [key,file]of Object.entries(FILES)){
    const raw=readFileSync(`${out}/${file}`);if(sha256(raw)!==meta.hashes[file])throw new Error(`${file}: SHA不一致`);
    buffers[key]=key==='height'||key==='tileA'?Float32Array.from({length:raw.length/4},(_,i)=>raw.readFloatLE(i*4)):new Uint8Array(raw);
  }
  const world=createWorld(meta,buffers),v=verifyFeatures(world),prior=JSON.parse(readFileSync(`${preview}/stats.json`));
  const stats={...prior,...worldStats(world,checkDrop),featureVerification:v};
  Object.assign(stats.checks,v.checks);v.checks={...stats.checks};stats.pass=Object.values(stats.checks).every(Boolean);
  writeFileSync(`${preview}/verify-v3.json`,JSON.stringify(v,null,2)+'\n');writeFileSync(`${preview}/verify-v3.md`,verificationMarkdown(v));
  writeFileSync(`${preview}/stats.json`,JSON.stringify(stats,null,2)+'\n');writeFileSync(`${preview}/stats.md`,statsMarkdown(stats));
  return v;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const v=verifyDelivered();console.log(JSON.stringify(v.checks,null,2));if(!Object.values(v.checks).every(Boolean))process.exitCode=1;
}
