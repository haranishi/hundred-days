import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** build.mjs が読む自前のファイル。見本サイトへ写すので、ビルドが新しい部品を読むようになったら、ここへ足す */
export const BUILD_SOURCES = [
  'build.mjs',
  'check-mount-safe.mjs',
  'lib/day-status.mjs',
  'lib/dist-files.mjs',
  'lib/home-model.mjs',
  'lib/not-found.mjs',
  'site/home.css',
  'site/home.js',
  'lib/external-intro.mjs',
  'site/intro.css',
  'site/intro.js',
];

/** build.mjs を小さな作業場へ写して流す。リポジトリの dist/ には触れない */
export function miniSite(t) {
  const site = mkdtempSync(join(tmpdir(), 'hundred-days-status-'));
  t.after(() => rmSync(site, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(dirname(join(site, file)), { recursive: true });
    writeFileSync(join(site, file), content);
  };
  for (const file of BUILD_SOURCES) {
    mkdirSync(dirname(join(site, 'scripts', file)), { recursive: true });
    copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(site, 'scripts', file));
  }
  const page = (title) => `<!doctype html><html><head><title>${title}</title></head><body></body></html>`;
  write('day-001-alpha/index.html', page('アルファ'));
  write('day-001-alpha/meta.json', JSON.stringify({ day: 1, title: 'アルファ', status: 'published' }));
  write('day-002-beta/index.html', page('ベータ'));
  write('day-002-beta/meta.json', JSON.stringify({ day: 2, title: 'ベータ', status: 'draft' }));
  const env = { ...process.env };
  for (const name of ['PUBLISH_CHECK_DAY', 'HUNDRED_DAYS_BUILD_DIR', 'GITHUB_ACTIONS', 'HD_CANONICAL_BASE']) delete env[name];
  const build = (extra = {}) => {
    // 固まっても CI を止めないよう上限を付ける（小さな作業場のビルドは1秒もかからない）
    const run = spawnSync(process.execPath, [join(site, 'scripts', 'build.mjs')], { cwd: site, env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
    return { status: run.status, output: run.stdout + run.stderr };
  };
  const read = (file) => readFileSync(join(site, 'dist', file), 'utf8');
  return { site, write, build, read };
}
