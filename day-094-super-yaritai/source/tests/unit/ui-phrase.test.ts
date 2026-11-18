// 文節の分け方（src/client/ui/screens/phrase.ts）。round3 の見た目の採点で見つかった折れ方を、二度と出さない。
import { describe, expect, it } from 'vitest';
import { splitPhrases } from '../../src/client/ui/screens/phrase';
import { MISDEEDS, SECRETS } from '../../src/shared/rules/misdeeds';

const cut = (text: string): string => splitPhrases(text).join('｜');

/** 「a」と「b」の間で切れていない（a・b は続けて並ぶ文字） */
function notSplit(text: string, word: string): void {
  const parts = splitPhrases(text);
  expect(parts.some((p) => p.includes(word)), `「${word}」が分かれた：${parts.join('｜')}`).toBe(true);
}

describe('round3 の採点で見つかった折れ方', () => {
  it('ひとりで遊ぶの CPU の説明：語の途中で切らない', () => {
    expect(cut('近くの簡単な悪事だけ。ダッシュしない')).toBe('近くの｜簡単な｜悪事だけ。｜ダッシュしない');
    expect(cut('全部の悪事を回る。追われたらダッシュで逃げる')).toBe('全部の｜悪事を｜回る。｜追われたら｜ダッシュで｜逃げる');
    expect(cut('効率よく回り、バナナの皮で邪魔してくる')).toBe('効率よく｜回り、｜バナナの｜皮で｜邪魔してくる');
  });
  it('あそびかたの本文：「逆をやると」「まとめて落とす」', () => {
    notSplit('書いてあることの逆をやると、荒らし度（点）が入ります。', '逆をやると、');
    notSplit('棚の前でアクション。目の前の商品をまとめて落とす', 'まとめて');
    expect(cut('棚の前でアクション。目の前の商品をまとめて落とす')).toBe('棚の｜前で｜アクション。｜目の｜前の｜商品をまとめて｜落とす');
  });
});

describe('送りがなでつながる語と、ひとまとまりの語', () => {
  it.each([
    ['呼び出しベルを連打する', '呼び出しベルを'],
    ['試食を食べ尽くす', '食べ尽くす'],
    ['体当たり・蹴る・投げる・カートで突っ込む', '突っ込む'],
    ['荒らし度で勝負します。', '荒らし度で'],
    ['残り10秒は、入る点が', '残り10秒は、'],
    ['棚の商品をなぎ払う', 'なぎ払う'],
    ['お菓子売り場で駄々をこねる', 'お菓子売り場で'],
    ['もう一度お試しください', 'もう一度お試しください'],
    ['達成したやっちゃダメが多い人', 'やっちゃダメが'],
    ['荒らし度1,480点', '1,480点'],
    ['2〜4人で遊べます。', '2〜4人で'],
    ['Instagram・YouTubeへは『リンクをコピー』から', '『リンクをコピー』から'],
  ])('%s', (text, word) => notSplit(text, word));

  it('助詞の「に」「で」の後ろは切る（送りがなとまちがえない）', () => {
    expect(cut('日用品の通路（手前にスイカのワゴン、奥にピン）')).toBe('日用品の｜通路（手前に｜スイカの｜ワゴン、｜奥に｜ピン）');
    expect(cut('バナナの皮で邪魔してくる')).toBe('バナナの｜皮で｜邪魔してくる');
  });
});

describe('どの文でも守ること', () => {
  const texts = [...MISDEEDS.flatMap((m) => [m.name, m.where, m.how, m.sign, m.goalText]), ...SECRETS.flatMap((s) => [s.name, s.goalText])];

  it('つなげると元の文に戻る', () => {
    for (const t of texts) expect(splitPhrases(t).join('')).toBe(t);
    expect(splitPhrases('')).toEqual([]);
  });

  it('文節の頭に、句読点・閉じかっこ・ひらがなの助詞が来ない（句点や読点の後ろを除く）', () => {
    for (const t of texts) {
      const parts = splitPhrases(t);
      parts.forEach((p, i) => {
        if (i === 0) return;
        const prev = parts[i - 1] as string;
        expect(p, `${parts.join('｜')}`).not.toMatch(/^[、。，．！？・：」』）]/);
        if (!/[、。！？・：\s]$/.test(prev)) expect(p, `${parts.join('｜')}`).not.toMatch(/^[ぁ-ゖ]/);
      });
    }
  });

  it('カタカナの語の途中では切らない', () => {
    for (const t of texts) {
      const parts = splitPhrases(t);
      for (let i = 1; i < parts.length; i++) {
        const a = (parts[i - 1] as string).slice(-1);
        const b = (parts[i] as string).slice(0, 1);
        expect(/[ァ-ヺー]/.test(a) && /[ァ-ヺー]/.test(b), `${parts.join('｜')}`).toBe(false);
      }
    }
  });
});
