// Adapted from this repository's Day026/048 local HTML + Playwright + ffmpeg workflow.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { DURATION, FPS, CAPTIONS } from './timeline.mjs';
import { writeMusic } from './promo-audio.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const preview=process.argv.includes('--preview');
const output=join(here,'promo.mp4');
const cache=resolve(here,'../cache/promo');
const gameCSS=`
  .site-header,.site-footer,.skip{display:none!important}
  .layout{padding:0 16px 60px;gap:0}.panel{padding:16px 4px 0}
  .exhibition,body[data-screen=question] .exhibition,body[data-screen=answer] .exhibition{height:310px}
  body[data-screen=question] .exhibition{height:265px}
  .exhibition-top{top:12px}.exhibition-bottom{bottom:12px}
  h2{font-size:25px}.question-description{margin:5px 0 12px;font-size:12px}
  .round-progress{margin:7px 0 10px}.choice{min-height:52px;padding:8px 12px}.choice-title{font-size:15px}.choice-artist{font-size:11px}
  .choices{gap:7px}.reveal-controls{margin-top:13px}.skip-question{display:none}
  .answer-top{padding-bottom:10px;margin-bottom:12px}.art-title{font-size:28px}
  .story-hook{font-size:23px;line-height:1.75}.story-section>p{font-size:17px;line-height:1.9}.story-section h3{font-size:14px}
  .story-section{margin-bottom:26px}.answer-year{font-size:12px}
  dialog{width:96vw;max-height:96vh;padding:22px}.collection-item img{height:133px}.collection-item h3{font-size:15px}.collection-item p{font-size:11px}
  .collection-grid{gap:22px 15px}.collection-intro{margin:12px 0}.collection-count{margin:10px 0 16px}
  *,*::before,*::after{animation:none!important;scroll-behavior:auto!important}
`;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent(new URL(req.url,'http://local').pathname);if(path.endsWith('/'))path+='index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root+sep)||path.includes('/cache/')){res.writeHead(404).end();return;}
    const body=await readFile(file);
    res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
