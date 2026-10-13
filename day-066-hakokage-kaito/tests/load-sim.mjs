// ルールの読み込み口。環境変数 SIM_PATH があれば、その sim.js（変異を入れた写し）を読む。
// 変異テストは lib/sim.js の写しを1か所だけ壊して SIM_PATH に渡し、単体テストが落ちるかを見る（作業記録の 03_gates.md）。
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const SIM_URL = process.env.SIM_PATH
  ? pathToFileURL(resolve(process.env.SIM_PATH)).href
  : new URL('../lib/sim.js', import.meta.url).href;
export const sim = await import(SIM_URL);
