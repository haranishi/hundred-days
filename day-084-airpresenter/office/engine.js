import {createFontConfig} from '../local-fonts.js';
const nativeWorker=window.Worker,workers=new Set();
let disposed=false,control,unoPort,job,converted=false;
window.Worker=class extends nativeWorker {
  constructor(...args){if(disposed)throw new DOMException('Cancelled','AbortError');super(...args);workers.add(this);}
};
// The pinned runtime exposes a global PThread value. Module.PThread is an aborting getter.
window.disposeAirPresenterOffice=()=>{
  if(disposed)return;disposed=true;
  try{Object.getOwnPropertyDescriptor(window,'PThread')?.value?.terminateAllThreads?.();}catch{}
  for(const worker of workers){try{worker.terminate();}catch{}}workers.clear();
  unoPort?.close();control?.close();
};
const quiet=()=>{};console.log=console.warn=console.error=quiet;
function send(message,transfer=[]){if(!disposed)control?.postMessage({...message,job},transfer);}
function failure(code='INVALID_DOCUMENT'){send({type:'error',code});}
addEventListener('error',event=>{event.preventDefault();failure('ENGINE_FAILED');});
addEventListener('unhandledrejection',event=>{event.preventDefault();failure('ENGINE_FAILED');});
function profile(value){
  const fonts=value.fonts||[],families=value.families||[];let size=0;
  if(!Array.isArray(fonts)||fonts.length>32||!Array.isArray(families)||families.length>32)throw Error();
  for(const font of fonts){if(!(font?.data instanceof ArrayBuffer)||font.data.byteLength<4||font.data.byteLength>25*1024*1024||!['otf','ttf','ttc'].includes(font.extension))throw Error();size+=font.data.byteLength;}
  if(size>64*1024*1024||families.some(f=>typeof f!=='string'||f.length>80))throw Error();
  return {fonts,families};
}
async function initialize(extra){
  send({type:'progress',stage:'loading_engine'});
  const response=await fetch(new URL('../vendor/office/manifest.json',import.meta.url),{cache:'no-cache'});
  if(!response.ok)throw Error();const manifest=await response.json();
  if(manifest.schemaVersion!==1||typeof manifest.base!=='string'||!/^[\/a-zA-Z0-9._-]+$/.test(manifest.base))throw Error();
  const base=new URL(manifest.base+'/',location.origin),expected=new URL('../vendor/office/',import.meta.url);
  if(base.origin!==location.origin||!base.pathname.startsWith(expected.pathname))throw Error();
  const fonts=await Promise.all(['NotoSansCJKjp-Regular.otf','NotoSansCJKjp-Bold.otf'].map(async name=>{
    const result=await fetch(new URL(name,base));if(!result.ok)throw Error();const data=await result.arrayBuffer();
    if(!data.byteLength||data.byteLength>25*1024*1024)throw Error();return {name,data:new Uint8Array(data)};
  }));
  if(disposed)return;
  send({type:'progress',stage:'initializing_engine'});
  window.Module={canvas:document.querySelector('#qtcanvas'),
    uno_scripts:[new URL('zeta.js',base).href,new URL('engine-thread.js',import.meta.url).href],
    locateFile:path=>new URL(path,base).href,mainScriptUrlOrBlob:new URL('soffice.js',base).href,
    print:quiet,printErr:quiet,onAbort:()=>failure('ENGINE_FAILED'),
    preRun:[()=>{
      FS.mkdirTree('/instdir/share/fonts/truetype');
      for(const font of fonts)FS.writeFile('/instdir/share/fonts/truetype/'+font.name,font.data);
      for(const [index,font]of extra.fonts.entries())FS.writeFile('/instdir/share/fonts/truetype/airpresenter-'+index+'.'+font.extension,new Uint8Array(font.data));
      if(extra.fonts.length){FS.mkdirTree('/instdir/share/fontconfig/conf.d');FS.writeFile('/instdir/share/fontconfig/conf.d/99-airpresenter.conf',new TextEncoder().encode(createFontConfig(extra.families)));}
    }]
  };
  const script=document.createElement('script');script.src=new URL('soffice.js',base).href;
  script.onerror=()=>failure('ENGINE_FAILED');
  script.onload=()=>{
    Module.uno_main.then(port=>{
      if(disposed){port.close();return;}unoPort=port;
      port.onmessage=event=>{
        if(disposed)return;const message=event.data;
        if(message?.cmd==='ready')send({type:'ready'});
        else if(message?.cmd==='count')send({type:'count',total:message.total});
        else if(message?.cmd==='error')failure(message.code==='PAGE_LIMIT'?'PAGE_LIMIT':'INVALID_DOCUMENT');
        else if(message?.cmd==='converted'){
          try{
            const size=FS.stat('/tmp/output.pdf').size;if(!Number.isSafeInteger(size)||size<=0||size>64*1024*1024)throw Error();
            const data=FS.readFile('/tmp/output.pdf');FS.unlink('/tmp/output.pdf');
            send({type:'result',data:data.buffer},[data.buffer]);
          }catch{failure();}
        }
      };
    }).catch(()=>failure('ENGINE_FAILED'));
  };
  document.body.append(script);
}
addEventListener('message',event=>{
  if(disposed||control||event.source!==parent||parent===window||event.origin!==location.origin)return;
  const message=event.data;
  if(message?.type!=='AIRPRESENTER_OFFICE_INIT'||typeof message.job!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(message.job)||event.ports.length!==1)return;
  control=event.ports[0];job=message.job;
  control.onmessage=event=>{
    const value=event.data;
    if(disposed||converted||!unoPort||value?.type!=='convert'||value.job!==job)return;
    if(!['pptx','ppt'].includes(value.extension)||!(value.data instanceof ArrayBuffer)||!value.data.byteLength||value.data.byteLength>25*1024*1024){failure();return;}
    converted=true;
    try{FS.writeFile('/tmp/input.'+value.extension,new Uint8Array(value.data));unoPort.postMessage({cmd:'convert',extension:value.extension});}catch{failure();}
  };
  control.onmessageerror=()=>failure();
  try{void initialize(profile(message)).catch(()=>failure('ENGINE_FAILED'));}catch{failure();}
});
