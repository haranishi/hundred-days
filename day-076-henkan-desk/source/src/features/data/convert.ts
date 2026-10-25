import type { ConversionError, RunContext, SourceFile } from '../../shared/contracts';
import { ConversionFailure, toConversionError } from '../../shared/errors';
import { DATA_LIMITS, transformCore } from './core';
import { finalizeOutput } from './html';
import { operationInfo, type DataOperation, type DataOptions, type TransformOutput } from './operations';
export function transformData(text:string,operation:DataOperation,options:Partial<Omit<DataOptions,'operation'>>={}):TransformOutput {return finalizeOutput(transformCore(text,operation,options),operation);}
export async function decodeDataFile(file:File,encoding:'utf-8'|'shift-jis'):Promise<string>{
  if(file.size>DATA_LIMITS.input)throw new ConversionFailure('LIMIT_EXCEEDED','テキスト入力は2MiB以内にしてください。');
  const selected=/charset\s*=\s*utf-8/i.test(file.type)?'utf-8':encoding;
  try{return new TextDecoder(selected,{fatal:true,ignoreBOM:/charset\s*=\s*utf-8/i.test(file.type)}).decode(await file.arrayBuffer());}
  catch{throw new ConversionFailure('INVALID_FILE','文字コードが一致しません。UTF-8またはShift_JISの設定を確認してください。');}
}
type Response={ok:true;result:TransformOutput}|{ok:false;error:ConversionError};
function runInWorker(text:string,options:DataOptions,signal:AbortSignal):Promise<TransformOutput>{
  if(typeof Worker==='undefined')return Promise.reject(new ConversionFailure('UNSUPPORTED','この変換はWorker対応のブラウザでお試しください。'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{signal.removeEventListener('abort',abort);worker.terminate();};
    const abort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    worker.onmessage=(event:MessageEvent<Response>)=>{cleanup();const response=event.data;if(response.ok)resolve(response.result);else reject(new ConversionFailure(response.error.code,response.error.message,response.error.retryable));};
    worker.onerror=()=>{cleanup();reject(new ConversionFailure('INTERNAL','変換を完了できませんでした。入力を小さくしてお試しください。',true));};
    worker.onmessageerror=()=>{cleanup();reject(new ConversionFailure('INTERNAL','変換結果を受け取れませんでした。',true));};
    worker.postMessage({text,options});
  });
}
export async function convertData(sources:readonly SourceFile[],options:DataOptions,context:RunContext,onPreview?:(result:TransformOutput)=>void):Promise<void>{
  const fail=(source:SourceFile,error:unknown)=>{context.emit({type:'error',id:source.id,error:toConversionError(error)});context.emit({type:'state',id:source.id,state:'failed'});};
  if(sources.length!==1){for(const source of sources)fail(source,new ConversionFailure('INVALID_FILE','テキストの入力は1件ずつ選んでください。'));return;}
  const source=sources[0]!;let terminal=false;
  try{
    if(context.signal.aborted){context.emit({type:'state',id:source.id,state:'cancelled'});return;}
    context.emit({type:'state',id:source.id,state:'validating'});operationInfo(options.operation);
    const text=await decodeDataFile(source.file,options.encoding);
    if(context.signal.aborted){context.emit({type:'state',id:source.id,state:'cancelled'});return;}
    context.emit({type:'state',id:source.id,state:'converting'});
    const result=finalizeOutput(await runInWorker(text,options,context.signal),options.operation);
    if(context.signal.aborted){context.emit({type:'state',id:source.id,state:'cancelled'});return;}
    const blob=new Blob([result.text],{type:result.mime});if(blob.size>DATA_LIMITS.output)throw new ConversionFailure('LIMIT_EXCEEDED','変換結果が5MiBを超えます。');
    const basename=source.file.name.replace(/\.[^./\\]*$/,'')||'converted';
    onPreview?.(result);context.emit({type:'result',id:source.id,artifact:{id:source.id,blob,size:blob.size,mime:result.mime,filename:`${basename}.${result.extension}`}});
    context.emit({type:'state',id:source.id,state:'succeeded'});terminal=true;
  }catch(error){if(context.signal.aborted){if(!terminal)context.emit({type:'state',id:source.id,state:'cancelled'});}else fail(source,error);}
}
