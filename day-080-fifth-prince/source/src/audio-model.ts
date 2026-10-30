import type { MapData } from './types';
export type Surface='grass'|'dirt'|'stone'|'wood';
export interface AudioPreferences {muted:boolean;music:number;effects:number}
export const AUDIO_KEY='fifth-prince.audio.v1';
export const DEFAULT_AUDIO:AudioPreferences={muted:false,music:70,effects:75};
export const db=(value:number)=>10**(value/20);
export const volumeGain=(value:number)=>(Math.max(0,Math.min(100,value))/100)**2;
export function parseAudioPreferences(raw:string|null):AudioPreferences{
 try{const d=JSON.parse(raw??'null');if(!d||typeof d.muted!=='boolean'||!['music','effects'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k])&&d[k]>=0&&d[k]<=100))return {...DEFAULT_AUDIO};return {muted:d.muted,music:d.music,effects:d.effects};}catch{return {...DEFAULT_AUDIO};}
}
export function surfaceAt(map:MapData,x:number,y:number):Surface{
 const tile=map.tiles[Math.floor(y/16)]?.[Math.floor(x/16)];
 return map.zone==='palace'||map.zone==='abyss'?'stone':tile===4?'wood':tile===1?'dirt':'grass';
}
export class FootstepClock {
 private distance=0;
 reset(){this.distance=0;}
 advance(distance:number):boolean{if(!Number.isFinite(distance)||distance<=0)return false;this.distance+=Math.min(distance,8);if(this.distance<23)return false;this.distance-=23;return true;}
}
// Short contact sounds with textured friction rather than a pitched UI beep.
export function footstepSamples(surface:Surface,variant:number,sampleRate=22050):Float32Array{
 const length=Math.round(sampleRate*(surface==='grass'?.20:surface==='wood'?.15:.13)),data=new Float32Array(length);
 let seed=(variant+1)*374761393,low=0,body=0;const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
 const cutoff={grass:.28,dirt:.12,stone:.52,wood:.09}[surface];const tone={grass:92,dirt:78,stone:168,wood:125}[surface]+variant*3;
 for(let i=0;i<length;i++){
  const t=i/sampleRate,progress=i/(length-1),n=noise();low+=cutoff*(n-low);body+=.035*(n-body);
  const attack=Math.min(1,t/.004),tail=(1-progress)**2,contact=Math.exp(-t*(surface==='wood'?38:52));
  const friction=surface==='stone'?n-low:low;
  const thud=Math.sin(2*Math.PI*t*tone)*contact;
  data[i]=attack*tail*(friction*(surface==='grass'?.67:.36)+thud*.28+body*.2);
 }
 let peak=0;for(const value of data)peak=Math.max(peak,Math.abs(value));const gain=.58/Math.max(peak,.01);for(let i=0;i<data.length;i++)data[i]*=gain;return data;
}
