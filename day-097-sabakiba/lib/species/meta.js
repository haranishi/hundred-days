// procedures-a.md・procedures-b.md の漁獲例と調理例。代表の長さがない範囲は中点を表示する。
function sizeRange(min, max, typical = (min + max) / 2) {
  return { typical, min, max };
}

// 所要時間は一尾の下処理の推測値。幅のある推測には長い方を採った。
// similar は調査で手順の共通点を確認できた魚に限る。魚の形が似ているだけでは含めない。
export const SPECIES_META = {
  iwashi: {
    id: 'iwashi', name: 'イワシ', nameFull: 'マイワシ', kana: 'いわし', method: 'tebiraki', family: 'round',
    season: '夏〜秋（6〜10月）', difficulty: 1, sizeCm: sizeRange(14, 20, 17), minutes: { novice: 10, skilled: 5 },
    similar: [], tools: ['shears', 'tweezers'],
    blurb: '包丁を使わず、親指で中骨をたどって身を開きます。',
  },
  aji: {
    id: 'aji', name: 'アジ', nameFull: 'マアジ', kana: 'あじ', method: 'sanmai', family: 'round',
    season: '春〜夏', difficulty: 2, sizeCm: sizeRange(18, 30), minutes: { novice: 20, skilled: 10 },
    similar: ['マサバ（腹と背から身を外す手順）'], tools: ['scaler', 'deba', 'tweezers', 'yanagi'],
    blurb: '尾の硬いぜいごを取り、腹と背から骨に沿って身を外します。',
  },
  sanma: {
    id: 'sanma', name: 'サンマ', nameFull: 'サンマ', kana: 'さんま', method: 'sanmai', family: 'round',
    season: '秋', difficulty: 2, sizeCm: sizeRange(27, 29), minutes: { novice: 20, skilled: 10 },
    similar: [], tools: ['deba', 'tweezers', 'yanagi'],
    blurb: '頭の側から尾へ、長く刃を引いて三枚におろします。',
  },
  saba: {
    id: 'saba', name: 'サバ', nameFull: 'マサバ', kana: 'さば', method: 'sanmai', family: 'round',
    season: '秋〜冬', difficulty: 3, sizeCm: sizeRange(33, 35), minutes: { novice: 30, skilled: 15 },
    similar: ['マアジ（腹と背から身を外す手順）'], tools: ['scaler', 'deba', 'tweezers', 'yanagi'],
    blurb: '柔らかい身を支えながら、硬い腹骨の付け根を外します。',
  },
  kisu: {
    id: 'kisu', name: 'キス', nameFull: 'シロギス', kana: 'きす', method: 'seabiraki', family: 'round',
    season: '晩春〜初夏', difficulty: 3, sizeCm: sizeRange(16, 20), minutes: { novice: 12, skilled: 4 },
    similar: [], tools: ['deba', 'petty', 'tweezers'],
    blurb: '背から開いて、腹の皮と尾をつないだまま中骨を外します。',
  },
  tai: {
    id: 'tai', name: 'タイ', nameFull: 'マダイ', kana: 'たい', method: 'sanmai', family: 'round',
    season: '春・秋', difficulty: 4, sizeCm: sizeRange(30, 50, 39), minutes: { novice: 45, skilled: 20 },
    similar: ['カツオ（三枚おろしまで）'], tools: ['scaler', 'deba', 'shears', 'tweezers', 'yanagi'],
    blurb: '硬い骨と大きな身。腹骨の丸みに沿わせて、薄くそぎ取ります。',
  },
  katsuo: {
    id: 'katsuo', name: 'カツオ', nameFull: 'カツオ', kana: 'かつお', method: 'fushi', family: 'round',
    season: '春〜初夏・秋', difficulty: 4, sizeCm: sizeRange(40, 50), minutes: { novice: 50, skilled: 20 },
    similar: ['マダイ（三枚おろしまで）'], tools: ['deba', 'tweezers', 'yanagi'],
    blurb: '三枚におろしたあと、背と腹に分けて節を取ります。',
  },
  hirame: {
    id: 'hirame', name: 'ヒラメ', nameFull: 'ヒラメ', kana: 'ひらめ', method: 'gomai', family: 'flat',
    season: '冬', difficulty: 5, sizeCm: sizeRange(45, 45), minutes: { novice: 45, skilled: 25 },
    similar: [], tools: ['scaler', 'deba', 'tweezers', 'yanagi'],
    blurb: '平たい魚は、身が4枚＋中骨。エンガワも取れます。',
  },
};
export const SPECIES_ORDER = ['iwashi', 'aji', 'sanma', 'saba', 'kisu', 'tai', 'katsuo', 'hirame'];
