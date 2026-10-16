import * as T from '../vendor/three.module.js';
import { STATIONS, TRACKS, trackPoints, routePoints, pointAlong } from './network.js';
import { trainState } from './logic.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { createLandscape, createTrain, material } from './models.js';

const SVG_NS='http://www.w3.org/2000/svg';
const svgNode=(tag,attrs={})=>{const n=document.createElementNS(SVG_NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
export function createWorld(host,{onStation,onNotice,onViewChange=()=>{}}) {
  let renderer=null, composer=null, scene=null, camera=null, mode='3d', currentCase=null, currentTime=0;
  let selectedTrain=null, angle=.55, elevation=.86, zoom=1, lastWidth=0,lastHeight=0;
  let trains=[], markers=[], resizeObserver, dragging=null, contextLost=false;
  const labels=host.querySelector('.station-labels'),canvas=host.querySelector('canvas'),map=host.querySelector('.flat-map');
  const flatTrains=new Map(),pathCache=new Map();
  const selection={start:null,end:null};
  const svg=svgNode('svg',{viewBox:'-21 -14 42 28','aria-hidden':'true'});
  map.append(svg);
  svg.append(svgNode('path',{d:'M-20 4Q-23-5-13-9L-4-12 7-11Q18-12 20-3L18 6Q15 14 3 12L-10 13Q-20 11-20 4',fill:'#25443f',stroke:'#45685d','stroke-width':'.1'}));
  for(let i=0;i<7;i++) svg.append(svgNode('path',{d:'M'+(-4+i*2)+' -9l2 -3 2 3',fill:'none',stroke:'#496d61','stroke-width':'.12'}));
  for(const track of TRACKS) {
    const points=trackPoints(track);
    svg.append(svgNode('polyline',{points:points.map(p=>p.x+','+p.z).join(' '),fill:'none',stroke:track.color,'stroke-width':'.18','stroke-linecap':'round'}));
  }
  for(const s of STATIONS) {
    svg.append(svgNode('circle',{cx:s.x,cy:s.z,r:'.28',fill:'#efcf96',stroke:'#122a32','stroke-width':'.12'}));
    const button=document.createElement('button');
    button.type='button';button.className='station-marker';button.dataset.station=s.id;
    button.setAttribute('aria-label',s.name+'駅を調べる');
    button.innerHTML='<span class="station-pin">'+s.number+'</span><span class="station-name">'+s.name+'</span><span class="station-role"></span>';
    button.addEventListener('click',()=>onStation(s));
    labels.append(button);markers.push({s,button,ring:null});
  }
  try {
    renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.5:2));
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
    scene=new T.Scene();scene.fog=new T.FogExp2('#0b222c',.013);
    camera=new T.OrthographicCamera(-20,20,16,-16,.1,180);
    scene.add(new T.HemisphereLight('#aacbd5','#284a35',3.0));
    const key=new T.DirectionalLight('#ffd7a1',4.1);key.position.set(-15,26,12);
    key.castShadow=true;key.shadow.mapSize.set(2048,2048);
    Object.assign(key.shadow.camera,{left:-27,right:27,top:23,bottom:-23,near:1,far:80});
    key.shadow.bias=-.001;key.shadow.normalBias=.06;key.shadow.radius=3;scene.add(key);
    const fill=new T.DirectionalLight('#6cb9ca',2.0);fill.position.set(12,13,-15);scene.add(fill);
    scene.add(createLandscape());
    const sea=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshStandardMaterial({color:'#102f3a',roughness:.28,metalness:.4}));
    sea.rotation.x=-Math.PI/2;sea.position.y=-1.22;sea.receiveShadow=true;scene.add(sea);
    const rippleMat=new T.LineBasicMaterial({color:'#3f6569',transparent:true,opacity:.075});
    for(let i=0;i<22;i++) {
      const ps=[];
      for(let j=0;j<=140;j++) {
        const a=j/140*Math.PI*2,r=23+i*1.8;
        ps.push(new T.Vector3(Math.cos(a)*r,-1.19,Math.sin(a)*r*.65));
      }
      scene.add(new T.Line(new T.BufferGeometry().setFromPoints(ps),rippleMat));
    }
    for(const mark of markers) {
      const mat=new T.MeshBasicMaterial({color:'#e4bc7a',transparent:true,opacity:.4});
      const ring=new T.Mesh(new T.TorusGeometry(.55,.025,6,48),mat);
      ring.rotation.x=Math.PI/2;ring.position.set(mark.s.x,.57,mark.s.z);scene.add(ring);mark.ring=ring;
    }
  } catch {
    mode='2d';onNotice('この環境では路線図で表示します。すべての事件を遊べます。');
  }
  if(renderer){
    const target=new T.WebGLRenderTarget(1,1,{type:renderer.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType});target.samples=4;
    composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
    composer.addPass(new UnrealBloomPass(new T.Vector2(1,1),.23,.35,1.35));
    composer.addPass(new OutputPass());
  }
  host.dataset.renderer=renderer?'webgl':'svg';
  function cameraUpdate() {
    if(!camera)return;
    const distance=48;
    camera.position.set(Math.sin(angle)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,Math.cos(angle)*Math.cos(elevation)*distance);
    camera.lookAt(.2,0,0);camera.zoom=zoom;camera.updateProjectionMatrix();
  }
  function resize() {
    const w=host.clientWidth,h=host.clientHeight;
    if(w<1||h<1)return;
    lastWidth=w;lastHeight=h;
    if(renderer) {
      renderer.setSize(w,h,false);composer?.setSize(w,h);
      const halfH=Math.max(12.6,20.8/(w/h));
      camera.left=-halfH*w/h;camera.right=halfH*w/h;camera.top=halfH;camera.bottom=-halfH;
      cameraUpdate();
    }
    render();
  }
  function positionLabels() {
    for(const {s,button} of markers) {
      let x,y;
      if(mode==='3d'&&camera) {
        const v=new T.Vector3(s.x,1.1,s.z).project(camera);
        x=(v.x*.5+.5)*lastWidth;y=(-v.y*.5+.5)*lastHeight;
      } else {
        const scale=Math.min(lastWidth/42,lastHeight/28);
        x=lastWidth/2+s.x*scale;y=lastHeight/2+s.z*scale;
      }
      button.style.left=x+'px';button.style.top=y+'px';
      button.classList.toggle('is-start',selection.start===s.id);
      button.classList.toggle('is-claim',selection.end===s.id);
      button.querySelector('.station-role').textContent=selection.start===s.id?'確認記録':selection.end===s.id?'証言':'';
    }
  }
  function locationFor(train) {
    const state=trainState(train,currentTime);
    if(state.kind!=='moving') {
      const s=STATIONS.find(s=>s.id===state.station);
      return {x:s.x,z:s.z,angle:Math.PI/2,kind:state.kind};
    }
    const key=state.from+'-'+state.to;
    if(!pathCache.has(key))pathCache.set(key,routePoints(state.from,state.to));
    return {...pointAlong(pathCache.get(key),state.progress),kind:'moving'};
  }
  function render() {
    if(!currentCase||!lastWidth)return;
    host.dataset.view=mode;map.hidden=mode!=='2d';canvas.hidden=mode!=='3d';
    for(const {data,group,index} of trains) {
      const p=locationFor(data);
      if(group) {
        group.position.set(p.x,.56,p.z+(p.kind==='moving'?0:index*.14));
        group.rotation.y=p.angle;
        group.scale.setScalar(selectedTrain===data.id?1.65:1.35);
        group.visible=mode==='3d';
      }
      const circle=flatTrains.get(data.id);
      if(circle) {
        circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.z);
        circle.setAttribute('r',selectedTrain===data.id?'.34':'.22');
        circle.setAttribute('stroke-width',selectedTrain===data.id?'.15':'.06');
      }
    }
    for(const mark of markers) if(mark.ring) {
      const selected=mark.s.id===selection.start||mark.s.id===selection.end;
      mark.ring.material.color.set(mark.s.id===selection.start?'#a6ded6':'#eac381');
      mark.ring.material.opacity=selected?.9:.25;mark.ring.scale.setScalar(selected?1.35:1);
    }
    if(renderer&&mode==='3d'&&!contextLost){if(composer)composer.render();else renderer.render(scene,camera);}
    positionLabels();host.dataset.ready='true';
  }
  function setCase(data) {
    currentCase=data;
    for(const {group}of trains){group?.traverse(o=>{if(o.isInstancedMesh)o.dispose();});group?.removeFromParent();}
    for(const circle of flatTrains.values())circle.remove();
    flatTrains.clear();
    trains=data.trains.map((data,index)=>{
      const group=renderer?createTrain(data.color):null;
      if(group)scene.add(group);
      const circle=svgNode('circle',{r:'.22',fill:data.color,stroke:'#fff0cb','stroke-width':'.06'});
      svg.append(circle);flatTrains.set(data.id,circle);
      return {data,group,index};
    });
    currentTime=data.start+12;selectedTrain=null;resize();
  }
  function setView(next) {
    mode=next==='3d'&&renderer&&!contextLost?'3d':'2d';
    cameraUpdate();render();onViewChange(mode);return mode;
  }
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();contextLost=true;host.dataset.contextLost='true';setView('2d');onNotice('3D表示が中断したため、路線図へ切り替えました。捜査は続けられます。');
  });
  host.addEventListener('pointerdown',e=>{
    if(mode!=='3d'||e.target.closest('button'))return;
    dragging={x:e.clientX,y:e.clientY,angle,elevation};
    host.setPointerCapture(e.pointerId);host.classList.add('is-dragging');
  });
  host.addEventListener('pointermove',e=>{
    if(!dragging)return;
    if(e.pointerType==='touch'&&Math.abs(e.clientY-dragging.y)>Math.abs(e.clientX-dragging.x))return;
    angle=dragging.angle-(e.clientX-dragging.x)*.005;
    elevation=Math.max(.5,Math.min(1.25,dragging.elevation+(e.clientY-dragging.y)*.004));
    cameraUpdate();render();
  });
  const endDrag=()=>{dragging=null;host.classList.remove('is-dragging');};
  host.addEventListener('pointerup',endDrag);host.addEventListener('pointercancel',endDrag);
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);cameraUpdate();
  return {
    setCase,setView,
    setTime(time){currentTime=time;render();},
    setSelection(start,end){selection.start=start;selection.end=end;render();},
    followTrain(id){selectedTrain=id;render();},
    resetView(){angle=.55;elevation=.86;zoom=1;cameraUpdate();render();},
    zoomBy(factor){zoom=Math.max(.7,Math.min(1.65,zoom*factor));cameraUpdate();render();},
    getMetrics(){return {mode,drawCalls:renderer?.info.render.calls??0,triangles:renderer?.info.render.triangles??0,pixelRatio:renderer?.getPixelRatio()??1};}
  };
}
