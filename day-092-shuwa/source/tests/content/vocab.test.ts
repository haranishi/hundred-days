import { describe, expect, it } from 'vitest';
import { VOCAB } from '../../src/content/vocab';
import { VOCAB as publicVocab } from '../../src/content';

// 完全一致で照合する例示表。除外基準の全体は、追加時の目視確認も必要。
const forbiddenWords = [
  { category: '侮辱・差別', words: ['ばか', 'あほ', 'まぬけ'] },
  { category: '性的な語', words: ['せっくす', 'ぽるの'] },
  { category: '体・病気・障害をからかう語', words: ['でぶ', 'のろま'] },
  { category: '暴力・死', words: ['ころす', 'しぬ', 'なぐる', 'せんそう'] },
  { category: '固有名詞', words: ['とうきょう', 'おおさか', 'ぐーぐる'] },
  { category: '政治・宗教', words: ['せいとう', 'せんきょ', 'しゅうきょう'] },
];

const earlyKana = /^[あいうえおかきくけこ]+$/u;
const throughTaKana = /^[あいうえおかきくけこさしすせそたちつてと]+$/u;
const modifiers = /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔぁぃぅぇぉっゃゅょゎゕゖー]/u;

// Requirement 5 と、今回指定された語数・段階別の最低数を検査する。
describe('指文字で読む練習の単語', () => {
  it('公開窓口から同じリストを取得できる', () => {
    expect(publicVocab).toBe(VOCAB);
  });

  it('220語以上ある', () => {
    expect(VOCAB.length).toBeGreaterThanOrEqual(220);
  });

  it('読みが重複しない', () => {
    const seen = new Set<string>();
    for (const { kana } of VOCAB) {
      expect(seen.has(kana), `重複: ${kana}`).toBe(false);
      seen.add(kana);
    }
  });

  it('読みはひらがなと長音だけで構成される', () => {
    for (const { kana } of VOCAB) {
      expect(kana, `文字種: ${kana}`).toMatch(/^[ぁ-ゖー]+$/u);
    }
  });

  it('全語に空白だけでない短い意味がある', () => {
    for (const { kana, meaning } of VOCAB) {
      expect(meaning.trim().length, `意味: ${kana}`).toBeGreaterThan(0);
    }
  });

  it('禁止語の表に一致しない', () => {
    const readings = new Set(VOCAB.map(({ kana }) => kana));
    for (const { category, words } of forbiddenWords) {
      for (const word of words) {
        expect(readings.has(word), `${category}: ${word}`).toBe(false);
      }
    }
  });

  it('あ行・か行だけで読める語が15語以上ある', () => {
    expect(VOCAB.filter(({ kana }) => earlyKana.test(kana)).length).toBeGreaterThanOrEqual(15);
  });

  it('あ行からた行までで読める語が30語以上ある', () => {
    expect(VOCAB.filter(({ kana }) => throughTaKana.test(kana)).length).toBeGreaterThanOrEqual(30);
  });

  it('濁音・半濁音・小さい字・長音を含む語が合計40語以上ある', () => {
    expect(VOCAB.filter(({ kana }) => modifiers.test(kana)).length).toBeGreaterThanOrEqual(40);
  });
});
