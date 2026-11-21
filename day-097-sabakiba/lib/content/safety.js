// 「さばく前に」の内容（仮の見本。WP-5 が調査 research/safety.md の公的出典で本物に差し替える。形は変えない）。
export default {
  intro: '参考情報です。魚をさばくことは刃物と生ものを扱います。自己責任で、無理のない範囲で行ってください。',
  items: [
    { id: 'knife', title: '刃物のけが', summary: 'まな板の下に濡れ布巾を敷いて固定し、刃の進む先に手を置きません。',
      detail: ['切れない包丁は力が入って滑ります。', '濡れた手・魚はよく拭きます。'], sources: [], confidence: 'sample' },
    { id: 'anisakis', title: 'アニサキス（寄生虫）', summary: '見本の文です。本番では公的機関の説明と数字に差し替えます。',
      detail: ['（見本）'], sources: [{ label: '（見本）厚生労働省', url: 'https://www.mhlw.go.jp/' }], confidence: 'sample' },
  ],
};
