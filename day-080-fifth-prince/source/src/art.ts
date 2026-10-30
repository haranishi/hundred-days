import { CHARACTERS } from './content';
import type { MapData } from './types';
type Ctx=CanvasRenderingContext2D;
export const PALETTE={ink:'#292c39',grass:'#79936a',light:'#91a77b',shadow:'#617b60',path:'#c1b291',stone:'#aaa69a',gold:'#e4bd74'};
const canvas=(w:number,h:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const box=(c:Ctx,color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
const noise=(x:number,y:number)=>(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
function tree(c:Ctx,x:number,y:number,forest=false){
 box(c,'#344d42',x+4,y+16,24,11);box(c,'#514d3f',x+13,y+20,6,15);box(c,'#776446',x+15,y+21,3,13);
 const colors=forest?['#344f46','#456854','#598164','#74946e']:['#455f4b','#5f7d58','#77956a','#91a67a'];
 box(c,colors[0],x+3,y+5,26,21);box(c,colors[1],x,y+8,28,12);box(c,colors[1],x+8,y-2,17,26);box(c,colors[2],x+3,y+3,21,15);box(c,colors[3],x+8,y+1,11,4);box(c,colors[2],x+1,y+12,5,4);box(c,colors[0],x+22,y+15,8,7);
 for(let i=0;i<7;i++)box(c,i%2?colors[3]:colors[1],x+3+(i*7)%21,y+6+(i*3)%13,3,2);
}
function flower(c:Ctx,x:number,y:number,color='#dfb1a4'){
 box(c,'#526e4f',x,y+2,1,4);box(c,color,x-1,y,4,2);box(c,color,x,y-1,2,4);box(c,'#f0d797',x,y,1,1);
}
function building(c:Ctx,b:MapData['buildings'][number]){
 const x=b.x*16,y=b.y*16,w=b.w*16,h=b.h*16;
 if(b.style==='ruin'){
 for(let i=0;i<w;i+=16){box(c,'#737e76',x+i,y+8,12,h-8);box(c,'#a3ac91',x+i,y+7,12,4);box(c,'#4f6855',x+i+2,y+14,4,12);}return;
 }
 box(c,'#4b564b',x+6,y+8,w,h+4);box(c,'#635746',x+1,y+18,w-2,h-18);box(c,'#d1c3a1',x+4,y+20,w-8,h-21);
 for(let i=10;i<w-5;i+=22)box(c,'#83725a',x+i,y+22,3,h-24);
 box(c,'#897157',x+3,y+h-10,w-6,4);box(c,'#e3d2a5',x+3,y+21,w-6,4);
 const roof=b.style==='shop'?['#624b48','#a46252','#be7a5e','#d08c66']:['#414e5c','#5d6b7b','#7e8991','#97a0a3'];
 for(let r=0;r<5;r++){
 const rw=w+10-r*6;box(c,roof[0],x-5+r*3,y+17-r*5,rw,6);box(c,roof[1],x-4+r*3,y+16-r*5,rw-2,4);
 for(let t=0;t<rw-6;t+=12)box(c,(t/12+r)%2?roof[2]:roof[3],x-3+r*3+t,y+16-r*5,9,1);
 }
 box(c,'#d4c4a2',x+w-27,y-13,12,21);box(c,'#aca18b',x+w-29,y-15,16,4);
 const door=x+w/2-7;box(c,'#5a4d42',door-2,y+h-30,18,29);box(c,'#957451',door,y+h-28,14,27);box(c,'#bc955e',door+2,y+h-26,3,23);box(c,'#e0c077',door+10,y+h-15,2,2);
 for(const wx of [x+16,x+w-30]){box(c,'#695b49',wx-2,y+36,19,24);box(c,'#405865',wx,y+38,15,19);box(c,'#77969c',wx+1,y+39,5,8);box(c,'#d2c4a1',wx+7,y+37,2,21);box(c,'#d2c4a1',wx,y+47,15,2);box(c,'#92684b',wx-3,y+59,21,5);box(c,'#617d55',wx-2,y+56,20,4);flower(c,wx+2,y+53);flower(c,wx+12,y+53,'#e0c979');}
 if(b.style==='shop'){
 const aw=60,ax=x+w/2-aw/2;box(c,'#70584a',ax-2,y+h-45,aw+4,17);
 for(let i=0;i<6;i++)box(c,i%2?'#e4cf9e':'#b46d5c',ax+i*10,y+h-44,10,13);
 box(c,'#70523e',ax-1,y+h-27,2,30);box(c,'#70523e',ax+aw-1,y+h-27,2,30);
 }
}
function fountain(c:Ctx,x:number,y:number,t:number){
 box(c,'#777f75',x-3,y+24,54,22);box(c,'#c8c7b0',x,y+20,48,20);box(c,'#6e999b',x+4,y+23,40,11);box(c,'#aad0c7',x+9,y+26,26,3);box(c,'#8c9a8b',x+19,y+3,9,28);box(c,'#c7cab2',x+17,y,13,7);box(c,'#91c4be',x+21,y-6,5,14);box(c,'#c5e5d6',x+23,y-10+(t%3),2,8);
}
export function mapCanvas(m:MapData):HTMLCanvasElement {
 const cv=canvas(m.width*16,m.height*16),c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;
 const indoors=m.zone==='palace',dark=m.zone==='abyss',forest=m.zone==='forest';
 box(c,dark?'#292b3b':indoors?'#aaa79b':forest?'#526e54':PALETTE.grass,0,0,cv.width,cv.height);
 for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
 const t=m.tiles[y][x],px=x*16,py=y*16,rand=Math.abs(noise(x,y));
 if(t===0||t===2){
 const gr=forest?['#526e54','#57765a','#5f7b59']:['#79936a','#7e986e','#769168'];box(c,gr[(x*7+y*3)%3],px,py,16,16);
 for(let k=0;k<3;k++)box(c,forest?'#72906a':'#91a77b',px+(x+k*6)%15,py+(y+k*5)%15,2,1);
 if(t===0&&rand>0.86)flower(c,px+7,py+7,rand>0.94?'#edc474':'#c9b9cd');
 }else if(t===1||t===4){
 box(c,t===4?'#967c57':forest?'#9b9777':'#c0b18e',px,py,16,16);
 for(let k=0;k<3;k++)box(c,t===4?'#645d47':forest?'#a7a284':'#d2c19c',px+2+(k*6+x)%11,py+2+(k*4+y)%11,3,1);
 if(t===4){box(c,'#645943',px,py+14,16,2);box(c,'#c4aa78',px,py+1,16,1);}else if((x+y)%3===0)box(c,'#a7997c',px,py+15,9,1);
 }else if(t===3){
 box(c,'#4c7f87',px,py,16,16);box(c,'#61959b',px+(y%3)*2,py+4,8,1);box(c,'#87b5b0',px+5,py+11,6,1);if(x===36)box(c,'#b7b18d',px,py,3,16);
 }else if(t===6||t===7){
 box(c,t===7?'#985f61':(x+y)%2?'#c1bdaa':'#b7b4a3',px,py,16,16);box(c,t===7?'#b77b74':'#d0cbb7',px,py,16,1);box(c,t===7?'#7b4d56':'#aaa896',px+15,py,1,16);
 if(t===7&&(x===20||x===26))box(c,'#d4b877',px+(x===20?1:12),py,2,16);
 }else if(t===8){
 box(c,dark?'#494656':indoors?'#b3ad9b':'#6f7462',px,py,16,16);box(c,dark?'#696173':'#d5cbb1',px+1,py,14,2);box(c,dark?'#363443':'#8d8a7f',px,py+14,16,2);
 }else if(t===9||t===10){
 box(c,t===10?'#5e5369':(x+y)%2?'#424251':'#3c3e4d',px,py,16,16);box(c,'#2d303e',px,py+15,16,1);if(rand>0.8)box(c,'#7b6681',px+3,py+7,7,1);
 }
 }
 // Scatter coherent props, then draw tall objects from back to front.
 for(let y=1;y<m.height-1;y++)for(let x=1;x<m.width-1;x++)if(m.tiles[y][x]===2&&x%2===0&&y%2===0)tree(c,x*16-7,y*16-22,forest);
 for(const b of m.buildings)building(c,b);
 if(m.zone==='town'){
 fountain(c,22*16,19*16,0);
 // Merchant stall, barrels, bunting, garden plots and lamps.
 const sx=15*16,sy=18*16;box(c,'#514e3d',sx,sy+27,47,21);box(c,'#b78d5c',sx,sy+23,47,6);
 for(let i=0;i<5;i++){box(c,i%2?'#d3b77f':'#657f81',sx-3+i*10,sy,10,18);box(c,i%2?'#e4cc9b':'#819c96',sx-3+i*10,sy,10,3);}
 for(const [x,y] of [[5,17],[33,27],[14,25],[27,16]]){box(c,'#6c533e',x*16,y*16,12,16);box(c,'#ae8551',x*16+1,y*16+2,10,12);box(c,'#6b6857',x*16,y*16+3,12,2);box(c,'#6b6857',x*16,y*16+12,12,2);}
 for(let x=7;x<17;x++)for(let y=27;y<30;y++){box(c,'#7d7250',x*16,y*16,16,15);flower(c,x*16+4,y*16+6,'#bdcd8a');flower(c,x*16+12,y*16+10,'#debd79');}
 for(let i=0;i<14;i++){const x=275+i*13,y=254+Math.round(Math.sin(i/13*Math.PI)*10);box(c,'#6d6250',x,y,14,1);box(c,['#c67c69','#dfbb78','#849c9b'][i%3],x+2,y+1,7,8-i%2*2);}
 }else if(indoors){
 for(const x of [8,16,32,40])for(const y of [9,20,28]){
 box(c,'#8b887e',x*16-4,y*16+19,24,6);box(c,'#d9cfb1',x*16,y*16-18,16,38);box(c,'#b5af9d',x*16+11,y*16-16,4,34);box(c,'#e3d7b5',x*16-3,y*16-21,22,5);
 }
 for(const x of [12,19,28,36]){box(c,'#6c6159',x*16-8,71,31,54);box(c,['#9f5d55','#58899e','#698a66','#8e77a5'][[12,19,28,36].indexOf(x)],x*16-5,73,25,46);box(c,'#d1b575',x*16+5,80,4,26);box(c,'#d1b575',x*16-1,91,16,4);}
 box(c,'#8d7959',23*16-12,80,40,31);box(c,'#d9be80',23*16-10,76,36,6);box(c,'#9b625a',23*16-5,82,26,20);
 }else if(dark){
 for(const x of [10,36])for(const y of [10,18,26]){box(c,'#63516e',x*16-2,y*16-20,22,46);box(c,'#887598',x*16-5,y*16-23,28,6);box(c,'#2d2d3b',x*16+6,y*16-12,5,27);box(c,'#bc9ad3',x*16+2,y*16-29,13,4);}
 for(let i=0;i<30;i++){const x=138+(i*53)%490,y=100+(i*97)%330;box(c,'#9c6bb5',x,y,2,2);}
 }
 return cv;
}
export function portraitCanvas(id:string,frame=0):HTMLCanvasElement {
 const v=CHARACTERS[id]??CHARACTERS.lyca,cv=canvas(24,32),c=cv.getContext('2d')!;
 const step=frame%2?1:0;
 box(c,'#242e36',5,29,15,2);box(c,'#32333c',7,24,4,6-step);box(c,'#32333c',14,24,4,5+step);box(c,'#685742',6,29-step,6,2);box(c,'#685742',14,29+step,6,2);
 box(c,'#3e4146',6,15,13,11);box(c,v.color,7,15,11,10);box(c,'#f0d9a3',7,23,11,2);box(c,'#54423e',12,15,2,10);
 box(c,'#35323c',4,15,3,9);box(c,v.color,4,16,3,6);box(c,'#dbb38b',4,22,3,3);box(c,'#35323c',18,15,3,9);box(c,v.color,18,16,3,6);box(c,'#dbb38b',18,22,3,3);
 box(c,'#35303a',6,3,13,13);box(c,'#dbb38b',7,5,11,10);box(c,'#f0cda4',8,6,9,7);box(c,v.hair,6,2,13,5);box(c,v.hair,5,5,3,6);box(c,v.hair,17,5,3,7);box(c,v.hair,9,4,4,3);box(c,'#332f3a',9,9,2,2);box(c,'#332f3a',15,9,2,2);box(c,'#bc8b78',12,13,3,1);
 if(['lyca','flame','tide','grove','storm','king'].includes(id)){box(c,'#e3c77d',6,1,14,2);box(c,'#e3c77d',6,-1,2,3);box(c,'#e3c77d',12,-1,2,3);box(c,'#e3c77d',18,-1,2,3);}
 if(id==='mira'||id==='sage'){box(c,v.color,5,2,15,3);box(c,'#e1d7b5',5,1,15,1);}
 return cv;
}
export function enemyCanvas(kind:string):HTMLCanvasElement {
 const cv=canvas(96,96),c=cv.getContext('2d')!;const col=kind==='demon'?'#9270b1':kind==='bramble'?'#7f9b72':CHARACTERS[kind]?.color??'#9b84b3';
 box(c,'#232934',15,83,67,5);
 if(kind==='demon'){
 for(let i=0;i<6;i++){box(c,i%2?'#50415e':'#665174',10+i*5,28+i*5,13,41-i*3);box(c,i%2?'#50415e':'#665174',73-i*5,28+i*5,13,41-i*3);}
 box(c,'#43384f',31,24,35,55);box(c,col,35,27,27,42);box(c,'#b09ac4',40,28,17,27);box(c,'#d3b6c9',40,14,18,19);box(c,'#4a365b',35,10,28,13);box(c,'#b7a4c4',31,3,7,19);box(c,'#b7a4c4',61,3,7,19);box(c,'#d8b189',43,23,4,3);box(c,'#d8b189',53,23,4,3);box(c,'#4a365b',31,66,14,20);box(c,'#4a365b',53,66,14,20);box(c,'#e2c68b',46,37,6,6);
 }else if(kind==='bramble'){
 for(let i=0;i<7;i++){box(c,'#455c48',13+i*9,39-(i%3)*5,8,38);box(c,col,15+i*9,37-(i%3)*5,5,30);}
 box(c,'#4b684a',24,30,49,43);box(c,col,28,29,43,32);box(c,'#a7bc88',33,30,31,11);box(c,'#b1ca91',25,18,9,18);box(c,'#b1ca91',65,18,8,17);box(c,'#e6c178',37,45,7,5);box(c,'#e6c178',55,45,7,5);box(c,'#344d3f',43,58,14,4);
 }else{
 for(let i=0;i<8;i++){const a=i*Math.PI/4,x=46+Math.round(Math.cos(a)*31),y=45+Math.round(Math.sin(a)*31);box(c,col,x,y,7,7);box(c,'#eddec2',x+2,y+2,3,3);}
 box(c,'#4a485a',32,23,30,49);box(c,col,35,24,24,43);box(c,'#e7d3a5',42,22,10,50);box(c,'#e7d3a5',32,40,30,7);box(c,'#f1e5c9',44,38,6,11);
 }
 return cv;
}
export function pixelPortrait(id:string):string {return portraitCanvas(id).toDataURL();}
export function landscapeCanvas():HTMLCanvasElement {
 const cv=canvas(480,270),c=cv.getContext('2d')!;
 const sky=c.createLinearGradient(0,0,0,270);sky.addColorStop(0,'#29384f');sky.addColorStop(.5,'#727a8c');sky.addColorStop(1,'#d7b995');c.fillStyle=sky;c.fillRect(0,0,480,270);
 box(c,'#ead2a1',352,38,22,22);box(c,'#29384f',346,32,22,22);
 for(let i=0;i<65;i++){const x=(i*97)%480,y=(i*43)%113;box(c,i%3?'#b1b5b0':'#e4cf9d',x,y,1,1);}
 for(let layer=0;layer<4;layer++){
 c.fillStyle=['#596980','#4a6270','#3e5c5b','#314d48'][layer];c.beginPath();c.moveTo(0,270);
 for(let x=0;x<=480;x+=8)c.lineTo(x,144+layer*20+Math.sin(x/(38-layer*6)+layer)*15+Math.sin(x/17)*7);c.lineTo(480,270);c.fill();
 }
 // A distant original castle, silhouetted against dusk.
 const x=256,y=105;box(c,'#c1b9a8',x,y,83,59);box(c,'#9ea4a0',x+8,y+9,67,50);
 for(const tx of [x-4,x+30,x+68]){box(c,'#bac0b0',tx,y-17,19,73);box(c,'#747f8a',tx-3,y-21,25,8);for(let k=0;k<4;k++)box(c,'#b5beaf',tx-3+k*7,y-26,4,7);box(c,'#e4bb75',tx+7,y+6,4,8);box(c,'#e4bb75',tx+7,y+26,4,8);}
 box(c,'#526670',x+33,y+35,15,26);box(c,'#dbb478',x+38,y+43,5,18);
 for(let i=0;i<5;i++){const xx=145+i*11,yy=225-i*2;box(c,'#1b3337',xx,yy-12,7,13);box(c,['#cc8265','#77a8b4','#81a26e','#a48db8','#dfc17f'][i],xx,yy-8,7,7);box(c,'#ccae87',xx+2,yy-16,4,4);box(c,'#1b3337',xx-1,yy+1,3,5);box(c,'#1b3337',xx+5,yy+1,3,5);}
 for(let x=0;x<480;x+=34)tree(c,x,237+(x%3)*5);
 return cv;
}
