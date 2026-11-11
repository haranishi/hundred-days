import {writeFileSync} from 'node:fs';
import {encodePNG} from './png.js';
import {clamp,spline} from '../../../src/world/surface-math.js';
export const PREVIEW_PARAMS=Object.freeze({pixels:1024,azimuth:315,elevation:35});
const rad=Math.PI/180,LIGHT={x:Math.sin(315*rad)*Math.cos(35*rad),y:Math.sin(35*rad),z:-Math.cos(315*rad)*Math.cos(35*rad)};
const COLORS=[[210,232,243],[131,201,202],[61,149,167],[231,165,75],[153,65,61]];
const binFor=angle=>angle<10?0:angle<20?1:angle<35?2:angle<45?3:4;
function terrainSamples(c,height,n){
  const h=new Float32Array(n*n),shade=new Float32Array(n*n),slope=new Float32Array(n*n),spacing=c.size/n;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)h[j*n+i]=spline(height,c.grid,(i+.5)*c.grid/n-.5,(j+.5)*c.grid/n-.5);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,hx=(h[j*n+Math.min(n-1,i+1)]-h[j*n+Math.max(0,i-1)])/(2*spacing),hz=(h[Math.min(n-1,j+1)*n+i]-h[Math.max(0,j-1)*n+i])/(2*spacing);
    shade[k]=.22+.78*Math.max(0,(LIGHT.y-hx*LIGHT.x-hz*LIGHT.z)/Math.sqrt(1+hx*hx+hz*hz));slope[k]=Math.atan(Math.hypot(hx,hz))/rad;
  }
  return {h,shade,slope};
}
export function shapePreview(c,height,path){
  const n=PREVIEW_PARAMS.pixels,{shade}=terrainSamples(c,height,n),pixels=new Uint8Array(n*n*4);
  for(let k=0;k<n*n;k++){pixels[k*4]=shade[k]*225;pixels[k*4+1]=shade[k]*238;pixels[k*4+2]=shade[k]*250;pixels[k*4+3]=255;}
  writeFileSync(path,encodePNG(n,n,pixels));
}
/** Heightfield column renderer: camera-depth rows are painted far to near, per pixel column.
 * Orthographic, elevation 32°, true vertical scale. No browser or graphics dependency.
 */