await mkdir(cache,{recursive:true});
const temp=mkdtempSync(join(tmpdir(),'day050-promo-'));
let browser;
try{
  for(const [,caption] of CAPTIONS)if([...caption].length>16)throw new Error(`Caption longer than 16 characters: ${caption}`);
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:540,height:960},deviceScaleFactor:preview?1:2,locale:'ja-JP',timezoneId:'Asia/Tokyo'});
  const errors=[],external=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();external.push(url.host);return route.abort();});
  // Fix only the recording's random seed, without modifying product data or game logic.
  await context.addInitScript(()=>{const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=values=>values instanceof Uint32Array&&values.length===1?(values[0]=31,values):original(values);});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-27T03:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-27T03:00:01Z'));
  await page.goto(`${base}/tools/promo/promo.html`);
  const game=page.frames().find(f=>f.url()===`${base}/index.html`);if(!game)throw new Error('Missing app frame');
  const ready=async()=>{await game.locator('#art-loading').waitFor({state:'hidden'});if(await game.locator('#art-error').isVisible())throw new Error('Artwork failed');};
  await ready();await game.addStyleTag({content:gameCSS});
  await game.evaluate(()=>document.querySelector('#start-random').click());await ready();
  if(await game.locator('#gallery').getAttribute('data-artwork')!=='24645')throw new Error('Recording seed changed');
  await game.evaluate(()=>document.fonts.ready);await page.evaluate(()=>document.fonts.ready);
  await page.clock.runFor(1000);
  await game.evaluate(()=>document.querySelector('#reveal-more').click());await page.clock.runFor(100);
  let storyTarget=0,renoTarget=0;
  const proof=[];
  for(let frame=0;frame<DURATION*FPS;frame++){
    const t=frame/FPS;
    if(frame)await page.clock.runFor(frame%3===0?34:33);
    if(frame===2*FPS||frame===4*FPS)await game.evaluate(()=>document.querySelector('#reveal-more').click());
    if(frame===6*FPS){await game.evaluate(()=>document.querySelector('#choices button[data-id="24645"]').click());await ready();}
    if(frame===10*FPS)storyTarget=await game.locator('#story-hook').evaluate(el=>el.getBoundingClientRect().top+scrollY-30);
    if(frame===16*FPS){
      // Cut to the catalog: navigation happens outside recorded frames.
      await game.evaluate(()=>document.querySelector('#error-home').click());await ready();
      await game.evaluate(()=>document.querySelector('#collection-open').click());
      if(await game.locator('.collection-item').count()!==30)throw new Error('Expected thirty artworks');
    }
    if(frame===20*FPS)await game.locator('#collection-search').fill('ルノワール');
    if(frame===21*FPS){await game.locator('.collection-item').click();await ready();if(await game.locator('#gallery').getAttribute('data-artwork')!=='14655')throw new Error('Wrong Renoir painting');}
    if(frame===23*FPS)renoTarget=await game.locator('#story-hook').evaluate(el=>el.getBoundingClientRect().top+scrollY-24);
    const ease=x=>{const p=Math.max(0,Math.min(1,x));return p*p*(3-2*p);};
    const y=t>=23&&t<26?renoTarget*ease((t-23)/1.1):t>=10&&t<16?storyTarget*ease((t-10)/1.5):0;
    await game.evaluate(top=>window.scrollTo(0,top),y);
    if(t>=17&&t<20)await game.locator('#collection-dialog').evaluate((el,top)=>{el.scrollTop=top;},Math.min(550,(t-17)*200));
    await page.evaluate(seconds=>window.renderPromo(seconds),t);
    // Safe area, readable captions and actual state are verified on every scene cut.
    if(CAPTIONS.some(([start])=>frame===start*FPS)){
      const state=await game.evaluate(()=>({screen:document.body.dataset.screen,id:document.querySelector('#gallery').dataset.artwork}));
      const bounds=await page.locator('#caption').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:el.scrollWidth>el.clientWidth};});
      if(bounds.left<54||bounds.right>486||bounds.top<96||bounds.bottom>864||bounds.overflow)throw new Error(`Caption outside safe area at ${t}: ${JSON.stringify(bounds)}`);
      proof.push({t,...state,caption:await page.locator('#caption').textContent()});
    }
    if(!preview||frame%FPS===0)await page.screenshot({path:join(preview?cache:temp,`${String(frame).padStart(5,'0')}.png`)});
    if(frame%(FPS*5)===0)console.log(`撮影 ${t}/${DURATION}秒`);
  }
  if(errors.length||external.length)throw new Error(`Browser errors: ${errors.join('; ')}; external: ${external.length}`);
  await writeFile(join(cache,'scene-proof.json'),JSON.stringify(proof,null,2));
  await browser.close();browser=null;
  if(preview){console.log(`Preview frames: ${cache}`);}
  else{
    const wav=join(temp,'music.wav');writeMusic(wav);
    execFileSync('ffmpeg',['-y','-v','error','-framerate',String(FPS),'-i',join(temp,'%05d.png'),'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-af','loudnorm=I=-18:TP=-2:LRA=7','-c:a','aac','-b:a','192k','-ar','48000','-t',String(DURATION),'-map_metadata','-1','-movflags','+faststart',output],{stdio:'inherit'});
    execFileSync('ffmpeg',['-y','-v','error','-i',output,'-frames:v','1',join(here,'promo-first-frame.png')]);
    execFileSync('ffmpeg',['-y','-v','error','-i',output,'-t','18','-vf','scale=720:1280','-af','afade=t=out:st=17:d=1','-c:v','libx264','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-map_metadata','-1','-movflags','+faststart',join(root,'demo.mp4')]);
    execFileSync('ffmpeg',['-y','-v','error','-i',output,'-vf',`select=not(mod(n\\,${2*FPS})),scale=216:384,tile=5x3:padding=5:margin=5:color=0xe8eadf`,'-frames:v','1',join(here,'preview-contact.jpg')]);
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
    const v=info.streams.find(s=>s.codec_type==='video');if(v.width!==1080||v.height!==1920||!info.streams.some(s=>s.codec_type==='audio')||Math.abs(Number(info.format.duration)-DURATION)>.1)throw new Error('Video dimensions/audio/duration mismatch');
    console.log(`Saved: ${output} (${info.format.duration}s)`);
  }
}finally{
  if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
  // Keep intermediate frames in the task-specific temp directory for reproducible review.
  console.log(`Intermediate directory: ${temp}`);
}
