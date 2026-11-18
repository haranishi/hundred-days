import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const groups = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const ordered = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
export function discoverProjects(root, files) {
  const paths = [...new Set(files)].filter(file => /(^|\/)package(?:-lock)?\.json$/.test(file)
    && !/(^|\/)(node_modules|\.git)\//.test(file) && existsSync(join(root, file)));
  const projects = new Set(paths.filter(p => p.endsWith('package-lock.json')).map(dirname));
  for (const file of paths.filter(p => p.endsWith('package.json'))) {
    const manifest = JSON.parse(readFileSync(join(root, file), 'utf8'));
    if (groups.some(key => Object.keys(manifest[key] ?? {}).length)) projects.add(dirname(file));
  }
  return [...projects].sort().map(directory => {
    const read = file => {
      const path = join(root, directory, file);
      if (!existsSync(path)) throw Error(`${directory}: ${file} がない`);
      return JSON.parse(readFileSync(path, 'utf8'));
    };
    const manifest = read('package.json'), lock = read('package-lock.json');
    if (![2, 3].includes(lock.lockfileVersion) || !lock.packages?.['']) throw Error(`${directory}: lock形式が不正`);
    for (const key of groups) if (ordered(manifest[key]) !== ordered(lock.packages[''][key])) throw Error(`${directory}: ${key} とlockが不一致`);
    return directory;
  });
}

// 修正版がまだ公開されていない勧告を、期限つきで合格にする例外の一覧。
// - 対象は high だけ。critical は除けない。勧告は、npm audit の url が https://github.com/advisories/<ID> と完全一致するものだけ。
//   期限（UTC）を過ぎると無効になり、監査は失敗に戻る。
// - 部品が合格になるのは、high/critical の原因がすべて「有効な例外の勧告」か「合格になった別の部品」で、例外の勧告までたどり着けるときだけ。
//   別の勧告が1つでも混ざれば失敗のまま。
// - 修正版が出たら overrides などで直し、ここから消す。背景と手順は .kiro/specs/dependency-audit-ci/followup-2026-11-18.md。
export const AUDIT_EXCEPTIONS = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    expires: '2026-12-18',
    reason: 'picomatch の ReDoS（4.0.7 以下の全版・修正版なし）。vite・vitest など開発用の道具が経由し、全ロックで dev のみ。配信物に入らない',
  },
];

const minor = ['info', 'low', 'moderate'];
const utcToday = () => new Date().toISOString().slice(0, 10);

// 例外で合格にできる high の部品名を返す。落とす条件は2つを、変化がなくなるまで繰り返す。
// ①悪い原因（例外でない勧告・合格にならない部品・不正な形）が1つでも混ざる部品。循環の中でも同じ。
// ②有効な例外の勧告にたどり着かない部品。互いだけを参照する根拠のない循環を通さないため。
export function excusedPackages(vulnerabilities, { exceptions = AUDIT_EXCEPTIONS, today = utcToday() } = {}) {
  const urls = new Set(exceptions.filter(item => item.expires >= today).map(item => `https://github.com/advisories/${item.id}`));
  const isException = item => item?.severity === 'high' && urls.has(item.url);
  const causesOf = name => (Array.isArray(vulnerabilities[name].via) ? vulnerabilities[name].via : [null]).filter(item =>
    typeof item === 'string' ? !minor.includes(vulnerabilities[item]?.severity) : !minor.includes(item?.severity));
  const excused = new Set(Object.keys(vulnerabilities).filter(name => vulnerabilities[name].severity === 'high'));
  for (let changed = true; changed;) {
    changed = false;
    for (const name of excused) {
      if (!causesOf(name).every(item => typeof item === 'string' ? excused.has(item) : isException(item))) {
        excused.delete(name); changed = true;
      }
    }
    const grounded = new Set();
    for (let more = true; more;) {
      more = false;
      for (const name of excused) {
        if (!grounded.has(name) && causesOf(name).some(item => typeof item === 'string' ? grounded.has(item) : isException(item))) {
          grounded.add(name); more = true;
        }
      }
    }
    for (const name of excused) if (!grounded.has(name)) { excused.delete(name); changed = true; }
  }
  return excused;
}

// 例外の状態を、CIのログに出す1行ずつの文にする（期限が近い・切れたことに気づくため）。
export function exceptionNotes(exceptions = AUDIT_EXCEPTIONS, today = utcToday()) {
  return exceptions.map(item => {
    const left = Math.round((Date.parse(item.expires) - Date.parse(today)) / 86400000);
    return item.expires >= today
      ? `例外 ${item.id}: ${item.expires}（UTC）まで有効・残り${left}日。${item.reason}`
      : `期限切れの例外 ${item.id}（${item.expires}）: 無効。修正版を取り込むか、期限と理由を見直す`;
  });
}

export function auditResult(result, options) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) throw Error('npm auditを実行できない（通信・プロセス・時間制限を確認）');
  let data;
  try { data = JSON.parse(result.stdout); } catch { throw Error('npm auditのJSON応答が不正'); }
  const counts = data?.metadata?.vulnerabilities;
  const levels = ['info', 'low', 'moderate', 'high', 'critical'];
  if (data?.error || data?.auditReportVersion !== 2 || !counts || !data.vulnerabilities || typeof data.vulnerabilities !== 'object' || Array.isArray(data.vulnerabilities)
    || ![...levels, 'total'].every(k => Number.isSafeInteger(counts[k]) && counts[k] >= 0)
    || levels.reduce((n, k) => n + counts[k], 0) !== counts.total) throw Error('npm auditの報告形式または件数が不正');
  const actual = Object.fromEntries(levels.map(k => [k, 0]));
  for (const value of Object.values(data.vulnerabilities)) {
    if (!value || !levels.includes(value.severity)) throw Error('脆弱性の重要度が不正');
    actual[value.severity]++;
  }
  if (levels.some(k => actual[k] !== counts[k]) || result.status === 1 && counts.total === 0) throw Error('npm auditの終了結果と報告が不一致');
  const excepted = excusedPackages(data.vulnerabilities, options).size;
  return { ...counts, excepted, passed: counts.high === excepted && counts.critical === 0 };
}