function perspective(c,field,n,cx,cz){
  const pixels=new Uint8Array(n*n*4),scale=.108,ca=Math.cos(32*rad),sa=Math.sin(32*rad),extent=c.size/Math.SQRT2;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=(j*n+i)*4;pixels[k]=222-j*.025;pixels[k+1]=234-j*.022;pixels[k+2]=244-j*.015;pixels[k+3]=255;}
  for(let col=35;col<n-35;col++){
    const u=(col-n/2)/scale;let previousY=n,previousColor=[80,100,110];
    for(let depth=-extent;depth<=extent;depth+=c.size/n*.7){
      const x=cz*u+cx*depth,z=-cx*u+cz*depth;
      if(Math.abs(x)>=c.size/2||Math.abs(z)>=c.size/2)continue;
      const gx=(x+c.size/2)*n/c.size-.5,gz=(z+c.size/2)*n/c.size-.5;
      const i=clamp(Math.round(gx),0,n-1),j=clamp(Math.round(gz),0,n-1),k=j*n+i;
      const y=Math.round(650+(depth*sa-(field.h[k]-600)*ca)*scale),base=COLORS[binFor(field.slope[k])],shade=field.shade[k];
      const color=base.map(v=>v*shade);
      // Fill the visible strip between depth rows. Overwrite nearer surfaces even below the skyline.
      const lo=clamp(previousY===n?y:Math.min(y,previousY),0,n-1),hi=clamp(previousY===n?y:Math.max(y,previousY),0,n-1);
      for(let yy=lo;yy<=hi;yy++){const q=(yy*n+col)*4;for(let ch=0;ch<3;ch++)pixels[q+ch]=color[ch];}
      if(previousY<n&&y<previousY-1){const q=(lo*n+col)*4;for(let ch=0;ch<3;ch++)pixels[q+ch]=(color[ch]+previousColor[ch])*.5;}
      previousY=y;previousColor=color;
    }
  }
  return pixels;
}
export function writePreviews(world,dir,relief=null){
  const n=PREVIEW_PARAMS.pixels,c=world.meta,b=world.buffers,imgs=Array.from({length:4},()=>new Uint8Array(n*n*4)),field=terrainSamples(c,b.height,n);
  // The metadata's evening shadow is intentionally separate: inspection light is northwest, 35°.
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,q=k*4,gx=(i+.5)*c.maskGrid/n-.5,gz=(j+.5)*c.maskGrid/n-.5;
    const read=(a,ch)=>spline(a,c.maskGrid,gx,gz,4,ch),rock=read(b.masksA,3)/255,ice=read(b.masksA,2)/255,d=clamp(read(b.masksA,0)*.02/4,0,1),trees=read(b.masksB,0)/255;
    const shade=field.shade[k];
    imgs[0][q]=shade*(225-90*rock);imgs[0][q+1]=shade*(238-110*rock);imgs[0][q+2]=shade*(250-115*rock);
    const color=COLORS[binFor(field.slope[k])];for(let ch=0;ch<3;ch++)imgs[1][q+ch]=color[ch];
    imgs[2][q]=210-150*d+40*ice;imgs[2][q+1]=220-90*d;imgs[2][q+2]=225+30*d-100*rock;
    imgs[3][q]=235-205*trees;imgs[3][q+1]=240-110*trees;imgs[3][q+2]=242-180*trees;
    for(const img of imgs)img[q+3]=255;
  }
  for(let d=0;d<world.drops.length;d++){
    const drop=world.drops[d],cx=Math.round((drop.x+world.half)*n/world.size),cz=Math.round((drop.z+world.half)*n/world.size);
    for(let j=-5;j<=5;j++)for(let i=-5;i<=5;i++)if(i*i+j*j<=25&&cx+i>=0&&cx+i<n&&cz+j>=0&&cz+j<n){const k=((cz+j)*n+cx+i)*4;imgs[0][k]=255;imgs[0][k+1]=80+d*15;imgs[0][k+2]=30;}
    for(let t=0;t<22;t++){const ix=Math.round(cx+Math.sin(drop.heading)*t),iz=Math.round(cz-Math.cos(drop.heading)*t);if(ix>=0&&ix<n&&iz>=0&&iz<n){const k=(iz*n+ix)*4;imgs[0][k]=255;imgs[0][k+1]=210;imgs[0][k+2]=70;}}
  }
  ['relief-drops','slope','snow','trees'].forEach((name,k)=>writeFileSync(`${dir}/${name}.png`,encodePNG(n,n,imgs[k])));
  if(relief){
    writeReliefCrop(world,{x:1700,z:1800},`${dir}/practice-detail.png`);
    if(relief.fields.length)writeReliefCrop(world,relief.fields.reduce((a,b)=>a.area>b.area?a:b),`${dir}/rollers-detail.png`);
    if(relief.ledges.length)writeReliefCrop(world,relief.ledges[0],`${dir}/ledge-detail.png`);
  }
  for(const [name,x,z]of [['sw',-1,1],['se',1,1],['ne',1,-1],['nw',-1,-1]])writeFileSync(`${dir}/perspective-${name}.png`,encodePNG(n,n,perspective(c,field,n,x/Math.SQRT2,z/Math.SQRT2)));
}

/** A 600m crop samples the delivered B-spline surface, with a second low-angle light
 * to make metre-scale convexities legible without altering vertical scale. */
export function writeReliefCrop(world,center,path){
  const n=1024,pixels=new Uint8Array(n*n*4),out={};
  const light={x:-.65,y:.36,z:-.67};
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=center.x+(i+.5)*600/n-300,z=center.z+(j+.5)*600/n-300;
    world.sampleSurface(x,z,out);
    const shade=clamp(.65+.65*(out.nx*light.x+out.ny*light.y+out.nz*light.z),.15,1);
    const k=(j*n+i)*4;pixels[k]=shade*225;pixels[k+1]=shade*238;pixels[k+2]=shade*250;pixels[k+3]=255;
  }
  writeFileSync(path,encodePNG(n,n,pixels));
}
