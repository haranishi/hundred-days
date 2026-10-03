// OWNER: config
// 操作できる怪獣3体の表（r03-roster）。並びは札の順と数字キー（1 紅竜・2 雷翼・3 焔角）。
// 遊びの側（gameplay）は motion・moves・body を、見た目（dragon・creatures）は view を、画面（ui）は card を読む。
import { HOMURATSUNO } from './homuratsuno';
import { KURENAI } from './kurenai';
import { RAIYOKU } from './raiyoku';
import { CREATURE_IDS, type CreatureConfig, type CreatureId } from './types';

export * from './types';

export const CREATURE_CONFIG: Record<CreatureId, CreatureConfig> = {
  kurenai: KURENAI,
  raiyoku: RAIYOKU,
  homuratsuno: HOMURATSUNO,
};

/** 初回（保存が無いとき）に選ばれている怪獣。CHARACTERS.md の UX5：初回は選ばせない */
export const DEFAULT_CREATURE: CreatureId = 'kurenai';

export function isCreatureId(value: unknown): value is CreatureId {
  return typeof value === 'string' && (CREATURE_IDS as readonly string[]).includes(value);
}

/** 数字キー（1〜3）と札の番号から怪獣。範囲外は null。 */
export function creatureByNumber(n: number): CreatureId | null {
  return CREATURE_IDS[n - 1] ?? null;
}
