// Read-only comparison with the supplied game captures; never starts a browser.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {decodePNG,sideBySide} from '../worldgen/lib/png.js';
const dir='.agent-harness/runs/ridergen';
export async function compare(revision){
 await mkdir(dir+'/I13f',{recursive:true});
 const pairs=['2-toe-2','4-tuck-1','4-tuck-2','3-heel-1','3-heel-2','5-brake-1','6-air-grab-1','6-air-grab-2','7-air-spin-1','1-stand-3'].map(id=>[id,'capture-'+id]);
 for(const [source,result]of pairs){
  const left=decodePNG(await readFile(`.agent-harness/runs/visual/rider/3/${source}.png`));
  const right=decodePNG(await readFile(`${dir}/round-${revision}-${result}.png`));
  await writeFile(`${dir}/I13f/round-${revision}-vs-${source}.png`,sideBySide(left,right,750,570));
 }
}
if(process.argv[2])await compare(Number(process.argv[2]));
