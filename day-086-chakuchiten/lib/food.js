// Leaves own both the user's choice and its search term; never add a broad restaurant OR-query.
const dish = (id, label, query, pattern, exclude) => ({ id, label, query, pattern, exclude, detail: `「${label}」でお店を探す` });
const group = (id, label, detail, icon, title, dishes) => ({ id, label, detail, icon, title,
  dishes: dishes.map((item) => ({ ...item, icon })) });

export const FOOD_GROUPS = {
  meal: [
    group('noodles', '麺類', 'つるっと、すすりたい', 'bowl', '麺なら、どれにする？', [
      dish('ramen', 'ラーメン', 'ラーメン', /ラーメン|らーめん|(?:中華|支那)そば|一蘭|一風堂|天下一品|ramen/i),
      dish('udon', 'うどん', 'うどん', /うどん|饂飩|丸亀製麺|はなまる|udon/i),
      dish('soba', 'そば', 'そば', /そば|蕎麦|\bsoba\b/i, /中華そば|支那そば|焼[きキ]?そば|油そば|まぜそば|混ぜそば|沖縄そば|ソーキそば|yakisoba|aburasoba|mazesoba|chuka\s*soba/i),
      dish('pasta', 'パスタ', 'パスタ', /パスタ|スパゲ|イタリア|pasta|italian/i),
    ]),
    group('rice', 'ごはんもの', 'お米をしっかり食べたい', 'rice', 'ごはんなら、何がいい？', [
      dish('teishoku', '定食', '定食', /定食|食堂|やよい軒|大戸屋|teishoku/i),
      dish('donburi', '丼もの', '丼', /丼|どんぶり|牛めし|牛丼|吉野家|すき家|なか卯|donburi/i),
      dish('curry', 'カレー', 'カレー', /カレー|curry|coco壱/i),
      dish('omurice', 'オムライス', 'オムライス', /オムライス|オムレツ|omurice/i),
    ]),
    group('meat', '肉料理', 'お肉で元気をつけたい', 'fork', 'お肉は、どう食べたい？', [
      dish('yakiniku', '焼肉', '焼肉', /焼肉|焼き肉|ホルモン|yakiniku/i),
      dish('steak', 'ステーキ', 'ステーキ', /ステーキ|steak/i),
      dish('hamburg', 'ハンバーグ', 'ハンバーグ', /ハンバーグ|hamburg(?!er)/i),
      dish('karaage', '唐揚げ', '唐揚げ', /唐揚|からあげ|から揚|karaage/i),
    ]),
    group('fish', '魚料理', '魚や海鮮を楽しみたい', 'fish', '魚なら、どんな一皿？', [
      dish('sushi', '寿司', '寿司', /寿司|すし|鮨|sushi/i),
      dish('seafood_bowl', '海鮮丼', '海鮮丼', /海鮮丼|魚河岸丼|まぐろ丼|いくら丼|かいせんどん/i),
      dish('sashimi', '刺身', '刺身', /刺身|さしみ|sashimi/i),
      dish('grilled_fish', '焼き魚', '焼き魚', /焼き魚|焼魚|干物|ひもの/i),
    ]),
  ],
  cafe: [
    group('sweets', '甘いもの', '甘いひと口で、ひと休み', 'cake', '甘いものなら、どれ？', [
      dish('cake', 'ケーキ', 'ケーキ', /(?<!パン)(?<!ホット)ケーキ|\bcakes?\b|パティスリー|patisserie/i),
      dish('pancake', 'パンケーキ', 'パンケーキ', /パンケーキ|ホットケーキ|pancake/i),
      dish('parfait', 'パフェ', 'パフェ', /パフェ|parfait/i),
      dish('wagashi', '和菓子', '和菓子', /和菓子|わらびもち|わらび餅|だんご|団子|あんみつ|wagashi/i),
    ]),
    group('light', 'パン・軽食', '軽く、おなかを満たしたい', 'bread', '軽食は、どれにしよう？', [
      dish('bread', 'パン', 'ベーカリー', /パン(?!ケーキ)|ベーカリー|bakery|boulangerie/i),
      dish('sandwich', 'サンドイッチ', 'サンドイッチ', /サンド|sandwich|subway|サブウェイ/i),
      dish('burger', 'ハンバーガー', 'ハンバーガー', /バーガー|ハンバーガ|burger|マクドナルド|モスバーガー/i),
      dish('pizza', 'ピザ', 'ピザ', /ピザ|ピッツァ|pizza|pizzeria/i),
    ]),
    group('drinks', '飲み物でひと休み', 'まずは、ゆっくり一杯', 'cup', '今日は、何を飲みたい？', [
      dish('coffee', 'コーヒー', 'コーヒー', /コーヒー|珈琲|喫茶|カフェ|coffee|cafe|スターバックス|ドトール/i),
      dish('tea', '紅茶', '紅茶', /紅茶|ティー|\btea(?:s|house|room)?\b/i),
      dish('matcha', '抹茶・日本茶', '抹茶 日本茶', /抹茶|日本茶|茶房|茶屋|matcha/i),
      dish('juice', 'ジュース', 'ジュース', /ジュース|スムージー|juice|smoothie/i),
    ]),
  ],
  drink: [
    group('snacks', '料理も楽しみたい', '好きなおつまみから決める', 'fork', 'おつまみは、何にする？', [
      dish('yakitori', '焼き鳥', '焼き鳥', /焼鳥|焼き鳥|やきとり|鳥貴族|yakitori/i),
      dish('gyoza', '餃子', '餃子', /餃子|ぎょうざ|ギョーザ|gyoza/i),
      dish('oden', 'おでん', 'おでん', /おでん|oden/i),
      dish('seafood', '海鮮料理', '海鮮', /海鮮|魚介|刺身|寿司|すし|鮨|seafood/i),
    ]),
    group('alcohol', 'お酒を決めたい', '飲みたい一杯から探す', 'glass', 'どんな一杯にしよう？', [
      dish('beer', 'ビール', 'ビール', /ビール|ビア(?!ード)|\bbeer\b|\bbrewery\b/i, /ビアードパパ|beard[ \t]*papa/i),
      dish('wine', 'ワイン', 'ワイン', /ワイン|ワイナリー|wine/i),
      dish('sake', '日本酒', '日本酒', /日本酒|地酒|酒蔵|sake/i),
      dish('cocktail', 'カクテル', 'カクテル', /カクテル|cocktail|(?:^|[\s・])バー(?!ガー|グ|ミヤン|ベキュー|ム|コード|ゲン)|バー$/i),
    ]),
  ],
};

