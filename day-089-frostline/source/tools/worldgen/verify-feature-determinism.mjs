import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {generateWorld,sha256} from './generate.mjs';
import {writeMap} from './lib/map.js';
import {createWorld} from '../../src/world/index.js';
const dir='.agent-harness/runs/worldgen/features/determinism';mkdirSync(dir,{recursive:true});
const start=performance.now(),result=generateWorld(),comparison=[];
for(const [name,bytes]of Object.entries(result.files)){const hash=sha256(bytes),delivered=sha256(readFileSync('public/world/'+name));comparison.push({name,hash,delivered,match:hash===delivered});}
const metadata=sha256(Buffer.from(JSON.stringify(result.meta,null,2)+'\n')),original=sha256(readFileSync('public/world/world.json'));comparison.push({name:'world.json',hash:metadata,delivered:original,match:metadata===original});
writeMap(createWorld(result.meta,result.buffers),dir+'/map.png');const map=sha256(readFileSync(dir+'/map.png')),mapOriginal=sha256(readFileSync('public/world/map.png'));comparison.push({name:'map.png',hash:map,delivered:mapOriginal,match:map===mapOriginal});
const report={seed:result.meta.seed,seconds:(performance.now()-start)/1000,comparison,pass:comparison.every(r=>r.match)};writeFileSync(dir+'/result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
