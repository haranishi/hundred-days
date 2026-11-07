import {createSecureSession, MAX_PLAINTEXT_BYTES} from './session.js';
import {createThumbnail} from './pdf-import.js';
import {importPresentation} from './presentation-import.js';
import {resetLocalFonts} from './local-fonts.js';
import {qrcode} from './vendor/qrcode.mjs';

const BASE = new URL('./',import.meta.url);
const encoder = new TextEncoder();
function fault(status,message) {return Object.assign(new Error(message),{status});}
function json(value,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
function initialState() {
  return {revision:0,current:0,total:5,slides:[],notes:Array(5).fill(''),isBlackout:false,presentation:false,
    laser:{active:false,x:50,y:50},timer:{elapsedMs:0,startedAt:null},import:null,peers:{host:0,remote:0}};
}
function parseBody(body) {
  if (typeof body !== 'string' || encoder.encode(body).length > 32*1024) throw fault(400,'入力はJSONオブジェクトで指定してください。');
  let value; try {value = JSON.parse(body);} catch {throw fault(400,'入力を確認してください。');}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault(400,'入力を確認してください。');
  return value;
}
function blobDataUrl(blob) {
  return new Promise((resolve,reject) => {const reader = new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(fault(422,'プレビュー画像を作成できませんでした。'));reader.readAsDataURL(blob);});
}
function thumbnailBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl) || dataUrl.length > 28000) throw fault(400,'プレビュー画像が不正です。');
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',')+1)),char => char.charCodeAt(0));
  if (bytes.length > 20*1024) throw fault(413,'プレビュー画像が大きすぎます。');
  return new Blob([bytes],{type:'image/jpeg'});
}
function validWireState(state) {
  return state && Number.isSafeInteger(state.revision) && state.revision >= 0 && Number.isInteger(state.total) && state.total>=1 && state.total<=100 &&
    Number.isInteger(state.current) && state.current>=0 && state.current<state.total &&
    ['notes','slides'].every(name => Array.isArray(state[name]) && state[name].length === state.total && state[name].every((text,index) =>
      typeof text === 'string' && (index === state.current ? name==='notes' ? text.length<=4000 : !text || /^api\/slide\/[a-f0-9]{24}\/\d{1,2}$/.test(text) : text===''))) &&
    typeof state.isBlackout==='boolean' && typeof state.presentation==='boolean' && typeof state.laser?.active==='boolean' &&
    [state.laser.x,state.laser.y].every(n=>Number.isFinite(n) && n>=0 && n<=100) &&
    Number.isFinite(state.timer?.elapsedMs) && state.timer.elapsedMs>=0 && (state.timer.startedAt===null || Number.isFinite(state.timer.startedAt)) &&
    [state.peers?.host,state.peers?.remote].every(n=>n===0 || n===1) && Number.isFinite(state.serverNow);
}

