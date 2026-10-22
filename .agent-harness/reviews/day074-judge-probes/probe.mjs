// Offline review probes. No fetch, DNS, subprocesses, or writes.
import { readFileSync, readdirSync } from 'node:fs';
import { parseInput } from '../../../day-074-link-dokumi/lib/url-input.js';
import { analyzeLexical } from '../../../day-074-link-dokumi/lib/lexical.js';
import { evaluate } from '../../../day-074-link-dokumi/lib/rules.js';
import { validateResult, validateTrace, validateAround } from '../../../day-074-link-dokumi/lib/contract.js';
import { registrableDomain } from '../../../day-074-link-dokumi/lib/psl.js';
import { visitorLevel, gradeOf } from '../../../day-074-link-dokumi/lib/score.js';
import { buildReport, buildSummary } from '../../../day-074-link-dokumi/lib/report.js';

const fixtures = new URL('../../../day-074-link-dokumi/tests/fixtures/', import.meta.url);
const fixture = name => JSON.parse(readFileSync(new URL(name + '.json', fixtures), 'utf8'));
const now = Date.parse('2026-10-22T00:00:00Z');
const extraDomains = {
  自治体: 'www.city.sapporo.jp www.city.sendai.jp www.city.saitama.lg.jp www.city.chiba.jp www.city.yokohama.lg.jp www.city.kawasaki.jp www.city.sagamihara.kanagawa.jp www.city.niigata.lg.jp www.city.shizuoka.lg.jp www.city.hamamatsu.shizuoka.jp www.city.nagoya.jp www.city.kyoto.lg.jp www.city.osaka.lg.jp www.city.sakai.lg.jp www.city.kobe.lg.jp www.city.okayama.jp www.city.hiroshima.lg.jp www.city.kitakyushu.lg.jp www.city.fukuoka.lg.jp www.city.kumamoto.jp www.city.hachioji.tokyo.jp www.city.machida.tokyo.jp www.pref.hokkaido.lg.jp www.pref.aichi.jp www.pref.okinawa.jp',
  大学学校: 'www.osaka-u.ac.jp www.tohoku.ac.jp www.hokudai.ac.jp www.nagoya-u.ac.jp www.kyushu-u.ac.jp www.tsukuba.ac.jp www.kobe-u.ac.jp www.hiroshima-u.ac.jp www.waseda.jp www.keio.ac.jp www.sophia.ac.jp www.ritsumei.ac.jp www.doshisha.ac.jp www.titech.ac.jp www.ocha.ac.jp www.mizuho.ac.jp www.yamato-u.ac.jp www.kaiseigakuen.jp www.azabu-jh.ed.jp www.musashi.ed.jp',
  病院: 'www.ncc.go.jp www.ncchd.go.jp www.ncnp.go.jp www.ncvc.go.jp www.jrc.or.jp hospital.luke.ac.jp www.kameda.com toranomon.kkr.or.jp www.saitama-med.ac.jp www.jichi.ac.jp',
  メディア: 'www.yomiuri.co.jp mainichi.jp www.nikkei.com www.sankei.com www.tokyo-np.co.jp www.chunichi.co.jp www.hokkaido-np.co.jp www.okinawatimes.co.jp ryukyushimpo.jp www.nishinippon.co.jp www.kobe-np.co.jp www.shinmai.co.jp www.itmedia.co.jp news.mynavi.jp www.watch.impress.co.jp gigazine.net www.bunshun.jp toyokeizai.net diamond.jp president.jp',
  EC企業: 'www.yodobashi.com www.biccamera.com joshinweb.jp www.askul.co.jp www.monotaro.com www.muji.com www.uniqlo.com www.nitori-net.jp www.lohaco.jp zozo.jp www.qoo10.jp www.dospara.co.jp www.suruga-ya.jp www.irisplaza.co.jp www.dinos.co.jp www.bellemaison.jp www.felissimo.co.jp www.palcloset.jp ahamo.com www.docomo-cycle.jp www.rakuten-wallet.co.jp rakuten.today www.saison-fund.co.jp www.kitano-hp.or.jp',
  ブログ個人: 'note.com hatenablog.com blog.hatena.ne.jp ameblo.jp livedoor.blog jugem.jp cocolog-nifty.com zenn.dev qiita.com www.1101.com www.chikawatanabe.com www.yamdas.org www.hyuki.com www.otsune.com hagex.hatenadiary.jp',
  組合NPO: 'www.jtuc-rengo.or.jp www.zenroren.gr.jp www.seikatsuclub.coop jccu.coop www.zennoh.or.jp www.ja-group.jp www.greenpeace.org www.wwf.or.jp www.msf.or.jp www.japanforunhcr.org www.janic.org www.npo-homepage.go.jp www.jnpoc.ne.jp www.shaplaneer.org www.nippon-foundation.or.jp',
  紛らわしい正規名: 'pineapple.com applebees.com scrapple.com amazonaws.com mercari-shops.com lineage2.com'
};
function run(raw, trace = null, around = null) {
  const parsed = parseInput(raw);
  if (!parsed.ok) return { parsed };
  const lexical = analyzeLexical(parsed);
  try {
    const result = evaluate({ parsed, lexical, trace, around, now });
    return { parsed, lexical, result, validation: validateResult(result) };
  } catch (error) { return { parsed, lexical, error: String(error) }; }
}
const compact = x => x.error ? { error: x.error } : !x.result ? { rejected: x.parsed.reason } : {
  level: x.result.visitor.level, points: x.result.visitor.points,
  bad: x.result.findings.filter(f => f.axis === 'visitor' && f.status === 'bad').map(f => f.id),
  brands: x.result.findings.filter(f => f.id.startsWith('V-BRAND-')).map(f => f.id),
  valid: x.validation.ok, errors: x.validation.errors
};
function observations(raw, traceName = 'trace-clean', aroundName = 'around-clean') {
  const trace = fixture(traceName), around = fixture(aroundName), u = new URL(raw);
  trace.requested = u.href;
  Object.assign(trace.final, { url: u.href, host: u.hostname, scheme: u.protocol.slice(0, -1) });
  Object.assign(around, { host: u.hostname, registrable: registrableDomain(u.hostname).registrable, scheme: u.protocol.slice(0, -1) });
  if (traceName === 'trace-clean') { trace.html.forms = []; trace.html.scripts.external = []; trace.html.styles.external = []; }
  return { trace, around };
}
const old = new Set(fixture('legit-domains'));
const legit = Object.entries(extraDomains).flatMap(([category, hosts]) => hosts.split(' ').map(host => {
  const raw = 'https://' + host + '/', obs = observations(raw);
  return { category, host, inExistingFixture: old.has(host), offline: compact(run(raw)), withClean: compact(run(raw, obs.trace, obs.around)) };
}));
const phishingInputs = [
  'https://amazon-co-jp.verify-account.top/', 'https://www.amazon.co.jp.account-check.xyz/',
  'https://smbc-card.com.login-secure.example/', 'https://rakuten-card-login.cn/',
  'https://kuronekoyamato-redelivery.top/', 'https://apple-id-locked.icu/',
  'https://paypay-bank.co.jp.verify.example/', 'https://xn--mazon-3ve.co.jp/',
  'https://amazon.co.jp@evil.example/', 'http://203.0.113.5/login',
  'https://vpass-member-verify.com/', 'https://myjcb-secure-verify.top/',
  'https://etc-meisai.jp.payment-check.top/', 'https://d-account-authentication.icu/',
  'https://e-navi-rakuten-card.icu/', 'https://e-tax-refund-confirm.top/',
  'https://saison-netanswer-verify.icu/', 'https://aeon-card-auth.icu/',
  'https://eposcard-secure-login.top/', 'https://eki-net-payment-update.icu/',
  'https://mynumber-card-update.icu/', 'https://tepco-payment-verify.icu/',
  'https://jp-bank-login-confirm.top/', 'https://softbank-billing-verify.icu/',
  'https://netflix-payment-update.icu/', 'https://microsoft-security-verify.icu/',
  'https://secure-paypay.pages.dev/login', 'https://apple-login.vercel.app/',
  'https://amazon.netlify.app/login', 'https://google-account.web.app/verify',
  'https://bank-login.sakura.ne.jp/', 'https://аpple.icu/',
  'https://random.top/amazon/login', 'https://smbc-vpass.top/'
];
const phishing = phishingInputs.map(raw => {
  const obs = observations(raw), malicious = observations(raw, 'trace-lookalike', 'around-lookalike');
  return { raw, offline: compact(run(raw)), withClean: compact(run(raw, obs.trace, obs.around)),
    withLookalike: compact(run(raw, malicious.trace, malicious.around)) };
});
const targeted = [];
function record(name, raw, modify) {
  const obs = observations(raw); modify?.(obs);
  const x = run(raw, obs.trace, obs.around);
  targeted.push({ name, raw, traceValid: obs.trace ? validateTrace(obs.trace).ok : null,
    aroundValid: obs.around ? validateAround(obs.around).ok : null,
    ...compact(x), owner: x.result?.owner,
    findings: x.result?.findings.map(f => ({ id: f.id, status: f.status, points: f.points, what: f.what, why: f.why })),
    limits: x.result?.limits, summary: x.result?.visitor.summary,
    copy: x.result ? buildSummary(x.result) : null });
}
for (const start of ['https://bit.ly/test', 'https://t.co/test', 'https://www.google.com/url']) record('redirect-to-brand-spoof', start, ({trace,around}) => {
  const destination = 'https://amazon.co.jp.account-check.xyz/signin';
  trace.hops = [{ url: start, host: new URL(start).hostname, status: 302, location: destination, ms: 1 }];
  Object.assign(trace.final, { url: destination, host: new URL(destination).hostname });
  Object.assign(around, {host:trace.final.host,registrable:registrableDomain(trace.final.host).registrable});
});
record('intermediate-spoof-then-clean', 'https://bit.ly/test', ({trace,around}) => {
  const middle = 'https://amazon.co.jp.account-check.xyz/';
  Object.assign(trace.final, {url:'https://ordinary.example/',host:'ordinary.example'});
  Object.assign(around, {host:trace.final.host,registrable:'ordinary.example'});
  trace.hops = [ { url: trace.requested, host: 'bit.ly', status: 302, location: middle, ms: 1 },
    { url: middle, host: new URL(middle).hostname, status: 302, location: trace.final.url, ms: 1 } ];
});
for (const suffix of ['sakura.ne.jp', 'tokyo.jp', 's3.amazonaws.com']) record('cross-tenant-form-' + suffix, `https://first.${suffix}/`, ({trace}) => {
  trace.html.passwordFields = 1;
  trace.html.forms = [{ method: 'post', action: `https://second.${suffix}/send`, actionHost: `second.${suffix}`, hasPassword: true, hasEmail: true, hasCardLike: false, hasFileUpload: false, fieldCount: 2, hidden: 0 }];
});
for (const raw of ['https://s3.amazonaws.com/amazon-login/', 'https://bucket.s3.amazonaws.com/', 'http://bucket.s3-website-ap-northeast-1.amazonaws.com/', 'https://user.github.io/', 'https://tenant.pages.dev/']) record('brand-content-at-user-host', raw, ({trace}) => {
  trace.html.title = 'Amazon アカウント確認'; trace.html.passwordFields = 1;
});
record('news-login-article', 'https://news.mynavi.jp/', ({trace}) => { trace.html.title = 'Amazonのログイン方法を確認する'; });
for (const raw of ['https://e-tax-login.top/', 'https://verify.e-tax.top/', 'https://ordinary.top/e-tax/login']) record('compound-short-brand', raw);
record('security-txt-description', 'https://ordinary.example/', () => {});
for (const maxAge of [0, 15551999, 15552000]) record('hsts-' + maxAge, 'https://ordinary.example/', ({trace}) => {trace.final.headers['strict-transport-security'] = 'max-age=' + maxAge;});
for (const policy of ["script-src-elem *; default-src 'none'; frame-ancestors 'none'", "script-src 'self'; frame-ancestors https:", "default-src 'none', script-src *", "script-src 'strict-dynamic' 'unsafe-inline'", "script-src 'sha256-a' 'unsafe-inline'"]) record('csp-' + policy, 'https://ordinary.example/', ({trace}) => { trace.final.headers['content-security-policy'] = policy; });
record('http-probe-timeout', 'https://ordinary.example/', ({around}) => { around.httpProbe = { tested: true, status: null, location: null, upgradesToHttps: false }; });
record('redirect-parameter-same-registered-domain', 'https://example.com/?next=https://sub.example.com/');
for (const count of [1, 2]) record('same-cve-multiple-cdns-' + count, 'https://ordinary.example/', ({trace}) => {
  const urls = ['https://code.jquery.com/jquery-3.4.1.min.js', 'https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js'];
  trace.html.scripts.external = urls.slice(0, count).map(src => ({src, host:new URL(src).hostname, scheme:'https', sri:true, async:false, defer:false, module:false}));
});
record('cdn-other-file', 'https://ordinary.example/', ({trace}) => { trace.html.scripts.external = [{src:'https://unpkg.com/jquery@1.12.4/README.md',host:'unpkg.com',scheme:'https',sri:true,async:false,defer:false,module:false}]; });
for (const field of ['trace', 'around']) for (const value of [{}, false, 'unexpected']) record('malformed-' + field + '-' + JSON.stringify(value), 'https://ordinary.example/', obs => {obs[field] = value;});
for (const [name, modify] of [
  ['missing-headers', ({trace}) => {delete trace.final.headers;}],
  ['missing-signals', ({trace}) => {delete trace.html.signals;}],
  ['bad-final-url', ({trace}) => {trace.final.url = 'not a URL';}],
  ['missing-rdap', ({around}) => {delete around.rdap;}],
  ['error-plus-around', obs => {obs.trace = fixture('trace-tls-failed');}],
  ['long-dns-error', ({around}) => {around.dns = {unavailable:'a'.repeat(120)};}]
]) record(name, 'https://ordinary.example/', modify);
const rawInputs = ['', null, {}, 'ＨＴＴＰＳ：／／ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ／',
  'https://example.com/a\u0000b', 'https://example.com/a\nb', 'example.com/a\u0000b', 'https://example.com/\u202eamazon',
  'https://' + 'a.'.repeat(130) + 'com/',
  'https://example.com/' + 'a'.repeat(2028), 'https://example.com/' + 'a'.repeat(2029),
  'https://example.com/' + 'a'.repeat(2030), 'https://example.com/' + 'a'.repeat(100000)];
