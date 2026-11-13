import { getItem } from '../content';
import { fingerspellTokens, tokenSpec } from '../content/spell';
import type { SpellToken } from '../content/spell';
import type { SignSpec } from '../hand';

export interface PlaybackToken { token: SpellToken; spec?: SignSpec }
export function playbackTokens(text: string): PlaybackToken[] {
  return fingerspellTokens(Array.from(text.normalize('NFC')).slice(0, 20).join('')).map(token => {
    const available = !token.missing && (!token.base || !!getItem(token.base)) && (!token.modifier || !!getItem(token.modifier));
    return { token, spec: available ? tokenSpec(token) : undefined };
  });
}
export function playbackDelay(spec: SignSpec, slow: boolean): number {
  const seconds = Math.max(spec.duration ?? 0, spec.trace?.tEnd ?? 0,
    ...spec.hands.dominant.keyframes.map(frame => frame.t),
    ...(spec.hands.nonDominant?.keyframes.map(frame => frame.t) ?? []));
  return Math.max(1300, seconds * 1000 + 500) * (slow ? 2 : 1);
}
