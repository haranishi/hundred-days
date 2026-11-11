import {mkdir,writeFile} from 'node:fs/promises';
import {encodePNG} from './png.mjs';
import {sub,dot,cross,unit} from './mesh.mjs';
const VIEWS={front:[.9,.55,-1.5],back:[-.9,.5,1.5],side:[1,.3,.02],high:[.8,1.5,-1.2]};
// Rasterize the decoded (quantized) payload, including back-face culling and depth.
export function raster(instances,width=600,height=420,view=VIEWS.front,options={}){
 const dir=unit(view),right=unit(cross([0,1,0],dir)),up=cross(dir,right),light=unit([-.6,1,-.7]);
 const raw=[];
 for(const {mesh:m,at=[0,0,0],yaw=0,scale:instanceScale=1} of instances){
  const co=Math.cos(yaw),si=Math.sin(yaw),transform=p=>[(p[0]*co+p[2]*si)*instanceScale+at[0],p[1]*instanceScale+at[1],(-p[0]*si+p[2]*co)*instanceScale+at[2]];
  for(let i=0;i<m.index.length;i+=3){const ids=Array.from(m.index.subarray(i,i+3)),p=ids.map(id=>transform(Array.from(m.position.subarray(id*3,id*3+3)))),n=unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))),colors=ids.map(id=>Array.from(m.color.subarray(id*3,id*3+3))),ao=ids.map(id=>m.ao[id]);raw.push({p,n,colors,ao});}
 }
 const all=raw.flatMap(t=>t.p),lo=[0,1,2].map(k=>all.reduce((v,p)=>Math.min(v,p[k]),Infinity)),hi=[0,1,2].map(k=>all.reduce((v,p)=>Math.max(v,p[k]),-Infinity)),center=lo.map((v,k)=>(v+hi[k])/2);
 const flatten=p=>{const v=sub(p,center);return [dot(v,right),dot(v,up),dot(v,dir)];};
 const coords=all.map(flatten),ext=[0,1].map(k=>[coords.reduce((v,p)=>Math.min(v,p[k]),Infinity),coords.reduce((v,p)=>Math.max(v,p[k]),-Infinity)]);
 const scale=options.projectedHeight?options.projectedHeight/(ext[1][1]-ext[1][0]):Math.min((width-45)/(ext[0][1]-ext[0][0]),(height-45)/(ext[1][1]-ext[1][0]));
 const project=p=>{if(options.camera){const q=sub(p,options.camera),z=-dot(q,dir),f=height/(2*Math.tan((options.fov??55)*Math.PI/360));return [width/2+dot(q,right)*f/z,height/2-dot(q,up)*f/z,-z];}const q=flatten(p);return [width/2+q[0]*scale,height/2-q[1]*scale,q[2]];};
 const rgba=new Uint8Array(width*height*4),depth=new Float32Array(width*height).fill(-Infinity);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)rgba.set([202+y/height*24,219+y/height*14,233+y/height*10,255],(y*width+x)*4);
 function triangle(points,colors,shade){
  if(options.camera&&points.some(p=>dot(sub(p,options.camera),dir)>-.3))return;
  const [a,b,c]=points.map(project),area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<1e-10)return;
  const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const px=x+.5,py=y+.5,v=((px-a[0])*(c[1]-a[1])-(py-a[1])*(c[0]-a[0]))/area,w=((b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0]))/area,u=1-v-w;
   if(u<0||v<0||w<0)continue;const z=u*a[2]+v*b[2]+w*c[2],id=y*width+x;if(z<=depth[id])continue;depth[id]=z;
   for(let k=0;k<3;k++)rgba[id*4+k]=Math.round(255*(colors[0][k]*u+colors[1][k]*v+colors[2][k]*w)*shade);rgba[id*4+3]=255;
  }
 }
 const span=Math.max(hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1])*1.3,cx=center[0],cz=center[2];
 const ground=options.ground??[[-span+cx,-.04,-span+cz],[-span+cx,-.04,span+cz],[span+cx,-.04,span+cz],[span+cx,-.04,-span+cz]];
 triangle([ground[0],ground[1],ground[2]],[[.87,.91,.94],[.87,.91,.94],[.87,.91,.94]],1);triangle([ground[0],ground[2],ground[3]],[[.87,.91,.94],[.87,.91,.94],[.87,.91,.94]],1);
 // Flatten a silhouette onto the ground along the same light used for faces.
 for(const t of options.camera?[]:raw){const p=t.p.map(p=>[p[0]-light[0]/light[1]*p[1],-.02,p[2]-light[2]/light[1]*p[1]]);triangle(p,[[.65,.73,.80],[.65,.73,.80],[.65,.73,.80]],1);}
 for(const t of raw){if(dot(t.n,dir)<=0)continue;triangle(t.p,t.colors,(.50+.50*Math.max(0,dot(t.n,light)))*(1-.28*t.ao.reduce((s,v)=>s+v,0)/3));}
 return {width,height,rgba};
}
export function sheet(images,cols){
 const w=images[0].width,h=images[0].height,width=w*cols,height=h*Math.ceil(images.length/cols),rgba=new Uint8Array(width*height*4).fill(255);
 images.forEach((im,i)=>{for(let y=0;y<h;y++)rgba.set(im.rgba.subarray(y*w*4,(y+1)*w*4),((Math.floor(i/cols)*h+y)*width+i%cols*w)*4);});return {width,height,rgba};
}
export async function save(im,path){await writeFile(path,encodePNG(im.width,im.height,im.rgba));}
export async function renderViews(data,dir,revision){
 await mkdir(dir,{recursive:true});const prefix=`${dir}/round-${revision}`,architecture=[],atlas=[];
 for(const m of data.meshes){
  const views=['lodge','chalet-a','chalet-b','chalet-c','bridge'].includes(m.name)?Object.entries(VIEWS):[['front',VIEWS.front]];
  for(const [v,dir]of views){const im=raster([{mesh:m}],600,420,dir);await save(im,`${prefix}-${m.name}-${m.lod}-${v}.png`);if(views.length===4)architecture.push(im);}
  atlas.push(raster([{mesh:m}],400,360,m.name==='lift-station'?[.9,.12,-1.5]:VIEWS.front));
 }
 await save(sheet(architecture,4),`${prefix}-architecture.png`);await save(sheet(atlas,4),`${prefix}-all.png`);
 const get=n=>data.byName[n].near;
 const instances=[{mesh:get('lodge'),at:[0,0,15]},{mesh:get('chalet-a'),at:[-28,0,-8],yaw:.18},{mesh:get('chalet-b'),at:[-12,0,-12],yaw:-.1},{mesh:get('chalet-c'),at:[15,0,-10],yaw:.12},{mesh:get('chalet-a'),at:[31,0,5],yaw:-.18},{mesh:get('bridge'),at:[0,0,-32],yaw:.25}];
 for(let x=-27;x<29;x+=3)instances.push({mesh:get('fence'),at:[x,0,-23]});
 await save(raster(instances,1400,900,[.9,1.25,-1.6]),`${prefix}-village.png`);
 await save(raster([{mesh:get('lodge')}],960,750,[.25,.12,-1.5],{projectedHeight:60}),`${prefix}-lodge-distant.png`);
 return {architecture:`${prefix}-architecture.png`,all:`${prefix}-all.png`,village:`${prefix}-village.png`};
}
