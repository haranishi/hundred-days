import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { LIMITS } from '../src/shared/limits.js';
import { readConfig, type ServerConfig } from './config.js';
import { EngineClient, type DocumentEngine } from './documents/engineClient.js';
import { DocumentScheduler } from './documents/scheduler.js';
import { DocumentError,errorBody,errorStatus } from './documents/errors.js';
import { initializeTemp } from './documents/temp.js';
import { registerDocumentRoutes } from './documents/route.js';
export async function createApp(options: {config?:ServerConfig;engine?:DocumentEngine;timeoutMs?:number}={}) {
  const config=options.config||readConfig(),engine=options.engine||new EngineClient(config.engineUrl),scheduler=new DocumentScheduler(options.timeoutMs);
  await initializeTemp(config.workRoot);
  const app=Fastify({logger:false,genReqId:()=>randomUUID(),bodyLimit:LIMITS.docxFileBytes+16384,requestTimeout:65000,connectionTimeout:65000,trustProxy:false});
  app.addHook('onSend',async(_request,reply,payload)=>{reply.header('cache-control','no-store').header('x-content-type-options','nosniff').header('referrer-policy','no-referrer').header('content-security-policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");return payload;});
  await app.register(multipart,{throwFileSizeLimit:true,limits:{files:1,fields:1,parts:2,fileSize:LIMITS.docxFileBytes,fieldSize:4}});
  registerDocumentRoutes(app,config,engine,scheduler);
  if(existsSync(config.staticRoot)){
    await app.register(staticFiles,{root:config.staticRoot,wildcard:false});
    app.setNotFoundHandler((request,reply)=>request.url.startsWith('/api/')?reply.code(404).send({error:{code:'UNSUPPORTED',message:'この操作には対応していません。',retryable:false}}):reply.sendFile('index.html'));
  }
  app.setErrorHandler((error,_request,reply)=>{const failure=error instanceof DocumentError?error:new DocumentError('INVALID_FILE','送信内容を読み取れません。ファイルを選び直してください。');reply.code(error instanceof DocumentError?errorStatus(failure):400).send({error:errorBody(failure)});});
  app.addHook('onClose',async()=>{scheduler.close();});
  return app;
}
