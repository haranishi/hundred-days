import {constantsFor,WORLD_FORMAT_VERSION,FILES} from '../../src/world/format.js';
export function fixture() {
  const c={...constantsFor(true),size:6144,grid:32,cell:192,maskGrid:16},height=Float32Array.from({length:32**2},(_,k)=>1000-.1*((Math.floor(k/32)+.5)*192-3072));
  const masksA=new Uint8Array(16**2*4),masksB=new Uint8Array(16**2*4);for(let k=0;k<masksA.length;k+=4){masksA[k]=100;masksA[k+1]=130;masksA[k+2]=30;masksB[k]=180;masksB[k+1]=30;masksB[k+2]=80;masksB[k+3]=1;}
  const meta={version:WORLD_FORMAT_VERSION,seed:'fixture',...c,heightRange:[600,1400],sun:{x:-.9,y:.3,z:.3},features:[],stations:[{id:'test',name:'試験駅',x:2800,y:1000,z:2800,radius:25,base:true}],map:{file:'map.png',size:1024},drops:[],zones:[{id:1,name:'試験の森'}],hashes:Object.fromEntries(Object.values(FILES).map(f=>[f,'0'.repeat(64)])),practice:{x:1700,z:1800,width:200,length:300}};
  return {meta,buffers:{height,tileA:new Float32Array(256**2),masksA,masksB,sunVis:new Uint8Array(32**2).fill(255)}};
}
