// APIだけを守る。静的ページや共有プレビューには適用しない。
const MINUTE_MS = 60_000;
const BURST_MS = 10_000;
const MAX_MINUTE = 60;
const MAX_BURST = 20;
const WORKER_IP = '2a06:98c0:3600::103';
const PROXY_ORIGINS = new Set(['https://rairakku.com', 'https://www.rairakku.com']);
const encoder = new TextEncoder();

function denied(status, error, seconds, extra = {}) {
  return new Response(JSON.stringify({ error }), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...extra,
    ...(seconds ? { 'Retry-After': String(seconds) } : {}),
  } });
}
const unavailable = () => denied(503, 'temporarily_unavailable', 10);
const hex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
const digest = value => crypto.subtle.digest('SHA-256', encoder.encode(value)).then(hex);
const decodeHex = value => Uint8Array.from(value.match(/../g), x => parseInt(x, 16));

export function browserRejection(request) {
  if (request.method !== 'GET') return denied(405, 'method_not_allowed', 0, { Allow: 'GET' });
  if (request.url.length > 8192) return denied(414, 'request_too_large');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && !PROXY_ORIGINS.has(origin)) {
    return denied(403, 'forbidden');
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site) && !PROXY_ORIGINS.has(origin)) {
    return denied(403, 'forbidden');
  }
  return null;
}

function fresh(time) {
  return { minute: Math.floor(time / MINUTE_MS), minuteCount: 0,
    burst: Math.floor(time / BURST_MS), burstCount: 0 };
}
function rotate(counter, time) {
  const current = fresh(time);
  return { ...current,
    minuteCount: counter.minute === current.minute ? counter.minuteCount : 0,
    burstCount: counter.burst === current.burst ? counter.burstCount : 0 };
}
function retry(counter, time) {
  const waits = [];
  if (counter.minuteCount >= MAX_MINUTE) waits.push(MINUTE_MS - time % MINUTE_MS);
  if (counter.burstCount >= MAX_BURST) waits.push(BURST_MS - time % BURST_MS);
  return waits.length ? Math.max(1, Math.ceil(Math.max(...waits) / 1000)) : 0;
}
function validCounter(counter) {
  return counter && ['minute', 'minuteCount', 'burst', 'burstCount'].every(key =>
    Number.isSafeInteger(counter[key]) && counter[key] >= 0);
}

export function createApiGuard({ cache, now = Date.now, maxClients = 2048 } = {}) {
  const clients = new Map();
  let sweepAt = 0, savedSecret, savedKey;
  async function identity(request, env, time) {
    const id = request.headers.get('x-hundred-client');
    const stamp = request.headers.get('x-hundred-time');
    const signature = request.headers.get('x-hundred-signature');
    const ip = request.headers.get('cf-connecting-ip')?.trim().toLowerCase();
    if (id !== null || stamp !== null || signature !== null) {
      const secret = env?.HUNDRED_DAYS_API_PROXY_SECRET;
      if (typeof secret !== 'string' || secret.length < 32) return unavailable();
      if (!/^[a-f0-9]{64}$/.test(id ?? '') || !/^\d{1,12}$/.test(stamp ?? '')
        || !/^[a-f0-9]{64}$/.test(signature ?? '')
        || Math.abs(time / 1000 - Number(stamp)) > 30) return denied(403, 'invalid_proxy');
      if (savedSecret !== secret) {
        savedKey = await crypto.subtle.importKey('raw', encoder.encode(secret),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        savedSecret = secret;
      }
      const url = new URL(request.url);
      const message = JSON.stringify(['hundred-days-api-v1', stamp, id, request.method, url.pathname + url.search]);
      const verified = await crypto.subtle.verify('HMAC', savedKey, decodeHex(signature), encoder.encode(message));
      return verified ? id : denied(403, 'invalid_proxy');
    }
    // 別ゾーンWorkerの共通IPを「全利用者のIP」にしない。正規の中継は署名で識別する。
    if (ip === WORKER_IP) return denied(403, 'proxy_verification_required');
    if ((!ip && request.cf) || (ip && ip.length > 128)) return unavailable();
    return digest(ip || 'local-without-client-ip');
  }

  return async function guard(context) {
    const { request } = context;
    if (!new URL(request.url).pathname.startsWith('/api/')) return context.next();
    if (context.env?.PUBLIC_APIS_DISABLED === '1') return denied(503, 'temporarily_unavailable', 60);
    const rejected = browserRejection(request);
    if (rejected) return rejected;
    let state, release;
    try {
      const store = cache === undefined ? globalThis.caches?.default : cache;
      if (!store) return unavailable();
      const receivedAt = now();
      const id = await identity(request, context.env, receivedAt);
      if (id instanceof Response) return id;
      // 非同期の識別中に窓が進むため、予約時点の時刻を使う。
      const time = now();
      if (time >= sweepAt || clients.size >= maxClients) {
        for (const [key, value] of clients) {
          if (!value.pending && value.expiresAt <= time) clients.delete(key);
        }
        sweepAt = time + BURST_MS;
      }
      state = clients.get(id);
      if (!state) {
        if (clients.size >= maxClients) return unavailable();
        state = { counter: fresh(time), expiresAt: 0, pending: 0, tail: Promise.resolve() };
        clients.set(id, state);
      }
      state.counter = rotate(state.counter, time);
      const wait = retry(state.counter, time);
      if (wait || state.pending >= MAX_BURST) return denied(429, 'rate_limited', wait || 10);
      // awaitより前に予約する。同じ実行環境の同時要求で上限を抜かせない。
      state.counter.minuteCount++;
      state.counter.burstCount++;
      state.expiresAt = (Math.floor(time / MINUTE_MS) + 1) * MINUTE_MS;
      state.pending++;
      const previous = state.tail;
      state.tail = new Promise(resolve => { release = resolve; });
      await previous;
      const key = new Request('https://api-abuse.invalid/v1/' + id);
      const hit = await store.match(key);
      let stored = hit ? await hit.json() : fresh(time);
      if (!validCounter(stored)) return unavailable();
      stored = rotate(stored, time);
      const cachedWait = retry(stored, time);
      if (cachedWait) return denied(429, 'rate_limited', cachedWait);
      stored.minuteCount++;
      stored.burstCount++;
      await store.put(key, new Response(JSON.stringify(stored), { headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=70',
      } }));
      // 後段の個別APIにも、検証済みの識別だけを渡す。
      (context.data ??= {}).apiAbuseClient = id;
      // Cache APIは拠点単位で非原子的。全世界での厳密な上限とは扱わない。
    } catch {
      return unavailable();
    } finally {
      if (release) { state.pending--; release(); }
    }
    return context.next();
  };
}

export const onRequest = createApiGuard();
