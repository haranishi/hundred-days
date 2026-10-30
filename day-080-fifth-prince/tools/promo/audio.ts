import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {footstepSamples} from '../../source/src/audio-model';
const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'output'),assets=join(here,'../../source/public/assets');
mkdirSync(out,{recursive:true});
const RATE=48000,SECONDS=36;
const decode=(file:string,seconds?:number,offset=0)=>{
 const args=['-v','error',...(seconds?['-stream_loop','-1']:[]),'-ss',String(offset),'-i',file,...(seconds?['-t',String(seconds)]:[]),'-ac','2','-ar',String(RATE),'-f','f32le','pipe:1'];
 const b=execFileSync('ffmpeg',args,{maxBuffer:64*1024*1024});return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
};
const music=decode(join(assets,'music/battle.ogg'),SECONDS,2),mix=new Float32Array(RATE*SECONDS*2);
for(let i=0;i<mix.length;i++){const sec=i/(RATE*2),gain=sec<3.6?.62:sec<9.6?.42:sec<15.6?.47:sec<21.6?.30:sec<30?.62:.50;mix[i]=music[i%music.length]*gain*Math.min(1,(36-sec)/.8);}
function effect(name:string,at:number,gain=.6){const clip=decode(join(assets,`sfx/${name}.wav`)),start=Math.round(at*RATE)*2;for(let i=0;i<clip.length&&start+i<mix.length;i++)mix[start+i]+=clip[i]*gain;}
function foot(at:number,variant:number){const clip=footstepSamples('dirt',variant),start=Math.round(at*RATE)*2,count=Math.floor(clip.length/22050*RATE);for(let i=0;i<count&&start+i*2+1<mix.length;i++){const pos=i/RATE*22050,a=Math.floor(pos),v=(clip[a]??0)*(1-(pos-a))+(clip[a+1]??0)*(pos-a);mix[start+i*2]+=v*.7;mix[start+i*2+1]+=v*.7;}}
const captured=JSON.parse(readFileSync(join(out,'capture-report.json'),'utf8'));
for(const event of captured.events){if(!event.result?.command)continue;const at=(event.take==='battle'?21.6:0)+event.frame/30;const c=event.result.command;if(c==='attack'){effect('slash',at,.58);effect('hit',at+.16,.50);}else if(c==='guard')effect('shield',at+.04,.30);else if(c==='support')effect('magic',at+.08,.32);}
effect('coin',7.1,.54);effect('confirm',18.77,.24);
for(let t=9.8,n=0;t<14.9;t+=.31,n++)foot(t,n%4);
effect('level',31.1,.24);
const raw=join(out,'score.f32');writeFileSync(raw,Buffer.from(mix.buffer));
execFileSync('ffmpeg',['-v','error','-y','-f','f32le','-ar',String(RATE),'-ac','2','-i',raw,'-af','loudnorm=I=-16:TP=-1.5:LRA=8','-ar',String(RATE),join(out,'score.wav')]);
writeFileSync(join(out,'audio-report.json'),JSON.stringify({duration:36,sampleRate:RATE,channels:2,music:'CC0 Ninja Adventure battle.ogg',effects:'same licensed game clips; footstepSamples from the game model',master:'loudnorm I=-16 TP=-1.5 LRA=8'},null,2)+'\n');
console.log('36-second score created from game music, effects and footsteps.');
