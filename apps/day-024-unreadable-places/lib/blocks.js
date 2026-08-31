/* 出題の舞台。地方ブロックで選ぶ。「全国」は全ブロックをまとめたもの。
   ブロックの切り方は学校で習う8地方区分に合わせた（三重県は近畿）。
   東海・北陸のような別の切り方もあるが、選ぶ人が迷わない側を採った。 */

export const BLOCKS = [
  { id: 'all', label: '全国', prefs: null },
  { id: 'hokkaido', label: '北海道', prefs: ['北海道'] },
  { id: 'tohoku', label: '東北', prefs: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
  { id: 'kanto', label: '関東', prefs: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
  { id: 'chubu', label: '中部', prefs: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
  { id: 'kinki', label: '近畿', prefs: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
  { id: 'chugoku', label: '中国', prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
  { id: 'shikoku', label: '四国', prefs: ['徳島県', '香川県', '愛媛県', '高知県'] },
  { id: 'kyushu', label: '九州・沖縄', prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] }
];

/** 1問でも出題できる最低の在庫。これを下回るブロックは「空」状態にする */
export const MIN_STOCK = 12;

export function blockById(id) {
  return BLOCKS.find((b) => b.id === id) ?? BLOCKS[0];
}

export function blockOfPref(pref) {
  for (const b of BLOCKS) {
    if (b.prefs && b.prefs.includes(pref)) return b;
  }
  return null;
}
