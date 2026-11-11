/** No I/O or three.js. Input is an exact ArrayBuffer, not a Node Buffer slab.
 * Integer normalized storage is decoded to Float32Array for all continuous fields.
 */
const TYPES={Float32Array,Int16Array,Uint8Array,Uint16Array};
const SCHEMA={position:['Float32Array',3,false],normal:['Int16Array',3,true],skinIndex:['Uint8Array',4,false],
 skinWeight:['Uint16Array',4,true],part:['Uint8Array',1,false],wrinkle:['Uint8Array',1,true],
 flutter:['Uint8Array',1,true],ao:['Uint8Array',1,true],seam:['Uint8Array',1,true],index:['Uint16Array',1,false]};
function fail(reason){throw new Error('Invalid rider data: '+reason);}
export function readRiderData(buffer,json) {
 let m=json;if(typeof m==='string'){try{m=JSON.parse(m);}catch{fail('JSON syntax');}}
 if(!(buffer instanceof ArrayBuffer))fail('expected ArrayBuffer');
 if(!m||m.format!=='ginrei-rider'||m.version!==1||m.byteOrder!=='little-endian')fail('unsupported format/version/endianness');
 if(!Number.isInteger(m.vertexCount)||m.vertexCount<1||m.vertexCount>65535||!Number.isInteger(m.triangleCount)||m.triangleCount<1||m.triangleCount>40000)fail('counts');
 if(m.byteLength!==buffer.byteLength||m.byteLength>1000000)fail('byteLength mismatch or budget');
 if(!Array.isArray(m.bones)||m.bones.length!==22||new Set(m.bones.map(b=>b?.name)).size!==22)fail('22 unique bones required');
 for(const b of m.bones){if(!b||typeof b!=='object'||typeof b.name!=='string'||b.parent!==-1||!Array.isArray(b.position)||b.position.length!==3||!b.position.every(Number.isFinite)||!Array.isArray(b.basis)||b.basis.length!==9||!b.basis.every(Number.isFinite)||!(b.length>0&&Number.isFinite(b.length)))fail('bone definition');
  for(let c=0;c<3;c++)for(let d=0;d<3;d++){let v=0;for(let k=0;k<3;k++)v+=b.basis[c*3+k]*b.basis[d*3+k];if(Math.abs(v-(c===d?1:0))>1e-4)fail('bone basis not orthonormal');}}
 if(!Array.isArray(m.parts)||!m.parts.length||m.parts.some((p,i)=>!p||typeof p!=='object'||p.id!==i||typeof p.name!=='string'||!/^#[0-9a-f]{6}$/i.test(p.color)||typeof p.rigid!=='boolean'))fail('parts');
 const result={bones:m.bones,parts:m.parts,metadata:m},ranges=[];
 const schema={...SCHEMA};if(m.attributes?.tone)schema.tone=['Uint8Array',1,true];
 const little=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
 if(!little)fail('host endianness');
 for(const [name,[type,size,normalized]]of Object.entries(schema)){
  const a=m.attributes?.[name],C=TYPES[type],count=(name==='index'?m.triangleCount*3:m.vertexCount*size);
  if(!a||a.type!==type||a.count!==count||a.itemSize!==size||a.normalized!==normalized||!Number.isSafeInteger(a.offset)||a.offset<0||a.offset%C.BYTES_PER_ELEMENT||a.offset+count*C.BYTES_PER_ELEMENT>buffer.byteLength)fail(name+' layout');
  const end=a.offset+count*C.BYTES_PER_ELEMENT;for(const [start,stop]of ranges)if(a.offset<stop&&end>start)fail(name+' overlap');ranges.push([a.offset,end]);
  const raw=new C(buffer,a.offset,count);result[name]=normalized?Float32Array.from(raw,v=>v/(type==='Int16Array'?32767:type==='Uint16Array'?65535:255)):raw;
 }
 if(!result.tone)result.tone=new Float32Array(m.vertexCount).fill(1);
 for(let i=0;i<m.vertexCount;i++){
  let sum=0,nonzero=0;
  for(let k=0;k<4;k++){const t=i*4+k,w=result.skinWeight[t];if(result.skinIndex[t]>=22||w<0||!Number.isFinite(w))fail('skin index/weight');sum+=w;if(w>0)nonzero++;}
  if(Math.abs(sum-1)>1e-6)fail('skin weight sum');
  if(result.part[i]>=m.parts.length)fail('part index');if(m.parts[result.part[i]].rigid&&nonzero!==1)fail('rigid weights');
  let n=0;for(let k=0;k<3;k++){if(!Number.isFinite(result.position[i*3+k]))fail('nonfinite position');n+=result.normal[i*3+k]**2;}
  if(Math.abs(n-1)>.002)fail('normal length');
 }
 for(const id of result.index)if(id>=m.vertexCount)fail('triangle index');
 for(let i=0;i<result.index.length;i+=3){
  const a=result.index[i]*3,b=result.index[i+1]*3,c=result.index[i+2]*3,p=result.position;
  const ax=p[b]-p[a],ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2],bx=p[c]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2];
  if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)<1e-12)fail('degenerate triangle');
 }
 return result;
}
