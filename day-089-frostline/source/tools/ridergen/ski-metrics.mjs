import {measures} from './ski-measures.mjs';
import {skiPoses} from './ski-preview.mjs';
import {buildModel} from './model.mjs';
import {exportedModel,inversionStats} from './preview.mjs';
const model=exportedModel(buildModel());
for(const [n,p] of skiPoses()){
 const j=p.joints,a=(s)=>{const A=j['hip'+s],B=j['knee'+s],C=j['ankle'+s],u=[A.x-B.x,A.y-B.y,A.z-B.z],v=[C.x-B.x,C.y-B.y,C.z-B.z];return Math.acos(u.reduce((a,x,i)=>a+x*v[i],0)/Math.hypot(...u)/Math.hypot(...v))*180/Math.PI;};
 console.log(n,JSON.stringify({knees:[a('L'),a('R')],hands:['L','R'].map(s=>({forward:-(j['hand'+s].z-j.chest.z),y:j['hand'+s].y,elbow:j['elbow'+s],shaft:p.poleDirs[s]})),poleChecks:measures(p),inversions:inversionStats(model,p)}));
}
