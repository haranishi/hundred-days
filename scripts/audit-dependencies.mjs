// 管理対象の全npmプロジェクトを、install scriptを実行せずlockだけで監査する。
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { auditResult, discoverProjects } from './lib/dependency-audit.mjs';

let failures = 0;
try {
  const root = process.cwd();
  const files = execFileSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const projects = discoverProjects(root, files);
  if (!projects.length) throw Error('監査対象のlockが見つからない');
  for (const directory of projects) {
    try {
      const validation = spawnSync('npm', ['ci', '--dry-run', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--include=dev', '--include=optional', '--include=peer'], {
        cwd: join(root, directory), encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
      });
      if (validation.error || validation.signal || validation.status !== 0) throw Error('lockの依存グラフを検証できない（npm ciのdry-runが失敗）');
      const result = spawnSync('npm', ['audit', '--package-lock-only', '--ignore-scripts', '--include=dev', '--include=optional', '--include=peer', '--json', '--fetch-retries=0', '--fetch-timeout=45000'], {
        cwd: join(root, directory), encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
      });
      const counts = auditResult(result);
      console.log(`${counts.passed ? 'OK' : 'FAIL'} ${JSON.stringify(directory)}: high=${counts.high} critical=${counts.critical} moderate=${counts.moderate} low=${counts.low}`);
      if (!counts.passed) failures++;
    } catch (error) {
      console.error(`FAIL ${JSON.stringify(directory)}: ${error.message}`);
      failures++;
    }
  }
  console.log(`依存監査: ${projects.length}プロジェクト、失敗${failures}件`);
} catch (error) {
  console.error(`依存監査を完了できない: ${error.message}`);
  failures++;
}
process.exitCode = failures ? 1 : 0;
