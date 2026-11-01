// OWNER: contract
// ステージの一覧。年表の順（古い順）に並べる。遊べないステージは準備中として選択画面に出すだけ。
import { HONNOJI } from './honnoji';
import type { StageDef, StageMeta } from './types';

export const STAGE_LIST: StageMeta[] = [
  {
    id: 'okehazama',
    title: '桶狭間の戦い',
    era: '永禄三年（1560）',
    dateText: '永禄三年五月十九日',
    place: '尾張・桶狭間',
    playable: false,
    objective: '今川義元を討て',
    mission: {
      player: '織田信長',
      target: '今川義元',
      destination: '今川軍の本陣',
      goal: '豪雨に紛れて今川軍の本陣へ入り、今川義元を討ち取れ。',
      steps: [
        ['豪雨に紛れて接近', '雨音が足音を隠す間に、見張りの隙を抜ける。'],
        ['本陣への道を探す', '巡回を観察し、今川義元のいる本陣へ進む。'],
        ['義元の背後を取る', '雨が弱まる前に接近し、Eキーで討ち取る。'],
      ],
      clearCondition: '今川義元を討ち取ればクリア。',
      completion: '今川義元を討ち取った',
    },
    rule: { name: '豪雨', text: '激しい雨音が足音を消す。雨が弱まる前に、今川義元の本陣へ。' },
  },
  HONNOJI.meta,
  {
    id: 'sekigahara',
    title: '関ヶ原の戦い',
    era: '慶長五年（1600）',
    dateText: '慶長五年九月十五日　朝',
    place: '美濃・関ヶ原',
    playable: false,
    objective: '石田三成を討て',
    mission: {
      player: '東軍の忍び',
      target: '石田三成',
      destination: '西軍の本陣',
      goal: '朝霧に紛れて西軍の本陣へ入り、石田三成を討ち取れ。',
      steps: [
        ['朝霧の中を進む', '霧で見通しが悪い間に、西軍の見張りを避ける。'],
        ['西軍の本陣を探す', '霧が薄くなる場所では、物陰で巡回を待つ。'],
        ['三成の背後を取る', '本陣の護衛を抜け、Eキーで討ち取る。'],
      ],
      clearCondition: '石田三成を討ち取ればクリア。',
      completion: '石田三成を討ち取った',
    },
    rule: { name: '朝霧', text: '深い霧が姿を隠す。霧が晴れれば丸見えになる。晴れる前に敵の本陣へ。' },
  },
];

const STAGES: Record<string, StageDef> = { honnoji: HONNOJI };

export function getStage(id: string): StageDef {
  const s = STAGES[id];
  if (!s) throw new Error(`ステージ ${id} はまだ遊べない`);
  return s;
}
