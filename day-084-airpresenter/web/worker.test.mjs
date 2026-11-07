import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {Miniflare, Log, LogLevel, convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {SECURITY_HEADERS} from './policy.mjs';
import {chromium} from '@playwright/test';

const ORIGIN = 'https://airpresenter.test';
const API = ORIGIN + '/100days/day-084-airpresenter/api';
const WORKER_NAME = 'day084-relay-test';
let mf, browser, clientNumber = 1;
const liveSockets = new Set();
const options = (extra = {}) => convertV4MiniflareOptions({
  name: WORKER_NAME,
  unsafeInspectDurableObjects: true,
  modulesRoot: fileURLToPath(new URL('.', import.meta.url)),
  modules: ['worker.mjs','policy.mjs','office-assets.mjs'].map(name => ({type:'ESModule',path:fileURLToPath(new URL('./'+name,import.meta.url))})),
  compatibilityDate: '2026-11-01',
  durableObjects: {ROOMS: {className: 'PresentationRoom', useSQLite: true}},
  ratelimits: {CREATE_LIMIT: {namespace_id: '840084', simple: {limit: 6, period: 60}}},
  log: new Log(LogLevel.NONE),
  ...extra,
});

before(async () => {
  mf = new Miniflare(options()); await mf.ready;
  browser = await chromium.launch({headless:true,...(process.env.CI ? {} : {channel:'chrome'})});
});
after(async () => {
  for (const ws of liveSockets) {try {ws.close(1000, 'test complete');} catch {}}
  await browser?.close();
  await mf?.dispose();
});

async function create(instance = mf, overrides = {}) {
  const response = await instance.dispatchFetch(API + '/rooms', {
    method: 'POST',
    headers: {Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.' + clientNumber++, ...overrides.headers},
    body: '{}',
    ...overrides,
  });
  return response;
}
async function room(instance = mf) {
  const response = await create(instance);
  assert.equal(response.status, 201, 'room creation returns 201');
  return response.json();
}
function track(ws) {
  const frames = [], waiting = [];
  let closed;
  const close = new Promise(resolve => {ws.addEventListener('close', event => {closed = event; resolve(event);});});
  ws.addEventListener('message', event => {
    let frame;
    try {frame = JSON.parse(event.data);} catch {return;}
    frames.push(frame);
    for (const pending of [...waiting]) {
      const index = frames.findIndex(pending.predicate);
      if (index !== -1) {waiting.splice(waiting.indexOf(pending), 1); clearTimeout(pending.timer); pending.resolve(frames.splice(index, 1)[0]);}
    }
  });
  if (typeof ws.accept === 'function') ws.accept();
  liveSockets.add(ws);
  return {ws, frames, close, next(predicate) {
    const index = frames.findIndex(predicate);
    if (index !== -1) return Promise.resolve(frames.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const pending = {predicate, resolve, timer: setTimeout(() => {waiting.splice(waiting.indexOf(pending), 1); reject(new Error('Expected WebSocket frame was not received'));}, 3000)};
      waiting.push(pending);
    });
  }, async waitClose() {
    if (closed) return closed;
    let timer;
    try {return await Promise.race([close, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('WebSocket was not closed')), 3000);})]);}
    finally {clearTimeout(timer);}
  }};
}
// Use the real TCP/WebSocket client: Miniflare 5's fetch-pair adapter does not
// reliably emit HTTP/alarm initiated closes. Those paths use Chrome below.
async function open(data, role, instance = mf) {
  const origin = (await instance.ready).origin;
  const url = origin.replace('http', 'ws') + `/100days/day-084-airpresenter/api/rooms/${data.room}/socket`;
  const ws = new WebSocket(url, {protocols: ['airpresenter.v1', 'credential.' + (role === 'host' ? data.hostToken : data.remoteToken)], headers: {Origin: origin}});
  const tracked = track(ws);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Authenticated socket did not open')), 3000);
    ws.addEventListener('open', () => {clearTimeout(timer); resolve();}, {once: true});
    ws.addEventListener('error', () => {clearTimeout(timer); reject(new Error('Authenticated socket was rejected'));}, {once: true});
  });
  assert.equal(ws.protocol, 'airpresenter.v1');
  return tracked;
}

