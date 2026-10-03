// OWNER: core
// 起動引数（URL のクエリ）を型付きの設定にする。値の既定は src/config に置く。
import { DEFAULT_QUALITY, isQualityName, type QualityName } from '../config/quality';

export type RunMode = 'play' | 'shot' | 'film' | 'perf';

export interface Settings {
  mode: RunMode;
  quality: QualityName;
  /** ?shot= / ?film= の名前 */
  shotName: string | null;
  /** ?film= のコマ数 */
  filmFrames: number;
  /** ?drive=ext のとき、コマ送りを外部（撮影ツール）に任せる */
  externalDrive: boolean;
  /** ?perf= の計測秒数 */
  perfSeconds: number;
  /** ?seed= で街の種を上書きする（既定は config/city） */
  seedOverride: number | null;
  /** ?hud=0 で HUD を消す */
  hud: boolean;
  /** ?playtest=basic|script：自動プレイ（script は window.__playtestScript の台本を流す） */
  playtest: 'basic' | 'script' | null;
  /** ?speed=N：シミュレーションを N 倍で回す（自動プレイの早回し、1〜16） */
  speed: number;
}

function intParam(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function parseSettings(search: string): Settings {
  const params = new URLSearchParams(search);
  const q = params.get('q');
  const quality: QualityName = q !== null && isQualityName(q) ? q : DEFAULT_QUALITY;
  const shot = params.get('shot');
  const film = params.get('film');
  const perf = params.get('perf');
  const seedRaw = params.get('seed');
  const seed = seedRaw === null ? null : Number.parseInt(seedRaw, 10);

  let mode: RunMode = 'play';
  if (film !== null) mode = 'film';
  else if (shot !== null) mode = 'shot';
  else if (perf !== null) mode = 'perf';

  return {
    mode,
    quality,
    shotName: film ?? shot,
    filmFrames: intParam(params, 'frames', 120, 1, 10000),
    externalDrive: params.get('drive') === 'ext',
    perfSeconds: intParam(params, 'secs', 20, 1, 600),
    seedOverride: seed !== null && Number.isFinite(seed) ? seed : null,
    hud: mode === 'play' && params.get('hud') !== '0',
    playtest: mode === 'play' && (params.get('playtest') === 'basic' || params.get('playtest') === 'script') ? (params.get('playtest') as 'basic' | 'script') : null,
    speed: intParam(params, 'speed', 1, 1, 16),
  };
}
