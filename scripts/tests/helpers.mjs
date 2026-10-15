import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'hundred-days-check-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.email', 'fixture@users.noreply.github.com');
  const write = (file, content) => {
    const path = join(cwd, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  write('.gitignore', '.precheck-ng.txt\nignored/\n');
  const run = (script, ...args) => {
    const path = fileURLToPath(new URL(`../${script}`, import.meta.url));
    const result = spawnSync(process.execPath, [path, ...args], { cwd, encoding: 'utf8' });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  };
  return { cwd, git, write, run };
}
