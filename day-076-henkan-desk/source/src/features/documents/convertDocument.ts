import type { ConvertDocument, ConversionError, ErrorCode } from '../../shared/contracts';
import { LIMITS } from '../../shared/limits';
const knownCodes=new Set<ErrorCode>(['UNSUPPORTED','INVALID_FILE','LIMIT_EXCEEDED','PASSWORD_PROTECTED','UNSAFE_DOCUMENT','CONSENT_REQUIRED','BUSY','TIMEOUT','NETWORK','UNAVAILABLE','CANCELLED','INTERNAL']);
export const convertDocument:ConvertDocument=async(source,consent,context)=>{
  const emit=context.emit,id=source.id;
  const fail=(error:ConversionError)=>{if(context.signal.aborted)return;emit({type:'error',id,error});emit({type:'state',id,state:'failed'});};
  if(context.signal.aborted){emit({type:'state',id,state:'cancelled'});return;}
  if(!consent){fail({code:'CONSENT_REQUIRED',message:'文書の送信に同意してください。',retryable:false});return;}
  if(!/\.(?:docx|xlsx|pptx)$/i.test(source.file.name)){fail({code:'UNSUPPORTED',message:'DOCX・XLSX・PPTXのいずれかを選んでください。',retryable:false});return;}
  if(source.file.size>LIMITS.docxFileBytes){fail({code:'LIMIT_EXCEEDED',message:'文書は10MiB以下にしてください。',retryable:false});return;}
  emit({type:'state',id,state:'validating'});
  const timeout=AbortSignal.timeout(LIMITS.documentTimeoutMs+2000),signal=AbortSignal.any([context.signal,timeout]);
  try{
    const form=new FormData();form.append('consent','true');form.append('file',source.file,source.file.name);
    emit({type:'state',id,state:'converting'});
    const response=await fetch('/api/v1/documents/pdf',{method:'POST',body:form,signal,credentials:'same-origin',cache:'no-store'});
    if(!response.ok){let error:ConversionError={code:response.status===429?'BUSY':response.status===504?'TIMEOUT':'UNAVAILABLE',message:'変換できませんでした。しばらくして再試行してください。',retryable:true};try{const payload=await response.json() as {error?:{code?:ErrorCode;message?:string;retryable?:boolean}};if(payload.error&&knownCodes.has(payload.error.code as ErrorCode)&&typeof payload.error.message==='string')error={code:payload.error.code as ErrorCode,message:payload.error.message.slice(0,300),retryable:payload.error.retryable===true};}catch{/* use safe message */}fail(error);return;}
    if(!response.headers.get('content-type')?.startsWith('application/pdf')){fail({code:'INVALID_FILE',message:'正しいPDFを受け取れませんでした。',retryable:true});return;}
    const reader=response.body?.getReader();if(!reader)throw new Error('Missing body');
    const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
    try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>LIMITS.pdfBytes){await reader.cancel();fail({code:'LIMIT_EXCEEDED',message:'出力PDFが20MiBを超えています。',retryable:false});return;}chunks.push(new Uint8Array(item.value));}}finally{reader.releaseLock();}
    const blob=new Blob(chunks,{type:'application/pdf'}),head=new Uint8Array(await blob.slice(0,5).arrayBuffer());
    if(String.fromCharCode(...head)!=='%PDF-'){fail({code:'INVALID_FILE',message:'完成したPDFを確認できませんでした。',retryable:true});return;}
    if(context.signal.aborted){emit({type:'state',id,state:'cancelled'});return;}
    const basename=source.file.name.replace(/\.[^.]*$/,'').replace(/[\\/\u0000-\u001f\u007f]/g,'_').slice(0,160)||'converted';
    emit({type:'result',id,artifact:{id,blob,filename:`${basename}.pdf`,mime:'application/pdf',size:blob.size}});emit({type:'state',id,state:'succeeded'});
  }catch{if(context.signal.aborted)emit({type:'state',id,state:'cancelled'});else fail({code:timeout.aborted?'TIMEOUT':'NETWORK',message:timeout.aborted?'制限時間を超えました。文書を小さくして再試行してください。':'通信を確認して再試行してください。',retryable:true});}
};
