import {readFile,writeFile} from 'node:fs/promises';
import {encodePNG,decodePNG} from '../worldgen/lib/png.js';
export const SKI_VIEWS=[
 {name:'back18',azimuth:0,elevation:18,distance:7},
 {name:'side',azimuth:90,elevation:0,distance:7},
 {name:'front200',azimuth:200,elevation:18,distance:7},
 {name:'back35',azimuth:35,elevation:26,distance:7},
];
export async function sheet(dir,names,file,columns=4,size=320){
 const height=Math.ceil(names.length/columns)*size,width=columns*size,rgba=new Uint8Array(width*height*4).fill(255);
 for(let n=0;n<names.length;n++){
  const im=decodePNG(await readFile(`${dir}/${names[n]}.png`));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const src=(Math.floor(y*im.height/size)*im.width+Math.floor(x*im.width/size))*4;
   rgba.set(im.data.subarray(src,src+4),((Math.floor(n/columns)*size+y)*width+(n%columns)*size+x)*4);
  }
 }
 await writeFile(`${dir}/${file}.png`,encodePNG(width,height,rgba));
 await writeFile(`${dir}/${file}.json`,JSON.stringify({columns,tileSize:size,names,cameras:SKI_VIEWS},null,2));
}
