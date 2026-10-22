import { API_VERSION, LIMITS, HEADER_ALLOWLIST } from './contract.js';
import { validateTarget } from './target-guard.js';
import { resolvePublicHost, queryMailFacts } from './doh.js';
import { fetchRegistration } from './rdap.js';
import { extractHtmlFacts, decodeHtml } from './html-facts.js';
import { parseSetCookies } from './cookies.js';
import { clip, readCapped } from './sanitize.js';

const DEFAULTS = { userAgent:'LinkDokumi/1.0 (+https://hundred-days.pages.dev/day-074-link-dokumi/#fetcher)' };
const nowOf = deps => typeof deps.now === 'function' ? deps.now() : Date.now();
const headersOf = deps => ({'User-Agent':deps.userAgent ?? DEFAULTS.userAgent,Accept:'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1','Accept-Language':'ja,en;q=0.7'});
const elapsed = (start,deps) => Math.max(0,Math.round(nowOf(deps)-start));
function deadline(ms, parent) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(abort,ms);
  return {signal:controller.signal, close() {clearTimeout(timer);parent?.removeEventListener('abort',abort);}};
}
async function bounded(promise, signal) {
  if (signal.aborted) throw new DOMException('Timeout','AbortError');
  let abort;
  const expired = new Promise((_,reject) => {
    abort = () => reject(new DOMException('Timeout','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
  });
  try { return await Promise.race([promise,expired]); } finally { signal.removeEventListener('abort',abort); }
}
async function cancel(body) { try { await body?.cancel(); } catch { /* ロック中または消費済み */ } }
async function request(url, purpose, deps, signal) {
  deps.onRequest?.(url,purpose);
  const pending = Promise.resolve().then(() => (deps.fetchImpl ?? fetch)(url,{method:'GET',redirect:'manual',headers:headersOf(deps),signal}));
  // fetchの差し替えが中断を無視しても、遅れて届く本文を破棄する。
  pending.then(response => { if (signal.aborted) void cancel(response.body); }, () => {});
  return bounded(pending,signal);
}
const timedOut = (error, signal) => signal?.aborted || error?.name === 'AbortError';
async function classifyConnection(error, url, deps, signal) {
  if (timedOut(error,signal)) return {code:'timeout',detail:null};
  if (url.protocol !== 'https:') return {code:'connect_failed',detail:'no_response'};
  let response;
  try {
    // workerd実測ではTLSと接続失敗が同じ例外になる。HTTPの応答による推定に留める。
    response = await request('http://'+url.hostname+'/','tls-fallback',deps,signal);
    return {code:'tls_failed',detail:'http_responds'};
  } catch (fallbackError) {
    return {code:timedOut(fallbackError,signal) ? 'timeout' : 'connect_failed',detail:timedOut(fallbackError,signal) ? null : 'no_response'};
  } finally { void cancel(response?.body); }
}
function downloadOf(url, headers) {
  const type = (headers['content-type'] ?? '').split(';')[0].toLowerCase();
  const disposition = headers['content-disposition'] ?? '';
  const filename = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(disposition)?.[1] ?? null;
  let path = filename ?? new URL(url).pathname;
  try { path = decodeURIComponent(path); } catch { /* 壊れたエンコードはそのまま */ }
  const ext = /\.([a-z\d]{1,16})$/i.exec(path)?.[1]?.toLowerCase() ?? null;
  const reason = type === 'application/vnd.android.package-archive' || ext === 'apk' ? 'apk'
    : /(?:x-msdownload|x-msdos-program|x-dosexec|x-sh|java-archive|x-apple-diskimage|x-msi|vnd.microsoft.portable-executable)$/.test(type) || /^(exe|msi|scr|bat|cmd|js|vbs|jar|dmg|pkg|lnk|hta|ps1)$/.test(ext ?? '') ? 'executable'
    : /(?:zip|x-rar|x-rar-compressed|x-7z-compressed|x-iso9660-image)$/.test(type) || /^(zip|rar|7z|iso|img)$/.test(ext ?? '') ? 'archive'
    : /attachment/i.test(disposition) ? 'attachment' : type === 'application/octet-stream' ? 'binary' : null;
  return reason ? {reason,filename:clip(filename,120),ext:clip(ext,16)} : null;
}
function trimTrace(result) {
  const size = () => new TextEncoder().encode(JSON.stringify(result)).length;
  if (size() <= LIMITS.MAX_RESPONSE_BYTES) return result;
  result.notes.push('trimmed');
  if (result.html) {
    for (const array of [result.html.scripts.external,result.html.styles.external,result.html.forms,result.html.iframes,result.html.links.externalHosts]) {
      if (array.length && size() > LIMITS.MAX_RESPONSE_BYTES) array.length = 0;
    }
  }
  for (const array of [result.final?.cookies ?? [],result.hops]) {
    if (array.length && size() > LIMITS.MAX_RESPONSE_BYTES) array.length = 0;
  }
  if (result.final) {
    for (const name of Object.keys(result.final.headers).sort((a,b) => result.final.headers[b].length-result.final.headers[a].length)) {
      if (size() <= LIMITS.MAX_RESPONSE_BYTES) break;
      delete result.final.headers[name];
    }
  }
  if (size() > LIMITS.MAX_RESPONSE_BYTES) result.html = null;
  return result;
}
export async function runTrace(rawUrl, deps = {}) {
  const start = nowOf(deps), limits = {...LIMITS,...deps.limits};
  const result = {v:API_VERSION,ok:false,requested:clip(rawUrl,limits.MAX_URL_LENGTH) ?? '',hops:[],final:null,html:null,error:null,notes:[],elapsedMs:0};
  const fail = (code,stage,host = null,detail = null) => {
    result.ok = false; result.final = null; result.html = null;
    result.error = {code,stage,host:clip(host,253),detail};
    result.elapsedMs = elapsed(start,deps);
    return trimTrace(result);
  };
  const target = validateTarget(rawUrl,deps);
  if (!target.ok) return fail(['invalid','scheme','too_long'].includes(target.reason) ? 'invalid_url' : 'blocked_target','validate');
  result.requested = clip(target.url.href,LIMITS.MAX_URL_LENGTH);
  const overall = deadline(limits.TRACE_TIMEOUT_MS);
  const resolved = new Map();
  let current = target.url, stage = 'dns', activeSignal = overall.signal;
  try {
    for (let hop = 0; hop <= limits.MAX_REDIRECTS; hop++) {
      const timer = deadline(limits.HOP_TIMEOUT_MS,overall.signal);
      activeSignal = timer.signal;
      let response;
      const hopStart = nowOf(deps);
      try {
        stage = 'dns';
        if (!resolved.has(current.hostname)) resolved.set(current.hostname,await bounded((deps.resolve ?? resolvePublicHost)(current.hostname,{...deps,signal:timer.signal}),timer.signal));
        const dns = resolved.get(current.hostname);
        if (!dns.ok) return fail(hop && dns.reason === 'blocked_target' ? 'blocked_redirect' : dns.reason,'dns',current.hostname);
        stage = 'connect';
        try {
          response = await request(current.href,'trace',deps,timer.signal);
        } catch (error) {
          const failure = await classifyConnection(error,current,deps,timer.signal);
          return fail(failure.code,failure.code === 'timeout' ? 'timeout' : failure.code === 'tls_failed' ? 'tls' : 'connect',current.hostname,failure.detail);
        }
        if ([495,496,525,526].includes(response.status)) return fail('tls_failed','tls',current.hostname);
        if (response.headers.get('cf-mitigated') === 'challenge' || ([403,429,503].includes(response.status) && /captcha|challenge|bot/i.test(response.headers.get('server') ?? ''))) return fail('blocked_by_challenge','connect',current.hostname);
        if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
          stage = 'redirect';
          if (hop >= limits.MAX_REDIRECTS) return fail('too_many_redirects','redirect',current.hostname);
          let next;
          try { next = new URL(response.headers.get('location'),current); } catch {
            // BG追加: 拒否した転送も、取得元とLocationを経路の最後に残す。
            result.hops.push({url:clip(current.href,2048),host:clip(current.hostname,253),status:response.status,location:clip(response.headers.get('location'),2048),ms:elapsed(hopStart,deps)});
            return fail('blocked_redirect','redirect');
          }
          const guard = validateTarget(next.href,deps);
          if (!guard.ok) {
            // BG追加: 宛先を拒否しても転送元の応答を失わない。
            result.hops.push({url:clip(current.href,2048),host:clip(current.hostname,253),status:response.status,location:clip(next.href,2048),ms:elapsed(hopStart,deps)});
            return fail('blocked_redirect','redirect',next.hostname);
          }
          result.hops.push({url:clip(current.href,2048),host:clip(current.hostname,253),status:response.status,location:clip(guard.url.href,2048),ms:elapsed(hopStart,deps)});
          current = guard.url;
          continue;
        }
        const headers = {};
        for (const name of HEADER_ALLOWLIST) {
          const value = response.headers.get(name);
          if (value !== null) headers[name] = clip(value,name.includes('content-security-policy') ? limits.STR_CSP : limits.STR_LONG);
        }
        const cookies = response.headers.getSetCookie?.() ?? (response.headers.get('set-cookie')?.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) ?? []);
        const contentType = clip(response.headers.get('content-type'),200);
        const download = downloadOf(current.href,headers);
        const kind = download ? 'download' : /^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType ?? '') ? 'html' : 'other';
        let body = {bytes:new Uint8Array(),truncated:false};
        if (kind === 'html') {
          stage = 'read';
          body = await readCapped(response,limits.BODY_CAP_BYTES,timer.signal);
          result.html = extractHtmlFacts(decodeHtml(body.bytes,contentType),current.href);
          result.html.truncated ||= body.truncated;
          if (body.truncated) result.notes.push('body_truncated');
        }
        const length = response.headers.get('content-length');
        result.final = {url:clip(current.href,2048),host:clip(current.hostname,253),scheme:current.protocol.slice(0,-1),status:response.status,contentType,contentLength:length !== null && Number.isFinite(+length) && +length >= 0 ? +length : null,kind,download,headers,cookies:parseSetCookies(cookies),ms:elapsed(hopStart,deps),bytesRead:body.bytes.length,truncated:body.truncated};
        result.ok = true; result.elapsedMs = elapsed(start,deps);
        return trimTrace(result);
      } finally { timer.close(); void cancel(response?.body); }
    }
  } catch (error) {
    const code = timedOut(error,activeSignal) ? 'timeout' : 'connect_failed';
    return fail(code,code === 'timeout' ? 'timeout' : code === 'tls_failed' ? 'tls' : stage,current.hostname);
  } finally { overall.close(); }
  return fail('too_many_redirects','redirect');
}

