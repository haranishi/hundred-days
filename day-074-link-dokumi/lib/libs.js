export function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}

// research/R2 §D。範囲の食い違う11022を除外し、8203は共通範囲の候補に限定。
const ADVISORIES = [
  ['jquery', '1.1.4', '3.4.0', 'CVE-2019-11358', 6.1, 'medium', '未信頼オブジェクトのdeep extendによるプロトタイプ汚染'],
  ['jquery', '1.0.3', '3.5.0', 'CVE-2020-11023', 6.9, 'medium', '未信頼のoption入りHTMLをDOM操作へ渡す場合のXSS（スクリプトの混入）'],
  ['jquery-ui', null, '1.13.0', 'CVE-2021-41184', 6.5, 'medium', 'positionのofに未信頼文字列を渡す場合のXSS（スクリプトの混入）'],
  ['jquery-ui', null, '1.13.2', 'CVE-2022-31160', 6.1, 'medium', 'checkboxradioのrefreshによるHTML実体参照の誤復号'],
  ['bootstrap', '3.0.0', '3.4.1', 'CVE-2019-8331', 6.1, 'medium', 'tooltip/popoverのdata-templateによるXSS（スクリプトの混入）'],
  ['bootstrap', '4.0.0', '4.3.1', 'CVE-2019-8331', 6.1, 'medium', 'tooltip/popoverのdata-templateによるXSS（スクリプトの混入）'],
  ['lodash', null, '4.17.12', 'CVE-2019-10744', 9.1, 'critical', 'defaultsDeepで未信頼入力からプロトタイプ汚染'],
  ['lodash', '4.17.12', '4.17.19', 'CVE-2020-8203', 7.4, 'high', '深いプロパティ操作を未信頼入力が制御する場合のプロトタイプ汚染', true],
  ['moment', '2.18.0', '2.29.4', 'CVE-2022-31129', 7.5, 'high', '長い未信頼文字列のRFC2822解析による処理時間の増大']
];
const PACKAGES = { jquery: 'jquery', 'jquery-ui': 'jquery-ui', 'jquery-ui-dist': 'jquery-ui', bootstrap: 'bootstrap', lodash: 'lodash', moment: 'moment', angular: 'angular', vue: 'vue' };
const BASE = { local: 'https://local.invalid/' };

function identify(src, selfHost) {
  let url;
  try { url = new URL(src, BASE.local); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const path = url.pathname;
  let match, pkg, version;
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'unpkg.com') {
    match = /^\/(?:npm\/)?(jquery|jquery-ui|jquery-ui-dist|bootstrap|lodash|moment|angular|vue)@(\d+\.\d+\.\d+)(?:\/[^?#]*)?$/.exec(path);
    if (url.hostname === 'cdn.jsdelivr.net' && !path.startsWith('/npm/')) return null;
    if (url.hostname === 'unpkg.com' && path.startsWith('/npm/')) return null;
    if (match) [, pkg, version] = match;
  } else if (url.hostname === 'cdnjs.cloudflare.com') {
    match = /^\/ajax\/libs\/(jquery|jqueryui|jquery-ui|bootstrap|lodash\.js|moment\.js|angular\.js|vue)\/(\d+\.\d+\.\d+)\/(.+\.js)$/.exec(path);
    if (match) {
      pkg = ({ jqueryui: 'jquery-ui', 'lodash.js': 'lodash', 'moment.js': 'moment', 'angular.js': 'angular' })[match[1]] ?? match[1];
      version = match[2];
      const file = match[3].split('/').at(-1);
      const expected = pkg === 'angular' ? 'angular' : pkg;
      if (!new RegExp(`^${expected}(?:\\.bundle|\\.slim|\\.runtime|\\.common)?(?:\\.min)?\\.js$`).test(file)) return null;
    }
  } else if (url.hostname === 'ajax.googleapis.com') {
    match = /^\/ajax\/libs\/(jquery|jqueryui|angularjs)\/(\d+\.\d+\.\d+)\/(jquery|jquery-ui|angular)(?:\.min)?\.js$/.exec(path);
    if (match) {
      pkg = ({ jqueryui: 'jquery-ui', angularjs: 'angular' })[match[1]] ?? match[1];
      if (pkg !== match[3]) return null;
      version = match[2];
    }
  } else if (url.hostname === 'code.jquery.com') {
    match = /^\/jquery-(\d+\.\d+\.\d+)(?:\.slim)?(?:\.min)?\.js$/.exec(path);
    if (match) { pkg = 'jquery'; version = match[1]; }
    match = /^\/ui\/(\d+\.\d+\.\d+)\/jquery-ui(?:\.min)?\.js$/.exec(path);
    if (match) { pkg = 'jquery-ui'; version = match[1]; }
  } else if ((!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) || url.hostname === selfHost) {
    // ローカルの明示的なファイル名のみ。CDNに似せたホストのパスは採用しない。
    match = /(?:^|\/)(jquery-ui|jquery|bootstrap|lodash|moment|angular|vue)-(\d+\.\d+\.\d+)(?:\.slim)?(?:\.min)?\.js$/.exec(path);
    if (match) [, pkg, version] = match;
  }
  return pkg && version ? { lib: PACKAGES[pkg], version, host: url.hostname === 'local.invalid' ? null : url.hostname } : null;
}

export function detectLibs(scriptRefs = [], { selfHost = null } = {}) {
  const result = [];
  for (const ref of scriptRefs) {
    const item = identify(typeof ref === 'string' ? ref : ref.src, selfHost);
    if (!item) continue;
    const previous = result.find(r => r.lib === item.lib && r.version === item.version);
    if (previous) {
      if (!previous.hosts.includes(item.host)) previous.hosts.push(item.host);
      continue;
    }
    item.hosts = [item.host];
    item.advisories = ADVISORIES.filter(([lib, min, max]) => lib === item.lib && (!min || compareVersions(item.version, min) >= 0) && compareVersions(item.version, max) < 0)
      .map(([, min, max, id, cvss, severity, summary, candidate]) => ({ id, cvss, severity, summary, range: `${min ? `>=${min} ` : ''}<${max}`, kind: 'vuln', ...(candidate ? { candidate: true } : {}) }));
    if ((item.lib === 'angular' && item.version.startsWith('1.')) || (item.lib === 'vue' && item.version.startsWith('2.'))) {
      item.advisories.push({ id: item.lib === 'angular' ? 'AngularJS-EOL' : 'Vue2-EOL', cvss: 0, severity: 'medium', summary: item.lib === 'angular' ? 'AngularJS 1.xの上流保守は2022年1月から終了' : 'Vue 2の上流保守は2023-12-31で終了', range: item.lib === 'angular' ? '1.x' : '2.x', kind: 'eol' });
    }
    result.push(item);
  }
  return result;
}
