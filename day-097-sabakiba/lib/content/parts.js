// さばいたあとの部位と使い道（仮の見本。WP-5 が調査で確定する。形は変えない）。
export default {
  aji: {
    parts: [
      { id: 'fillet', name: '身', kana: 'み', where: '背骨の両側の2枚', uses: ['刺身', 'たたき', 'フライ', '塩焼き'] },
      { id: 'bone', name: '中骨', kana: 'なかぼね', where: '背骨と、ついている尾・ヒレ', uses: ['骨せんべい', '出汁（あら汁）'] },
      { id: 'head', name: '頭', kana: 'あたま', where: '鰓蓋から前', uses: ['あら汁', '兜焼き'] },
    ],
    keep: '冷蔵で当日〜翌日。刺身は当日中に。',
  },
};
