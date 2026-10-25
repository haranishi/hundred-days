import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import type { ErrorCode } from '../../src/shared/contracts.js';
import { abortError,checkAbort,DocumentError } from './errors.js';
import { isOfficeKind, type OfficeKind } from './formats.js';
export async function validateDocx(path:string,signal:AbortSignal,expected?:OfficeKind):Promise<OfficeKind>{
  checkAbort(signal);
  const compiled=new URL('./preflight.worker.js',import.meta.url),source=new URL('./preflight.worker.ts',import.meta.url);
  const worker=new Worker(existsSync(compiled)?compiled:source,{workerData:{path,expected},resourceLimits:{maxOldGenerationSizeMb:192},execArgv:existsSync(compiled)?[]:['--import','tsx']});
  try{return await new Promise<OfficeKind>((resolve,reject)=>{
    const abort=()=>reject(abortError(signal));signal.addEventListener('abort',abort,{once:true});
    const settle=(error?:unknown,kind?:OfficeKind)=>{signal.removeEventListener('abort',abort);error?reject(error):kind?resolve(kind):reject(new DocumentError('INVALID_FILE','文書形式を確認できません。'));};
    worker.once('message',(message:{ok:boolean;kind?:unknown;code?:ErrorCode;message?:string})=>settle(message.ok&&isOfficeKind(message.kind)?undefined:new DocumentError(message.code||'INVALID_FILE',message.message||'文書を読み取れません。'),isOfficeKind(message.kind)?message.kind:undefined));
    worker.once('error',()=>settle(new DocumentError('INVALID_FILE','文書を安全に読み取れませんでした。')));
    worker.once('exit',code=>{if(code!==0)settle(new DocumentError('INVALID_FILE','文書の検証を完了できませんでした。'));});
    if(signal.aborted)abort();
  });}finally{await worker.terminate();}
}
