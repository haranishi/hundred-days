import {importPdf} from './pdf-import.js';
import {readLocalFontData} from './local-fonts.js';
const MAX_INPUT = 25 * 1024 * 1024;
function fault(status,message) {return Object.assign(new Error(message),{status});}
export async function importPresentation(file,{signal,onProgress=()=>{}}={}) {
  if(signal?.aborted)throw new DOMException('資料の読込を取り消しました。','AbortError');
  if(!(file instanceof Blob))throw fault(400,'PDFまたはPowerPointを選んでください。');
  if(!/\.(pdf|pptx|ppt)$/i.test(file.name||''))throw fault(415,'PDF・PPTX・PPTの資料を選んでください。');
  if(!file.size)throw fault(422,'空の資料は読み込めません。別の資料を選んでください。');
  if(file.size>MAX_INPUT)throw fault(413,'25 MiB以下の資料を選んでください。');
  if(/\.pdf$/i.test(file.name))return importPdf(file,{signal,onProgress});
  const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(signal?.aborted)throw new DOMException('資料の読込を取り消しました。','AbortError');
  const valid=/\.pptx$/i.test(file.name)?signature[0]===0x50&&signature[1]===0x4b&&signature[2]===3&&signature[3]===4:[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((byte,index)=>signature[index]===byte);
  if(!valid)throw fault(422,'PowerPointのファイル形式を確認してください。パスワードを解除して保存し直すか、別の資料を選んでください。');
  onProgress({stage:'preparing',completed:0,total:null});
  const fonts=await readLocalFontData({signal});
  const {convertPowerPoint}=await import('./powerpoint-import.js');
  const pdf=await convertPowerPoint(file,{signal,onProgress,fonts});
  return importPdf(new File([pdf],'presentation.pdf',{type:'application/pdf'}),{signal,onProgress,maxInputBytes:64*1024*1024});
}
