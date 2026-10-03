// 配布する実パッケージの許諾全文をコピーする。上流声明は取得済みの原典を使う。
import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'public/licenses');
await mkdir(out, { recursive: true });
for (const [name, version, file] of [
  ['three', '0.186.1', 'LICENSE'],
  ['postprocessing', '6.39.5', 'LICENSE.md'],
  ['n8ao', '2.0.1', 'LICENSE'],
]) {
  const dir = resolve(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error(`${name}の版が確認済みの${version}と違います`);
  await cp(resolve(dir, file), resolve(out, `${name}.txt`));
}
for (const name of ['SMAA', 'BlueNoise', 'BakingLab']) {
  await cp(resolve(root, `LICENSES/upstream/${name}.txt`), resolve(out, `${name}.txt`));
}
console.log('配布パッケージ3件・上流声明3件の許諾全文を準備しました');
