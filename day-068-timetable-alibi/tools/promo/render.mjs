import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill,openBrowser} from '@remotion/renderer';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {masterAudio} from './master-audio.mjs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'output');
const chromium=process.env.CHROME_PATH||join('/','Applications','Google Chrome.app','Contents','MacOS','Google Chrome');
if(!existsSync(chromium))throw Error('Set CHROME_PATH to an installed Chrome executable');
for(const name of ['score.wav','public/investigate/0143.jpg','public/choice/0143.jpg','public/journey/0143.jpg'])if(!existsSync(join(out,name)))throw Error('Run capture and audio first: '+name);
if(process.argv.includes('--reuse-video')){masterAudio(out);process.exit(0);}
mkdirSync(join(out,'stills'),{recursive:true});
const serveUrl=await bundle({entryPoint:join(here,'index.jsx'),outDir:join(out,'bundle'),publicDir:join(out,'public'),enableCaching:true,onProgress:p=>{if(p===100)console.log('Bundle ready');}});
const browser=await openBrowser('chrome',{browserExecutable:chromium,logLevel:'error'});
try{
 const options={serveUrl,id:'Day68-Promo',browserExecutable:chromium,puppeteerInstance:browser,logLevel:'error'};
 const composition=await selectComposition(options);
 if(process.argv.includes('--stills')){
  const frames=[0,60,135,204,280,330,403,510,566,630,710,748,824,903,993,1079];
  for(const frame of frames){
   await renderStill({...options,composition,frame,imageFormat:'png',output:join(out,'stills',`${String(frame).padStart(4,'0')}.png`)});
   console.log('Still',frame,(frame/30).toFixed(1)+'s');
  }
  writeFileSync(join(out,'stills/frames.json'),JSON.stringify(frames)+'\n');
 }else{
  let last=-1;
  await renderMedia({...options,composition,codec:'h264',outputLocation:join(out,'_silent.mp4'),crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',x264Preset:'medium',concurrency:3,muted:true,onProgress:p=>{const now=Math.floor(p.progress*10);if(now!==last){last=now;console.log('Render',now*10+'%');}}});
  masterAudio(out);
  console.log('Completed',join(out,'Day068_timetable_alibi_promo.mp4'));
 }
}finally{await browser.close({silent:true});}
