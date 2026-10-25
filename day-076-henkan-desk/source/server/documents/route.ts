import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import type { ServerConfig } from '../config.js';
import { DocumentScheduler } from './scheduler.js';
import type { DocumentEngine } from './engineClient.js';
import { abortError, documentError, DocumentError, errorBody, errorStatus } from './errors.js';
import { createTemp, removeTemp } from './temp.js';
import { receiveDocument } from './upload.js';
import { validateDocx } from './preflight.js';
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve,reject)=>{const abort=()=>reject(abortError(signal));signal.addEventListener('abort',abort,{once:true});operation.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));if(signal.aborted)abort();});
}
export function registerDocumentRoutes(app: FastifyInstance, config: ServerConfig, engine: DocumentEngine, scheduler: DocumentScheduler): void {
  app.get('/api/v1/capabilities',async()=>({wordPdf:await engine.health()==='recovering'?'unavailable':'available'}));
  app.post('/api/v1/documents/pdf',async(request,reply)=>{
    const requestId=request.id;
    if(request.headers.origin!==config.publicOrigin) return reply.code(403).send({error:errorBody(new DocumentError('INVALID_FILE','同じアプリ画面から変換してください。')),requestId});
    if(request.headers['content-encoding']) return reply.code(415).send({error:errorBody(new DocumentError('UNSUPPORTED','圧縮された送信は受け付けられません。')),requestId});
    if(!request.isMultipart()) return reply.code(400).send({error:errorBody(new DocumentError('INVALID_FILE','ファイルの送信形式が違います。')),requestId});
    let lease;try{lease=scheduler.reserve();}catch(error){const failure=documentError(error);return reply.header('retry-after','5').code(errorStatus(failure)).send({error:errorBody(failure),requestId});}
    let directory:string|undefined,processing:Promise<Buffer>|undefined;
    const abort=()=>lease.abort();
    request.raw.once('aborted',abort);reply.raw.once('close',()=>{if(!reply.raw.writableEnded)abort();});
    try {
      if(await engine.health()==='recovering') throw new DocumentError('UNAVAILABLE','文書変換を準備しています。5秒ほど待って再試行してください。',true);
      directory=await createTemp(config.workRoot);const inputPath=join(directory,'input.package');
      const expected=await receiveDocument(request,inputPath,lease.signal,()=>lease.abort(new DocumentError('LIMIT_EXCEEDED','送信内容が上限を超えています。')));
      processing=lease.run(async()=>{const kind=await validateDocx(inputPath,lease.signal,expected);return engine.convert({id:lease.id,inputPath,kind,deadline:lease.deadline,signal:lease.signal});});
      const pdf=await abortable(processing,lease.signal);
      await removeTemp(directory);directory=undefined;
      return reply.header('content-type','application/pdf').header('content-disposition','attachment; filename="converted.pdf"').header('content-length',pdf.length).send(pdf);
    }catch(error){
      const failure=documentError(error);
      if(!lease.signal.aborted){if(processing)await processing.catch(()=>undefined);if(directory){await removeTemp(directory);directory=undefined;}}
      if(failure.code==='LIMIT_EXCEEDED'){reply.header('connection','close');reply.raw.once('finish',()=>request.raw.destroy());}
      if(!reply.raw.destroyed && !reply.sent){if(failure.code==='BUSY'||failure.code==='UNAVAILABLE')reply.header('retry-after','5');reply.code(errorStatus(failure)).send({error:errorBody(failure),requestId});}
    }finally{
      request.raw.removeListener('aborted',abort);
      if(processing)await processing.catch(()=>undefined);
      try{if(directory)await removeTemp(directory);}catch{scheduler.close();}
      lease.release();
    }
  });
}
