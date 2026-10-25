import { spawn,type ChildProcess } from 'node:child_process';
import { readdir,lstat,unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DocumentError } from '../documents/errors.js';
function groupExists(pid:number):boolean { try{process.kill(-pid,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error;} }
export async function stopProcess(child:ChildProcess):Promise<void>{
  const pid=child.pid;if(!pid)return;
  const send=(signal:NodeJS.Signals)=>{try{process.kill(-pid,signal);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}};
  send('SIGTERM');let until=Date.now()+2000;
  while(groupExists(pid)&&Date.now()<until)await delay(30);
  if(groupExists(pid)){send('SIGKILL');until=Date.now()+2000;while(groupExists(pid)&&Date.now()<until)await delay(30);}
  if(groupExists(pid))throw new DocumentError('UNAVAILABLE','変換処理の停止を確認できません。',true);
}
export async function cleanupOfficeIpc(root=tmpdir()):Promise<void>{
  const uid=process.getuid?.();
  if(uid===undefined)return;
  for(const name of await readdir(root)){
    if(!/^OSL_PIPE_\d+_SingleOfficeIPC_[a-f\d]+$/i.test(name))continue;
    const path=join(root,name),entry=await lstat(path);
    if(entry.isSocket()&&entry.uid===uid)await unlink(path);
  }
}
export function launchGotenberg(home:string):ChildProcess {
  return spawn(process.env.GOTENBERG_BIN||'gotenberg',[],{detached:true,stdio:'ignore',cwd:home,env:{...process.env,HOME:home,TMPDIR:home,API_BIND_IP:'127.0.0.1',API_PORT:'3000',API_TIMEOUT:'30s',API_START_TIMEOUT:'10s',API_BODY_LIMIT:'11MB',LIBREOFFICE_AUTO_START:'true',LIBREOFFICE_START_TIMEOUT:'15s',LIBREOFFICE_MAX_QUEUE_SIZE:'1',LIBREOFFICE_DENY_LIST:'.+',LIBREOFFICE_DENY_PRIVATE_IPS:'true',LIBREOFFICE_DENY_PUBLIC_IPS:'true',CHROMIUM_DISABLE_ROUTES:'true',CHROMIUM_AUTO_START:'false',PDFENGINES_DISABLE_ROUTES:'true',API_DISABLE_DOWNLOAD_FROM:'true',WEBHOOK_DISABLE:'true',GOTENBERG_GRACEFUL_SHUTDOWN_DURATION:'0s',LOG_LEVEL:'error',LOG_STD_FORMAT:'json',PROMETHEUS_DISABLE_COLLECT:'true',OTEL_SDK_DISABLED:'true'}});
}
