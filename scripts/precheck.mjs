/* 公開前チェック：git追跡中＋未追跡（gitignore除く）の全テキストファイルを
   シークレット・個人情報パターンでスキャンする。1件でもNGなら exit 1。
   個人固有のNGワードはこのリポジトリに含めず、gitignore済みの
   .precheck-ng.txt（1行1パターン・大文字小文字無視の正規表現・#はコメント）から読む。 */
'use strict';

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const files = run('git', ['ls-files', '-c', '-o', '--exclude-standard'])
  .split('\n')
  .filter(Boolean);

const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|mp4|mov|webm|mp3|wav|zip|gz|woff2?|ttf|otf|pdf)$/i;

const FAIL_PATTERNS = [
  ['秘密鍵', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['APIキー/トークン', /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,})/],
  ['シークレット代入', /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["']/i],
  ['ローカルパス', /\/Users\//]
];
const WARN_PATTERNS = [['メールアドレス', /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i]];

const NG_FILE = '.precheck-ng.txt';
let fails = 0;
let warns = 0;
let ngPatterns = [];
if (existsSync(NG_FILE)) {
  const configuredPatterns = readFileSync(NG_FILE, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));

  for (const pattern of configuredPatterns) {
    try {
      ngPatterns.push(['NGワード', new RegExp(pattern, 'i')]);
    } catch {
      console.log(`✖ ${NG_FILE} に不正な正規表現がある: ${pattern}`);
      fails++;
    }
  }
} else {
  console.log(`✖ ${NG_FILE} が無いため個人NGワード検査を実行できない`);
  console.log(`  初回のみ .precheck-ng.example.txt をコピーし、非公開にしたい語句を設定すること`);
  fails++;
}

for (const file of files) {
  if (file === NG_FILE) continue;
  if (BINARY.test(file)) {
    console.log(`👁 目視確認が必要（画像/動画/バイナリ）: ${file}`);
    warns++;
    continue;
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const [label, re] of [...FAIL_PATTERNS, ...ngPatterns]) {
      if (re.test(line)) {
        console.log(`✖ ${label}: ${file}:${i + 1}`);
        fails++;
      }
    }
    for (const [label, re] of WARN_PATTERNS) {
      if (re.test(line)) {
        console.log(`⚠ ${label}: ${file}:${i + 1}`);
        warns++;
      }
    }
  });
}

// 不変条件：非公開ファイルが追跡されていないこと・コミット著者がnoreplyであること
const tracked = run('git', ['ls-files']).split('\n');
for (const secret of ['CLAUDE.md', NG_FILE]) {
  if (tracked.includes(secret)) {
    console.log(`✖ ${secret} が追跡されている（gitignore漏れ）`);
    fails++;
  }
}
if (tracked.some((f) => f.startsWith('.wrangler/'))) {
  console.log('✖ .wrangler/ が追跡されている（gitignore漏れ）');
  fails++;
}
const email = run('git', ['config', 'user.email']);
if (!email.includes('users.noreply.github.com')) {
  console.log(`✖ コミット著者メールがnoreplyでない: ${email}`);
  fails++;
}

if (fails) {
  console.log(`\nNG ${fails}件 — 解消するまで公開しないこと${warns ? `（ほかに要確認 ${warns}件）` : ''}`);
  process.exit(1);
}
console.log(`\nOK: 漏洩パターン検出なし${warns ? `（要確認の警告 ${warns}件あり）` : ''}`);
