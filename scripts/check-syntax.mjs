// 配布済みの生成物・第三者ライブラリを除き、依存を入れずにJSの構文を検査する。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const files = [...new Set(execFileSync('git', [
  'ls-files', '-z', '-c', '-o', '--exclude-standard',
], { encoding: 'utf8' }).split('\0').filter(Boolean))].filter((file) =>
  /\.(?:[cm]?js)$/.test(file)
  && !/(^|\/)(vendor|assets|game|dist|node_modules)\//.test(file)
  && !file.startsWith('.agent-harness/')
  && existsSync(file));

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`構文エラー: ${file}`);
    console.error(result.error?.message || result.stderr);
    failures++;
  }
}
console.log(`JavaScript構文: ${files.length}ファイル、エラー${failures}件`);
process.exitCode = failures ? 1 : 0;
