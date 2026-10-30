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

export function auditResult(result) {
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
  return { ...counts, passed: counts.high === 0 && counts.critical === 0 };
}
