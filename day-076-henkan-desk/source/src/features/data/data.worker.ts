import { transformCore } from './core';
import { toConversionError } from '../../shared/errors';
import type { DataOptions } from './operations';
declare const self: DedicatedWorkerGlobalScope;
self.onmessage=(event:MessageEvent<{text:string;options:DataOptions}>)=>{
  try{const {text,options}=event.data;self.postMessage({ok:true,result:transformCore(text,options.operation,options)});}
  catch(error){self.postMessage({ok:false,error:toConversionError(error)});}
};
