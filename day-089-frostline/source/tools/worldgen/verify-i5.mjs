import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FILES} from '../../src/world/format.js';
const root='.agent-harness/runs/worldgen',pictures=['relief-drops','perspective-sw','perspective-se','perspective-ne','perspective-nw','slope','snow','trees'];
function snapshot(preview){
  const paths=[...Object.values(FILES).map(n=>`public/world/${n}`),'public/world/world.json',...pictures.map(n=>`${preview}/${n}.png`),`${preview}/stats.json`,`${preview}/stats.md`];
  return Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
}
const summary={};
for(const [mode,script,limit]of [['quick','worldgen:quick',10],['production','worldgen',300]]){
  const preview=mode==='quick'?`${root}/quick`:root,runs=[];
  for(let run=1;run<=2;run++){
    const stdout=execFileSync('npm',['run',script],{encoding:'utf8',timeout:limit*1000+5000,maxBuffer:1024*1024,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=1536'}});
    const report=JSON.parse(stdout.slice(stdout.indexOf('{'))),hashes=snapshot(preview);
    runs.push({...report,hashes});writeFileSync(`${root}/${mode}-run-${run}.json`,JSON.stringify(report,null,2)+'\n');
    writeFileSync(`${root}/${mode}-sha-${run}.json`,JSON.stringify(hashes,null,2)+'\n');
    console.log(`${mode} ${run}: ${report.seconds.toFixed(3)}s, numeric=${Object.values(report.statistics).every(Boolean)}`);
    if(report.seconds>=limit)throw new Error(`${mode}: time limit exceeded`);
  }
  const identical=JSON.stringify(runs[0].hashes)===JSON.stringify(runs[1].hashes);
  if(!identical)throw new Error(`${mode}: SHA mismatch`);
  const dimensions=pictures.map(name=>{const bytes=readFileSync(`${preview}/${name}.png`);return {name,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};});
  if(dimensions.some(d=>d.width!==1024||d.height!==1024))throw new Error('preview resolution mismatch');
  summary[mode]={seconds:runs.map(r=>r.seconds),identical,checkedFiles:Object.keys(runs[0].hashes).length,dimensions};
}
writeFileSync(`${root}/verification.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
