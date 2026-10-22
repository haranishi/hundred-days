import { brandKeywordsInText, findOfficialBrand } from './brands.js';
import { parseInput } from './url-input.js';
import { analyzeLexical } from './lexical.js';
import { registrableDomain } from './psl.js';
import { headerFindings } from './headers.js';
import { detectLibs } from './libs.js';
import { detectEol } from './eol.js';
import { visitorLevel, ownerScore, gradeOf } from './score.js';
import { MESSAGES, HEADLINES, ACTIONS, LIMITS_TEXT } from './messages.js';
import { LIMITS } from './contract.js';

const VULN_WEIGHTS = [{ min: 7, points: 10, severity: 'high' }, { min: 4, points: 6, severity: 'medium' }, { min: 0, points: 3, severity: 'low' }];
const VULN_CAP = 15;

const RULE_VALUES = {
  'V-USERINFO': [{points: 9, severity: 'high', floor: 'danger'}],
  'V-IP-HOST': [{points: 8, severity: 'high', floor: 'warn'}],
  'V-HOMOGRAPH': [{points: 8, severity: 'high', floor: 'warn'}],
  'V-PUNYCODE': [{points: 1, severity: 'info', floor: null}],
  'V-BRAND-SUBDOMAIN': [{points: 9, severity: 'high', floor: 'danger'}],
  'V-BRAND-TYPO': [{points: 8, severity: 'high', floor: 'warn'}],
  'V-SENSITIVE-WORDS': [{points: 2, severity: 'low', floor: null}],
  'V-SHORTENER': [{points: 1, severity: 'info', floor: null}],
  'V-TLD-RISKY': [{points: 1, severity: 'low', floor: null}],
  'V-LABEL-ODD': [{points: 2, severity: 'low', floor: null}],
  'V-DEEP-SUBDOMAIN': [{points: 2, severity: 'low', floor: null}],
  'V-ENCODED': [{points: 2, severity: 'low', floor: null}],
  'V-REDIRECT-PARAM': [{points: 3, severity: 'medium', floor: null}],
  'V-HTTPS-DOWNGRADE': [{points: 4, severity: 'medium', floor: null}],
  'V-TLS-FAIL': [{points: 0, severity: 'info', floor: null}],
  'O-UNKNOWN': [{points: 0, severity: 'info', floor: null}],
  'V-CROSS-FORM': [{points: 8, severity: 'high', floor: 'warn'}],
  'V-META-REFRESH': [{points: 2, severity: 'low', floor: null}, {points: 3, severity: 'medium', floor: null}],
  'V-HIDDEN-IFRAME': [{points: 1, severity: 'low', floor: null}, {points: 3, severity: 'medium', floor: null}],
  'O-HSTS-MISSING': [{points: 15, severity: 'high', floor: null}],
  'O-HSTS-WEAK': [{points: 5, severity: 'medium', floor: null}],
  'O-NO-HTTPS': [{points: 40, severity: 'critical', floor: null}],
  'O-NO-UPGRADE': [{points: 15, severity: 'high', floor: null}],
  'O-CSP-MISSING': [{points: 15, severity: 'high', floor: null}],
  'O-CSP-WEAK': [{points: 8, severity: 'medium', floor: null}],
  'O-COOKIE-SECURE': [{points: 10, severity: 'high', floor: null}],
  'O-COOKIE-HTTPONLY': [{points: 6, severity: 'medium', floor: null}],
  'O-COOKIE-SAMESITE': [{points: 2, severity: 'low', floor: null}],
  'O-VERSION-DISCLOSURE': [{points: 2, severity: 'low', floor: null}],
  'O-EOL-SOFTWARE': [{points: 10, severity: 'high', floor: null}],
  'O-MIXED-ACTIVE': [{points: 15, severity: 'high', floor: null}],
  'O-MIXED-PASSIVE': [{points: 3, severity: 'low', floor: null}],
  'O-SRI-MISSING': [{points: 3, severity: 'low', floor: null}],
  'O-EOL-LIB': [{points: 4, severity: 'medium', floor: null}],
  'O-FORM-HTTP': [{points: 10, severity: 'high', floor: null}],
  'O-PASSWORD-HTTP': [{points: 25, severity: 'critical', floor: null}],
  'O-DIR-LISTING': [{points: 10, severity: 'high', floor: null}],
  'O-ERROR-DISCLOSURE': [{points: 8, severity: 'medium', floor: null}],
  'O-DEFAULT-PAGE': [{points: 2, severity: 'low', floor: null}],
  'O-DMARC-MISSING': [{points: 2, severity: 'low', floor: null}],
  'O-SPF-MISSING': [{points: 1, severity: 'low', floor: null}],
  'O-DMARC-WEAK': [{points: 1, severity: 'info', floor: null}],
  'O-CORS-WILDCARD-CREDS': [{points: 3, severity: 'low', floor: null}],
  'O-DEPRECATED-HEADER': [{points: 0, severity: 'info', floor: null}],
  'O-SECURITY-TXT': [{points: 0, severity: 'info', floor: null}],
  'O-FRAME-MISSING': [{points: 8, severity: 'medium', floor: null}],
  'O-XCTO-MISSING': [{points: 5, severity: 'low', floor: null}],
  'O-REFERRER-MISSING': [{points: 3, severity: 'low', floor: null}],
  'V-BRAND-KEYWORD': [{points: 4, severity: 'medium', floor: null}, {points: 7, severity: 'medium', floor: null}, {points: 2, severity: 'medium', floor: null}, {points: 5, severity: 'medium', floor: null}],
  'V-BRAND-CONTENT': [{points: 5, severity: 'high', floor: null}, {points: 9, severity: 'high', floor: 'warn'}, {points: 2, severity: 'low', floor: null}],
  'V-LONG-URL': [{points: 1, severity: 'info', floor: null}, {points: 2, severity: 'info', floor: null}],
  'V-HTTP': [{points: 3, severity: 'medium', floor: null}, {points: 6, severity: 'medium', floor: null}],
  'V-REDIRECT-CROSS': [{points: 3, severity: 'medium', floor: null}, {points: 5, severity: 'medium', floor: null}],
  'V-NEW-DOMAIN': [{points: 8, severity: 'high', floor: 'warn'}, {points: 6, severity: 'high', floor: 'warn'}, {points: 3, severity: 'medium', floor: null}, {points: 1, severity: 'low', floor: null}],
  'V-OBFUSCATION': [{points: 2, severity: 'low', floor: null}, {points: 4, severity: 'low', floor: null}],
  'V-DOWNLOAD-APK': [{points: 10, severity: 'critical', floor: 'danger'}],
  'V-DOWNLOAD-EXEC': [{points: 7, severity: 'high', floor: 'warn'}],
  'V-DOWNLOAD-ARCHIVE': [{points: 2, severity: 'low', floor: null}],
  'V-UNREACHABLE': [{points: 0, severity: 'info', floor: null}],
  'V-BLOCKED-FETCH': [{points: 0, severity: 'info', floor: null}],
  'V-OFFICIAL-DOMAIN': [{points: 0, severity: 'info', floor: null}],
  'V-JP-RESTRICTED': [{points: 0, severity: 'info', floor: null}],
  'V-OLD-DOMAIN': [{points: 0, severity: 'info', floor: null}],
  'O-VULN-LIB': VULN_WEIGHTS.map(({ points, severity }) => ({ points, severity, floor: null })),
  'O-HTTPS-OK': [{points: 0, severity: 'info', floor: null}],
  'O-HSTS-OK': [{points: 0, severity: 'info', floor: null}],
  'O-CSP-OK': [{points: 0, severity: 'info', floor: null}],
  'O-FRAME-OK': [{points: 0, severity: 'info', floor: null}],
  'O-XCTO-OK': [{points: 0, severity: 'info', floor: null}],
  'O-REFERRER-OK': [{points: 0, severity: 'info', floor: null}],
  'O-COOKIE-OK': [{points: 0, severity: 'info', floor: null}],
  'V-NOT-FETCHED': [{points: 0, severity: 'info', floor: null}],
  'V-SHARED-HOST': [{points: 0, severity: 'info', floor: null}],
  'O-STATUS-NOTE': [{points: 0, severity: 'info', floor: null}],
};
const valuesOf = id => RULE_VALUES[id].map(v => v.points);
const RULE_NOTES = {
  'V-META-REFRESH': `別の登録ドメインへの指定は${valuesOf('V-META-REFRESH')[0]}点・重大度は低です。同じページにパスワード欄があると${valuesOf('V-META-REFRESH')[1]}点・重大度は中です。`,
  'V-HIDDEN-IFRAME': `別の登録ドメインへの指定は${valuesOf('V-HIDDEN-IFRAME')[0]}点・重大度は低です。同じページにパスワード欄があると${valuesOf('V-HIDDEN-IFRAME')[1]}点・重大度は中です。`,
  "V-BRAND-KEYWORD": `名前の部分にブランド名があれば${valuesOf('V-BRAND-KEYWORD')[0]}点、パス（名前の後ろの部分）だけなら${valuesOf('V-BRAND-KEYWORD')[2]}点です。手続きを急がせる語があれば、それぞれ${valuesOf('V-BRAND-KEYWORD')[1]}点・${valuesOf('V-BRAND-KEYWORD')[3]}点です。`,
  "V-BRAND-CONTENT": `ログインや確認の文脈がある場合に${valuesOf('V-BRAND-CONTENT')[0]}点です。パスワード・カード・メールの入力欄があれば${valuesOf('V-BRAND-CONTENT')[1]}点となり、段階は「注意」以上です。入力欄が無い、または検索窓のような小さなフォームだけなら${valuesOf('V-BRAND-CONTENT')[2]}点・重大度は低です（解説記事などを拾わないため）。`,
  "V-LONG-URL": `120字を超えると${valuesOf('V-LONG-URL')[0]}点、200字を超えると${valuesOf('V-LONG-URL')[1]}点です。`,
  "V-HTTP": `転送先の通信がHTTPなら${valuesOf('V-HTTP')[0]}点です。パスワード欄があれば${valuesOf('V-HTTP')[1]}点です。`,
  "V-REDIRECT-CROSS": `異なる登録ドメインを3つ以上通ると${valuesOf('V-REDIRECT-CROSS')[0]}点、5つ以上なら${valuesOf('V-REDIRECT-CROSS')[1]}点です。`,
  "V-NEW-DOMAIN": `登録から14日未満・30日未満・90日未満・365日未満の順に${valuesOf('V-NEW-DOMAIN').join('・')}点です。30日未満は重大度が高く、段階は「注意」以上です。90日未満は重大度が中、それ以降は低です。`,
  "V-OBFUSCATION": `コードを読み取りにくくする書き方が1種類なら${valuesOf('V-OBFUSCATION')[0]}点、2種類以上なら${valuesOf('V-OBFUSCATION')[1]}点です。`,
  "O-VULN-LIB": `既知の脆弱性ごとに、深刻度の指標（CVSS）が7以上・4以上・4未満の順に${VULN_WEIGHTS.map(v => v.points).join('・')}点を引きます。合計は${VULN_CAP}点までです。重大度は最も高いものに合わせます。`
};

