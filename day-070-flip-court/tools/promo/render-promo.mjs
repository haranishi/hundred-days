import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { openGame } from './capture-game.mjs';
import { FPS, DURATION, SCENES, installStage } from './stage.mjs';
import { writeAudio } from './promo-audio.mjs';

const here = fileURLToPath(new URL('./', import.meta.url));
const app = fileURLToPath(new URL('../../', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = join(here, 'output');
const core = ['app.js','app.css','index.html','lib/config.js','lib/rules.js','lib/match.js','lib/view.js','shared/share.js','shared/share.css','tests/index.js','tests/rules.test.mjs','tests/match.test.mjs','tests/preview.test.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(core.map(async path => [path, createHash('sha256').update(await readFile(join(app,path))).digest('hex')])));
const run = (command,args) => execFileSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024});
const offset = ms => ms < 16000 ? 0 : (Math.floor(ms/7500)%3-1)*35;
const work = await mkdtemp(join(tmpdir(),'flip-court-promo-'));
await mkdir(output,{recursive:true});
const baseline = await hashes();
let game, stageBrowser, encoder;
try {
  game = await openGame();
  // Separate Chromium instances keep the game page visible while drawing the editorial stage.
  stageBrowser = await chromium.launch({headless:true});
  const stage = await stageBrowser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1,locale:'ja-JP'});
  await installStage(stage);
  const silent = join(work,'picture.mp4');
  encoder = spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-vcodec','mjpeg','-i','pipe:0','-an','-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r',String(FPS),'-fps_mode','cfr','-map_metadata','-1',silent],{stdio:['pipe','ignore','pipe']});
  let encoderError=''; encoder.stderr.on('data',chunk=>{encoderError+=chunk;});
  const encoderDone=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('exit',code=>code===0?resolve():reject(new Error(`Picture encoding failed (${code}): ${encoderError}`)));});
  // Attach a handler immediately; a broken encoder must not become an unhandled rejection.
  encoderDone.catch(()=>{});
  const records=[], cues=[], sceneProof=[], frameStats={count:0,minGameJpegBytes:Infinity,minStageJpegBytes:Infinity};
  let previousFeedback='', previousReturns=0, previousScene=-1, finalState;
  for(let frame=0;frame<FPS*DURATION;frame++) {
    const time=frame/FPS;
    const target = time < 22.1 ? Math.round(time*1000) : Math.min(60050,Math.round(58400+(time-22.1)*1000));
    const cut = frame===663;
    while(target-game.stats().sourceMs>0) {
      const delta=Math.min(50,target-game.stats().sourceMs);
      finalState=await game.advance(delta,offset(game.stats().sourceMs));
    }
    finalState=await game.state();
    if(!['playing','result'].includes(finalState.phase))throw new Error(`Unusable recorded phase: ${finalState.phase}`);
    if(cut) { previousFeedback=finalState.feedback; previousReturns=game.stats().returns; }
    const sceneIndex=SCENES.findIndex(scene=>time>=scene.start&&time<scene.end);
    if(finalState.feedback!==previousFeedback||sceneIndex!==previousScene||cut) {
      records.push({frame,time,sourceMs:Math.round(game.stats().sourceMs),scene:sceneIndex,edit:cut?'cut to final seconds':undefined,...finalState});
      const landing=finalState.feedback.match(/着地・(\d+)マス反転/);
      if(finalState.feedback!==previousFeedback&&landing)cues.push({type:'landing',time,flips:Number(landing[1])});
      previousFeedback=finalState.feedback;
    }
    if(game.stats().returns>previousReturns) cues.push({type:'return',time,pan:0});
    previousReturns=game.stats().returns;
    const gameJpeg=await game.shot();
    const rendered=await stage.evaluate(async({time,screenshot})=>window.drawPromo(time,screenshot),{time,screenshot:gameJpeg.toString('base64')});
    if(sceneIndex!==previousScene)sceneProof.push({frame,time,scene:sceneIndex,textBounds:rendered.textBounds,game:finalState});
    previousScene=sceneIndex;
    const picture=Buffer.from(rendered.jpeg,'base64');
    frameStats.count++; frameStats.minGameJpegBytes=Math.min(frameStats.minGameJpegBytes,gameJpeg.length); frameStats.minStageJpegBytes=Math.min(frameStats.minStageJpegBytes,picture.length);
    if(!encoder.stdin.write(picture))await once(encoder.stdin,'drain');
    if(frame%90===0)console.log(JSON.stringify({renderFrame:frame,of:900,scene:sceneIndex,sourceMs:Math.round(game.stats().sourceMs),phase:finalState.phase}));
  }
  encoder.stdin.end(); await encoderDone;
  if(finalState.phase!=='result'||finalState.resultPlayer!==finalState.player||finalState.resultCpu!==finalState.cpu)throw new Error('Actual result does not match its scoreboard');
  if(game.errors.length)throw new Error(`Game browser errors: ${game.errors.join('; ')}`);
  const wav=join(work,'original-score.wav');
  const audio=await writeAudio(wav,cues);
  // ffmpeg writes loudnorm JSON on stderr, so use a captured subprocess for that measurement.
  const {spawnSync}=await import('node:child_process');
  const measured=spawnSync('ffmpeg',['-hide_banner','-i',wav,'-af','loudnorm=I=-17:TP=-2:LRA=9:print_format=json','-f','null','-'],{encoding:'utf8'});
  if(measured.status!==0)throw new Error('Audio first-pass measurement failed');
  const loudness=JSON.parse(measured.stderr.match(/\{[\s\S]*?\}/g).at(-1));
  const filter=`loudnorm=I=-17:TP=-2:LRA=9:measured_I=${loudness.input_i}:measured_TP=${loudness.input_tp}:measured_LRA=${loudness.input_lra}:measured_thresh=${loudness.input_thresh}:offset=${loudness.target_offset}:linear=true`;
  const master=join(output,'Day070_flip_court_promo.mp4');
  run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-af',filter,'-t','30','-map_metadata','-1','-metadata','encoder=','-movflags','+faststart',master]);
  const after=await hashes();
  if(JSON.stringify(baseline)!==JSON.stringify(after))throw new Error('Game source changed during filming');
  await writeFile(join(output,'capture-evidence.json'),JSON.stringify({task:9,format:{width:1080,height:1920,fps:FPS,seconds:DURATION},method:'Unmodified app; fixed Math.random=.7 and Playwright clock; Canvas-pixel observation with native mouse drag; app DOM and Canvas screenshots; intermediate match interval cut at output 22.1s; source continues normally to its sixty-second result. This is filming, not real-time experience evaluation.',sourceStats:game.stats(),captureBounds:game.bounds,gameHashes:after,frameStats,sceneProof,records,audio,cues,finalState},null,2));
  console.log(`Rendered ${relative(root,master)} with ${frameStats.count} frames.`);
} finally {
  encoder?.stdin?.destroy(); if(encoder?.exitCode===null)encoder.kill('SIGTERM');
  await stageBrowser?.close(); await game?.close();
  await rm(work,{recursive:true,force:true});
}
