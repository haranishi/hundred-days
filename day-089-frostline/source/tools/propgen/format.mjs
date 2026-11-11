import {MATERIALS} from './mesh.mjs';
export function encodeProps(models){
 const vertexCount=models.reduce((s,m)=>s+m.p.length,0),triangleCount=models.reduce((s,m)=>s+m.tri.length,0);
 const arrays={position:new Float32Array(vertexCount*3),normal:new Int16Array(vertexCount*3),color:new Uint8Array(vertexCount*3),material:new Uint8Array(vertexCount),ao:new Uint8Array(vertexCount),index:new Uint32Array(triangleCount*3)};
 let vertexStart=0,triangleStart=0;const meshes=[];
 for(const m of models){
  if(m.tri.length>m.limit)throw Error(`${m.name}/${m.lod}: triangle budget ${m.tri.length} > ${m.limit}`);
  for(let i=0;i<m.p.length;i++){
   const v=vertexStart+i;arrays.position.set(m.p[i],v*3);arrays.normal.set(m.n[i].map(x=>Math.round(x*32767)),v*3);arrays.color.set(m.color[i],v*3);arrays.material[v]=m.material[i];arrays.ao[v]=Math.round(m.ao[i]*255);
  }
  arrays.index.set(m.tri.flat(),triangleStart*3);
  meshes.push({name:m.name,lod:m.lod,vertexStart,vertexCount:m.p.length,triangleStart,triangleCount:m.tri.length,triangleLimit:m.limit,bounds:m.bounds,collision:m.collision,roofPlanes:m.roofs,stretchAxes:m.stretchAxes,...(m.deck?{deck:m.deck}:{})});
  vertexStart+=m.p.length;triangleStart+=m.tri.length;
 }
 const chunks=[],attributes={};let offset=0;
 for(const [name,a]of Object.entries(arrays)){
  const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
  attributes[name]={type:a.constructor.name,offset,count:a.length,itemSize:['position','normal','color'].includes(name)?3:1,normalized:['normal','color','ao'].includes(name)};
  chunks.push(Buffer.from(a.buffer,a.byteOffset,a.byteLength));offset+=a.byteLength;
 }
 const bin=Buffer.concat(chunks),meta={format:'ginrei-props',version:1,byteOrder:'little-endian',units:'metres',axes:{up:'+Y',front:'-Z',bridgeLength:'+X'},indexSpace:'mesh-local',vertexCount,triangleCount,byteLength:bin.length,materials:MATERIALS,fields:{color:'sRGB component / 255; convert to linear before lighting',ao:'cavity occlusion: 0 open, 1 occluded',normal:'signed normalized / 32767'},attributes,meshes};
 const json=JSON.stringify(meta,null,2)+'\n';if(bin.length+Buffer.byteLength(json)>2500000)throw Error('props total byte budget');
 return {bin,json,meta};
}
