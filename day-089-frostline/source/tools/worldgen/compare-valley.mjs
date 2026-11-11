import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {decodePNG,sideBySide} from './lib/png.js';
const dir=process.argv[2];if(!dir)throw new Error('usage: node tools/worldgen/compare-valley.mjs <round-directory>');
for(const [id,ref,file]of [['map','02-topdown','map'],['summit','03-from-summit','valley-03-from-summit'],['west','04-from-west','valley-04-from-west'],['east','05-from-east','valley-05-from-east'],['south','06-from-south','valley-06-from-south']]){
 const a=decodePNG(readFileSync(`refs/valley/${ref}.png`)),b=decodePNG(readFileSync(`${dir}/${file==='map'?(existsSync(dir+'/map.png')?'map':'data/map'):file}.png`));writeFileSync(`${dir}/compare-${id}.png`,sideBySide(a,b));
}
