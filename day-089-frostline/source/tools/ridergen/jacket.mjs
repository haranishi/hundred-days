import {improveSkinTopology} from './skin-topology.mjs';
import {cleanMesh,improveTriangles,smoothNormals} from './clean-mesh.mjs';
import {march,smooth,capsule,sub,dot,mix,unit} from './sdf.mjs';
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const along=(p,a,b)=>clamp(dot(sub(p,a),sub(b,a))/dot(sub(b,a),sub(b,a)));
// One welded surface: the shoulder has neither a cap nor an attachment ring.
export function jacket(mesh,j,attr,profile){
 const h=j.pelvis[1],arms=['L','R'].map((s,i)=>({a:j['shoulder'+s],b:j['elbow'+s],c:j['hand'+s],upper:i?8:5,lower:i?9:6,clav:i?18:17}));
 function torso(p){
  const t=clamp((p[1]-h)/.545),[w,d]=profile(t);
  const radial=(Math.pow(Math.abs(p[0]/d)**(2/.65)+Math.abs(p[2]/w)**(2/.65),.65/2)-1)*Math.min(w,d);
  return -smooth(-radial,-Math.max(h-p[1],p[1]-h-.545),.012);
 }
 const armField=(p,a)=>smooth(capsule(p,a.a,a.b,.080,.087),capsule(p,a.b,a.c,.087,.055),0.05);
 const field=p=>arms.reduce((d,a)=>smooth(d,armField(p,a),.050),torso(p));
 march(field,[[-.2417,h-.0563,-.6519],[.251,h+.5907,.6509]],.033,mesh,p=>{
  const ds=[torso(p),...arms.map(a=>armField(p,a))],min=Math.min(...ds),f=ds.map(d=>ease(.5+(Math.min(...ds.filter(x=>x!==d))-d)/.050)),sum=f.reduce((a,b)=>a+b,0);
  const chest=ease((p[1]-h-.03)/.10),upper=ease((p[1]-h-.13)/.09);
  const weights=[[0,(1-chest)*f[0]/sum],[1,chest*(1-upper)*f[0]/sum],[2,chest*upper*f[0]/sum]];
  arms.forEach((a,i)=>{
   const t=along(p,a.a,a.b),v=along(p,a.b,a.c),
    d0=Math.hypot(...sub(p,mix(a.a,a.b,t))),d1=Math.hypot(...sub(p,mix(a.b,a.c,v))),
    l0=Math.hypot(...sub(a.b,a.a)),l1=Math.hypot(...sub(a.c,a.b)),length=l0+l1,
    arc=d0<d1?t*l0:l0+v*l1,bisector=unit(mix(unit(sub(a.b,a.a)),unit(sub(a.c,a.b)),.5)),lower=ease((dot(sub(p,a.b),bisector)+0.12)/0.24),root=1-ease(arc/0.35),w=f[i+1]/sum;
   weights.push([2,w*root*.65],[a.clav,w*root*.35],[a.upper,w*(1-lower)*(1-root)],[a.lower,w*lower*(1-root)]);
  });
  const merged=new Map();for(const [b,w]of weights)merged.set(b,(merged.get(b)||0)+w);
  const sorted=[...merged].filter(([,w])=>w>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4),total=sorted.reduce((s,[,w])=>s+w,0);
  const seam=f[0]/sum>.95?Math.min(Math.abs(p[1]-h-.025),p[0]>.08&&Math.abs(p[2])<.08?Math.abs(p[2]):1):1;
  const wrinkle=Math.max(...arms.map(a=>Math.exp(-((Math.hypot(...sub(p,a.b))/.14)**2))));
  const result=attr(0,sorted.map(([b,w])=>[b,w/total]),seam,.5+(p[1]-h-.28-.23*p[2])/.10,wrinkle);
  const valley=Math.max(...arms.map(a=>{const y=p[1]-a.b[1],inside=clamp((p[0]-a.b[0])/.075);return inside*(Math.exp(-(((y-.035)/.018)**2))+Math.exp(-(((y+.035)/.018)**2)));}));
  result.ao*=1-.92*clamp(valley);return result;
 });
 cleanMesh(mesh);improveTriangles(mesh);improveSkinTopology(mesh);smoothNormals(mesh,5);
}
