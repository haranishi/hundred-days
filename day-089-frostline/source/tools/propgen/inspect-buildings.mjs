// Five review rounds use fixed non-building revision 4. No browser or image dependencies.
import {generate} from './generate.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {decodePNG,resize} from './png.mjs';
import {sheet,save} from './preview.mjs';
const round=Number(process.argv[2]??5),dir='.agent-harness/runs/propgen';
const result=await generate({buildingRound:round});
await writeFile(`${dir}/i16c-round-${round}-stats.json`,JSON.stringify(result,null,2)+'\n');
const pairs=[['refs/valley/09-bridge-lodge.png',`${dir}/round-i16c-${round}-lodge-near-front.png`],['refs/valley/06-from-south.png',`${dir}/round-i16c-${round}-village.png`],['refs/valley/08-forest-trail.png',`${dir}/round-i16c-${round}-chalet-c-near-front.png`]];
const images=[];for(const pair of pairs)for(const path of pair)images.push(resize(decodePNG(await readFile(path)),700,430));
await save(sheet(images,2),`${dir}/i16c-round-${round}-comparison.png`);
console.log(JSON.stringify(result,null,2));