function packet(bytes = 64) {return {type: 'packet', iv: Buffer.alloc(12, 1).toString('base64url'), data: Buffer.alloc(bytes, 2).toString('base64url')};}
function wsSend(socket, frame) {socket.ws.send(JSON.stringify(frame));}
async function closeRoom(data, token = data.hostToken, instance = mf) {
  return instance.dispatchFetch(`${API}/rooms/${data.room}`, {method: 'DELETE', headers: {Origin: ORIGIN, Authorization: 'Bearer ' + token}});
}

// Server-initiated closes are asserted with a real browser, including the
// browser's native close handshake. The exact close codes are not relaxed.
async function nativeScenario(mode, instance = mf) {
  const origin = (await instance.ready).origin;
  const page = await browser.newPage();
  try {
    await page.goto(origin + '/100days/day-084-airpresenter/');
    return await page.evaluate(async mode => {
      const api = '/100days/day-084-airpresenter/api';
      const response = await fetch(api + '/rooms', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if (response.status !== 201) throw new Error('Browser room creation failed');
      const data = await response.json();
      const open = async role => {
        const ws = new WebSocket(location.origin.replace('http','ws') + api + '/rooms/' + data.room + '/socket', ['airpresenter.v1','credential.' + data[role + 'Token']]);
        const frames = [], waiters = [];
        const closed = new Promise(resolve => ws.addEventListener('close',event => resolve(event.code),{once:true}));
        ws.addEventListener('message', event => {
          const value = JSON.parse(event.data); frames.push(value);
          for (const waiter of [...waiters]) {
            const index = frames.findIndex(waiter.predicate);
            if (index !== -1) {waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(frames.splice(index,1)[0]);}
          }
        });
        await new Promise((resolve,reject) => {ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',() => reject(new Error('Browser socket failed')),{once:true});});
        return {ws,closed,next(predicate) {
          const index=frames.findIndex(predicate);
          if (index !== -1) return Promise.resolve(frames.splice(index,1)[0]);
          return new Promise(resolve=>waiters.push({predicate,resolve}));
        }};
      };
      const wait = promise => Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve('timeout'),3000))]);
      const remove = token => fetch(api + '/rooms/' + data.room,{method:'DELETE',headers:{Authorization:'Bearer ' + token}});
      const host = await open('host');
      if (mode === 'expiry') {
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,data.expiresAt-Date.now()+50)));
        host.ws.send(JSON.stringify({type:'packet',iv:'AAAAAAAAAAAAAAAA',data:'A'.repeat(32)}));
        const code=await wait(host.closed);
        const status=await fetch(api+'/rooms/'+data.room+'/status',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.hostToken},body:'{}'});
        return {room:data.room,code,status:status.status,expiresAt:data.expiresAt};
      }
      const old = await open('remote');
      if (mode === 'replacement') {
        const fresh=await open('remote');
        const code=await wait(old.closed);
        const presence=await wait(fresh.next(value=>value.type==='presence'));
        const receiving=host.next(value=>value.type==='packet');
        fresh.ws.send(JSON.stringify({type:'packet',iv:'AAAAAAAAAAAAAAAA',data:'A'.repeat(32)}));
        const packet=await wait(receiving);
        await remove(data.hostToken);
        return {code,presence,from:packet?.from};
      }
      const remoteStatus=(await remove(data.remoteToken)).status;
      const badStatus=(await remove('A'.repeat(43))).status;
      const ended=(await remove(data.hostToken)).status;
      return {room:data.room,remoteStatus,badStatus,ended,hostCode:await wait(host.closed),remoteCode:await wait(old.closed),reused:(await remove(data.hostToken)).status};
    },mode);
  } finally {await page.close();}
}

