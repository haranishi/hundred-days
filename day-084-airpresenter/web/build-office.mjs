import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {get} from 'node:https';
import {createHash} from 'node:crypto';
import {brotliDecompressSync,gunzipSync,gzipSync} from 'node:zlib';
import {ENGINE_ASSET_PATH,OFFICE_ASSET_VERSION,MAX_OFFICE_PART_BYTES,OFFICE_ASSET_TYPES} from './office-assets.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// node:https preserves the CDN's encoded bytes; fetch() transparently decompresses.
async function downloadSource(source,url=source.url,redirects=0) {
  const target=new URL(url);
  if(target.protocol!=='https:'||target.username||target.password||redirects>4)throw new Error('Invalid public office source');
  return new Promise((resolveDownload,reject)=>{
    const request=get(target,{headers:{'Accept-Encoding':source.encoding==='br'?'br':'identity','User-Agent':'AirPresenter-public-asset-build'}},response=>{
      if([301,302,303,307,308].includes(response.statusCode)) {
        const location=response.headers.location;response.resume();
        if(!location){reject(new Error('Office source redirect unavailable'));return;}
        downloadSource(source,new URL(location,target).href,redirects+1).then(resolveDownload,reject);return;
      }
      if(response.statusCode!==200){response.resume();reject(new Error('Office source unavailable: '+source.name));return;}
      let bytes=0;const chunks=[];
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>source.rawBytes+1024*1024){response.destroy(new Error('Office source exceeds fixed size'));return;}
        chunks.push(chunk);
      });
      response.on('end',()=>resolveDownload({body:Buffer.concat(chunks),encoding:response.headers['content-encoding']||null}));
      response.on('error',reject);
    });
    request.setTimeout(180000,()=>request.destroy(new Error('Office source download timed out')));
    request.on('error',reject);
  });
}
function validateSource(source) {
  const type=OFFICE_ASSET_TYPES[source.name];
  if(!Object.hasOwn(OFFICE_ASSET_TYPES,source.name) || source.mime!==type.mime || source.encoding!==type.encoding || !/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isSafeInteger(source.rawBytes) || source.rawBytes<=0)throw new Error('Invalid office asset source/name');
  const url=new URL(source.url);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid public office asset URL');
}
function verifyRaw(source,body,encoding) {
  const raw=encoding==='br'?brotliDecompressSync(body,{maxOutputLength:source.rawBytes}):encoding==='gzip'?gunzipSync(body,{maxOutputLength:source.rawBytes}):body;
  if(raw.length!==source.rawBytes || sha(raw)!==source.sha256)throw new Error('Office asset SHA256 mismatch: '+source.name);
  return raw;
}
export async function buildOfficeAssets({sources,cacheDirectory=join(root,'.cache/day084-office'),outputDirectory=resolve(here,'../vendor/office'),download=downloadSource,partBytes=MAX_OFFICE_PART_BYTES}={}) {
  sources??=JSON.parse(await readFile(join(here,'office-sources.json'),'utf8'));
  if(sources.schemaVersion!==1||sources.version!==OFFICE_ASSET_VERSION||!Array.isArray(sources.assets)||!sources.assets.length)throw new Error('Invalid fixed office source manifest');
  if(!Number.isSafeInteger(partBytes)||partBytes<=0||partBytes>MAX_OFFICE_PART_BYTES)throw new Error('Invalid office part size');
  const names=new Set();
  for(const source of sources.assets){validateSource(source);if(names.has(source.name))throw new Error('Duplicate office asset name');names.add(source.name);}
  await mkdir(cacheDirectory,{recursive:true});
  const versionDirectory=join(outputDirectory,sources.version);
  await rm(versionDirectory,{recursive:true,force:true});await mkdir(versionDirectory,{recursive:true});
  const manifest={schemaVersion:1,base:ENGINE_ASSET_PATH+'/'+sources.version,assets:{}};
  for(const source of sources.assets) {
    const cached=join(cacheDirectory,source.sha256+'.'+(source.encoding||'identity'));
    let wire;
    try {wire=await readFile(cached);verifyRaw(source,wire,source.encoding);}
    catch(error) {
      if(error.code!=='ENOENT')throw error;
      const downloaded=await download(source);
      if((downloaded.encoding||null)!==(source.encoding==='br'?'br':null))throw new Error('Office source encoding mismatch: '+source.name);
      const raw=verifyRaw(source,downloaded.body,downloaded.encoding);
      wire=source.encoding==='gzip'?gzipSync(raw,{level:9}):downloaded.body;
      await writeFile(cached,wire);
    }
    const parts=[];
    if(!source.encoding && wire.length>partBytes)throw new Error('Unencoded office asset exceeds part size');
    for(let offset=0,index=0;offset<wire.length;offset+=partBytes,index++) {
      const bytes=wire.subarray(offset,offset+partBytes);
      const file=source.encoding?source.name+'.'+source.encoding+'.part-'+String(index).padStart(3,'0'):source.name;
      await writeFile(join(versionDirectory,file),bytes);parts.push({file,bytes:bytes.length});
    }
    manifest.assets[source.name]={mime:source.mime,encoding:source.encoding,bytes:wire.length,parts};
    if(download===downloadSource)console.log('Office public asset verified: '+source.name+' ('+wire.length+' wire bytes, '+parts.length+' part'+(parts.length===1?'':'s')+')');
  }
  await mkdir(outputDirectory,{recursive:true});
  await writeFile(join(outputDirectory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildOfficeAssets();
