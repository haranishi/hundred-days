/* 観測（サーバー）・事実・判定（ブラウザ）の形と上限。
   サーバー側（observe/handlers）・判定側（rules）・画面（app）は、すべてここに合わせる。
   形は .kiro/specs/day-074-link-dokumi/model.md に書いてある。値は取得先が決める文字列なので、上限で切る。 */

export const API_VERSION = 1;

export const LIMITS = Object.freeze({
  MAX_URL_LENGTH: 2048,
  MAX_REDIRECTS: 5,
  /* 無料枠のCPUは1回10ms。160KiBの解析は実測で4〜6ms（速いMacで）かかり、エッジでは超えうる。64KiBに絞る（2026-10-22の実測） */
  BODY_CAP_BYTES: 64 * 1024,
  /* 大手の日本語サイトには、応答に5秒かかるもの（楽天）や、ブラウザ以外の名乗りだけ約10秒遅らせるもの（NHK）がある（2026-10-22の実測）。
     ブラウザになりすまさない方針なので、待つ時間だけを少し延ばす */
  TRACE_TIMEOUT_MS: 12000,
  HOP_TIMEOUT_MS: 7000,
  AROUND_TIMEOUT_MS: 6000,
  AUX_TIMEOUT_MS: 3500,
  RATE_PER_MINUTE: 12,
  /* 回数の数え上げ（IPのハッシュ）を置く秒数。1分の窓より少し長く置き、窓の境目の取りこぼしを避ける */
  RATE_KEEP_S: 70,
  CACHE_TTL_S: 300,
  MAX_FORMS: 10,
  MAX_SCRIPTS: 40,
  MAX_STYLES: 20,
  MAX_IFRAMES: 10,
  MAX_COOKIES: 20,
  MAX_TAGS: 6000,
  MAX_RESPONSE_BYTES: 64 * 1024,
  STR_SHORT: 120,
  STR_MID: 300,
  STR_LONG: 600,
  STR_CSP: 4000
});

export const AXES = Object.freeze(['visitor', 'owner']);
export const SEVERITIES = Object.freeze(['info', 'low', 'medium', 'high', 'critical']);
export const LEVELS = Object.freeze(['ok', 'note', 'warn', 'danger', 'unknown']);
export const GRADES = Object.freeze(['A', 'B', 'C', 'D', 'F']);
export const STATUSES = Object.freeze(['bad', 'good', 'info', 'unknown']);
export const ERROR_CODES = Object.freeze([
  'invalid_url', 'blocked_target', 'blocked_redirect', 'resolver_unavailable', 'dns_failed', 'connect_failed',
  'tls_failed', 'timeout', 'too_many_redirects', 'blocked_by_challenge', 'upstream_error'
]);

export const HEADER_ALLOWLIST = Object.freeze([
  'strict-transport-security', 'content-security-policy', 'content-security-policy-report-only', 'x-frame-options',
  'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy',
  'cross-origin-embedder-policy', 'cross-origin-resource-policy', 'access-control-allow-origin',
  'access-control-allow-credentials', 'server', 'x-powered-by', 'x-aspnet-version', 'x-generator', 'x-xss-protection',
  'public-key-pins', 'expect-ct', 'content-type', 'content-disposition', 'content-length', 'cache-control',
  'cf-mitigated', 'location'
]);

/* ---- 小さな検査器（依存なし） ---- */
const t = {
  str: (max = LIMITS.STR_LONG) => ({ k: 'str', max }),
  num: () => ({ k: 'num' }),
  int: () => ({ k: 'int' }),
  bool: () => ({ k: 'bool' }),
  lit: (...vals) => ({ k: 'lit', vals }),
  arr: (item, max) => ({ k: 'arr', item, max }),
  obj: (shape) => ({ k: 'obj', shape }),
  map: (value, maxKeys, allowedKeys) => ({ k: 'map', value, maxKeys, allowedKeys }),
  nullable: (inner) => ({ k: 'nullable', inner }),
  union: (...variants) => ({ k: 'union', variants })
};