// 3.1, 3.3, 3.5: generated credentials and only hashed authorization are persisted.
test('room credentials have separate roles, four-hour expiry, no-store, and hash-only SQLite storage', async () => {
  const response = await create();
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.ok(/^[a-f0-9]{32}$/.test(data.room), '128-bit opaque room id');
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(data.hostToken), '256-bit host credential');
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(data.remoteToken), '256-bit remote credential');
  assert.ok(data.hostToken !== data.remoteToken, 'separate role credentials');
  assert.ok(data.expiresAt > Date.now() + 14_390_000 && data.expiresAt <= Date.now() + 14_400_000);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Referrer-Policy'), SECURITY_HEADERS['Referrer-Policy']);
  const storage = await mf.unsafeGetDurableObjectStorage(WORKER_NAME, 'PresentationRoom', {name: data.room});
  const rows = await storage.exec('SELECT * FROM session');
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'expiresAt', 'hostHash', 'id', 'remoteHash'].sort());
  assert.ok(/^[a-f0-9]{64}$/.test(row.hostHash) && /^[a-f0-9]{64}$/.test(row.remoteHash));
  const persisted = JSON.stringify(rows);
  assert.ok(!persisted.includes(data.hostToken) && !persisted.includes(data.remoteToken));
  await closeRoom(data);
});

// 3.1, 4.3: cross-origin and malformed or oversized requests never create a room.
test('room creation checks Origin, JSON shape, request size, and unsupported methods', async () => {
  assert.equal((await create(mf, {headers: {Origin: 'https://other.test', 'Content-Type': 'application/json'}})).status, 403);
  assert.equal((await create(mf, {headers: {'Content-Type': 'application/json'}})).status, 403);
  assert.equal((await create(mf, {headers: {Origin: ORIGIN, 'Content-Type': 'text/plain'}})).status, 415);
  assert.equal((await create(mf, {body: '{'})).status, 400);
  assert.equal((await create(mf, {body: '[]'})).status, 400);
  assert.equal((await create(mf, {body: '{"expiresAt":9999999999999}'})).status, 400);
  assert.equal((await create(mf, {body: ' '.repeat(2049)})).status, 413);
  assert.equal((await mf.dispatchFetch(API + '/rooms', {method: 'GET'})).status, 405);
});

test('room creation is limited to six requests per client in sixty seconds', async () => {
  const ip = '198.51.100.84';
  for (let n = 0; n < 6; n++) {
    const response = await create(mf, {headers: {Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip}});
    assert.equal(response.status, 201);
  }
  const response = await create(mf, {headers: {Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip}});
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
});

test('missing authorization, wrong-room credentials, origin, protocol, and query credentials are rejected', async () => {
  const first = await room(), second = await room();
  const url = `${API}/rooms/${second.room}/socket`;
  const headers = {Origin: ORIGIN, Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `airpresenter.v1, credential.${first.hostToken}`};
  assert.equal((await mf.dispatchFetch(url, {headers})).status, 401);
  assert.equal((await mf.dispatchFetch(url, {headers: {Origin: ORIGIN, Upgrade: 'websocket'}})).status, 401);
  assert.equal((await mf.dispatchFetch(url, {headers: {...headers, Origin: 'https://other.test'}})).status, 403);
  assert.equal((await mf.dispatchFetch(url, {headers: {...headers, 'Sec-WebSocket-Protocol': 'airpresenter.v0, credential.' + second.hostToken}})).status, 401);
  assert.equal((await mf.dispatchFetch(url + '?token=forbidden', {headers})).status, 400);
  assert.equal((await mf.dispatchFetch(`${API}/rooms/${'f'.repeat(32)}/socket`, {headers})).status, 404);
  await closeRoom(first); await closeRoom(second);
});