const rawResults = rawInputs.map(raw => ({ raw: typeof raw === 'string' && raw.length > 200 ? `URL length ${raw.length}` : raw, ...compact(run(raw)) }));
for (const value of [null, {}, false]) {
  try { evaluate({ parsed: parseInput('https://ordinary.example/'), lexical: value, now }); rawResults.push({raw:'lexical='+JSON.stringify(value), threw:false}); }
  catch(error) {rawResults.push({raw:'lexical='+JSON.stringify(value),error:String(error)});}
}
const fixtureMatrix = [];
for (const t of [...readdirSync(fixtures).filter(n => n.startsWith('trace-')), null]) for (const a of [...readdirSync(fixtures).filter(n => n.startsWith('around-')), null]) {
  const trace = t && fixture(t.slice(0,-5)), around = a && fixture(a.slice(0,-5));
  const x = run(trace?.requested ?? 'https://ordinary.example/', trace, around);
  fixtureMatrix.push({ t, a, ...compact(x) });
}
const boundaries = { visitor: [0,2,3,5,6,9,10].map(p => [p,visitorLevel(p)]), owner:[0,39,40,59,60,74,75,89,90,100].map(s=>[s,gradeOf(s)]) };
const summary = { legit:legit.length, newLegit:legit.filter(x=>!x.inExistingFixture).length,
  offlineNonOk:legit.filter(x=>x.offline.level!=='ok').length,
  legitBrandHits:legit.filter(x=>x.offline.brands?.length).map(x=>x.host),
  phishing:phishing.length, misses:phishing.filter(x=>!['warn','danger'].includes(x.offline.level)).map(x=>[x.raw,x.offline.level,x.offline.points]),
  fixtureMatrix:fixtureMatrix.length, fixtureFailures:fixtureMatrix.filter(x=>x.error||x.valid===false),
  targetedExceptions:targeted.filter(x=>x.error).map(x=>[x.name,x.error]) };
const data = {summary,legit,phishing,targeted,rawResults,boundaries,fixtureMatrix};
const mode = process.argv[2];
const output = mode === '--compact' ? {summary,legit,phishing,rawResults,boundaries,targeted:targeted.map(({findings,limits,summary,copy,...x})=>({...x,badFindings:findings?.filter(f=>f.status==='bad').map(f=>[f.id,f.points])}))}
  : mode?.startsWith('--case=') ? targeted.filter(x=>x.name === mode.slice(7))
  : mode === '--targeted' ? targeted : mode === '--summary' ? summary : data;
console.log(JSON.stringify(output));
