export function parseCsp(value = '') {
  const directives = Object.create(null);
  for (const part of value.split(';')) {
    const [raw, ...words] = part.trim().split(/\s+/);
    const name = raw.toLowerCase();
    if (name && !Object.hasOwn(directives, name)) directives[name] = words;
  }
  return directives;
}

export function evaluateCsp(headers = {}, htmlFacts = null) {
  const value = headers['content-security-policy']?.trim();
  const enforced = Boolean(value);
  const metaOnly = !enforced && Boolean(htmlFacts?.signals.metaCsp);
  const policies = value ? value.split(',').map(parseCsp) : [];
  const issues = new Set();
  for (const policy of policies) {
    if (!Object.hasOwn(policy, 'script-src') && !Object.hasOwn(policy, 'default-src')) issues.add('コードの読み込み元を制限する指定なし');
    const script = (policy['script-src'] ?? policy['default-src'] ?? []).map(s => s.toLowerCase());
    const nonceOrHash = script.some(s => /^'(?:nonce-[^']+|sha(?:256|384|512)-[a-z0-9+/=]+)'$/i.test(s));
    const strict = script.includes("'strict-dynamic'");
    for (const token of script) {
      if (token === "'unsafe-inline'" && !nonceOrHash && !strict) issues.add(token);
      if (token === "'unsafe-eval'") issues.add(token);
      if (['*', 'https:', 'http:', 'data:'].includes(token) && !(strict && nonceOrHash)) issues.add(token);
    }
  }
  // 複数の強制ポリシーは交差適用。弱いポリシー単体の許可が実際にも許されるとは限らない。
  return { present: enforced || metaOnly, enforced,
    reportOnlyOnly: !enforced && !metaOnly && Boolean(headers['content-security-policy-report-only']),
    metaOnly, issues: [...issues], hasFramePolicy: policies.some(p => Object.hasOwn(p, 'frame-ancestors')),
    hasFrameAncestors: policies.some(p => Object.hasOwn(p, 'frame-ancestors') && !p['frame-ancestors'].includes('*')) };
}

export function parseHsts(value = '') {
  const result = { maxAge: null, includeSubDomains: false, preload: false, valid: false };
  let ages = 0;
  for (const part of value.split(';')) {
    const item = part.trim();
    if (/^max-age\s*=/i.test(item)) {
      ages++;
      const match = /^max-age\s*=\s*(?:"(\d+)"|(\d+))$/i.exec(item);
      if (match) result.maxAge = Number(match[1] ?? match[2]);
    }
    if (/^includesubdomains$/i.test(item)) result.includeSubDomains = true;
    if (/^preload$/i.test(item)) result.preload = true;
  }
  result.valid = ages === 1 && Number.isSafeInteger(result.maxAge) && result.maxAge > 0;
  return result;
}

export function isSessionLikeCookie(name) {
  return !/^(?:_ga|_gid|_gcl.*|_fbp|__cf_bm|cf_clearance)$/i.test(name) && /sess|sid|auth|token|login|jwt|csrf|xsrf/i.test(name);
}

export function classifyCookies(cookies = [], { https } = {}) {
  const result = { secureMissing: [], httpOnlyMissing: [], sameSiteMissing: [], invalid: [] };
  for (const cookie of cookies.filter(c => isSessionLikeCookie(c.name))) {
    if (https && !cookie.secure) result.secureMissing.push(cookie.name);
    if (!cookie.httpOnly) result.httpOnlyMissing.push(cookie.name);
    if (!cookie.sameSite) result.sameSiteMissing.push(cookie.name);
    if ((cookie.name.startsWith('__Host-') && (!https || !cookie.secure || cookie.path !== '/' || cookie.hasDomain)) ||
        (cookie.name.startsWith('__Secure-') && (!https || !cookie.secure)) ||
        (cookie.sameSite === 'none' && !cookie.secure)) result.invalid.push(cookie.name);
  }
  return result;
}

export function headerFindings(final, htmlFacts) {
  const h = final.headers;
  const csp = evaluateCsp(h, htmlFacts);
  const referrers = ['no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url'];
  const headerReferrer = (h['referrer-policy'] ?? '').toLowerCase().split(',').map(s => s.trim()).filter(s => referrers.includes(s)).at(-1);
  const metaReferrer = htmlFacts?.signals.metaReferrer?.trim().toLowerCase();
  return { csp, hsts: parseHsts(h['strict-transport-security']),
    frame: csp.hasFramePolicy ? csp.hasFrameAncestors : /^(deny|sameorigin)$/i.test(h['x-frame-options']?.trim() ?? ''),
    referrer: Boolean(headerReferrer || referrers.includes(metaReferrer)),
    xcto: /^nosniff$/i.test(h['x-content-type-options']?.trim() ?? ''),
    cookies: classifyCookies(final.cookies, { https: final.scheme === 'https' }) };
}
