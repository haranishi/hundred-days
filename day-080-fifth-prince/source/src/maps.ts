import { worldLayout } from './world-layout';
import { DISCOVERIES } from './exploration';
import type { MapData, Point, Zone } from './types';
export const TILE=16;
export function createMap(zone:Zone):MapData {
 const w=48,h=34;const tiles:number[][]=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>x<2||y<2||x>w-3||y>h-3?2:0));
 const m:MapData={zone,name:'',subtitle:'',width:w,height:h,tiles,points:[],buildings:[],obstacles:[],spawn:{x:376,y:368}};
 const rect=(x:number,y:number,rw:number,rh:number,t:number)=>{for(let j=y;j<y+rh;j++)for(let i=x;i<x+rw;i++)if(tiles[j]?.[i]!==undefined)tiles[j][i]=t;};
 const p=(id:string,x:number,y:number,label:string,kind:Point['kind'],extra:Partial<Point>={})=>m.points.push({id,x:x*TILE+8,y:y*TILE+8,label,kind,...extra});
 if(zone==='town'){
 m.name='アステリア王都';m.subtitle='はじまりの市場';
 rect(20,2,6,30,1);rect(3,19,42,5,1);rect(5,14,29,3,1);rect(6,25,29,3,1);
 rect(36,2,4,30,3);rect(35,19,6,5,4);
 m.buildings=[{x:6,y:7,w:10,h:7,style:'shop',label:'麦の灯り'},{x:26,y:7,w:9,h:7,style:'house',label:'星降る宿'},{x:5,y:20,w:8,h:5,style:'house',label:'月しずく薬房'},{x:26,y:20,w:8,h:5,style:'shop',label:'旅の工房'}];
 p('merchant',17,21,'商人 オルン','npc',{character:'merchant'});p('nora',11,15,'パン屋 ノラ','npc',{character:'nora'});p('mira',9,26,'薬師 ミラ','npc',{character:'mira'});p('inn',30,15,'星降る宿','npc',{character:'inn'});p('toma',30,26,'旅の工房','npc',{character:'toma'});
 p('guard',33,17,'負傷兵 レナート','npc',{character:'guard'});
 p('toForest',44,21,'霧しずくの森へ','gate',{target:'forest'});p('toPalace',23,3,'王宮へ','gate',{target:'palace'});
 rect(22,19,3,3,5);
 }else if(zone==='forest'){
 m.name='霧しずくの森';m.subtitle='木漏れ日と、ひそかな願い';m.spawn={x:104,y:344};
 rect(2,19,43,5,1);rect(10,12,5,15,1);rect(18,24,23,4,1);rect(24,8,5,20,1);rect(25,9,15,5,1);rect(35,8,5,20,1);
 p('story:well',27,28,'調合の古井戸','story');p('story:patch',25,12,'白い花の採集地','story');
 p('toTown',3,21,'王都へ戻る','gate',{target:'town'});
 p('herb1',12,14,'月しずく草','herb');p('herb2',20,26,'月しずく草','herb');p('herb3',28,12,'月しずく草','herb');p('herb4',35,26,'月しずく草','herb');p('herb5',11,26,'月しずく草','herb');p('herb6',40,21,'月しずく草','herb');p('bramble',37,10,'いばらの番獣','enemy');
 for(let y=3;y<31;y+=3)for(let x=3;x<44;x+=3)if(tiles[y][x]===0&&tiles[y+1]?.[x+1]===0&&((x*13+y*7)%5<4))rect(x,y,2,2,2);
 m.buildings=[{x:33,y:4,w:9,h:4,style:'ruin'}];
 }else if(zone==='palace'){
 m.name='白金の王宮';m.subtitle='四つの誇りと、ひとつの空席';m.spawn={x:376,y:432};
 rect(3,3,42,29,6);rect(20,4,7,28,7);rect(6,14,35,4,7);rect(7,22,34,3,7);
 rect(3,3,42,2,8);rect(3,3,2,29,8);rect(43,3,2,29,8);
 p('king',23,7,'国王 レオニス','npc',{character:'king'});
 p('flame',12,15,'火の王子 アレン','npc',{character:'flame'});p('tide',19,16,'水の王子 セイル','npc',{character:'tide'});p('grove',28,16,'木の王子 ロアン','npc',{character:'grove'});p('storm',36,15,'雷の王子 ジーク','npc',{character:'storm'});p('sage',35,25,'星詠み エルダ','npc',{character:'sage'});
 p('toTown',23,30,'王都へ戻る','gate',{target:'town'});p('toAbyss',23,5,'魔王城へ','gate',{target:'abyss'});
 }else{
 m.name='孤絶の魔王城';m.subtitle='五つの光が、闇をほどく';m.spawn={x:376,y:432};
 rect(7,5,34,26,9);rect(20,7,7,24,10);rect(11,11,27,5,10);rect(13,20,22,5,10);
 rect(7,5,34,2,8);
 p('story:voices',14,21,'声の封印','story');p('story:power',33,21,'力の封印','story');
 p('demon',23,11,'魔王 ヴェイル','enemy',{character:'demon'});p('toPalace',23,29,'王宮へ戻る','gate',{target:'palace'});
 }
 for(const b of m.buildings)rect(b.x,b.y,b.w,b.h,b.style==='ruin'?1:8);
 for(const [id,d] of Object.entries(DISCOVERIES))if(d.zone===zone)p(id,d.x,d.y,d.name,d.kind,{character:d.character});
 // Every interaction has a walkable approach, including harvest nodes in the woods.
 for(const q of m.points){const tx=Math.floor(q.x/16),ty=Math.floor(q.y/16);for(let y=ty-1;y<=ty+1;y++)for(let x=tx-1;x<=tx+1;x++)if(x>1&&x<w-2&&y>1&&y<h-2&&![3,8].includes(tiles[y][x]))tiles[y][x]=zone==='palace'?6:zone==='abyss'?9:tiles[y][x]===2?1:tiles[y][x];}
 m.obstacles=worldLayout(m).flatMap(p=>p.obstacles);
 return m;
}
export const groundWalkable=(m:MapData,x:number,y:number)=>{const tile=m.tiles[Math.floor(y/TILE)]?.[Math.floor(x/TILE)];return tile!==undefined&&![2,3,5,8].includes(tile);};
export const FOOT={left:4,right:4,up:4,down:2};
export function walkable(m:MapData,x:number,y:number):boolean{
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 const left=x-FOOT.left,right=x+FOOT.right,top=y-FOOT.up,bottom=y+FOOT.down,epsilon=1e-7;
 for(let ty=Math.floor(top/TILE);ty<=Math.floor((bottom-epsilon)/TILE);ty++)for(let tx=Math.floor(left/TILE);tx<=Math.floor((right-epsilon)/TILE);tx++)if(!groundWalkable(m,tx*TILE+8,ty*TILE+8))return false;
 return !m.obstacles.some(b=>left<b.x+b.w-epsilon&&right>b.x+epsilon&&top<b.y+b.h-epsilon&&bottom>b.y+epsilon);
}
export function moveOnMap(m:MapData,from:{x:number;y:number},dx:number,dy:number):{x:number;y:number}{
 let {x,y}=from;const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/2));
 for(let i=0;i<steps;i++){if(walkable(m,x+dx/steps,y))x+=dx/steps;if(walkable(m,x,y+dy/steps))y+=dy/steps;}
 return {x,y};
}
export function clearSegment(m:MapData,from:{x:number;y:number},to:{x:number;y:number}):boolean{
 const count=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/2));
 for(let i=0;i<=count;i++)if(!walkable(m,from.x+(to.x-from.x)*i/count,from.y+(to.y-from.y)*i/count))return false;return true;
}
export function safePosition(m:MapData,from:{x:number;y:number}):{x:number;y:number}{
 if(walkable(m,from.x,from.y))return {...from};let best={...m.spawn},distance=Infinity;
 for(let y=2;y<m.height-2;y++)for(let x=2;x<m.width-2;x++){const point={x:x*TILE+8,y:y*TILE+8},d=Math.hypot(from.x-point.x,from.y-point.y);if(d<distance&&walkable(m,point.x,point.y)){best=point;distance=d;}}
 return best;
}
function localConnection(m:MapData,from:{x:number;y:number},to:{x:number;y:number}):{x:number;y:number}[]|null{
 if(clearSegment(m,from,to))return [{x:to.x,y:to.y}];
 for(const bend of [{x:to.x,y:from.y},{x:from.x,y:to.y}])if(clearSegment(m,from,bend)&&clearSegment(m,bend,to))return [bend,{x:to.x,y:to.y}];
 return null;
}
const NAV=4;
interface NavigationGrid {width:number;height:number;open:Uint8Array}
const navigationCache=new WeakMap<MapData,NavigationGrid>();
function navigationGrid(m:MapData):NavigationGrid{
 const cached=navigationCache.get(m);if(cached)return cached;
 const width=Math.floor(m.width*TILE/NAV)+1,height=Math.floor(m.height*TILE/NAV)+1,open=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)open[y*width+x]=walkable(m,x*NAV,y*NAV)?1:0;
 const grid={width,height,open};navigationCache.set(m,grid);return grid;
}
export function findPath(m:MapData,from:{x:number;y:number},to:Point|{x:number;y:number}):{x:number;y:number}[]{
 const interaction='id' in to;if(!walkable(m,from.x,from.y)||!interaction&&!walkable(m,to.x,to.y))return [];
 if(interaction&&(from.x-to.x)**2+(from.y-to.y)**2<=24**2)return [];
 const grid=navigationGrid(m),{width,height,open}=grid;
 const inside=(x:number,y:number)=>x>=0&&y>=0&&x<width&&y<height;
 const connect=(point:{x:number;y:number},outward:boolean)=>{
  const root={x:Math.round(point.x/NAV),y:Math.round(point.y/NAV)},connections=new Map<number,{x:number;y:number}[]>();
  for(const radius of [2,4,8]){
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const x=root.x+dx,y=root.y+dy;if(!inside(x,y)||!open[y*width+x])continue;const node={x:x*NAV,y:y*NAV},connection=outward?localConnection(m,point,node):localConnection(m,node,point);if(connection)connections.set(y*width+x,connection);}
   if(connections.size)break;
  }
  return connections;
 };
 const goals=interaction?new Map<number,{x:number;y:number}[]>():connect(to,false);if(!interaction&&!goals.size)return [];
 const prefixes=connect(from,true),seeds=[...prefixes.keys()];
 seeds.sort((a,b)=>Math.hypot(a%width*NAV-from.x,Math.floor(a/width)*NAV-from.y)-Math.hypot(b%width*NAV-from.x,Math.floor(b/width)*NAV-from.y));
 const parent=new Int32Array(open.length).fill(-2),queue=new Int32Array(open.length);let tail=0,reached=-1;
 for(const i of seeds){parent[i]=-1;queue[tail++]=i;}
 for(let head=0;head<tail;head++){
  const i=queue[head],x=i%width,y=Math.floor(i/width);
  if(interaction?(x*NAV-to.x)**2+(y*NAV-to.y)**2<=24**2:goals.has(i)){reached=i;break;}
  // A 4px cardinal edge cannot jump an expanded obstacle: the foot is at least 6px tall.
  for(const [nx,ny] of [[x,y-1],[x+1,y],[x,y+1],[x-1,y]]){if(!inside(nx,ny))continue;const next=ny*width+nx;if(parent[next]===-2&&open[next]){parent[next]=i;queue[tail++]=next;}}
 }
 if(reached<0)return [];const nodes:{x:number;y:number}[]=[];
 let root=reached;for(let i=reached;i>=0;i=parent[i]){root=i;nodes.unshift({x:i%width*NAV,y:Math.floor(i/width)*NAV});}
 nodes.unshift(...prefixes.get(root)!.slice(0,-1));if(!interaction)nodes.push(...goals.get(reached)!);
 const result:{x:number;y:number}[]=[];
 for(let i=0;i<nodes.length;i++){const a=nodes[i-1],b=nodes[i],c=nodes[i+1];if(a&&c&&(a.x===b.x&&b.x===c.x||a.y===b.y&&b.y===c.y))continue;if((i||Math.hypot(b.x-from.x,b.y-from.y)>.01)&&(!result.length||Math.hypot(b.x-result.at(-1)!.x,b.y-result.at(-1)!.y)>.01))result.push(b);}
 if(!interaction&&Math.hypot((result.at(-1)??from).x-to.x,(result.at(-1)??from).y-to.y)>.01)result.push({x:to.x,y:to.y});
 return result;
}
