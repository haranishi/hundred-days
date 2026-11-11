/** Pure decoder. Normal/color/AO return Float32Array; positions/indices/materials
 * are zero-copy views. Indices are local to each mesh. Input must be an exact ArrayBuffer.
 */
const SCHEMA={position:[Float32Array,3,false],normal:[Int16Array,3,true],color:[Uint8Array,3,true],material:[Uint8Array,1,false],ao:[Uint8Array,1,true],index:[Uint32Array,1,false]};
const fail=reason=>{throw new Error('Invalid prop data: '+reason);};
const vector=(v,n=3)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const positive=v=>Number.isFinite(v)&&v>0;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
export function readPropData(buffer,json){
 let m=json;if(typeof m==='string'){try{m=JSON.parse(m);}catch{fail('JSON syntax');}}
 if(!(buffer instanceof ArrayBuffer))fail('expected ArrayBuffer');
 if(!m||m.format!=='ginrei-props'||m.version!==1||m.byteOrder!=='little-endian'||m.indexSpace!=='mesh-local'||m.units!=='metres')fail('format/version/endianness/units/indexSpace');
 if(new Uint8Array(new Uint16Array([1]).buffer)[0]!==1)fail('host endianness');
 if(m.byteLength!==buffer.byteLength||m.byteLength>2500000)fail('byteLength mismatch or budget');
 if(!integer(m.vertexCount)||m.vertexCount<3||m.vertexCount>200000||!integer(m.triangleCount)||m.triangleCount<1||m.triangleCount>40000)fail('counts');
 if(!Array.isArray(m.materials)||m.materials.length!==7||m.materials.some((v,i)=>v?.id!==i||v.name!==['wood','stone','snow','steel','glass','foliage','trunk'][i]))fail('materials');
 if(m.axes?.up!=='+Y'||m.axes?.front!=='-Z'||m.axes?.bridgeLength!=='+X')fail('axes');
 const all={},ranges=[];
 for(const [name,[C,size,normalized]]of Object.entries(SCHEMA)){
  const a=m.attributes?.[name],count=(name==='index'?m.triangleCount*3:m.vertexCount*size);
  if(!a||a.type!==C.name||a.count!==count||a.itemSize!==size||a.normalized!==normalized||!integer(a.offset)||a.offset%C.BYTES_PER_ELEMENT||a.offset+count*C.BYTES_PER_ELEMENT>buffer.byteLength)fail(name+' layout');
  const end=a.offset+count*C.BYTES_PER_ELEMENT;for(const [start,stop]of ranges)if(a.offset<stop&&end>start)fail(name+' overlap');ranges.push([a.offset,end]);
  const raw=new C(buffer,a.offset,count);all[name]=normalized?Float32Array.from(raw,v=>v/(C===Int16Array?32767:255)):raw;
 }
 if(!Array.isArray(m.meshes)||!m.meshes.length)fail('meshes');
 const meshes=[],byName=Object.create(null),keys=new Set();let vertices=0,triangles=0;
 for(const shape of m.meshes){
  if(!shape||typeof shape.name!=='string'||!shape.name.length||!['near','mid','far'].includes(shape.lod))fail('mesh name/LOD');
  const key=shape.name+'/'+shape.lod;if(keys.has(key))fail('duplicate mesh');keys.add(key);
  if(shape.vertexStart!==vertices||shape.triangleStart!==triangles||!integer(shape.vertexCount)||shape.vertexCount<3||!integer(shape.triangleCount)||shape.triangleCount<1||!integer(shape.triangleLimit)||shape.triangleCount>shape.triangleLimit||vertices+shape.vertexCount>m.vertexCount||triangles+shape.triangleCount>m.triangleCount)fail(key+' ranges/counts');
  const b=shape.bounds,c=shape.collision;
  if(!b||!vector(b.min)||!vector(b.max)||!vector(b.size)||b.size.some((s,k)=>!positive(s)||Math.abs(s-(b.max[k]-b.min[k]))>1e-6))fail(key+' bounds');
  if(!c||!vector(c.center,2)||!positive(c.height)||Math.abs(c.height-b.max[1])>1e-5||!['rectangle','circle'].includes(c.type)||(c.type==='circle'?!positive(c.radius):!vector(c.size,2)||!c.size.every(positive)))fail(key+' collision');
  if(!Array.isArray(shape.stretchAxes)||shape.stretchAxes.some(a=>!['X','Y','Z'].includes(a)))fail(key+' stretchAxes');
  if(!Array.isArray(shape.roofPlanes))fail(key+' roofPlanes');
  for(const r of shape.roofPlanes){
   if(r?.kind!=='snow'||!Array.isArray(r.corners)||r.corners.length!==4||!r.corners.every(v=>vector(v)))fail(key+' roof corners');
   const [a,b,c,d]=r.corners,n=cross(sub(b,a),sub(c,a));if(!(n[1]>0)||Math.abs(dot(n,sub(d,a)))>1e-5)fail(key+' roof winding/planarity');
  }
  if(shape.deck){const d=shape.deck;if(d.axis!=='X'||![d.length,d.width,d.rise,d.snowTopOffset,d.woodTopOffset].every(positive)||!integer(d.segments)||d.segments<1)fail(key+' deck');}
  const result={name:shape.name,lod:shape.lod,metadata:shape};
  for(const [name,[,size]]of Object.entries(SCHEMA)){const start=name==='index'?triangles*3:vertices*size,end=start+(name==='index'?shape.triangleCount*3:shape.vertexCount*size);result[name]=all[name].subarray(start,end);}
  const p=result.position;
  for(let i=0;i<shape.vertexCount;i++){
   if(result.material[i]>=7)fail(key+' material index');let length=0;
   for(let k=0;k<3;k++){const v=p[i*3+k];if(!Number.isFinite(v)||v<b.min[k]-1e-4||v>b.max[k]+1e-4)fail(key+' position/bounds');length+=result.normal[i*3+k]**2;}
   if(Math.abs(length-1)>.002)fail(key+' normal length');
  }
  for(const i of result.index)if(i>=shape.vertexCount)fail(key+' triangle index');
  for(let i=0;i<result.index.length;i+=3){
   const ids=Array.from(result.index.subarray(i,i+3)),points=ids.map(id=>Array.from(p.subarray(id*3,id*3+3))),n=cross(sub(points[1],points[0]),sub(points[2],points[0]));
   if(Math.hypot(...n)<1e-9)fail(key+' degenerate triangle');
   for(const id of ids)if(dot(n,Array.from(result.normal.subarray(id*3,id*3+3)))<=0)fail(key+' inverted normal');
  }
  meshes.push(result);(byName[shape.name]??=Object.create(null))[shape.lod]=result;vertices+=shape.vertexCount;triangles+=shape.triangleCount;
 }
 if(vertices!==m.vertexCount||triangles!==m.triangleCount)fail('mesh coverage');
 return {meshes,byName,materials:m.materials,metadata:m};
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
