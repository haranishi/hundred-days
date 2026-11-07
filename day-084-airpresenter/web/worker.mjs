import {DurableObject} from 'cloudflare:workers';
import {APP_PATH, SECURITY_HEADERS} from './policy.mjs';
import {serveOfficeAsset} from './office-assets.mjs';

const API_PATH = APP_PATH + '/api';
const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_SECOND = 40;
const ROOM_ID = /^[a-f0-9]{32}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) {super(message); this.status = status;}
}
function json(status, value, extra = {}) {
  return Response.json(value, {status, headers: {...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...extra}});
}
function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new HttpError(403, 'このページから接続し直してください。');
  }
}
function randomId(bytes, hex = false) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  if (hex) return [...values].map(value => value.toString(16).padStart(2, '0')).join('');
  return btoa(String.fromCharCode(...values)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hashToken(token) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}
function hashEqual(actual, expected) {
  return crypto.subtle.timingSafeEqual(encoder.encode(actual), encoder.encode(expected));
}
async function emptyJson(request) {
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'JSON形式で接続を準備してください。');
  }
  if (Number(request.headers.get('Content-Length')) > 1024) throw new HttpError(413, '入力が大きすぎます。');
  const reader = request.body?.getReader();
  let size = 0, text = '';
  const decoder = new TextDecoder();
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024) {await reader.cancel(); throw new HttpError(413, '入力が大きすぎます。');}
        text += decoder.decode(chunk.value, {stream: true});
      }
      text += decoder.decode();
    } finally {reader.releaseLock();}
  }
  let parsed;
  try {parsed = JSON.parse(text);} catch {throw new HttpError(400, '入力を確認して再試行してください。');}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 0) {
    throw new HttpError(400, '入力を確認して再試行してください。');
  }
}
function credential(request) {
  const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(value => value.trim());
  if (protocols.length !== 2 || !protocols.includes('airpresenter.v1')) throw new HttpError(401, 'PCのQRを読み直してください。');
  const candidate = protocols.find(value => value.startsWith('credential.'))?.slice(11) || '';
  if (!TOKEN.test(candidate)) throw new HttpError(401, 'PCのQRを読み直してください。');
  return candidate;
}
function bearer(request) {
  const candidate = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!candidate) throw new HttpError(401, '接続情報が無効です。');
  return candidate;
}
function packetFrom(message) {
  if (typeof message !== 'string') throw {code: 1003, reason: 'テキスト形式の通信だけを受け付けます。'};
  if (encoder.encode(message).byteLength > MAX_FRAME_BYTES) throw {code: 1009, reason: '通信サイズの上限を超えました。'};
  let packet;
  try {packet = JSON.parse(message);} catch {throw {code: 1003, reason: '通信形式が不正です。'};}
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) ||
      Object.keys(packet).length !== 3 || packet.type !== 'packet' ||
      typeof packet.iv !== 'string' || packet.iv.length !== 16 || !BASE64URL.test(packet.iv) ||
      typeof packet.data !== 'string' || packet.data.length < 22 || packet.data.length % 4 === 1 || !BASE64URL.test(packet.data)) {
    throw {code: 1008, reason: '通信形式が不正です。'};
  }
  return packet;
}
function closeSocket(socket, code, reason) {
  try {socket.close(code, reason);} catch { /* A disconnected peer needs no further action. */ }
}

