import {mesh,box,beam,cylinder,poly,face,finish} from './mesh.mjs';
// Recolour only the just-created building piece; shared prop palettes stay untouched.
function paint(m,start,rgb){for(let i=start;i<m.p.length;i++)m.color[i]=rgb;}
function timber(m,c,s,tone=1){const i=m.p.length;box(m,c,s,0,1,.1);paint(m,i,[162,110,68].map(v=>Math.round(v*tone)));}
function bar(m,a,b,w=.22){const i=m.p.length;beam(m,a,b,w,w,0);paint(m,i,[91,58,34]);}
function pane(m,q,mat,rgb,n){const i=m.p.length;face(m,q,mat,n,1,.08);paint(m,i,rgb);}
// Local u spans the pitch, v follows the ridge. Rotation keeps outward winding.
function snowyRoof(m,{x=0,z=0,w,d,e,r,axis='Z',snow=.65,soft=false}){
 const p=(u,y,v)=>axis==='Z'?[x+u,y,z+v]:[x+v,y,z-u];
 for(const s of [-1,1]){
  const edge=s*w/2;
  const profile=v=>[[edge,e,v],[0,r,v],[0,r-.25,v],[edge,e-.25,v]].map(q=>p(...q));
  poly(m,[...profile(-d/2),...profile(d/2)],[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]],0,.85);
  const shape=v=>[[edge+s*.12,e+snow*.62,v],[edge*.88,e+(r-e)*.12+snow+.09,v],[edge*.45,e+(r-e)*.55+snow+.17,v],[0,r+snow,v],[0,r+.035,v],[edge+s*.22,e+.05,v],[edge+s*.23,e+snow*.32,v]].map(q=>p(...q));
  const a=shape(-d/2),b=shape(d/2);
  const segments=soft?3:1;
  for(let j=0;j<segments;j++){
   const ring=t=>shape(-d/2+d*t).map((q,i)=>q.map((v,k)=>v+(k===1&&i!==4?Math.sin(t*Math.PI)**2*.10:0)));
   poly(m,[...ring(j/segments),...ring((j+1)/segments)],[[0,1,2,3,4,5,6],[7,13,12,11,10,9,8],...Array.from({length:7},(_,i)=>[i,(i+1)%7,(i+1)%7+7,i+7])],2,1,.03);
  }
  let corners=[a[0],a[3],b[3],b[0]]; // true snow vertices, planar roof approximation
  const crossY=(corners[1][2]-corners[0][2])*(corners[2][0]-corners[0][0])-(corners[1][0]-corners[0][0])*(corners[2][2]-corners[0][2]);
  if(crossY<0)corners.reverse();m.roofs.push({kind:'snow',corners});
  for(const v of [-d/2,d/2])bar(m,p(edge,e-.1,v),p(0,r-.1,v),.26);
  bar(m,p(edge,e-.12,-d/2),p(edge,e-.12,d/2),.24);
  for(const v of [-d*.32,d*.23]){const a=p(edge+s*.17,e+.15,v-.035),b=p(edge+s*.17,e+.15,v+.035),c=p(edge+s*.18,e-.34,v);face(m,[a,b,c],2,axis==='Z'?[s,0,0]:[0,0,-s]);face(m,[c,b,a],2,axis==='Z'?[-s,0,0]:[0,0,s]);}
 }
}
function gable(m,x,z,w,e,r,axis='Z'){
 const p=(u,y)=>axis==='Z'?[x+u,y,z]:[x,y,z-u];
 // Each end is an explicit outward-facing surface.
 const n=axis==='Z'?[0,0,Math.sign(z)]:[Math.sign(x),0,0];
 pane(m,[p(-w/2,e),p(w/2,e),p(0,r)],0,[160,107,65],n);
 for(let y=e+.35;y<r-.15;y+=.4){const half=w/2*(1-(y-e)/(r-e));bar(m,p(-half,y),p(half,y),.055);}
 bar(m,p(-w/2,e),p(0,r),.24);bar(m,p(w/2,e),p(0,r),.24);bar(m,p(0,e),p(0,r),.25);
}
function facade(m,w,d,base,e,round){
 box(m,[0,base/2,0],[w,base,d],1,.88,.2);
 timber(m,[0,(base+e)/2,0],[w,e-base,d],.87);
 // Stone faces have recessed mortar between individually varied blocks.
 for(const axis of [0,2])for(const sign of [-1,1]){
  const length=axis===2?w:d,depth=axis===2?d:w,block=length>20?2:1.65;
  const p=(u,y,out)=>axis===2?[u,y,sign*(depth/2+out)]:[sign*(depth/2+out),y,u];
  const n=axis===2?[0,0,sign]:[sign,0,0];
  for(let y=.32,row=0;y<base;y+=.64,row++)for(let a=-length/2;a<length/2-.05;){const len=Math.min(length/2-a,block*(a===-length/2&&row%2?.5:1));pane(m,[p(a+.035,y-.285,round>=5?.045:.018),p(a+len-.035,y-.285,round>=5?.045:.018),p(a+len-.035,Math.min(base-.025,y+.285),round>=5?.045:.018),p(a+.035,Math.min(base-.025,y+.285),round>=5?.045:.018)],1,[135,131,120].map(v=>Math.round(v*(.86+.18*(.5+.5*Math.sin(a*3+row*2))))),n);a+=len;}
  for(let y=base+.2,i=0;y<e-.05;y+=.4,i++){
   const tone=.95+.09*Math.sin(i*1.7+axis+sign),c=p(0,Math.min(y,e-.2),.045),s=axis===2?[length,.36,.09]:[.09,.36,length];timber(m,c,s,tone);
  }
  for(const y of [base,e-.15,...(w>20?[6.1]:[])]){const c=p(0,y,.14);timber(m,c,axis===2?[length,.28,.22]:[.22,.28,length],.57);}
  const count=w>20?Math.ceil(length/4.5):2;
  for(let i=0;i<=count;i++){const c=p(-length/2+.15+(length-.3)*i/count,(base+e)/2,.16);timber(m,c,[.28,e-base,.28],.58);}
 }
}
function window(m,u,y,wall,axis=2,width=1.3,lit=false,shutters=true){
 const sign=Math.sign(wall),p=(a,b,o)=>axis===2?[u+a,y+b,wall+sign*o]:[wall+sign*o,y+b,u+a];
 const n=axis===2?[0,0,sign]:[sign,0,0];
 const rect=(a,b,w,h,o,mat,rgb)=>pane(m,[p(a-w/2,b-h/2,o),p(a+w/2,b-h/2,o),p(a+w/2,b+h/2,o),p(a-w/2,b+h/2,o)],mat,rgb,n);
 rect(0,0,width+.24,1.72,.22,0,[100,65,37]);
 rect(0,0,width,1.46,.25,4,lit?[255,205,120]:[35,66,86]);
 for(const a of [-width/2,0,width/2])rect(a,0,.075,1.54,.28,0,[140,92,52]);
 for(const b of [-.76,0,.76])rect(0,b,width+.07,.075,.29,0,[140,92,52]);
 if(shutters)for(const side of [-1,1]){
  rect(side*(width/2+.35),0,.43,1.64,.21,0,[123,80,44]);
  for(const b of [-.53,-.26,0,.26,.53])rect(side*(width/2+.35),b,.40,.07,.24,0,[86,56,32]);
 }
}
function balcony(m,w,y,z,round){
 timber(m,[0,y,z+.7],[w,.22,1.4],.77);
 const spacing=round>=2?.55:.8;
 for(let x=-w/2;x<=w/2+.01;x+=spacing)timber(m,[x,y+.6,z],[.10,1,.12],.73);
 timber(m,[0,y+1.1,z],[w+.16,.15,.20],.65);box(m,[0,y+1.23,z],[w+.20,round>=5?.24:.16,.26],2);
 for(const x of [-w/2,w/2]){timber(m,[x,y+1.1,z+.7],[.16,.15,1.4],.65);box(m,[x,y+1.23,z+.7],[.20,round>=5?.24:.16,1.4],2);for(const t of [.45,.9,1.35])timber(m,[x,y+.6,z+t],[.1,1,.1],.7);}
 for(let x=-w/2+.7;x<w/2;x+=w>20?4:2)bar(m,[x,y-.1,z+.05],[x,y-1.25,z+1.35],.22);
}
function chimney(m,x,z,bottom,top){
 box(m,[x,(bottom+top)/2,z],[1.3,top-bottom,1.4],1,.8);
 for(let y=bottom+.25,row=0;y<top-.1;y+=.5,row++)for(const s of [-1,1]){
  for(const dx of [-.32,.32])box(m,[x+dx,y,z+s*.71],[.60,.43,.06],1,.96+.12*Math.sin(y+dx));
  box(m,[x+s*.66,y,z],[.06,.43,1.34],1,.9+.12*Math.sin(row));
 }
 box(m,[x,top,z],[1.55,.24,1.65],1,.75);box(m,[x,top+.22,z],[1.65,.26,1.75],2);
}
function entry(m,z,lodge,round){
 box(m,[0,.03,z-.8],[3.5,.06,1.9],2);
 for(const x of [-.53,.53]){timber(m,[x,1.36,z-.13],[1.02,2.5,.16],.58);timber(m,[x,1.95,z-.23],[.68,.72,.06],.8);box(m,[x+(x<0?.32:-.32),1.2,z-.24],[.07,.10,.07],3);}
 for(let i=0;i<3;i++)box(m,[0,.16+i*.14,z-.95+i*.28],[3.3-i*.3,.20+i*.28,1.6-i*.4],1,1.05);
 snowyRoof(m,{z:z-.65,w:lodge?5:3.7,d:2.5,e:3.05,r:lodge?4.15:3.85,snow:.55});
 for(const x of [-1.5,1.5]){timber(m,[x,1.7,z-1.65],[.18,2.7,.18],.68);bar(m,[x,2.2,z-1.65],[x,3.1,z-.7],.14);}
}
function drifts(m,w,d,round){
 // Low, faceted convex banks; snow may overhang the unchanged stone contact.
 for(const sign of [-1,1])for(const x of [-w*.34,w*.34]){
  const z=sign*(d/2+.35),rx=w*.14,rz=round>=3?1.1:.8,h=round>=3?.48:.34;
  const ring=Array.from({length:8},(_,i)=>[x+rx*Math.cos(i*Math.PI/4),.035,z+rz*Math.sin(i*Math.PI/4)]);
  poly(m,[...ring,[x,.035+h,z]],[[7,6,5,4,3,2,1,0],...ring.map((_,i)=>[i,(i+1)%8,8])],2,1,.02);
 }
}
export function detailedBuilding(name,round=5){
 const large=name==='lodge',v=large?0:['chalet-a','chalet-b','chalet-c'].indexOf(name),w=large?46:[10.7,12.2,13.7][v],d=large?19:[8.5,9.85,10.15][v],base=large?3.2:1.25,e=large?9.7:[4.5,4.8,5][v],m=mesh(name,'near',large?14000:2600);
 facade(m,w,d,base,e,round);
 if(large){
  snowyRoof(m,{w:d+3.6,d:w+3.6,e:9,r:14,axis:'X',soft:round>=4,snow:round>=2?.75:.60});
  for(const x of [-w/2,w/2])gable(m,x,0,d,e,14,'X');
  // Central cross-gable emerges from the main roof; intersecting solids are buried.
  snowyRoof(m,{z:round>=3?-5.75:round>=2?-5.7:-6,w:round>=2?22:18,d:round>=2?12.2:10.6,e:round>=2?9.5:10.1,r:14.2,soft:round>=4,snow:round>=2?.75:.60});
  gable(m,0,round>=3?-11.65:round>=2?-10.25:-10.6,round>=2?20:15.6,round>=2?9.5:9.9,13.95);
  if(round>=2){for(const x of [-8,-4,4,8])bar(m,[x,9.5,round>=3?-11.7:-10.32],[x*.38,12.7,round>=3?-11.7:-10.32],.30);}
  for(const x of [-4,0,4])window(m,x,11.15,round>=3?-11.7:-10.65,2,1.25,false,false);
  balcony(m,44,3.55,-10.9,round);balcony(m,44,6.65,-10.9,round);
  for(const z of [-d/2,d/2])for(const y of [1.75,4.95,8])for(let x=-20;x<=20;x+=4)if(!(z<0&&Math.abs(x)<1&&y<3))window(m,x,y,z,2,1.45,(y<6&&(Math.round(x/4)+Math.round(y))%3===0));
  for(const x of [-w/2,w/2])for(const z of [-6,0,6])for(const y of [1.75,4.95,8])window(m,z,y,x,0,1.35,y<6&&z===0);
  for(const x of [-15,15]){
   snowyRoof(m,{x,z:-4.2,w:3.5,d:3.6,e:round>=4?12.2:11.8,r:round>=4?13.2:12.65,snow:.6});gable(m,x,-6,2.9,round>=4?12.2:11.8,round>=4?13.05:12.5);window(m,x,round>=4?12.65:12.12,-6.05,2,.85,false,false);
   chimney(m,x,3.4,11.1,round>=4?15.5:14.5);
  }
 }else{
  const axis=v===1?'X':'Z',rw=(axis==='X'?d:w)+3,rd=(axis==='X'?w:d)+3,r=e+rw/2*Math.tan(24*Math.PI/180);
  snowyRoof(m,{w:rw,d:rd,e:e-.41,r:r-.41,axis,soft:round>=4,snow:.60});
  if(axis==='Z')for(const z of [-d/2,d/2])gable(m,0,z,w,e,r-.35);else for(const x of [-w/2,w/2])gable(m,x,0,d,e,r-.35,'X');
  for(const z of [-d/2,d/2])for(const x of [-w*.28,w*.28])window(m,x,2.65,z,2,1.12,z<0);
  for(const x of [-w/2,w/2])window(m,0,2.7,x,0,1.15);
  chimney(m,w*.25,1,r-1.5,Math.min(8.25,r+.25));
  if(v===1)balcony(m,w*.75,1.45,-d/2-1.4,round);
  if(v===2){snowyRoof(m,{z:-d/2+.25,w:5,d:3,e:5.35,r:6.55,snow:.6});gable(m,0,-d/2-1.25,4.5,5.2,6.4);}
 }
 entry(m,-d/2,large,round);drifts(m,w,d,round);
 if(large)for(let row=0;row<3;row++)for(let i=0;i<5-row;i++)cylinder(m,[w/2-.6,.25+row*.32,-2+i*.38],[w/2-.6,.25+row*.32,-.85+i*.38],.17,0,6,1.3);
 return finish(m,{type:'rectangle',center:[0,0],size:[w,d]});
}
