import type {MapData,WorldObstacle} from './types';
export interface PropLayout {key:string;sheet:string;sx:number;sy:number;w:number;h:number;x:number;y:number;scale:number;depth:number;obstacles:WorldObstacle[];shadow?:{x:number;y:number;rx:number;ry:number}}
type Foot=[number,number,number,number];
// The same placements supply the rendered sprites and their ground footprints.
export function worldLayout(m:MapData):PropLayout[]{
 const out:PropLayout[]=[];
 const add=(key:string,sheet:string,sx:number,sy:number,w:number,h:number,x:number,y:number,scale=1,depth=y+h*scale,feet:Foot[]=[])=>{
  const p:PropLayout={key,sheet,sx,sy,w,h,x,y,scale,depth,obstacles:feet.map(([ox,oy,bw,bh],i)=>({id:key+':'+i,x:x+ox*scale,y:y+oy*scale,w:bw*scale,h:bh*scale}))};out.push(p);return p;
 };
 if(m.zone==='town'||m.zone==='forest'){
  for(let y=1;y<m.height-1;y++)for(let x=1;x<m.width-1;x++)if(m.tiles[y][x]===2&&x%2===0&&y%2===0){
   const variant=m.zone==='town'&&Math.abs(Math.sin(x*12.9898+y*78.233)*43758.5453)%1>.79?0:3,rootX=x*16+8,rootY=y*16+17;
   const p=add('tree:'+x+':'+y,'TilesetNature',variant,18,48,48,rootX-24,rootY-43,1,rootY+1,[[16,36,16,10]]);p.shadow={x:rootX,y:rootY+2,rx:18,ry:7};
  }
  for(const b of m.buildings){
   if(b.style==='ruin'){for(let i=0;i<b.w;i+=2)add('ruin:'+b.x+':'+i,'TilesetNature',16,14,32,32,(b.x+i)*16,(b.y+b.h)*16-30,1,(b.y+b.h)*16,[[3,20,26,12]]);continue;}
   for(const x of [b.x*16+8,(b.x+b.w)*16-20])add('plant:'+x+':'+b.y,'TilesetElement',0,7,16,32,x,(b.y+b.h)*16-21,1,(b.y+b.h)*16+9,[[3,23,10,9]]);
   if(b.style==='shop')add('market:'+b.x,'TilesetHouse',16,13,96,48,b.x*16+b.w*8-48,(b.y+b.h)*16-24,1,(b.y+b.h)*16+24,[[4,30,88,18]]);
  }
 }
 if(m.zone==='town'){
  add('fountain','TilesetHouse',3,15,32,32,352,302,1.5,347,[[4,22,24,10]]);
  add('stall','TilesetHouse',16,13,96,48,228,280,1,328,[[4,30,88,18]]);
  for(const [x,y,tx,ty] of [[215,344,4,1],[206,356,0,0],[328,395,1,0],[424,376,5,1],[536,421,0,7],[683,402,4,0],[188,283,6,1],[440,302,0,7]])add('town-prop:'+x,'TilesetElement',tx,ty,16,16,x,y,1,y+16,[[2,8,12,8]]);
  for(let x=7;x<18;x++)add('fence:'+x,'TilesetHouse',9,4,16,16,x*16,405,1,421,[[0,9,16,3]]);
  for(const x of [70,490,665])add('tree:extra:'+x,'TilesetNature',3,18,48,48,x,60,1,103,[[16,36,16,10]]);
  add('washing','TilesetElement',11,2,80,32,430,277,1,309,[[0,24,4,8],[76,24,4,8]]);
  add('gate','TilesetHouse',29,20,64,48,344,12,1,60,[[0,30,10,18],[54,30,10,18]]);
 }else if(m.zone==='forest'){
  for(const [x,y] of [[115,392],[270,180],[480,354],[660,389]])add('stone:'+x,'TilesetNature',16,14,32,32,x,y,1,y+26,[[4,18,24,12]]);
  add('old-well','TilesetHouse',3,19,32,32,440,430,1,462,[[2,18,28,14]]);
 }else{
  for(const x of [8,16,32,40])for(const y of [9,20,28])add('pillar:'+x+':'+y,'TilesetHouse',7,15,16,48,x*16-3,y*16-28,1.3,y*16+35,[[0,34,16,14]]);
  for(const [x,y] of [[178,96],[547,96],[180,340],[548,340]])add('brazier:'+x+':'+y,'TilesetElement',8,1,16,32,x,y,1,y+32,[[3,22,10,10]]);
  if(m.zone==='palace'){
   add('throne','TilesetElement',7,9,16,32,367,86,1.5,134,[[1,24,14,8]]);
   for(const x of [520,568,616])add('bookcase:'+x,'TilesetElement',8,7,48,32,x,355,1,388,[[2,20,44,12]]);
  }else for(const x of [220,520])add('dead-tree:'+x,'TilesetNature',4,0,32,32,x,145,1.5,193,[[9,24,14,8]]);
 }
 return out;
}
