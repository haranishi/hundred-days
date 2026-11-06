const MAX_INPUT = 25 * 1024 * 1024;
const MAX_PDF = 64 * 1024 * 1024;
function fault(status,message) {return Object.assign(new Error(message),{status});}
function aborted() {return new DOMException('資料の読込を取り消しました。','AbortError');}
/** The engine receives document bytes in a local MessagePort, never in an HTTP request. */
export async function convertPowerPoint(file,{signal,onProgress=()=>{},fonts={fonts:[],families:[]}}={}) {
  if(signal?.aborted)throw aborted();
  if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw fault(422,'PowerPointの準備ができないブラウザーです。PCのChromeまたはEdgeで開き直してください。');
  if(!(file instanceof Blob)||!file.size||file.size>MAX_INPUT)throw fault(413,'25 MiB以下のPowerPointを選んでください。');
  const extension=/\.pptx$/i.test(file.name||'')?'pptx':/\.ppt$/i.test(file.name||'')?'ppt':null;
  if(!extension)throw fault(415,'PPTXまたはPPTを選んでください。');
  const data=await file.arrayBuffer();if(signal?.aborted)throw aborted();
  return new Promise((resolve,reject)=>{
    let settled=false,port,timer,started=false,ready=false;
    const frame=document.createElement('iframe');frame.hidden=true;frame.tabIndex=-1;frame.title='PowerPointの準備';frame.setAttribute('aria-hidden','true');
    frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    const url=new URL('office/engine.html',import.meta.url),job=crypto.randomUUID();
    const cleanup=()=>{
      clearTimeout(timer);signal?.removeEventListener('abort',abort);port?.close();
      try {frame.contentWindow?.disposeAirPresenterOffice?.();}catch{}frame.remove();
    };
    const finish=(error,value)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(value);};
    const abort=()=>finish(aborted());
    const deadline=(ms,message)=>{clearTimeout(timer);timer=setTimeout(()=>finish(fault(504,message)),ms);};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    deadline(180000,'PowerPointの表示エンジンを準備できませんでした。通信を確認して選び直してください。');
    onProgress({stage:'loading_engine',completed:0,total:null});
    frame.onload=()=>{
      if(settled||started)return;started=true;
      const channel=new MessageChannel();port=channel.port1;
      port.onmessageerror=()=>finish(fault(422,'PowerPointの読込を確認できませんでした。選び直してください。'));
      port.onmessage=event=>{
        if(settled)return;const message=event.data;
        if(!message||message.job!==job||typeof message.type!=='string')return;
        if(message.type==='progress'&&['loading_engine','initializing_engine'].includes(message.stage))onProgress({stage:message.stage,completed:0,total:null});
        else if(message.type==='ready'){
          deadline(120000,'PowerPointの処理に時間がかかりすぎました。資料を分けるか、選び直してください。');
          onProgress({stage:'converting',completed:0,total:null});
          port.postMessage({type:'convert',job,extension,data},[data]);
        }else if(message.type==='count'){
          if(!Number.isInteger(message.total)||message.total<1||message.total>100){finish(fault(413,'100ページ以下のPowerPointを選んでください。'));return;}
          onProgress({stage:'converting',completed:0,total:message.total});
        }else if(message.type==='result'){
          if(!(message.data instanceof ArrayBuffer)||!message.data.byteLength||message.data.byteLength>MAX_PDF){finish(fault(413,'表示用の資料が大きすぎます。PowerPointを分けて選んでください。'));return;}
          finish(null,new Blob([message.data],{type:'application/pdf'}));
        }else if(message.type==='error'){
          finish(fault(message.code==='PAGE_LIMIT'?413:422,message.code==='PAGE_LIMIT'?'100ページ以下のPowerPointを選んでください。':'PowerPointを読み込めませんでした。パスワードを解除して保存し直すか、別の資料を選んでください。'));
        }
      };
      const payload={type:'AIRPRESENTER_OFFICE_INIT',job,fonts:fonts.fonts||[],families:fonts.families||[]};
      try {frame.contentWindow.postMessage(payload,url.origin,[channel.port2,...payload.fonts.map(font=>font.data)]);}
      catch{finish(fault(422,'PowerPointの準備を開始できませんでした。選び直してください。'));}
    };
    frame.onerror=()=>finish(fault(503,'PowerPointの表示エンジンを読み込めませんでした。通信を確認してください。'));
    frame.src=url.href;document.body.append(frame);
  });
}
