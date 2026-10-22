// 公開サフィックスリスト(PSL)の本物から lib/psl-data.js を作る。リポジトリにはこの出力だけを置く。
//   node day-074-link-dokumi/tools/gen-psl.mjs <public_suffix_list.dat> [出力先]
// 出典：取得元は PSL の公式配布ファイルだけ（公式の注意書きどおり、他のVCSから取らない）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { domainToASCII } from 'node:url';
import { fileURLToPath } from 'node:url';

const [, , input, output = fileURLToPath(new URL('../lib/psl-data.js', import.meta.url))] = process.argv;
if (!input) {
  console.error('使い方: node gen-psl.mjs <public_suffix_list.dat> [出力先]');
  process.exit(2);
}

// 公開前チェック(npm run precheck)の個人NGワードに当たる規則は、出力から除く。
// PSLには自治体名がそのまま並ぶので、人名と偶然に一致することがある。NGワードは非公開なので、
// このファイルには書かず、gitignore済みの .precheck-ng.txt をその場で読む（無ければ何も除かない）。
// 除いた規則の数だけ記録する。影響は、該当する自治体のサブドメインで、登録ドメインの境界が1ラベル手前になることだけ。
const ngFile = fileURLToPath(new URL('../../.precheck-ng.txt', import.meta.url));
const ngPatterns = existsSync(ngFile)
  ? readFileSync(ngFile, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((pattern) => new RegExp(pattern, 'i'))
  : [];
let omitted = 0;
let maxLabels = 1;

const lines = readFileSync(input, 'utf8').split(/\r?\n/);
const version = lines.find(line => line.startsWith('// VERSION:'))?.slice('// VERSION:'.length).trim();
const commit = lines.find(line => line.startsWith('// COMMIT:'))?.slice('// COMMIT:'.length).trim();
if (!version || !commit) throw new Error('VERSION / COMMIT の行が見つからない');

// TLD(punycode) → [ICANNの規則, PRIVATEの規則]。規則はTLDより左の部分を空白区切りで持つ。
// 単独のTLD規則は「規則なしのTLD」と同じ扱い(既定の`*`)なので持たない。
const byTld = new Map();
let section = null;
let count = 0;
for (const line of lines) {
  if (line.startsWith('// ===BEGIN ICANN DOMAINS===')) { section = 0; continue; }
  if (line.startsWith('// ===BEGIN PRIVATE DOMAINS===')) { section = 1; continue; }
  if (line.startsWith('// ===END ')) { section = null; continue; }
  const rule = line.split(/\s/, 1)[0];
  if (!rule || rule.startsWith('//')) continue;
  if (section === null) throw new Error(`区画の外に規則がある: ${rule}`);
  const exception = rule.startsWith('!');
  const wildcard = rule.startsWith('*.');
  const body = rule.slice(exception ? 1 : wildcard ? 2 : 0);
  const ascii = domainToASCII(body);
  if (!ascii) throw new Error(`punycodeにできない規則: ${rule}`);
  if (ngPatterns.some((pattern) => pattern.test(rule) || pattern.test(ascii))) { omitted++; continue; }
  const labels = ascii.split('.');
  const tld = labels.at(-1);
  const left = labels.slice(0, -1).join('.');
  const encoded = exception ? `!${left}` : wildcard ? (left ? `*.${left}` : '*') : left;
  maxLabels = Math.max(maxLabels, labels.length + (wildcard ? 1 : 0));
  if (!encoded) continue; // 単独のTLD規則
  if (!byTld.has(tld)) byTld.set(tld, [[], []]);
  byTld.get(tld)[section].push(encoded);
  count++;
}

const entries = [...byTld.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const body = entries.map(([tld, [icann, priv]]) => {
  const value = priv.length ? `[${JSON.stringify(icann.join(' '))},${JSON.stringify(priv.join(' '))}]` : `[${JSON.stringify(icann.join(' '))}]`;
  return `${JSON.stringify(tld)}:${value}`;
}).join(',\n');

const header = `// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Public Suffix List (公開サフィックスリスト) から機械的に作ったデータ。手で編集しない。
// 原本: Public Suffix List (MPL-2.0)。配布元は publicsuffix.org、作ったのは Public Suffix List の貢献者。
// このファイルは原本の規則をTLDごとに整理し直した派生物（日本語の規則はpunycode化）なので、MPL-2.0 のまま配布する。
// 作り方: node day-074-link-dokumi/tools/gen-psl.mjs <public_suffix_list.dat>
// 公開前チェック（リポジトリの検査）に当たった自治体名の規則は除いてある（PSL_OMITTED_RULES 件。該当する自治体のサブドメインだけ、境界が1ラベル手前になる）。
// 形: TLD(punycode) → [ICANN区画の規則, PRIVATE区画の規則]。規則はTLDより左の部分を空白区切り。
//     \`*.x\` はワイルドカード、\`!x\` は例外。単独のTLDの規則は既定の\`*\`と同じなので持たない。
`;
const out = `${header}export const PSL_VERSION = ${JSON.stringify(version)};
export const PSL_COMMIT = ${JSON.stringify(commit)};
export const PSL_RULE_COUNT = ${count};
export const PSL_OMITTED_RULES = ${omitted};
// 規則の最大ラベル数。長大なホスト名を引いても、見るのは末尾のこの数のラベルだけ（計算量を抑える）。
export const PSL_MAX_RULE_LABELS = ${maxLabels};
export const PSL_RULES = {
${body}
};
`;
writeFileSync(output, out);
console.log(`${entries.length} TLD / ${count} 規則 / ${omitted} 件を除外 / ${out.length} バイト → ${output}`);
