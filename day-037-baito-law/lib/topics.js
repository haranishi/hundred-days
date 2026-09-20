/* 困りごとと、その根拠になる条文の対応。

   札の文言は法律用語にしない。「年次有給休暇」と書かれても、探している人は自分の困りごとと
   結びつけられない。

   anchor は e-Gov 法令検索のページ内アンカー。**章番号が入る**（第39条は Mp-At_39 ではなく
   Mp-Ch_4-At_39）ので、条番号から組み立てられない。2026-09-13 に3法令のページを開いて
   実際のidを読み取ったものを持っている。e-Gov 側の構成が変わると外れるが、そのときも
   リンク先は正しい法令のページなので、条文が読めなくなることはない。 */

export const LAWS = {
  roukikijun: { id: '322AC0000000049', name: '労働基準法' },
  saiteichingin: { id: '334AC0000000137', name: '最低賃金法' },
  minpou: { id: '129AC0000000089', name: '民法' },
};

export const TOPICS = [
  { key: 'yukyu', label: '有給って、もらえる？', law: 'roukikijun', article: '39', anchor: 'Mp-Ch_4-At_39' },
  { key: 'kyukei', label: '休憩は何分もらえる？', law: 'roukikijun', article: '34', anchor: 'Mp-Ch_4-At_34' },
  { key: 'zangyo', label: '残業代はどれだけ増える？', law: 'roukikijun', article: '37', anchor: 'Mp-Ch_4-At_37' },
  { key: 'shinya', label: '18歳未満は何時まで働ける？', law: 'roukikijun', article: '61', anchor: 'Mp-Ch_6-At_61' },
  { key: 'tenbiki', label: '給料から勝手に引かれた', law: 'roukikijun', article: '24', anchor: 'Mp-Ch_3-At_24' },
  { key: 'bakkin', label: '遅刻の罰金を取られた', law: 'roukikijun', article: '91', anchor: 'Mp-Ch_9-At_91' },
  { key: 'meiji', label: '条件を書面でもらっていない', law: 'roukikijun', article: '15', anchor: 'Mp-Ch_2-At_15' },
  { key: 'taishokugo', label: '辞めたあとの給料が出ない', law: 'roukikijun', article: '23', anchor: 'Mp-Ch_2-At_23' },
  { key: 'jikyu', label: '時給が低すぎる気がする', law: 'saiteichingin', article: '4', anchor: 'Mp-Ch_2-Se_1-At_4' },
  { key: 'yameru', label: 'すぐに辞めたい', law: 'minpou', article: '627', anchor: 'Mp-Pa_3-Ch_2-Se_8-At_627' },
];

export const findTopic = (key) => TOPICS.find((t) => t.key === key) || null;

export const lawOf = (topic) => LAWS[topic?.law] || null;
