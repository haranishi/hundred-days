import type { Artifact, RunContext, SourceFile } from '../../shared/contracts';
import { ConversionFailure, toConversionError } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { DEFAULT_PDF_OPTIONS, type PdfOptions } from './types';
import type { PdfWorkerReply, PdfWorkerRequest } from './worker-contract';
function validate(sources:readonly SourceFile[],options:PdfOptions){
  if(!sources.length)throw new ConversionFailure('INVALID_FILE','ファイルを選んでください。');
  if(sources.length>LIMITS.pdfFiles||sources.some(source=>source.file.size>LIMITS.pdfFileBytes)||sources.reduce((n,source)=>n+source.file.size,0)>LIMITS.pdfBatchBytes)throw new ConversionFailure('LIMIT_EXCEEDED','ファイルは10件、1件10MB・合計30MB以内で選んでください。');
  if(!['images-pdf','merge'].includes(options.operation)&&sources.length!==1)throw new ConversionFailure('INVALID_FILE','この操作ではPDFを1件ずつ選んでください。');
}
function runWorker(request:PdfWorkerRequest,signal:AbortSignal):Promise<Exclude<PdfWorkerReply,{type:'error'}>>{
  if(signal.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf.worker.ts',import.meta.url),{type:'module'});let settled=false;
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();};
    const fail=(error:unknown)=>{if(!settled){settled=true;cleanup();reject(error);}};
    const abort=()=>fail(new DOMException('Cancelled','AbortError'));
    const timer=setTimeout(()=>fail(new ConversionFailure('TIMEOUT','PDFの処理に時間がかかっています。ページ数を減らしてください。',true)),60_000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onmessage=(event:MessageEvent<PdfWorkerReply>)=>{if(settled)return;const reply=event.data;if(reply.type==='error')fail(new ConversionFailure(reply.error.code,reply.error.message,reply.error.retryable));else{settled=true;cleanup();resolve(reply);}};
    worker.onerror=()=>fail(new ConversionFailure('MEMORY_LIMIT','PDFを処理できませんでした。ページ数やファイル容量を減らしてください。',true));
    worker.onmessageerror=()=>fail(new ConversionFailure('INTERNAL','処理結果を読み取れませんでした。',true));
    worker.postMessage(request);if(signal.aborted)abort();
  });
}
export async function convertPdf(sources:readonly SourceFile[],options:PdfOptions,context:RunContext):Promise<void>{
  const ids=sources.map(source=>source.id);let finished=false;
  const states=(state:'validating'|'converting'|'succeeded'|'failed'|'cancelled')=>{for(const id of ids)context.emit({type:'state',id,state});};
  try{
    validate(sources,options);if(context.signal.aborted)throw new DOMException('Cancelled','AbortError');states('validating');
    let artifact:Artifact;
    const render=options.operation==='pdf-images'||options.operation==='text';
    states('converting');
    const reply=await runWorker({sources,options,inspectOnly:render},context.signal);
    if(render){if(reply.type!=='inspection')throw new ConversionFailure('INTERNAL','PDFの確認結果が一致しません。');const renderer=await import('./render');artifact=await renderer.renderPdf(sources[0]!,options,context.signal);}
    else{if(reply.type!=='result')throw new ConversionFailure('INTERNAL','PDFの処理結果が一致しません。');artifact=reply.artifact;}
    if(context.signal.aborted)throw new DOMException('Cancelled','AbortError');
    context.emit({type:'result',id:sources[0]!.id,artifact});states('succeeded');finished=true;
  }catch(error){if(context.signal.aborted){states('cancelled');finished=true;}else{const failure=toConversionError(error);for(const id of ids)context.emit({type:'error',id,error:failure});states('failed');finished=true;}}
  finally{if(!finished&&context.signal.aborted)states('cancelled');}
}

export async function inspectPdfFile(source:SourceFile,signal:AbortSignal):Promise<{pageCount:number}>{
  const reply=await runWorker({sources:[source],options:{...DEFAULT_PDF_OPTIONS,operation:'optimize'},inspectOnly:true},signal);
  if(reply.type!=='inspection')throw new ConversionFailure('INTERNAL','PDFの確認結果を読み取れません。');
  return{pageCount:reply.pageCount};
}
