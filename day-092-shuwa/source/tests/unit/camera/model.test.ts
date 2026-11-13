import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'tekotoba-model-'));
  mkdirSync(join(directory, 'scripts'));
  copyFileSync(new URL('../../../scripts/fetch-model.mjs', import.meta.url), join(directory, 'scripts/fetch-model.mjs'));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function run(value: string, httpStatus = 200) {
  // 子プロセスのfetchだけを差し替え、実際のスクリプトの記録/照合/上書き動作を検査する。
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = async () => ({ ok: ${httpStatus === 200}, status: ${httpStatus}, arrayBuffer: async () => Buffer.from(${JSON.stringify(value)}) });
    await import(${JSON.stringify(pathToFileURL(join(directory, 'scripts/fetch-model.mjs')).href)});
  `], { encoding: 'utf8' });
}
describe('モデル取得スクリプトのSHA-256', () => {
  it('初回は記録し、次から照合する', () => {
    expect(run('model-1').status).toBe(0);
    expect(readFileSync(join(directory, 'scripts/model.sha256'), 'utf8')).toBe(`${digest('model-1')}  hand_landmarker.task\n`);
    expect(readFileSync(join(directory, 'public/mediapipe/hand_landmarker.task'), 'utf8')).toBe('model-1');
    const repeated = run('model-1');
    expect(repeated.status).toBe(0); expect(repeated.stdout).toContain(digest('model-1'));
  });
  it('SHA-256が違う場合は失敗し、既存のモデルと記録を保持する', () => {
    expect(run('model-1').status).toBe(0);
    const failed = run('model-2'); expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('一致しません');
    expect(readFileSync(join(directory, 'public/mediapipe/hand_landmarker.task'), 'utf8')).toBe('model-1');
    expect(readFileSync(join(directory, 'scripts/model.sha256'), 'utf8')).toContain(digest('model-1'));
    expect(existsSync(join(directory, 'public/mediapipe/hand_landmarker.task.tmp'))).toBe(false);
  });
  it('壊れた記録・HTTPエラー・空のモデルでは記録しない', () => {
    writeFileSync(join(directory, 'scripts/model.sha256'), 'invalid');
    expect(run('model').status).toBe(1);
    rmSync(join(directory, 'scripts/model.sha256'));
    expect(run('model', 404).status).toBe(1);
    expect(run('').status).toBe(1);
    expect(existsSync(join(directory, 'scripts/model.sha256'))).toBe(false);
    expect(existsSync(join(directory, 'public/mediapipe/hand_landmarker.task'))).toBe(false);
  });
});