const severityRank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

// 重大度・段階の下限は候補の最大値。条件で変わる場合の内訳はnoteに示す。
export const RULE_CATALOG = Object.entries(RULE_VALUES).map(([id, values]) => ({
  id, axis: id.startsWith('V-') ? 'visitor' : 'owner', title: MESSAGES[id].title,
  points: id === 'O-VULN-LIB' ? `${VULN_WEIGHTS.map(v => v.points).join('/')}（合計${VULN_CAP}点まで）` : values.length === 1 ? values[0].points : values.map(v => v.points),
  severity: values.reduce((a, b) => severityRank[a.severity] >= severityRank[b.severity] ? a : b).severity, floor: values.find(v => v.floor)?.floor ?? null,
  note: RULE_NOTES[id] ?? MESSAGES[id].why
}));
const catalogById = new Map(RULE_CATALOG.map(rule => [rule.id, rule]));

const statusRank = { bad: 0, unknown: 1, info: 2, good: 3 };
const clean = (value, max = 300) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
const sortFindings = (a, b) => (a.axis === b.axis ? 0 : a.axis === 'visitor' ? -1 : 1) || statusRank[a.status] - statusRank[b.status] || severityRank[b.severity] - severityRank[a.severity] || b.points - a.points;

const FETCH_REASONS = {
  timeout: '相手のサイトが、この診断に時間内に応えませんでした。一部のサイトは、ブラウザ以外からのアクセスを遅くしたり断ったりします。診断のために、ブラウザになりすますことはしません。',
  dns_failed: 'このアドレスの名前が見つかりませんでした。存在しないか、すでに止まっているサイトです。つながらないことは、安全の印ではありません（詐欺のサイトは短い期間で消えることがあります）。',
  connect_failed: 'つながりませんでした。サイトが止まっている、またはこの診断を断っている可能性があります。',
  tls_failed: 'HTTPSで安全につなぐことができませんでした。証明書の問題、またはHTTPSに未対応の可能性があります。',
  blocked_by_challenge: 'ボット対策の確認画面が返り、取得できませんでした。',
  blocked_redirect: '転送先が、診断できない宛先（内部のアドレスなど）でした。',
  too_many_redirects: '転送が多すぎて、最後までたどれませんでした。',
  resolver_unavailable: '名前を調べるサービスに接続できませんでした。時間をおいて、もう一度試してください。',
  blocked_target: 'このアドレスには、つなぎに行きませんでした。',
  invalid_url: 'このアドレスには、つなぎに行きませんでした。',
  upstream_error: '相手のサイトからエラーの応答が返り、取得できませんでした。',
  skipped: '相手のサイトに取得を断られたため、このアドレスへの追加のアクセスはしていません。'
};
const APP_FAILURES = {
  rate_limited: { reason: 'このアプリの回数の上限に達したので、相手のサイトには問い合わせていません。', next: '1分ほど待ってから、もう一度試してください' },
  server_error: { reason: 'このアプリのサーバーで問題が起きたので、相手のサイトを調べられませんでした。', next: '少し時間をおいてから、もう一度試してください' },
  network: { reason: 'このアプリとの通信に失敗したので、調べられませんでした。', next: '通信の状態を確かめてから、もう一度試してください' }
};
const fetchReason = error => (FETCH_REASONS[error?.code] ?? '転送先の応答を取得できませんでした。') + (error?.code === 'tls_failed' && error.detail === 'http_responds' ? 'HTTP では応答がありました。' : '');

