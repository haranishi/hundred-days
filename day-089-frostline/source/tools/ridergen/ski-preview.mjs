import {sheet,SKI_VIEWS} from './ski-sheet.mjs';
import {createState} from '../../src/sim/state.js';
import {createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
import {render,skinMesh,exportedModel,realPoses} from './preview.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
export function skiPoses(){
 return [['stand',{}],...[-30,30,-45,45].map(a=>['carve-'+a,{mode:'carve',edge:a*Math.PI/180}]),['tuck',{crouch:1}],
 ['brake',{mode:'skid',edge:.35,slip:1.1,fwd:{x:Math.sin(1.1),y:0,z:-Math.cos(1.1)}}],
 ['air',{mode:'air',crouch:0}],...[1,2,3].map(grab=>['grab-'+grab,{mode:'air',crouch:1,air:{grab,grabTime:.5}}]),
 ['push-front',{speed:2,crouch:1,time:.02}],['push-back',{speed:2,crouch:1,time:.58}],['push-return',{speed:2,crouch:1,time:.85}],...[0,.25,.5].map(time=>['crash-'+time,{mode:'crash',speed:10,time}])].map(([name,o])=>{
  const s=Object.assign(createState(),{gear:'ski',speed:15,vel:{x:0,y:0,z:-15},leg:.78},o),p=createPose(),m=createPoseMemory();
  const input={state:s,events:[],dt:1/60,heightAt:()=>0};solvePose(input,m,p);
  for(let t=0;t<(o.time??1)*60;t++)solvePose(input,m,p);
  return [name,p];
 });
}
export async function renderSkiViews(model,dir){
 await mkdir(dir,{recursive:true});model=exportedModel(model);
 const summary={};
 for(const [name,p]of skiPoses()){
  const mesh=skinMesh(model,p);summary[name]=p;
  for(const view of SKI_VIEWS){
   const a=view.azimuth*Math.PI/180,direction=[Math.sin(a),Math.tan(view.elevation*Math.PI/180),Math.cos(a)];
   await render(mesh,model.parts,`${dir}/${name}-${view.name}.png`,direction,640,640,{center:[0,.70,0],scale:260,perspectiveDistance:view.distance});
  }
 }
 for(const [name,p]of realPoses())await render(skinMesh(model,p),model.parts,`${dir}/board-${name}.png`,[0,Math.tan(Math.PI/12),1],640,640,{center:[0,.7,0],scale:260,perspectiveDistance:3});
 await render(skinMesh(model,summary.stand),model.parts,`${dir}/detail.png`,[.8,.6,-1],1000,760,{center:[.05,.50,-.10],scale:430,perspectiveDistance:1.5});
 await render(skinMesh(model,summary.stand),model.parts,`${dir}/detail-3m.png`,[.8,.3,-1],1000,760,{center:[0,.55,0],scale:500,perspectiveDistance:3});
 const standMesh=skinMesh(model,summary.stand);
 await render(standMesh,model.parts,`${dir}/detail-feet.png`,[.6,.5,-1],640,640,{center:[0,.06,-.03],scale:1150,perspectiveDistance:1.5});
 await render(standMesh,model.parts,`${dir}/detail-grip.png`,[.6,.3,-1],640,640,{center:Object.values(summary.stand.joints.handR),scale:1500,perspectiveDistance:1.5});
 await sheet(dir,['detail-feet','detail-grip'],'equipment-closeup',2,512);
 const names=Object.keys(summary),views=SKI_VIEWS.map(v=>v.name);
 for(let i=0;i<names.length;i+=4)await sheet(dir,names.slice(i,i+4).flatMap(n=>views.map(v=>n+'-'+v)),'all-views-'+(1+i/4));
 await sheet(dir,names.map(n=>n+(n.includes('grab')||n==='tuck'?'-side':'-back18')),'overview');
 await writeFile(`${dir}/poses.json`,JSON.stringify(summary,null,2));
}
