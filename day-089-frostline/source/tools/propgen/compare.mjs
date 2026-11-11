// Optional audit only; refs are never required by the generator or copied to game assets.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodePNG,resize} from './png.mjs';
import {sheet,save} from './preview.mjs';
export async function compare(revision=4,dir='.agent-harness/runs/propgen'){
 const pairs=[['09-bridge-lodge','lodge-near-front'],['09-bridge-lodge','bridge-near-front'],['08-forest-trail','fir-c-near-front'],['05-from-east','lift-tower-near-front'],['06-from-south','village']];
 const images=[];for(const [ref,prop]of pairs){for(const path of [`refs/valley/${ref}.png`,`${dir}/round-${revision}-${prop}.png`])images.push(resize(decodePNG(await readFile(path)),700,430));}
 const path=`${dir}/round-${revision}-reference-comparison.png`;await save(sheet(images,2),path);return path;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await compare(Number(process.argv[2]??4)));
