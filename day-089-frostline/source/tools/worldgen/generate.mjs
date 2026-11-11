import {placeRockGarden} from './lib/rock-garden.js';
import {createObstacleStore} from '../../src/world/obstacles.js';
import {surveyRunouts} from './lib/runout-repairs.js';
import {choosePark,groomPark,calibratePark,parkBands} from './lib/park-features.js';
import {auditValley,valleyMarkdown} from './lib/valley-audit.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {constantsFor,WORLD_FORMAT_VERSION,FILES} from '../../src/world/format.js';
import {buildAlpine} from './lib/alpine.js';
import {makePistes,chooseReserve} from './lib/valley-snow.js';
import {makeTile} from './lib/noise.js';
import {bakeSun,eveningSun} from './lib/sunbake.js';
import {ZONES,setPistes} from './lib/valley-layout.js';
import {makeStructures,makeValleyDrops,findSafeValleyDrops,makeValleyStations,makeViews} from './lib/valley-objects.js';
import {finishValleyTerrain,makeValleySnow,makeLake} from './lib/valley-snow.js';
import {encodePNG} from './lib/png.js';
import {shapePreview} from './lib/previews.js';
import {writeMap} from './lib/map.js';
import {writeValleyPreviews} from './lib/valley-previews.js';
import {placeFeatures,alignFeatureEntrances,recalibratePlacedFeatures} from './lib/place-features.js';
import {createWorld} from '../../src/world/index.js';
export const GENERATOR_PARAMS=Object.freeze({defaultSeed:'ginrei-1',defaultOut:'public/world/',defaultPreview:'.agent-harness/runs/worldgen/i15c/final/'});
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function encodeBuffers(buffers){
 const files={};for(const [key,file] of Object.entries(FILES)){const a=buffers[key];if(!a)continue;
 if(a instanceof Float32Array){const bytes=Buffer.alloc(a.length*4);for(let i=0;i<a.length;i++)bytes.writeFloatLE(a[i],i*4);files[file]=bytes;}
 else files[file]=Buffer.from(a.buffer,a.byteOffset,a.byteLength);
 }return files;
}
export function generateWorld({seed=GENERATOR_PARAMS.defaultSeed,quick=false,onStage=null,landscape={}}={}){
 const c={...constantsFor(quick),layout:'valley-1'};
 // 山の形：設計の面を流れの浸食で刻み、雪と氷を積む（lib/alpine.js）。I15c の「平らな面から隆起と浸食で育てる」方式は、ぼやけた塊になったので使わない
 const grown=buildAlpine(c,seed,{quick,onStage}),height=grown.height,deposited={depth:grown.depth};onStage?.('erosion');
 const pistes=makePistes(height,c),reserved=chooseReserve(height,c),structures=makeStructures();finishValleyTerrain(height,c,structures);onStage?.('terrain');
 const park=quick?null:choosePark(height,c,structures);
 const lake=makeLake(seed),snow=makeValleySnow(height,c,seed,structures,deposited.depth,{glacier:grown.glacier,ice:grown.ice,park}),sun=eveningSun();
 const parkFeatures=park?groomPark(height,c,park):[];
 const buffers={...snow,tileA:makeTile(seed),sunVis:new Uint8Array(c.grid*c.grid).fill(255),lake:lake.bytes};
 onStage?.('materials-light');
 let min=Infinity,max=-Infinity;for(const h of height){min=Math.min(min,h);max=Math.max(max,h);}
 const meta={version:WORLD_FORMAT_VERSION,seed,...c,heightRange:[min,max],snowGullies:snow.snowGullies,sun,lake:lake.meta,structures,views:[],drops:[],stations:[],features:[],reserved:park?parkBands(park):[reserved],pistes,generation:{method:'design-carve',coarseGrid:quick?128:512,iterations:quick?40:150,refineIterations:quick?0:40},map:{file:'map.png',size:1024},zones:ZONES.map(z=>({...z})),hashes:{}};
 // Schema needs hashes during assembly; final hashes follow feature baking.
 for(const file of Object.values(FILES))meta.hashes[file]='0'.repeat(64);
 const world=createWorld(meta,buffers);
 if(park)meta.park=park;
 const measurements=quick?[]:placeFeatures(world);if(park){meta.features.push(...parkFeatures);meta.park=park;measurements.push(...calibratePark(world));}onStage?.('features');
 if(!quick){for(let pass=0;pass<2;pass++)surveyRunouts(world,{repair:true});meta.runoutVerification=surveyRunouts(world);measurements.splice(0,measurements.length,...recalibratePlacedFeatures(world));onStage?.('runouts');}

 for(const t of structures.lift.towers)t.y=world.heightAt(t.x,t.z);
 meta.stations=makeValleyStations(world);meta.drops=makeValleyDrops(world);world.drops=meta.drops;let entrances=[];if(!quick){entrances=findSafeValleyDrops(world);meta.featureVerification={measurements,entrances,aligned:alignFeatureEntrances(world,measurements)};}
 if(!quick){placeRockGarden(world);world.obstaclesNear=createObstacleStore(world);}
 buffers.sunVis=bakeSun(height,c,sun);
 const files=encodeBuffers(buffers);for(const [file,bytes]of Object.entries(files))meta.hashes[file]=sha256(bytes);meta.views=makeViews(world);onStage?.('entrances');
 const stats=quick?{layout:'valley-1',checks:{},pass:false,acceptance:'quick is not production acceptance'}:auditValley(createWorld(meta,buffers));
 onStage?.('audit');return {meta,buffers,files,stats};
}
export function writeWorld(result,{out=GENERATOR_PARAMS.defaultOut,preview=GENERATOR_PARAMS.defaultPreview}={}){
 mkdirSync(out,{recursive:true});mkdirSync(preview,{recursive:true});
 for(const [file,bytes]of Object.entries(result.files))writeFileSync(resolve(out,file),bytes);
 writeFileSync(resolve(out,'world.json'),JSON.stringify(result.meta,null,2)+'\n');
 setPistes(result.meta.pistes??[]);const world=createWorld(result.meta,result.buffers);writeMap(world,resolve(out,'map.png'));writeValleyPreviews(world,preview);
 writeMap(world,resolve(preview,'map.png'));shapePreview(result.meta,result.buffers.height,resolve(preview,'hillshade.png'));
 if(result.inputs){const n=Math.sqrt(result.inputs.uplift.length);for(const key of ['uplift','hard','creep','base']){const a=result.inputs[key],pixels=new Uint8Array(n*n*4);let min=Infinity,max=-Infinity;for(const v of a){min=Math.min(min,v);max=Math.max(max,v);}for(let k=0;k<a.length;k++){const v=255*(a[k]-min)/(max-min||1);pixels.set([v,v,v,255],k*4);}writeFileSync(resolve(preview,'input-'+key+'.png'),encodePNG(n,n,pixels));}}
 writeFileSync(resolve(preview,'stats.json'),JSON.stringify(result.stats,null,2)+'\n');
 if(result.stats.points){writeFileSync(resolve(preview,'verify-valley.json'),JSON.stringify(result.stats,null,2)+'\n');writeFileSync(resolve(preview,'verify-valley.md'),valleyMarkdown(result.stats));}
}
function main(args){
 const opts={};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--quick')opts.quick=true;else if(a==='--timings')opts.timings=true;else if(['--seed','--out','--preview'].includes(a)&&args[i+1])opts[a.slice(2)]=args[++i];else throw new Error(`不明な引数: ${a}`);}
 if(opts.quick&&!opts.preview)opts.preview=resolve(GENERATOR_PARAMS.defaultPreview,'quick');
 const start=performance.now();if(opts.timings)opts.onStage=stage=>console.error(JSON.stringify({stage,seconds:(performance.now()-start)/1000}));const result=generateWorld(opts);writeWorld(result,opts);result.stats.executionSeconds=(performance.now()-start)/1000;result.stats.checks.generationTime=result.stats.executionSeconds<=240;result.stats.pass=!opts.quick&&Object.values(result.stats.checks).every(Boolean);writeFileSync(resolve(opts.preview??GENERATOR_PARAMS.defaultPreview,'stats.json'),JSON.stringify(result.stats,null,2)+'\n');console.log(JSON.stringify({seconds:(performance.now()-start)/1000,grid:result.meta.grid,hashes:result.meta.hashes,acceptance:result.stats.checks,pass:result.stats.pass}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main(process.argv.slice(2));}catch(e){console.error(e.stack);process.exitCode=1;}
