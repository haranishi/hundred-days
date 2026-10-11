import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { decodeIndex, WasmEngine, referenceEngine } from '../src/engine.mjs';
import { DEFAULT_FILTERS } from '../src/model.mjs';
const root = new URL('../', import.meta.url);
const indexBytes = await readFile(new URL('public/data/index.json', root));
const records = decodeIndex(JSON.parse(indexBytes)), wasmBytes = await readFile(new URL('public/engine/search.wasm', root));
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const rust = new WasmEngine(instance.exports, records), javascript = referenceEngine(records);
const scenarios = [{...DEFAULT_FILTERS},{...DEFAULT_FILTERS,region:'japan'},{...DEFAULT_FILTERS,query:'ＫＤＤＩ'},{...DEFAULT_FILTERS,registry:'hhs',region:'us',unit:'people'},{...DEFAULT_FILTERS,period:'2014',cause:'intrusion'}];
function measure(engine) {
  for(let i=0;i<25;i++)engine.query(scenarios[i%scenarios.length]);
  const times=[];
  for(let i=0;i<150;i++){const start=performance.now();engine.query(scenarios[i%scenarios.length]);times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);return {iterations:times.length,medianMs:Number(times[Math.floor(times.length*.5)].toFixed(3)),p95Ms:Number(times[Math.floor(times.length*.95)].toFixed(3))};
}
const report={asOf:'2026-10-11',runtime:process.version,platform:process.platform,architecture:process.arch,records:records.length,scenarios:scenarios.map(({query,unit,region,registry,cause,period})=>({query,unit,region,registry,cause,period})),rustWasm:measure(rust),javascriptFallback:measure(javascript),sizes:{wasmBytes:wasmBytes.length,indexBytes:indexBytes.length,indexGzipBytes:gzipSync(indexBytes).length,fullDownloadBytes:(await readFile(new URL('src/data.json',root))).length},limitation:'Local Node measurements of search, sorting and contextual aggregates. Not a guarantee for every browser or device; DOM rendering and Worker round trips are measured separately in the browser.'};
const output=new URL('../../../docs/day064/verification/performance-node.json',import.meta.url);await mkdir(new URL('./',output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