/** Fulfil the existing UI API locally. Only encrypted current-page state reaches the relay. */
export async function createBrowserApi({onSnapshot = () => {}, onConnection = () => {}, onError = () => {}} = {}) {
  let state = initialState(), session, activeDeck = null, candidate = null, importAbort = null;
  let closed = false, qrUrl = '', qrBlob = null, laserOwner = null, laserTimer, hasRemoteState = false, synchronized = false;
  let wireQueue = Promise.resolve(), transportEpoch = 0, lastSentSlide = '', stateWireVersion = 0, remoteReceivedAt = performance.now();
  const remoteImages = new Map(), thumbnails = new Map(), processed = new Map();
  function snapshot() {
    return {...state,slides:[...state.slides],notes:[...state.notes],laser:{...state.laser},timer:{...state.timer},
      import:state.import ? {...state.import} : null,peers:{...state.peers},serverNow:session?.role==='remote' && hasRemoteState ? state.serverNow+Math.max(0,performance.now()-remoteReceivedAt) : Date.now()};
  }
  function notify() {onSnapshot(snapshot());}
  function publish({broadcast = true} = {}) {
    if (closed) return;
    state.revision++; state.serverNow = Date.now(); notify();
    if (broadcast && session?.role === 'host') void wire('STATE').catch(reportWire);
  }
  function reportWire(error) {if (!closed && error?.status !== 409) onError(fault(error?.status || 503,'スマホへの同期を確認できませんでした。接続後に状態を確認してください。'));}
  function stopLaser() {
    clearTimeout(laserTimer); laserOwner = null;
    if (!state.laser.active) return false;
    state.laser = {...state.laser,active:false}; return true;
  }
  function preview() {return candidate ? {id:candidate.id,total:candidate.total,slides:candidate.pages.map((_,page)=>`api/preview/${candidate.id}/${page}`)} : null;}
  function updateImport(id, patch) {
    if (closed || state.import?.id !== id) return;
    state.import = {...state.import,...patch,updatedAt:Date.now()}; publish();
  }
  function projected(currentState) {
    const notes = Array(currentState.total).fill(''), slides = Array(currentState.total).fill('');
    notes[currentState.current] = currentState.notes[currentState.current] || '';
    slides[currentState.current] = currentState.slides[currentState.current] || '';
    return {...currentState,notes,slides};
  }
  function wire(type, id, error, force = false) {
    if (closed || !session.connected || state.peers.remote !== 1) return Promise.resolve();
    const view = projected(snapshot()), epoch = transportEpoch;
    const version = type==='STATE' && !force ? ++stateWireVersion : null;
    const resource = view.slides[view.current], png = activeDeck?.pages[view.current];
    const result = wireQueue.then(async () => {
      if (closed || epoch !== transportEpoch || !session.connected || state.peers.remote !== 1 || (version!==null && version!==stateWireVersion)) return;
      const message = {type,...(id ? {id} : {}),state:view,...(error ? {error:error.message,status:error.status||400} : {})};
      if (resource && png && (force || resource !== lastSentSlide)) {
        const available = Math.min(20*1024,Math.floor((MAX_PLAINTEXT_BYTES-encoder.encode(JSON.stringify(message)).byteLength-256)*3/4));
        let thumbnail = thumbnails.get(resource);
        if (!thumbnail || thumbnail.bytes > available) {
          const blob = await createThumbnail(png,{maxBytes:available});
          thumbnail = {bytes:blob.size,dataUrl:await blobDataUrl(blob)};
          if (!closed && epoch === transportEpoch) thumbnails.set(resource,thumbnail);
        }
        message.thumbnail = {resource,dataUrl:thumbnail.dataUrl};
      }
      if (closed || epoch !== transportEpoch || !session.connected || (version!==null && version!==stateWireVersion)) return;
      await session.send(message); lastSentSlide = resource;
    });
    wireQueue = result.catch(() => {}); return result;
  }
  function applyCommand(command, role, {broadcast = true} = {}) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) throw fault(400,'操作を確認してください。');
    switch (command.type) {
      case 'NEXT': state.current = Math.min(state.total-1,state.current+1); break;
      case 'PREV': state.current = Math.max(0,state.current-1); break;
      case 'BLACKOUT': case 'PRESENTATION':
        if (typeof command.active !== 'boolean') throw fault(400,'切替状態が不正です。');
        state[command.type==='BLACKOUT'?'isBlackout':'presentation'] = command.active; break;
      case 'LASER':
        if (typeof command.active !== 'boolean') throw fault(400,'ポインター状態が不正です。');
        if (command.active) {
          if (![command.x,command.y].every(n=>typeof n==='number' && Number.isFinite(n) && n>=0 && n<=100)) throw fault(400,'ポインター位置が不正です。');
          state.laser = {active:true,x:command.x,y:command.y}; laserOwner = role;
          clearTimeout(laserTimer); laserTimer = setTimeout(()=>{if(stopLaser()) publish();},1500);
        } else if (role==='host' || laserOwner===role) stopLaser();
        break;
      case 'TIMER': {
        const now = Date.now();
        if (command.action==='start') {if(state.timer.startedAt===null) state.timer.startedAt=now;}
        else if (command.action==='pause') {if(state.timer.startedAt!==null) state.timer.elapsedMs+=Math.max(0,now-state.timer.startedAt);state.timer.startedAt=null;}
        else if (command.action==='reset') state.timer={elapsedMs:0,startedAt:null};
        else throw fault(400,'タイマー操作が不正です。');
        break;
      }
      case 'NOTE':
        if (role!=='host') throw fault(403,'カンペはPCで編集してください。');
        if (!Number.isInteger(command.page) || command.page<0 || command.page>=state.total || typeof command.text!=='string' || command.text.length>4000) throw fault(400,'カンペは4000文字以内で指定してください。');
        state.notes[command.page] = command.text; break;
      default: throw fault(400,'対応していない操作です。');
    }
    publish({broadcast}); return snapshot();
  }
  async function acceptWire(message) {
    const view = message.state, epoch = transportEpoch;
    if (!validWireState(view)) throw fault(400,'同期する状態が不正です。');
    if (hasRemoteState && view.revision < state.revision) return;
    const resource = view.slides[view.current];
    if (message.thumbnail) {
      if (message.thumbnail.resource!==resource) throw fault(400,'プレビュー画像のページが一致しません。');
      const blob = thumbnailBlob(message.thumbnail.dataUrl), bitmap = await createImageBitmap(blob);
      const valid = Math.max(bitmap.width,bitmap.height)<=480; bitmap.close();
      if (!valid) throw fault(400,'プレビュー画像が大きすぎます。');
      if (closed || epoch!==transportEpoch) return;
      if (resource.split('/')[2] !== [...remoteImages.keys()][0]?.split('/')[2]) remoteImages.clear();
      remoteImages.set(resource,blob);
    }
    if (resource && !remoteImages.has(resource)) throw fault(400,'プレビュー画像を再同期してください。');
    if (!resource) remoteImages.clear();
    if (closed || epoch!==transportEpoch) return;
    remoteReceivedAt=performance.now();
    state = {...view,slides:[...view.slides],notes:[...view.notes],laser:{...view.laser},timer:{...view.timer},peers:{...view.peers},import:view.import?{...view.import}:null};
    hasRemoteState = true; synchronized = true; notify();
  }
  function release() {
    if (closed) return;
    closed = true; transportEpoch++; importAbort?.abort(); importAbort = null; resetLocalFonts();
    stopLaser(); activeDeck?.dispose(); candidate?.dispose();activeDeck=candidate=null;
    remoteImages.clear(); thumbnails.clear(); processed.clear(); lastSentSlide='';
    qrBlob=null; if(qrUrl) URL.revokeObjectURL(qrUrl); qrUrl='';
    const revision=state.revision+1;state=initialState();state.revision=revision;notify();
  }
  session = await createSecureSession({
    onConnection(value,message) {
      transportEpoch++; wireQueue=Promise.resolve();lastSentSlide='';
      if (!closed) {
        if (!value) {stopLaser();synchronized=false;state.peers={host:0,remote:0};}
        else if (session.role==='host') state.peers={host:1,remote:0};
        if (session.role==='host') publish({broadcast:false});else notify();
      }
      onConnection(value,message);
    },
    onPresence(presence) {
      if (closed) return;
      const wasHost=state.peers.host, wasRemote=state.peers.remote;
      if ((session.role==='host' && wasRemote && !presence.remote) || (session.role==='remote' && wasHost && !presence.host)) {
        transportEpoch++; wireQueue=Promise.resolve();lastSentSlide='';synchronized=false;
      }
      state.peers={host:presence.host,remote:presence.remote};
      if (session.role==='host') {
        if (!presence.remote && laserOwner==='remote') stopLaser();
        publish({broadcast:false});
      } else {
        if (!presence.host) {state.laser={...state.laser,active:false};}
        notify();
        if (presence.host && !wasHost) void session.send({type:'SYNC',id:crypto.randomUUID()}).catch(reportWire);
      }
    },
    async onMessage(message,from) {
      if (closed) return;
      if (session.role==='host' && from==='remote') {
        if (message.type==='SYNC') {await wire('STATE',undefined,undefined,true);return;}
        if (message.type!=='COMMAND' || typeof message.id!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(message.id)) return;
        let error = processed.get(message.id);
        if (!processed.has(message.id)) {
          try {applyCommand(message.command,'remote',{broadcast:false});error=null;}
          catch (failure) {error=failure?.status ? failure : fault(400,'操作を確認してください。');}
          processed.set(message.id,error);
        }
        await wire('ACK',message.id,error); return;
      }
      if (session.role==='remote' && from==='host' && ['STATE','ACK'].includes(message.type) && message.state) await acceptWire(message);
    },
    onError,onTerminal:release,
  });
  if (session.role==='host') {
    const code=qrcode(0,'M');code.addData(session.remoteUrl,'Byte');code.make();
    qrBlob=new Blob([code.createSvgTag({cellSize:4,margin:16,scalable:true})],{type:'image/svg+xml'});qrUrl=URL.createObjectURL(qrBlob);
  }
  async function handle(resource,options={}) {
    if (options.signal?.aborted) throw new DOMException('操作を取り消しました。','AbortError');
    if (closed) throw fault(410,'この接続は終了しています。PCで新しく始めてください。');
    const url = new URL(resource,BASE);
    if (url.origin!==BASE.origin) throw fault(403,'このページの操作だけを指定してください。');
    const path = url.pathname.startsWith(BASE.pathname+'api/') ? url.pathname.slice(BASE.pathname.length-1) : url.pathname;
    const method = (options.method || 'GET').toUpperCase();
    if (path==='/api/info' && method==='GET') return json({state:snapshot(),...(session.role==='host'?{preview:preview()}: {})});
    const hostOnly = ['/api/qrcode','/api/upload','/api/accept','/api/discard'].includes(path) || path.startsWith('/api/preview/');
    if (hostOnly && session.role!=='host') throw fault(403,'PC専用の操作です。');
    if (path==='/api/qrcode' && method==='GET') return new Response(qrBlob,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store'}});
    if (path==='/api/command' && method==='POST') {
      const value = parseBody(options.body);
      if (session.role==='host') return json({state:applyCommand(value,'host')});
      if (value.type==='NOTE') throw fault(403,'カンペはPCで編集してください。');
      if (!session.connected || !state.peers.host || !synchronized) throw fault(409,'PCとの接続を確認してください。');
      await session.command(value,{signal:options.signal}); return json({state:snapshot()});
    }
    if (path==='/api/upload' && method==='POST') {
      if (importAbort) throw fault(409,'別の資料を読み込み中です。完了までお待ちください。');
      const headers = new Headers(options.headers), supplied = headers.get('X-AirPresenter-Import');
      if (supplied && !/^[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw fault(400,'資料の読込IDが不正です。');
      const id = supplied || crypto.randomUUID(), controller = new AbortController();importAbort=controller;
      const abort = () => controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
      candidate?.dispose();candidate=null;
      state.import={id,status:'processing',stage:'preparing',completed:0,total:null,startedAt:Date.now(),updatedAt:Date.now()};publish();
      try {
        const deck = await importPresentation(options.body,{signal:controller.signal,onProgress:progress=>updateImport(id,progress)});
        if (closed || controller.signal.aborted) {deck.dispose();throw new DOMException('資料の読込を取り消しました。','AbortError');}
        candidate=deck;updateImport(id,{status:'awaiting_confirmation',stage:'ready',completed:deck.total,total:deck.total});
        return json({state:snapshot(),preview:preview()});
      } catch (error) {
        updateImport(id,error?.name==='AbortError' ? {status:'discarded',stage:'ready'} : {status:'failed',stage:'failed',error:error?.status?error.message:'資料を読み込めませんでした。'});
        throw error;
      } finally {options.signal?.removeEventListener('abort',abort);if(importAbort===controller) importAbort=null;}
    }
    if (['/api/accept','/api/discard'].includes(path) && method==='POST') {
      if(importAbort) throw fault(409,'資料を読み込み中です。完了までお待ちください。');
      const body=parseBody(options.body);
      if(!candidate || candidate.id!==body.id) throw fault(404,'確認待ちの資料がありません。資料を選び直してください。');
      const deck=candidate;candidate=null;
      if(path==='/api/accept') {
        const previous=activeDeck;activeDeck=deck;stopLaser();thumbnails.clear();
        state={...state,current:0,total:deck.total,slides:deck.pages.map((_,page)=>`api/slide/${deck.id}/${page}`),notes:Array(deck.total).fill(''),isBlackout:false};
        updateImport(state.import.id,{status:'completed',stage:'ready',completed:deck.total,total:deck.total});previous?.dispose();
      } else {deck.dispose();updateImport(state.import.id,{status:'discarded',stage:'ready'});}
      return json({state:snapshot()});
    }
    const image=/^\/api\/(slide|preview)\/([a-f0-9]{24})\/(\d{1,2})$/.exec(path);
    if(image && method==='GET') {
      let blob;
      if (session.role==='remote') blob=image[1]==='slide'?remoteImages.get(`api/slide/${image[2]}/${image[3]}`):null;
      else {const deck=image[1]==='preview'?candidate:activeDeck;if(deck?.id===image[2]) blob=deck.pages[Number(image[3])];}
      if(!blob) throw fault(404,'このページはありません。');
      return new Response(blob,{headers:{'Content-Type':blob.type,'Cache-Control':'no-store'}});
    }
    throw fault(404,'この操作はありません。');
  }
  async function request(resource,options) {
    try {return await handle(resource,options);}
    catch(error) {
      if(error?.name==='AbortError') throw error;
      return json({error:error?.status?error.message:'処理を完了できませんでした。再試行してください。'},error?.status||500);
    }
  }
  async function close() {release();await session.close();}
  notify();session.start();
  return {session,get remoteUrl(){return closed?'':session.remoteUrl;},get qrUrl(){return qrUrl;},request,close};
}
