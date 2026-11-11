import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FILES} from '../../src/world/format.js';
const root='.agent-harness/runs/worldgen',pictures=['relief-drops','perspective-sw','perspective-se','perspective-ne','perspective-nw','slope','snow','trees','rollers-detail','ledge-detail','practice-detail'];
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function snapshot(out,preview){
  const paths=[...Object.values(FILES).map(n=>`${out}/${n}`),`${out}/world.json`,...pictures.map(n=>`${preview}/${n}.png`),`${preview}/stats.json`,`${preview}/stats.md`];
  return Object.fromEntries(paths.map(path=>[path,digest(path)]));
}
const summary={};
for(const [mode,limit]of [['quick',10],['production',300]]){
  const preview=mode==='quick'?`${root}/quick`:root,out=mode==='quick'?`${preview}/data`:'public/world',runs=[];
  for(let run=1;run<=2;run++){
    const args=['tools/worldgen/generate.mjs','--out',out,'--preview',preview];if(mode==='quick')args.push('--quick');
    const stdout=execFileSync(process.execPath,args,{encoding:'utf8',timeout:limit*1000+5000,maxBuffer:1024*1024,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=1536'}});
    const report=JSON.parse(stdout),hashes=snapshot(out,preview),stats=JSON.parse(readFileSync(`${preview}/stats.json`));
    runs.push({...report,hashes});writeFileSync(`${root}/${mode}-run-${run}.json`,JSON.stringify(report,null,2)+'\n');
    writeFileSync(`${root}/${mode}-sha-${run}.json`,JSON.stringify(hashes,null,2)+'\n');
    console.log(`${mode} ${run}: ${report.seconds.toFixed(3)}s, base=${stats.pass}, I9=${stats.rideRelief.pass}`);
    if(report.seconds>=limit)throw new Error(`${mode}: time limit exceeded`);
  }
  const identical=JSON.stringify(runs[0].hashes)===JSON.stringify(runs[1].hashes);
  if(!identical)throw new Error(`${mode}: SHA mismatch`);
  const dimensions=pictures.map(name=>{const bytes=readFileSync(`${preview}/${name}.png`);return {name,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};});
  if(dimensions.some(d=>d.width!==1024||d.height!==1024))throw new Error('preview resolution mismatch');
  const stats=JSON.parse(readFileSync(`${preview}/stats.json`));
  summary[mode]={seconds:runs.map(r=>r.seconds),identical,checkedFiles:Object.keys(runs[0].hashes).length,basePass:stats.pass,rideChecks:stats.rideRelief.checks,dimensions};
}
writeFileSync(`${root}/verification.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