/** Each object stores authorization hashes and a fixed expiry, never user content. */
export class PresentationRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const tables = ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='session'").toArray();
    this.meta = tables.length ? ctx.storage.sql.exec('SELECT * FROM session WHERE id=1').toArray()[0] || null : null;
    this.closing = false;
  }

  /** Only the binding-owning Worker calls this RPC; there is no HTTP initialization route. */
  async initialize(hostHash, remoteHash, createdAt, expiresAt) {
    if (this.meta || this.closing || !HASH.test(hostHash) || !HASH.test(remoteHash) ||
        !Number.isSafeInteger(createdAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= createdAt || expiresAt - createdAt > ROOM_TTL_MS) {
      return false;
    }
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY CHECK(id=1), hostHash TEXT NOT NULL, remoteHash TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL)');
    this.ctx.storage.sql.exec('INSERT INTO session (id,hostHash,remoteHash,createdAt,expiresAt) VALUES (1,?,?,?,?)', hostHash, remoteHash, createdAt, expiresAt);
    this.meta = {id: 1, hostHash, remoteHash, createdAt, expiresAt};
    try {await this.ctx.storage.setAlarm(expiresAt);}
    catch (error) {await this.ctx.storage.deleteAll(); this.meta = null; throw error;}
    return true;
  }

  async active() {
    if (!this.meta || this.closing) throw new HttpError(404, 'この接続は終了しています。PCで新しく始めてください。');
    if (Date.now() >= this.meta.expiresAt) {
      await this.terminate(4002, '接続の有効期限が切れました。');
      throw new HttpError(410, '接続の有効期限が切れました。PCで新しく始めてください。');
    }
  }

  async roleFor(token) {
    await this.active();
    const value = await hashToken(token);
    await this.active();
    if (hashEqual(value, this.meta.hostHash)) return 'host';
    if (hashEqual(value, this.meta.remoteHash)) return 'remote';
    throw new HttpError(401, '接続情報が無効です。PCのQRを読み直してください。');
  }

  peers() {
    return this.ctx.getWebSockets().filter(socket => socket.readyState === WebSocket.OPEN && !socket.deserializeAttachment()?.replaced);
  }

  publishPresence() {
    if (!this.meta || this.closing) return;
    const peers = this.peers();
    const presence = JSON.stringify({type: 'presence', host: Number(peers.some(socket => socket.deserializeAttachment()?.role === 'host')), remote: Number(peers.some(socket => socket.deserializeAttachment()?.role === 'remote')), expiresAt: this.meta.expiresAt});
    for (const socket of peers) {
      try {socket.send(presence);} catch {closeSocket(socket, 1011, '接続を確認してください。');}
    }
  }

  async fetch(request) {
    try {
      sameOrigin(request);
      const url = new URL(request.url);
      if (url.search) throw new HttpError(400, '接続情報をURLのクエリに含めないでください。');
      await this.active();
      if (request.method === 'POST' && url.pathname.endsWith('/status')) {
        await emptyJson(request);
        const role = await this.roleFor(bearer(request));
        return json(200, {role, expiresAt: this.meta.expiresAt});
      }
      if (request.method === 'DELETE') {
        const role = await this.roleFor(bearer(request));
        if (role !== 'host') throw new HttpError(403, '発表PCから終了してください。');
        await this.terminate(4003, 'セッションを終了しました。');
        return json(200, {closed: true});
      }
      if (request.method !== 'GET' || !url.pathname.endsWith('/socket')) throw new HttpError(405, 'この操作は使えません。');
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'WebSocketで接続してください。');
      const role = await this.roleFor(credential(request));
      for (const socket of this.ctx.getWebSockets(role)) {
        const attachment = socket.deserializeAttachment();
        socket.serializeAttachment({...attachment, replaced: true});
        closeSocket(socket, 4001, '別の端末で接続しました。');
      }
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, [role]);
      server.serializeAttachment({role, times: [], replaced: false});
      this.publishPresence();
      return new Response(null, {status: 101, webSocket: client, headers: {...SECURITY_HEADERS, 'Cache-Control': 'no-store', 'Sec-WebSocket-Protocol': 'airpresenter.v1'}});
    } catch (error) {
      return json(error instanceof HttpError ? error.status : 503, {error: error instanceof HttpError ? error.message : '接続を準備できませんでした。しばらく待って再試行してください。'});
    }
  }

  async webSocketMessage(socket, message) {
    try {
      await this.active();
      const attachment = socket.deserializeAttachment();
      if (!attachment || attachment.replaced || !['host', 'remote'].includes(attachment.role)) {closeSocket(socket, 4001, '別の端末で接続しました。'); return;}
      const now = Date.now();
      const times = attachment.times.filter(time => time > now - 1000);
      if (times.length >= MAX_MESSAGES_PER_SECOND) {closeSocket(socket, 1008, '操作が多すぎます。しばらく待って再接続してください。'); return;}
      times.push(now);
      socket.serializeAttachment({...attachment, times});
      const packet = packetFrom(message);
      const forwarded = JSON.stringify({type: 'packet', from: attachment.role, iv: packet.iv, data: packet.data});
      if (encoder.encode(forwarded).byteLength > MAX_FRAME_BYTES) {closeSocket(socket, 1009, '通信サイズの上限を超えました。'); return;}
      for (const peer of this.peers()) {
        if (peer.deserializeAttachment().role === attachment.role) continue;
        try {peer.send(forwarded);} catch {closeSocket(peer, 1011, '接続を確認してください。');}
      }
    } catch (error) {
      closeSocket(socket, error instanceof HttpError ? 4002 : error?.code || 1011, error instanceof HttpError ? '接続は終了しています。' : error?.reason || '接続を確認してください。');
    }
  }

  webSocketClose(socket, code, reason) {
    closeSocket(socket, code >= 1000 && code < 5000 && ![1004,1005,1006,1015].includes(code) ? code : 1000, reason || '接続を終了しました。');
    this.publishPresence();
  }
  webSocketError(socket) {
    closeSocket(socket, 1011, '接続を確認してください。');
    this.publishPresence();
  }

  async terminate(code, reason) {
    if (this.closing) return;
    this.closing = true;
    try {
      await this.ctx.storage.deleteAll();
      this.meta = null;
      for (const socket of this.ctx.getWebSockets()) closeSocket(socket, code, reason);
      await this.ctx.storage.deleteAlarm();
    } finally {this.closing = false;}
  }

  async alarm() {
    if (this.meta && this.meta.expiresAt > Date.now()) {await this.ctx.storage.setAlarm(this.meta.expiresAt); return;}
    await this.terminate(4002, '接続の有効期限が切れました。');
  }
}

