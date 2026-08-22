export const METRICS = [
  { key:'pop',      label:'総人口',        unit:'人',      digits:0, dirWord:'多い' },
  { key:'rate',     label:'5年間の人口増減率', unit:'%',   digits:2, dirWord:'高い', signed:true },
  { key:'area',     label:'面積',          unit:'km²',     digits:2, dirWord:'広い' },
  { key:'dens',     label:'人口密度',      unit:'人/km²',  digits:1, dirWord:'高い' },
  { key:'ageAvg',   label:'平均年齢',      unit:'歳',      digits:1, dirWord:'高い' },
  { key:'ageMed',   label:'年齢中位数',    unit:'歳',      digits:1, dirWord:'高い' },
  { key:'u15',      label:'15歳未満の割合', unit:'%',      digits:2, dirWord:'高い' },
  { key:'o65',      label:'65歳以上の割合', unit:'%',      digits:2, dirWord:'高い' },
  { key:'sexRatio', label:'人口性比',      unit:'',        digits:1, dirWord:'高い', note:'女性100人あたりの男性の数' },
  { key:'single',   label:'ひとり暮らし世帯の割合', unit:'%', digits:2, dirWord:'高い' },
];

export function buildIndex(towns) {
  const byCode = new Map();
  const ranks = new Map();
  const medians = new Map();
  const counts = new Map();

  for (const town of towns) {
    byCode.set(town.code, town);
  }

  for (const metric of METRICS) {
    const key = metric.key;
    const values = [];
    let count = 0;

    for (const town of towns) {
      if (town[key] != null) {
        values.push({ code: town.code, value: town[key] });
        count++;
      }
    }

    counts.set(key, count);

    if (values.length > 0) {
      values.sort((a, b) => b.value - a.value); //降順ソート

      let rank = 1;
      let prevValue = values[0].value;
      const rankMap = new Map();

      for (let i = 0; i < values.length; i++) {
        if (values[i].value !== prevValue) {
          rank = i + 1;   // 競技方式: 1,2,2,4（検収修正: rank += i だと同値の後で飛びすぎる）
        }
        rankMap.set(values[i].code, rank);
        prevValue = values[i].value;
      }

      ranks.set(key, rankMap);

      //中央値計算
      const sortedValues = values.map(v => v.value).sort((a, b) => a - b);
      const mid = Math.floor(sortedValues.length / 2);
      let median;
      if (sortedValues.length % 2 === 0) {
        median = (sortedValues[mid - 1] + sortedValues[mid]) / 2;
      } else {
        median = sortedValues[mid];
      }

      medians.set(key, median);
    } else {
      medians.set(key, null);
    }
  }

  return { byCode, ranks, medians, counts };
}

export function rankOf(index, key, code) {
  const rankMap = index.ranks.get(key);
  if (rankMap && rankMap.has(code)) {
    return { rank: rankMap.get(code), of: index.counts.get(key) };
  }
  return null;
}

export function medianOf(index, key) {
  return index.medians.get(key);
}

export function formatValue(metric, value) {
  if (value === null) return '—';

  const digits = metric.digits;
  const signed = metric.signed || false;
  const roundedValue = Number(value).toFixed(digits); //文字列に変換して丸める
  let formattedValue = roundedValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (signed && value >= 0) {
    formattedValue = '+' + formattedValue;
  }

  return formattedValue;
}

export function rankLabel(metric, rank, of) {
  const dirWord = metric.dirWord;
  return `${dirWord}方から ${rank}位 / ${of.toLocaleString('ja-JP')}`;
}

export function barRatio(value, median) {
  if (value === null || median === null || median <= 0) return null;
  const ratio = value / (median * 2);
  return Math.max(0, Math.min(1, ratio)); //0〜1にクランプ
}

export function normalizeQuery(q) {
  let str = String(q);
  str = str.normalize('NFKC').trim();
  str = str.toLowerCase();
  // カタカナ→ひらがな。範囲は 30A1-30F6 に限定（検収修正: 長音「ー」まで変換して壊していた）
  return str.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function searchTowns(towns, q, limit = 20) {
  const normalizedQuery = normalizeQuery(q);
  if (normalizedQuery === '') return [];

  const candidates = [];

  for (const town of towns) {
    const name = town.name;
    const pref = town.pref;
    const en = town.en ? town.en.toLowerCase() : ''; //小文字化
    const combined = pref + name;

    if (name === normalizedQuery) {
      candidates.push(town);
    } else if (combined.startsWith(normalizedQuery)) {
      candidates.push(town);
    } else if (name.includes(normalizedQuery) || pref.includes(normalizedQuery) || en.includes(normalizedQuery)) {
      candidates.push(town);
    }
  }

  //完全一致を先頭に、次に前方一致、最後にその他の部分一致でソート
  candidates.sort((a, b) => {
    if (a.name === normalizedQuery && b.name !== normalizedQuery) return -1;
    if (b.name === normalizedQuery && a.name !== normalizedQuery) return 1;

    const aCombined = (a.pref + a.name).startsWith(normalizedQuery);
    const bCombined = (b.pref + b.name).startsWith(normalizedQuery);
    if (aCombined && !bCombined) return -1;
    if (!aCombined && bCombined) return 1;

    return 0; //それ以外は元の順序を維持
  });

  return candidates.slice(0, limit);
}

export function townsOfPref(towns, pref) {
  return towns.filter(town => town.pref === pref).sort((a, b) => a.code.localeCompare(b.code));
}

export const PREFS = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];