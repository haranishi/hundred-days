import { mkdir, mkdtemp, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
export async function initializeTemp(root: string): Promise<void> { await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true, mode: 0o700 }); await chmod(root, 0o700); }
export async function createTemp(root: string): Promise<string> { const path = await mkdtemp(join(root, 'job-')); await chmod(path, 0o700); return path; }
export async function removeTemp(path: string): Promise<void> { await rm(path, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); }
