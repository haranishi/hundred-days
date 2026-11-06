const BASE = new URL('./', import.meta.url);
const API = new URL('api/rooms', BASE);
const encoder = new TextEncoder();
export const MAX_PLAINTEXT_BYTES = 47 * 1024;
const MAX_FRAME_BYTES = 64 * 1024;
const TERMINAL_CODES = new Set([4001, 4002, 4003]);
const TERMINAL_STATUS = new Set([401, 403, 404, 410]);
const ENDED = 'この接続は終了しています。PCで新しく始め、QRを読み直してください。';
const DISCONNECTED = '接続が切れました。つなぎ直しています…';
const id = () => crypto.randomUUID();
function fault(status, message) {return Object.assign(new Error(message), {status});}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw fault(400, '接続情報が無効です。PCのQRを読み直してください。');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

/** Credentials and the AES key live only in this closure. start() follows callback setup. */
export async function createSecureSession({onMessage = () => {}, onPresence = () => {}, onConnection = () => {}, onError = () => {}, onTerminal = () => {}} = {}) {
  if (!crypto.subtle) throw fault(503, '安全な接続でこのページを開いてください。');
  const url = new URL(location.href), fragment = new URLSearchParams(url.hash.slice(1));
  const role = url.searchParams.get('mode') === 'remote' || ['room','token','key'].some(name => fragment.has(name)) ? 'remote' : 'host';
  let room, token, key, remoteUrl = '', expiresAt = 0;
  if (role === 'remote') {
    const encodedKey = fragment.get('key');
    room = fragment.get('room'); token = fragment.get('token');
    history.replaceState(null, '', url.pathname + url.search);
    if (!/^[a-f0-9]{32}$/.test(room || '') || !/^[A-Za-z0-9_-]{43}$/.test(token || '') || !/^[A-Za-z0-9_-]{43}$/.test(encodedKey || '')) {
      throw fault(401, 'PC画面のQRを読み取って接続してください。');
    }
    const raw = decode(encodedKey);
    try {key = await crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);}
    finally {raw.fill(0);}
  } else {
    let response;
    try {response = await fetch(API, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(10000)});}
    catch {throw fault(503, '接続を準備できませんでした。通信を確認して再試行してください。');}
    if (!response.ok) throw fault(response.status, response.status === 429 ? '接続の準備が続いています。1分待って再試行してください。' : '接続を準備できませんでした。再試行してください。');
    const data = await response.json();
    if (!/^[a-f0-9]{32}$/.test(data.room || '') || !/^[A-Za-z0-9_-]{43}$/.test(data.hostToken || '') || !/^[A-Za-z0-9_-]{43}$/.test(data.remoteToken || '') || !Number.isSafeInteger(data.expiresAt)) throw fault(503, '接続を準備できませんでした。再試行してください。');
    room = data.room; token = data.hostToken; expiresAt = data.expiresAt;
    const raw = crypto.getRandomValues(new Uint8Array(32));
    try {
      key = await crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
      const link = new URL(BASE); link.searchParams.set('mode', 'remote');
      link.hash = new URLSearchParams({room, token:data.remoteToken, key:base64url(raw)}).toString();
      remoteUrl = link.href;
    } finally {raw.fill(0);}
  }

  let socket = null, connected = false, terminated = false, connecting = false, started = false;
  let epoch = 0, peerEpoch = 0, peerPresent = false, retry = 500, retryTimer, expiryTimer, socketTimer, statusAbort;
  let sendQueue = Promise.resolve(), receiveQueue = Promise.resolve(), sentAt = [];
  const pending = new Map();
  const roomUrl = new URL(API.href + '/' + room);
  const aad = from => encoder.encode(JSON.stringify([room, from]));
  function settle(commandId, error, value) {
    const waiter = pending.get(commandId);
    if (!waiter) return;
    pending.delete(commandId); clearTimeout(waiter.timer); waiter.cleanup();
    if (error) waiter.reject(error); else waiter.resolve(value);
  }
  function discardPending() {
    for (const commandId of pending.keys()) settle(commandId, fault(409, '接続が切れたため操作を取り消しました。接続後にもう一度操作してください。'));
  }
  function cancelTransport() {
    epoch++; peerEpoch++; peerPresent = false; connecting = false; connected = false;
    clearTimeout(retryTimer); clearTimeout(socketTimer);
    statusAbort?.abort(); statusAbort = null;
    const previous = socket; socket = null;
    try {previous?.close(1000, 'connection reset');} catch { /* A connecting socket may already be gone. */ }
    discardPending();
    // Future connections never wait for, or replay, work from an old socket.
    sendQueue = Promise.resolve(); receiveQueue = Promise.resolve(); sentAt = [];
  }
  function terminate(code = 4003, message = ENDED) {
    if (terminated) return;
    terminated = true; cancelTransport(); clearTimeout(expiryTimer);
    removeEventListener('offline', offline); removeEventListener('online', online);
    removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', visibility);
    token = ''; key = null; remoteUrl = '';
    onConnection(false, message); onTerminal(code);
  }
  function expiry() {
    clearTimeout(expiryTimer);
    if (!expiresAt || terminated) return;
    if (expiresAt <= Date.now()) {terminate(4002); return;}
    expiryTimer = setTimeout(() => terminate(4002), Math.min(expiresAt - Date.now(), 4 * 60 * 60 * 1000));
  }
  function reconnect(message = DISCONNECTED) {
    if (terminated) return;
    cancelTransport(); onConnection(false, message);
    if (expiresAt && Date.now() >= expiresAt) {terminate(4002); return;}
    if (!navigator.onLine) return;
    retryTimer = setTimeout(connect, retry); retry = Math.min(5000, retry * 2);
  }
  function presence(frame) {
    if (![frame.host,frame.remote].every(value => value === 0 || value === 1) || !Number.isSafeInteger(frame.expiresAt)) return;
    const present = frame[role === 'host' ? 'remote' : 'host'] === 1;
    if (peerPresent && !present) {
      // Losing the peer also invalidates work while this relay socket remains open.
      peerEpoch++; discardPending(); sendQueue = Promise.resolve(); receiveQueue = Promise.resolve();
    }
    peerPresent = present; expiresAt = frame.expiresAt; expiry();
    if (!terminated) onPresence({host:frame.host,remote:frame.remote,expiresAt});
  }
  async function receive(frame, attempt, peerGeneration) {
    if (attempt !== epoch || peerGeneration !== peerEpoch || terminated || !peerPresent) return;
    if (frame?.type !== 'packet' || frame.from !== (role === 'host' ? 'remote' : 'host')) return;
    try {
      const iv = decode(frame.iv), data = decode(frame.data);
      if (iv.byteLength !== 12 || data.byteLength < 16 || data.byteLength > MAX_PLAINTEXT_BYTES + 16) return;
      const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(frame.from)}, key, data);
      if (attempt !== epoch || peerGeneration !== peerEpoch || terminated || plain.byteLength > MAX_PLAINTEXT_BYTES) return;
      const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(plain));
      if (!value || !['COMMAND','STATE','SYNC','ACK'].includes(value.type)) return;
      await onMessage(value, frame.from);
      if (attempt !== epoch || peerGeneration !== peerEpoch || terminated) return;
      if (role === 'remote' && value.type === 'ACK' && typeof value.id === 'string') {
        settle(value.id, value.error ? fault(Number.isInteger(value.status) ? value.status : 400, String(value.error).slice(0,200)) : null, value);
      }
    } catch {
      if (attempt === epoch && peerGeneration === peerEpoch && !terminated) onError(fault(400, '接続情報を確認できません。PCのQRを読み直してください。'));
    }
  }
  async function connect() {
    if (terminated || connecting || connected || !navigator.onLine) return;
    clearTimeout(retryTimer);
    if (expiresAt && Date.now() >= expiresAt) {terminate(4002); return;}
    connecting = true;
    const attempt = ++epoch, controller = new AbortController(); statusAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(roomUrl.href + '/status', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',cache:'no-store',signal:controller.signal});
      if (attempt !== epoch || terminated) return;
      if (TERMINAL_STATUS.has(response.status)) {terminate(response.status === 410 ? 4002 : 4003); return;}
      if (!response.ok) {
        if (response.status >= 500) {reconnect(); return;}
        terminate(4003, '接続を準備できませんでした。PCのQRを読み直してください。'); return;
      }
      const status = await response.json();
      if (attempt !== epoch || terminated) return;
      if (status.role !== role || !Number.isSafeInteger(status.expiresAt)) {terminate(4003); return;}
      expiresAt = status.expiresAt; expiry(); if (terminated) return;
      const target = new URL(roomUrl.href + '/socket'); target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(target, ['airpresenter.v1', 'credential.'+token]); socket = ws;
      socketTimer = setTimeout(() => {if (attempt === epoch) reconnect();}, 10000);
      ws.addEventListener('open', () => {
        if (attempt !== epoch || terminated) {try {ws.close();} catch {} return;}
        clearTimeout(socketTimer); connecting = false; connected = true; retry = 500;
        onConnection(true);
      });
      ws.addEventListener('message', event => {
        if (attempt !== epoch || terminated || typeof event.data !== 'string' || encoder.encode(event.data).byteLength > MAX_FRAME_BYTES) return;
        let frame; try {frame=JSON.parse(event.data);} catch {return;}
        // Presence cannot wait behind encryption or a queued ACK: it cancels those tasks.
        if (frame?.type==='presence') {presence(frame);return;}
        const peerGeneration=peerEpoch;
        receiveQueue = receiveQueue.then(() => receive(frame,attempt,peerGeneration)).catch(() => {
          if (attempt === epoch && peerGeneration===peerEpoch && !terminated) onError(fault(400, '通信の内容を確認できませんでした。'));
        });
      });
      ws.addEventListener('close', event => {
        if (attempt !== epoch || terminated) return;
        if (TERMINAL_CODES.has(event.code)) terminate(event.code, event.code === 4001 ? '別の端末で接続しました。この端末の接続は終了しています。' : ENDED);
        else reconnect();
      });
      ws.addEventListener('error', () => { /* Native close or the handshake deadline drives one reconnect. */ });
    } catch {if (attempt === epoch && !terminated) reconnect();}
    finally {clearTimeout(timeout); if (statusAbort === controller) statusAbort = null;}
  }
  function offline() {cancelTransport(); if (!terminated) onConnection(false, 'オフラインです。通信を確認してください。');}
  function online() {if (started && !terminated) void connect();}
  function visibility() {if (!document.hidden) {expiry(); if (started && !terminated && !connected) void connect();}}
  function pagehide() {void close().catch(() => {});}
  function start() {
    if (started || terminated) return;
    started = true;
    addEventListener('offline', offline); addEventListener('online', online); addEventListener('pagehide', pagehide);
    document.addEventListener('visibilitychange', visibility);
    expiry(); if (!terminated) void connect();
  }
  function send(value) {
    const attempt = epoch, peerGeneration = peerEpoch, ws = socket;
    const result = sendQueue.then(async () => {
      if (terminated || !connected || !peerPresent || attempt !== epoch || peerGeneration !== peerEpoch || ws !== socket) throw fault(409, '接続後にもう一度操作してください。');
      let plain;
      try {plain = encoder.encode(JSON.stringify(value));} catch {throw fault(400, '通信する内容を確認してください。');}
      if (plain.byteLength > MAX_PLAINTEXT_BYTES) throw fault(413, '通信する内容が大きすぎます。カンペを短くしてください。');
      // Keep headroom for server scheduling and the relay's rolling forty-frame limit.
      while (true) {
        const now = performance.now(); sentAt = sentAt.filter(at => at > now - 1100);
        if (sentAt.length < 32) break;
        await new Promise(resolve => setTimeout(resolve, Math.max(1,1100 - now + sentAt[0])));
        if (terminated || !connected || !peerPresent || attempt !== epoch || peerGeneration !== peerEpoch || ws !== socket) throw fault(409,'接続が切れたため操作を取り消しました。');
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(role)}, key, plain);
      if (terminated || !connected || !peerPresent || attempt !== epoch || peerGeneration !== peerEpoch || ws !== socket) throw fault(409, '接続が切れたため操作を取り消しました。');
      const frame = {type:'packet',iv:base64url(iv),data:base64url(new Uint8Array(data))};
      if (encoder.encode(JSON.stringify({...frame,from:role})).byteLength > MAX_FRAME_BYTES) throw fault(413, '通信する内容が大きすぎます。');
      ws.send(JSON.stringify(frame)); sentAt.push(performance.now());
    });
    sendQueue = result.catch(() => {});
    return result;
  }
  function command(commandValue, {signal} = {}) {
    if (terminated || !connected || !peerPresent) return Promise.reject(fault(409, 'PCとの接続を確認してください。'));
    if (signal?.aborted) return Promise.reject(new DOMException('操作を取り消しました。', 'AbortError'));
    const commandId = id();
    return new Promise((resolve, reject) => {
      const abort = () => settle(commandId, new DOMException('操作を取り消しました。', 'AbortError'));
      const timer = setTimeout(() => {
        settle(commandId, fault(504, '操作の確認に時間がかかっています。接続後に状態を確認してください。'));
        reconnect();
      }, 5000);
      pending.set(commandId, {resolve,reject,timer,cleanup:() => signal?.removeEventListener('abort',abort)});
      signal?.addEventListener('abort', abort, {once:true});
      send({type:'COMMAND',id:commandId,command:commandValue}).catch(error => settle(commandId,error));
    });
  }
  async function close() {
    if (terminated) return;
    const revoke = role === 'host', credential = token;
    terminate(4003);
    if (!revoke) return;
    try {
      const response = await fetch(roomUrl, {method:'DELETE',headers:{Authorization:'Bearer '+credential},cache:'no-store',keepalive:true,signal:AbortSignal.timeout(10000)});
      if (!response.ok && ![404,410].includes(response.status)) throw new Error();
    } catch {throw fault(503, 'このタブの資料は消去しました。通信できなかった接続は最長4時間で終了します。');}
  }
  return {role,room,get expiresAt(){return expiresAt;},get remoteUrl(){return remoteUrl;},get connected(){return connected;},get terminated(){return terminated;},start,send,command,close};
}
