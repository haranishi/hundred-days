import {ENGINE_ASSET_PATH, OFFICE_PATH, OFFICE_ASSET_VERSION, OFFICE_CONTENT_SECURITY_POLICY, SECURITY_HEADERS} from './policy.mjs';
export {ENGINE_ASSET_PATH, OFFICE_PATH, OFFICE_ASSET_VERSION} from './policy.mjs';

export const MAX_OFFICE_PART_BYTES = 20 * 1024 * 1024;
export const OFFICE_ASSET_TYPES = {
  'soffice.js': {mime:'text/javascript; charset=utf-8',encoding:null},
  'zeta.js': {mime:'text/javascript; charset=utf-8',encoding:null},
  'soffice.data.js.metadata': {mime:'application/json',encoding:null},
  'soffice.wasm': {mime:'application/wasm',encoding:'br'},
  'soffice.data': {mime:'application/octet-stream',encoding:'br'},
  'NotoSansCJKjp-Regular.otf': {mime:'font/otf',encoding:'gzip'},
  'NotoSansCJKjp-Bold.otf': {mime:'font/otf',encoding:'gzip'}
};
const BASE = ENGINE_ASSET_PATH + '/' + OFFICE_ASSET_VERSION;
const MANIFEST = ENGINE_ASSET_PATH + '/manifest.json';
const ENGINE_FILES = new Set(['engine.html','engine','engine.js','engine-thread.js']);
function failure(status, method) {
  return new Response(null,{status,headers:{...SECURITY_HEADERS,'Cache-Control':'no-store',...(method?{Allow:'GET, HEAD'}:{})}});
}
function assetHeaders(asset, name) {
  const headers=new Headers({...SECURITY_HEADERS,'Content-Type':asset.mime,'Content-Length':String(asset.bytes),'Cache-Control':'public, max-age=31536000, immutable','Cross-Origin-Resource-Policy':'same-origin'});
  if(asset.encoding)headers.set('Content-Encoding',asset.encoding);
  if(name.endsWith('.js'))headers.set('Content-Security-Policy',OFFICE_CONTENT_SECURITY_POLICY);
  return headers;
}
function validManifest(manifest) {
  if(manifest?.schemaVersion!==1 || manifest.base!==BASE || !manifest.assets || typeof manifest.assets!=='object' || Array.isArray(manifest.assets))return false;
  const entries=Object.entries(manifest.assets);
  if(!entries.length || entries.length>Object.keys(OFFICE_ASSET_TYPES).length)return false;
  return entries.every(([name,asset])=>{
    if(!Object.hasOwn(OFFICE_ASSET_TYPES,name))return false;
    const type=OFFICE_ASSET_TYPES[name];
    if(asset?.mime!==type.mime || asset.encoding!==type.encoding || !Number.isSafeInteger(asset.bytes) || asset.bytes<=0 || !Array.isArray(asset.parts) || !asset.parts.length || asset.parts.length>16)return false;
    let bytes=0;
    const valid=asset.parts.every((part,index)=>{
      const file=type.encoding?name+'.'+type.encoding+'.part-'+String(index).padStart(3,'0'):name;
      if(part?.file!==file || !Number.isSafeInteger(part.bytes) || part.bytes<=0 || part.bytes>MAX_OFFICE_PART_BYTES || (!type.encoding&&asset.parts.length!==1))return false;
      bytes+=part.bytes;return true;
    });
    return valid && bytes===asset.bytes;
  });
}
async function staticFetch(env,origin,path,method='GET') {
  return env.ASSETS.fetch(new Request(origin+path,{method,headers:{'Accept-Encoding':'identity'}}));
}
async function manifestFor(env,origin) {
  const response=await staticFetch(env,origin,MANIFEST);
  if(response.status!==200)return null;
  if(Number(response.headers.get('Content-Length'))>16384){await response.body?.cancel();return null;}
  const text=await response.text();
  if(text.length>16384)return null;
  const manifest=JSON.parse(text);
  return validManifest(manifest)?manifest:null;
}
function partMatches(response,part) {
  const length=response.headers.get('Content-Length');
  return response.status===200 && (length===null || Number(length)===part.bytes) && !response.headers.get('Content-Encoding');
}
async function streamAsset(env,origin,asset,headers,head,createStream) {
  // Verify every part before sending successful headers or beginning the transfer.
  for(const part of asset.parts) {
    const response=await staticFetch(env,origin,BASE+'/'+part.file,'HEAD');
    if(!partMatches(response,part))return failure(502);
  }
  if(head)return new Response(null,{headers,encodeBody:'manual'});
  async function openPart(part) {
    const response=await staticFetch(env,origin,BASE+'/'+part.file);
    if(!partMatches(response,part)||!response.body) {
      await response.body?.cancel();throw new Error('Office asset unavailable');
    }
    return response;
  }
  const first=await openPart(asset.parts[0]);
  const {readable,writable}=createStream(asset.bytes);
  // FixedLengthStream provides a real wire Content-Length. Native piping avoids
  // a JavaScript callback for every chunk and preserves downstream cancellation.
  void (async()=>{
    try {
      for(let index=0;index<asset.parts.length;index++) {
        const response=index===0?first:await openPart(asset.parts[index]);
        await response.body.pipeTo(writable,{preventClose:true});
      }
      await writable.close();
    } catch(error) {await writable.abort(error).catch(()=>{});}
  })();
  return new Response(readable,{headers,encodeBody:'manual'});
}

/** Only public office paths are handled here; room credentials never enter this route. */
export async function serveOfficeAsset(request,env,createStream=length=>new FixedLengthStream(length)) {
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith(OFFICE_PATH+'/') && !path.startsWith(ENGINE_ASSET_PATH+'/'))return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return failure(405,true);
  if(url.search || /[%\\]/.test(path))return failure(404);
  if(!env.ASSETS)return failure(404);
  try {
    if(path.startsWith(OFFICE_PATH+'/')) {
      if(!ENGINE_FILES.has(path.slice(OFFICE_PATH.length+1)))return failure(404);
      const response=await staticFetch(env,url.origin,path,request.method);
      const headers=new Headers(response.headers);
      for(const [key,value]of Object.entries(SECURITY_HEADERS))headers.set(key,value);
      // Replace the wildcard static policy: multiple CSP headers intersect permissions.
      headers.set('Content-Security-Policy',OFFICE_CONTENT_SECURITY_POLICY);
      headers.set('Cache-Control','no-cache');
      return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers,encodeBody:'manual'});
    }
    if(path!==MANIFEST && (!path.startsWith(BASE+'/') || !Object.hasOwn(OFFICE_ASSET_TYPES,path.slice(BASE.length+1))))return failure(404);
    const manifest=await manifestFor(env,url.origin);
    if(!manifest)return failure(502);
    if(path===MANIFEST) {
      return new Response(request.method==='HEAD'?null:JSON.stringify(manifest),{headers:{...SECURITY_HEADERS,'Content-Type':'application/json','Cache-Control':'public, max-age=300','Cross-Origin-Resource-Policy':'same-origin'}});
    }
    const name=path.slice(BASE.length+1),asset=manifest.assets[name];
    if(!asset)return failure(404);
    return await streamAsset(env,url.origin,asset,assetHeaders(asset,name),request.method==='HEAD',createStream);
  } catch {return failure(502);}
}