test('authenticated status exposes only role and expiry and rejects old or unauthorized links', async () => {
  const data=await room(), other=await room();
  const status=(token, target=data, changes={})=>mf.dispatchFetch(`${API}/rooms/${target.room}/status`,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',...changes});
  for (const role of ['host','remote']) {
    const response=await status(data[role+'Token']);
    assert.equal(response.status,200);
    const value=await response.json();
    assert.deepEqual(Object.keys(value).sort(),['expiresAt','role']);
    assert.equal(value.role,role);assert.equal(value.expiresAt,data.expiresAt);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal((await status('A'.repeat(43))).status,401);
  assert.equal((await status(other.hostToken)).status,401);
  assert.equal((await status(data.hostToken,data,{body:'[]'})).status,400);
  assert.equal((await status(data.hostToken,data,{headers:{Origin:'https://other.test','Content-Type':'application/json',Authorization:'Bearer '+data.hostToken}})).status,403);
  assert.equal((await status(data.hostToken,data,{method:'GET',body:undefined})).status,405);
  await closeRoom(data);
  assert.equal((await status(data.hostToken)).status,404);
  assert.equal((await status(data.remoteToken)).status,404);
  await closeRoom(other);
});

// 3.1, 3.3: authenticated role is added by the server; payload remains opaque and unmodified.
test('authorized peers receive presence and opposite-role encrypted packets without plaintext persistence', async () => {
  const data = await room();
  const host = await open(data, 'host');
  await host.next(value => value.type === 'presence' && value.host === 1 && value.remote === 0);
  const remote = await open(data, 'remote');
  await host.next(value => value.type === 'presence' && value.host === 1 && value.remote === 1);
  await remote.next(value => value.type === 'presence' && value.host === 1 && value.remote === 1);
  const outgoing = packet(); wsSend(remote, outgoing);
  const received = await host.next(value => value.type === 'packet');
  assert.equal(received.from, 'remote');
  assert.ok(received.iv === outgoing.iv && received.data === outgoing.data, 'opaque ciphertext unchanged');
  const reverse = packet(100); wsSend(host, reverse);
  assert.equal((await remote.next(value => value.type === 'packet')).from, 'host');
  const storage = await mf.unsafeGetDurableObjectStorage(WORKER_NAME, 'PresentationRoom', {name: data.room});
  assert.ok(!JSON.stringify(await storage.exec('SELECT * FROM session')).includes(outgoing.data), 'ciphertext not persisted');
  await closeRoom(data);
});

test('same-role replacement closes the previous socket with 4001 and maintains one peer per role', async () => {
  const result = await nativeScenario('replacement');
  assert.equal(result.code,4001);
  assert.equal(result.presence.host,1); assert.equal(result.presence.remote,1);
  assert.equal(result.from,'remote');
});

test('normal disconnect updates presence and a new socket can reconnect', async () => {
  const data = await room();
  const host = await open(data, 'host'), remote = await open(data, 'remote');
  await host.next(value => value.type === 'presence' && value.remote === 1);
  remote.ws.close(1000, 'disconnect');
  await host.next(value => value.type === 'presence' && value.remote === 0);
  const reconnected = await open(data, 'remote');
  await reconnected.next(value => value.type === 'presence' && value.host === 1 && value.remote === 1);
  await closeRoom(data);
});

test('malformed, binary, and role-spoofing packets are closed rather than forwarded', async () => {
  for (const content of ['{', JSON.stringify({type:'packet',...packet(),from:'host'}), new Uint8Array([1,2,3]).buffer, JSON.stringify({type:'packet',iv:'bad',data:'AAAA'})]) {
    const data = await room();
    const remote = await open(data, 'remote');
    remote.ws.send(content);
    const event = await remote.waitClose();
    assert.ok([1003,1008].includes(event.code));
    await closeRoom(data);
  }
});

test('oversized frames close with 1009, while maximum browser plaintext budget stays within relay limit', async () => {
  const data = await room(), host = await open(data, 'host'), remote = await open(data, 'remote');
  const bounded = packet(47 * 1024 + 16);
  assert.ok(Buffer.byteLength(JSON.stringify({...bounded, from:'remote'})) <= 65536);
  wsSend(remote, bounded);
  await host.next(value => value.type === 'packet');
  remote.ws.send(JSON.stringify(packet(50 * 1024)));
  assert.equal((await remote.waitClose()).code, 1009);
  await closeRoom(data);
});

test('more than forty packets in one second closes the sender with 1008', async () => {
  const data = await room(), remote = await open(data, 'remote');
  const message = JSON.stringify(packet());
  for (let n = 0; n < 41; n++) remote.ws.send(message);
  assert.equal((await remote.waitClose()).code, 1008);
  await closeRoom(data);
});

// 3.5: only host can terminate; active sockets and persistent credentials are revoked.
test('host termination rejects remote and unknown tokens, closes both peers, deletes metadata, and invalidates links', async () => {
  const result=await nativeScenario('termination');
  assert.equal(result.remoteStatus,403); assert.equal(result.badStatus,401);
  assert.equal(result.ended,200); assert.equal(result.hostCode,4003); assert.equal(result.remoteCode,4003);
  assert.equal(result.reused,404);
  const storage=await mf.unsafeGetDurableObjectStorage(WORKER_NAME,'PresentationRoom',{name:result.room});
  assert.equal((await storage.exec("SELECT name FROM sqlite_master WHERE name='session'")).length,0);
});

test('short test-only TTL rejects expired activity, closes peers, and removes the SQLite session', async () => {
  const name='day084-expiry-test';
  const short=new Miniflare(options({name,bindings:{AIRPRESENTER_TEST_TTL_MS:'1200'}}));
  try {
    await short.ready;
    const result=await nativeScenario('expiry',short);
    assert.equal(result.code,4002);
    assert.ok([404,410].includes(result.status));
    const storage=await short.unsafeGetDurableObjectStorage(name,'PresentationRoom',{name:result.room});
    assert.equal((await storage.exec("SELECT name FROM sqlite_master WHERE name='session'")).length,0);
  } finally {await short.dispose();}
});

test('hibernating a room preserves role authentication and peer membership without message storage', async () => {
  const data = await room(), host = await open(data, 'host'), remote = await open(data, 'remote');
  await host.next(value => value.type === 'presence' && value.remote === 1);
  await mf.unsafeEvictDurableObject(WORKER_NAME, 'PresentationRoom', {name:data.room,webSockets:'hibernate'});
  const outgoing = packet(90); wsSend(remote,outgoing);
  assert.equal((await host.next(value => value.type === 'packet')).from,'remote');
  await closeRoom(data);
});

// Alarm delivery is explicit: this proves the real runtime's saved schedule and
// actual handler, without inventing a subsecond platform delivery guarantee.
test('saved alarm and explicit runtime delivery close idle Chrome peers and clear all authorization', async () => {
  const name='day084-alarm-handler-test';
  const alarmMf=new Miniflare(options({
    name,
    modules:['test-fixtures/alarm-worker.mjs','worker.mjs','policy.mjs','office-assets.mjs'].map(file=>({type:'ESModule',path:fileURLToPath(new URL('./'+file,import.meta.url))})),
    durableObjects:{ROOMS:{className:'AlarmTestRoom',useSQLite:true}},
    bindings:{AIRPRESENTER_TEST_TTL_MS:'1200'},
  }));
  let page;
  try {
    const origin=(await alarmMf.ready).origin;
    const data=await room(alarmMf);
    const storage=await alarmMf.unsafeGetDurableObjectStorage(name,'AlarmTestRoom',{name:data.room});
    const rows=await storage.exec('SELECT createdAt,expiresAt FROM session');
    assert.equal(rows[0].expiresAt-rows[0].createdAt,1200,'test TTL must actually be short');
    const bindings=await alarmMf.getBindings();
    const stub=bindings.ROOMS.getByName(data.room);
    assert.equal(await stub.getAlarmForTest(),data.expiresAt,'expiry alarm is persisted');
    page=await browser.newPage();await page.goto(origin+'/100days/day-084-airpresenter/');
    await page.evaluate(async data=>{
      const path='/100days/day-084-airpresenter/api/rooms/'+data.room+'/socket';
      const socket=new WebSocket(location.origin.replace('http','ws')+path,['airpresenter.v1','credential.'+data.hostToken]);
      window.testClosed=new Promise(resolve=>socket.addEventListener('close',event=>resolve(event.code),{once:true}));
      await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(new Error('Alarm test socket failed')),{once:true});});
    },{room:data.room,hostToken:data.hostToken});
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,data.expiresAt-Date.now()+50)));
    await stub.forceAlarmForTest();
    const code=await page.evaluate(()=>Promise.race([window.testClosed,new Promise(resolve=>setTimeout(()=>resolve('timeout'),3000))]));
    assert.equal(code,4002);
    assert.equal((await storage.exec("SELECT name FROM sqlite_master WHERE name='session'")).length,0);
    assert.equal(await stub.getAlarmForTest(),null);
    const response=await alarmMf.dispatchFetch(`${API}/rooms/${data.room}/status`,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',Authorization:'Bearer '+data.hostToken},body:'{}'});
    assert.equal(response.status,404);
  } finally {await page?.close();await alarmMf.dispose();}
});
