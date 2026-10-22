import { LIMITS } from './contract.js';
import { clip } from './sanitize.js';
export function parseSetCookies(lines = []) {
  const result = [];
  for (const line of lines) {
    if (result.length >= LIMITS.MAX_COOKIES) break;
    const [pair, ...attrs] = String(line).split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = clip(pair.slice(0, eq).trim(), 64);
    const cookie = { name, secure:false, httpOnly:false, sameSite:null, hasDomain:false, path:null, persistent:false, prefix:name.startsWith('__Host-') ? '__Host-' : name.startsWith('__Secure-') ? '__Secure-' : null };
    for (const attr of attrs) {
      const at = attr.indexOf('=');
      const key = (at < 0 ? attr : attr.slice(0,at)).trim().toLowerCase();
      const value = at < 0 ? '' : attr.slice(at+1).trim();
      if (key === 'secure') cookie.secure = true;
      if (key === 'httponly') cookie.httpOnly = true;
      if (key === 'samesite' && ['lax','strict','none'].includes(value.toLowerCase())) cookie.sameSite = value.toLowerCase();
      if (key === 'domain') cookie.hasDomain = true;
      if (key === 'path') cookie.path = clip(value,120);
      if (key === 'expires' || key === 'max-age') cookie.persistent = true;
    }
    result.push(cookie);
  }
  return result;
}