export async function runAround({host,scheme} = {}, deps = {}) {
  const start = nowOf(deps), limits = {...LIMITS,...deps.limits};
  const result = {v:API_VERSION,host:clip(host,253) ?? '',registrable:'',scheme:scheme === 'http' ? 'http' : 'https',dns:{unavailable:'not_checked'},rdap:{unavailable:'error'},httpProbe:{tested:false,reason:'not_checked'},httpsProbe:{tested:false},securityTxt:{unavailable:'not_checked'},error:null,elapsedMs:0};
  const finish = () => {result.elapsedMs = elapsed(start,deps); return result;};
  if (typeof host === 'string') host = host.normalize('NFKC').trim();
  const target = typeof host === 'string' && !/[/?#@:\\\\]/.test(host) && ['http','https'].includes(scheme) ? validateTarget(scheme+'://'+host+'/',deps) : {ok:false};
  if (!target.ok) {result.error = {code:'blocked_target',detail:null};return finish();}
  host = target.url.hostname; result.host = host;
  const overall = deadline(limits.AROUND_TIMEOUT_MS);
  const task = async (fn,fallback) => {
    const timer = deadline(limits.AUX_TIMEOUT_MS,overall.signal);
    try { return await bounded(fn(timer.signal),timer.signal); } catch { return fallback; } finally {timer.close();}
  };
  try {
    const dns = await task(signal => (deps.resolve ?? resolvePublicHost)(host,{...deps,signal}),{ok:false,reason:'resolver_unavailable'});
    if (!dns.ok) { result.error = {code:clip(dns.reason,120),detail:null};result.dns={unavailable:clip(dns.reason,120)};return finish(); }
    let registrable;
    if (deps.registrable) registrable = typeof deps.registrable === 'function' ? deps.registrable(host) : deps.registrable;
    else registrable = (await import('./psl.js')).registrableDomain(host);
    registrable = typeof registrable === 'string' ? registrable : registrable.registrable;
    result.registrable = clip(registrable,253);
    const [mail,rdap,probe,security] = await Promise.all([
      task(signal => queryMailFacts(registrable,{...deps,signal}),null),
      task(signal => (deps.registration ?? fetchRegistration)(registrable,{...deps,signal}),{unavailable:'timeout'}),
      deps.skipSite ? (scheme === 'https' ? {tested:false,reason:'skipped'} : {tested:false}) : task(async signal => {
        const url = (scheme === 'https' ? 'http' : 'https')+'://'+host+'/';
        const response = await request(url,'probe',deps,signal);
        try {
          if (scheme === 'http') return {tested:true,reachable:true,status:response.status,error:null};
          const location = response.headers.get('location');
          let upgradesToHttps = false;
          if (location && response.status >= 300 && response.status < 400) {
            try {
              const next = new URL(location,url);
              /* apex→www のように、同じ登録ドメインの中でHTTPSへ移るのも「HTTPSへ転送する」とみなす（実在のサイトで多い形）。別の登録ドメインへは数えない。
                 N1: Locationは相手が決める値。長大なホスト名で計算を使わせないよう、検査を通ったものだけ登録ドメインを引く */
              if (next.protocol === 'https:' && validateTarget(next.href,deps).ok) {
                const { registrableDomain } = await import('./psl.js');
                upgradesToHttps = next.hostname === host || registrableDomain(next.hostname).registrable === registrable;
              }
            } catch { /* Location不正 */ }
          }
          return {tested:true,status:response.status,location:clip(location,300),upgradesToHttps};
        } finally {void cancel(response.body);}
      },scheme === 'https' ? {tested:false,reason:'unavailable'} : {tested:true,reachable:false,status:null,error:'unavailable'}),
      deps.skipSite ? {unavailable:'skipped'} : task(async signal => {
        const response = await request('https://'+host+'/.well-known/security.txt','security.txt',deps,signal);
        try {
          if (response.status !== 200) return {found:false,status:response.status,hasContact:false,expires:null,expired:false};
          const body = await readCapped(response,8192,signal);
          const text = new TextDecoder().decode(body.bytes);
          const expiry = /^Expires:\s*(.+)$/im.exec(text)?.[1]?.trim();
          return {found:true,status:response.status,hasContact:/^Contact:\s*\S+/im.test(text),expires:clip(expiry,40),expired:!!expiry && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry)<nowOf(deps)};
        } finally {void cancel(response.body);}
      },{unavailable:'unavailable'})
    ]);
    result.dns = mail?.spf && mail?.dmarc ? {a:dns.addresses.filter(x => !x.includes(':')).slice(0,4).map(x => clip(x,45)),aaaa:dns.addresses.filter(x => x.includes(':')).slice(0,4).map(x => clip(x,45)),resolvedPublic:true,dnssec:typeof dns.ad === 'boolean' ? dns.ad : null,...mail} : {unavailable:'dns_failed'};
    result.rdap=rdap;
    if (scheme === 'https') result.httpProbe=probe; else result.httpsProbe=probe;
    result.securityTxt=security;
  } catch { result.error={code:'connect_failed',detail:null}; }
  finally { overall.close(); }
  return finish();
}
