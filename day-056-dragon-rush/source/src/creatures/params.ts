// OWNER: creatures
// どの怪獣で始めるか（three を使わない純粋な関数）。?creature=kurenai|raiyoku|homuratsuno があればそれ、無ければ
// 人が遊ぶときだけ最後に選んだ怪獣（prefs）、それも無ければ紅竜。撮影・計測・自動プレイは保存に左右されない（決定的にするため）。
import { DEFAULT_CREATURE, isCreatureId, type CreatureId } from '../config/creatures';

/** URL の検索文字列から ?creature= を読む。無ければ null、知らない名前は例外（起動エラーとして報告される）。 */
export function parseCreatureParam(search: string): CreatureId | null {
  const raw = new URLSearchParams(search).get('creature');
  if (raw === null) return null;
  if (!isCreatureId(raw)) throw new Error(`未知の怪獣: ${raw}（kurenai・raiyoku・homuratsuno）`);
  return raw;
}

/** 始める怪獣。human は人が遊ぶ（撮影・計測・自動プレイでない）か、saved は保存された怪獣の名前。 */
export function initialCreature(search: string, human: boolean, saved: string | null): CreatureId {
  const fromUrl = parseCreatureParam(search);
  if (fromUrl) return fromUrl;
  if (human && isCreatureId(saved)) return saved;
  return DEFAULT_CREATURE;
}
