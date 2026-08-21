/* 本物の配信データと同じ形の小さな標本。上流は10分ごとに中身が変わるので、
   固定できるのはこちらだけ。地点番号の上2桁は府県ブロック（86=熊本、50=静岡、32=秋田、12=北海道、52=岐阜）。 */

export const TABLE = {
  86491: { type: 'B', elems: '11111011', lat: [32, 11.8], lon: [130, 1.6], alt: 3, kjName: '牛深', knName: 'ウシブカ', enName: 'Ushibuka' },
  50066: { type: 'F', elems: '10001011', lat: [35, 21.6], lon: [138, 43.6], alt: 3775, kjName: '富士山', knName: 'フジサン', enName: 'Fujisan' },
  32402: { type: 'A', elems: '11111111', lat: [39, 43.0], lon: [140, 5.9], alt: 6, kjName: '秋田', knName: 'アキタ', enName: 'Akita' },
  32056: { type: 'C', elems: '11112010', lat: [39, 12.0], lon: [140, 33.0], alt: 62, kjName: '横手', knName: 'ヨコテ', enName: 'Yokote' },
  12011: { type: 'C', elems: '01000000', lat: [44, 30.0], lon: [142, 30.0], alt: 120, kjName: '小車', knName: 'オグルマ', enName: 'Oguruma' },
  12021: { type: 'C', elems: '11112010', lat: [44, 31.0], lon: [142, 31.0], alt: 130, kjName: '美深', knName: 'ビフカ', enName: 'Bifuka' },
  12031: { type: 'C', elems: '11112010', lat: [43, 0.0], lon: [142, 0.0], alt: 300, kjName: '金山', knName: 'カナヤマ', enName: 'Kanayama' },
  52041: { type: 'C', elems: '11112010', lat: [35, 47.0], lon: [137, 10.0], alt: 320, kjName: '金山', knName: 'カナヤマ', enName: 'Kanayama' },
  32061: { type: 'C', elems: '11112010', lat: [40, 0.0], lon: [140, 0.0], alt: 40, kjName: '故障中', knName: 'コショウチュウ', enName: 'Broken' },
  320562: { type: 'C', elems: '11112010', lat: [39, 36.0], lon: [140, 13.0], alt: 90, kjName: '雄和', knName: 'ユウワ：秋田空港', enName: 'Yuwa' },
};

/* temp は [観測値, 品質フラグ]。フラグ0だけが正常。 */
export const OBSERVATIONS = {
  86491: { temp: [30.5, 0], humidity: [80, 0] },
  50066: { temp: [5.2, 0] },
  32402: { temp: [25.5, 0] },
  32056: { temp: [25.5, 0] },
  12011: { precipitation1h: [0.0, 0] },
  12021: { temp: [14.0, 0] },
  12031: { temp: [20.0, 0] },
  52041: { temp: [22.0, 0] },
  32061: { temp: [99.9, 1] },
  320562: { temp: [24.0, 0] },
};

/* 1時間前。牛深は下がり、秋田は上がっている。 */
export const HOUR_AGO = {
  86491: { temp: [31.2, 0] },
  32402: { temp: [24.9, 0] },
};
