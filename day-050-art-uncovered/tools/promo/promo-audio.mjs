// Original synthesized score: gentle plucked chords, no recordings or external audio.
import { writeFileSync } from 'node:fs';
import { DURATION } from './timeline.mjs';
export function writeMusic(path) {
  const rate=48000, length=rate*DURATION, left=new Float32Array(length),right=new Float32Array(length);
  const chords=[[53,60,65,69],[50,57,62,65],[58,65,69,72],[48,55,64,67],[53,60,65,69]];
  const note=(start,midi,seconds,gain,pan)=>{
    const hz=440*2**((midi-69)/12),offset=Math.round(start*rate);
    for(let i=0;i<seconds*rate&&offset+i<length;i++){
      const t=i/rate,attack=Math.min(1,t/.004),tail=Math.min(1,(seconds-t)/.15);
      const tone=Math.sin(2*Math.PI*hz*t)+.25*Math.sin(2*Math.PI*hz*2*t)*Math.exp(-t*3)+.09*Math.sin(2*Math.PI*hz*3*t)*Math.exp(-t*7);
      const sample=tone*attack*tail*Math.exp(-t*1.8)*gain;
      left[offset+i]+=sample*(1-pan)*.7;right[offset+i]+=sample*(1+pan)*.7;
    }
  };
  for(let beat=0;beat<60;beat++){
    const c=chords[Math.min(4,Math.floor(beat/12))],t=beat*.5;
    note(t,c[[0,2,1,3,2,1][beat%6]]+(beat%12>=6?12:0),2.6,.19,beat%2?.22:-.22);
    if(beat%6===0)note(t,c[0]-12,2.8,.13,0);
  }
  // A short room reflection and a slow final release.
  for(let i=length-1;i>=0;i--){const delay=Math.round(.17*rate);if(i>=delay){left[i]+=.15*right[i-delay];right[i]+=.15*left[i-delay];}const fade=Math.min(1,(length-i)/(rate*1.2));left[i]*=fade;right[i]*=fade;}
  const pcm=Buffer.alloc(length*4),header=Buffer.alloc(44);
  for(let i=0;i<length;i++){pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),i*4);pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]))*32767),i*4+2);}
  header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  writeFileSync(path,Buffer.concat([header,pcm]));
}
