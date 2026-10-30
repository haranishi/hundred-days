import {worldLayout} from './world-layout';
import type { ArtSheets } from './pixel-assets';
import type { MapData } from './types';
export interface WorldProp {key:string;x:number;y:number;width:number;height:number;depth:number;canvas:HTMLCanvasElement}
export interface PaintedWorld {ground:HTMLCanvasElement;props:WorldProp[]}
const cv=(w:number,h:number)=>{const out=document.createElement('canvas');out.width=w;out.height=h;return out;};
const hash=(x:number,y:number)=>Math.abs(Math.sin(x*12.9898+y*78.233)*43758.5453)%1;
export function paintWorld(m:MapData,sheets:ArtSheets):PaintedWorld {
 const ground=cv(m.width*16,m.height*16),c=ground.getContext('2d')!;c.imageSmoothingEnabled=false;const props:WorldProp[]=[];
 const tile=(sheet:string,sx:number,sy:number,x:number,y:number,w=16,h=16)=>c.drawImage(sheets[sheet],sx*16,sy*16,w,h,x,y,w,h);
 const indoor=m.zone==='palace',dark=m.zone==='abyss',forest=m.zone==='forest';
 for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
 const t=m.tiles[y][x],px=x*16,py=y*16,r=hash(x,y);
 if(indoor||dark){
 const floor=dark?[16,13]:[5,1];tile('TilesetInteriorFloor',floor[0]+(x%2),floor[1]+(y%2),px,py);
 if(t===7||t===10){c.fillStyle=dark?'#69516b':'#8d4252';c.fillRect(px,py,16,16);c.fillStyle=dark?'#9a7a88':'#c49863';if(x===20||x===26)c.fillRect(px+(x===20?1:13),py,2,16);c.fillStyle=dark?'#a2907844':'#edc48633';c.fillRect(px+7,py+7,2,2);}
 if(t===8){tile('TilesetWallSimple',x%4,0,px,py);c.fillStyle=dark?'#29203780':'#9b805433';c.fillRect(px,py,16,16);}
 }else{
 tile('TilesetFloor',12+(r>.75?1:0),12,px,py);
 if(t===1){
 // Autotile a narrow path instead of a field of repeated blank squares.
 const is=(a:number,b:number)=>[1,4].includes(m.tiles[b]?.[a]??-1);const l=is(x-1,y),rr=is(x+1,y),u=is(x,y-1),d=is(x,y+1);
 tile('TilesetFloor',!l?0:!rr?2:1,!u?7:!d?9:8,px,py);
 if(r>.88)tile('TilesetFloor',r>.95?2:1,11,px,py);
 }else if(t===3){c.fillStyle='#4c9b9d';c.fillRect(px,py,16,16);tile('TilesetWater',1,1,px,py);c.fillStyle='#274e591c';c.fillRect(px,py,16,16);}
 else if(t===4){tile('TilesetHouse',10,16,px,py);c.fillStyle='#3d332933';c.fillRect(px,py+14,16,2);}
 if((t===0)&&r>.72){const sx=Math.floor(hash(x+4,y)*10);tile('TilesetNature',sx,10,px,py);}
 if(t===0&&r>.94)tile('TilesetNature',Math.floor(r*31)%7,11,px,py);
 }
 }
 if(!indoor&&!dark)for(const b of m.buildings){
  if(b.style==='ruin')continue;
  const w=b.w*16,h=b.h*16,house=cv(w,h+12),g=house.getContext('2d')!;g.imageSmoothingEnabled=false;
  const base=b.style==='shop'?12:8,cols=Math.ceil(w/16);
  for(let row=0;row<b.h;row++)for(let col=0;col<cols;col++){
   const roof=row<Math.ceil(b.h*.58),sx=roof?(col===0?base:col===cols-1?base+3:base+1+(col%2)):10,sy=row===0?0:roof?1:2;
   g.drawImage(sheets.TilesetHouse,sx*16,sy*16,16,16,col*16,row*16,16,16);
  }
  for(const x of [19,w-36])g.drawImage(sheets.TilesetHouse,64,48,16,16,x,h-25,16,16);
  g.drawImage(sheets.TilesetHouse,144,48,16,16,w/2-8,h-16,16,16);g.drawImage(sheets.TilesetHouse,80,48,16,16,w-28,8,16,16);g.fillStyle='#28392c55';g.fillRect(2,h-1,w-4,4);
  props.push({key:'house:'+b.x+':'+b.y,x:b.x*16,y:b.y*16-10,width:w,height:h+12,depth:(b.y+b.h)*16,canvas:house});
 }
 if(m.zone==='town'){
  c.fillStyle='#2d4c4440';c.beginPath();c.ellipse(376,341,29,12,0,0,Math.PI*2);c.fill();
  for(let y=27;y<31;y++)for(let x=6;x<18;x++){tile('TilesetFloor',1,8,x*16,y*16);tile('TilesetField',x%5,y%5,x*16,y*16);}
 }else if(forest){
  for(let i=0;i<28;i++){const x=75+(i*37)%620,y=100+(i*61)%370;if(m.tiles[Math.floor(y/16)]?.[Math.floor(x/16)]===0)tile('TilesetNature',i%7,11,x,y);}
 }else{
  for(const [i,x] of [12,19,28,36].entries()){c.fillStyle=['#b65645','#4e8da4','#668853','#8e6fa6'][i];c.fillRect(x*16-10,82,29,48);c.fillStyle='#e4c786';c.fillRect(x*16+2,85,4,37);c.fillRect(x*16-5,97,18,4);}
  if(dark){c.fillStyle='#392f5080';c.fillRect(0,0,ground.width,ground.height);}
 }
 for(const p of worldLayout(m)){
  if(p.shadow){c.fillStyle='#203b3433';c.beginPath();c.ellipse(p.shadow.x,p.shadow.y,p.shadow.rx,p.shadow.ry,0,0,Math.PI*2);c.fill();}
  if(p.key.startsWith('pillar:')){c.fillStyle='#211f2b4a';c.fillRect(p.x-1,p.y+40,34,14);}
  const out=cv(Math.ceil(p.w*p.scale),Math.ceil(p.h*p.scale)),g=out.getContext('2d')!;g.imageSmoothingEnabled=false;g.drawImage(sheets[p.sheet],p.sx*16,p.sy*16,p.w,p.h,0,0,p.w*p.scale,p.h*p.scale);
  props.push({key:p.key,x:p.x,y:p.y,width:out.width,height:out.height,depth:p.depth,canvas:out});
 }
 // Light pools and diagonal afternoon light are painted in world space, below actors.
 const shade=c.createRadialGradient(380,260,100,380,260,550);shade.addColorStop(0,'#fee1a307');shade.addColorStop(1,dark?'#15203490':forest?'#193e3b55':'#293a2b20');c.fillStyle=shade;c.fillRect(0,0,ground.width,ground.height);
 return {ground,props};
}