export function selectedGroup(answers) {
  return FOOD_GROUPS[answers.mood]?.find((item) => item.id === answers.genre);
}
export function selectedDish(answers) {
  return selectedGroup(answers)?.dishes.find((item) => item.id === answers.dish);
}

const foodCategories = new Set(['restaurant', 'cafe', 'fast_food', 'bakery', 'bar_izakaya', 'unknown', '']);
const dishes = Object.values(FOOD_GROUPS).flat().flatMap((item) => item.dishes);
export function dishMatchScore(place, answers) {
  const selected = selectedDish(answers);
  if (!selected) return 0;
  const name = `${place.name} ${place.brand || ''}`.normalize('NFKC').replaceAll('蕎麦', 'そば');
  if (selected.exclude?.test(name)) return 0;
  const direct = selected.pattern.test(name);
  if (!foodCategories.has(place.category)) {
    return direct && answers.mood === 'cafe' && ['sweets', 'light'].includes(answers.genre)
      && ['retail_other', 'grocery'].includes(place.category) ? 2 : 0;
  }
  if (direct) return 2;
  if (answers.mood !== 'drink' && /居酒屋|酒場|ダイニングバー|ワインバー|ショットバー|バー$/.test(name.trim())) return 0;
  if (answers.mood === 'drink' && answers.genre === 'alcohol' && /ハンバーグ|ハンバーガー|バーミヤン|ファミリーレストラン/.test(name)) return 0;
  if (answers.mood === 'meal' && ['cafe', 'bakery', 'bar_izakaya'].includes(place.category)) return 0;
  // The request already used only this dish's query. Keep unnamed matches from that query,
  // but reject names that clearly describe another choice. Menus are still unverified.
  if (dishes.some((item) => item.id !== selected.id && !item.exclude?.test(name) && item.pattern.test(name))) return 0;
  return 1;
}
