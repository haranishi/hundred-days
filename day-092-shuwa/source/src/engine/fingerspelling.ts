import { KANA_IDS } from '../course/course';
const chars = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'];
const baseIds = new Map(chars.map((char, i) => [char, KANA_IDS[i]!]));
const smallBases: Record<string, string> = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'っ': 'つ' };

/** 1文字に必要な元の指文字と変化。未対応の文字を黙って飛ばさない。 */
export function characterItems(character: string): string[] | undefined {
  const normalized = character.normalize('NFC');
  if ([...normalized].length !== 1) return undefined;
  if (normalized === 'ー') return ['mod-chouon'];
  const small = smallBases[normalized];
  if (small) return [baseIds.get(small)!, normalized === 'っ' ? 'mod-sokuon' : 'mod-youon'];
  const plain = baseIds.get(normalized);
  if (plain) return [plain];
  const decomposed = [...normalized.normalize('NFD')];
  const base = baseIds.get(decomposed[0]!);
  if (base && decomposed.length === 2 && (decomposed[1] === '\u3099' || decomposed[1] === '\u309a')) {
    return [base, decomposed[1] === '\u3099' ? 'mod-dakuon' : 'mod-handakuon'];
  }
  return undefined;
}
export function spellingItems(kana: string): string[] | undefined {
  const characters = [...kana.normalize('NFC')];
  if (!characters.length) return undefined;
  const result: string[] = [];
  for (const character of characters) {
    const ids = characterItems(character);
    if (!ids) return undefined;
    result.push(...ids);
  }
  return result;
}
export function canReadWord(kana: string, learned: ReadonlySet<string>): boolean {
  const ids = spellingItems(kana);
  return !!ids && ids.every(id => learned.has(id));
}
