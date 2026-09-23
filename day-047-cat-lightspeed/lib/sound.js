import {audioState} from './audio-state.js';
export const IMPACT_FILES=Object.freeze({light:'hit-light.mp3',wood:'hit-wood.mp3',heavy:'hit-heavy.mp3'});
export const MAX_IMPACT_VOICES=4;
export function impactSoundPlan(event,variation=0){
  // 重い音＝建物・大きな物・金属や岩の的（ごみ箱・ドローン・人工衛星・岩）、木の音＝木の的、それ以外は軽い音。
  const kind=event.type?.startsWith('building')||event.size>=1.4||['metal','rock'].includes(event.material)?'heavy':event.material==='wood'||['tree','pine','fence','cityFence','log','stump','crate'].includes(event.type)?'wood':'light';
  const speed=Math.max(0,event.speed||0),energy=Math.min(1,Math.log10(1+speed)/5);
  return {kind,file:IMPACT_FILES[kind],playbackRate:.96+energy*.08+(variation%5-2)*.015,volume:.35+energy*.2,delay:audioState(speed)==='delayed'?.75:0,silent:audioState(speed)==='silent'};
}
export function createSound(){
  let context,master,noiseBuffer,muted=false,silent=false,loading=null,buffers=[],impactBuffers={},variation=0,lastImpact=-Infinity,boomAt=-Infinity,voice=null,pendingImpacts=[];
  const groups=new Set();
  function retire(group){if(!groups.delete(group))return;for(const node of group.nodes){try{node.stop?.();}catch{}node.disconnect();}if(voice===group)voice=null;}
  function stop(){for(const g of [...groups])retire(g);lastImpact=-Infinity;boomAt=-Infinity;pendingImpacts=[];}
  function unlock(){
    try{if(!context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;context=new Audio();master=context.createGain();master.gain.value=.3;const compressor=context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=4;compressor.attack.value=.003;compressor.release.value=.1;master.connect(compressor);compressor.connect(context.destination);noiseBuffer=context.createBuffer(1,context.sampleRate,context.sampleRate);let seed=46;const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}}
      if(!muted)context.resume().catch(()=>{});
      if(!loading)loading=Promise.all(['meow-a.mp3','meow-b.mp3','meow-c.mp3',...Object.values(IMPACT_FILES)].map(async file=>{const response=await fetch(new URL(`../assets/sounds/${file}`,import.meta.url));if(!response.ok)throw Error('sound');return context.decodeAudioData(await response.arrayBuffer());})).then(result=>{buffers=result.slice(0,3);impactBuffers=Object.fromEntries(Object.keys(IMPACT_FILES).map((kind,i)=>[kind,result[i+3]]));}).catch(()=>{loading=null;});
      return loading;
    }catch{}
  }
  const available=()=>context?.state==='running'&&!muted&&!silent;
  function group(kind,duration,volume){const start=context.currentTime,gain=context.createGain();gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.003);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);gain.gain.linearRampToValueAtTime(0,start+duration+.005);gain.connect(master);const g={kind,nodes:[gain],gain,start,end:start+duration+.005};groups.add(g);return g;}
  function source(g,node){node.connect(g.gain);g.nodes.push(node);node.start(g.start);node.stop(g.end);node.onended=()=>{if(g.nodes.filter(n=>n.onended).every(n=>n===node||n.finished)){retire(g);}node.finished=true;};}
  function noise(g,cutoff,type='lowpass'){const n=context.createBufferSource(),filter=context.createBiquadFilter();n.buffer=noiseBuffer;filter.type=type;filter.frequency.value=cutoff;filter.Q.value=1.2;n.connect(filter);filter.connect(g.gain);g.nodes.push(n,filter);n.start(g.start);n.stop(g.end);n.onended=()=>{n.finished=true;if(g.nodes.filter(n=>n.onended).every(n=>n.finished))retire(g);};}
  function meow(plan){if(!available()||!buffers[plan.sample])return;if(voice)retire(voice);const sourceNode=context.createBufferSource();sourceNode.buffer=buffers[plan.sample];sourceNode.playbackRate.value=plan.playbackRate;voice=group('voice',sourceNode.buffer.duration/plan.playbackRate,plan.volume);source(voice,sourceNode);}
  function impact(events,time,speed=0){
    if(!available()||audioState(speed)==='silent'){pendingImpacts=[];return;}
    for(const event of events){const plan=impactSoundPlan({...event,speed:event.speed??speed},variation++);if(!plan.silent)pendingImpacts.push({event,plan,due:time+plan.delay});}
    pendingImpacts=pendingImpacts.slice(-32);
    if(time-boomAt<.12){pendingImpacts=pendingImpacts.filter(p=>p.due>time);return;}
    if(time-lastImpact<.1)return;
    const ready=pendingImpacts.filter(p=>p.due<=time);if(!ready.length)return;
    pendingImpacts=pendingImpacts.filter(p=>p.due>time);
    const {plan}=ready.reduce((a,b)=>a.plan.volume>=b.plan.volume?a:b),buffer=impactBuffers[plan.kind];if(!buffer)return;
    lastImpact=time;
    const active=[...groups].filter(g=>g.kind==='impact');if(active.length>=MAX_IMPACT_VOICES)retire(active[0]);
    const node=context.createBufferSource();node.buffer=buffer;node.playbackRate.value=plan.playbackRate;
    const duration=buffer.duration/plan.playbackRate,g=group('impact',duration,plan.volume);
    // Preserve the recording's transient and body; only fade its final 30ms.
    g.gain.gain.cancelScheduledValues(g.start);g.gain.gain.setValueAtTime(plan.volume,g.start);
    g.gain.gain.setValueAtTime(plan.volume,g.start+Math.max(0,duration-.03));g.gain.gain.linearRampToValueAtTime(0,g.start+duration);
    source(g,node);
  }
  function boom(time){boomAt=time;if(!available())return;for(const g of [...groups])if(g.kind==='impact'||g.kind==='boom')retire(g);const g=group('boom',.45,.35);noise(g,650);}
  return {unlock,meow,impact,boom,stop,durations:()=>buffers.length?buffers.map(b=>b.duration):[2.4,2.4,2.4],stats:()=>({loaded:buffers.length,impactLoaded:Object.keys(impactBuffers).length,pendingImpacts:pendingImpacts.length,voices:[...groups].filter(g=>g.kind==='voice').length,impacts:[...groups].filter(g=>g.kind==='impact').length}),setMute(value){muted=value;if(master)master.gain.value=muted||silent?0:.3;if(muted)stop();},setSilent(value){if(value&&!silent)stop();silent=value;if(master)master.gain.value=muted||silent?0:.3;}};
}
