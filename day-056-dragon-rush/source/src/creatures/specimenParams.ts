// OWNER: creatures
// ?specimen= の引数：標本（怪獣1体、または3体を並べた lineup）・クリップ・時刻・コマ撮りの刻み。three を使わない純粋な関数。
//   ?specimen=raiyoku&clip=walk&shot=street        雷翼の歩きを大通りで撮る（時刻を省くと roster.ts の見せる時刻）
//   ?specimen=homuratsuno&clip=stomp&t=0.62&shot=closeup
//   ?specimen=lineup&shot=profile                 3体を遊歩道に並べて、大きさを比べる1枚（lineup はどの構図の名前でも profile になる）
//   ?specimen=raiyoku&clip=fly&film=overview&frames=30&step=0.0333&drive=ext   コマ撮り（1コマ step 秒）
//   ?specimen=kurenai&clip=idle&shot=profile&matte=1   影絵（r03-roster：街・空・水を消し、怪獣だけを白く塗って黒の上に描く。札の影絵の元）
import { CREATURES, isCreatureId, type CreatureId } from './roster';

// street・closeup・overview は既存の撮影と同じ目印の構図。profile は遊歩道で横顔（動きの連番と、3体を並べる lineup）
export const SPECIMEN_SHOTS = ['street', 'closeup', 'overview', 'profile'] as const;
export type SpecimenShot = (typeof SPECIMEN_SHOTS)[number];

export interface SpecimenParams {
  target: CreatureId | 'lineup';
  clip: string;
  /** クリップの時刻（秒）。null なら見せる時刻 */
  time: number | null;
  /** コマ撮りの1コマの秒 */
  step: number;
  /** 影絵（怪獣だけを白く、ほかは黒） */
  matte: boolean;
}

export function isSpecimenShot(value: string): value is SpecimenShot {
  return (SPECIMEN_SHOTS as readonly string[]).includes(value);
}

/** URL の検索文字列から標本の引数を読む。?specimen が無ければ null。知らない名前は例外（起動エラーとして報告される）。 */
export function parseSpecimenParams(search: string): SpecimenParams | null {
  const p = new URLSearchParams(search);
  const target = p.get('specimen');
  if (target === null) return null;
  if (target !== 'lineup' && !isCreatureId(target)) throw new Error(`未知の標本: ${target}（kurenai・raiyoku・homuratsuno・lineup）`);
  const clip = p.get('clip') ?? 'idle';
  const tRaw = p.get('t');
  const time = tRaw === null ? null : Number(tRaw);
  if (time !== null && !Number.isFinite(time)) throw new Error(`標本の時刻が数ではない: ${tRaw}`);
  const stepRaw = Number(p.get('step') ?? 1 / 60);
  const step = Number.isFinite(stepRaw) ? Math.min(0.5, Math.max(1 / 240, stepRaw)) : 1 / 60;
  return { target, clip, time, step, matte: p.get('matte') === '1' };
}

/** クリップの見せる時刻（roster.ts）。表に無いクリップは 0 秒。 */
export function showcaseTime(id: CreatureId, clip: string): number {
  return CREATURES[id].showcase[clip] ?? 0;
}
