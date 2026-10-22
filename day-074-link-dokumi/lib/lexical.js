import { registrableDomain } from './psl.js';
import { toUnicodeHost } from './punycode.js';
import { matchBrands } from './brands.js';
import { SHORTENERS, SHARED_HOSTS, isUserContentHost, RISKY_TLDS, sensitiveWordsInText, CONFUSABLES, REDIRECT_PARAM_NAMES, RESTRICTED_JP } from './lists.js';

const redirects = new Set(REDIRECT_PARAM_NAMES);
function decode(value) { try { return decodeURIComponent(value); } catch { return value; } }
function mixed(label) {
  const latin = /\p{Script=Latin}/u.test(label);
  const cyrillic = /\p{Script=Cyrillic}/u.test(label);
  const greek = /\p{Script=Greek}/u.test(label);
  return (latin && /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Hebrew}\p{Script=Arabic}]/u.test(label)) || (cyrillic && greek);
}
export function analyzeLexical(parsed) {
  // 正常なParsed以外にも、空の事実を返して呼び出し側の例外を避ける。
  const value = parsed?.ok ? parsed : {};
  const href = typeof value.href === 'string' ? value.href : '';
  let url = null;
  try { url = new URL(href); } catch { /* 取得できない事実は空のまま */ }
  const host = url?.hostname || (typeof value.hostname === 'string' ? value.hostname : '');
  const domain = registrableDomain(host);
  const hostUnicode = toUnicodeHost(host);
  const label = toUnicodeHost(domain.registrable.split('.')[0] || '');
  const hyphenCount = (label.match(/-/g) || []).length;
  const digitCount = (label.match(/\d/g) || []).length;
  const asciiLetters = (label.match(/[a-z]/gi) || []).length;
  const vowels = (label.match(/[aeiou]/gi) || []).length;
  const path = url?.pathname || '';
  const searchable = (hostUnicode + decode(path)).normalize('NFKC').toLowerCase();
  const userinfo = url ? decode(`${url.username}${url.password ? ':' + url.password : ''}`) : '';
  const redirectParams = [];
  if (url) for (const [name, target] of url.searchParams) {
    if (!redirects.has(name.toLowerCase()) || !/^https?:\/\//i.test(target)) continue;
    try {
      const destination = new URL(target);
      if (registrableDomain(destination.hostname).registrable !== domain.registrable) redirectParams.push({ name, host: destination.hostname });
    } catch { /* 相対URLや読めない値は転送先の事実にしない */ }
  }
  const tld = domain.labels.at(-1) || '';
  const shortener = SHORTENERS.thirdParty.includes(domain.registrable) ? 'third-party' : Object.hasOwn(SHORTENERS.official, domain.registrable) ? 'official' : null;
  const sharedDomain = Object.keys(SHARED_HOSTS).find(name => host === name || host.endsWith('.' + name));
  const provider = sharedDomain ? SHARED_HOSTS[sharedDomain] : null;
  return {
    host, hostUnicode, ...domain, scheme: url?.protocol === 'http:' ? 'http' : 'https', port: url?.port || '', urlLength: href.length,
    hasUserinfo: Boolean(value.hasUserinfo || userinfo), userinfoLooksLikeHost: /\./.test(userinfo) || /^http/i.test(userinfo),
    isIpHost: host.includes(':') || /^\d+\.\d+\.\d+\.\d+\.?$/.test(host), isPunycode: domain.labels.some(part => /^xn--/i.test(part)),
    mixedScript: hostUnicode.split('.').some(mixed), confusableChars: [...new Set(Array.from(hostUnicode.toLowerCase()).filter(char => Object.hasOwn(CONFUSABLES, char)))],
    brand: matchBrands({ host, path }), userContentHost: isUserContentHost(host) || domain.section === 'private', sensitiveWords: sensitiveWordsInText(searchable), shortener,
    freeHost: provider || domain.section === 'private' ? { provider: provider || domain.suffix, domain: sharedDomain || domain.suffix } : null,
    tld, tldRisky: RISKY_TLDS.includes(tld), hyphenCount, digitCount,
    labelOdd: hyphenCount >= 3 || (label.length >= 14 && digitCount >= 3) || (label.length >= 16 && asciiLetters >= 12 && vowels * 10 < asciiLetters),
    subdomainDepth: domain.subdomainLabels.length, encodedCount: (href.match(/%[\da-f]{2}/gi) || []).length,
    doubleEncoded: /%25[\da-f]{2}/i.test(href), hasNullByte: /%00/i.test(href), redirectParams,
    jpRestricted: RESTRICTED_JP.includes(domain.suffix) ? domain.suffix : null
  };
}
