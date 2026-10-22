import { clip, readCapped } from './sanitize.js';
import { validateTarget } from './target-guard.js';

export async function fetchRegistration(registrable, { fetchImpl = fetch, signal, now = () => Date.now(), onRequest, selfHosts = [] } = {}) {
  if (!/^[a-z\d.-]{1,253}$/.test(registrable) || !registrable.includes('.')) return {unavailable:'error'};
  const tld = registrable.split('.').at(-1);
  const verisign = ['com','net'].includes(tld);
  const endpoints = { verisign:'https://rdap.verisign.com/', other:'https://rdap.org/domain/' };
  let url = verisign ? endpoints.verisign + tld + '/v1/domain/' + registrable : endpoints.other + registrable;
  let response;
  try {
    // S7: 登録管理者への転送だけをHTTPS・ホスト検査付きで最大3回たどる。
    for (let hop = 0; ; hop++) {
      onRequest?.(url,'rdap');
      response = await fetchImpl(url, {signal, redirect:'manual', headers:{accept:'application/rdap+json, application/json'}});
      if (response.status < 300 || response.status >= 400) break;
      if (hop >= 3 || !response.headers.has('location')) return {unavailable:'error'};
      const next = new URL(response.headers.get('location'),url);
      const guard = validateTarget(next.href,{selfHosts});
      if (next.protocol !== 'https:' || !guard.ok) return {unavailable:'error'};
      try { await response.body?.cancel(); } catch { /* 本文破棄の失敗でも転送検査は省かない */ }
      url = guard.url.href;
    }
    if (response.status === 404) return {unavailable:verisign ? 'not_found' : 'unsupported'};
    if (!response.ok) return {unavailable:'error'};
    // S3: RDAPは256KiBまで読み、解析後の探索も各64件に限る。
    const {bytes} = await readCapped(response,256*1024,signal,{strict:true});
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const events = Array.isArray(data.events) ? data.events.slice(0,64) : [];
    const registered = events.find(x => x && x.eventAction === 'registration')?.eventDate;
    if (!registered || !Number.isFinite(Date.parse(registered))) return {unavailable:'error'};
    const expires = events.find(x => x && x.eventAction === 'expiration')?.eventDate;
    const entity = (Array.isArray(data.entities) ? data.entities.slice(0,64) : []).find(x => x && Array.isArray(x.roles) && x.roles.includes('registrar'));
    const card = entity?.vcardArray?.[1];
    const registrar = Array.isArray(card) ? card.find(x => Array.isArray(x) && x[0] === 'fn')?.[3] : null;
    return {registeredAt:clip(registered,40), expiresAt:clip(expires,40), ageDays:Math.max(0,Math.floor(((typeof now === 'function' ? now() : now)-Date.parse(registered))/86400000)), registrar:clip(registrar,80), source:verisign ? 'verisign' : 'rdap.org'};
  } catch (error) { return {unavailable:signal?.aborted || error?.name === 'AbortError' ? 'timeout' : 'error'}; }
  finally { try { await response?.body?.cancel(); } catch { /* 読み取り済みかロック中 */ } }
}
