import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { LIMITS } from '../../src/shared/limits.js';
import { DocumentError,errorBody,errorStatus,checkAbort } from '../documents/errors.js';
import { readLimitedBody } from '../documents/engineClient.js';
import { launchGotenberg,stopProcess,cleanupOfficeIpc } from './process.js';
import { OFFICE_FORMATS, isOfficeKind, type OfficeKind } from '../documents/formats.js';
const runFile=promisify(execFile),workRoot=resolve(process.env.ENGINE_WORK_ROOT||'/tmp/henkan-engine');
await rm(workRoot,{recursive:true,force:true});await cleanupOfficeIpc();await mkdir(workRoot,{recursive:true,mode:0o700});
let current:{id:string;controller:AbortController;promise:Promise<Buffer>}|undefined;
let unhealthy=false;
const app=Fastify({logger:false,genReqId:()=>randomUUID(),bodyLimit:LIMITS.docxFileBytes,requestTimeout:65000,connectionTimeout:65000});
app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:LIMITS.docxFileBytes},(_request,body,done)=>done(null,body));
app.addHook('onSend',async(_request,reply,payload)=>{reply.header('cache-control','no-store').header('x-content-type-options','nosniff');return payload;});
async function runJob(input:Buffer,signal:AbortSignal,kind:OfficeKind):Promise<Buffer>{
  const directory=await mkdtemp(join(workRoot,'generation-'));const child=launchGotenberg(directory);let spawnError=false;
  child.once('error',()=>{spawnError=true;});
  try{
    while(true){checkAbort(signal);if(spawnError||child.exitCode!==null)throw new DocumentError('UNAVAILABLE','変換エンジンを起動できません。',true);try{const health=await fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.any([signal,AbortSignal.timeout(500)])});await health.body?.cancel();if(health.ok)break;}catch{/* wait for local engine */}await delay(75,undefined,{signal});}
    const form=new FormData();form.append('files',new Blob([new Uint8Array(input)],{type:OFFICE_FORMATS[kind].mime}),`input.${kind}`);
    const response=await fetch('http://127.0.0.1:3000/forms/libreoffice/convert',{method:'POST',body:form,signal});
    if(!response.ok){await response.body?.cancel();throw new DocumentError(response.status===503?'UNAVAILABLE':'INVALID_FILE','Office文書をPDFに変換できませんでした。',response.status===503);}
    if(!response.headers.get('content-type')?.startsWith('application/pdf'))throw new DocumentError('INVALID_FILE','変換結果がPDFではありません。');
    const pdf=await readLimitedBody(response,LIMITS.pdfBytes,signal);if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-')))throw new DocumentError('INVALID_FILE','変換結果の形式が不正です。');
    const pdfPath=join(directory,'output.pdf');await writeFile(pdfPath,pdf,{mode:0o600});
    try{await runFile('qpdf',['--check',pdfPath],{signal,maxBuffer:65536,timeout:Math.max(1,Math.min(5000,LIMITS.engineTimeoutMs))});}catch{throw new DocumentError('INVALID_FILE','完成したPDFを確認できません。文書を保存し直してください。');}
    checkAbort(signal);return await readFile(pdfPath);
  }finally{
    try{await stopProcess(child);await cleanupOfficeIpc();await rm(directory,{recursive:true,force:true,maxRetries:2,retryDelay:50});}
    catch{unhealthy=true;setTimeout(()=>process.exit(1),100).unref();throw new DocumentError('UNAVAILABLE','変換サービスを復旧しています。',true);}
  }
}
app.get('/internal/v1/health',async(_request,reply)=>unhealthy?reply.code(503).send({state:'recovering'}):{state:current?'running':'ready'});
app.post('/internal/v1/convert',async(request,reply)=>{
  if(unhealthy)return reply.code(503).send({error:{code:'UNAVAILABLE'}});
  if(current)return reply.code(409).send({error:{code:'BUSY'}});
  const id=request.headers['x-job-id'],deadline=Number(request.headers['x-deadline-ms']),kind=request.headers['x-document-kind'] || 'docx';
  if(!isOfficeKind(kind)||typeof id!=='string'||!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)||!Number.isSafeInteger(deadline)||deadline<=Date.now()||deadline>Date.now()+LIMITS.documentTimeoutMs||!Buffer.isBuffer(request.body))return reply.code(400).send({error:{code:'INVALID_FILE'}});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DocumentError('TIMEOUT','変換時間を超えました。',true)),Math.min(LIMITS.engineTimeoutMs,deadline-Date.now()));timer.unref();
  const promise=runJob(request.body,controller.signal,kind);current={id,controller,promise};
  const abort=()=>controller.abort(new DocumentError('CANCELLED','変換を取り消しました。'));
  request.raw.once('aborted',abort);reply.raw.once('close',()=>{if(!reply.raw.writableEnded)abort();});
  try{const pdf=await promise;return reply.type('application/pdf').header('content-length',pdf.length).send(pdf);}
  catch(error){const failure=controller.signal.aborted?(controller.signal.reason as DocumentError):error instanceof DocumentError?error:new DocumentError('INVALID_FILE','文書の変換を完了できません。');if(!reply.raw.destroyed)return reply.code(errorStatus(failure)).send({error:errorBody(failure)});}
  finally{clearTimeout(timer);request.raw.removeListener('aborted',abort);if(current?.id===id)current=undefined;}
});
app.delete('/internal/v1/jobs/:id',async(request,reply)=>{
  const id=(request.params as {id:string}).id,job=current;
  if(!job)return reply.code(unhealthy?503:204).send();
  if(job.id!==id)return reply.code(409).send({error:{code:'BUSY'}});
  job.controller.abort(new DocumentError('CANCELLED','変換を取り消しました。'));await job.promise.catch(()=>undefined);
  return reply.code(unhealthy?503:204).send();
});
app.setErrorHandler((_error,_request,reply)=>reply.code(400).send({error:{code:'INVALID_FILE',message:'不正な内部要求です。',retryable:false}}));
await app.listen({port:Number(process.env.ENGINE_PORT||3001),host:process.env.ENGINE_HOST||'0.0.0.0'});
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{current?.controller.abort();void app.close();});
