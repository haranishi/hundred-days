import {renderSkiViews} from './ski-preview.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {buildModel} from './model.mjs';
import {encodeModel} from './format.mjs';
import {renderViews} from './preview.mjs';
export async function generate({revision=38,outDir='public/models',previewDir='.agent-harness/runs/ridergen/ski',previews=true}={}){
 const start=performance.now(),model=buildModel({revision}),encoded=encodeModel(model);
 await mkdir(outDir,{recursive:true});await writeFile(resolve(outDir,'rider-v1.bin'),encoded.bin);await writeFile(resolve(outDir,'rider-v1.json'),encoded.json);
 if(previews){await renderViews(model,previewDir,`round-${revision}`);await renderSkiViews(model,`${previewDir}/round-${revision}`);}
 const partTriangles=Object.fromEntries(model.parts.map(part=>[part.name,model.mesh.tri.filter(t=>model.mesh.a[t[0]].part===part.id).length]));
 const stats={partTriangles,vertices:model.mesh.p.length,triangles:model.mesh.tri.length,bytes:encoded.bin.length+Buffer.byteLength(encoded.json),seconds:+((performance.now()-start)/1000).toFixed(3)};
 if(previews)await writeFile(resolve(previewDir,`round-${revision}`,'metrics.json'),JSON.stringify(stats,null,2)+'\n');
 return stats;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const rev=process.argv.indexOf('--revision');console.log(JSON.stringify(await generate({revision:rev<0?38:Number(process.argv[rev+1])}),null,2));
}
