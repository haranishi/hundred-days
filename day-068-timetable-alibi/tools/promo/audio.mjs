import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const SR=48000,SECONDS=36,N=SR*SECONDS,TAU=2*Math.PI,BEAT=.6;
const L=new Float64Array(N),R=new Float64Array(N);
const dryL=new Float64Array(N),dryR=new Float64Array(N);
let seed=0x68ca2347;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
const noise=()=>random()*2-1;
const freq=m=>440*2**((m-69)/12);
const clamp=n=>Math.max(0,Math.min(1,n));
const edge=(t,len,a=.02,r=.1)=>Math.sin(clamp(t/a)*Math.PI/2)*Math.sin(clamp((len-t)/r)*Math.PI/2);
function voice(at,len,fn,gain=.1,pan=0,wet=false){
 const a=Math.max(0,Math.floor(at*SR)),b=Math.min(N,Math.ceil((at+len)*SR));
 const gl=Math.cos((pan+1)*Math.PI/4)*gain,gr=Math.sin((pan+1)*Math.PI/4)*gain;
 const left=wet?dryL:L,right=wet?dryR:R;
 for(let i=a;i<b;i++){const s=fn(i/SR-at);left[i]+=s*gl;right[i]+=s*gr;}
}
function pad(at,len,midi,gain,pan=0){
 const f=freq(midi),phase=random()*TAU;
 voice(at,len,t=>{
  const s=Math.sin(TAU*f*t+phase)*.65+Math.sin(TAU*f*1.003*t+phase)*.25+Math.sin(TAU*f*2*t)*.1;
  return s*edge(t,len,.55,.8);
 },gain,pan,true);
}
function piano(at,midi,gain=.15,len=1.5,pan=0){
 const f=freq(midi);
 voice(at,len,t=>{
  const c=TAU*f*t,attack=1-Math.exp(-t/0.003);
  return (Math.sin(c+.8*Math.sin(c*2)*Math.exp(-t/.08))*.8+Math.sin(c*2)*Math.exp(-t/.24)*.16+Math.sin(c*3)*Math.exp(-t/.06)*.04)*Math.exp(-t/.55)*attack*edge(t,len,.003,.15);
 },gain,pan,true);
}
function bass(at,midi,len=.4,gain=.18){
 const f=freq(midi);
 voice(at,len,t=>(Math.sin(TAU*f*t)+.18*Math.sin(TAU*f*2*t))*Math.exp(-t/len*2.5)*edge(t,len,.008,.06),gain);
}
function kick(at,gain=.3){
 voice(at,.65,t=>Math.sin(TAU*(43*t+57*.028*(1-Math.exp(-t/.028))))*Math.exp(-t*10)*edge(t,.65,.002,.06),gain);
}
function tick(at,gain=.045,pan=0){
 voice(at,.065,t=>(noise()*.55+Math.sin(TAU*1800*t)*.45)*Math.exp(-t*95)*edge(t,.065,.0008,.01),gain,pan);
}
function rim(at,gain=.07){
 voice(at,.15,t=>(Math.sin(TAU*950*t)*.5+Math.sin(TAU*1480*t)*.2+noise()*.3)*Math.exp(-t*37)*edge(t,.15,.002,.025),gain,.12);
}
function whoosh(at,len,gain=.09){
 let lp=0;
 voice(at,len,t=>{
  const p=t/len,cut=.01+.65*p;
  lp+=cut*(noise()-lp);
  return lp*Math.sin(Math.PI*p)**2;
 },gain,-.05);
}
function impact(at,gain=.24){
 kick(at,gain);
 voice(at,.85,t=>(noise()*.2+Math.sin(TAU*(110*t-5*t*t))*.65)*Math.exp(-t*8)*edge(t,.85,.003,.1),gain,0,true);
}