function check(value, schema, path, errors, strict) {
  const fail = (message) => errors.push(`${path}: ${message}`);
  switch (schema.k) {
    case 'nullable':
      if (value === null) return;
      return check(value, schema.inner, path, errors, strict);
    case 'str':
      if (typeof value !== 'string') return fail('文字列ではない');
      if (value.length > schema.max) fail(`${schema.max}字を超えている(${value.length})`);
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('制御文字を含む');
      return;
    case 'num':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('数ではない');
      return;
    case 'int':
      if (!Number.isInteger(value)) fail('整数ではない');
      return;
    case 'bool':
      if (typeof value !== 'boolean') fail('真偽値ではない');
      return;
    case 'lit':
      if (!schema.vals.includes(value)) fail(`${schema.vals.join('|')} のどれでもない(${String(value).slice(0, 40)})`);
      return;
    case 'arr':
      if (!Array.isArray(value)) return fail('配列ではない');
      if (schema.max != null && value.length > schema.max) fail(`${schema.max}件を超えている(${value.length})`);
      value.forEach((item, index) => check(item, schema.item, `${path}[${index}]`, errors, strict));
      return;
    case 'map': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('辞書ではない');
      const keys = Object.keys(value);
      if (schema.maxKeys != null && keys.length > schema.maxKeys) fail(`${schema.maxKeys}キーを超えている`);
      for (const key of keys) {
        if (strict && schema.allowedKeys && !schema.allowedKeys.includes(key)) fail(`許可されていないキー ${key}`);
        check(value[key], schema.value(key), `${path}.${key}`, errors, strict);
      }
      return;
    }
    case 'obj': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('オブジェクトではない');
      for (const [key, inner] of Object.entries(schema.shape)) {
        if (!(key in value)) {
          if (inner.k === 'optional') continue;
          fail(`${key} がない`);
          continue;
        }
        check(value[key], inner.k === 'optional' ? inner.inner : inner, `${path}.${key}`, errors, strict);
      }
      if (strict) for (const key of Object.keys(value)) if (!(key in schema.shape)) fail(`未定義のキー ${key}`);
      return;
    }
    case 'union': {
      const attempts = schema.variants.map((variant) => {
        const local = [];
        check(value, variant, path, local, strict);
        return local;
      });
      if (attempts.some((local) => local.length === 0)) return;
      const best = attempts.reduce((a, b) => (b.length < a.length ? b : a));
      errors.push(...best);
      return;
    }
    default:
      fail(`未知の検査器 ${schema.k}`);
  }
}
const optional = (inner) => ({ k: 'optional', inner });

/* ---- 共通の部品 ---- */
const url = t.str(LIMITS.MAX_URL_LENGTH);
const host = t.str(253);
const short = t.str(LIMITS.STR_SHORT);
const mid = t.str(LIMITS.STR_MID);
const scheme = t.lit('https', 'http', 'relative', 'protocol-relative', 'data', 'other');

