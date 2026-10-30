import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill,openBrowser} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'output');
const chrome=process.env.CHROME_PATH||join('/','Applications','Google Chrome.app','Contents','MacOS','Google Chrome');
if(!existsSync(chrome))throw Error('Set CHROME_PATH to installed Chrome');
for(const file of ['public/footage/hook/0000.jpg','public/footage/outro/0179.jpg','score.wav'])if(!existsSync(join(out,file)))throw Error('Run capture and audio first: '+file);
mkdirSync(join(out,'stills'),{recursive:true});
const serveUrl=await bundle({entryPoint:join(here,'index.jsx'),outDir:join(out,'bundle'),publicDir:join(out,'public'),enableCaching:true});
const browser=await openBrowser('chrome',{browserExecutable:chrome,logLevel:'error'});
try{
 const options={serveUrl,id:'Day80-Promo',browserExecutable:chrome,puppeteerInstance:browser,logLevel:'error'},composition=await selectComposition(options);
 if(process.argv.includes('--stills')){
  const frames=[0,55,107,130,220,300,400,500,590,700,800,925,1010,1079];
  for(const frame of frames){await renderStill({...options,composition,frame,imageFormat:'png',output:join(out,'stills',String(frame).padStart(4,'0')+'.png')});console.log('Still',frame);}
  writeFileSync(join(out,'stills/frames.json'),JSON.stringify(frames)+'\n');
 }else{
  let last=-1;await renderMedia({...options,composition,codec:'h264',outputLocation:join(out,'_silent.mp4'),crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',x264Preset:'medium',concurrency:3,muted:true,onProgress:p=>{const n=Math.floor(p.progress*10);if(n!==last){last=n;console.log('Render',n*10+'%');}}});
  execFileSync('ffmpeg',['-v','error','-y','-i',join(out,'_silent.mp4'),'-i',join(out,'score.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t','36','-map_metadata','-1','-movflags','+faststart',join(out,'Day080_fifth_prince_promo.mp4')]);
  console.log('Completed Day080_fifth_prince_promo.mp4');
 }
}finally{await browser.close({silent:true});}
