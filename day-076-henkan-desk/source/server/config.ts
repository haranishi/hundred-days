import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
export interface ServerConfig { port: number; host: string; publicOrigin: string; engineUrl: string; staticRoot: string; workRoot: string; }
export function readConfig(): ServerConfig {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const origin = new URL(process.env.PUBLIC_ORIGIN || `http://localhost:${port}`);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') throw new Error('Invalid PUBLIC_ORIGIN');
  const engine = new URL(process.env.ENGINE_URL || 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(engine.protocol) || engine.username || engine.password || engine.pathname !== '/') throw new Error('Invalid ENGINE_URL');
  return { port, host: process.env.HOST || '127.0.0.1', publicOrigin: origin.origin, engineUrl: engine.origin, staticRoot: resolve(process.env.STATIC_ROOT || 'dist'), workRoot: resolve(process.env.WORK_ROOT || `${tmpdir()}/henkan-gateway`) };
}