const hop = t.obj({ url, host, status: t.int(), location: t.nullable(url), ms: t.int() });
const cookie = t.obj({
  name: t.str(64), secure: t.bool(), httpOnly: t.bool(), sameSite: t.nullable(t.lit('lax', 'strict', 'none')),
  hasDomain: t.bool(), path: t.nullable(t.str(120)), persistent: t.bool(), prefix: t.nullable(t.lit('__Host-', '__Secure-'))
});
const download = t.obj({
  reason: t.lit('apk', 'executable', 'archive', 'attachment', 'binary'), filename: t.nullable(short), ext: t.nullable(t.str(16))
});
const headerValue = (name) => t.str(name === 'content-security-policy' || name === 'content-security-policy-report-only' ? LIMITS.STR_CSP : LIMITS.STR_LONG);
const finalResponse = t.obj({
  url, host, scheme: t.lit('https', 'http'), status: t.int(), contentType: t.nullable(t.str(200)),
  contentLength: t.nullable(t.num()), kind: t.lit('html', 'download', 'other'), download: t.nullable(download),
  headers: t.map(headerValue, HEADER_ALLOWLIST.length, HEADER_ALLOWLIST), cookies: t.arr(cookie, LIMITS.MAX_COOKIES),
  ms: t.int(), bytesRead: t.int(), truncated: t.bool()
});
const form = t.obj({
  method: t.lit('get', 'post'), action: mid, actionHost: t.nullable(host), hasPassword: t.bool(), hasEmail: t.bool(),
  hasCardLike: t.bool(), hasFileUpload: t.bool(), fieldCount: t.int(), hidden: t.int()
});
const scriptRef = t.obj({ src: mid, host: t.nullable(host), scheme, sri: t.bool(), async: t.bool(), defer: t.bool(), module: t.bool() });
const styleRef = t.obj({ href: mid, host: t.nullable(host), scheme, sri: t.bool() });
const iframeRef = t.obj({ src: mid, host: t.nullable(host), scheme, hidden: t.bool(), sandbox: t.bool() });
export const HtmlFactsSchema = t.obj({
  title: t.nullable(short), h1: t.nullable(short), siteName: t.nullable(t.str(80)), lang: t.nullable(t.str(20)),
  generator: t.nullable(t.str(80)), textSample: t.str(400),
  metaRefresh: t.nullable(t.obj({ delay: t.num(), url: t.nullable(mid) })), baseHref: t.nullable(mid),
  forms: t.arr(form, LIMITS.MAX_FORMS), passwordFields: t.int(),
  scripts: t.obj({ total: t.int(), inline: t.int(), external: t.arr(scriptRef, LIMITS.MAX_SCRIPTS) }),
  styles: t.obj({ total: t.int(), inline: t.int(), external: t.arr(styleRef, LIMITS.MAX_STYLES) }),
  iframes: t.arr(iframeRef, LIMITS.MAX_IFRAMES),
  images: t.obj({ total: t.int(), http: t.int() }),
  links: t.obj({ total: t.int(), external: t.int(), externalHosts: t.arr(host, 10), http: t.int() }),
  signals: t.obj({
    directoryListing: t.bool(), defaultPage: t.nullable(t.lit('nginx', 'apache', 'iis', 'litespeed', 'other')),
    errorDisclosure: t.nullable(t.lit('php', 'python', 'java', 'dotnet', 'sql', 'node', 'generic')),
    obfuscation: t.arr(t.lit('eval-atob', 'unescape-write', 'hex-array', 'charcode-chain', 'long-base64'), 5),
    autoSubmit: t.bool(), noindex: t.bool(), metaReferrer: t.nullable(short), metaCsp: t.bool()
  }),
  truncated: t.bool()
});
const errorInfo = t.obj({
  code: t.lit(...ERROR_CODES),
  stage: t.lit('validate', 'dns', 'connect', 'tls', 'read', 'redirect', 'timeout'),
  host: t.nullable(host), detail: t.nullable(mid)
});
const TraceSchema = t.obj({
  v: t.lit(API_VERSION), ok: t.bool(), requested: url, cached: optional(t.bool()),
  hops: t.arr(hop, LIMITS.MAX_REDIRECTS), final: t.nullable(finalResponse), html: t.nullable(HtmlFactsSchema),
  error: t.nullable(errorInfo), notes: t.arr(short, 10), elapsedMs: t.int()
});

const unavailable = (...reasons) => t.obj({ unavailable: reasons.length ? t.lit(...reasons) : short });
const AroundSchema = t.obj({
  v: t.lit(API_VERSION), host, registrable: host, scheme: t.lit('https', 'http'),
  dns: t.union(
    t.obj({
      a: t.arr(t.str(45), 4), aaaa: t.arr(t.str(45), 4), resolvedPublic: t.bool(), dnssec: t.nullable(t.bool()),
      caa: t.nullable(t.bool()), mx: t.nullable(t.bool()),
      spf: t.obj({ present: t.bool(), all: t.nullable(t.lit('-all', '~all', '?all', '+all')), value: t.nullable(t.str(200)) }),
      dmarc: t.obj({ present: t.bool(), policy: t.nullable(t.lit('none', 'quarantine', 'reject')), value: t.nullable(t.str(200)) })
    }),
    unavailable()
  ),
  rdap: t.union(
    t.obj({ registeredAt: t.str(40), expiresAt: t.nullable(t.str(40)), ageDays: t.int(), registrar: t.nullable(t.str(80)), source: t.str(40) }),
    unavailable('unsupported', 'not_found', 'timeout', 'error')
  ),
  httpProbe: t.union(
    t.obj({ tested: t.lit(true), status: t.nullable(t.int()), location: t.nullable(mid), upgradesToHttps: t.bool() }),
    t.obj({ tested: t.lit(false), reason: short })
  ),
  httpsProbe: t.union(
    t.obj({ tested: t.lit(true), reachable: t.bool(), status: t.nullable(t.int()), error: t.nullable(short) }),
    t.obj({ tested: t.lit(false) })
  ),
  securityTxt: t.union(
    t.obj({ found: t.bool(), status: t.nullable(t.int()), hasContact: t.bool(), expires: t.nullable(t.str(40)), expired: t.bool() }),
    unavailable()
  ),
  error: t.nullable(t.obj({ code: short, detail: t.nullable(mid) })),
  elapsedMs: t.int()
});

