import { validateTarget } from './target-guard.js';
import { LIMITS } from './contract.js';
import { registrableDomain } from './psl.js';
import { toUnicodeHost } from './punycode.js';

const MESSAGES = {
  empty: '調べたいリンクを貼り付けてください。',
  no_url: 'リンクが見つかりません。https://で始まるアドレスを貼り付けてください。',
  invalid: 'アドレスを読み取れません。コピー元を確認し、リンク全体を貼り付けてください。',
  scheme: 'http://またはhttps://で始まるリンクを使ってください。',
  too_long: `リンクは${LIMITS.MAX_URL_LENGTH}字以内、ホスト名は253字以内にしてください。短いアドレスで試してください。`
};
function trimEnd(value) {
  let end = value.length;
  let opens = 0, closes = 0;
  for (const char of value) { if (char === '(') opens++; if (char === ')') closes++; }
  while (end) {
    const char = value[end - 1];
    if ('。、）」』】>,.!?;:'.includes(char) || (char === ')' && closes > opens)) {
      if (char === ')') closes--;
      end--;
    } else break;
  }
  return value.slice(0, end);
}
export function extractUrl(raw) {
  if (typeof raw !== 'string') return { url: '', otherLinks: 0 };
  const text = raw.normalize('NFKC').trim().replace(/hxxps?:\/\//gi, value => value.toLowerCase().replace('xx', 'tt')).replace(/\[\.\]|\(\.\)/g, '.');
  const matches = text.match(/https?:\/\/[^\s<>"'「」『』【】]+/gi);
  if (matches?.length) return { url: trimEnd(matches[0]), otherLinks: matches.length - 1 };
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[^\s/:]+:\d+(?:[/?#]|$)/.test(text)) return { url: trimEnd(text), otherLinks: 0 };
  // 省略形は入力全体がアドレスらしいときだけ補う。文章をホスト名にしない。
  const authority = text.split(/[/?#]/, 1)[0];
  if (!/[\s@]/.test(text) && (authority.includes('.') || /^localhost(?::\d+)?$/i.test(authority) || /^\[[\da-f:.]+\](?::\d+)?$/i.test(authority) || /^\d+(?::\d+)?$/.test(authority))) return { url: trimEnd(text), otherLinks: 0 };
  return { url: '', otherLinks: 0 };
}
function oneTimeHints(url) {
  const hints = new Set();
  for (const key of url.searchParams.keys()) {
    const normalized = key.normalize('NFKC').toLowerCase();
    if (/^(token|code|key|sig|signature|auth|otp|ticket|session|sid|invite|reset|verify|confirm|hash)$/.test(normalized)) hints.add(normalized);
  }
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch { /* 不正なエンコードは見えた文字のまま調べる */ }
  const segments = path.split('/');
  if (segments.some(segment => /^[A-Za-z0-9_-]{16,}$/.test(segment))) {
    for (const segment of segments) if (/^(verify|confirm|activate|reset|unsubscribe|optout|magic|invite|approve|accept)$/i.test(segment)) hints.add(segment.toLowerCase());
  }
  return [...hints];
}
export function parseInput(raw, { includeQuery = false } = {}) {
  const fail = reason => ({ ok: false, reason, message: MESSAGES[reason] });
  if (typeof raw !== 'string' || !raw.trim()) return fail('empty');
  // URL単体の制御文字は、リンク抽出で切り捨てる前に門番へ渡す。
  // eslint-disable-next-line no-control-regex
  if (/^https?:\/\//i.test(raw.trim()) && /[\u0000-\u001f\u007f]/.test(raw.trim()) && !validateTarget(raw).ok) return fail('invalid');
  if (/^https?:\/\/[^/?#]*\s/i.test(raw.trim()) && !validateTarget(raw).ok) return fail('invalid');
  // 省略形はURL標準が制御文字を除去・符号化する前に拒否する。
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(raw.trim()) && (!/\s/.test(raw.trim().split(/[/?#]/, 1)[0]) || (!/https?:\/\//i.test(raw) && raw.trim().split(/[/?#]/, 1)[0].includes('.')))) return fail('invalid');
  const { url: original, otherLinks } = extractUrl(raw);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(original)) return fail('invalid');
  if (!original) return fail('no_url');
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(original) && !/^[^\s/:]+:\d+(?:[/?#]|$)/.test(original);
  if (hasScheme && !/^https?:/i.test(original)) return fail('scheme');
  if (original.length > LIMITS.MAX_URL_LENGTH) return fail('too_long');
  let url;
  try { url = new URL(hasScheme ? original : `https://${original}`); } catch { return fail('invalid'); }
  if (!['http:', 'https:'].includes(url.protocol)) return fail('scheme');
  if (!url.hostname) return fail('invalid');
  if (url.href.length > LIMITS.MAX_URL_LENGTH) return fail('too_long');
  const hostname = url.hostname.toLowerCase();
  if (hostname.length > 253) return fail('too_long');
  const domain = registrableDomain(hostname);
  const hasUserinfo = Boolean(url.username || url.password);
  const guard = validateTarget(hasScheme ? original : `https://${original}`);
  const reasons = { credentials: 'userinfo', numeric_host: 'numeric_host', reserved_name: 'reserved_name', bad_host: 'reserved_name', port: 'port', self: 'self', too_long: 'too_long', scheme: 'scheme', invalid: 'invalid' };
  const reason = guard.ok ? null : reasons[guard.reason];
  return {
    ok: true, raw, original, otherLinks, assumedScheme: !hasScheme,
    href: url.href, scheme: url.protocol.slice(0, -1), hostname, hostUnicode: toUnicodeHost(hostname),
    registrable: domain.registrable, suffix: domain.suffix, labels: domain.labels,
    hasUserinfo, port: url.port, path: url.pathname, hasQuery: original.includes('?') && original.indexOf('?') < (original.indexOf('#') < 0 ? original.length : original.indexOf('#')), hasHash: original.includes('#'),
    fetch: { allowed: reason === null, reason, href: reason === null ? url.origin + url.pathname + (includeQuery ? url.search : '') : null },
    hints: { oneTime: oneTimeHints(url) }
  };
}
