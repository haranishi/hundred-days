import {mesh,box,beam,cylinder,poly,finish} from './mesh.mjs';
import {roof} from './buildings.mjs';
export function bridge(revision=1){
 const m=mesh('bridge','near',2500),y=x=>.8+2.2*(1-(x/11)**2),n=16;
 for(let i=0;i<n;i++){
  const x=-11+i*22/n,xx=x+22/n;
  const layer=(a,b,mat,z0=-2,z1=2)=>poly(m,[[x,y(x)+a,z0],[x,y(x)+a,z1],[xx,y(xx)+a,z0],[xx,y(xx)+a,z1],[x,y(x)+b,z0],[x,y(x)+b,z1],[xx,y(xx)+b,z0],[xx,y(xx)+b,z1]],[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]],mat);
  layer(0,.20,0);layer(.20,.31,2);
  for(const s of [-1,1]){
   beam(m,[x,y(x)-.45,s*1.75],[xx,y(xx)-.45,s*1.75],.35,.65,0,.69);
   for(const h of [.68,1.3])beam(m,[x,y(x)+h,s*1.82],[xx,y(xx)+h,s*1.82],.16,.16,0,1.08);
   if(revision>=2)beam(m,[x,y(x)+1.42,s*1.82],[xx,y(xx)+1.42,s*1.82],.20,.10,2);
  }
 }
 for(let i=0;i<=10;i++){const x=-11+i*2.2;for(const s of [-1,1]){box(m,[x,y(x)+.7,s*1.82],[.23,1.6,.23],0,.8);box(m,[x,y(x)+1.55,s*1.82],[.30,.14,.30],2);}}
 for(const x of [-10.2,10.2]){box(m,[x,.27,0],[1.6,.54,4.2],1);box(m,[x,.6,0],[1.65,.13,4.25],2);}
 m.deck={axis:'X',length:22,width:4,rise:2.2,woodTopOffset:1.0,snowTopOffset:1.11,segments:n,profile:'rise * (1 - (2*x/length)^2)'};
 return finish(m,{type:'rectangle',center:[0,0],size:[22,4]});
}
export function fence(){const m=mesh('fence','near',120);
 for(const x of [-1.4,1.4]){box(m,[x,.53,0],[.18,1.06,.18],0);box(m,[x,1.10,0],[.23,.08,.23],2);}
 for(const y of [.4,.86])box(m,[0,y,0],[3,.12,.13],0,1.12);
 box(m,[0,.96,0],[3,.08,.16],2);return finish(m,{type:'rectangle',center:[0,0],size:[3,.23]});}
export function tower(revision=1){const m=mesh('lift-tower','near',500);
 box(m,[0,.16,0],[1.3,.32,1.3],1);cylinder(m,[0,.2,0],[0,9.4,0],.24,3,8);box(m,[0,9.4,0],[6,.28,.35],3);
 for(const x of [-2.6,2.6]){box(m,[x,9.65,0],[1.1,.65,.72],3,.8);for(const z of [-.4,.4])for(const xx of [-.28,.28])cylinder(m,[x+xx,9.7,z-.07],[x+xx,9.7,z+.07],.28,3,6,1.4);}
 if(revision>=2)for(let y=.7;y<9;y+=.52)beam(m,[-.35,y,.30],[.35,y,.30],.055,.055,3,1.3);
 return finish(m,{type:'circle',center:[0,0],radius:.65},['Y']);}
export function chair(revision=1){const m=mesh('lift-chair','near',220);
 beam(m,[0,3.25,0],[0,1.05,.15],.075,.075,3);beam(m,[0,3.25,0],[.25,3.25,0],.07,.07,3);
 box(m,[0,.55,0],[1.2,.10,.55],0,.63);box(m,[0,.94,.27],[1.2,.52,.08],0,.68);
 for(const x of [-.56,.56]){beam(m,[x,.5,.28],[x,1.18,.28],.055,.055,3);beam(m,[x,.55,-.21],[x,.94,-.21],.05,.05,3);beam(m,[x,.94,-.21],[x,.94,.25],.05,.05,3);beam(m,[x,.53,-.1],[x,.04,-.35],.04,.04,3);}
 beam(m,[-.56,.04,-.35],[.56,.04,-.35],.065,.075,3);if(revision>=2)box(m,[0,.96,.21],[.055,.48,.08],3);
 return finish(m,{type:'rectangle',center:[0,0],size:[1.2,.65]});}
export function station(revision=1){const m=mesh('lift-station','near',2200);
 for(const x of [-5.5,5.5])for(const z of [-2.8,2.8]){box(m,[x,.18,z],[.8,.36,.8],1);beam(m,[x,.3,z],[x,4.2,z],.23,.23,3);beam(m,[x,3,z],[x-Math.sign(x),4.2,z],.15,.15,3);}
 for(const z of [-2.8,2.8])box(m,[0,4.05,z],[12,.25,.2],3);
 roof(m,[0,0,0],14,8,4.2,5.6,revision);
 // The return wheel is a ring: the open centre and spokes remain visible below the roof.
 const r=2,n=20,cy=revision>=3?2.4:3.3,cx=-2;
 for(let i=0;i<n;i++){const a=i/n*2*Math.PI,b=(i+1)/n*2*Math.PI;beam(m,[cx+r*Math.cos(a),cy,r*Math.sin(a)],[cx+r*Math.cos(b),cy,r*Math.sin(b)],.22,.26,3,1.3);}
 cylinder(m,[cx,2.8,0],[cx,4,0],.26,3,10);for(let i=0;i<6;i++){const a=i/6*2*Math.PI;beam(m,[cx,cy,0],[cx+r*Math.cos(a),cy,r*Math.sin(a)],.12,.14,3);}
 box(m,[4,1.45,1.6],[3,2.9,2.7],0,.9);box(m,[4,2, .20],[2.2,1.05,.08],4);box(m,[5.55,2,1.5],[.08,1.05,1.8],4);box(m,[3.8,1,-.01],[.9,2,.15],0,.65);
 return finish(m,{type:'rectangle',center:[0,0],size:[14,8]});}