const finding = t.obj({
  id: t.str(40), axis: t.lit(...AXES), status: t.lit(...STATUSES), severity: t.lit(...SEVERITIES), points: t.num(),
  floor: t.nullable(t.lit('warn', 'danger')), title: short, what: t.str(LIMITS.STR_MID * 2), why: t.str(LIMITS.STR_LONG * 2),
  fix: t.nullable(t.str(LIMITS.STR_LONG * 2)), evidence: t.arr(t.str(LIMITS.STR_MID), 3),
  snippet: t.nullable(t.obj({ label: short, headers: optional(t.str(2000)), nginx: optional(t.str(2000)), apache: optional(t.str(2000)) }))
});
const ResultSchema = t.obj({
  v: t.lit(API_VERSION),
  target: t.obj({
    input: url, href: url, host, hostUnicode: host, registrable: host, finalUrl: t.nullable(url), finalHost: t.nullable(host),
    chain: t.arr(t.obj({
      url, host, registrable: host, scheme: t.lit('https', 'http'), status: t.nullable(t.int()), role: t.lit('input', 'redirect', 'final')
    }), 8)
  }),
  visitor: t.obj({
    level: t.lit(...LEVELS), points: t.num(), headline: short, summary: t.str(LIMITS.STR_MID * 2),
    actions: t.arr(t.str(LIMITS.STR_MID), 3), reasons: t.arr(t.str(LIMITS.STR_MID), 3)
  }),
  owner: t.obj({
    score: t.nullable(t.int()), grade: t.nullable(t.lit(...GRADES)), note: t.str(LIMITS.STR_MID * 2),
    provisional: t.bool(), // 点数に効く周辺の事実（メールの設定・HTTPからの転送など）が欠けていて、点数が暫定のとき
    topFixes: t.arr(t.obj({ id: t.str(40), gain: t.num() }), 3)
  }),
  findings: t.arr(finding),
  limits: t.arr(t.str(LIMITS.STR_MID)),
  partial: t.obj({ trace: t.bool(), around: t.bool() }),
  evaluatedAt: t.str(40)
});

function run(value, schema, strict) {
  const errors = [];
  check(value, schema, '$', errors, strict);
  return { ok: errors.length === 0, errors };
}

/* trace/around は形のほかに、意味の整合も見る */
export function validateTrace(value, { strict = true } = {}) {
  const result = run(value, TraceSchema, strict);
  if (!result.ok || !value) return result;
  const errors = [];
  if (value.ok && (!value.final || value.error)) errors.push('$: ok=true なのに final がない、または error がある');
  if (!value.ok && (!value.error || value.final)) errors.push('$: ok=false なのに error がない、または final がある');
  if (value.html && (!value.final || value.final.kind !== 'html')) errors.push('$: html があるのに final が HTML ではない');
  return { ok: errors.length === 0, errors };
}
export const validateAround = (value, { strict = true } = {}) => run(value, AroundSchema, strict);
export const validateResult = (value, { strict = true } = {}) => run(value, ResultSchema, strict);
export const validateHtmlFacts = (value, { strict = true } = {}) => run(value, HtmlFactsSchema, strict);
