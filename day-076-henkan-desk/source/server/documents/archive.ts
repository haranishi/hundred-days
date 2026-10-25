import yauzl from 'yauzl';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { TextDecoder } from 'node:util';
import { LIMITS } from '../../src/shared/limits.js';
import { DocumentError } from './errors.js';
import type { OfficeKind } from './formats.js';
import { createXmlCheck, validatePackage, type PackageInfo } from './content.js';
const decoder=new TextDecoder('utf-8',{fatal:true});
function invalid(message='文書の圧縮構造が壊れています。Officeで保存し直してください。'): never { throw new DocumentError('INVALID_FILE',message); }
function unsafe(): never { throw new DocumentError('UNSAFE_DOCUMENT','安全に読み取れない文書です。埋込オブジェクトを除いて保存し直してください。'); }
function directoryOffset(input: Buffer): number {
  for (let at=input.length-22;at>=Math.max(0,input.length-65557);at--) if (input.readUInt32LE(at)===0x06054b50 && at+22+input.readUInt16LE(at+20)===input.length) {
    if(input.readUInt16LE(at+4)!==0 || input.readUInt16LE(at+6)!==0) invalid();
    const count=input.readUInt16LE(at+10),size=input.readUInt32LE(at+12),offset=input.readUInt32LE(at+16);
    if(count>LIMITS.docxEntries) throw new DocumentError('LIMIT_EXCEEDED','文書内のファイルが1000件を超えています。');
    if(count===0xffff || size===0xffffffff || offset===0xffffffff || count!==input.readUInt16LE(at+8) || offset+size!==at) invalid();
    return offset;
  }
  return invalid();
}
function localRange(input: Buffer,entry:yauzl.Entry,end:number):[number,number] {
  const at=entry.relativeOffsetOfLocalHeader;
  if(!Number.isSafeInteger(at)||at<0||at+30>end||input.readUInt32LE(at)!==0x04034b50) invalid();
  const flags=input.readUInt16LE(at+6),method=input.readUInt16LE(at+8),nameLength=input.readUInt16LE(at+26),extra=input.readUInt16LE(at+28);
  if(flags&1) throw new DocumentError('PASSWORD_PROTECTED','暗号化された文書は変換できません。保護を解除してください。');
  if(flags!==entry.generalPurposeBitFlag || method!==entry.compressionMethod || ![0,8].includes(method)) invalid();
  const start=at+30+nameLength+extra,compressedEnd=start+entry.compressedSize;
  if(start>end || compressedEnd>end) invalid();
  let name:string;try{name=decoder.decode(input.subarray(at+30,at+30+nameLength));}catch{invalid();}
  if(name!==entry.fileName) invalid();
  let finish=compressedEnd;
  if(flags&8) {
    if(finish+12>end) invalid();
    const shift=input.readUInt32LE(finish)===0x08074b50?4:0;
    if(finish+12+shift>end || input.readUInt32LE(finish+shift)!==entry.crc32 || input.readUInt32LE(finish+shift+4)!==entry.compressedSize || input.readUInt32LE(finish+shift+8)!==entry.uncompressedSize) invalid();
    finish+=12+shift;
  } else if(input.readUInt32LE(at+14)!==entry.crc32 || input.readUInt32LE(at+18)!==entry.compressedSize || input.readUInt32LE(at+22)!==entry.uncompressedSize) invalid();
  return [at,finish];
}
async function openZip(input:Buffer):Promise<yauzl.ZipFile>{return new Promise((resolve,reject)=>yauzl.fromBuffer(input,{lazyEntries:true,autoClose:false,validateEntrySizes:true,strictFileNames:true},(error,zip)=>error||!zip?reject(error):resolve(zip)));}
async function entries(zip:yauzl.ZipFile):Promise<yauzl.Entry[]>{return new Promise((resolve,reject)=>{const result:yauzl.Entry[]=[];zip.on('error',reject);zip.on('entry',(entry:yauzl.Entry)=>{result.push(entry);if(result.length>LIMITS.docxEntries)reject(new DocumentError('LIMIT_EXCEEDED','文書内のファイルが1000件を超えています。'));else zip.readEntry();});zip.once('end',()=>resolve(result));zip.readEntry();});}
export async function validateArchive(path:string,expected?:OfficeKind):Promise<OfficeKind>{
  const input=await readFile(path);
  if(input.byteLength>LIMITS.docxFileBytes)throw new DocumentError('LIMIT_EXCEEDED','文書は10MiB以下にしてください。');
  if(input.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])))throw new DocumentError('PASSWORD_PROTECTED','暗号化された文書、または古いWord形式は変換できません。保護のないDOCX・XLSX・PPTXで保存してください。');
  if(input.length<22)invalid();
  const end=directoryOffset(input),zip=await openZip(input);
  zip.on('error',()=>undefined);
  try{
    const list=await entries(zip),info:PackageInfo={names:new Set(),types:new Map(),relations:[],documentRoot:false};
    const ranges:[number,number][]=[];let declared=0,total=0;
    for(const entry of list){
      const name=entry.fileName;
      if(!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||/^[a-z]:/i.test(name)||name.split('/').includes('..')||info.names.has(name)||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)unsafe();
      if(/(?:^|\/)(?:embeddings|activex)(?:\/|$)|vbaProject|(?:^|\/)(?:externalLinks|connections|queryTables)(?:[\/.]|$)/i.test(name))unsafe();
      if(entry.generalPurposeBitFlag&1)throw new DocumentError('PASSWORD_PROTECTED','暗号化された文書は変換できません。');
      declared+=entry.uncompressedSize;if(!Number.isSafeInteger(declared)||declared>LIMITS.docxExpandedBytes)throw new DocumentError('LIMIT_EXCEEDED','文書の展開量が100MiBを超えています。');
      info.names.add(name);ranges.push(localRange(input,entry,end));
    }
    ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i]![0]<ranges[i-1]![1])invalid();
    for(const entry of list){
      if(entry.fileName.endsWith('/'))continue;
      const parser=/\.(?:xml|rels)$/i.test(entry.fileName)?createXmlCheck(entry.fileName,info):undefined;
      const stream=await new Promise<NodeJS.ReadableStream>((resolve,reject)=>zip.openReadStream(entry,(error,value)=>error||!value?reject(error):resolve(value)));
      const textDecoder=new TextDecoder('utf-8',{fatal:true});let size=0,crc=0;
      for await(const raw of stream){const chunk=Buffer.isBuffer(raw)?raw:Buffer.from(raw as string);size+=chunk.length;total+=chunk.length;if(total>LIMITS.docxExpandedBytes)throw new DocumentError('LIMIT_EXCEEDED','文書の展開量が100MiBを超えています。');crc=crc32(chunk,crc);if(parser)parser.write(textDecoder.decode(chunk,{stream:true}));}
      if(size!==entry.uncompressedSize || crc!==entry.crc32)invalid();
      if(parser)parser.write(textDecoder.decode()).close();
    }
    return validatePackage(info,expected);
  }finally{zip.close();}
}
