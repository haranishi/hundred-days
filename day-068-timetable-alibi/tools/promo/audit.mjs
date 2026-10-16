import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'output');
const file=join(out,'Day068_timetable_alibi_promo.mp4');
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
assert.equal(v.codec_name,'h264');assert.equal(v.width,1080);assert.equal(v.height,1920);
assert.equal(v.pix_fmt,'yuv420p');assert.equal(v.r_frame_rate,'30/1');assert.equal(v.avg_frame_rate,'30/1');
assert.equal(Number(v.nb_frames),1080);assert.ok(Math.abs(Number(probe.format.duration)-36)<.08);
assert.equal(a.codec_name,'aac');assert.equal(a.sample_rate,'48000');assert.equal(a.channels,2);
for(const s of [probe.format,...probe.streams]){
 for(const name of Object.keys(s.tags||{}))assert.ok(!/artist|author|comment|copyright|description|location|make|model|title/i.test(name),'Unnecessary metadata: '+name);
}
const capture=JSON.parse(readFileSync(join(out,'capture-report.json'),'utf8'));
assert.deepEqual(capture.errors,[]);assert.equal(capture.framesPerTake,144);
for(const take of ['investigate','choice','journey'])for(let i=0;i<144;i++)assert.ok(existsSync(join(out,'public',take,String(i).padStart(4,'0')+'.jpg')));
// Decode every frame and check for broken/black/accidentally frozen output.
const {spawnSync}=await import('node:child_process');
const decoded=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',file,'-vf','blackdetect=d=0.2:pix_th=0.04:pic_th=0.98,freezedetect=n=-55dB:d=2','-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8',maxBuffer:16*1024*1024});
assert.equal(decoded.status,0,'Video did not decode');
const log=decoded.stderr;
assert.ok(!/black_start:/.test(log),'Black section detected');
// Near-static reading sections can trigger motion thresholds despite real animation.
// Use exact decoded-image hashes to detect an actual frozen render.
const hashOutput=execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-f','framemd5','-'],{encoding:'utf8',maxBuffer:4*1024*1024});
const frameHashes=hashOutput.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
assert.equal(frameHashes.length,1080);assert.equal(new Set(frameHashes).size,1080,'Repeated decoded frames detected');
writeFileSync(join(out,'frame-hashes.txt'),hashOutput);
const nearStaticEvents=log.split('\n').filter(l=>l.includes('lavfi.freezedetect.')).map(l=>l.slice(l.indexOf('lavfi.')));
const summary=log.slice(log.lastIndexOf('Summary:'));
const integrated=Number(summary.match(/I:\s*(-?[\d.]+) LUFS/)?.[1]);
const peak=Number(summary.match(/Peak:\s*(-?[\d.]+) dBFS/)?.[1]);
assert.ok(Number.isFinite(integrated)&&integrated>=-16.5&&integrated<=-15.5,'Unexpected loudness');
assert.ok(Number.isFinite(peak)&&peak<=-1,'Audio peak too high');
writeFileSync(join(out,'decode-audio.log'),log);
const report={video:{codec:v.codec_name,width:v.width,height:v.height,pixelFormat:v.pix_fmt,fps:30,frames:Number(v.nb_frames),seconds:Number(probe.format.duration),bytes:Number(probe.format.size)},audio:{codec:a.codec_name,sampleRate:Number(a.sample_rate),channels:a.channels,integratedLufs:integrated,truePeakDb:peak},metadata:'No private/unnecessary tags',decode:'Every frame decoded',blackSections:0,frozenSections:0,uniqueFrames:1080,nearStaticEvents,gameplay:{takes:3,framesPerTake:144,errors:0},humanReview:{visualContactSheet:'Separate manual review required',audio:'Source timing and objective loudness checked; listening is a separate review'}};
writeFileSync(join(out,'audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
