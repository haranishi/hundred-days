import { LIMITS } from './contract.js';
import { validateTarget } from './target-guard.js';
import { runTrace, runAround } from './observe.js';
import { fetchRegistration } from './rdap.js';

export function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff',
    // S4: 結果の一時保持は内部Cache APIに限り、端末・中間には保存させない。
    'Cross-Origin-Resource-Policy':'same-origin',...extra,'Cache-Control':'no-store'
  }});
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),x => x.toString(16).padStart(2,'0')).join('');
}
const clock = ctx => typeof ctx.now === 'function' ? ctx.now() : Date.now();
async function put(ctx, key, data, ttl) {
  const response = new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age='+ttl}});
  const promise = ctx.cache.put(key,response);
  if (ctx.waitUntil) ctx.waitUntil(promise);
  // レート制限の次の呼出しが古い値を読む窓を小さくする。
  await promise;
}
async function read(ctx,key) {
  try { const hit = await ctx.cache.match(key); return hit ? await hit.json() : null; } catch { return null; }
}
function cacheKey(kind,digest) {
  // BG追加: 内部キャッシュの鍵を、外部から取得できる自サイトのURLと分離する。
  return new Request(new URL('/day-074/'+kind+'/'+digest,{origin:'https://cache.invalid'}.origin));
}
const locks = new WeakMap();
async function rateLimit(request,ctx) {
  if (!ctx.cache) return null;
  const previous = locks.get(ctx.cache) ?? Promise.resolve();
  let release;
  const lock = new Promise(resolve => {release=resolve;});
  const chain = previous.then(() => lock);
  locks.set(ctx.cache,chain);
  await previous;
  try {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const digest = (await hash(ip)).slice(0,32);
    const minute = Math.floor(clock(ctx)/60000);
    const key = cacheKey('rate',digest+'-'+minute);
    const stored = await read(ctx,key);
    const count = stored?.minute === minute ? stored.count : 0;
    const configured = ctx.env?.LINK_DOKUMI_RATE_LIMIT;
    const rate = typeof configured === 'string' && /^\d+$/.test(configured) && +configured >= 1 && +configured <= 1000 ? +configured : LIMITS.RATE_PER_MINUTE;
    if (count >= rate) return jsonResponse({error:'rate_limited'},429,{'Retry-After':String(Math.max(1,60-Math.floor(clock(ctx)/1000)%60))});
    await put(ctx,key,{minute,count:count+1},LIMITS.RATE_KEEP_S);
    return null;
  } finally {release();if (locks.get(ctx.cache) === chain) locks.delete(ctx.cache);}
}
async function preflight(request,ctx) {
  if (request.method !== 'GET') return jsonResponse({error:'method_not_allowed'},405,{'Allow':'GET'});
  if (ctx.env?.LINK_DOKUMI_DISABLED === '1') return jsonResponse({error:'disabled'},503);
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin','none'].includes(site)) return jsonResponse({error:'forbidden'},403);
  return null;
}
function cacheableTrace(result) {
  return result.ok || ['invalid_url','blocked_target','blocked_redirect','too_many_redirects'].includes(result.error?.code);
}
export async function handleTrace(request, ctx = {}) {
  try {
    const rejected = await preflight(request,ctx);
    if (rejected) return rejected;
    const raw = new URL(request.url).searchParams.get('url');
    if (!raw || raw.length > LIMITS.MAX_URL_LENGTH) return jsonResponse({error:'invalid_url'},400);
    const limited = await rateLimit(request,ctx);
    if (limited) return limited;
    const selfHosts = [...(ctx.selfHosts ?? []),new URL(request.url).hostname];
    const target = validateTarget(raw,{selfHosts});
    const normalized = target.ok ? target.url.href : raw;
    const key = ctx.cache ? cacheKey('trace',await hash(normalized)) : null;
    if (key) {
      const hit = await read(ctx,key);
      if (hit && hit.expiresAt > clock(ctx)) return jsonResponse({...hit.data,cached:true});
    }
    const result = await runTrace(raw,{...ctx,selfHosts});
    if (key && cacheableTrace(result)) await put(ctx,key,{data:result,expiresAt:clock(ctx)+LIMITS.CACHE_TTL_S*1000},LIMITS.CACHE_TTL_S);
    return jsonResponse(result);
  } catch { return jsonResponse({error:'internal_error'},500); }
}
export async function handleAround(request,ctx = {}) {
  try {
    const rejected = await preflight(request,ctx);
    if (rejected) return rejected;
    const params = new URL(request.url).searchParams;
    const host=params.get('host'),scheme=params.get('scheme');
    // N4: 診断先に断られた（403・429・ボット対策）あとは、画面が site=0 を付けて、診断先への追加のアクセス（http側・security.txt）を省く。DNSと登録日は公開サービスへの問い合わせなので続ける。
    const skipSite=params.get('site')==='0';
    if (!host || host.length > 253 || !scheme || scheme.length > 5) return jsonResponse({error:'invalid_url'},400);
    const limited = await rateLimit(request,ctx);
    if (limited) return limited;
    const registration = async (registrable,deps) => {
      if (!ctx.cache) return fetchRegistration(registrable,deps);
      const key = cacheKey('rdap',await hash(registrable));
      const hit = await read(ctx,key);
      if (hit?.expiresAt > clock(ctx)) return hit.data;
      const result = await fetchRegistration(registrable,deps);
      if (!result.unavailable || ['unsupported','not_found'].includes(result.unavailable)) await put(ctx,key,{data:result,expiresAt:clock(ctx)+86400000},86400);
      return result;
    };
    const result = await runAround({host,scheme},{...ctx,skipSite,selfHosts:[...(ctx.selfHosts ?? []),new URL(request.url).hostname],registration});
    return jsonResponse(result);
  } catch { return jsonResponse({error:'internal_error'},500); }
}
