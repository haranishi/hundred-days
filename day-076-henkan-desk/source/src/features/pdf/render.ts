import { getDocument, GlobalWorkerOptions, type RenderTask } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { zipSync } from 'fflate';
import type { Artifact, SourceFile } from '../../shared/contracts';
import { ConversionFailure } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { parsePages } from './selection';
import type { PdfOptions } from './types';
GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
function checkAbort(signal:AbortSignal){if(signal.aborted)throw new DOMException('Cancelled','AbortError');}
async function canvasBytes(canvas:HTMLCanvasElement,type:'image/png'|'image/jpeg',quality:number):Promise<Uint8Array<ArrayBuffer>>{
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new ConversionFailure('ENCODE_FAILED','ページを画像にできませんでした。')),type,type==='image/jpeg'?quality:undefined));
  if(blob.type!==type)throw new ConversionFailure('ENCODE_FAILED','出力画像の形式を確認できませんでした。');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const valid=type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:bytes[0]===255&&bytes[1]===216;
  if(!valid)throw new ConversionFailure('ENCODE_FAILED','画像の出力形式が一致しません。');
  return bytes;
}
export async function renderPdf(source:SourceFile,options:PdfOptions,signal:AbortSignal):Promise<Artifact>{
  checkAbort(signal);
  if(!Number.isFinite(options.scale)||options.scale<0.5||options.scale>2||!Number.isFinite(options.quality)||options.quality<0.1||options.quality>1||!['png','jpeg'].includes(options.imageFormat))throw new ConversionFailure('INVALID_FILE','画像の大きさ・形式・品質を確認してください。');
  const loading=getDocument({data:new Uint8Array(await source.file.arrayBuffer()),verbosity:0,cMapUrl:`${import.meta.env.BASE_URL}pdf-assets/cmaps/`,cMapPacked:true,iccUrl:`${import.meta.env.BASE_URL}pdf-assets/iccs/`,standardFontDataUrl:`${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,wasmUrl:`${import.meta.env.BASE_URL}pdf-assets/wasm/`,useWorkerFetch:true,useSystemFonts:import.meta.env.VITE_CLIENT_ONLY==='true'?false:undefined,enableXfa:false,disableAutoFetch:true,disableStream:true,stopAtErrors:true,maxImageSize:LIMITS.imagePixels,canvasMaxAreaInBytes:LIMITS.imagePixels*4});
  let active:RenderTask|undefined,password=false;
  loading.onPassword=()=>{password=true;void loading.destroy().catch(()=>{});};
  const abort=()=>{active?.cancel();void loading.destroy().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    const pdf=await loading.promise;checkAbort(signal);
    if(pdf.numPages>LIMITS.pdfPages)throw new ConversionFailure('LIMIT_EXCEEDED','PDFは100ページ以内で選んでください。');
    const selected=parsePages(options.pages,pdf.numPages),base=source.file.name.replace(/\.pdf$/i,'')||'document';
    if(options.operation==='text'){
      const chunks:string[]=[];let hasText=false,total=0;
      for(const index of selected){checkAbort(signal);const page=await pdf.getPage(index+1);const content=await page.getTextContent();const text=content.items.filter(item=>'str'in item).map(item=>'str'in item?item.str+('hasEOL'in item&&item.hasEOL?'\n':' '):'').join('').trim();if(text)hasText=true;
        const chunk=`--- ${index+1}ページ ---\n${text}\n\n`;total+=new TextEncoder().encode(chunk).byteLength;if(total>LIMITS.pdfBytes)throw new ConversionFailure('LIMIT_EXCEEDED','抽出した文字が20MBを超えました。');chunks.push(chunk);page.cleanup();await new Promise<void>(resolve=>setTimeout(resolve,0));}
      if(!hasText)throw new ConversionFailure('UNSUPPORTED','抽出できる文字がありません。スキャンPDFのOCRは対応していません。');
      checkAbort(signal);const blob=new Blob(chunks,{type:'text/plain;charset=utf-8'});return{id:source.id,blob,filename:`${base}.txt`,mime:blob.type,size:blob.size};
    }
    if(selected.length>LIMITS.pdfImagePages)throw new ConversionFailure('LIMIT_EXCEEDED','画像化は1回20ページ以内で指定してください。');
    const entries:Record<string,Uint8Array>={};let total=0;
    for(const index of selected){
      checkAbort(signal);const page=await pdf.getPage(index+1),viewport=page.getViewport({scale:options.scale});
      const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
      if(width>LIMITS.imageEdge||height>LIMITS.imageEdge||width*height>LIMITS.imagePixels)throw new ConversionFailure('LIMIT_EXCEEDED','ページの画像が大きすぎます。画像倍率を下げてください。');
      // Complete operator parsing before rendering: RenderTask can finish with a partial
      // display list when PDF.js rejects an oversized inline image.
      await page.getOperatorList();checkAbort(signal);
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      try{active=page.render({canvas,viewport,background:'#ffffff'});await active.promise;active=undefined;checkAbort(signal);
        const bytes=await canvasBytes(canvas,options.imageFormat==='png'?'image/png':'image/jpeg',options.quality);total+=bytes.byteLength;
        if(total>LIMITS.imageResultsBytes)throw new ConversionFailure('LIMIT_EXCEEDED','画像の合計が40MBを超えました。ページ数や倍率を下げてください。');
        entries[`page-${String(index+1).padStart(3,'0')}.${options.imageFormat==='png'?'png':'jpg'}`]=bytes;
      }finally{active?.cancel();active=undefined;canvas.width=0;canvas.height=0;page.cleanup();}
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    checkAbort(signal);const bytes=zipSync(entries,{level:0});if(bytes.byteLength>LIMITS.pdfBytes)throw new ConversionFailure('LIMIT_EXCEEDED','ZIPが20MBを超えました。ページ数や倍率を下げてください。');
    const blob=new Blob([Uint8Array.from(bytes).buffer],{type:'application/zip'});checkAbort(signal);return{id:source.id,blob,filename:`${base}-images.zip`,mime:blob.type,size:blob.size};
  }catch(error){
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(password)throw new ConversionFailure('PASSWORD_PROTECTED','暗号化されたPDFは変換できません。');
    if(error instanceof ConversionFailure)throw error;
    if(error instanceof Error&&error.message.includes('Image exceeded maximum allowed size'))throw new ConversionFailure('LIMIT_EXCEEDED','PDFに大きすぎる画像が含まれています。');
    throw new ConversionFailure('INVALID_FILE','PDFのページを読み取れません。別のPDFでお試しください。');
  }finally{signal.removeEventListener('abort',abort);active?.cancel();await loading.destroy().catch(()=>{});}
}