export default {
  async fetch(request, env) {
    try {
      const office = await serveOfficeAsset(request, env);
      if (office) return office;
      const url = new URL(request.url);
      if (!url.pathname.startsWith(API_PATH + '/')) return env.ASSETS ? env.ASSETS.fetch(request) : json(404, {error: 'ページがありません。'});
      if (url.search) throw new HttpError(400, '接続情報をURLのクエリに含めないでください。');
      if (url.pathname === API_PATH + '/rooms') {
        if (request.method !== 'POST') return json(405, {error: 'POSTで接続を準備してください。'}, {Allow: 'POST'});
        sameOrigin(request);
        await emptyJson(request);
        if (!env.CREATE_LIMIT || !env.ROOMS) throw new HttpError(503, '接続の準備中です。しばらく待って再試行してください。');
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const permitted = await env.CREATE_LIMIT.limit({key: ip});
        if (!permitted.success) return json(429, {error: '接続の準備が続いています。1分待って再試行してください。'}, {'Retry-After': '60'});
        const createdAt = Date.now();
        // This binding is intentionally absent from production config and only shortens runtime tests.
        const testTtl = Number(env.AIRPRESENTER_TEST_TTL_MS);
        const ttl = Number.isSafeInteger(testTtl) && testTtl >= 1000 ? Math.min(testTtl, ROOM_TTL_MS) : ROOM_TTL_MS;
        for (let attempt = 0; attempt < 3; attempt++) {
          const room = randomId(16, true), hostToken = randomId(32), remoteToken = randomId(32);
          const expiresAt = createdAt + ttl;
          const created = await env.ROOMS.getByName(room).initialize(await hashToken(hostToken), await hashToken(remoteToken), createdAt, expiresAt);
          if (created) return json(201, {room, hostToken, remoteToken, expiresAt});
        }
        throw new HttpError(503, '接続を準備できませんでした。再試行してください。');
      }
      const match = new RegExp('^' + API_PATH + '/rooms/([a-f0-9]{32})(/(?:socket|status))?$').exec(url.pathname);
      if (!match || !ROOM_ID.test(match[1])) return json(404, {error: '接続先がありません。'});
      if ((match[2] === '/socket' && request.method !== 'GET') || (match[2] === '/status' && request.method !== 'POST') || (!match[2] && request.method !== 'DELETE')) return json(405, {error: 'この操作は使えません。'});
      sameOrigin(request);
      return await env.ROOMS.getByName(match[1]).fetch(request);
    } catch (error) {
      return json(error instanceof HttpError ? error.status : 503, {error: error instanceof HttpError ? error.message : '接続できませんでした。しばらく待って再試行してください。'});
    }
  }
};
