import { LIMITS } from './contract.js';

export function isNumericHost(value) {
  const host = String(value ?? '').normalize('NFKC').replace(/[。．｡]/g, '.').replace(/\.$/, '').toLowerCase();
  return !host || host.includes(':') || host.startsWith('[') || host.split('.').every(x => /^(?:\d+|0x[\da-f]+)$/i.test(x));
}
export function validateTarget(raw, { selfHosts = [] } = {}) {
  const fail = reason => ({ ok: false, reason });
  if (typeof raw !== 'string') return fail('invalid');
  // ホスト内の改行/タブで別のURLへ化ける入力は、除去前に拒否する。
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw.trim())) return fail('invalid');
  // eslint-disable-next-line no-control-regex
  const value = raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (value.length > LIMITS.MAX_URL_LENGTH) return fail('too_long');
  let url;
  try { url = new URL(value); } catch { return fail('invalid'); }
  if (!['http:', 'https:'].includes(url.protocol)) return fail('scheme');
  if (url.username || url.password) return fail('credentials');
  if (url.port) return fail('port');
  const host = url.hostname;
  if (isNumericHost(host)) return fail('numeric_host');
  if (host.endsWith('.') || /(^|\.)(localhost|local|internal|localdomain|home|lan|onion|example|test|invalid|corp|intranet|private|arpa)$/.test(host)) return fail('reserved_name');
  if (host === 'hundred-days.pages.dev' || host.endsWith('.hundred-days.pages.dev') || selfHosts.some(x => host === String(x).toLowerCase().replace(/\.$/, ''))) return fail('self');
  const labels = host.split('.');
  if (host.length > 253 || labels.length < 2 || labels.some(x => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(x)) || !/^(?:[a-z]{2,}|xn--[a-z\d-]+)$/.test(labels.at(-1))) return fail('bad_host');
  url.hash = '';
  if (url.href.length > LIMITS.MAX_URL_LENGTH) return fail('too_long');
  return { ok: true, url };
}
function ipv4(ip) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
  const parts = ip.split('.');
  if (parts.some(x => +x > 255 || (x.length > 1 && x[0] === '0'))) return null;
  return parts.reduce((n, x) => n * 256 + +x, 0);
}
function ipv6(ip) {
  if (!ip.includes(':') || /[^\da-f:.]/i.test(ip)) return null;
  if (ip.includes('.')) {
    const pos = ip.lastIndexOf(':');
    const v4 = ipv4(ip.slice(pos + 1));
    if (v4 === null) return null;
    ip = ip.slice(0, pos + 1) + Math.floor(v4 / 65536).toString(16) + ':' + (v4 % 65536).toString(16);
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if ([...left, ...right].some(x => !/^[\da-f]{1,4}$/i.test(x))) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  return [...left, ...Array(missing).fill('0'), ...right].reduce((n, x) => (n << 16n) + BigInt(parseInt(x, 16)), 0n);
}
const V4_BLOCKS = [[0,8],[0x0a000000,8],[0x64400000,10],[0x7f000000,8],[0xa9fe0000,16],[0xac100000,12],[0xc0000000,24],[0xc0000200,24],[0xc0586300,24],[0xc0a80000,16],[0xc6120000,15],[0xc6336400,24],[0xcb007100,24],[0xe0000000,4],[0xf0000000,4]];
export function isPublicIp(ip) {
  if (typeof ip !== 'string') return false;
  if (!ip.includes(':')) {
    const n = ipv4(ip);
    return n !== null && !V4_BLOCKS.some(([base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
  }
  const n = ipv6(ip);
  if (n === null) return false;
  const prefix = (base, bits) => (n >> BigInt(128 - bits)) === (ipv6(base) >> BigInt(128 - bits));
  // S1: 未割当・変換用IPv6を既定で拒否し、公開ユニキャスト内の特殊用途も除く。
  return prefix('2000::',3) && ![['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20],['2620:4f:8000::',48]].some(([base,bits]) => prefix(base,bits));
}
