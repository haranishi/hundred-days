import {spawnSync,execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function masterAudio(out){
 const measured=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',join(out,'score.wav'),'-af','loudnorm=I=-16:TP=-2.2:LRA=9:print_format=json','-f','null','-'],{encoding:'utf8'});
 if(measured.status!==0)throw Error('Audio loudness analysis failed');
 const start=measured.stderr.lastIndexOf('{'),end=measured.stderr.lastIndexOf('}');
 if(start<0||end<start)throw Error('Loudness measurement is missing');
 const stats=JSON.parse(measured.stderr.slice(start,end+1));
 for(const name of ['input_i','input_lra','input_tp','input_thresh','target_offset'])if(!Number.isFinite(Number(stats[name])))throw Error('Invalid loudness metric: '+name);
 writeFileSync(join(out,'master-audio.json'),JSON.stringify(stats,null,2)+'\n');
 const normalization=`loudnorm=I=-16:TP=-2.2:LRA=9:measured_I=${stats.input_i}:measured_LRA=${stats.input_lra}:measured_TP=${stats.input_tp}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',join(out,'_silent.mp4'),'-i',join(out,'score.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-af',normalization,'-t','36','-map_metadata','-1','-movflags','+faststart',join(out,'Day068_timetable_alibi_promo.mp4')],{stdio:'inherit'});
 console.log('Final audio mastered and muxed');
}
