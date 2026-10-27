import { LIMITS } from './contract.js';
import { clip, hostOf, schemeOf } from './sanitize.js';

function entities(text) {
  if (!text.includes('&')) return text;
  const named = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' '};
  return text.replace(/&(#x[\da-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (whole, key) => {
    if (key[0] !== '#') return named[key.toLowerCase()] ?? whole;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : +key.slice(1);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
  });
}
const clean = (s, max) => clip(entities(s).replace(/\s+/g,' ').trim(),max) || null;
// 従来の\sと同じ範囲を、属性の各文字で正規表現を起動せずに調べる。
const space = c => c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 5760 || (c >= 8192 && c <= 8202) || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
function attributes(tag, pos) {
  const attrs = Object.create(null);
  while (pos < tag.length) {
    while (pos < tag.length && (space(tag.charCodeAt(pos)) || tag.charCodeAt(pos) === 47)) pos++;
    const start = pos;
    while (pos < tag.length) {
      const c = tag.charCodeAt(pos);
      if (space(c) || c === 61 || c === 47 || c === 62) break;
      pos++;
    }
    if (start === pos) { pos++; continue; }
    const key = tag.slice(start,pos).toLowerCase();
    while (space(tag.charCodeAt(pos))) pos++;
    let value = '';
    if (tag.charCodeAt(pos) === 61) {
      pos++;
      while (space(tag.charCodeAt(pos))) pos++;
      const c = tag.charCodeAt(pos);
      const quote = c === 34 || c === 39 ? tag[pos++] : null;
      const from = pos;
      if (quote) {
        const end = tag.indexOf(quote,pos);
        pos = end < 0 ? tag.length : end;
      } else {
        while (pos < tag.length && !space(tag.charCodeAt(pos)) && tag.charCodeAt(pos) !== 62) pos++;
      }
      value = tag.slice(from,pos);
      if (quote) pos++;
    }
    if (!(key in attrs)) attrs[key] = entities(value);
  }
  return attrs;
}
export function decodeHtml(bytes, contentType = '') {
  const preview = new TextDecoder().decode(bytes.subarray(0,4096));
  const charset = /charset\s*=\s*["']?([\w.-]+)/i.exec(contentType)?.[1] ?? /<meta\b[^>]{0,2048}charset\s*=\s*["']?([\w.-]+)/i.exec(preview)?.[1] ?? 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}
export function extractHtmlFacts(input, baseUrl) {
  const original = String(input ?? '');
  const html = original.slice(0,LIMITS.BODY_CAP_BYTES);
  let lower;
  const baseHost = hostOf(baseUrl);
  const facts = {
    title:null,h1:null,siteName:null,lang:null,generator:null,textSample:'',metaRefresh:null,baseHref:null,
    forms:[],passwordFields:0,scripts:{total:0,inline:0,external:[]},styles:{total:0,inline:0,external:[]},
    iframes:[],images:{total:0,http:0},links:{total:0,external:0,externalHosts:[],http:0},
    signals:{directoryListing:false,defaultPage:null,errorDisclosure:null,obfuscation:[],autoSubmit:false,noindex:false,metaReferrer:null,metaCsp:false},
    truncated:original.length > html.length
  };
  let resolutions = 0, previousResolution = null;
  let pos = 0, count = 0, form = null, capture = null, captured = '', visible = '', effectiveBase = baseUrl;
  const append = (from, to) => {
    if (visible.length < 1600) visible += ' ' + html.slice(from,Math.min(to,from+1600-visible.length));
    if (capture && captured.length < 600) captured += html.slice(from,Math.min(to,from+600-captured.length));
  };
  const finishCapture = () => {
    if (capture && facts[capture] === null) facts[capture] = clean(captured,120);
    capture = null; captured = '';
  };
  // S2: 長さと文書全体の解決回数を制限し、base×参照数の再解析を抑える。
  const resolve = (src, base) => {
    if (resolutions >= 1500) return null;
    resolutions++;
    // 同じ参照の連続でも予算は消費し、保持する解析結果はこの文書内の直前1件だけ。
    if (previousResolution && previousResolution.src === src && previousResolution.base === base) return previousResolution.url;
    const url = URLSafe(src,base);
    previousResolution = {src,base,url};
    return url;
  };
  const ref = (src, resolveRelative = false) => {
    if (resolutions >= 1500) return {host:null,scheme:'relative'};
    const scheme = schemeOf(src);
    return {host:scheme === 'relative' && !resolveRelative ? null : clip(resolve(src,effectiveBase)?.hostname,253) || null,scheme};
  };
  while (pos < html.length) {
    const start = html.indexOf('<',pos);
    if (start < 0) { append(pos,html.length); break; }
    append(pos,start);
    if (++count > LIMITS.MAX_TAGS) { facts.truncated = true; break; }
    if (html.startsWith('<!--',start)) {
      const end = html.indexOf('-->',start+4);
      if (end < 0) break;
      pos = end+3; continue;
    }
    let end = start+1, quote = null;
    for (; end < html.length; end++) {
      const c = html[end];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>' || c === '<') break;
    }
    if (html[end] === '<') { pos = end; continue; }
    if (end >= html.length) { facts.truncated = true; break; }
    const tag = html.slice(start+1,end);
    pos = end+1;
    const match = /^(\/?)([a-z][a-z\d:-]*)/i.exec(tag);
    if (!match) continue;
    const closing = !!match[1], name = match[2].toLowerCase();
    if (closing) {
      if (name === capture) finishCapture();
      if (name === 'form') form = null;
      continue;
    }
    if (!['title','h1','html','base','meta','form','input','select','textarea','button','script','style','link','iframe','img','a'].includes(name)) continue;
    const a = attributes(tag,match[0].length);
    if ((name === 'title' || name === 'h1') && facts[name] === null && !capture) { capture=name; captured=''; }
    if (name === 'html') facts.lang = clip(a.lang,20);
    if (name === 'base' && facts.baseHref === null && 'href' in a) {
      facts.baseHref = clip(a.href,300);
      if (a.href.length <= LIMITS.MAX_URL_LENGTH) {
        const next = resolve(a.href,baseUrl);
        if (next && next.href.length <= LIMITS.MAX_URL_LENGTH) effectiveBase = next.href;
      }
    }
    if (name === 'meta') {
      const key = (a.name ?? a.property ?? a['http-equiv'] ?? '').toLowerCase(), value = a.content ?? '';
      if (key === 'og:site_name' && facts.siteName === null) facts.siteName = clip(value,80);
      if (key === 'generator') facts.generator = clip(value,80);
      if (key === 'referrer') facts.signals.metaReferrer = clip(value,120);
      if (key === 'content-security-policy') facts.signals.metaCsp = true;
      if (key === 'robots' && /(?:^|[\s,])noindex(?:$|[\s,])/i.test(value)) facts.signals.noindex = true;
      if (key === 'refresh' && facts.metaRefresh === null) {
        const m = /^\s*(\d+(?:\.\d+)?)\s*(?:;\s*url\s*=\s*(.*))?$/i.exec(value);
        if (m && Number.isFinite(+m[1])) facts.metaRefresh = {delay:+m[1],url:clip(m[2]?.replace(/^["']|["']$/g,''),300)};
      }
    }
    if (name === 'form') {
      form = null;
      if (facts.forms.length < LIMITS.MAX_FORMS) {
        const action = a.action ?? '';
        form = {method:a.method?.toLowerCase() === 'post' ? 'post' : 'get',action:clip(action,300),actionHost:ref(action).host,hasPassword:false,hasEmail:false,hasCardLike:false,hasFileUpload:false,fieldCount:0,hidden:0};
        facts.forms.push(form);
      }
    }
    if (['input','select','textarea','button'].includes(name)) {
      const type = (a.type ?? 'text').toLowerCase();
      if (type === 'password') facts.passwordFields++;
      if (form) {
        form.fieldCount++;
        if (type === 'password') form.hasPassword = true;
        if (type === 'email') form.hasEmail = true;
        if (type === 'file') form.hasFileUpload = true;
        if (type === 'hidden') form.hidden++;
        if (/\bcc-number\b/i.test(a.autocomplete ?? '') || /card|cc[-_]?num/i.test((a.name ?? '')+' '+(a.id ?? ''))) form.hasCardLike = true;
      }
    }
    if (name === 'script') {
      facts.scripts.total++;
      if ('src' in a) {
        if (facts.scripts.external.length < LIMITS.MAX_SCRIPTS) facts.scripts.external.push({src:clip(a.src,300),...ref(a.src),sri:!!a.integrity,async:'async' in a,defer:'defer' in a,module:a.type?.toLowerCase() === 'module'});
      } else facts.scripts.inline++;
    }
    if (name === 'style') { facts.styles.total++; facts.styles.inline++; }
    if (name === 'link' && (a.rel ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) {
      facts.styles.total++;
      if (facts.styles.external.length < LIMITS.MAX_STYLES) facts.styles.external.push({href:clip(a.href ?? '',300),...ref(a.href ?? ''),sri:!!a.integrity});
    }
    if (name === 'iframe' && facts.iframes.length < LIMITS.MAX_IFRAMES) facts.iframes.push({
      src:clip(a.src ?? '',300),...ref(a.src ?? ''),hidden:'hidden' in a || ['0','1'].includes(a.width) || ['0','1'].includes(a.height) || /display\s*:\s*none|visibility\s*:\s*hidden|width\s*:\s*0(?:[^\d]|$)/i.test(a.style ?? ''),sandbox:'sandbox' in a
    });
    if (name === 'img') { facts.images.total++; if (ref(a.src).scheme === 'http') facts.images.http++; }
    if (name === 'a' && 'href' in a) {
      facts.links.total++;
      const link = ref(a.href,true), target = link.host;
      if (link.scheme === 'http') facts.links.http++;
      if (target && target !== baseHost) {
        facts.links.external++;
        if (facts.links.externalHosts.length < 10 && !facts.links.externalHosts.includes(target)) facts.links.externalHosts.push(target);
      }
    }
    if (name === 'script' || name === 'style') {
      lower ??= html.toLowerCase();
      const endRaw = lower.indexOf('</'+name,pos);
      if (endRaw < 0) break;
      pos = endRaw;
    }
  }
  finishCapture();
  // S6: ブランド照合に使う可視本文の抜粋は、契約どおり400字以内に保つ。
  facts.textSample = clean(visible,400) ?? '';
  const s = facts.signals;
  s.directoryListing = /^Index of \//i.test(facts.title ?? '');
  s.defaultPage = /welcome to nginx!/i.test(html) ? 'nginx' : /Apache2.{0,80}Default Page|Test Page for the Apache/i.test(html) ? 'apache' : /IIS Windows Server/i.test(html) ? 'iis' : /LiteSpeed/i.test(html) ? 'litespeed' : null;
  const errors = [
    ['php',/Fatal error:|Warning:[^\n]{0,500} on line \d+|Parse error:/i],['python',/Traceback \(most recent call last\)/],['java',/java\.lang\.|at org\./],
    ['dotnet',/Server Error in '\/' Application/i],['sql',/SQLSTATE\[|You have an error in your SQL syntax|ORA-\d{5}|mysqli_/i],
    ['node',/ReferenceError:/],['generic',/Stack trace:/i]
  ];
  s.errorDisclosure = errors.find(([key,re]) => re.test(html) && (key !== 'node' || html.includes('at Object.<anonymous>')))?.[0] ?? null;
  if (/eval\s*\(\s*atob\s*\(/i.test(html)) s.obfuscation.push('eval-atob');
  if (/unescape\s*\(/i.test(html) && /document\.write/i.test(html)) s.obfuscation.push('unescape-write');
  if (/(?:\\x[\da-f]{2}){16}/i.test(html)) s.obfuscation.push('hex-array');
  if ((html.match(/String\.fromCharCode\s*\(/g) ?? []).length >= 5) s.obfuscation.push('charcode-chain');
  let base64Run = 0;
  for (let i = 0; i < html.length; i++) {
    const c = html.charCodeAt(i);
    base64Run = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61 ? base64Run+1 : 0;
    if (base64Run >= 2000) { s.obfuscation.push('long-base64'); break; }
  }
  s.autoSubmit = /\.submit\s*\(\s*\)/i.test(html) && /onload|DOMContentLoaded/i.test(html);
  return facts;
}
// URL()の例外で文書全体の抽出を失わない。
function URLSafe(value, base) {
  try { return new URL(value,base); } catch { return null; }
}
