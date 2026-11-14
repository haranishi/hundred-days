// 初回の取得元を固定。記録済みのSHA-256と違うモデルで上書きしない。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const destination = new URL('../public/mediapipe/hand_landmarker.task', import.meta.url);
const checksumFile = new URL('./model.sha256', import.meta.url);
const temporary = new URL('../public/mediapipe/hand_landmarker.task.tmp', import.meta.url);

try {
  let recorded;
  try { recorded = (await readFile(checksumFile, 'utf8')).trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (recorded !== undefined && !/^[a-f0-9]{64}(?:\s+\*?hand_landmarker\.task)?$/i.test(recorded)) {
    throw new Error('scripts/model.sha256 の形式が正しくありません。');
  }
  const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`モデルを取得できませんでした（HTTP ${response.status}）。`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0) throw new Error('モデルが空です。');
  const digest = createHash('sha256').update(data).digest('hex');
  console.log(`SHA-256: ${digest}`);
  if (recorded && recorded.slice(0, 64).toLowerCase() !== digest) {
    throw new Error('SHA-256 が scripts/model.sha256 と一致しません。既存モデルを保持しました。');
  }
  await mkdir(new URL('../public/mediapipe/', import.meta.url), { recursive: true });
  await writeFile(temporary, data);
  await rename(temporary, destination);
  if (!recorded) await writeFile(checksumFile, `${digest}  hand_landmarker.task\n`, { flag: 'wx' });
  console.log(`取得しました: ${fileURLToPath(destination)} (${data.length} bytes)`);
} catch (error) {
  await rm(temporary, { force: true }).catch(() => {});
  console.error(error instanceof Error ? error.message : 'モデルの取得に失敗しました。');
  process.exitCode = 1;
}
