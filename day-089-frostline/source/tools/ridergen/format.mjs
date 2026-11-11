export function encodeModel({mesh,bones,parts}) {
 if(bones.length!==22||bones[20].name!=='poleL'||bones[21].name!=='poleR')throw Error('22 bones with appended poleL/poleR required');
 const count=mesh.p.length,arrays={position:new Float32Array(count*3),normal:new Int16Array(count*3),
  skinIndex:new Uint8Array(count*4),skinWeight:new Uint16Array(count*4),part:new Uint8Array(count),
  wrinkle:new Uint8Array(count),flutter:new Uint8Array(count),ao:new Uint8Array(count),seam:new Uint8Array(count),tone:new Uint8Array(count),
  index:new Uint16Array(mesh.tri.flat())};
 if(count>65535)throw Error('uint16 vertex budget exceeded');
 mesh.p.forEach((p,i)=>{arrays.position.set(p,i*3);arrays.normal.set(mesh.n[i].map(x=>Math.round(x*32767)),i*3);
  const a=mesh.a[i],w=a.weights.map(([bone,v])=>[bone,Math.floor(v*65535),v*65535%1]);
  let remaining=65535-w.reduce((s,v)=>s+v[1],0);const order=w.map((_,k)=>k).sort((a,b)=>w[b][2]-w[a][2]||a-b);
  for(let k=0;k<remaining;k++)w[order[k%w.length]][1]++;
  w.forEach(([bone,v],k)=>{arrays.skinIndex[i*4+k]=bone;arrays.skinWeight[i*4+k]=v;});
  arrays.part[i]=a.part;for(const name of ['wrinkle','flutter','ao','seam','tone'])arrays[name][i]=Math.round(Math.max(0,Math.min(1,a[name]))*255);
 });
 const attributes={},chunks=[];let offset=0;
 for(const [name,a]of Object.entries(arrays)){
  const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  attributes[name]={type:a.constructor.name,offset,count:a.length,itemSize:name==='index'?1:name==='position'||name==='normal'?3:name==='skinIndex'||name==='skinWeight'?4:1,normalized:!['position','skinIndex','part','index'].includes(name)};
  const bytes=Buffer.from(a.buffer,a.byteOffset,a.byteLength);chunks.push(bytes);offset+=bytes.length;
 }
 const bin=Buffer.concat(chunks),meta={format:'ginrei-rider',version:1,byteOrder:'little-endian',units:'metres',
  axes:{up:'+Y',boardForward:'-Z',bodyForward:'+X'},vertexCount:count,triangleCount:mesh.tri.length,byteLength:bin.length,
  skinTransform:'worldFromBind (inverse bind already included)',
  fields:{seam:{meaning:'distance to closest seam',metresPerUnit:.08,lineHalfWidthMetres:.004},tone:{meaning:'signed color transition',boundary:128,primaryAbove:true}},bones,parts,attributes};
 const json=JSON.stringify(meta,null,2)+'\n';
 if(mesh.tri.length>40000||bin.length+Buffer.byteLength(json)>1000000)throw Error(`model budget: ${count} vertices, ${mesh.tri.length} triangles, ${bin.length+Buffer.byteLength(json)} bytes`);
 return {bin,json,meta};
}