// Original D-minor score, 100 BPM. Sections follow the 8-scene edit.
const chords=[
 [50,57,62,65],[46,53,58,62],[43,50,58,62],[45,52,57,61],
 [50,57,62,65],[46,53,58,62],[43,50,58,62],[45,52,57,61],
 [50,57,62,65],[46,53,58,62],[43,50,58,62],[45,52,57,61],
 [45,52,57,61],[50,57,62,65],[50,57,62,65]
];
for(let bar=0;bar<15;bar++){
 const at=bar*2.4,chord=chords[bar],quiet=bar<4||bar===8||bar===12;
 for(let j=0;j<4;j++)pad(at,3.15,chord[j],quiet?.041:.052,(j-1.5)*.45);
 if(bar>=4&&bar<12&&bar!==8){
  for(let beat=0;beat<4;beat++){
   bass(at+beat*BEAT,chord[0]-12,.42,.2);
   if(beat%2===0)kick(at+beat*BEAT,.23);
   if(beat%2===1)rim(at+beat*BEAT,.08);
   tick(at+beat*BEAT+.3,.022,beat%2===0?-.55:.55);
  }
 }
 const count=bar>=4&&bar<12?8:4;
 for(let j=0;j<count;j++){
  const t=at+j*2.4/count;
  if(t>=28.8&&t<31.2)continue;
  piano(t,chord[[2,1,3,2,1,2,3,1][j%8]]+12,quiet?.065:.105,1.2,(j%3-1)*.4);
 }
}
// A restrained two-bar motif; no imported song or sample.
const melody=[74,77,76,72,70,74,72,69];
for(let i=0;i<melody.length;i++)piano(14.4+i*.6,melody[i],.12,1.65,Math.sin(i)*.35);
for(let i=0;i<melody.length;i++)piano(24+i*.6,melody[(i+2)%melody.length],.1,1.3,Math.cos(i)*.3);
// Clock, rain and scene accents.
for(let beat=0;beat<52;beat++)tick(beat*.6,beat<8?.065:beat>=48?.075:.03,beat%2===0?-.3:.3);
let rainLP=0;
voice(0,36,t=>{rainLP+=.06*(noise()-rainLP);return rainLP*edge(t,36,.5,1.8);},.025,0);
for(const at of [4.8,9.6,14.4,19.2,24,28.8,31.2]){
 whoosh(at-.65,.65,at===31.2?.16:.105);
 if(at!==28.8)impact(at,at===31.2?.3:.16);
}
for(const at of [10.8,20.467,22,24.8,26.5])tick(at,.11,-.08);
// Transmission drops before the next scene; a short descending call tone.
voice(8.65,.4,t=>(Math.sin(TAU*430*t)+Math.sin(TAU*350*t))*.5*edge(t,.4,.02,.12),.05,0);
// Closing chord and two soft rail clacks at the ticket join.
for(const m of [50,57,62,65,69,74])piano(31.2,m,m<60?.14:.095,4.5,(m%4-1.5)*.35);
for(const at of [32.4,32.5])rim(at,.06);
// Stereo room taps for the musical voices only.
for(let i=0;i<N;i++){
 L[i]+=dryL[i];R[i]+=dryR[i];
 for(const [delay,g] of [[.113,.18],[.271,.12],[.433,.08],[.617,.045]]){
  const j=i-Math.round(delay*SR);
  if(j>=0){L[i]+=dryR[j]*g;R[i]+=dryL[j]*g;}
 }
 const fade=clamp((36-i/SR)/1.25);
 L[i]*=fade;R[i]*=fade;
}
let peak=0;for(let i=0;i<N;i++)peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));
const gain=.78/Math.max(.78,peak),buf=Buffer.alloc(44+N*4);
buf.write('RIFF');buf.writeUInt32LE(36+N*4,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(2,22);buf.writeUInt32LE(SR,24);buf.writeUInt32LE(SR*4,28);buf.writeUInt16LE(4,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(N*4,40);
for(let i=0;i<N;i++){buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,L[i]*gain))*32767),44+i*4);buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,R[i]*gain))*32767),46+i*4);}
mkdirSync(join(here,'output'),{recursive:true});
writeFileSync(join(here,'output/score.wav'),buf);
writeFileSync(join(here,'output/audio-source.json'),JSON.stringify({seconds:36,sampleRate:SR,channels:2,bpm:100,key:'D minor',source:'Original deterministic synthesis; no samples',seed:'68ca2347',rawPeak:peak,normalizationGain:gain,sceneCues:[0,4.8,9.6,14.4,19.2,24,28.8,31.2],actionCues:[10.8,20.467,22,24.8,26.5]},null,2)+'\n');
console.log('Original score: 36s, 48kHz stereo');
