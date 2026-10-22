import { isPublicIp } from './target-guard.js';
import { clip, readCapped } from './sanitize.js';

const ENDPOINTS = [{url:'https://cloudflare-dns.com/dns-query'}, {url:'https://dns.google/resolve'}];
const TYPES = { A:1, AAAA:28, TXT:16, CAA:257, MX:15 };
export async function dohQuery(name, type, { fetchImpl = fetch, signal, endpoints = ENDPOINTS, onRequest } = {}) {
  if (!/^[a-z\d_.-]{1,253}$/i.test(name)) return {ok:false, rcode:null, ad:false, answers:[], endpoint:null};
  for (const endpoint of endpoints) {
    let response;
    try {
      const url = new URL(endpoint.url);
      url.searchParams.set('name', name);
      url.searchParams.set('type', String(type));
      onRequest?.(url.href, 'doh');
      /* Workersのfetchは redirect に follow と manual しか受け付けない（'error' は「実装しない」と明記され、指定すると例外）。
         本番で全診断が resolver_unavailable になる不具合を、ローカルのworkerdで見つけた（2026-10-22）。
         転送は追わず、200以外（3xxを含む）は次の窓口へ回す */
      response = await fetchImpl(url.href, { headers:{accept:'application/dns-json'}, signal, redirect:'manual' });
      if (response.status !== 200) continue;
      // S3: DoHは64KiBまで。切り捨てたDNS末尾に非公開IPが隠れないよう全件検査する。
      const {bytes} = await readCapped(response,64*1024,signal,{strict:true});
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!Number.isInteger(data.Status) || (data.Answer != null && !Array.isArray(data.Answer))) continue;
      const entries = data.Status === 3 ? [] : (data.Answer ?? []);
      const blocked = entries.find(a => a && [1,28].includes(a.type) && typeof a.data === 'string' && !isPublicIp(a.data));
      const answers = (blocked ? [blocked] : entries.slice(0,64)).filter(a => a && Number.isInteger(a.type) && typeof a.data === 'string').map(a => ({
        type:a.type, data:clip(a.data,4096), ttl:Number.isFinite(a.TTL) ? a.TTL : 0
      }));
      return {ok:true, rcode:data.Status, ad:data.AD === true, answers, endpoint:clip(endpoint.url,300)};
    } catch { if (signal?.aborted) break; }
    finally { try { await response?.body?.cancel(); } catch { /* 読み取り済みかロック中 */ } }
  }
  return {ok:false, rcode:null, ad:false, answers:[], endpoint:null};
}
export async function resolvePublicHost(host, deps = {}) {
  const replies = await Promise.all(['A','AAAA'].map(type => dohQuery(host,type,deps)));
  if (replies.some(r => r.answers.some(a => [1,28].includes(a.type) && !isPublicIp(a.data)))) return {ok:false, reason:'blocked_target'};
  if (replies.some(r => !r.ok)) return {ok:false, reason:'resolver_unavailable'};
  if (replies.some(r => ![0,3].includes(r.rcode))) return {ok:false, reason:'dns_failed'};
  const addresses = [...new Set(replies.flatMap(r => r.answers.filter(a => [1,28].includes(a.type)).map(a => a.data)))];
  return addresses.length ? {ok:true, addresses, ad:replies.every(r => r.ad)} : {ok:false, reason:'dns_failed'};
}
export async function queryTxtRecords(name, deps) {
  const result = await dohQuery(name,'TXT',deps);
  return { ...result, records:result.answers.filter(a => a.type === TYPES.TXT).map(a => a.data.replace(/"\s*"/g,'').replace(/^"|"$/g,'').replace(/\\"/g,'"')) };
}
export async function queryMailFacts(registrable, deps) {
  const [spf, dmarc, caa, mx] = await Promise.all([queryTxtRecords(registrable,deps),queryTxtRecords('_dmarc.'+registrable,deps),dohQuery(registrable,'CAA',deps),dohQuery(registrable,'MX',deps)]);
  const s = spf.records.find(x => /^v=spf1(?:\s|$)/i.test(x));
  const d = dmarc.records.find(x => /^v=DMARC1(?:;|\s|$)/i.test(x));
  const policy = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\b/i.exec(d ?? '')?.[1]?.toLowerCase() ?? null;
  return {
    spf: spf.ok && [0,3].includes(spf.rcode) ? {present:!!s, all:/(?:^|\s)([-~?+]all)(?=\s|$)/i.exec(s ?? '')?.[1]?.toLowerCase() ?? null, value:clip(s,200)} : null,
    dmarc: dmarc.ok && [0,3].includes(dmarc.rcode) ? {present:!!d, policy, value:clip(d,200)} : null,
    caa:caa.ok && caa.rcode === 0 ? caa.answers.some(a => a.type === TYPES.CAA) : caa.ok && caa.rcode === 3 ? false : null,
    mx:mx.ok && mx.rcode === 0 ? mx.answers.some(a => a.type === TYPES.MX) : mx.ok && mx.rcode === 3 ? false : null
  };
}
