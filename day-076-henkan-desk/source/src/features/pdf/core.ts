import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PageSizes, degrees } from 'pdf-lib';
import { zipSync } from 'fflate';
import type { Artifact, SourceFile } from '../../shared/contracts';
import { ConversionFailure } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { inspectImage } from '../images/headers';
import { parsePages, parseOrder } from './selection';
import type { PdfOptions } from './types';
export type AggregateArtifact = Artifact & { inputIds: string[]; inputBytes: number };
export type PdfInspection = { pageCount: number };
export function checkAbort(signal: AbortSignal): void { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
export async function checkpoint(signal: AbortSignal): Promise<void> { checkAbort(signal); await new Promise<void>(resolve => setTimeout(resolve,0)); checkAbort(signal); }
export function validateSources(sources: readonly SourceFile[]): void {
  if (!sources.length) throw new ConversionFailure('INVALID_FILE','ファイルを選んでください。');
  if (sources.length > LIMITS.pdfFiles || sources.some(source=>source.file.size > LIMITS.pdfFileBytes) || sources.reduce((n,source)=>n+source.file.size,0)>LIMITS.pdfBatchBytes) throw new ConversionFailure('LIMIT_EXCEEDED','ファイルは10件、1件10MB・合計30MB以内で選んでください。');
}
export async function loadPdf(source: SourceFile, signal: AbortSignal): Promise<PDFDocument> {
  checkAbort(signal);
  const bytes = new Uint8Array(await source.file.arrayBuffer());
  if (!new TextDecoder('latin1').decode(bytes.subarray(0,1024)).includes('%PDF-')) throw new ConversionFailure('INVALID_FILE','PDF形式のファイルを選んでください。');
  try {
    const doc=await PDFDocument.load(bytes,{updateMetadata:false,parseSpeed:500,throwOnInvalidObject:true});
    checkAbort(signal);
    if(doc.isEncrypted)throw new ConversionFailure('PASSWORD_PROTECTED','暗号化されたPDFは変換できません。保護を解除して保存してください。');
    if(doc.getPageCount()<1||doc.getPageCount()>LIMITS.pdfPages)throw new ConversionFailure('LIMIT_EXCEEDED','PDFは1〜100ページで選んでください。');
    let pixels=0;
    for(const [,object] of doc.context.enumerateIndirectObjects()) {
      if(object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString()==='/Image'){
        const width=object.dict.lookup(PDFName.of('Width'),PDFNumber).asNumber(),height=object.dict.lookup(PDFName.of('Height'),PDFNumber).asNumber();
        if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>LIMITS.imageEdge||height>LIMITS.imageEdge||width*height>LIMITS.imagePixels)throw new ConversionFailure('LIMIT_EXCEEDED','PDFに大きすぎる画像が含まれています。');
        pixels+=width*height;if(pixels>LIMITS.imagePixels*4)throw new ConversionFailure('LIMIT_EXCEEDED','PDF内の画像量が多すぎます。ページを減らしてお試しください。');
      }
    }
    return doc;
  } catch(error){
    if(error instanceof ConversionFailure || signal.aborted)throw error;
    if(error instanceof Error && /encrypted/i.test(error.message))throw new ConversionFailure('PASSWORD_PROTECTED','暗号化されたPDFは変換できません。');
    throw new ConversionFailure('INVALID_FILE','PDFを読み取れません。破損していないPDFを選んでください。');
  }
}
export async function inspectPdf(source: SourceFile,signal: AbortSignal):Promise<PdfInspection>{validateSources([source]);return{pageCount:(await loadPdf(source,signal)).getPageCount()};}
export function makeArtifact(sources: readonly SourceFile[],bytes: Uint8Array,filename: string,mime: string):AggregateArtifact{
  if(bytes.byteLength>LIMITS.pdfBytes)throw new ConversionFailure('LIMIT_EXCEEDED','出力が20MBを超えました。ページ数や画質を下げてください。');
  const blob=new Blob([Uint8Array.from(bytes).buffer],{type:mime});
  return{id:sources[0]!.id,blob,filename,mime,size:blob.size,inputIds:sources.map(source=>source.id),inputBytes:sources.reduce((n,source)=>n+source.file.size,0)};
}
function baseName(source:SourceFile):string{return source.file.name.replace(/\.[^.]+$/,'')||'converted';}
function requireSingle(sources:readonly SourceFile[]):void{if(sources.length!==1)throw new ConversionFailure('INVALID_FILE','この操作ではPDFを1件ずつ選んでください。');}
async function imagePdf(sources:readonly SourceFile[],options:PdfOptions,signal:AbortSignal):Promise<AggregateArtifact>{
  if(typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw new ConversionFailure('UNSUPPORTED','このブラウザでは画像をPDF化できません。新しいSafari・Chrome・Edge・Firefoxで開いてください。');
  const doc=await PDFDocument.create();
  if(!Number.isFinite(options.margin)||options.margin<0||options.margin>72||!['original','a4'].includes(options.paper)||!['portrait','landscape'].includes(options.orientation))throw new ConversionFailure('INVALID_FILE','用紙と余白を確認してください。');
  for(const source of sources){
    await checkpoint(signal); const header=await inspectImage(source.file);
    let bitmap:ImageBitmap|undefined,canvas:OffscreenCanvas|undefined;
    try{
      try{bitmap=await createImageBitmap(source.file,{imageOrientation:'from-image'});}catch{throw new ConversionFailure('INVALID_FILE','画像データを読み取れません。保存し直した画像を選んでください。');}
      checkAbort(signal);
      if(bitmap.width!==header.displayWidth||bitmap.height!==header.displayHeight)throw new ConversionFailure('INVALID_FILE','画像の向きや寸法を正しく読み取れませんでした。保存し直した画像を選んでください。');
      canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const context=canvas.getContext('2d');if(!context)throw new ConversionFailure('UNSUPPORTED','このブラウザでは画像をPDF化できません。');
      context.drawImage(bitmap,0,0);const png=await canvas.convertToBlob({type:'image/png'});checkAbort(signal);
      const image=await doc.embedPng(await png.arrayBuffer());
      const size=options.paper==='a4' ? (options.orientation==='landscape' ? [PageSizes.A4[1],PageSizes.A4[0]] : [...PageSizes.A4]) : [bitmap.width*0.75,bitmap.height*0.75];
      const [width,height]=size as [number,number];const page=doc.addPage([width,height]);const margin=options.paper==='a4'?options.margin:0;
      const scale=Math.min((width-2*margin)/image.width,(height-2*margin)/image.height);
      if(scale<=0)throw new ConversionFailure('INVALID_FILE','余白が大きすぎます。');
      const drawWidth=image.width*scale,drawHeight=image.height*scale;page.drawImage(image,{x:(width-drawWidth)/2,y:(height-drawHeight)/2,width:drawWidth,height:drawHeight});
    }finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}}
  }
  const bytes=await doc.save({useObjectStreams:true});checkAbort(signal);return makeArtifact(sources,bytes,sources.length===1?`${baseName(sources[0]!)}.pdf`:'images.pdf','application/pdf');
}
export async function processCore(sources:readonly SourceFile[],options:PdfOptions,signal:AbortSignal):Promise<AggregateArtifact>{
  validateSources(sources);checkAbort(signal);
  if(options.operation==='images-pdf')return imagePdf(sources,options,signal);
  if(options.operation==='pdf-images'||options.operation==='text')throw new ConversionFailure('UNSUPPORTED','この操作はPDF描画機能で行ってください。');
  if(options.operation!=='merge')requireSingle(sources);
  const loaded:PDFDocument[]=[];let totalPages=0;
  for(const source of sources){await checkpoint(signal);const doc=await loadPdf(source,signal);totalPages+=doc.getPageCount();if(totalPages>LIMITS.pdfPages)throw new ConversionFailure('LIMIT_EXCEEDED','合計100ページ以内で選んでください。');loaded.push(doc);}
  const first=loaded[0]!,source=sources[0]!,base=baseName(source);
  if(options.operation==='optimize'){
    const bytes=await first.save({useObjectStreams:true,addDefaultPage:false});checkAbort(signal);
    const chosen=bytes.byteLength<source.file.size?bytes:new Uint8Array(await source.file.arrayBuffer());
    return makeArtifact(sources,chosen,`${base}-optimized.pdf`,'application/pdf');
  }
  if(options.operation==='split'){
    const selected=parsePages(options.pages,first.getPageCount()),entries:Record<string,Uint8Array>={};let total=0;
    for(const index of selected){await checkpoint(signal);const doc=await PDFDocument.create();const[page]=await doc.copyPages(first,[index]);doc.addPage(page!);const bytes=await doc.save({useObjectStreams:true});total+=bytes.byteLength;if(total>LIMITS.imageResultsBytes)throw new ConversionFailure('LIMIT_EXCEEDED','分割したファイルの合計が40MBを超えます。');entries[`page-${String(index+1).padStart(3,'0')}.pdf`]=bytes;}
    checkAbort(signal);return makeArtifact(sources,zipSync(entries,{level:0}),`${base}-pages.zip`,'application/zip');
  }
  const out=await PDFDocument.create();
  if(options.operation==='merge'){
    for(const doc of loaded){const copied=await out.copyPages(doc,doc.getPageIndices());for(const page of copied){await checkpoint(signal);out.addPage(page);}}
  }else{
    const selected=options.operation==='reorder'?parseOrder(options.order,first.getPageCount()):options.operation==='extract'?parsePages(options.pages,first.getPageCount()):first.getPageIndices();
    const rotated=options.operation==='rotate'?new Set(parsePages(options.pages,first.getPageCount())):new Set<number>();
    if(options.operation==='rotate'&&![90,180,270].includes(options.rotation))throw new ConversionFailure('INVALID_FILE','90・180・270度から選んでください。');
    const copied=await out.copyPages(first,selected);
    for(const[position,index]of selected.entries()){await checkpoint(signal);const page=copied[position]!;if(rotated.has(index))page.setRotation(degrees((page.getRotation().angle+options.rotation)%360));out.addPage(page);}
  }
  const bytes=await out.save({useObjectStreams:true});checkAbort(signal);
  return makeArtifact(sources,bytes,options.operation==='merge'?'merged.pdf':`${base}-${options.operation}.pdf`,'application/pdf');
}