export function evaluate({ parsed, lexical, trace = null, around = null, now = Date.now(), failure = null }, deps = {}) {
  const brandInText = deps.brandKeywordsInText ?? brandKeywordsInText;
  const parse = deps.parseInput ?? parseInput;
  const analyze = deps.analyzeLexical ?? analyzeLexical;
  const domainOf = deps.registrableDomain ?? registrableDomain;
  const officialOf = deps.findOfficialBrand ?? findOfficialBrand;
  const domain = host => domainOf(host)?.registrable ?? host;
  const hostOf = value => { try { return new URL(value).hostname; } catch { return null; } };
  // CSPの簡易評価の注記は、守りの点数の欄（owner.note）に置く。訪問者向けの「見ていないこと」に運営者向けの専門語を混ぜない。
  const findings = [], limits = LIMITS_TEXT.filter(line => !line.startsWith('CSP（'));
  // failure：こちら側の都合で調べられなかった（回数の上限・サーバーの不具合・通信の失敗）。相手のサイトの問題として書かない。
  const ownFailure = trace ? null : APP_FAILURES[failure] ?? null;
  let unavailableReason = ownFailure?.reason ?? fetchReason(trace?.error);
  const add = (id, what, evidence = [], { variant = null, status = 'bad', deduction = null, why = null, title = null } = {}) => {
    const message = MESSAGES[id], rule = catalogById.get(id);
    const { points, severity, floor } = deduction ?? (variant === null ? rule : RULE_VALUES[id][variant]);
    const axis = rule.axis;
    const previous = findings.findIndex(f => f.id === id);
    if (previous >= 0) {
      if (findings[previous].points >= points) return;
      findings.splice(previous, 1);
    }
    findings.push({ id, axis, status, severity, points, floor, title: title ?? message.title, what: clean(what, 600), why: why ?? message.why,
      fix: axis === 'owner' ? message.fix ?? null : null, evidence: evidence.filter(v => v != null && v !== '').slice(0, 3).map(v => clean(v)), snippet: message.snippet ?? null });
  };
  const good = (id, what, evidence = []) => add(id, what, evidence, { status: 'good' });
  const l = lexical;
  if (l.hasUserinfo && l.userinfoLooksLikeHost) add('V-USERINFO', '@の左側に、接続先の名前に見える文字があります。', [parsed.href]);
  if (l.isIpHost) add('V-IP-HOST', '接続先を、ドメイン名ではなく数字のアドレスで指定しています。', [l.host]);
  function evaluateAppearance(l, location) {
    const appearance = (id, what, evidence, options) => add(id, what, [`${location}：${l.host}`, ...evidence.filter(value => value !== l.host)], options);
    const homograph = l.mixedScript || l.confusableChars.length > 0;
    if (homograph) appearance('V-HOMOGRAPH', 'アドレスの名前に、異なる種類の文字や見間違えやすい文字が混ざっています。', [l.hostUnicode, ...l.confusableChars]);
    if (!l.brand.official) {
      if (l.brand.subdomain.length) appearance('V-BRAND-SUBDOMAIN', '公式ドメインの名前が別の登録ドメインの手前に並ぶ、見分けにくい並びです。この診断の公式ドメイン一覧にはありません。', [l.host, ...l.brand.subdomain.map(b => b.domain)]);
      if (l.brand.typo.length) appearance('V-BRAND-TYPO', 'ブランド名と似たつづりです。この診断の公式ドメイン一覧にはありません。', l.brand.typo.map(b => `${b.label} / ${b.brandLabel}`));
      const keywords = l.brand.keyword;
      const pathOnly = keywords.length > 0 && keywords.every(b => b.where === 'path');
      if (keywords.length) appearance('V-BRAND-KEYWORD', pathOnly ? 'パス（名前の後ろの部分）にブランド名があります。この診断の公式ドメイン一覧にはありません。' : 'アドレスの名前にブランド名があります。この診断の公式ドメイン一覧にはありません。', [l.host, ...keywords.map(b => b.keyword)], { variant: (pathOnly ? 2 : 0) + (l.sensitiveWords.length ? 1 : 0) });
    }
    if (l.sensitiveWords.length >= 2) appearance('V-SENSITIVE-WORDS', '接続先の名前か、その後ろのパスに、ログイン・確認・配達・支払いなど、手続きを急がせる語が2つ以上あります。', l.sensitiveWords);
    if (l.tldRisky) appearance('V-TLD-RISKY', 'ドメインの末尾は、統計でなりすましの報告が多い名前の一つです。', [l.tld]);
    if (l.labelOdd) appearance('V-LABEL-ODD', 'ドメインの名前にハイフンが3つ以上あるか、数字などが不自然に長く連なっています。', [l.registrable]);
    if (l.subdomainDepth >= 4) appearance('V-DEEP-SUBDOMAIN', `登録されたドメインの前に、ドットで区切られた名前が${l.subdomainDepth}段あります。`, [l.host]);
  }
  evaluateAppearance(l, '入力');
  if (!(l.mixedScript || l.confusableChars.length > 0) && l.isPunycode) add('V-PUNYCODE', 'ドメインに、日本語などを変換したxn--の表記があります。', [l.host, l.hostUnicode]);
  if (l.freeHost || l.userContentHost === true) add('V-SHARED-HOST', '誰でもページを置けるサービスのアドレスです。このページの作成者は、サービスの運営会社とは限りません。', [l.host, l.freeHost?.provider], { status: 'info' });
  if (l.shortener === 'third-party') add('V-SHORTENER', '別のサービスを経由して、短いアドレスから転送する形式です。', [l.host]);
  if (l.urlLength > 120) add('V-LONG-URL', `アドレスは${l.urlLength}字です。`, [String(l.urlLength)], { variant: l.urlLength > 200 ? 1 : 0 });
  if (l.encodedCount >= 6 || l.doubleEncoded || l.hasNullByte) add('V-ENCODED', l.hasNullByte ? 'アドレスに、文字の終わりを表す%00が含まれています。' : l.doubleEncoded ? '変換した文字をさらに変換した書き方が含まれています。' : `アドレスに、%で始まる変換された文字が${l.encodedCount}個あります。`, [parsed.href]);
  if (l.redirectParams.length) add('V-REDIRECT-PARAM', 'url=などの欄に、別のドメインのアドレスがそのまま入っています。', l.redirectParams.map(p => `${p.name}: ${p.host}`));
  if (l.jpRestricted) good('V-JP-RESTRICTED', '登録資格のあるJPドメインの区分です。', [l.jpRestricted]);

  const available = Boolean(trace?.ok && trace.final);
  const final = available ? trace.final : null;
  const html = final?.kind === 'html' ? trace.html : null;
  const notFetched = !trace && parsed.fetch?.allowed === false;
  const chain = [];
  const chainItem = (url, host, status, role) => ({ url, host, registrable: domain(host), scheme: new URL(url).protocol.slice(0, -1), status, role });
  for (const hop of trace?.hops ?? []) {
    chain.push(chainItem(hop.url, hop.host, hop.status, chain.length === 0 ? 'input' : 'redirect'));
  }
  if (final) chain.push(chainItem(final.url, final.host, final.status, 'final'));
  if (!chain.length) chain.push(chainItem(parsed.href, parsed.hostname, null, 'input'));
  const destinations = [];
  for (const hop of chain) {
    if (hop.host === parsed.hostname) continue;
    const destination = parse(hop.url);
    if (!destination.ok) continue;
    const facts = analyze(destination);
    destinations.push({ hop, facts });
    evaluateAppearance(facts, hop.role === 'final' ? '最終ページ' : '転送の途中');
  }
  if (l.brand.official && l.userContentHost !== true) {
    const leavesBrand = destinations.some(({ hop, facts }) => domain(hop.host) !== parsed.registrable &&
      (facts.userContentHost === true || facts.brand.official?.id !== l.brand.official.id));
    add('V-OFFICIAL-DOMAIN', leavesBrand ? '入口は公式ドメインの一覧にありますが、転送先は別のドメインです' :
      `ホストは${l.brand.official.name}の公式ドメインの一覧にあります。ただし、このドメインの中の個々のページを誰が作ったかは、ドメインからは分かりません。`,
      [l.host, l.brand.official.name], { status: leavesBrand ? 'info' : 'good' });
  }
  const domains = new Set(chain.map(h => h.registrable));
  if (available && domains.size >= 3) add('V-REDIRECT-CROSS', `転送の経路に${domains.size}個の登録ドメインがあります。`, [...domains], { variant: domains.size >= 5 ? 1 : 0 });
  if (available && chain.some((hop, i) => i > 0 && chain[i - 1].scheme === 'https' && hop.scheme === 'http')) add('V-HTTPS-DOWNGRADE', '転送の経路がHTTPSからHTTPへ変わっています。', chain.map(h => h.url));
  if (!available) {
    const blocked = trace?.error?.code === 'blocked_by_challenge';
    if (notFetched) {
      const reasons = {
        userinfo: 'アドレスに認証情報が含まれているので', numeric_host: '数字のアドレスを直接指定しているので',
        reserved_name: parsed.hostname === 'example' || parsed.hostname.endsWith('.example') ? '見本用の予約された名前なので' : '内部向け、または予約された名前なので',
        port: 'このサービスが接続するポート（80・443）以外を指定しているので',
        self: 'このサービス自身を呼ぶアドレスなので', scheme: 'http・https以外の形式なので',
        too_long: `アドレスが${LIMITS.MAX_URL_LENGTH}字を超えているので`
      };
      add('V-NOT-FETCHED', `このアドレスは、つなぎに行きませんでした。理由：${reasons[parsed.fetch.reason] ?? '接続を見送る条件に当てはまったので'}。`, [], { status: 'unknown' });
      unavailableReason = findings.at(-1).what;
    } else add(blocked ? 'V-BLOCKED-FETCH' : 'V-UNREACHABLE', unavailableReason, [], { status: 'unknown', title: ownFailure ? 'このアプリ側の都合で、調べられませんでした' : null, why: ownFailure ? `${ownFailure.next}。相手のサイトの問題とは限りません。` : '時間をおいて試すか、公式のアプリから開き直してください。つながらないことは、安全の印ではありません。' });
    if (trace?.error?.code === 'tls_failed') add('V-TLS-FAIL', unavailableReason, [], { status: 'unknown', why: '時間をおいて試すか、公式のアプリから開き直してください。つながらないことは、安全の印ではありません。' });
    add('O-UNKNOWN', '最終応答を取得できないため点数を出していません。', [unavailableReason], { status: 'unknown' });
    if (!notFetched) limits.push(unavailableReason);
  } else {
    if ([403, 429].includes(final.status) || (final.status >= 500 && (final.headers['cf-mitigated'] === 'challenge' || /captcha|challenge|アクセス.*制限|access denied/i.test([html?.title, html?.h1, html?.textSample].join(' '))))) add('V-BLOCKED-FETCH', `応答は${final.status}でした。この診断からの取得を制限している可能性があります。`, [String(final.status)], { status: 'unknown' });
    if (final.status >= 400) add('O-STATUS-NOTE', `この応答は${final.status}（エラーの状態）でした。エラー画面は、通常のページと設定が違うことがあります。`, [String(final.status)], { status: 'info' });
    if (final.scheme === 'http') add('V-HTTP', `転送先の通信はHTTP（暗号化なし）でした。パスワード欄は${html ? `${html.passwordFields}個です` : '未確認です'}。`, [final.url], { variant: html?.passwordFields > 0 ? 1 : 0 });
    const reason = final.download?.reason;
    const ext = (final.download?.ext ?? new URL(final.url).pathname.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').replace(/^\./, '').toLowerCase();
    const apk = reason === 'apk' || ext === 'apk' || final.contentType?.split(';')[0].trim() === 'application/vnd.android.package-archive';
    const exec = reason === 'executable' || /^(exe|msi|scr|bat|cmd|js|vbs|jar|dmg|pkg|lnk|hta|ps1)$/.test(ext);
    const archive = reason === 'archive' || /^(zip|rar|7z|iso|img)$/.test(ext);
    if (final.kind !== 'html' && (apk || exec || archive)) {
      add(apk ? 'V-DOWNLOAD-APK' : exec ? 'V-DOWNLOAD-EXEC' : 'V-DOWNLOAD-ARCHIVE', '最終応答の形式またはファイル名が配布ファイルに一致しています。', [final.download?.filename, final.contentType, ext]);
    }
    if (html) {
      const forms = html.forms, sensitiveForm = forms.some(f => f.hasPassword || f.hasCardLike || f.hasEmail) || html.passwordFields > 0;
      // 検索窓のような小さなフォームは「入力を求める画面」に数えない（ニュースの解説記事を拾わないため）。
      const bigForm = forms.some(f => f.fieldCount >= 3);
      const text = [html.title, html.h1, html.siteName].filter(Boolean).join(' ');
      const context = sensitiveForm || /ログイン|サインイン|認証|確認|会員|マイページ|sign\s*in|log\s*in|verify|verification/i.test(text);
      const finalFacts = final.host === parsed.hostname ? l : destinations.find(d => d.hop.role === 'final')?.facts;
      const official = finalFacts?.userContentHost === true ? null : officialOf(final.host, domain(final.host));
      const brands = context && !official ? brandInText(text) : [];
      if (brands.length) add('V-BRAND-CONTENT', !sensitiveForm && !bigForm ? 'ブランド名と確認を促す語が題にありますが、パスワードやカードなどを求める入力欄は見つかりませんでした。解説記事などの可能性もあります' : '題名・見出し・サイト名にブランド名があり、入力や確認の案内もあります。', [text, final.host, ...brands.map(b => b.name)], { variant: sensitiveForm ? 1 : !bigForm ? 2 : 0 });
      const crossForms = forms.filter(f => (f.hasPassword || f.hasCardLike) && f.actionHost && domain(f.actionHost) !== domain(final.host));
      if (crossForms.length) add('V-CROSS-FORM', 'パスワードやカード情報の入力欄に、別のドメインへ送信する指定があります。', crossForms.map(f => f.action));
      const refreshHost = hostOf(html.metaRefresh?.url);
      if (refreshHost && domain(refreshHost) !== domain(final.host)) add('V-META-REFRESH', 'ページ内に、別のドメインへ自動で転送する指定（meta refresh）があります。', [html.metaRefresh.url], { variant: html.passwordFields > 0 ? 1 : 0 });
      const hiddenFrames = html.iframes.filter(f => f.hidden && f.host && domain(f.host) !== domain(final.host));
      if (hiddenFrames.length) add('V-HIDDEN-IFRAME', '別のドメインのページを、見えない状態で埋め込む指定（iframe）があります。', hiddenFrames.map(f => f.src), { variant: html.passwordFields > 0 ? 1 : 0 });
      const obfuscations = [...new Set(html.signals.obfuscation)];
      if (obfuscations.length) add('V-OBFUSCATION', `コードの内容を読み取りにくくする書き方が${obfuscations.length}種類見つかりました。`, obfuscations, { variant: obfuscations.length > 1 ? 1 : 0 });
      evaluateOwner(final, html);
    } else if (final.kind === 'html') {
      limits.push('ページの中身を読み取った結果がないため、中身に関わる項目は確認していません。');
      evaluateOwner(final, null);
    } else limits.push('最終応答はHTMLではないため、運営者向けの守りの採点は対象外です。');
    if (final.truncated || html?.truncated) limits.push(`ページが大きいため、先頭の一部（${LIMITS.BODY_CAP_BYTES / 1024}KiB）だけを見ました。`);
    // 先頭の一部だけ読んだ（body_truncated）ことは上の1行で言っている。ここでは、ほかの制限だけを言う。
    if (trace.notes?.includes('trimmed')) limits.push('数が多いため、フォーム・読み込むファイル・Cookieなどの一部を省いて示しています。');
  }

  if (!around) limits.push('周辺情報は取得できませんでした：DNS・登録日・HTTP転送・security.txtは未確認です。');
  else {
    if ('unavailable' in around.rdap) {
      const reasons = {
        unsupported: 'このドメインの登録日は公開情報から取れませんでした（.jpなど）。',
        timeout: '登録日の確認が時間切れになりました。',
        error: '登録日の確認で通信や応答のエラーが起きました。',
        not_found: '公開情報に、このドメインの登録日は見つかりませんでした。'
      };
      limits.push(reasons[around.rdap.unavailable] ?? 'このドメインの登録日は確認できませんでした。');
    }
    else if (available) {
      const age = around.rdap.ageDays;
      if (Number.isInteger(age) && age >= 0 && age < 365) {
        const variant = age < 14 ? 0 : age < 30 ? 1 : age < 90 ? 2 : 3;
        add('V-NEW-DOMAIN', `登録から${age}日です。`, [`${String(around.rdap.registeredAt).slice(0, 10)}に登録（${age}日前）`], { variant });
      } else if (age >= 365 * 5) good('V-OLD-DOMAIN', `登録から${age}日です。`, [`${String(around.rdap.registeredAt).slice(0, 10)}に登録（${age}日前）`]);
    }
    if ('unavailable' in around.dns) limits.push(`DNSの確認ができませんでした（名前の接続先や設定）：${fetchReason({ code: around.dns.unavailable })}`);
    if (!around.httpProbe.tested) limits.push(`HTTPからの転送は確認できませんでした：${fetchReason({ code: around.httpProbe.reason })}`);
    if (final?.scheme === 'http' && !around.httpsProbe.tested) limits.push('HTTPSで接続できるかは確認できませんでした：未取得');
    if ('unavailable' in around.securityTxt) limits.push(final?.scheme === 'http' ? 'このサイトはHTTPSにつながらないため、security.txtは確認していません。' : `security.txtは取得できませんでした：${fetchReason({ code: around.securityTxt.unavailable })}`);
    if (around.error) limits.push(clean(`周辺情報の一部を取得できませんでした：${fetchReason(around.error)}`));
  }
  findings.sort(sortFindings);
  const visitorBad = findings.filter(f => f.axis === 'visitor' && f.status === 'bad');
  const points = visitorBad.reduce((n, f) => n + f.points, 0);
  const scoredLevel = visitorLevel(points, visitorBad.map(f => f.floor));
  const level = !available && scoredLevel === 'ok' ? 'unknown' : scoredLevel;
  const score = final?.kind === 'html' ? ownerScore(findings) : null;
  // 守りの点数に効く周辺の事実（メールの設定・HTTPからの転送・HTTPSへの到達）が揃っているか。登録日やsecurity.txtは点数に効かないので数えない。
  const ownerFactsComplete = Boolean(around && !around.error && !('unavailable' in around.dns) && (final?.scheme !== 'https' || around.httpProbe.tested) && (final?.scheme !== 'http' || around.httpsProbe.tested));
  const aroundComplete = Boolean(around && !around.error && !('unavailable' in around.dns) && !('unavailable' in around.rdap) && around.httpProbe.tested && !('unavailable' in around.securityTxt) && (final?.scheme !== 'http' || around.httpsProbe.tested));
  const summary = notFetched ? 'このアドレスにはつなぎに行かず、アドレスの見た目だけで判断しました。' : !available ? 'つながらなかったので、アドレスの見た目だけで判断しました。' :
    !aroundComplete || (final.kind === 'html' && !html) ? '取得できた一部の情報から判定しました。取れなかった情報は「見ていないこと」に記しています。' : '診断した時点で見えた情報から判定しました。';
  return {
    v: 1, target: { input: parsed.original ?? parsed.href, href: parsed.href, host: parsed.hostname, hostUnicode: parsed.hostUnicode, registrable: parsed.registrable, finalUrl: final?.url ?? null, finalHost: final?.host ?? null, chain },
    visitor: { level, points, headline: HEADLINES[level], summary: ownFailure ? 'このアプリ側の都合で相手のサイトを調べられなかったので、アドレスの見た目だけで判断しました。' : summary, actions: ownFailure ? [ownFailure.next] : [...ACTIONS[level]], reasons: [...(level === 'unknown' ? [unavailableReason] : []), ...[...visitorBad].sort((a, b) => b.points - a.points).map(f => f.title)].slice(0, 3) },
    owner: { score, grade: gradeOf(score), provisional: score !== null && !ownerFactsComplete, note: `点数が低くても、危険なサイトという意味ではありません。観測できた守りの設定の独自評価です。${final && final.kind !== 'html' ? final.kind === 'download' ? 'ダウンロードされるファイルなので、サイトの守りの点数は付けていません。' : 'HTML以外の応答は採点の対象外です。' : ''}${score !== null && !ownerFactsComplete ? '周辺の情報（メールの設定・HTTPからの転送など）の一部を取得できなかったので、この点数は暫定です。確かめられなかった項目があるので、実際はこれより低いことがあります。' : ''}${score !== null ? LIMITS_TEXT.find(line => line.startsWith('CSP（')) ?? '' : ''}`,
      topFixes: findings.filter(f => f.axis === 'owner' && f.status === 'bad' && f.points > 0 && f.severity !== 'info').sort((a, b) => b.points - a.points || severityRank[b.severity] - severityRank[a.severity]).slice(0, 3).map(f => ({ id: f.id, gain: f.points })) },
    findings, limits: [...new Set(limits)], partial: { trace: available, around: Boolean(around && !around.error) }, evaluatedAt: new Date(now).toISOString()
  };

  function evaluateOwner(f, h) {
    const headers = f.headers, https = f.scheme === 'https', hf = headerFindings(f, h);
    const owner = (id, what, evidence = [], options = {}) => add(id, what, evidence, options);
    const check = (ok, badId, goodId, what, evidence = []) => ok ? good(goodId, what, evidence) : owner(badId, what, evidence);
    if (https) {
      good('O-HTTPS-OK', '最終応答をHTTPSで取得しました。', [f.url]);
      if (!hf.hsts.valid) owner('O-HSTS-MISSING', hf.hsts.maxAge === 0 ? 'HSTSのmax-age=0で、HTTPSで開く保護を解除する指定があります。' : 'HTTPSの応答に、有効なHSTSの指定がありません。', [hf.hsts.maxAge === 0 ? 'max-age=0（保護の解除）' : headers['strict-transport-security'] ?? 'ヘッダーなし']);
      else if (hf.hsts.maxAge < 15552000) owner('O-HSTS-WEAK', `HTTPSで開く指定（HSTS）を覚える期間は${hf.hsts.maxAge}秒です。`, [headers['strict-transport-security']]);
      else good('O-HSTS-OK', `HTTPSで開く指定（HSTS）を覚える期間は${hf.hsts.maxAge}秒です。`, [headers['strict-transport-security']]);
    } else if (around?.httpsProbe.tested && !around.httpsProbe.reachable) owner('O-NO-HTTPS', '最終応答はHTTPでした。https:// でも試しましたが、つながりませんでした（http:// では応答がありました）。', [f.url, around.httpsProbe.error]);
    if ((https || around?.httpsProbe.reachable) && around?.httpProbe.tested && !around.httpProbe.upgradesToHttps) owner('O-NO-UPGRADE', 'HTTPの入口がHTTPSへ転送されませんでした。', [around.httpProbe.status, around.httpProbe.location]);
    if (!hf.csp.present) owner('O-CSP-MISSING', hf.csp.reportOnlyOnly ? 'CSPは違反を報告する設定（Report-Only）だけで、読み込みを止める設定はありません。' : '読み込み元を制限するCSPが、応答ヘッダーにもページ内にもありません。', [headers['content-security-policy-report-only'] ?? 'CSPなし']);
    else if (hf.csp.metaOnly || hf.csp.issues.length) owner('O-CSP-WEAK', hf.csp.metaOnly ? 'CSPはページ内のmetaタグだけにあり、使える制限が限られます。' : hf.csp.issues.includes('コードの読み込み元を制限する指定なし') ? 'コードの読み込み元を制限するscript-srcも、共通のdefault-srcもありません。' : 'コードの読み込みや実行を広く許すCSPの設定があります。', hf.csp.metaOnly ? ['meta CSP'] : hf.csp.issues);
    else good('O-CSP-OK', '読み込みを止めるCSPがあり、今回の簡易確認ではコードを広く許す設定は見つかりませんでした。', [headers['content-security-policy']]);
    check(hf.frame, 'O-FRAME-MISSING', 'O-FRAME-OK', hf.frame ? '他サイトへの埋め込みを制限する応答ヘッダーがあります。' : '他サイトへの埋め込みを制限する指定が、応答ヘッダーにありません。', [headers['x-frame-options'] ?? 'X-Frame-Optionsなし', hf.csp.hasFramePolicy ? headers['content-security-policy'] : 'ヘッダーのframe-ancestorsなし']);
    check(hf.xcto, 'O-XCTO-MISSING', 'O-XCTO-OK', hf.xcto ? 'nosniffが設定されています。' : '有効なnosniffがありません。', [headers['x-content-type-options'] ?? 'ヘッダーなし']);
    check(hf.referrer, 'O-REFERRER-MISSING', 'O-REFERRER-OK', hf.referrer ? 'リンク元情報の扱いを指定する値があります。' : 'リンク元の情報の扱いを指定する設定が、応答ヘッダーにもページ内にもありません。', [headers['referrer-policy'] ?? h?.signals.metaReferrer ?? '設定なし']);
    const cookies = hf.cookies;
    if (cookies.secureMissing.length) owner('O-COOKIE-SECURE', 'HTTPSの応答で、ログイン状態などに使うと推測したCookieにSecureがありません。', cookies.secureMissing);
    if (cookies.invalid.length) limits.push(clean(`Cookie名の先頭の印やSameSite=Noneの条件に合わない属性があります：${cookies.invalid.join('、')}。この不一致自体には点数を付けていません。`));
    if (cookies.httpOnlyMissing.length) owner('O-COOKIE-HTTPONLY', 'ログイン状態などに使うと推測したCookieにHttpOnlyがありません。', cookies.httpOnlyMissing);
    if (cookies.sameSiteMissing.length) owner('O-COOKIE-SAMESITE', 'ログイン状態などに使うと推測したCookieにSameSiteがありません。', cookies.sameSiteMissing);
    if (!Object.values(cookies).some(a => a.length)) good('O-COOKIE-OK', f.cookies.length ? 'ログイン状態などに使うと推測したCookieの基本属性に、不足は見つかりませんでした。' : '今回の応答ではCookieはありません。', f.cookies.map(c => c.name));
    const versionHeaders = ['server', 'x-powered-by', 'x-aspnet-version'].filter(key => /\d+\.\d+/.test(headers[key] ?? ''));
    if (versionHeaders.length) owner('O-VERSION-DISCLOSURE', '応答ヘッダーに、製品のバージョンが書かれています。', versionHeaders.map(k => `${k}: ${headers[k]}`));
    const ended = detectEol(headers, now);
    if (ended.length) owner('O-EOL-SOFTWARE', '応答ヘッダーに、開発元の保守が終わったバージョンが書かれています。確認できた終了日や古い系統の説明は根拠欄に示します。', ended.map(e => e.eolDate ? `${e.product} ${e.series} / ${e.eolDate}` : e.detail));
    if (h) {
      const refs = [...h.scripts.external, ...h.styles.external];
      const mixed = [...refs, ...h.iframes].filter(r => r.scheme === 'http');
      if (https && mixed.length) owner('O-MIXED-ACTIVE', 'HTTPSのページに、HTTPでコード・見た目の設定・埋め込みページを読み込む指定があります。', mixed.map(r => r.src ?? r.href));
      if (https && h.images.http > 0) owner('O-MIXED-PASSIVE', `HTTPの画像が${h.images.http}件あります。`, [String(h.images.http)]);
      const noSri = refs.filter(r => r.host && r.host !== f.host && !r.sri);
      if (noSri.length) owner('O-SRI-MISSING', '別のホストのコードや見た目の設定ファイルに、内容を照合する指定（integrity）がありません。', noSri.map(r => r.src ?? r.href));
      const libraries = detectLibs(h.scripts.external, { selfHost: f.host });
      const vulnerabilities = libraries.flatMap(lib => lib.advisories.filter(a => a.kind === 'vuln').map(a => ({ ...a, lib: lib.lib, version: lib.version, hosts: lib.hosts })));
      if (vulnerabilities.length) {
        const weights = vulnerabilities.map(v => VULN_WEIGHTS.find(w => v.cvss >= w.min));
        const deduction = { points: Math.min(VULN_CAP, weights.reduce((n, w) => n + w.points, 0)), severity: weights.reduce((a, b) => severityRank[a.severity] >= severityRank[b.severity] ? a : b).severity, floor: null };
        owner('O-VULN-LIB', 'JavaScriptの部品のアドレスに、既知の弱点があるバージョンが書かれています。実際の影響は未確認です。', vulnerabilities.map(v => `${v.lib} ${v.version}: ${v.id}${v.candidate ? '（候補）' : ''} ${v.range}${v.hosts.length > 1 ? ` / 複数の配信元から読み込み：${v.hosts.map(host => host ?? '同じサイト').join('、')}` : ''}`), { deduction });
      }
      const endedLibs = libraries.filter(lib => lib.advisories.some(a => a.kind === 'eol'));
      if (endedLibs.length) owner('O-EOL-LIB', 'JavaScriptの部品のアドレスに、開発元の保守が終わったバージョンが書かれています。', endedLibs.map(v => `${v.lib} ${v.version}`));
      const httpForms = h.forms.filter(form => /^http:/i.test(form.action));
      if (https && httpForms.length) owner('O-FORM-HTTP', 'HTTPSページのフォームにHTTPの送信先があります。', httpForms.map(form => form.action));
      if (!https && h.passwordFields > 0) owner('O-PASSWORD-HTTP', `HTTPのページにパスワード欄が${h.passwordFields}個あります。`, [f.url, String(h.passwordFields)]);
      if (h.signals.directoryListing) owner('O-DIR-LISTING', 'フォルダ内のファイル一覧らしい見出しがあります。', [h.title, h.h1]);
      if (h.signals.errorDisclosure) owner('O-ERROR-DISCLOSURE', 'エラーの詳細や内部の処理を示す書き方が見つかりました。', [h.signals.errorDisclosure]);
      if (h.signals.defaultPage) owner('O-DEFAULT-PAGE', 'サーバーの初期画面らしい題名や見出しがあります。', [h.signals.defaultPage, h.title]);
    }
    if (around?.dns && !('unavailable' in around.dns)) {
      const dns = around.dns;
      if (!dns.dmarc.present) owner('O-DMARC-MISSING', 'このドメインのメールなりすまし対策（DMARC）は見つかりませんでした。', [around.registrable]);
      if (!dns.spf.present) owner('O-SPF-MISSING', 'このドメインでメールを送ってよいサーバーの指定（SPF）は見つかりませんでした。', [around.registrable]);
      if ((dns.dmarc.present && dns.dmarc.policy === 'none') || (dns.spf.present && ['+all', '?all'].includes(dns.spf.all))) owner('O-DMARC-WEAK', 'メールのなりすましを制限しないDMARCの設定か、送信元を広く許すSPFの設定があります。', [dns.dmarc.value, dns.spf.value]);
    }
    if (headers['access-control-allow-origin']?.trim() === '*' && headers['access-control-allow-credentials']?.trim().toLowerCase() === 'true') owner('O-CORS-WILDCARD-CREDS', '応答ヘッダーに、すべての接続元（*）と認証情報付きの通信（true）を同時に許す指定があります。', ['Access-Control-Allow-Origin: *', 'Access-Control-Allow-Credentials: true']);
    const deprecated = ['public-key-pins', 'expect-ct'].filter(k => headers[k]);
    if (headers['x-xss-protection'] && !/^0(?:\s*;|\s*$)/.test(headers['x-xss-protection'])) deprecated.push('x-xss-protection');
    if (deprecated.length) add('O-DEPRECATED-HEADER', '現在は推奨されないヘッダーが付いています。', deprecated.map(k => `${k}: ${headers[k]}`), { status: 'info' });
    if (around?.securityTxt && !('unavailable' in around.securityTxt)) add('O-SECURITY-TXT', around.securityTxt.found ? `security.txt（問題の連絡先を記すファイル）があり、連絡先は${around.securityTxt.hasContact ? '記載あり' : '未記載'}です。${around.securityTxt.expired ? '記載された期限は過ぎています。' : around.securityTxt.expires ? '記載された期限は過ぎていません。' : '期限の記載は確認できませんでした。'}` : 'security.txtは見つかりませんでした。', [String(around.securityTxt.status), around.securityTxt.expires], { status: around.securityTxt.found ? 'good' : 'info' });
  }
}
