/**
 * ひらがな → 指文字の並び（sign-content が持ち主）。
 * 「どの項目を、どの変化（濁音など）付きで出すか」の対応と、1文字分の形（変化の動きを compose で合成したもの）を返す。
 */
import type { SignSpec } from '../hand/types';
import { composeModifier, isMovingModifier } from './compose';
import { getItem } from './index';

const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'wo', ん: 'n',
};
const DAKUTEN: Record<string, string> = {
  が: 'か', ぎ: 'き', ぐ: 'く', げ: 'け', ご: 'こ', ざ: 'さ', じ: 'し', ず: 'す', ぜ: 'せ', ぞ: 'そ',
  だ: 'た', ぢ: 'ち', づ: 'つ', で: 'て', ど: 'と', ば: 'は', び: 'ひ', ぶ: 'ふ', べ: 'へ', ぼ: 'ほ', ゔ: 'う',
};
const HANDAKUTEN: Record<string, string> = { ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ' };
const SMALL: Record<string, { base: string; mod: string }> = {
  っ: { base: 'つ', mod: 'mod-sokuon' },
  ゃ: { base: 'や', mod: 'mod-youon' }, ゅ: { base: 'ゆ', mod: 'mod-youon' }, ょ: { base: 'よ', mod: 'mod-youon' },
  ぁ: { base: 'あ', mod: 'mod-youon' }, ぃ: { base: 'い', mod: 'mod-youon' }, ぅ: { base: 'う', mod: 'mod-youon' },
  ぇ: { base: 'え', mod: 'mod-youon' }, ぉ: { base: 'お', mod: 'mod-youon' }, ゎ: { base: 'わ', mod: 'mod-youon' },
};

export interface SpellToken {
  /** 入力の1文字 */
  char: string;
  /** 元になる指文字の項目ID（kana-ka など） */
  base?: string;
  /** 変化の項目ID（mod-dakuon など） */
  modifier?: string;
  /** 対応する指文字が無い文字（漢字・記号など） */
  missing?: boolean;
}

/** カタカナをひらがなに直す（入力の受け付けを広げるため） */
export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function fingerspellTokens(text: string): SpellToken[] {
  const tokens: SpellToken[] = [];
  for (const char of Array.from(toHiragana(text.normalize('NFC')))) {
    if (/\s/.test(char)) continue;
    if (char === 'ー') { tokens.push({ char, modifier: 'mod-chouon' }); continue; }
    const plain = BASE[char];
    if (plain) { tokens.push({ char, base: `kana-${plain}` }); continue; }
    const d = DAKUTEN[char];
    if (d) { tokens.push({ char, base: `kana-${BASE[d]}`, modifier: 'mod-dakuon' }); continue; }
    const h = HANDAKUTEN[char];
    if (h) { tokens.push({ char, base: `kana-${BASE[h]}`, modifier: 'mod-handakuon' }); continue; }
    const s = SMALL[char];
    if (s) { tokens.push({ char, base: `kana-${BASE[s.base]}`, modifier: s.mod }); continue; }
    tokens.push({ char, missing: true });
  }
  return tokens;
}

/**
 * 1文字分の形。濁音・半濁音・小さい字は、元の文字の形に変化の動きを合成する（が＝「か」の形のまま横へ）。
 * のばす音（ー）は元の文字を持たない独立した形なので、その項目の形をそのまま返す。
 */
export function tokenSpec(token: SpellToken): SignSpec | undefined {
  if (token.base) {
    const base = getItem(token.base)?.sign;
    if (!base) return undefined;
    if (!token.modifier) return base;
    if (!isMovingModifier(token.modifier) || !getItem(token.modifier)) return undefined;
    return composeModifier(base, token.modifier);
  }
  if (token.modifier) return getItem(token.modifier)?.sign;
  return undefined;
}

/** その文字列を、いま収録している項目だけで綴れるか */
export function canSpell(text: string, known: (id: string) => boolean = (id) => !!getItem(id)): boolean {
  const tokens = fingerspellTokens(text);
  return tokens.length > 0 && tokens.every((t) => !t.missing && (!t.base || known(t.base)) && (!t.modifier || known(t.modifier)));
}
